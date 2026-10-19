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

public enum StarterCatalogLoader {
    public static func load() -> StarterCatalogBundleData {
        if let url = Bundle.module.url(forResource: "starter_catalog", withExtension: "json"),
           let data = try? Data(contentsOf: url),
           let decoded = try? JSONDecoder().decode(StarterCatalogBundleData.self, from: data) {
            return decoded
        }
        return StarterCatalogBundleData(exercises: [], folders: [], stretchingRoutines: [])
    }
}
