import Foundation
import LukiFittiModels

/// Custom exercises and stretching routines: saved on this device right away; signed-in users
/// also upload them (retried on every sync until the server has them).
extension LukiAppViewModel {
    @discardableResult
    func createCustomExercise(_ draft: ExerciseDto) -> ExerciseDto {
        let exercise = store.createCustomExercise(draft)
        uploadCustomLibrary()
        return exercise
    }

    func saveStretchingRoutine(_ routine: StretchingRoutineDto) {
        store.saveStretchingRoutine(routine)
        uploadCustomLibrary()
    }

    func deleteStretchingRoutine(id: String) {
        store.deleteStretchingRoutine(id: id)
        uploadCustomLibrary()
    }

    private func uploadCustomLibrary() {
        guard isSignedIn else { return }
        Task { await store.flushSyncQueue() }
    }
}
