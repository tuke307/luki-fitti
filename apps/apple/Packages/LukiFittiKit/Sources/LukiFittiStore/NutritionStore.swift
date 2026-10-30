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
    public private(set) var entries: [MealEntryDto] = []
    public private(set) var outbox: [NutritionOutboxItem] = []

    private let api: APIClient
    private let directory: URL
    private var flushing = false

    public init(apiClient: APIClient, storageDirectory: URL? = nil) {
        self.api = apiClient
        self.directory = storageDirectory ?? FileManager.default
            .urls(for: .documentDirectory, in: .userDomainMask).first!
            .appendingPathComponent("LukiFittiOfflineStore", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        entries = read("nutrition_entries.json") ?? []
        outbox = read("nutrition_outbox.json") ?? []
    }

    // MARK: Queries

    public func entries(on day: Date, calendar: Calendar = .current) -> [MealEntryDto] {
        entries
            .filter { $0.eatenAtDate.map { calendar.isDate($0, inSameDayAs: day) } ?? false }
            .sorted { $0.eatenAt < $1.eatenAt }
    }

    public func totals(on day: Date, calendar: Calendar = .current) -> NutritionTotalsDto {
        NutritionMath.sum(entries(on: day, calendar: calendar).map(\.totals))
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

    public func refresh(isSignedIn: Bool) async {
        guard isSignedIn else { return }
        await flush()
        let now = Date()
        guard let server = try? await api.fetchMealEntries(
            from: now.addingTimeInterval(-35 * 86_400),
            to: now.addingTimeInterval(86_400)
        ) else { return }
        let pendingIds = Set(outbox.map(\.clientEntryId))
        let pendingUpserts = outbox.compactMap { $0.kind == .upsert ? $0.payload : nil }
        entries = server.filter { !pendingIds.contains($0.clientEntryId) }
            + pendingUpserts.map { Self.optimisticEntry($0, existing: nil) }
        persistEntries()
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
        try? FileManager.default.removeItem(at: directory.appendingPathComponent("nutrition_entries.json"))
        try? FileManager.default.removeItem(at: directory.appendingPathComponent("nutrition_outbox.json"))
        MealPhotoCache.shared.clear()
    }

    // MARK: Helpers

    public static func newClientId() -> String { "meal-\(UUID().uuidString.lowercased())" }

    static func optimisticEntry(_ payload: UpsertMealEntryDto, existing: MealEntryDto?) -> MealEntryDto {
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
