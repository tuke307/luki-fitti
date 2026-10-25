import Foundation

public struct StarterCatalogBundleData: Codable, Sendable {
    public var exercises: [ExerciseDto]
    public var folders: [WorkoutFolderDto]
    public var stretchingRoutines: [StretchingRoutineDto]

    public init(
        exercises: [ExerciseDto],
        folders: [WorkoutFolderDto],
        stretchingRoutines: [StretchingRoutineDto]
    ) {
        self.exercises = exercises
        self.folders = folders
        self.stretchingRoutines = stretchingRoutines
    }
}

/// Loads the bundled starter catalog. `starter_catalog.json` is generated from the shared catalog
/// (`yarn workspace @luki-fitti/apple catalog:export`) and holds one entry per supported locale.
public enum StarterCatalogLoader {
    public static func load(locale: SupportedLocale = .en) -> StarterCatalogBundleData {
        if let url = Bundle.module.url(forResource: "starter_catalog", withExtension: "json"),
           let data = try? Data(contentsOf: url),
           let byLocale = try? JSONDecoder().decode([String: StarterCatalogBundleData].self, from: data),
           let catalog = byLocale[locale.rawValue] ?? byLocale[SupportedLocale.en.rawValue] {
            return catalog
        }
        return StarterCatalogBundleData(exercises: [], folders: [], stretchingRoutines: [])
    }
}
