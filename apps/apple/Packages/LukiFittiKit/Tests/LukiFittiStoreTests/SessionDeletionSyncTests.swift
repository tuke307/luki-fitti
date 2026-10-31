import XCTest
@testable import LukiFittiModels
@testable import LukiFittiAPI
@testable import LukiFittiDomain
@testable import LukiFittiStore
@testable import LukiFittiWatchSync

private final class FakeTokenStore: TokenStoring, @unchecked Sendable {
    var tokens: AuthTokensDto? = AuthTokensDto(
        accessToken: "FAKE-ACCESS", refreshToken: "FAKE-REFRESH", expiresAt: "2099-12-01T00:00:00Z"
    )
    func saveTokens(_ tokens: AuthTokensDto, userId: String?) throws { self.tokens = tokens }
    func loadTokens() -> AuthTokensDto? { tokens }
    func loadUserId() -> String? { nil }
    func clearTokens() { tokens = nil }
}

/// In-memory stand-in for the sessions API (`GET /api/sessions`, `DELETE /api/sessions/:id`).
/// Every other endpoint answers 500, so the store keeps its local data for those.
private final class FakeSessionsServer: @unchecked Sendable {
    private let lock = NSLock()
    private var sessions: [WorkoutSessionDto] = []
    private var deletesFail = false
    private(set) var deleteRequests: [String] = []

    func put(_ session: WorkoutSessionDto) {
        lock.withLock {
            sessions.removeAll { $0.clientSessionId == session.clientSessionId }
            sessions.append(session)
        }
    }

    func setDeletesFail(_ fail: Bool) { lock.withLock { deletesFail = fail } }
    var storedIds: [String] { lock.withLock { sessions.map(\.clientSessionId) } }
    var deleteRequestCount: Int { lock.withLock { deleteRequests.count } }

    func respond(to request: URLRequest) -> (Int, Data) {
        lock.withLock {
            let path = request.url?.path ?? ""
            let method = request.httpMethod ?? "GET"
            if method == "GET", path == "/api/sessions" {
                return (200, (try? JSONEncoder().encode(sessions)) ?? Data("[]".utf8))
            }
            if method == "DELETE", path.hasPrefix("/api/sessions/") {
                let id = String(path.dropFirst("/api/sessions/".count))
                deleteRequests.append(id)
                if deletesFail { return (503, Data(#"{"message":"Unavailable"}"#.utf8)) }
                guard sessions.contains(where: { $0.clientSessionId == id || $0.id == id }) else {
                    return (404, Data(#"{"message":"Not found"}"#.utf8))
                }
                sessions.removeAll { $0.clientSessionId == id || $0.id == id }
                return (200, Data(#"{"success":true}"#.utf8))
            }
            return (500, Data(#"{"message":"Not mocked"}"#.utf8))
        }
    }
}

private final class FakeServerURLProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var servers: [String: FakeSessionsServer] = [:]
    static let lock = NSLock()

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let host = request.url?.host ?? ""
        let server = Self.lock.withLock { Self.servers[host] }
        let (status, body) = server?.respond(to: request) ?? (500, Data())
        let response = HTTPURLResponse(
            url: request.url!, statusCode: status, httpVersion: nil,
            headerFields: ["Content-Type": "application/json"]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

final class SessionDeletionSyncTests: XCTestCase {
    private var directories: [URL] = []

    override func tearDown() {
        for dir in directories { try? FileManager.default.removeItem(at: dir) }
        directories = []
        super.tearDown()
    }

    @MainActor
    private func makeStore(server: FakeSessionsServer) -> OfflineStore {
        let host = "fake-\(UUID().uuidString.lowercased()).test"
        FakeServerURLProtocol.lock.withLock { FakeServerURLProtocol.servers[host] = server }
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [FakeServerURLProtocol.self]
        let client = APIClient(
            baseURL: URL(string: "https://\(host)")!,
            tokenStore: FakeTokenStore(),
            session: URLSession(configuration: config)
        )
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("SessionDeletionSyncTests-\(UUID().uuidString)", isDirectory: true)
        directories.append(dir)
        let store = OfflineStore(storageDirectory: dir, apiClient: client)
        store.saveAuthenticatedUser(UserDto(id: "u1", email: "me@example.com"))
        return store
    }

    @MainActor
    private func completedSession(_ store: OfflineStore, startedAt: String = "2026-05-01T10:00:00Z") throws -> WorkoutSessionDto {
        let template = try XCTUnwrap(store.folders.first?.templates.first)
        var session = SessionCalculator.createOfflineSessionFromTemplate(
            template: template, catalog: store.catalog, userId: "u1", weightUnit: .KG, sourceDevice: .APPLE_WATCH
        )
        session.status = .COMPLETED
        session.startedAt = startedAt
        session.completedAt = startedAt
        return session
    }

    /// Watch workout synced to the server, deleted on the iPhone: the server copy is deleted and a
    /// later refresh (e.g. when the Watch app opens) must not bring it back.
    @MainActor
    func testDeletedSessionIsDeletedOnServerAndNotDownloadedAgain() async throws {
        let server = FakeSessionsServer()
        let store = makeStore(server: server)
        let kept = try completedSession(store, startedAt: "2026-05-01T10:00:00Z")
        let deleted = try completedSession(store, startedAt: "2026-05-02T10:00:00Z")
        server.put(kept)
        server.put(deleted)
        await store.refreshFromServerAfterAuth()
        XCTAssertEqual(Set(store.historySessions.map(\.clientSessionId)), [kept.clientSessionId, deleted.clientSessionId])

        store.deleteHistorySession(clientSessionId: deleted.clientSessionId)
        XCTAssertTrue(store.isDeleted(clientSessionId: deleted.clientSessionId))
        XCTAssertEqual(store.pendingServerDeletes, [deleted.clientSessionId])

        await store.flushSyncQueue()
        XCTAssertEqual(server.storedIds, [kept.clientSessionId])
        XCTAssertTrue(store.pendingServerDeletes.isEmpty)

        // Even if another device re-uploads it, the tombstone keeps it out of the history.
        server.put(deleted)
        await store.refreshFromServerAfterAuth()
        XCTAssertEqual(store.historySessions.map(\.clientSessionId), [kept.clientSessionId])

        // Late copies from the Watch or an old sync queue are ignored too.
        store.saveHistorySession(deleted)
        store.saveHistorySessionsList([kept, deleted])
        store.enqueueSessionSync(deleted)
        XCTAssertEqual(store.historySessions.map(\.clientSessionId), [kept.clientSessionId])
        XCTAssertTrue(store.syncQueue.isEmpty)
    }

    @MainActor
    func testFailedServerDeleteIsRetriedOnNextSync() async throws {
        let server = FakeSessionsServer()
        let store = makeStore(server: server)
        let session = try completedSession(store)
        server.put(session)
        store.saveHistorySession(session)

        server.setDeletesFail(true)
        store.deleteHistorySession(clientSessionId: session.clientSessionId)
        await store.flushSyncQueue()
        XCTAssertEqual(store.pendingServerDeletes, [session.clientSessionId])
        XCTAssertEqual(server.storedIds, [session.clientSessionId])

        // While the server still has it, a refresh must not show it again.
        await store.refreshFromServerAfterAuth()
        XCTAssertTrue(store.historySessions.isEmpty)

        // The queue survives an app restart.
        let reloaded = OfflineStore(storageDirectory: store.storageDirectoryURL, apiClient: store.apiClient)
        XCTAssertEqual(reloaded.pendingServerDeletes, [session.clientSessionId])
        XCTAssertTrue(reloaded.isDeleted(clientSessionId: session.clientSessionId))

        server.setDeletesFail(false)
        await reloaded.flushSyncQueue()
        XCTAssertTrue(reloaded.pendingServerDeletes.isEmpty)
        XCTAssertTrue(server.storedIds.isEmpty)

        // Already gone on the server (404) also counts as done.
        let neverUploaded = try completedSession(reloaded)
        reloaded.saveHistorySession(neverUploaded)
        reloaded.deleteHistorySession(clientSessionId: neverUploaded.clientSessionId)
        await reloaded.flushPendingDeletes()
        XCTAssertTrue(reloaded.pendingServerDeletes.isEmpty)
    }

    @MainActor
    func testDeletingTheLastSessionClearsHistoryAfterRefresh() async throws {
        let server = FakeSessionsServer()
        let iPhone = makeStore(server: server)
        let watch = makeStore(server: server)
        let session = try completedSession(iPhone)
        server.put(session)
        await iPhone.refreshFromServerAfterAuth()
        await watch.refreshFromServerAfterAuth()
        XCTAssertEqual(watch.historySessions.map(\.clientSessionId), [session.clientSessionId])

        iPhone.deleteHistorySession(clientSessionId: session.clientSessionId)
        await iPhone.flushSyncQueue()
        XCTAssertTrue(server.storedIds.isEmpty)

        // The Watch never heard about the delete: the empty server list still clears it.
        await watch.refreshFromServerAfterAuth()
        XCTAssertTrue(watch.historySessions.isEmpty)
        XCTAssertEqual(server.deleteRequestCount, 1)
    }

    @MainActor
    func testUnsyncedLocalSessionIsKeptWhenServerListReplacesHistory() async throws {
        let server = FakeSessionsServer()
        let store = makeStore(server: server)
        let onServer = try completedSession(store, startedAt: "2026-05-01T10:00:00Z")
        let offline = try completedSession(store, startedAt: "2026-05-03T10:00:00Z")
        server.put(onServer)
        // Recorded offline: in history and queued, but the upload fails (the fake has no sync).
        store.saveHistorySession(offline)
        store.enqueueSessionSync(offline)

        await store.refreshFromServerAfterAuth()
        XCTAssertEqual(store.syncQueue.map(\.clientSessionId), [offline.clientSessionId])
        XCTAssertEqual(store.historySessions.map(\.clientSessionId), [offline.clientSessionId, onServer.clientSessionId])

        // Same for an empty authoritative list (e.g. the iPhone context on the Watch).
        store.replaceHistoryKeepingUnsynced(with: [])
        XCTAssertEqual(store.historySessions.map(\.clientSessionId), [offline.clientSessionId])
    }

    @MainActor
    func testRemoteDeletionDoesNotQueueServerDeleteAndSignOutForgetsTombstones() throws {
        let server = FakeSessionsServer()
        let watch = makeStore(server: server)
        let session = try completedSession(watch)
        watch.saveHistorySession(session)
        watch.enqueueSessionSync(session)

        watch.deleteHistorySessions(clientSessionIds: [session.clientSessionId], deleteOnServer: false)
        XCTAssertTrue(watch.historySessions.isEmpty)
        XCTAssertTrue(watch.syncQueue.isEmpty)
        XCTAssertTrue(watch.pendingServerDeletes.isEmpty)
        XCTAssertEqual(watch.deletedSessionIds, [session.clientSessionId])

        watch.clearAllLocalData()
        XCTAssertTrue(watch.deletedSessionIds.isEmpty)
        XCTAssertTrue(watch.pendingServerDeletes.isEmpty)
    }

    func testContextPayloadWithoutDeletedIdsStillDecodes() throws {
        let payload = WatchContextPayload(
            folders: [], unfiledTemplates: [], stretchingRoutines: [], preferences: UserPreferencesDto(),
            deletedSessionIds: ["a", "b"]
        )
        let encoded = try JSONEncoder().encode(payload)
        XCTAssertEqual(try JSONDecoder().decode(WatchContextPayload.self, from: encoded).deletedSessionIds, ["a", "b"])

        var json = try XCTUnwrap(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
        json.removeValue(forKey: "deletedSessionIds")
        let legacy = try JSONSerialization.data(withJSONObject: json)
        XCTAssertNil(try JSONDecoder().decode(WatchContextPayload.self, from: legacy).deletedSessionIds)
    }
}
