import Foundation

/// Body of `POST /api/exercises` (`CreateExerciseSchema` in @luki-fitti/common).
public struct CreateExerciseBodyDto: Encodable, Sendable, Equatable {
    public var name: String
    public var description: String
    public var instructions: [String]
    public var category: ExerciseCategory
    public var exerciseType: ExerciseType
    public var primaryMuscleGroup: MuscleGroup
    public var secondaryMuscleGroups: [MuscleGroup]
    public var equipment: EquipmentType
    public var recommendedDurationSeconds: Int?
    public var tags: [String]
    public var alternativeExerciseIds: [String]
    public var movementPattern: MovementPattern?
    public var laterality: Laterality?

    /// The server limits: name 2–120, description 2–2000, hold 5–7200 s.
    public init(from exercise: ExerciseDto) {
        let name = String(exercise.name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(120))
        let description = exercise.description.trimmingCharacters(in: .whitespacesAndNewlines)
        self.name = name
        self.description = String((description.count >= 2 ? description : "\(name) custom exercise").prefix(2000))
        self.instructions = exercise.instructions
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        self.category = exercise.category
        self.exerciseType = exercise.exerciseType
        self.primaryMuscleGroup = exercise.primaryMuscleGroup
        self.secondaryMuscleGroups = exercise.secondaryMuscleGroups
        self.equipment = exercise.equipment
        self.recommendedDurationSeconds = exercise.recommendedDurationSeconds.map { min(7200, max(5, $0)) }
        self.tags = exercise.tags
        self.alternativeExerciseIds = []
        self.movementPattern = exercise.movementPattern
        self.laterality = exercise.laterality
    }
}

/// One exercise of `StretchingRoutineExerciseInputSchema`.
public struct StretchingRoutineExerciseInputDto: Encodable, Sendable, Equatable {
    public var exerciseId: String
    public var orderIndex: Int
    public var sets: Int
    public var durationSeconds: Int?
    public var reps: Int?
    public var transitionSeconds: Int
    public var notes: String?
}

/// Body of `POST /api/stretching/routines` and `PUT /api/stretching/routines/:id`.
public struct StretchingRoutineUpsertDto: Encodable, Sendable, Equatable {
    public var name: String
    public var description: String?
    public var targetArea: String
    public var estimatedDurationSeconds: Int
    public var exercises: [StretchingRoutineExerciseInputDto]

    /// Clamped to `CreateStretchingRoutineSchema` so a local edit can't be rejected for range.
    public init(from routine: StretchingRoutineDto) {
        let trimmedArea = routine.targetArea.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedDescription = routine.description?.trimmingCharacters(in: .whitespacesAndNewlines)
        self.name = String(routine.name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(100))
        self.description = trimmedDescription.flatMap { $0.isEmpty ? nil : String($0.prefix(500)) }
        self.targetArea = String((trimmedArea.isEmpty ? "Full Body" : trimmedArea).prefix(80))
        self.estimatedDurationSeconds = min(7200, max(30, routine.estimatedDurationSeconds))
        self.exercises = routine.exercises.enumerated().map { idx, item in
            StretchingRoutineExerciseInputDto(
                exerciseId: item.exerciseId,
                orderIndex: idx,
                sets: min(10, max(1, item.sets)),
                durationSeconds: item.durationSeconds.map { min(1800, max(5, $0)) },
                reps: item.reps.map { min(100, max(1, $0)) },
                transitionSeconds: min(120, max(0, item.transitionSeconds)),
                notes: item.notes.map { String($0.prefix(500)) }
            )
        }
    }
}

extension StretchingRoutineDto {
    /// Seconds a routine takes: every set holds (45 s when unset) and then transitions, like the web.
    public static func estimatedSeconds(_ exercises: [StretchingRoutineExerciseDto]) -> Int {
        exercises.reduce(0) { $0 + $1.sets * (($1.durationSeconds ?? 45) + $1.transitionSeconds) }
    }
}
