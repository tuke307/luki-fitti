import Foundation
import Observation
import LukiFittiModels
import LukiFittiDomain
import LukiFittiAPI

/// A pending weigh-in change kept on disk until the server confirms it.
public struct BodyWeightOutboxItem: Codable, Sendable, Equatable {
    public enum Kind: String, Codable, Sendable { case upsert, delete }
    public var kind: Kind
    public var clientEntryId: String
    public var payload: UpsertBodyWeightEntryDto?
    public var serverId: String?
}

/// Offline-first weigh-in history, modeled on `NutritionStore`: reads the on-disk cache
/// immediately, refreshes from the API and queues upserts/deletes while offline. Upserts are
/// idempotent by `clientEntryId`, so replays are safe.
@MainActor
@Observable
public final class BodyWeightStore {
    /// All weigh-ins, oldest first.
    public private(set) var entries: [BodyWeightEntryDto] = [] {
        didSet { points = BodyWeightMath.points(entries) }
    }
    public private(set) var outbox: [BodyWeightOutboxItem] = []
    /// Parsed `entries`, oldest first (cached for chart and calorie lookups).
    public private(set) var points: [WeighInPoint] = []

    /// Deletions that can still be undone: hidden from `entries`, kept on disk, not yet sent.
    public private(set) var stagedRemovals: [String: BodyWeightEntryDto] = [:]

    private let api: APIClient
    private let directory: URL
    private var flushing = false

    private static let entriesFile = "body_weight_entries.json"
    private static let outboxFile = "body_weight_outbox.json"

    public init(apiClient: APIClient, storageDirectory: URL? = nil) {
        self.api = apiClient
        self.directory = storageDirectory ?? FileManager.default
            .urls(for: .documentDirectory, in: .userDomainMask).first!
            .appendingPathComponent("LukiFittiOfflineStore", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        entries = Self.sortedEntries(read(Self.entriesFile) ?? [])
        outbox = read(Self.outboxFile) ?? []
    }

    // MARK: Queries

    /// Most recent weigh-in.
    public var latest: BodyWeightEntryDto? {
        entries.max { ($0.measuredAtDate ?? .distantPast) < ($1.measuredAtDate ?? .distantPast) }
    }

    public func entries(in interval: DateInterval) -> [BodyWeightEntryDto] {
        entries.filter { $0.measuredAtDate.map { interval.contains($0) } ?? false }
    }

    public func entry(clientEntryId: String) -> BodyWeightEntryDto? {
        entries.first { $0.clientEntryId == clientEntryId }
    }

    /// Weight that applies at `date` (latest weigh-in on or before it, else the earliest one).
    /// `nil` without history — callers then use the profile value / default.
    public func weight(at date: Date) -> Double? {
        BodyWeightMath.weightAt(points, date: date)
    }

    public func trend(now: Date = Date()) -> WeightTrend {
        BodyWeightMath.trend(points, now: now)
    }

    public func hasWeighIn(since date: Date) -> Bool {
        BodyWeightMath.hasWeighIn(points, since: date)
    }

    // MARK: Mutations

    /// Saves (create or update). Returns `true` when the change reached the server.
    @discardableResult
    public func save(_ payload: UpsertBodyWeightEntryDto, isSignedIn: Bool) async -> Bool {
        let existing = entries.first { $0.clientEntryId == payload.clientEntryId }
        replace(Self.optimisticEntry(payload, existing: existing))
        if isSignedIn, let saved = try? await api.upsertBodyWeightEntry(payload) {
            replace(saved)
            return true
        }
        enqueue(BodyWeightOutboxItem(kind: .upsert, clientEntryId: payload.clientEntryId, payload: payload))
        return false
    }

    public func remove(_ entry: BodyWeightEntryDto, isSignedIn: Bool) async {
        entries.removeAll { $0.clientEntryId == entry.clientEntryId }
        persistEntries()
        let neverSynced = entry.id.hasPrefix("local-")
        if neverSynced {
            outbox.removeAll { $0.clientEntryId == entry.clientEntryId }
            persistOutbox()
            return
        }
        if isSignedIn, (try? await api.deleteBodyWeightEntry(id: entry.id)) != nil { return }
        enqueue(BodyWeightOutboxItem(kind: .delete, clientEntryId: entry.clientEntryId, serverId: entry.id))
    }

    /// Hides a weigh-in so the deletion can be undone; `commitRemoval` deletes it for real.
    public func stageRemoval(_ entry: BodyWeightEntryDto) {
        stagedRemovals[entry.clientEntryId] = entry
        entries.removeAll { $0.clientEntryId == entry.clientEntryId }
    }

    /// Brings a staged weigh-in back. Returns `false` when it was already committed.
    @discardableResult
    public func undoRemoval(clientEntryId: String) -> Bool {
        guard let entry = stagedRemovals.removeValue(forKey: clientEntryId) else { return false }
        replace(entry)
        return true
    }

    /// Deletes a staged weigh-in. Returns the entry when it was still staged.
    @discardableResult
    public func commitRemoval(clientEntryId: String, isSignedIn: Bool) async -> BodyWeightEntryDto? {
        guard let entry = stagedRemovals.removeValue(forKey: clientEntryId) else { return nil }
        await remove(entry, isSignedIn: isSignedIn)
        return entry
    }

    /// Uploads Apple Health changes in chunks of ≤ 500 and merges the server's answer.
    /// Returns `false` when a chunk failed, so the caller keeps its HealthKit anchor and retries.
    public func importHealthKit(samples: [BodyWeightHealthKitSampleDto], deletedUuids: [String]) async -> Bool {
        guard !samples.isEmpty || !deletedUuids.isEmpty else { return true }
        let size = BodyWeightLimits.importMax
        let chunks = max((samples.count + size - 1) / size, (deletedUuids.count + size - 1) / size)
        for index in 0..<chunks {
            let lower = index * size
            let sampleChunk = Array(samples[min(lower, samples.count)..<min(lower + size, samples.count)])
            let deletedChunk = Array(deletedUuids[min(lower, deletedUuids.count)..<min(lower + size, deletedUuids.count)])
            guard let result = try? await api.importBodyWeight(
                ImportBodyWeightDto(samples: sampleChunk, deletedHealthKitUuids: deletedChunk)
            ) else { return false }
            merge(result.entries, removingHealthKitUuids: Set(deletedChunk))
        }
        return true
    }

    /// Merges server entries and drops entries whose Apple Health sample was deleted.
    public func merge(_ incoming: [BodyWeightEntryDto], removingHealthKitUuids removed: Set<String> = []) {
        var list = entries
        if !removed.isEmpty {
            list.removeAll { $0.healthKitUuid.map(removed.contains) ?? false }
        }
        let incomingIds = Set(incoming.map(\.clientEntryId))
        list.removeAll { incomingIds.contains($0.clientEntryId) }
        list.append(contentsOf: incoming.filter { stagedRemovals[$0.clientEntryId] == nil })
        entries = Self.sortedEntries(list)
        persistEntries()
    }

    // MARK: Sync

    public func refresh(isSignedIn: Bool) async {
        guard isSignedIn else { return }
        await flush()
        guard let server = try? await api.fetchBodyWeightEntries() else { return }
        let pendingIds = Set(outbox.map(\.clientEntryId)).union(stagedRemovals.keys)
        let pendingUpserts = outbox.compactMap { $0.kind == .upsert ? $0.payload : nil }
        let local = Dictionary(entries.map { ($0.clientEntryId, $0) }, uniquingKeysWith: { a, _ in a })
        entries = Self.sortedEntries(
            server.filter { !pendingIds.contains($0.clientEntryId) }
                + pendingUpserts.map { Self.optimisticEntry($0, existing: local[$0.clientEntryId]) }
        )
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
                        replace(try await api.upsertBodyWeightEntry(payload))
                    }
                case .delete:
                    if let id = item.serverId { try await api.deleteBodyWeightEntry(id: id) }
                }
                remaining.removeAll { $0.clientEntryId == item.clientEntryId }
            } catch APIClientError.offline {
                break
            } catch APIClientError.unauthorized {
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
        stagedRemovals = [:]
        entries = []
        outbox = []
        try? FileManager.default.removeItem(at: directory.appendingPathComponent(Self.entriesFile))
        try? FileManager.default.removeItem(at: directory.appendingPathComponent(Self.outboxFile))
    }

    // MARK: Helpers

    public static func newClientId() -> String { "weight-\(UUID().uuidString.lowercased())" }

    static func optimisticEntry(_ payload: UpsertBodyWeightEntryDto, existing: BodyWeightEntryDto?) -> BodyWeightEntryDto {
        let now = ISO8601DateFormatter().string(from: Date())
        return BodyWeightEntryDto(
            id: existing?.id ?? "local-\(payload.clientEntryId)",
            clientEntryId: payload.clientEntryId,
            measuredAt: payload.measuredAt,
            weightKg: payload.weightKg,
            source: existing?.source ?? .MANUAL,
            healthKitUuid: existing?.healthKitUuid,
            note: payload.note,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now
        )
    }

    static func sortedEntries(_ list: [BodyWeightEntryDto]) -> [BodyWeightEntryDto] {
        list.sorted { ($0.measuredAtDate ?? .distantPast) < ($1.measuredAtDate ?? .distantPast) }
    }

    private func replace(_ entry: BodyWeightEntryDto) {
        guard stagedRemovals[entry.clientEntryId] == nil else { return }
        var list = entries
        list.removeAll { $0.clientEntryId == entry.clientEntryId }
        list.append(entry)
        entries = Self.sortedEntries(list)
        persistEntries()
    }

    private func enqueue(_ item: BodyWeightOutboxItem) {
        outbox.removeAll { $0.clientEntryId == item.clientEntryId }
        outbox.append(item)
        persistOutbox()
    }

    private func persistEntries() {
        write(stagedRemovals.isEmpty ? entries : Self.sortedEntries(entries + stagedRemovals.values), Self.entriesFile)
    }
    private func persistOutbox() { write(outbox, Self.outboxFile) }

    private func read<T: Decodable>(_ name: String) -> T? {
        guard let data = try? Data(contentsOf: directory.appendingPathComponent(name)) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    private func write<T: Encodable>(_ value: T, _ name: String) {
        guard let data = try? JSONEncoder().encode(value) else { return }
        try? data.write(to: directory.appendingPathComponent(name), options: [.atomic, .completeFileProtection])
    }
}
