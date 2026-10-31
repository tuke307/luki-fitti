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
    public var preferences: UserPreferencesDto = UserPreferencesDto() {
        didSet { applyLocaleToAPIClient() }
    }
    public var conflictItem: QueuedSessionSyncItem?
    /// Bumped on every dismissal so observing views recompute suggestions.
    public var dismissedSuggestionsRevision = 0
    public var onOverviewOrAuthChanged: (() -> Void)?
    /// Workouts deleted on this device or its companion (newest last). Their copies on the server,
    /// the other device or in an old sync queue must not bring them back.
    public private(set) var deletedSessionIds: [String] = [] {
        didSet { deletedSessionIdSet = Set(deletedSessionIds) }
    }
    @ObservationIgnored private var deletedSessionIdSet: Set<String> = []
    /// Deleted workouts whose server copy still has to be deleted (retried on every sync).
    public private(set) var pendingServerDeletes: [String] = []
    @ObservationIgnored private var isFlushingDeletes = false
    private static let maxDeletedSessionIds = 500

    private let storageDirectory: URL
    public let apiClient: APIClient
    /// Where this store persists its files; companion stores (e.g. nutrition) share it.
    public var storageDirectoryURL: URL { storageDirectory }

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

    private var locale: SupportedLocale { .resolve(preferences.language) }

    private func applyLocaleToAPIClient() {
        let locale = self.locale
        Task { await apiClient.setLocale(locale) }
    }

    public func loadFromDiskOrSeedStarterCatalog() {
        if let savedPrefs: UserPreferencesDto = readJSON("user_preferences.json") {
            preferences = savedPrefs
        }
        applyLocaleToAPIClient()
        let starter = StarterCatalogLoader.load(locale: locale)

        if let savedCatalog: [ExerciseDto] = readJSON("exercise_catalog.json"), !savedCatalog.isEmpty {
            // Exercises bundled with a newer app version are added to the saved catalog.
            let known = Set(savedCatalog.map(\.id))
            catalog = savedCatalog + starter.exercises.filter { !known.contains($0.id) }
            if catalog.count != savedCatalog.count { writeJSON(catalog, to: "exercise_catalog.json") }
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
        focusedExerciseIds = readJSON("focused_exercises.json") ?? [:]
        deletedSessionIds = readJSON("deleted_sessions.json") ?? []
        pendingServerDeletes = readJSON("pending_session_deletes.json") ?? []
        historySessions = (readJSON("session_history.json") as [WorkoutSessionDto]? ?? [])
            .filter { $0.status == .COMPLETED && !isDeleted($0) }
            .sorted { $0.startedAt > $1.startedAt }
        syncQueue = readJSON("sync_queue.json") ?? []
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
        guard session.status == .COMPLETED, !isDeleted(session) else { return }
        var list = historySessions.filter { $0.clientSessionId != session.clientSessionId }
        list.append(session)
        list.sort { $0.startedAt > $1.startedAt }
        historySessions = list
        writeJSON(historySessions, to: "session_history.json")
    }

    /// Whether the workout was deleted here or on the companion device.
    public func isDeleted(clientSessionId: String) -> Bool {
        deletedSessionIdSet.contains(clientSessionId)
    }

    private func isDeleted(_ session: WorkoutSessionDto) -> Bool {
        deletedSessionIdSet.contains(session.clientSessionId) || deletedSessionIdSet.contains(session.id)
    }

    /// Deletes a finished workout everywhere: it is remembered as deleted so no copy brings it back,
    /// and with `deleteOnServer` its server copy is deleted on the next sync (retried until done).
    /// Pass `deleteOnServer: false` when the companion device already takes care of the server.
    public func deleteHistorySession(clientSessionId: String, deleteOnServer: Bool = true) {
        deleteHistorySessions(clientSessionIds: [clientSessionId], deleteOnServer: deleteOnServer)
    }

    public func deleteHistorySessions(clientSessionIds: [String], deleteOnServer: Bool = true) {
        let requested = Set(clientSessionIds)
        guard !requested.isEmpty else { return }
        let matched = historySessions.filter { requested.contains($0.clientSessionId) || requested.contains($0.id) }
        var ids = clientSessionIds
        for session in matched where !requested.contains(session.clientSessionId) {
            ids.append(session.clientSessionId)
        }
        let removed = Set(ids)

        let newIds = ids.filter { !deletedSessionIdSet.contains($0) }
        if !newIds.isEmpty {
            var unique: [String] = []
            for id in newIds where !unique.contains(id) { unique.append(id) }
            deletedSessionIds = Array((deletedSessionIds + unique).suffix(Self.maxDeletedSessionIds))
            writeJSON(deletedSessionIds, to: "deleted_sessions.json")
        }
        if deleteOnServer {
            var added = false
            // The id goes into the request path, so only plain ids (UUIDs, cuids) are sent.
            for id in ids where Self.isPlainSessionId(id) && !pendingServerDeletes.contains(id) {
                pendingServerDeletes.append(id)
                added = true
            }
            if added {
                pendingServerDeletes = Array(pendingServerDeletes.suffix(Self.maxDeletedSessionIds))
                writeJSON(pendingServerDeletes, to: "pending_session_deletes.json")
            }
        }

        historySessions.removeAll { removed.contains($0.clientSessionId) || removed.contains($0.id) }
        syncQueue.removeAll { removed.contains($0.clientSessionId) }
        conflictItem = syncQueue.first(where: { $0.serverConflictSession != nil })
        writeJSON(historySessions, to: "session_history.json")
        writeJSON(syncQueue, to: "sync_queue.json")
        updateSyncStateBadge()
    }

    private static func isPlainSessionId(_ id: String) -> Bool {
        !id.isEmpty && id.count <= 128 && id.unicodeScalars.allSatisfy {
            ($0.isASCII && CharacterSet.alphanumerics.contains($0)) || $0 == "-" || $0 == "_"
        }
    }

    /// Deletes the server copies of deleted workouts. Ids that fail (offline, server error) stay
    /// queued for the next sync; "not found" counts as deleted.
    public func flushPendingDeletes() async {
        guard !pendingServerDeletes.isEmpty, !isFlushingDeletes, apiClient.isAuthenticated() else { return }
        isFlushingDeletes = true
        defer { isFlushingDeletes = false }

        let snapshot = pendingServerDeletes
        var done: Set<String> = []
        for id in snapshot {
            do {
                try await apiClient.deleteSession(sessionId: id)
                done.insert(id)
            } catch APIClientError.decodingError {
                // 2xx with an unexpected body: the session is gone.
                done.insert(id)
            } catch APIClientError.serverError(let status, _) where status == 404 || status == 410 {
                // Already gone (or never uploaded).
                done.insert(id)
            } catch APIClientError.forbidden {
                // Not this account's workout: retrying can't succeed.
                done.insert(id)
            } catch APIClientError.unauthorized {
                // Signed out: keep the rest for after the next sign-in.
                break
            } catch {
                continue
            }
        }
        // Ids added while this ran are kept as well.
        pendingServerDeletes.removeAll { done.contains($0) }
        writeJSON(pendingServerDeletes, to: "pending_session_deletes.json")
    }

    @discardableResult
    public func enqueueSessionSync(_ session: WorkoutSessionDto, forceOverwrite: Bool = false) -> QueuedSessionSyncItem {
        let payload = SyncSessionPayloadDto(from: session, forceOverwrite: forceOverwrite)
        let item = QueuedSessionSyncItem(clientSessionId: session.clientSessionId, payload: payload)
        guard !isDeleted(session) else { return item }
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
        await flushPendingDeletes()
        guard !syncQueue.isEmpty else {
            updateSyncStateBadge()
            return
        }
        guard apiClient.isAuthenticated() else {
            updateSyncStateBadge()
            return
        }

        syncState = .SYNCING
        let pendingBeforeUpload = Set(pendingServerDeletes)
        var remaining: [QueuedSessionSyncItem] = []
        var serverVersions = acknowledgedServerVersions()

        for var item in syncQueue {
            if isDeleted(clientSessionId: item.clientSessionId) { continue }
            do {
                var payload = item.payload
                payload.deviceId = deviceId
                payload.baseVersion = serverVersions[item.clientSessionId]
                let response = try await apiClient.syncSession(payload)
                if isDeleted(response.session) || isDeleted(clientSessionId: item.clientSessionId) {
                    // Deleted while uploading: the queued server delete removes the new copy.
                    serverVersions[item.clientSessionId] = nil
                } else if response.conflictDetected {
                    item.serverConflictSession = response.session
                    item.lastError = "Server conflict v\(response.serverVersion)"
                    remaining.append(item)
                } else {
                    serverVersions[item.clientSessionId] =
                        response.session.status == .COMPLETED ? nil : response.serverVersion
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

        syncQueue = remaining.filter { !isDeleted(clientSessionId: $0.clientSessionId) }
        conflictItem = syncQueue.first(where: { $0.serverConflictSession != nil })
        writeJSON(syncQueue, to: "sync_queue.json")
        writeJSON(serverVersions, to: "server_versions.json")
        updateSyncStateBadge()
        // A workout deleted while the queue was uploading may just have been re-created.
        if pendingServerDeletes.contains(where: { !pendingBeforeUpload.contains($0) }) {
            await flushPendingDeletes()
        }
    }

    /// Stable random id of this install. Survives `clearAllLocalData` on purpose so the server can
    /// keep recognising retried syncs from this device.
    public var deviceId: String {
        if let existing: String = readJSON("device_id.json") { return existing }
        let id = "ios-\(UUID().uuidString.lowercased())"
        writeJSON(id, to: "device_id.json")
        return id
    }

    /// Suggestions dismissed per workout session, so they stay gone when the session view reloads.
    public func dismissedSuggestions(clientSessionId: String) -> [DismissedWorkoutSuggestion] {
        let map: [String: [DismissedWorkoutSuggestion]] = readJSON("dismissed_suggestions.json") ?? [:]
        return map[clientSessionId] ?? []
    }

    public func setDismissedSuggestions(_ dismissed: [DismissedWorkoutSuggestion]?, clientSessionId: String) {
        var map: [String: [DismissedWorkoutSuggestion]] = readJSON("dismissed_suggestions.json") ?? [:]
        map[clientSessionId] = dismissed
        writeJSON(map, to: "dismissed_suggestions.json")
        dismissedSuggestionsRevision += 1
    }

    /// Exercise last opened per workout session, so returning to the workout reopens it. Kept in
    /// memory so views observe changes; resolve with `SessionCalculator.resolveFocusedExerciseIndex`.
    public private(set) var focusedExerciseIds: [String: String] = [:]

    public func setFocusedExerciseId(_ clientExerciseId: String?, clientSessionId: String) {
        guard focusedExerciseIds[clientSessionId] != clientExerciseId else { return }
        focusedExerciseIds[clientSessionId] = clientExerciseId
        writeJSON(focusedExerciseIds, to: "focused_exercises.json")
    }

    private func acknowledgedServerVersions() -> [String: Int] {
        readJSON("server_versions.json") ?? [:]
    }

    private func acknowledgeServerVersion(_ session: WorkoutSessionDto) {
        var versions = acknowledgedServerVersions()
        versions[session.clientSessionId] = session.version
        writeJSON(versions, to: "server_versions.json")
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
                    acknowledgeServerVersion(serverSession)
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
            "server_versions.json",
            "dismissed_suggestions.json",
            "focused_exercises.json",
            "current_user.json",
            "deleted_sessions.json",
            "pending_session_deletes.json",
        ] {
            deleteFile(file)
        }
        deleteFile("current_user.json")
        activeSession = nil
        historySessions = []
        syncQueue = []
        deletedSessionIds = []
        pendingServerDeletes = []
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

    /// Persists preferences changed on this device (e.g. for guests, or before the server answers).
    public func savePreferences(_ prefs: UserPreferencesDto) {
        preferences = prefs
        writeJSON(prefs, to: "user_preferences.json")
    }

    public func saveHistorySessionsList(_ sessions: [WorkoutSessionDto]) {
        historySessions = sessions
            .filter { $0.status == .COMPLETED && !isDeleted($0) }
            .sorted { $0.startedAt > $1.startedAt }
        writeJSON(historySessions, to: "session_history.json")
    }

    /// Replaces the history with an authoritative list (the server's, or the iPhone's on the
    /// Watch) – even an empty one, so deletions elsewhere arrive here. Finished workouts that are
    /// still waiting in this device's sync queue are kept (local copy wins) so nothing recorded
    /// offline is lost.
    public func replaceHistoryKeepingUnsynced(with sessions: [WorkoutSessionDto]) {
        let queuedIds = Set(syncQueue.map(\.clientSessionId))
        let unsynced = historySessions.filter { queuedIds.contains($0.clientSessionId) }
        let unsyncedIds = Set(unsynced.map(\.clientSessionId))
        saveHistorySessionsList(sessions.filter { !unsyncedIds.contains($0.clientSessionId) } + unsynced)
    }

    public func refreshFromServerAfterAuth() async {
        // Also sends the pending server deletes first, so deleted workouts aren't downloaded again.
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
            // Deleted workouts whose server delete hasn't gone through yet are filtered here.
            replaceHistoryKeepingUnsynced(with: sessions)
        }
        updateSyncStateBadge()
        onOverviewOrAuthChanged?()
    }

    /// Signed in on this device, but the server rejected the session and the tokens are gone:
    /// nothing can sync until the user signs in again (local data is kept).
    public var needsReauthentication: Bool {
        currentUser != nil && !apiClient.isAuthenticated()
    }

    private func updateSyncStateBadge() {
        if needsReauthentication {
            syncState = .AUTH_EXPIRED
        } else if conflictItem != nil {
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
