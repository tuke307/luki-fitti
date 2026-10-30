import Foundation
import Observation
import LukiFittiModels
import LukiFittiDomain
import LukiFittiAPI

/// Apple Health activity (daily active energy + workouts from any app) as stored on the server,
/// cached on disk for the Food tab's burned calories. Read-only on this side: the data comes from
/// `ActivityHealthSync` → `importActivity`, then `refresh` pulls the merged server view.
@MainActor
@Observable
public final class HealthActivityStore {
    public private(set) var days: [HealthDailyEnergyDto] = []
    public private(set) var workouts: [HealthWorkoutDto] = []
    /// Start of the oldest day fetched from the server in this session.
    public private(set) var loadedFrom: Date?

    private let api: APIClient
    private let directory: URL
    private let calendar = Calendar.current
    @ObservationIgnored private var lastRefreshAt: Date?
    @ObservationIgnored private var rangeFetches: Set<Date> = []

    private static let cacheFile = "health_activity.json"
    public nonisolated static let historyDays = 35
    public nonisolated static let refreshThrottle: TimeInterval = 60

    public init(apiClient: APIClient, storageDirectory: URL? = nil) {
        self.api = apiClient
        self.directory = storageDirectory ?? FileManager.default
            .urls(for: .documentDirectory, in: .userDomainMask).first!
            .appendingPathComponent("LukiFittiOfflineStore", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        if let cached: HealthActivityDto = read(Self.cacheFile) {
            days = cached.days
            workouts = cached.workouts
        }
    }

    // MARK: Import

    /// Uploads Apple Health changes in chunks within the API limits. Returns `false` when a chunk
    /// failed, so the caller keeps its HealthKit anchor and retries later.
    public func importActivity(_ dto: ImportHealthActivityDto) async -> Bool {
        guard !dto.isEmpty else { return true }
        for chunk in Self.chunks(dto) {
            guard (try? await api.importHealthActivity(chunk)) != nil else { return false }
        }
        return true
    }

    /// Splits an import so each request stays within the per-call limits.
    nonisolated static func chunks(_ dto: ImportHealthActivityDto) -> [ImportHealthActivityDto] {
        let daySize = HealthActivityLimits.uploadChunkDays
        let workoutSize = HealthActivityLimits.uploadChunkWorkouts
        let deletedSize = HealthActivityLimits.uploadChunkDeleted
        func pages(_ count: Int, _ size: Int) -> Int { (count + size - 1) / size }
        let count = max(1, pages(dto.days.count, daySize), pages(dto.workouts.count, workoutSize),
                        pages(dto.deletedWorkoutUuids.count, deletedSize))
        func slice<T>(_ list: [T], _ index: Int, _ size: Int) -> [T] {
            let lower = min(index * size, list.count)
            return Array(list[lower..<min(lower + size, list.count)])
        }
        return (0..<count).map { index in
            ImportHealthActivityDto(
                days: slice(dto.days, index, daySize),
                workouts: slice(dto.workouts, index, workoutSize),
                deletedWorkoutUuids: slice(dto.deletedWorkoutUuids, index, deletedSize)
            )
        }
    }

    // MARK: Sync

    /// Loads the recent window. `force: false` skips the call when the last refresh is under a minute old.
    public func refresh(isSignedIn: Bool, force: Bool = true) async {
        guard isSignedIn else { return }
        let now = Date()
        if !force, let lastRefreshAt, now.timeIntervalSince(lastRefreshAt) < Self.refreshThrottle, now >= lastRefreshAt {
            return
        }
        let from = calendar.startOfDay(for: now.addingTimeInterval(-Double(Self.historyDays) * 86_400))
        let to = calendar.startOfDay(for: now.addingTimeInterval(2 * 86_400))
        guard await fetch(from: from, to: to) else { return }
        lastRefreshAt = now
    }

    /// Fetches older days (e.g. when the week strip scrolls back) unless they're already loaded.
    public func ensureLoaded(from day: Date, isSignedIn: Bool) async {
        let from = calendar.startOfDay(for: day)
        guard isSignedIn, let loadedFrom, from < loadedFrom, !rangeFetches.contains(from) else { return }
        rangeFetches.insert(from)
        defer { rangeFetches.remove(from) }
        _ = await fetch(from: from, to: loadedFrom)
    }

    /// Fetches `[from, to)` in windows of at most 400 days and replaces the cached rows inside it.
    private func fetch(from: Date, to: Date) async -> Bool {
        let maxSpan = Double(HealthActivityLimits.maxRangeDays - 1) * 86_400
        var windowEnd = to
        var fetchedDays: [HealthDailyEnergyDto] = []
        var fetchedWorkouts: [HealthWorkoutDto] = []
        while windowEnd > from {
            let windowStart = max(from, windowEnd.addingTimeInterval(-maxSpan))
            guard let server = try? await api.fetchHealthActivity(from: windowStart, to: windowEnd) else { return false }
            fetchedDays += server.days
            fetchedWorkouts += server.workouts
            windowEnd = windowStart
        }
        let merged = Self.merge(
            existing: HealthActivityDto(days: days, workouts: workouts),
            server: HealthActivityDto(days: fetchedDays, workouts: fetchedWorkouts),
            window: DateInterval(start: from, end: max(from, to)),
            calendar: calendar
        )
        days = merged.days
        workouts = merged.workouts
        loadedFrom = min(loadedFrom ?? from, from)
        persist()
        return true
    }

    /// Server rows replace everything inside `window`; rows outside it stay.
    nonisolated static func merge(
        existing: HealthActivityDto,
        server: HealthActivityDto,
        window: DateInterval,
        calendar: Calendar = .current
    ) -> HealthActivityDto {
        func inWindow(_ date: Date?) -> Bool {
            guard let date else { return false }
            return date >= window.start && date < window.end
        }
        let serverDays = Set(server.days.map(\.day))
        let serverWorkouts = Set(server.workouts.map(\.healthKitUuid))
        let keptDays = existing.days.filter {
            !serverDays.contains($0.day) && !inWindow(LukiDayKey.date($0.day, calendar: calendar))
        }
        let keptWorkouts = existing.workouts.filter {
            !serverWorkouts.contains($0.healthKitUuid) && !inWindow($0.startedAtDate)
        }
        var uniqueDays: [String: HealthDailyEnergyDto] = [:]
        for day in server.days { uniqueDays[day.day] = day }
        var uniqueWorkouts: [String: HealthWorkoutDto] = [:]
        for workout in server.workouts { uniqueWorkouts[workout.healthKitUuid] = workout }
        return HealthActivityDto(
            days: (keptDays + uniqueDays.values).sorted { $0.day < $1.day },
            workouts: (keptWorkouts + uniqueWorkouts.values).sorted { $0.startedAt < $1.startedAt }
        )
    }

    public func clear() {
        days = []
        workouts = []
        loadedFrom = nil
        lastRefreshAt = nil
        try? FileManager.default.removeItem(at: directory.appendingPathComponent(Self.cacheFile))
    }

    // MARK: Helpers

    private func persist() { write(HealthActivityDto(days: days, workouts: workouts), Self.cacheFile) }

    private func read<T: Decodable>(_ name: String) -> T? {
        guard let data = try? Data(contentsOf: directory.appendingPathComponent(name)) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    private func write<T: Encodable>(_ value: T, _ name: String) {
        guard let data = try? JSONEncoder().encode(value) else { return }
        try? data.write(to: directory.appendingPathComponent(name), options: [.atomic, .completeFileProtection])
    }
}
