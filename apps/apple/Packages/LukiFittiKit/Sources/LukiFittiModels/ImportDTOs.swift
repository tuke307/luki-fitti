import Foundation

// MARK: - `luki-fitti-import@1` file (mirrors packages/common/src/schemas/import.ts)

public enum ImportFormat {
    public static let id = "luki-fitti-import@1"
    /// Upload limit enforced by the clients and the API body parser.
    public static let maxBytes = 10 * 1024 * 1024
}

/// System exercises are referenced by catalog slug, custom exercises by their key in the file.
public enum ImportExerciseRef: Codable, Sendable, Equatable, Hashable {
    case slug(String)
    case custom(String)

    private enum CodingKeys: String, CodingKey { case slug, customKey }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        if let slug = try c.decodeIfPresent(String.self, forKey: .slug) {
            self = .slug(slug)
        } else {
            self = .custom(try c.decode(String.self, forKey: .customKey))
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .slug(let slug): try c.encode(slug, forKey: .slug)
        case .custom(let key): try c.encode(key, forKey: .customKey)
        }
    }
}

public struct ImportFileSource: Codable, Sendable, Equatable, Hashable {
    public var app: String
    public var note: String?

    public init(app: String, note: String? = nil) {
        self.app = app
        self.note = note
    }
}

public struct ImportCustomExercise: Codable, Sendable, Equatable, Hashable {
    public var key: String
    public var name: String
    public var primaryMuscleGroup: MuscleGroup
    public var equipment: EquipmentType
    public var exerciseType: ExerciseType
    public var movementPattern: MovementPattern?
    public var laterality: Laterality?
    public var description: String?
    public var instructions: [String]?

    public init(key: String, name: String, primaryMuscleGroup: MuscleGroup, equipment: EquipmentType, exerciseType: ExerciseType, movementPattern: MovementPattern? = nil, laterality: Laterality? = nil, description: String? = nil, instructions: [String]? = nil) {
        self.key = key
        self.name = name
        self.primaryMuscleGroup = primaryMuscleGroup
        self.equipment = equipment
        self.exerciseType = exerciseType
        self.movementPattern = movementPattern
        self.laterality = laterality
        self.description = description
        self.instructions = instructions
    }
}

public struct ImportFolder: Codable, Sendable, Equatable, Hashable {
    public var key: String
    public var name: String
    public var color: String?
    public var sortOrder: Int?

    public init(key: String, name: String, color: String? = nil, sortOrder: Int? = nil) {
        self.key = key
        self.name = name
        self.color = color
        self.sortOrder = sortOrder
    }
}

/// Planned set; unset values are written as `null` like the TypeScript builder does.
public struct ImportTemplateSet: Codable, Sendable, Equatable, Hashable {
    public var setType: SetType
    public var weight: Double?
    public var reps: Int?
    public var durationSeconds: Int?

    private enum CodingKeys: String, CodingKey { case setType, weight, reps, durationSeconds }

    public init(setType: SetType, weight: Double?, reps: Int?, durationSeconds: Int?) {
        self.setType = setType
        self.weight = weight
        self.reps = reps
        self.durationSeconds = durationSeconds
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(setType, forKey: .setType)
        try c.encode(weight, forKey: .weight)
        try c.encode(reps, forKey: .reps)
        try c.encode(durationSeconds, forKey: .durationSeconds)
    }
}

public struct ImportTemplateExercise: Codable, Sendable, Equatable, Hashable {
    public var exercise: ImportExerciseRef
    public var orderIndex: Int
    public var sets: [ImportTemplateSet]
    public var restSeconds: Int
    public var alternativeExercises: [ImportExerciseRef]?

    public init(exercise: ImportExerciseRef, orderIndex: Int, sets: [ImportTemplateSet], restSeconds: Int, alternativeExercises: [ImportExerciseRef]? = nil) {
        self.exercise = exercise
        self.orderIndex = orderIndex
        self.sets = sets
        self.restSeconds = restSeconds
        self.alternativeExercises = alternativeExercises
    }
}

public struct ImportTemplate: Codable, Sendable, Equatable, Hashable {
    public var key: String
    public var folderKey: String?
    public var name: String
    public var description: String?
    public var estimatedDurationMinutes: Int?
    public var sortOrder: Int?
    public var exercises: [ImportTemplateExercise]

    public init(key: String, folderKey: String? = nil, name: String, description: String? = nil, estimatedDurationMinutes: Int? = nil, sortOrder: Int? = nil, exercises: [ImportTemplateExercise]) {
        self.key = key
        self.folderKey = folderKey
        self.name = name
        self.description = description
        self.estimatedDurationMinutes = estimatedDurationMinutes
        self.sortOrder = sortOrder
        self.exercises = exercises
    }
}

public struct ImportSessionSet: Codable, Sendable, Equatable, Hashable {
    public var setNumber: Int
    public var setType: SetType
    public var weight: Double?
    public var weightUnit: WeightUnit
    public var reps: Int?
    public var durationSeconds: Int?
    public var rpe: Double?
    public var completed: Bool

    public init(setNumber: Int, setType: SetType, weight: Double? = nil, weightUnit: WeightUnit, reps: Int? = nil, durationSeconds: Int? = nil, rpe: Double? = nil, completed: Bool) {
        self.setNumber = setNumber
        self.setType = setType
        self.weight = weight
        self.weightUnit = weightUnit
        self.reps = reps
        self.durationSeconds = durationSeconds
        self.rpe = rpe
        self.completed = completed
    }
}

public struct ImportSessionExercise: Codable, Sendable, Equatable, Hashable {
    public var exercise: ImportExerciseRef
    public var orderIndex: Int
    public var restSeconds: Int?
    public var sets: [ImportSessionSet]

    public init(exercise: ImportExerciseRef, orderIndex: Int, restSeconds: Int? = nil, sets: [ImportSessionSet]) {
        self.exercise = exercise
        self.orderIndex = orderIndex
        self.restSeconds = restSeconds
        self.sets = sets
    }
}

public struct ImportSession: Codable, Sendable, Equatable, Hashable {
    public var key: String
    public var workoutName: String
    public var templateKey: String?
    public var sessionType: SessionType?
    public var startedAt: String
    public var completedAt: String
    public var activeDurationSeconds: Int?
    public var notes: String?
    public var exercises: [ImportSessionExercise]

    public init(key: String, workoutName: String, templateKey: String? = nil, sessionType: SessionType? = nil, startedAt: String, completedAt: String, activeDurationSeconds: Int? = nil, notes: String? = nil, exercises: [ImportSessionExercise]) {
        self.key = key
        self.workoutName = workoutName
        self.templateKey = templateKey
        self.sessionType = sessionType
        self.startedAt = startedAt
        self.completedAt = completedAt
        self.activeDurationSeconds = activeDurationSeconds
        self.notes = notes
        self.exercises = exercises
    }
}

public struct ImportFile: Codable, Sendable, Equatable, Hashable {
    public var format: String
    public var exportedAt: String
    public var source: ImportFileSource
    public var customExercises: [ImportCustomExercise]
    public var folders: [ImportFolder]
    public var templates: [ImportTemplate]
    public var sessions: [ImportSession]

    public init(format: String, exportedAt: String, source: ImportFileSource, customExercises: [ImportCustomExercise], folders: [ImportFolder], templates: [ImportTemplate], sessions: [ImportSession]) {
        self.format = format
        self.exportedAt = exportedAt
        self.source = source
        self.customExercises = customExercises
        self.folders = folders
        self.templates = templates
        self.sessions = sessions
    }
}

// MARK: - `POST /api/import/{preview,commit}` responses

public struct ImportKindCountsDto: Codable, Sendable, Equatable, Hashable {
    public var total: Int
    public var new: Int
    public var existing: Int
}

public struct ImportCountsDto: Codable, Sendable, Equatable, Hashable {
    public var customExercises: ImportKindCountsDto
    public var folders: ImportKindCountsDto
    public var templates: ImportKindCountsDto
    public var sessions: ImportKindCountsDto
}

public struct ImportWarningDto: Codable, Sendable, Equatable, Hashable {
    /// `FOLDER_NAME_REUSED`: the user already has a folder with this name; it is reused.
    public var code: String
    public var key: String
    public var name: String
}

/// Preview of an import; the commit response is the same plus `jobId`.
public struct ImportPreviewDto: Codable, Sendable, Equatable, Hashable {
    public var format: String
    public var sourceApp: String
    public var counts: ImportCountsDto
    public var totalSets: Int
    public var newSets: Int
    public var earliestSessionAt: String?
    public var latestSessionAt: String?
    public var unknownSlugs: [String]
    public var unknownSlugCount: Int
    public var warnings: [ImportWarningDto]
    public var jobId: String?

    public var hasNewData: Bool {
        unknownSlugCount == 0
            && [counts.customExercises, counts.folders, counts.templates, counts.sessions].contains { $0.new > 0 }
    }
}

public struct ImportIssueDto: Codable, Sendable, Equatable, Hashable {
    public var path: String
    public var message: String
}
