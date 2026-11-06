import Foundation
import os
import LukiFittiModels
import LukiFittiAPI

private let customLibraryLog = Logger(subsystem: "LukiFitti", category: "CustomLibrarySync")

/// Custom exercises and stretching routines not on the server yet. Exercises and routines created
/// on this device carry a local id until the server returns its own; edits and deletes of server
/// routines are remembered by id. Guests never flush, so everything stays on the device.
public struct CustomLibraryOutbox: Codable, Sendable, Equatable {
    public var dirtyRoutineIds: [String] = []
    public var deletedRoutineIds: [String] = []
    /// Local ids the server rejected (validation): kept on this device, never retried.
    public var rejectedIds: [String] = []

    public init() {}

    public static let exercisePrefix = "local-exercise-"
    public static let routinePrefix = "local-routine-"

    public static func isLocalExerciseId(_ id: String) -> Bool { id.hasPrefix(exercisePrefix) }
    public static func isLocalRoutineId(_ id: String) -> Bool { id.hasPrefix(routinePrefix) }
    public static func newExerciseId() -> String { exercisePrefix + UUID().uuidString.lowercased() }
    public static func newRoutineId() -> String { routinePrefix + UUID().uuidString.lowercased() }

    public var isEmpty: Bool { dirtyRoutineIds.isEmpty && deletedRoutineIds.isEmpty }

    /// The server's routines with this device's pending changes on top: deleted ones stay gone,
    /// edited ones keep the local copy and routines created here (not uploaded yet) are kept.
    public func overlay(server: [StretchingRoutineDto], local: [StretchingRoutineDto]) -> [StretchingRoutineDto] {
        let deleted = Set(deletedRoutineIds)
        let dirty = Set(dirtyRoutineIds)
        let localById = Dictionary(local.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let merged = server
            .filter { !deleted.contains($0.id) }
            .map { dirty.contains($0.id) ? (localById[$0.id] ?? $0) : $0 }
        return merged + local.filter { Self.isLocalRoutineId($0.id) }
    }
}

extension OfflineStore {
    // MARK: - Mutations

    /// Adds a custom exercise under a new local id (uploaded on the next sync when signed in).
    @discardableResult
    public func createCustomExercise(_ draft: ExerciseDto) -> ExerciseDto {
        var exercise = draft
        exercise.id = CustomLibraryOutbox.newExerciseId()
        exercise.slug = exercise.id
        exercise.userId = currentUser?.id ?? "local-user"
        exercise.isSystem = false
        exercise.alternativeExerciseIds = []
        saveCatalog(catalog + [exercise])
        updateSyncStateBadge()
        return exercise
    }

    /// Creates (unknown id) or replaces a stretching routine. The duration is recomputed from its
    /// steps, like the web.
    @discardableResult
    public func saveStretchingRoutine(_ routine: StretchingRoutineDto) -> StretchingRoutineDto {
        var next = routine
        let now = ISO8601DateFormatter().string(from: Date())
        let isNew = !stretchingRoutines.contains { $0.id == routine.id }
        if isNew {
            next.id = CustomLibraryOutbox.newRoutineId()
            next.userId = currentUser?.id ?? "local-user"
            next.createdAt = now
        }
        next.updatedAt = now
        next.exercises = next.exercises.enumerated().map { idx, item in
            var copy = item
            copy.routineId = next.id
            copy.orderIndex = idx
            copy.exercise = copy.exercise ?? catalog.first { $0.id == item.exerciseId }
            return copy
        }
        next.estimatedDurationSeconds = max(30, StretchingRoutineDto.estimatedSeconds(next.exercises))
        var list = stretchingRoutines
        if let idx = list.firstIndex(where: { $0.id == next.id }) { list[idx] = next } else { list.append(next) }
        saveStretchingRoutines(list)
        if !CustomLibraryOutbox.isLocalRoutineId(next.id), !libraryOutbox.dirtyRoutineIds.contains(next.id) {
            updateLibraryOutbox { $0.dirtyRoutineIds.append(next.id) }
        }
        updateSyncStateBadge()
        return next
    }

    public func deleteStretchingRoutine(id: String) {
        guard stretchingRoutines.contains(where: { $0.id == id }) else { return }
        saveStretchingRoutines(stretchingRoutines.filter { $0.id != id })
        updateLibraryOutbox { outbox in
            outbox.dirtyRoutineIds.removeAll { $0 == id }
            outbox.rejectedIds.removeAll { $0 == id }
            if !CustomLibraryOutbox.isLocalRoutineId(id), !outbox.deletedRoutineIds.contains(id) {
                outbox.deletedRoutineIds.append(id)
            }
        }
        updateSyncStateBadge()
    }

    /// Custom exercises and routine changes waiting for the server (0 for guests).
    public var customLibraryPendingCount: Int {
        guard currentUser != nil else { return 0 }
        let rejected = Set(libraryOutbox.rejectedIds)
        let exercises = catalog.filter { CustomLibraryOutbox.isLocalExerciseId($0.id) && !rejected.contains($0.id) }.count
        let routines = stretchingRoutines.filter { CustomLibraryOutbox.isLocalRoutineId($0.id) && !rejected.contains($0.id) }.count
        return exercises + routines + libraryOutbox.dirtyRoutineIds.count + libraryOutbox.deletedRoutineIds.count
    }

    /// Server routines with this device's pending routine changes kept.
    public func applyServerStretchingRoutines(_ routines: [StretchingRoutineDto]) {
        saveStretchingRoutines(libraryOutbox.overlay(server: routines, local: stretchingRoutines))
    }

    func updateLibraryOutbox(_ change: (inout CustomLibraryOutbox) -> Void) {
        var next = libraryOutbox
        change(&next)
        libraryOutbox = next
        writeJSON(next, to: "custom_library_outbox.json")
    }

    // MARK: - Flush

    /// Uploads custom exercises first (routines and workouts may use them, so their local ids are
    /// swapped for the server's everywhere), then routine deletes, creates and edits. Stops when
    /// offline, signed out or on a server error; a rejected item stays local and isn't retried.
    public func flushCustomLibrary() async {
        #if os(watchOS)
        return
        #else
        guard currentUser != nil, apiClient.isAuthenticated(), !isFlushingCustomLibrary else { return }
        isFlushingCustomLibrary = true
        defer {
            isFlushingCustomLibrary = false
            updateSyncStateBadge()
        }

        let rejected = { Set(self.libraryOutbox.rejectedIds) }
        for exercise in catalog where CustomLibraryOutbox.isLocalExerciseId(exercise.id) && !rejected().contains(exercise.id) {
            do {
                let created = try await apiClient.createExercise(CreateExerciseBodyDto(from: exercise))
                replaceLocalExercise(exercise.id, with: created)
            } catch {
                if !handleLibraryError(error, id: exercise.id) { return }
            }
        }

        for id in libraryOutbox.deletedRoutineIds {
            do {
                try await apiClient.deleteStretchingRoutine(id: id)
            } catch APIClientError.decodingError {
                // 2xx with an unexpected body: deleted.
            } catch where Self.libraryStatus(of: error) == 404 {
                // Already gone.
            } catch {
                if !handleLibraryError(error, id: nil) { return }
            }
            updateLibraryOutbox { $0.deletedRoutineIds.removeAll { $0 == id } }
        }

        let pendingExercises = Set(catalog.map(\.id).filter(CustomLibraryOutbox.isLocalExerciseId))
        let pendingRoutines = stretchingRoutines.filter {
            (CustomLibraryOutbox.isLocalRoutineId($0.id) || libraryOutbox.dirtyRoutineIds.contains($0.id))
                && !rejected().contains($0.id)
                // Waits until every custom exercise it uses is on the server.
                && !$0.exercises.contains { pendingExercises.contains($0.exerciseId) }
        }
        for routine in pendingRoutines {
            let body = StretchingRoutineUpsertDto(from: routine)
            do {
                let saved: StretchingRoutineDto
                if CustomLibraryOutbox.isLocalRoutineId(routine.id) {
                    saved = try await apiClient.createStretchingRoutine(body)
                } else {
                    do {
                        saved = try await apiClient.updateStretchingRoutine(id: routine.id, body)
                    } catch where Self.libraryStatus(of: error) == 404 {
                        saved = try await apiClient.createStretchingRoutine(body)
                    }
                }
                replaceRoutine(routine.id, with: saved)
            } catch {
                if !handleLibraryError(error, id: routine.id) { return }
            }
        }
        #endif
    }

    /// `false` stops the flush (offline, signed out, server trouble); otherwise the item is given up.
    private func handleLibraryError(_ error: Error, id: String?) -> Bool {
        let status = Self.libraryStatus(of: error)
        if status == 401 {
            syncState = .AUTH_EXPIRED
            return false
        }
        if case APIClientError.offline = error { return false }
        if let status, status >= 500 || status == 408 || status == 429 { return false }
        if let id {
            updateLibraryOutbox { outbox in
                outbox.dirtyRoutineIds.removeAll { $0 == id }
                if CustomLibraryOutbox.isLocalExerciseId(id) || CustomLibraryOutbox.isLocalRoutineId(id),
                   !outbox.rejectedIds.contains(id) {
                    outbox.rejectedIds.append(id)
                }
            }
        }
        customLibraryLog.error("Dropped custom library change: \(error.localizedDescription, privacy: .public)")
        return true
    }

    private static func libraryStatus(of error: Error) -> Int? {
        switch error as? APIClientError {
        case .serverError(let status, _): return status
        case .forbidden, .aiKeyRequired: return 403
        case .unauthorized: return 401
        default: return nil
        }
    }

    private func replaceRoutine(_ id: String, with saved: StretchingRoutineDto) {
        var list = stretchingRoutines
        if let idx = list.firstIndex(where: { $0.id == id }) { list[idx] = saved } else { list.append(saved) }
        saveStretchingRoutines(list)
        updateLibraryOutbox { $0.dirtyRoutineIds.removeAll { $0 == id || $0 == saved.id } }
    }

    /// Swaps a local exercise id for the server's in the catalog, routines and workouts.
    private func replaceLocalExercise(_ localId: String, with created: ExerciseDto) {
        saveCatalog(catalog.map { $0.id == localId ? created : $0 })

        var dirty: [String] = []
        let routines = stretchingRoutines.map { routine -> StretchingRoutineDto in
            guard routine.exercises.contains(where: { $0.exerciseId == localId }) else { return routine }
            var copy = routine
            copy.exercises = routine.exercises.map { item in
                guard item.exerciseId == localId else { return item }
                var next = item
                next.exerciseId = created.id
                next.exercise = created
                return next
            }
            if !CustomLibraryOutbox.isLocalRoutineId(routine.id) { dirty.append(routine.id) }
            return copy
        }
        saveStretchingRoutines(routines)
        if !dirty.isEmpty {
            updateLibraryOutbox { outbox in
                for id in dirty where !outbox.dirtyRoutineIds.contains(id) { outbox.dirtyRoutineIds.append(id) }
            }
        }

        var ops: [WorkoutOutboxOp] = []
        func remap(_ template: WorkoutTemplateDto) -> WorkoutTemplateDto {
            guard template.exercises.contains(where: { $0.exerciseId == localId || $0.alternativeExerciseIds.contains(localId) })
            else { return template }
            var copy = template
            copy.exercises = template.exercises.map { item in
                var next = item
                if next.exerciseId == localId {
                    next.exerciseId = created.id
                    next.exercise = created
                }
                next.alternativeExerciseIds = next.alternativeExerciseIds.map { $0 == localId ? created.id : $0 }
                return next
            }
            ops.append(.upsert(copy))
            return copy
        }
        let folders = self.folders.map { folder -> WorkoutFolderDto in
            var copy = folder
            copy.templates = folder.templates.map(remap)
            return copy
        }
        let unfiled = unfiledTemplates.map(remap)
        if !ops.isEmpty {
            commitWorkouts(WorkoutsOverviewDto(folders: folders, unfiledTemplates: unfiled), ops: ops)
        }
    }
}
