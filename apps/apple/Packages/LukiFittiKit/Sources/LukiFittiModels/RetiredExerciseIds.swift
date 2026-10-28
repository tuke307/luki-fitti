import Foundation

/// System exercise ids that were merged into another exercise, mapped to that exercise (mirrors
/// `RETIRED_EXERCISE_IDS` in `@luki-fitti/common`). Generated into `retired_exercise_ids.json` by
/// `yarn workspace @luki-fitti/apple catalog:export`. Saved templates, sessions and caches may
/// still reference them.
public enum RetiredExerciseIds {
    public static let bundled: [String: String] = {
        guard let url = Bundle.module.url(forResource: "retired_exercise_ids", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let decoded = try? JSONDecoder().decode([String: String].self, from: data) else {
            return [:]
        }
        return decoded
    }()
}

/// The id that replaces a merged system exercise; other ids are returned unchanged.
public func resolveExerciseId(_ id: String) -> String {
    RetiredExerciseIds.bundled[id] ?? id
}

public func isRetiredExerciseId(_ id: String) -> Bool {
    RetiredExerciseIds.bundled[id] != nil
}
