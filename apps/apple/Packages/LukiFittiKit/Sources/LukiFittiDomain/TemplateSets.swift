import Foundation
import LukiFittiModels

/// Per-set template plans and the session → template write-back.
/// Mirrors `template-sets.util.ts` in @luki-fitti/common.
public enum TemplateSets {
    private static let defaultRestSeconds = 90

    /// Explicit plan, or warm-up + working sets expanded from the summary values.
    public static func resolve(_ te: WorkoutTemplateExerciseDto) -> [TemplateSetDto] {
        if let sets = te.sets, !sets.isEmpty { return sets }
        let reps = te.targetRepsMin ?? 10
        let warmupWeight = te.targetWeight.map { (($0 * 0.6) * 2.0).rounded() / 2.0 } ?? 20.0
        let warmups = (0..<max(0, te.warmupSets)).map { _ in
            TemplateSetDto(setType: .WARMUP, weight: warmupWeight, reps: reps)
        }
        let working = (0..<max(1, te.plannedSets)).map { _ in
            TemplateSetDto(setType: .WORKING, weight: te.targetWeight, reps: reps, durationSeconds: te.targetDurationSeconds)
        }
        return warmups + working
    }

    /// Summary values kept for older clients and list previews.
    public static func summarize(_ sets: [TemplateSetDto]) -> (plannedSets: Int, warmupSets: Int, targetWeight: Double?) {
        let warmups = sets.filter { $0.setType == .WARMUP }.count
        let workingWeights = sets.filter { $0.setType == .WORKING }.compactMap(\.weight)
        return (min(30, max(1, sets.count - warmups)), min(10, warmups), workingWeights.max())
    }

    /// The progression rep band derived from the planned sets: the lowest working-set reps open
    /// the band, unless they already fall inside the current one (which then stays put).
    public static func deriveRepRange(_ sets: [TemplateSetDto], currentMin: Int?, currentMax: Int?) -> (min: Int?, max: Int?) {
        let reps = sets
            .filter { $0.setType != .WARMUP && $0.setType != .STRETCH }
            .compactMap(\.reps)
            .filter { $0 > 0 }
        guard let r = reps.min() else { return (currentMin, currentMax) }
        if let currentMin, let currentMax, currentMin <= r, r <= currentMax {
            return (currentMin, currentMax)
        }
        return (r, min(100, r + 4))
    }

    public static func orderWarmupsFirst<T>(_ sets: [T], type: (T) -> SetType) -> [T] {
        sets.filter { type($0) == .WARMUP } + sets.filter { type($0) != .WARMUP }
    }

    /// Applies an explicit plan to a template exercise and refreshes its summary values.
    public static func apply(_ sets: [TemplateSetDto], to te: inout WorkoutTemplateExerciseDto) {
        let summary = summarize(sets)
        te.sets = sets
        te.plannedSets = summary.plannedSets
        te.warmupSets = summary.warmupSets
        te.targetWeight = summary.targetWeight
    }

    /// The next version of a template after a finished workout (see the TypeScript twin for rules).
    /// Returns `nil` when the session belongs to another template or nothing changed.
    public static func buildTemplateExercises(
        template: WorkoutTemplateDto,
        session: WorkoutSessionDto
    ) -> [WorkoutTemplateExerciseDto]? {
        guard session.templateId == template.id, session.status == .COMPLETED else { return nil }

        var used = Set<String>()
        func takeOriginal(_ exerciseId: String?) -> WorkoutTemplateExerciseDto? {
            guard let exerciseId,
                  let found = template.exercises.first(where: { !used.contains($0.id) && $0.exerciseId == exerciseId })
            else { return nil }
            used.insert(found.id)
            return found
        }

        var next: [WorkoutTemplateExerciseDto] = []
        for ex in session.exercises {
            guard let exerciseId = ex.exerciseId else { continue }
            let substituted = ex.origin == .SUBSTITUTED
            let original = (substituted ? takeOriginal(ex.replacedExerciseId) : nil) ?? takeOriginal(exerciseId)
            let didAnySet = ex.sets.contains { $0.completed }

            if !didAnySet && !substituted {
                if var kept = original {
                    kept.orderIndex = next.count
                    next.append(kept)
                }
                continue
            }
            if ex.sets.isEmpty { continue }

            let sets = orderWarmupsFirst(
                ex.sets.map { TemplateSetDto(setType: $0.setType, weight: $0.weight, reps: $0.reps, durationSeconds: $0.durationSeconds) },
                type: \.setType
            )
            let baseAlternatives = original?.alternativeExerciseIds ?? ex.alternativeExerciseIds
            var alternatives: [String] = []
            for id in (substituted ? [ex.replacedExerciseId].compactMap { $0 } : []) + baseAlternatives
            where id != exerciseId && !alternatives.contains(id) {
                alternatives.append(id)
            }

            var entry = WorkoutTemplateExerciseDto(
                id: original?.id ?? "tple-\(UUID().uuidString.lowercased())",
                templateId: template.id,
                exerciseId: exerciseId,
                orderIndex: next.count,
                targetRepsMin: original?.targetRepsMin ?? ex.targetRepsMin,
                targetRepsMax: original?.targetRepsMax ?? ex.targetRepsMax,
                weightUnit: original?.weightUnit ?? session.weightUnit,
                restSeconds: ex.restSeconds,
                targetDurationSeconds: original?.targetDurationSeconds ?? ex.targetDurationSeconds,
                targetDistanceMeters: original?.targetDistanceMeters,
                notes: original?.notes ?? ex.notes,
                alternativeExerciseIds: alternatives,
                exercise: original?.exerciseId == exerciseId ? original?.exercise : nil
            )
            apply(sets, to: &entry)
            next.append(entry)
        }

        if let lastIdx = next.indices.last, next[lastIdx].restSeconds == 0 {
            next[lastIdx].restSeconds = defaultRestSeconds
        }

        let current = template.exercises.sorted { $0.orderIndex < $1.orderIndex }
        func comparable(_ te: WorkoutTemplateExerciseDto) -> String {
            let sets = resolve(te).map { "\($0.setType.rawValue)|\($0.weight ?? -1)|\($0.reps ?? -1)|\($0.durationSeconds ?? -1)" }
            return "\(te.exerciseId)#\(sets.joined(separator: ","))#\(te.restSeconds)#\(te.alternativeExerciseIds.joined(separator: ","))"
        }
        return current.map(comparable) == next.map(comparable) ? nil : next
    }
}
