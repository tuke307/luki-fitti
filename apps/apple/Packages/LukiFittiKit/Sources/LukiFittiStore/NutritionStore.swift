import Foundation
import Observation
import LukiFittiModels
import LukiFittiDomain
import LukiFittiAPI

/// A pending nutrition change kept on disk until the server confirms it.
public struct NutritionOutboxItem: Codable, Sendable, Equatable {
    public enum Kind: String, Codable, Sendable { case upsert, delete }
    public var kind: Kind
    public var clientEntryId: String
    public var payload: UpsertMealEntryDto?
    public var serverId: String?
}

/// Offline-first meal log: reads the on-disk cache immediately, refreshes from the API and queues
/// upserts/deletes while offline. Upserts are idempotent by `clientEntryId`, so replays are safe.
@MainActor
@Observable
public final class NutritionStore {
    public private(set) var entries: [MealEntryDto] = [] {
        didSet { reindex() }
    }
    public private(set) var outbox: [NutritionOutboxItem] = []
    /// Start of the oldest day fetched from the server in this session.
    public private(set) var loadedFrom: Date?

    private var byDay: [Date: [MealEntryDto]] = [:]
    private var totalsByDay: [Date: NutritionTotalsDto] = [:]
    private let indexCalendar = Calendar.current
    private let api: APIClient
    private let directory: URL
    private var flushing = false
    @ObservationIgnored private var lastRefreshAt: Date?
    @ObservationIgnored private var rangeFetches: Set<Date> = []

    public nonisolated static let historyDays = 35
    public nonisolated static let refreshThrottle: TimeInterval = 60

    public init(apiClient: APIClient, storageDirectory: URL? = nil) {
        self.api = apiClient
        self.directory = storageDirectory ?? FileManager.default
            .urls(for: .documentDirectory, in: .userDomainMask).first!
            .appendingPathComponent("LukiFittiOfflineStore", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        entries = read("nutrition_entries.json") ?? []
        outbox = read("nutrition_outbox.json") ?? []
        reindex()
    }

    // MARK: Queries

    public func entries(on day: Date, calendar: Calendar = .current) -> [MealEntryDto] {
        guard Self.sameRules(calendar, indexCalendar) else {
            return NutritionCalendar.entriesByDay(entries, calendar: calendar)[calendar.startOfDay(for: day)] ?? []
        }
        return byDay[indexCalendar.startOfDay(for: day)] ?? []
    }

    public func totals(on day: Date, calendar: Calendar = .current) -> NutritionTotalsDto {
        guard Self.sameRules(calendar, indexCalendar) else {
            return NutritionMath.sum(entries(on: day, calendar: calendar).map(\.totals))
        }
        return totalsByDay[indexCalendar.startOfDay(for: day)] ?? NutritionTotalsDto()
    }

    private func reindex() {
        byDay = NutritionCalendar.entriesByDay(entries, calendar: indexCalendar)
        totalsByDay = byDay.mapValues { NutritionMath.sum($0.map(\.totals)) }
    }

    private static func sameRules(_ a: Calendar, _ b: Calendar) -> Bool {
        a.identifier == b.identifier && a.timeZone == b.timeZone
    }

    // MARK: Mutations

    /// Saves (create or update). Returns `true` when the change reached the server.
    @discardableResult
    public func save(_ payload: UpsertMealEntryDto, isSignedIn: Bool) async -> Bool {
        let existing = entries.first { $0.clientEntryId == payload.clientEntryId }
        replace(Self.optimisticEntry(payload, existing: existing))
        if isSignedIn, let saved = try? await api.upsertMealEntry(payload) {
            replace(saved)
            return true
        }
        enqueue(NutritionOutboxItem(kind: .upsert, clientEntryId: payload.clientEntryId, payload: payload))
        return false
    }

    public func remove(_ entry: MealEntryDto, isSignedIn: Bool) async {
        entries.removeAll { $0.clientEntryId == entry.clientEntryId }
        persistEntries()
        let neverSynced = entry.id.hasPrefix("local-")
        if neverSynced {
            outbox.removeAll { $0.clientEntryId == entry.clientEntryId }
            persistOutbox()
            return
        }
        if isSignedIn, (try? await api.deleteMealEntry(id: entry.id)) != nil { return }
        enqueue(NutritionOutboxItem(kind: .delete, clientEntryId: entry.clientEntryId, serverId: entry.id))
    }

    /// Inserts an entry returned by the server (e.g. after photo analysis).
    public func upsertLocal(_ entry: MealEntryDto) {
        replace(entry)
    }

    // MARK: Sync

    /// Loads the recent window. `force: false` skips the call when the last refresh is under a minute old.
    public func refresh(isSignedIn: Bool, force: Bool = true) async {
        guard isSignedIn else { return }
        let now = Date()
        guard Self.shouldRefresh(lastRefreshAt: lastRefreshAt, now: now, force: force) else { return }
        await flush()
        let from = indexCalendar.startOfDay(for: now.addingTimeInterval(-Double(Self.historyDays) * 86_400))
        guard await fetch(from: from, to: now.addingTimeInterval(86_400)) else { return }
        lastRefreshAt = now
    }

    /// Fetches older days (e.g. when the week strip scrolls back) unless they're already loaded.
    public func ensureLoaded(from day: Date, isSignedIn: Bool) async {
        let from = indexCalendar.startOfDay(for: day)
        guard isSignedIn, let loadedFrom, from < loadedFrom, !rangeFetches.contains(from) else { return }
        rangeFetches.insert(from)
        defer { rangeFetches.remove(from) }
        _ = await fetch(from: from, to: loadedFrom)
    }

    private func fetch(from: Date, to: Date) async -> Bool {
        guard let server = try? await api.fetchMealEntries(from: from, to: to) else { return false }
        entries = Self.merge(
            existing: entries,
            server: server,
            window: DateInterval(start: from, end: max(from, to)),
            pendingUpserts: outbox.compactMap { $0.kind == .upsert ? $0.payload : nil },
            pendingIds: Set(outbox.map(\.clientEntryId))
        )
        loadedFrom = min(loadedFrom ?? from, from)
        persistEntries()
        return true
    }

    nonisolated static func shouldRefresh(lastRefreshAt: Date?, now: Date, force: Bool) -> Bool {
        guard !force, let lastRefreshAt else { return true }
        return now.timeIntervalSince(lastRefreshAt) >= refreshThrottle || now < lastRefreshAt
    }

    /// Server rows replace everything inside `window`; entries outside it and pending changes stay.
    nonisolated static func merge(
        existing: [MealEntryDto],
        server: [MealEntryDto],
        window: DateInterval,
        pendingUpserts: [UpsertMealEntryDto],
        pendingIds: Set<String>
    ) -> [MealEntryDto] {
        let serverIds = Set(server.map(\.clientEntryId))
        let outside = existing.filter { entry in
            guard !pendingIds.contains(entry.clientEntryId), !serverIds.contains(entry.clientEntryId) else { return false }
            guard let date = entry.eatenAtDate else { return false }
            return date < window.start || date >= window.end
        }
        let pending = pendingUpserts.map { payload in
            optimisticEntry(payload, existing: existing.first { $0.clientEntryId == payload.clientEntryId })
        }
        return outside + server.filter { !pendingIds.contains($0.clientEntryId) } + pending
    }

    public func flush() async {
        guard !flushing, !outbox.isEmpty else { return }
        flushing = true
        defer { flushing = false }
        var remaining = outbox
        for item in outbox {
            do {
                switch item.kind {
                case .upsert:
                    if let payload = item.payload {
                        replace(try await api.upsertMealEntry(payload))
                    }
                case .delete:
                    if let id = item.serverId { try await api.deleteMealEntry(id: id) }
                }
                remaining.removeAll { $0.clientEntryId == item.clientEntryId }
            } catch APIClientError.offline {
                break
            } catch {
                // Permanently rejected (validation, ownership, already deleted): don't retry forever.
                remaining.removeAll { $0.clientEntryId == item.clientEntryId }
            }
        }
        outbox = remaining
        persistOutbox()
    }

    public func clear() {
        entries = []
        outbox = []
        loadedFrom = nil
        lastRefreshAt = nil
        try? FileManager.default.removeItem(at: directory.appendingPathComponent("nutrition_entries.json"))
        try? FileManager.default.removeItem(at: directory.appendingPathComponent("nutrition_outbox.json"))
        MealPhotoCache.shared.clear()
    }

    // MARK: Helpers

    public static func newClientId() -> String { "meal-\(UUID().uuidString.lowercased())" }

    nonisolated static func optimisticEntry(_ payload: UpsertMealEntryDto, existing: MealEntryDto?) -> MealEntryDto {
        let items = payload.items.enumerated().map { index, item in
            MealItemDto(
                id: "local-item-\(index)",
                orderIndex: index,
                name: item.name,
                grams: item.grams,
                amountUnit: item.amountUnit,
                kcal: item.kcal,
                proteinG: item.proteinG,
                carbsG: item.carbsG,
                fatG: item.fatG,
                fiberG: item.fiberG,
                sugarG: item.sugarG,
                source: item.source,
                confidence: item.confidence
            )
        }
        return MealEntryDto(
            id: existing?.id ?? "local-\(payload.clientEntryId)",
            clientEntryId: payload.clientEntryId,
            eatenAt: payload.eatenAt,
            mealType: payload.mealType,
            label: payload.label,
            notes: payload.notes,
            createdAt: existing?.createdAt ?? ISO8601DateFormatter().string(from: Date()),
            items: items,
            photos: existing?.photos ?? [],
            totals: NutritionMath.sum(items)
        )
    }

    private func replace(_ entry: MealEntryDto) {
        entries.removeAll { $0.clientEntryId == entry.clientEntryId }
        entries.append(entry)
        persistEntries()
    }

    private func enqueue(_ item: NutritionOutboxItem) {
        outbox.removeAll { $0.clientEntryId == item.clientEntryId }
        outbox.append(item)
        persistOutbox()
    }

    private func persistEntries() { write(entries, "nutrition_entries.json") }
    private func persistOutbox() { write(outbox, "nutrition_outbox.json") }

    private func read<T: Decodable>(_ name: String) -> T? {
        guard let data = try? Data(contentsOf: directory.appendingPathComponent(name)) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    private func write<T: Encodable>(_ value: T, _ name: String) {
        guard let data = try? JSONEncoder().encode(value) else { return }
        try? data.write(to: directory.appendingPathComponent(name), options: [.atomic, .completeFileProtection])
    }
}
