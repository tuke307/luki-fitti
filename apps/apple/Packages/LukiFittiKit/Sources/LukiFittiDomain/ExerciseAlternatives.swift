import Foundation
import LukiFittiModels

/// Why an exercise was ranked as an alternative; the UI turns these into a short label.
public enum AlternativeReason: String, Sendable, Equatable, Hashable {
    case YOUR_ALTERNATIVE
    case SAME_MOVEMENT
    case SIMILAR_MOVEMENT
    case SAME_MUSCLES
    case SAME_SIDE
    case DONE_BEFORE
    case DIFFERENT_EQUIPMENT
}

public struct RankedAlternative: Sendable, Equatable, Hashable {
    public var exercise: ExerciseDto
    public var score: Double
    /// Strongest first.
    public var reasons: [AlternativeReason]
}

/// Swift port of `packages/common/src/utils/exercise-alternatives.util.ts` — keep both in sync;
/// they are checked against the same cases
/// (`packages/common/src/utils/__fixtures__/alternatives-cases.json`).
///
/// Ranks replacements for an exercise by how closely they match its movement: same (or
/// compatible) movement pattern first, then the regions trained, one or both sides, compound vs
/// isolation, what the user has done before, and a small bonus for different equipment.
/// Exercises without a known movement pattern are left out (they stay reachable through search),
/// except the user's own alternatives.
public enum ExerciseAlternatives {
    /// Patterns that are a weaker but honest replacement for each other.
    static let compatiblePatterns: [(MovementPattern, MovementPattern)] = [
        (.HORIZONTAL_PUSH, .INCLINE_PUSH),
        (.HORIZONTAL_PUSH, .DIP),
        (.SQUAT, .LUNGE),
        (.HIP_THRUST, .HIP_EXTENSION),
        (.HINGE, .BACK_EXTENSION),
        (.LATERAL_RAISE, .UPRIGHT_ROW),
        (.ROTATION, .LATERAL_FLEXION),
        (.CORE_FLEXION, .HIP_FLEXION),
    ]

    /// Score weights, highest first (`ALTERNATIVE_WEIGHTS` in TypeScript).
    enum Weight {
        static let preferred = 40.0
        static let sameMovement = 30.0
        static let similarMovement = 12.0
        static let regionOverlap = 20.0
        static let nameOverlap = 10.0
        static let sameSide = 8.0
        static let doneBefore = 6.0
        static let sameMechanic = 4.0
        static let sameMuscle = 4.0
        static let popular = 4.0
        static let differentEquipment = 2.0
    }

    static let sameMusclesOverlap = 0.5
    static let slugStopWords: Set<String> = ["a", "an", "and", "the", "to", "on", "of", "with", "in", "or"]

    public static func areCompatible(_ a: MovementPattern, _ b: MovementPattern) -> Bool {
        compatiblePatterns.contains { ($0.0 == a && $0.1 == b) || ($0.0 == b && $0.1 == a) }
    }

    /// Ids of exercises the user logged at least one completed set of.
    public static func loggedExerciseIds(_ historySessions: [WorkoutSessionDto]) -> Set<String> {
        var ids = Set<String>()
        for session in historySessions {
            for ex in session.exercises {
                if let id = ex.exerciseId, ex.sets.contains(where: \.completed) { ids.insert(id) }
            }
        }
        return ids
    }

    /// Words of a slug; slugs are English and the same in every language.
    static func slugWords(_ slug: String) -> [String] {
        slug.split(separator: "-").map(String.init).filter { !$0.isEmpty && !slugStopWords.contains($0) }
    }

    static func jaccard<T: Hashable>(_ a: [T], _ b: [T]) -> Double {
        if a.isEmpty || b.isEmpty { return 0 }
        let setA = Set(a)
        let setB = Set(b)
        let shared = setA.intersection(setB).count
        return Double(shared) / Double(setA.count + setB.count - shared)
    }

    public static func rank(
        target: ExerciseDto,
        catalog: [ExerciseDto],
        historySessions: [WorkoutSessionDto] = [],
        excludeIds: Set<String> = [],
        preferredIds: Set<String> = [],
        popularIds: Set<String> = [],
        limit: Int? = nil
    ) -> [RankedAlternative] {
        var exclude = excludeIds
        exclude.insert(target.id)
        let preferred = Set(target.alternativeExerciseIds).union(preferredIds)
        let done = loggedExerciseIds(historySessions)
        let targetPattern = target.movementPattern
        let targetRegions = target.targetRegions ?? []
        let targetWords = slugWords(target.slug)

        var ranked: [(alternative: RankedAlternative, index: Int)] = []
        for (index, candidate) in catalog.enumerated() {
            if exclude.contains(candidate.id) || candidate.exerciseType == .STRETCHING { continue }
            let pattern = candidate.movementPattern
            let samePattern = targetPattern != nil && pattern == targetPattern
            var similarPattern = false
            if !samePattern, let targetPattern, let pattern {
                similarPattern = areCompatible(targetPattern, pattern)
            }
            if !samePattern && !similarPattern && !preferredIds.contains(candidate.id) { continue }

            var reasons: [AlternativeReason] = []
            var score = 0.0
            if preferred.contains(candidate.id) {
                score += Weight.preferred
                reasons.append(.YOUR_ALTERNATIVE)
            }
            if samePattern {
                score += Weight.sameMovement
                reasons.append(.SAME_MOVEMENT)
            } else if similarPattern {
                score += Weight.similarMovement
                reasons.append(.SIMILAR_MOVEMENT)
            }
            let overlap = jaccard(targetRegions, candidate.targetRegions ?? [])
            score += overlap * Weight.regionOverlap
            if overlap >= sameMusclesOverlap { reasons.append(.SAME_MUSCLES) }
            score += jaccard(targetWords, slugWords(candidate.slug)) * Weight.nameOverlap
            if let side = target.laterality, candidate.laterality == side {
                score += Weight.sameSide
                reasons.append(.SAME_SIDE)
            }
            if done.contains(candidate.id) {
                score += Weight.doneBefore
                reasons.append(.DONE_BEFORE)
            }
            if let mechanic = target.mechanic, candidate.mechanic == mechanic { score += Weight.sameMechanic }
            if candidate.primaryMuscleGroup == target.primaryMuscleGroup { score += Weight.sameMuscle }
            if popularIds.contains(candidate.id) { score += Weight.popular }
            if candidate.equipment != target.equipment {
                score += Weight.differentEquipment
                reasons.append(.DIFFERENT_EQUIPMENT)
            }
            ranked.append((RankedAlternative(exercise: candidate, score: score, reasons: reasons), index))
        }

        ranked.sort { lhs, rhs in
            lhs.alternative.score != rhs.alternative.score
                ? lhs.alternative.score > rhs.alternative.score
                : lhs.index < rhs.index
        }
        let all = ranked.map(\.alternative)
        guard let limit else { return all }
        return Array(all.prefix(limit))
    }
}
