import Foundation

/// A dated progress check-in: up to three pose photos, a note and an optional weigh-in
/// (linked by `bodyWeightClientEntryId`; the weight itself lives in BodyWeightEntry).
public struct ProgressCheckInDto: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var id: String
    public var clientEntryId: String
    public var takenAt: String
    public var note: String?
    public var bodyWeightClientEntryId: String?
    public var createdAt: String?
    public var photos: [ProgressPhotoDto]

    public init(
        id: String = "local-\(UUID().uuidString)",
        clientEntryId: String = UUID().uuidString,
        takenAt: String = ISO8601DateFormatter().string(from: Date()),
        note: String? = nil,
        bodyWeightClientEntryId: String? = nil,
        createdAt: String? = nil,
        photos: [ProgressPhotoDto] = []
    ) {
        self.id = id
        self.clientEntryId = clientEntryId
        self.takenAt = takenAt
        self.note = note
        self.bodyWeightClientEntryId = bodyWeightClientEntryId
        self.createdAt = createdAt
        self.photos = photos
    }
}

public struct ProgressPhotoDto: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var id: String
    public var clientPhotoId: String
    public var pose: ProgressPose
    public var kind: ProgressPhotoKind
    /// Authenticated API path (`/api/progress/photos/:id`); nil for local-only photos.
    public var url: String?
    public var mimeType: String
    public var sizeBytes: Int
    public var width: Int?
    public var height: Int?
    /// Local file name inside the progress directory for on-device copies.
    public var localFile: String?
    public var createdAt: String?

    public init(
        id: String = "local-\(UUID().uuidString)",
        clientPhotoId: String = UUID().uuidString,
        pose: ProgressPose,
        kind: ProgressPhotoKind = .PHOTO,
        url: String? = nil,
        mimeType: String = "image/jpeg",
        sizeBytes: Int = 0,
        width: Int? = nil,
        height: Int? = nil,
        localFile: String? = nil,
        createdAt: String? = nil
    ) {
        self.id = id
        self.clientPhotoId = clientPhotoId
        self.pose = pose
        self.kind = kind
        self.url = url
        self.mimeType = mimeType
        self.sizeBytes = sizeBytes
        self.width = width
        self.height = height
        self.localFile = localFile
        self.createdAt = createdAt
    }
}

public struct UpsertProgressCheckInDto: Codable, Sendable, Equatable, Hashable {
    public var clientEntryId: String
    public var takenAt: String
    public var note: String?
    public var bodyWeightClientEntryId: String?

    public init(
        clientEntryId: String,
        takenAt: String,
        note: String? = nil,
        bodyWeightClientEntryId: String? = nil
    ) {
        self.clientEntryId = clientEntryId
        self.takenAt = takenAt
        self.note = note
        self.bodyWeightClientEntryId = bodyWeightClientEntryId
    }
}

public struct ProgressTargetRequestDto: Encodable, Sendable {
    public var imageBase64: String
    public var goal: BodyGoal
    public var horizonMonths: Int
    public var pose: ProgressPose = .FRONT

    public init(imageBase64: String, goal: BodyGoal, horizonMonths: Int) {
        self.imageBase64 = imageBase64
        self.goal = goal
        self.horizonMonths = horizonMonths
    }
}

public struct ProgressTargetResponseDto: Codable, Sendable, Equatable {
    public var imageBase64: String
    public var mimeType: String
    public var model: String
    public var costUsd: Double?
    public var runId: String
}
