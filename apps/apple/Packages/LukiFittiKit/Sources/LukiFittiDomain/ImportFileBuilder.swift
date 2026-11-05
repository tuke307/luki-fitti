import Foundation
import LukiFittiModels

/// Writes folders, templates, custom exercises and completed history as a `luki-fitti-import@1`
/// file (keys = entity ids), so a backup can be imported into any account.
/// Mirrors `buildImportFile` in `packages/common/src/utils/import-file.util.ts`; both are checked
/// against `packages/common/src/utils/__fixtures__/import-builder-output.json`.
public enum ImportFileBuilder {
    private static let minDate = Date(timeIntervalSince1970: 946_684_800) // 2000-01-01T00:00:00Z

    public static func build(
        folders inputFolders: [WorkoutFolderDto],
        unfiledTemplates: [WorkoutTemplateDto],
        historySessions: [WorkoutSessionDto],
        catalog: [ExerciseDto],
        customExercises inputCustom: [ExerciseDto],
        sourceApp: String,
        exportedAt: Date = Date(),
        now: Date = Date()
    ) -> ImportFile {
        var customById: [String: ExerciseDto] = [:]
        var customOrder: [ExerciseDto] = []
        for ex in inputCustom + catalog where !ex.isSystem && customById[ex.id] == nil {
            customById[ex.id] = ex
            customOrder.append(ex)
        }
        let systemById = Dictionary(catalog.filter(\.isSystem).map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })

        let customExercises = customOrder.prefix(1_000).map { ex in
            let steps = ex.instructions.map { clip($0, 1000) }.filter { !$0.isEmpty }
            return ImportCustomExercise(
                key: ex.id,
                name: clip(ex.name, 120).nonEmpty ?? "Exercise",
                primaryMuscleGroup: ex.primaryMuscleGroup,
                equipment: ex.equipment,
                exerciseType: ex.exerciseType,
                movementPattern: ex.movementPattern,
                laterality: ex.laterality,
                description: clip(ex.description, 2000).nonEmpty,
                instructions: steps.isEmpty ? nil : Array(steps.prefix(30))
            )
        }
        let exportedCustomKeys = Set(customExercises.map(\.key))
        func resolve(_ id: String?, embedded: ExerciseDto? = nil) -> ImportExerciseRef? {
            guard let id else { return nil }
            if customById[id] != nil { return exportedCustomKeys.contains(id) ? .custom(id) : nil }
            if let slug = systemById[id]?.slug ?? (embedded?.isSystem == true ? embedded?.slug : nil) {
                return .slug(slug)
            }
            return nil
        }

        let folders = Array(inputFolders.prefix(200))
        let folderKeys = Set(folders.map(\.id))
        let allTemplates = (folders.flatMap(\.templates) + unfiledTemplates).prefix(2_000)
        let templates: [ImportTemplate] = allTemplates.map { t in
            let exercises: [ImportTemplateExercise] = t.exercises.compactMap { te in
                guard let exercise = resolve(te.exerciseId, embedded: te.exercise) else { return nil }
                let alternatives = Array(te.alternativeExerciseIds.compactMap { resolve($0) }.prefix(20))
                return ImportTemplateExercise(
                    exercise: exercise,
                    orderIndex: clamp(te.orderIndex, 0, 1_000),
                    sets: TemplateSets.resolve(te).prefix(40).map {
                        ImportTemplateSet(
                            setType: $0.setType,
                            weight: inRange($0.weight, 0, 1500),
                            reps: inRange($0.reps, 0, 200),
                            durationSeconds: inRange($0.durationSeconds, 0, 14_400)
                        )
                    },
                    restSeconds: clamp(te.restSeconds, 0, 900),
                    alternativeExercises: alternatives.isEmpty ? nil : alternatives
                )
            }
            return ImportTemplate(
                key: t.id,
                folderKey: t.folderId.flatMap { folderKeys.contains($0) ? $0 : nil },
                name: clip(t.name, 100).nonEmpty ?? "Workout",
                description: clip(t.description, 500).nonEmpty,
                estimatedDurationMinutes: t.estimatedDurationMinutes.flatMap { $0 == 0 ? nil : clamp($0, 5, 360) },
                sortOrder: clamp(t.sortOrder, 0, 100_000),
                exercises: Array(exercises.prefix(60))
            )
        }
        let templateKeys = Set(templates.map(\.key))

        let maxDate = now.addingTimeInterval(24 * 60 * 60)
        func validDate(_ iso: String?) -> Date? {
            guard let date = LukiDate.parseISO(iso), date >= minDate, date <= maxDate else { return nil }
            return date
        }
        let sessions: [ImportSession] = historySessions.compactMap { s in
            guard s.status == .COMPLETED, let started = validDate(s.startedAt),
                  let completed = validDate(s.completedAt), completed >= started else { return nil }
            let exercises: [ImportSessionExercise] = s.exercises.compactMap { ex in
                guard let exercise = resolve(ex.exerciseId) else { return nil }
                return ImportSessionExercise(
                    exercise: exercise,
                    orderIndex: clamp(ex.orderIndex, 0, 1_000),
                    restSeconds: clamp(ex.restSeconds, 0, 1800),
                    sets: ex.sets.prefix(100).enumerated().map { i, set in
                        ImportSessionSet(
                            setNumber: i + 1,
                            setType: set.setType,
                            weight: inRange(set.weight, 0, 1500),
                            weightUnit: set.weightUnit,
                            reps: inRange(set.reps, 0, 1000),
                            durationSeconds: inRange(set.durationSeconds, 0, 86_400),
                            rpe: inRange(set.rpe, 0, 10),
                            completed: set.completed
                        )
                    }
                )
            }
            return ImportSession(
                key: s.id,
                workoutName: clip(s.workoutNameSnapshot, 160).nonEmpty ?? "Workout",
                templateKey: s.templateId.flatMap { templateKeys.contains($0) ? $0 : nil },
                sessionType: s.sessionType,
                startedAt: isoString(started),
                completedAt: isoString(completed),
                activeDurationSeconds: clamp(s.activeDurationSeconds, 0, 86_400),
                notes: clip(s.notes, 2000).nonEmpty,
                exercises: Array(exercises.prefix(100))
            )
        }

        return ImportFile(
            format: ImportFormat.id,
            exportedAt: isoString(exportedAt),
            source: ImportFileSource(app: clip(sourceApp, 60).nonEmpty ?? "LukiFitti"),
            customExercises: customExercises,
            folders: folders.map { f in
                ImportFolder(
                    key: f.id,
                    name: clip(f.name, 80).nonEmpty ?? "Folder",
                    color: f.color.range(of: "^#[0-9A-Fa-f]{6}$", options: .regularExpression) != nil ? f.color : nil,
                    sortOrder: clamp(f.sortOrder, 0, 100_000)
                )
            },
            templates: templates,
            sessions: Array(sessions.prefix(10_000))
        )
    }

    /// Pretty-printed JSON for the backup file.
    public static func encode(_ file: ImportFile) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        return try encoder.encode(file)
    }

    /// `luki-fitti-backup-YYYY-MM-DD.json` (UTC date, like the web export).
    public static func fileName(for date: Date = Date()) -> String {
        "luki-fitti-backup-\(isoString(date).prefix(10)).json"
    }

    private static func isoString(_ date: Date) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.string(from: date)
    }

    private static func clip(_ value: String?, _ max: Int) -> String {
        String((value ?? "").trimmingCharacters(in: .whitespacesAndNewlines).prefix(max))
    }

    private static func clamp(_ value: Int, _ lo: Int, _ hi: Int) -> Int { min(hi, max(lo, value)) }

    private static func inRange(_ value: Double?, _ lo: Double, _ hi: Double) -> Double? {
        guard let value, value.isFinite, value >= lo, value <= hi else { return nil }
        return value
    }

    private static func inRange(_ value: Int?, _ lo: Int, _ hi: Int) -> Int? {
        guard let value, value >= lo, value <= hi else { return nil }
        return value
    }
}

private extension String {
    var nonEmpty: String? { isEmpty ? nil : self }
}
