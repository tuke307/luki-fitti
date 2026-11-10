import XCTest
@testable import LukiFittiModels
@testable import LukiFittiAPI
@testable import LukiFittiDomain
@testable import LukiFittiStore

private final class SharedUploadTokenStore: TokenStoring, @unchecked Sendable {
    private var tokens: AuthTokensDto? = AuthTokensDto(
        accessToken: "FAKE-ACCESS", refreshToken: "FAKE-REFRESH", expiresAt: "2099-12-01T00:00:00Z"
    )
    func saveTokens(_ tokens: AuthTokensDto, userId: String?) throws { self.tokens = tokens }
    func loadTokens() -> AuthTokensDto? { tokens }
    func loadUserId() -> String? { "u1" }
    func clearTokens() { tokens = nil }
}

/// In-memory stand-in for `POST /api/sessions/sync`. Records every payload it receives and
/// answers like the real server: version bumped past the payload version, conflictDetected false.
private final class SharedWorkoutSyncServer: @unchecked Sendable {
    private let lock = NSLock()
    private(set) var payloads: [SyncSessionPayloadDto] = []

    var syncCallCount: Int { lock.withLock { payloads.count } }

    func respond(to request: URLRequest) -> (Int, Data) {
        lock.withLock {
            let path = request.url?.path ?? ""
            let method = request.httpMethod ?? "GET"
            guard method == "POST", path == "/api/sessions/sync" else {
                return (500, Data(#"{"message":"Not mocked"}"#.utf8))
            }
            guard let body = request.bodyData,
                  let payload = try? JSONDecoder().decode(SyncSessionPayloadDto.self, from: body) else {
                return (400, Data(#"{"message":"Bad body"}"#.utf8))
            }
            payloads.append(payload)
            var session = WorkoutSessionDto(
                id: payload.id ?? "server-id",
                clientSessionId: payload.clientSessionId,
                templateId: payload.templateId,
                sessionType: payload.sessionType,
                workoutNameSnapshot: payload.workoutNameSnapshot,
                status: payload.status,
                startedAt: payload.startedAt,
                version: payload.version + 1,
                exercises: payload.exercises
            )
            // The server bumps the version on every write.
            session.lastSyncedAt = ISO8601DateFormatter().string(from: Date())
            let response = SyncSessionResponseDto(
                session: session, conflictDetected: false, serverVersion: session.version
            )
            return (200, (try? JSONEncoder().encode(response)) ?? Data())
        }
    }
}

private extension URLRequest {
    var bodyData: Data? {
        if let httpBody { return httpBody }
        guard let stream = httpBodyStream else { return nil }
        stream.open()
        defer { stream.close() }
        var data = Data()
        let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: 4096)
        defer { buffer.deallocate() }
        while stream.hasBytesAvailable {
            let read = stream.read(buffer, maxLength: 4096)
            if read <= 0 { break }
            data.append(buffer, count: read)
        }
        return data
    }
}

private final class SharedWorkoutURLProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var servers: [String: SharedWorkoutSyncServer] = [:]
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

final class SharedWorkoutUploadTests: XCTestCase {
    private var directories: [URL] = []

    override func tearDown() {
        for dir in directories { try? FileManager.default.removeItem(at: dir) }
        directories = []
        super.tearDown()
    }

    @MainActor
    private func makeStore(
        server: SharedWorkoutSyncServer? = nil,
        localDevice: SessionSourceDevice = .IPHONE
    ) -> OfflineStore {
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("SharedWorkoutUploadTests-\(UUID().uuidString)", isDirectory: true)
        directories.append(dir)
        guard let server else {
            return OfflineStore(storageDirectory: dir, localDevice: localDevice)
        }
        let host = "fake-\(UUID().uuidString.lowercased()).test"
        SharedWorkoutURLProtocol.lock.withLock { SharedWorkoutURLProtocol.servers[host] = server }
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [SharedWorkoutURLProtocol.self]
        let client = APIClient(
            baseURL: URL(string: "https://\(host)")!,
            tokenStore: SharedUploadTokenStore(),
            session: URLSession(configuration: config)
        )
        let store = OfflineStore(storageDirectory: dir, apiClient: client, localDevice: localDevice)
        store.saveAuthenticatedUser(UserDto(id: "u1", email: "me@example.com"))
        return store
    }

    @MainActor
    private func session(
        _ store: OfflineStore,
        sourceDevice: SessionSourceDevice,
        status: SessionStatus = .IN_PROGRESS
    ) throws -> WorkoutSessionDto {
        let template = try XCTUnwrap(store.folders.first?.templates.first)
        var session = SessionCalculator.createOfflineSessionFromTemplate(
            template: template, catalog: store.catalog, userId: "u1", weightUnit: .KG,
            sourceDevice: sourceDevice
        )
        session.status = status
        if status == .COMPLETED { session.completedAt = session.startedAt }
        return session
    }

    /// A mirrored workout only uploads from the device that owns it: the iPhone must not queue
    /// in-progress uploads of a Watch-owned session (and vice versa), otherwise both devices hit
    /// the server with different device ids and trigger the conflict dialog.
    @MainActor
    func testMirrorDeviceDoesNotQueueActiveStateUploads() throws {
        let iPhone = makeStore()
        let watch = makeStore(localDevice: .APPLE_WATCH)

        let watchOwned = try session(iPhone, sourceDevice: .APPLE_WATCH)
        iPhone.enqueueSessionSync(watchOwned)
        XCTAssertTrue(iPhone.syncQueue.isEmpty)

        let iPhoneOwned = try session(watch, sourceDevice: .IPHONE)
        watch.enqueueSessionSync(iPhoneOwned)
        XCTAssertTrue(watch.syncQueue.isEmpty)

        // The owner still queues normally.
        watch.enqueueSessionSync(watchOwned)
        XCTAssertEqual(watch.syncQueue.count, 1)
        iPhone.enqueueSessionSync(iPhoneOwned)
        XCTAssertEqual(iPhone.syncQueue.count, 1)
    }

    /// A stale queued in-progress copy for a mirrored session is dropped when the mirror enqueues.
    @MainActor
    func testMirrorEnqueueRemovesStaleQueuedItem() throws {
        let iPhone = makeStore()
        var owned = try session(iPhone, sourceDevice: .IPHONE)
        iPhone.enqueueSessionSync(owned)
        XCTAssertEqual(iPhone.syncQueue.count, 1)

        // The session turns out to be Watch-owned (merged snapshot from the companion).
        owned.sourceDevice = .APPLE_WATCH
        iPhone.enqueueSessionSync(owned)
        XCTAssertTrue(iPhone.syncQueue.isEmpty)
    }

    /// The device that finishes a mirrored workout uploads the merged final state with
    /// forceOverwrite, because it holds the most complete copy.
    @MainActor
    func testMirrorDeviceQueuesCompletedWithForceOverwrite() throws {
        let iPhone = makeStore()
        let completed = try session(iPhone, sourceDevice: .APPLE_WATCH, status: .COMPLETED)
        iPhone.enqueueSessionSync(completed)
        XCTAssertEqual(iPhone.syncQueue.count, 1)
        XCTAssertEqual(iPhone.syncQueue.first?.payload.forceOverwrite, true)
    }

    /// After a successful upload the local active session keeps its own version and content;
    /// the server version is only acknowledged as the base for the next upload.
    @MainActor
    func testFlushKeepsLocalActiveSessionVersionAndAcksServerVersion() async throws {
        let server = SharedWorkoutSyncServer()
        let store = makeStore(server: server)
        var active = try session(store, sourceDevice: .IPHONE)
        active.version = 2
        active.notes = "local-notes"
        store.saveActiveSession(active)
        store.enqueueSessionSync(active)

        await store.flushSyncQueue()

        XCTAssertEqual(server.syncCallCount, 1)
        XCTAssertEqual(store.syncQueue.count, 0)
        // Server answered with version 3 — the local active session must not adopt it.
        XCTAssertEqual(store.activeSession?.version, 2)
        XCTAssertEqual(store.activeSession?.notes, "local-notes")

        // The ack still happened: the next upload carries the server version as baseVersion.
        store.enqueueSessionSync(store.activeSession!)
        await store.flushSyncQueue()
        XCTAssertEqual(server.syncCallCount, 2)
        XCTAssertEqual(server.payloads.last?.baseVersion, 3)
    }

    /// Reproduction of the "stuck on 1/3" bug: the Watch mirrors the iPhone's session at version N
    /// (it no longer uploads it, so its version stays in lockstep). The iPhone completes another
    /// set and broadcasts version N+1 — the merge must accept it and show 2 of 3 sets done.
    @MainActor
    func testWatchMirrorAcceptsNextIPhoneSnapshot() throws {
        let iPhone = makeStore()
        let watch = makeStore(localDevice: .APPLE_WATCH)

        let template = try XCTUnwrap(iPhone.folders.first?.templates.first)
        let started = SessionCalculator.createOfflineSessionFromTemplate(
            template: template, catalog: iPhone.catalog, userId: "u1", weightUnit: .KG,
            sourceDevice: .IPHONE
        )
        iPhone.saveActiveSession(started)
        // The Watch mirrors the same session (same version — no server round-trip inflates it).
        watch.saveActiveSession(started)
        let versionOnWatch = try XCTUnwrap(watch.activeSession?.version)

        // iPhone completes one more set and bumps the version once, like its UI does.
        var updated = started
        updated.exercises[0].sets[0].completed = true
        updated.exercises[0].sets[0].completedAt = ISO8601DateFormatter().string(from: Date())
        updated.version = versionOnWatch + 1
        updated = SessionCalculator.recalculateSessionTotals(updated)

        // WatchWorkoutViewModel.mergeIncomingActiveSession: drop only strictly newer local copies.
        let incoming = updated
        if let current = watch.activeSession,
           current.clientSessionId == incoming.clientSessionId,
           current.version > incoming.version {
            XCTFail("watch dropped a newer iPhone snapshot")
        }
        let previous = watch.activeSession?.clientSessionId == incoming.clientSessionId
            ? watch.activeSession
            : nil
        watch.saveActiveSession(incoming)
        let followed = SessionCalculator.followedExerciseIndex(
            previous: previous, incoming: incoming, currentIndex: 0
        )

        let exercise = try XCTUnwrap(watch.activeSession?.exercises[0])
        XCTAssertTrue(exercise.sets[0].completed)
        XCTAssertEqual(
            watch.activeSession.map(\.totalSetsCompleted),
            incoming.totalSetsCompleted
        )
        // First exercise still has open sets → the watch stays on it (index 0).
        XCTAssertEqual(followed, 0)
    }
}
