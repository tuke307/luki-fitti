import Foundation
import Observation
import LukiFittiModels
import LukiFittiDomain
import LukiFittiAPI

public struct QueuedSessionSyncItem: Codable, Sendable, Equatable, Identifiable {
    public var id: String { clientSessionId }
    public var clientSessionId: String
    public var payload: SyncSessionPayloadDto
    public var queuedAt: String
    public var attempts: Int
    public var lastError: String?
    public var serverConflictSession: WorkoutSessionDto?

    public init(
        clientSessionId: String,
        payload: SyncSessionPayloadDto,
        queuedAt: String = ISO8601DateFormatter().string(from: Date()),
        attempts: Int = 0,
        lastError: String? = nil,
        serverConflictSession: WorkoutSessionDto? = nil
    ) {
        self.clientSessionId = clientSessionId
        self.payload = payload
        self.queuedAt = queuedAt
        self.attempts = attempts
        self.lastError = lastError
        self.serverConflictSession = serverConflictSession
    }
}

@MainActor
@Observable
public final class OfflineStore {
    public var catalog: [ExerciseDto] = []
    public var folders: [WorkoutFolderDto] = []
    public var unfiledTemplates: [WorkoutTemplateDto] = []
    public var stretchingRoutines: [StretchingRoutineDto] = []
    public var activeSession: WorkoutSessionDto?
    public var historySessions: [WorkoutSessionDto] = []
    public var syncQueue: [QueuedSessionSyncItem] = []
    public var syncState: SyncState = .SAVED_LOCALLY
    public var currentUser: UserDto?
    public var preferences: UserPreferencesDto = UserPreferencesDto()
    public var conflictItem: QueuedSessionSyncItem?
    public var onOverviewOrAuthChanged: (() -> Void)?

    private let storageDirectory: URL
    public let apiClient: APIClient

    public init(
        storageDirectory: URL? = nil,
        apiClient: APIClient = APIClient()
    ) {
        if let storageDirectory {
            self.storageDirectory = storageDirectory
        } else {
            let fallbackURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
                .appendingPathComponent("LukiFittiOfflineStore", isDirectory: true)
            self.storageDirectory = fallbackURL
        }
        self.apiClient = apiClient
        try? FileManager.default.createDirectory(at: self.storageDirectory, withIntermediateDirectories: true)
        loadFromDiskOrSeedStarterCatalog()
    }

    public func loadFromDiskOrSeedStarterCatalog() {
        let starter = StarterCatalogLoader.load()

        if let savedCatalog: [ExerciseDto] = readJSON("exercise_catalog.json"), !savedCatalog.isEmpty {
            catalog = savedCatalog
        } else {
            catalog = starter.exercises
            writeJSON(catalog, to: "exercise_catalog.json")
        }

        if let savedOverview: WorkoutsOverviewDto = readJSON("workouts_overview.json"), !savedOverview.folders.isEmpty {
            folders = savedOverview.folders
            unfiledTemplates = savedOverview.unfiledTemplates
        } else {
            folders = starter.folders
            unfiledTemplates = []
            writeJSON(WorkoutsOverviewDto(folders: folders, unfiledTemplates: unfiledTemplates), to: "workouts_overview.json")
        }

        if let savedRoutines: [StretchingRoutineDto] = readJSON("stretching_routines.json"), !savedRoutines.isEmpty {
            stretchingRoutines = savedRoutines
        } else {
            stretchingRoutines = starter.stretchingRoutines
            writeJSON(stretchingRoutines, to: "stretching_routines.json")
        }

        activeSession = readJSON("active_workout_session.json")
        historySessions = (readJSON("session_history.json") as [WorkoutSessionDto]? ?? [])
            .filter { $0.status == .COMPLETED }
            .sorted { $0.startedAt > $1.startedAt }
        syncQueue = readJSON("sync_queue.json") ?? []
        if let savedPrefs: UserPreferencesDto = readJSON("user_preferences.json") {
            preferences = savedPrefs
        }
        currentUser = readJSON("current_user.json")
        conflictItem = syncQueue.first(where: { $0.serverConflictSession != nil })
        updateSyncStateBadge()
    }

    public func saveActiveSession(_ session: WorkoutSessionDto?) {
        if let session {
            let recalculated = SessionCalculator.recalculateSessionTotals(session)
            activeSession = recalculated
            writeJSON(recalculated, to: "active_workout_session.json")
        } else {
            activeSession = nil
            deleteFile("active_workout_session.json")
        }
    }

    public func saveHistorySession(_ session: WorkoutSessionDto) {
        guard session.status == .COMPLETED else { return }
        var list = historySessions.filter { $0.clientSessionId != session.clientSessionId }
        list.append(session)
        list.sort { $0.startedAt > $1.startedAt }
        historySessions = list
        writeJSON(historySessions, to: "session_history.json")
    }

    public func deleteHistorySession(clientSessionId: String) {
        historySessions.removeAll { $0.clientSessionId == clientSessionId || $0.id == clientSessionId }
        syncQueue.removeAll { $0.clientSessionId == clientSessionId }
        writeJSON(historySessions, to: "session_history.json")
        writeJSON(syncQueue, to: "sync_queue.json")
        updateSyncStateBadge()
    }

    @discardableResult
    public func enqueueSessionSync(_ session: WorkoutSessionDto, forceOverwrite: Bool = false) -> QueuedSessionSyncItem {
        let payload = SyncSessionPayloadDto(from: session, forceOverwrite: forceOverwrite)
        let item = QueuedSessionSyncItem(clientSessionId: session.clientSessionId, payload: payload)
        syncQueue.removeAll { $0.clientSessionId == session.clientSessionId }
        syncQueue.append(item)
        writeJSON(syncQueue, to: "sync_queue.json")
        updateSyncStateBadge()
        return item
    }

    public func removeFromSyncQueue(clientSessionId: String) {
        syncQueue.removeAll { $0.clientSessionId == clientSessionId }
        conflictItem = syncQueue.first(where: { $0.serverConflictSession != nil })
        writeJSON(syncQueue, to: "sync_queue.json")
        updateSyncStateBadge()
    }

    public func flushSyncQueue() async {
        guard !syncQueue.isEmpty else {
            updateSyncStateBadge()
            return
        }
        guard await apiClient.isAuthenticated() else {
            syncState = .SAVED_LOCALLY
            return
        }

        syncState = .SYNCING
        var remaining: [QueuedSessionSyncItem] = []

        for var item in syncQueue {
            do {
                let response = try await apiClient.syncSession(item.payload)
                if response.conflictDetected {
                    item.serverConflictSession = response.session
                    item.lastError = "Server conflict v\(response.serverVersion)"
                    remaining.append(item)
                } else {
                    if response.session.status == .COMPLETED {
                        saveHistorySession(response.session)
                    } else if activeSession?.clientSessionId == response.session.clientSessionId {
                        saveActiveSession(response.session)
                    }
                }
            } catch APIClientError.unauthorized {
                syncState = .AUTH_EXPIRED
                remaining.append(item)
            } catch {
                item.attempts += 1
                item.lastError = error.localizedDescription
                remaining.append(item)
            }
        }

        syncQueue = remaining
        conflictItem = syncQueue.first(where: { $0.serverConflictSession != nil })
        writeJSON(syncQueue, to: "sync_queue.json")
        updateSyncStateBadge()
    }

    public func resolveConflict(clientSessionId: String, keepLocal: Bool) async {
        guard let idx = syncQueue.firstIndex(where: { $0.clientSessionId == clientSessionId }) else { return }
        let item = syncQueue[idx]

        if keepLocal {
            var forcedPayload = item.payload
            forcedPayload.forceOverwrite = true
            forcedPayload.version = max(item.payload.version, (item.serverConflictSession?.version ?? 1)) + 1
            syncQueue[idx] = QueuedSessionSyncItem(clientSessionId: clientSessionId, payload: forcedPayload)
            conflictItem = nil
            writeJSON(syncQueue, to: "sync_queue.json")
            await flushSyncQueue()
        } else {
            if let serverSession = item.serverConflictSession {
                if serverSession.status == .COMPLETED {
                    saveHistorySession(serverSession)
                } else {
                    saveActiveSession(serverSession)
                }
            }
            removeFromSyncQueue(clientSessionId: clientSessionId)
        }
    }

    public func clearAllLocalData() {
        for file in [
            "exercise_catalog.json",
            "workouts_overview.json",
            "stretching_routines.json",
            "active_workout_session.json",
            "session_history.json",
            "sync_queue.json",
            "current_user.json",
        ] {
            deleteFile(file)
        }
        deleteFile("current_user.json")
        activeSession = nil
        historySessions = []
        syncQueue = []
        currentUser = nil
        conflictItem = nil
        loadFromDiskOrSeedStarterCatalog()
        onOverviewOrAuthChanged?()
    }

    public func saveWorkoutsOverview(folders: [WorkoutFolderDto], unfiledTemplates: [WorkoutTemplateDto]) {
        self.folders = folders
        self.unfiledTemplates = unfiledTemplates
        writeJSON(WorkoutsOverviewDto(folders: folders, unfiledTemplates: unfiledTemplates), to: "workouts_overview.json")
        onOverviewOrAuthChanged?()
    }

    public func saveStretchingRoutines(_ routines: [StretchingRoutineDto]) {
        self.stretchingRoutines = routines
        writeJSON(routines, to: "stretching_routines.json")
        onOverviewOrAuthChanged?()
    }

    public func saveCatalog(_ exercises: [ExerciseDto]) {
        self.catalog = exercises
        writeJSON(exercises, to: "exercise_catalog.json")
    }

    public func saveAuthenticatedUser(_ user: UserDto) {
        self.currentUser = user
        if let prefs = user.preferences {
            self.preferences = prefs
            writeJSON(prefs, to: "user_preferences.json")
        }
        writeJSON(user, to: "current_user.json")
        updateSyncStateBadge()
        onOverviewOrAuthChanged?()
    }

    public func saveHistorySessionsList(_ sessions: [WorkoutSessionDto]) {
        historySessions = sessions
            .filter { $0.status == .COMPLETED }
            .sorted { $0.startedAt > $1.startedAt }
        writeJSON(historySessions, to: "session_history.json")
    }

    public func refreshFromServerAfterAuth() async {
        await flushSyncQueue()
        if let serverExercises = try? await apiClient.fetchExercises(), !serverExercises.isEmpty {
            var mergedById = Dictionary(uniqueKeysWithValues: catalog.map { ($0.id, $0) })
            for ex in serverExercises {
                mergedById[ex.id] = ex
            }
            let mergedList = Array(mergedById.values).sorted { $0.name < $1.name }
            saveCatalog(mergedList)
        }
        if let overview = try? await apiClient.fetchWorkoutsOverview() {
            saveWorkoutsOverview(folders: overview.folders, unfiledTemplates: overview.unfiledTemplates)
            // Ensure any exercise embedded in user templates is also in the local catalog
            var mergedById = Dictionary(uniqueKeysWithValues: catalog.map { ($0.id, $0) })
            var addedAny = false
            for folder in overview.folders {
                for tpl in folder.templates {
                    for te in tpl.exercises {
                        if let ex = te.exercise, mergedById[ex.id] == nil {
                            mergedById[ex.id] = ex
                            addedAny = true
                        }
                    }
                }
            }
            if addedAny {
                saveCatalog(Array(mergedById.values).sorted { $0.name < $1.name })
            }
        }
        if let routines = try? await apiClient.fetchStretchingRoutines(), !routines.isEmpty {
            saveStretchingRoutines(routines)
        }
        if let sessions = try? await apiClient.fetchSessions() {
            let completed = sessions.filter { $0.status == .COMPLETED }.sorted { $0.startedAt > $1.startedAt }
            if !completed.isEmpty {
                historySessions = completed
                writeJSON(historySessions, to: "session_history.json")
            }
        }
        updateSyncStateBadge()
        onOverviewOrAuthChanged?()
    }

    private func updateSyncStateBadge() {
        if conflictItem != nil {
            syncState = .CONFLICT
        } else if !syncQueue.isEmpty {
            syncState = .SAVED_LOCALLY
        } else {
            syncState = .SYNCED
        }
    }

    private func fileURL(_ name: String) -> URL {
        storageDirectory.appendingPathComponent(name)
    }

    private func readJSON<T: Decodable>(_ name: String) -> T? {
        let url = fileURL(name)
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    private func writeJSON<T: Encodable>(_ value: T, to name: String) {
        let url = fileURL(name)
        guard let data = try? JSONEncoder().encode(value) else { return }
        try? data.write(to: url, options: .atomic)
    }

    private func deleteFile(_ name: String) {
        try? FileManager.default.removeItem(at: fileURL(name))
    }
}
