import XCTest
@testable import LukiFittiModels
@testable import LukiFittiAPI
@testable import LukiFittiDomain
@testable import LukiFittiStore

private let oldTokens = AuthTokensDto(accessToken: "FAKE-OLD-ACCESS", refreshToken: "FAKE-OLD-REFRESH", expiresAt: "2099-01-01T00:00:00Z")
private let newTokens = AuthTokensDto(accessToken: "FAKE-NEW-ACCESS", refreshToken: "FAKE-NEW-REFRESH", expiresAt: "2099-01-01T00:00:00Z")

private final class MemoryTokenStore: TokenStoring, @unchecked Sendable {
    private let lock = NSLock()
    private var tokens: AuthTokensDto?
    init(_ tokens: AuthTokensDto?) { self.tokens = tokens }
    func saveTokens(_ tokens: AuthTokensDto, userId: String?) throws { lock.withLock { self.tokens = tokens } }
    func loadTokens() -> AuthTokensDto? { lock.withLock { tokens } }
    func loadUserId() -> String? { "u1" }
    func clearTokens() { lock.withLock { tokens = nil } }
}

/// Fake auth server: protected endpoints accept only the current access token; the refresh
/// endpoint answers as configured.
private final class FakeAuthServer: @unchecked Sendable {
    enum RefreshBehavior { case networkError, status(Int), succeed }

    private let lock = NSLock()
    private var refreshBehavior: RefreshBehavior
    private let validAccessToken = newTokens.accessToken
    private var refreshDelay: TimeInterval = 0
    private(set) var refreshCalls = 0
    private(set) var syncCalls = 0
    private(set) var paths: [String] = []
    private(set) var deviceLabels: [String?] = []
    var syncResponse: Data = Data()

    init(refresh: RefreshBehavior) { refreshBehavior = refresh }

    func setRefresh(_ behavior: RefreshBehavior) { lock.withLock { refreshBehavior = behavior } }
    func setRefreshDelay(_ delay: TimeInterval) { lock.withLock { refreshDelay = delay } }
    var refreshCallCount: Int { lock.withLock { refreshCalls } }
    var syncCallCount: Int { lock.withLock { syncCalls } }
    var requestedPaths: [String] { lock.withLock { paths } }
    var sentDeviceLabels: [String?] { lock.withLock { deviceLabels } }

    /// nil means the connection fails.
    func respond(to request: URLRequest) -> (delay: TimeInterval, status: Int, body: Data)? {
        lock.withLock {
            let path = request.url?.path ?? ""
            paths.append(path)
            deviceLabels.append(request.value(forHTTPHeaderField: "X-Device-Label"))
            if path == "/api/auth/refresh-token" {
                refreshCalls += 1
                switch refreshBehavior {
                case .networkError: return nil
                case .status(let code): return (refreshDelay, code, Data(#"{"message":"nope"}"#.utf8))
                case .succeed:
                    let json = """
                    {"success":true,"data":{"success":true,"tokens":{"accessToken":"\(newTokens.accessToken)","refreshToken":"\(newTokens.refreshToken)","expiresAt":"\(newTokens.expiresAt)"}}}
                    """
                    return (refreshDelay, 200, Data(json.utf8))
                }
            }
            guard request.value(forHTTPHeaderField: "Authorization") == "Bearer \(validAccessToken)" else {
                return (0, 401, Data(#"{"message":"Unauthorized"}"#.utf8))
            }
            switch path {
            case "/api/sessions":
                return (0, 200, Data("[]".utf8))
            case "/api/sessions/sync":
                syncCalls += 1
                return (0, 200, syncResponse)
            case "/api/auth/device-session":
                let json = """
                {"success":true,"data":{"success":true,"tokens":{"accessToken":"FAKE-WATCH-ACCESS","refreshToken":"FAKE-WATCH-REFRESH","expiresAt":"2099-01-01T00:00:00Z"}}}
                """
                return (0, 200, Data(json.utf8))
            case "/api/auth/logout-all":
                return (0, 200, Data(#"{"success":true}"#.utf8))
            default:
                return (0, 500, Data(#"{"message":"Not mocked"}"#.utf8))
            }
        }
    }
}

private final class FakeAuthURLProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var servers: [String: FakeAuthServer] = [:]
    static let lock = NSLock()

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let host = request.url?.host ?? ""
        let server = Self.lock.withLock { Self.servers[host] }
        guard let answer = server?.respond(to: request) else {
            client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet))
            return
        }
        let deliver = { [self] in
            let response = HTTPURLResponse(
                url: request.url!, statusCode: answer.status, httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
            )!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: answer.body)
            client?.urlProtocolDidFinishLoading(self)
        }
        if answer.delay > 0 {
            DispatchQueue.global().asyncAfter(deadline: .now() + answer.delay, execute: deliver)
        } else {
            deliver()
        }
    }

    override func stopLoading() {}
}

final class AuthRefreshResilienceTests: XCTestCase {
    private var directories: [URL] = []

    override func tearDown() {
        for dir in directories { try? FileManager.default.removeItem(at: dir) }
        directories = []
        super.tearDown()
    }

    private func makeClient(server: FakeAuthServer, tokens: MemoryTokenStore) -> APIClient {
        let host = "fake-auth-\(UUID().uuidString.lowercased()).test"
        FakeAuthURLProtocol.lock.withLock { FakeAuthURLProtocol.servers[host] = server }
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [FakeAuthURLProtocol.self]
        return APIClient(
            baseURL: URL(string: "https://\(host)")!,
            tokenStore: tokens,
            session: URLSession(configuration: config)
        )
    }

    private func assertThrows(
        _ expected: (APIClientError) -> Bool,
        file: StaticString = #filePath,
        line: UInt = #line,
        _ body: () async throws -> Void
    ) async {
        do {
            try await body()
            XCTFail("Expected an error", file: file, line: line)
        } catch let error as APIClientError {
            XCTAssertTrue(expected(error), "Unexpected error \(error)", file: file, line: line)
        } catch {
            XCTFail("Unexpected error \(error)", file: file, line: line)
        }
    }

    private static func isOffline(_ error: APIClientError) -> Bool {
        if case .offline = error { return true }
        return false
    }

    func testRefreshNetworkErrorKeepsTokensAndThrowsOffline() async {
        let tokens = MemoryTokenStore(oldTokens)
        let client = makeClient(server: FakeAuthServer(refresh: .networkError), tokens: tokens)
        await assertThrows(Self.isOffline) { _ = try await client.fetchSessions() }
        XCTAssertEqual(tokens.loadTokens(), oldTokens)
    }

    func testRefreshServerErrorKeepsTokensAndThrowsOffline() async {
        for status in [500, 503, 429] {
            let tokens = MemoryTokenStore(oldTokens)
            let client = makeClient(server: FakeAuthServer(refresh: .status(status)), tokens: tokens)
            await assertThrows(Self.isOffline) { _ = try await client.fetchSessions() }
            XCTAssertEqual(tokens.loadTokens(), oldTokens, "HTTP \(status) must not sign out")
            let outcome = await client.tryRefreshSession()
            XCTAssertEqual(outcome, .transient)
        }
    }

    func testRawSendKeepsTokensWhenRefreshIsTransient() async {
        let tokens = MemoryTokenStore(oldTokens)
        let client = makeClient(server: FakeAuthServer(refresh: .status(502)), tokens: tokens)
        await assertThrows(Self.isOffline) { _ = try await client.fetchData(path: "/api/sessions") }
        XCTAssertEqual(tokens.loadTokens(), oldTokens)
    }

    func testRejectedRefreshClearsTokensAndThrowsUnauthorized() async {
        for status in [401, 403] {
            let tokens = MemoryTokenStore(oldTokens)
            let client = makeClient(server: FakeAuthServer(refresh: .status(status)), tokens: tokens)
            await assertThrows({ $0 == .unauthorized }) { _ = try await client.fetchSessions() }
            XCTAssertNil(tokens.loadTokens(), "HTTP \(status) from refresh must sign out")
        }
    }

    func testRefreshWithoutTokensIsRejected() async {
        let client = makeClient(server: FakeAuthServer(refresh: .succeed), tokens: MemoryTokenStore(nil))
        let outcome = await client.tryRefreshSession()
        XCTAssertEqual(outcome, .rejected)
    }

    func testConcurrentUnauthorizedRequestsShareOneRefresh() async throws {
        let server = FakeAuthServer(refresh: .succeed)
        server.setRefreshDelay(0.3)
        let tokens = MemoryTokenStore(oldTokens)
        let client = makeClient(server: server, tokens: tokens)

        try await withThrowingTaskGroup(of: [WorkoutSessionDto].self) { group in
            for _ in 0..<5 {
                group.addTask { try await client.fetchSessions() }
            }
            for try await sessions in group {
                XCTAssertEqual(sessions, [])
            }
        }
        XCTAssertEqual(server.refreshCallCount, 1)
        XCTAssertEqual(tokens.loadTokens(), newTokens)
    }

    func testRequestsCarryDeviceLabelIncludingRefresh() async throws {
        let server = FakeAuthServer(refresh: .succeed)
        let client = makeClient(server: server, tokens: MemoryTokenStore(oldTokens))
        _ = try await client.fetchSessions()
        XCTAssertTrue(server.requestedPaths.contains("/api/auth/refresh-token"))
        XCTAssertEqual(Set(server.sentDeviceLabels), [APIClient.deviceLabel])
        XCTAssertEqual(APIClient.deviceLabel, "iphone")
    }

    func testDefaultSessionNeverStoresOrSendsCookies() {
        let config = APIClient.apiSession.configuration
        XCTAssertNil(config.httpCookieStorage)
        XCTAssertFalse(config.httpShouldSetCookies)
        XCTAssertEqual(config.httpCookieAcceptPolicy, .never)
    }

    func testCreateDeviceSessionReturnsSeparateTokensAndKeepsOwn() async throws {
        let tokens = MemoryTokenStore(newTokens)
        let client = makeClient(server: FakeAuthServer(refresh: .succeed), tokens: tokens)
        let watchTokens = try await client.createDeviceSession(deviceLabel: "watch")
        XCTAssertEqual(watchTokens.refreshToken, "FAKE-WATCH-REFRESH")
        XCTAssertEqual(tokens.loadTokens(), newTokens)
    }

    func testLogoutAllDevicesCallsServerAndClearsTokens() async {
        let server = FakeAuthServer(refresh: .succeed)
        let tokens = MemoryTokenStore(newTokens)
        let client = makeClient(server: server, tokens: tokens)
        await client.logoutAllDevices()
        XCTAssertTrue(server.requestedPaths.contains("/api/auth/logout-all"))
        XCTAssertNil(tokens.loadTokens())
    }

    /// A workout recorded while the session can't be renewed stays queued (and signed in), then
    /// uploads once the refresh goes through.
    @MainActor
    func testOfflineWorkoutStaysQueuedWhileRefreshIsTransientAndUploadsAfterwards() async throws {
        let server = FakeAuthServer(refresh: .networkError)
        let tokens = MemoryTokenStore(oldTokens)
        let client = makeClient(server: server, tokens: tokens)
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("AuthRefreshResilienceTests-\(UUID().uuidString)", isDirectory: true)
        directories.append(dir)
        let store = OfflineStore(storageDirectory: dir, apiClient: client)
        store.saveAuthenticatedUser(UserDto(id: "u1", email: "me@example.com"))

        let template = try XCTUnwrap(store.folders.first?.templates.first)
        var session = SessionCalculator.createOfflineSessionFromTemplate(
            template: template, catalog: store.catalog, userId: "u1", weightUnit: .KG, sourceDevice: .APPLE_WATCH
        )
        session.status = .COMPLETED
        session.completedAt = session.startedAt
        store.saveHistorySession(session)
        store.enqueueSessionSync(session)
        server.syncResponse = try JSONEncoder().encode(
            SyncSessionResponseDto(session: session, conflictDetected: false, serverVersion: 1)
        )

        await store.flushSyncQueue()
        XCTAssertEqual(store.syncQueue.count, 1)
        XCTAssertEqual(tokens.loadTokens(), oldTokens)
        XCTAssertFalse(store.needsReauthentication)
        XCTAssertNotEqual(store.syncState, .AUTH_EXPIRED)
        XCTAssertEqual(server.syncCallCount, 0)

        server.setRefresh(.status(503))
        await store.flushSyncQueue()
        XCTAssertEqual(store.syncQueue.count, 1)
        XCTAssertEqual(tokens.loadTokens(), oldTokens)

        server.setRefresh(.succeed)
        await store.flushSyncQueue()
        XCTAssertTrue(store.syncQueue.isEmpty)
        XCTAssertEqual(server.syncCallCount, 1)
        XCTAssertEqual(tokens.loadTokens(), newTokens)
        XCTAssertEqual(store.syncState, .SYNCED)
    }
}
