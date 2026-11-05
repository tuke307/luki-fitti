import Foundation

// Request bodies of the folder/template endpoints (mirror `CreateFolderSchema`,
// `UpdateFolderSchema`, `CreateTemplateSchema` and `UpdateTemplateSchema` in @luki-fitti/common).

/// Body of `POST /api/workouts/folders` (with `id`) and `PUT /api/workouts/folders/:id`.
/// `name == nil` leaves the name unchanged (untouched starter folders keep their catalog text).
public struct WorkoutFolderUpsertDto: Encodable, Sendable, Equatable {
    public var id: String?
    public var name: String?
    public var color: String
    public var sortOrder: Int

    public init(id: String? = nil, name: String?, color: String, sortOrder: Int) {
        self.id = id
        self.name = name
        self.color = color
        self.sortOrder = sortOrder
    }
}

/// One exercise of `TemplateExerciseInputSchema`.
public struct TemplateExerciseInputDto: Encodable, Sendable, Equatable {
    public var exerciseId: String
    public var sets: [TemplateSetDto]?
    public var orderIndex: Int
    public var plannedSets: Int
    public var warmupSets: Int
    public var targetRepsMin: Int?
    public var targetRepsMax: Int?
    public var targetWeight: Double?
    public var weightUnit: WeightUnit
    public var restSeconds: Int
    public var targetDurationSeconds: Int?
    public var targetDistanceMeters: Double?
    public var notes: String?
    public var alternativeExerciseIds: [String]

    /// Clamped to the server's limits, so a stored template never fails validation.
    public init(_ e: WorkoutTemplateExerciseDto, orderIndex: Int) {
        func reps(_ v: Int?) -> Int? { v.flatMap { $0 >= 1 ? min(200, $0) : nil } }
        exerciseId = e.exerciseId
        sets = (e.sets?.isEmpty ?? true) ? nil : Array(e.sets!.prefix(40))
        self.orderIndex = orderIndex
        plannedSets = min(30, max(1, e.plannedSets))
        warmupSets = min(10, max(0, e.warmupSets))
        targetRepsMin = reps(e.targetRepsMin)
        targetRepsMax = reps(e.targetRepsMax)
        targetWeight = e.targetWeight
        weightUnit = e.weightUnit
        restSeconds = min(900, max(0, e.restSeconds))
        targetDurationSeconds = e.targetDurationSeconds
        targetDistanceMeters = e.targetDistanceMeters
        notes = e.notes.map { String($0.prefix(500)) }
        alternativeExerciseIds = e.alternativeExerciseIds
    }
}

/// Body of `POST /api/workouts/templates` (with `id`) and `PUT /api/workouts/templates/:id`.
/// Without `text` (untouched starter copies) only structural fields are sent. `folderId` and
/// `description` are always encoded, `null` included, so unfiling and clearing reach the server.
public struct WorkoutTemplateUpsertDto: Encodable, Sendable, Equatable {
    public struct Text: Sendable, Equatable {
        public var name: String
        public var description: String?
        public var exercises: [TemplateExerciseInputDto]

        public init(name: String, description: String?, exercises: [TemplateExerciseInputDto]) {
            self.name = name
            self.description = description
            self.exercises = exercises
        }
    }

    public var id: String?
    public var folderId: String?
    public var sortOrder: Int
    public var estimatedDurationMinutes: Int
    public var text: Text?

    public init(id: String? = nil, folderId: String?, sortOrder: Int, estimatedDurationMinutes: Int, text: Text?) {
        self.id = id
        self.folderId = folderId
        self.sortOrder = sortOrder
        self.estimatedDurationMinutes = estimatedDurationMinutes
        self.text = text
    }

    private enum CodingKeys: String, CodingKey {
        case id, folderId, sortOrder, estimatedDurationMinutes, name, description, exercises
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(id, forKey: .id)
        try c.encode(folderId, forKey: .folderId)
        try c.encode(sortOrder, forKey: .sortOrder)
        try c.encode(estimatedDurationMinutes, forKey: .estimatedDurationMinutes)
        if let text {
            try c.encode(text.name, forKey: .name)
            try c.encode(text.description, forKey: .description)
            try c.encode(text.exercises, forKey: .exercises)
        }
    }
}
