import Foundation

/// Data shared with the TypeScript exercise search and catalog, generated into
/// `exercise_search.json` by `yarn workspace @luki-fitti/apple catalog:export`.
public struct ExerciseSearchData: Codable, Sendable {
    public struct Phrase: Codable, Sendable {
        public var pattern: String
        public var replacement: String
    }

    public var phrases: [Phrase]
    public var synonyms: [String: [String]]
    /// Canonical equipment words: they count double when scoring.
    public var equipment: [String]
    /// The everyday exercises of the starter workouts, ranked first among equal matches.
    public var coreExerciseIds: [String]
    /// Names in every language, for exercises whose name differs between languages.
    public var exerciseNames: [String: [String]]

    public static let empty = ExerciseSearchData(
        phrases: [], synonyms: [:], equipment: [], coreExerciseIds: [], exerciseNames: [:]
    )

    public static let bundled: ExerciseSearchData = {
        guard let url = Bundle.module.url(forResource: "exercise_search", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let decoded = try? JSONDecoder().decode(ExerciseSearchData.self, from: data) else {
            return .empty
        }
        return decoded
    }()
}
