import Foundation

// MARK: - Apple Health activity (daily active energy + workouts from any app)

/// Validation limits shared with the API (`POST /api/activity/import`).
public enum HealthActivityLimits {
    public static let importMaxDays = 400
    public static let importMaxWorkouts = 2000
    public static let importMaxDeleted = 2000
    /// Per-request upload sizes: together they stay well under the API's 100 KB JSON body limit.
    public static let uploadChunkDays = 400
    public static let uploadChunkWorkouts = 150
    public static let uploadChunkDeleted = 500
    public static let maxRangeDays = 400
    public static let kcalRange: ClosedRange<Double> = 0...20_000
    public static let sourceNameMaxLength = 120
}

public struct HealthDailyEnergyInputDto: Codable, Sendable, Equatable, Hashable {
    /// Local calendar day, `yyyy-MM-dd`.
    public var day: String
    public var activeKcal: Double

    public init(day: String, activeKcal: Double) {
        self.day = day
        self.activeKcal = activeKcal
    }
}

public struct HealthWorkoutInputDto: Codable, Sendable, Equatable, Hashable {
    public var healthKitUuid: String
    /// camelCase `HKWorkoutActivityType` name (`running`, `cycling`, … or `other`).
    public var activityType: String
    public var sourceName: String
    /// `true` when LukiFitti itself wrote the workout.
    public var isOwn: Bool
    public var startedAt: String
    public var endedAt: String
    public var activeKcal: Double?
    public var distanceMeters: Double?

    public init(
        healthKitUuid: String,
        activityType: String,
        sourceName: String,
        isOwn: Bool,
        startedAt: String,
        endedAt: String,
        activeKcal: Double? = nil,
        distanceMeters: Double? = nil
    ) {
        self.healthKitUuid = healthKitUuid
        self.activityType = activityType
        self.sourceName = sourceName
        self.isOwn = isOwn
        self.startedAt = startedAt
        self.endedAt = endedAt
        self.activeKcal = activeKcal
        self.distanceMeters = distanceMeters
    }
}

public struct ImportHealthActivityDto: Codable, Sendable, Equatable, Hashable {
    public var days: [HealthDailyEnergyInputDto]
    public var workouts: [HealthWorkoutInputDto]
    /// HealthKit workout UUIDs deleted in Apple Health since the last sync.
    public var deletedWorkoutUuids: [String]

    public init(
        days: [HealthDailyEnergyInputDto] = [],
        workouts: [HealthWorkoutInputDto] = [],
        deletedWorkoutUuids: [String] = []
    ) {
        self.days = days
        self.workouts = workouts
        self.deletedWorkoutUuids = deletedWorkoutUuids
    }

    public var isEmpty: Bool { days.isEmpty && workouts.isEmpty && deletedWorkoutUuids.isEmpty }
}

public struct ImportHealthActivityResultDto: Codable, Sendable, Equatable, Hashable {
    public var daysUpserted: Int
    public var workoutsUpserted: Int
    public var workoutsDeleted: Int

    public init(daysUpserted: Int = 0, workoutsUpserted: Int = 0, workoutsDeleted: Int = 0) {
        self.daysUpserted = daysUpserted
        self.workoutsUpserted = workoutsUpserted
        self.workoutsDeleted = workoutsDeleted
    }

    enum CodingKeys: String, CodingKey { case daysUpserted, workoutsUpserted, workoutsDeleted }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.daysUpserted = try c.decodeIfPresent(Int.self, forKey: .daysUpserted) ?? 0
        self.workoutsUpserted = try c.decodeIfPresent(Int.self, forKey: .workoutsUpserted) ?? 0
        self.workoutsDeleted = try c.decodeIfPresent(Int.self, forKey: .workoutsDeleted) ?? 0
    }
}

public struct HealthDailyEnergyDto: Codable, Sendable, Equatable, Hashable, Identifiable {
    /// Local calendar day, `yyyy-MM-dd`.
    public var day: String
    public var activeKcal: Double
    public var updatedAt: String

    public var id: String { day }

    public init(day: String, activeKcal: Double, updatedAt: String = "") {
        self.day = day
        self.activeKcal = activeKcal
        self.updatedAt = updatedAt
    }

    enum CodingKeys: String, CodingKey { case day, activeKcal, updatedAt }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.day = try c.decode(String.self, forKey: .day)
        self.activeKcal = try c.decode(Double.self, forKey: .activeKcal)
        self.updatedAt = try c.decodeIfPresent(String.self, forKey: .updatedAt) ?? ""
    }
}

public struct HealthWorkoutDto: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var id: String
    public var healthKitUuid: String
    public var activityType: String
    public var sourceName: String
    public var isOwn: Bool
    public var startedAt: String
    public var endedAt: String
    public var activeKcal: Double?
    public var distanceMeters: Double?

    public init(
        id: String,
        healthKitUuid: String,
        activityType: String,
        sourceName: String,
        isOwn: Bool = false,
        startedAt: String,
        endedAt: String,
        activeKcal: Double? = nil,
        distanceMeters: Double? = nil
    ) {
        self.id = id
        self.healthKitUuid = healthKitUuid
        self.activityType = activityType
        self.sourceName = sourceName
        self.isOwn = isOwn
        self.startedAt = startedAt
        self.endedAt = endedAt
        self.activeKcal = activeKcal
        self.distanceMeters = distanceMeters
    }

    enum CodingKeys: String, CodingKey {
        case id, healthKitUuid, activityType, sourceName, isOwn, startedAt, endedAt, activeKcal, distanceMeters
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.healthKitUuid = try c.decode(String.self, forKey: .healthKitUuid)
        self.id = try c.decodeIfPresent(String.self, forKey: .id) ?? healthKitUuid
        self.activityType = try c.decodeIfPresent(String.self, forKey: .activityType) ?? "other"
        self.sourceName = try c.decodeIfPresent(String.self, forKey: .sourceName) ?? ""
        self.isOwn = try c.decodeIfPresent(Bool.self, forKey: .isOwn) ?? false
        self.startedAt = try c.decode(String.self, forKey: .startedAt)
        self.endedAt = try c.decode(String.self, forKey: .endedAt)
        self.activeKcal = try c.decodeIfPresent(Double.self, forKey: .activeKcal)
        self.distanceMeters = try c.decodeIfPresent(Double.self, forKey: .distanceMeters)
    }
}

public struct HealthActivityDto: Codable, Sendable, Equatable, Hashable {
    public var days: [HealthDailyEnergyDto]
    public var workouts: [HealthWorkoutDto]

    public init(days: [HealthDailyEnergyDto] = [], workouts: [HealthWorkoutDto] = []) {
        self.days = days
        self.workouts = workouts
    }

    enum CodingKeys: String, CodingKey { case days, workouts }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.days = try c.decodeIfPresent([HealthDailyEnergyDto].self, forKey: .days) ?? []
        self.workouts = try c.decodeIfPresent([HealthWorkoutDto].self, forKey: .workouts) ?? []
    }
}

extension HealthWorkoutDto {
    public var startedAtDate: Date? { LukiISODate.parse(startedAt) }
    public var endedAtDate: Date? { LukiISODate.parse(endedAt) }
}

/// `yyyy-MM-dd` local-day keys used by the activity API (Gregorian, POSIX).
public enum LukiDayKey {
    public static func string(_ date: Date, timeZone: TimeZone = .current) -> String {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = timeZone
        let c = cal.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", locale: Locale(identifier: "en_US_POSIX"), c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// Start of the local day named by `key` in `calendar`'s time zone.
    public static func date(_ key: String, calendar: Calendar = .current) -> Date? {
        let parts = key.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = calendar.timeZone
        guard let date = cal.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])) else { return nil }
        return calendar.startOfDay(for: date)
    }
}
