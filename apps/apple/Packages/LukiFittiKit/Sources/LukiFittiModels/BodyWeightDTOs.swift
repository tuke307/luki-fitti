import Foundation

// MARK: - Body weight (mirrors packages/common/src/schemas/body-weight.schemas.ts)

public enum BodyWeightSource: String, Codable, Sendable, CaseIterable, Equatable, Hashable {
    case MANUAL
    case HEALTHKIT
}

/// Validation limits shared with the API (`BODY_WEIGHT_*` in @luki-fitti/common).
public enum BodyWeightLimits {
    public static let minKg = 25.0
    public static let maxKg = 400.0
    public static let importMax = 500
    public static let noteMaxLength = 280
    public static let kgRange: ClosedRange<Double> = minKg...maxKg
}

public struct BodyWeightEntryDto: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var id: String
    public var clientEntryId: String
    public var measuredAt: String
    public var weightKg: Double
    public var source: BodyWeightSource
    public var healthKitUuid: String?
    public var note: String?
    public var createdAt: String
    public var updatedAt: String

    public init(
        id: String,
        clientEntryId: String,
        measuredAt: String,
        weightKg: Double,
        source: BodyWeightSource = .MANUAL,
        healthKitUuid: String? = nil,
        note: String? = nil,
        createdAt: String = ISO8601DateFormatter().string(from: Date()),
        updatedAt: String = ISO8601DateFormatter().string(from: Date())
    ) {
        self.id = id
        self.clientEntryId = clientEntryId
        self.measuredAt = measuredAt
        self.weightKg = weightKg
        self.source = source
        self.healthKitUuid = healthKitUuid
        self.note = note
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    enum CodingKeys: String, CodingKey {
        case id, clientEntryId, measuredAt, weightKg, source, healthKitUuid, note, createdAt, updatedAt
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try c.decode(String.self, forKey: .id)
        self.clientEntryId = try c.decode(String.self, forKey: .clientEntryId)
        self.measuredAt = try c.decode(String.self, forKey: .measuredAt)
        self.weightKg = try c.decode(Double.self, forKey: .weightKg)
        self.source = try c.decodeIfPresent(BodyWeightSource.self, forKey: .source) ?? .MANUAL
        self.healthKitUuid = try c.decodeIfPresent(String.self, forKey: .healthKitUuid)
        self.note = try c.decodeIfPresent(String.self, forKey: .note)
        let now = ISO8601DateFormatter().string(from: Date())
        self.createdAt = try c.decodeIfPresent(String.self, forKey: .createdAt) ?? now
        self.updatedAt = try c.decodeIfPresent(String.self, forKey: .updatedAt) ?? self.createdAt
    }
}

public struct UpsertBodyWeightEntryDto: Codable, Sendable, Equatable, Hashable {
    public var clientEntryId: String
    public var measuredAt: String
    public var weightKg: Double
    public var note: String?

    public init(clientEntryId: String, measuredAt: String, weightKg: Double, note: String? = nil) {
        self.clientEntryId = clientEntryId
        self.measuredAt = measuredAt
        self.weightKg = weightKg
        self.note = note
    }
}

public struct BodyWeightHealthKitSampleDto: Codable, Sendable, Equatable, Hashable {
    public var healthKitUuid: String
    public var measuredAt: String
    public var weightKg: Double

    public init(healthKitUuid: String, measuredAt: String, weightKg: Double) {
        self.healthKitUuid = healthKitUuid
        self.measuredAt = measuredAt
        self.weightKg = weightKg
    }
}

public struct ImportBodyWeightDto: Codable, Sendable, Equatable, Hashable {
    public var samples: [BodyWeightHealthKitSampleDto]
    /// HealthKit sample UUIDs deleted in Apple Health since the last sync.
    public var deletedHealthKitUuids: [String]

    public init(samples: [BodyWeightHealthKitSampleDto] = [], deletedHealthKitUuids: [String] = []) {
        self.samples = samples
        self.deletedHealthKitUuids = deletedHealthKitUuids
    }
}

public struct ImportBodyWeightResultDto: Codable, Sendable, Equatable, Hashable {
    public var imported: Int
    public var deleted: Int
    public var entries: [BodyWeightEntryDto]

    public init(imported: Int = 0, deleted: Int = 0, entries: [BodyWeightEntryDto] = []) {
        self.imported = imported
        self.deleted = deleted
        self.entries = entries
    }

    enum CodingKeys: String, CodingKey { case imported, deleted, entries }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.imported = try c.decodeIfPresent(Int.self, forKey: .imported) ?? 0
        self.deleted = try c.decodeIfPresent(Int.self, forKey: .deleted) ?? 0
        self.entries = try c.decodeIfPresent([BodyWeightEntryDto].self, forKey: .entries) ?? []
    }
}

extension BodyWeightEntryDto {
    public var measuredAtDate: Date? { LukiISODate.parse(measuredAt) }
    public var updatedAtDate: Date? { LukiISODate.parse(updatedAt) }
}
