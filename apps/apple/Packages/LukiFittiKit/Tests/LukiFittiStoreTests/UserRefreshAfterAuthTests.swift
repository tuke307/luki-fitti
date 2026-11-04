import XCTest
@testable import LukiFittiModels
@testable import LukiFittiAPI
@testable import LukiFittiDomain
@testable import LukiFittiStore

private final class UserRefreshTokenStore: TokenStoring, @unchecked Sendable {
    var tokens: AuthTokensDto? = AuthTokensDto(
        accessToken: "FAKE-ACCESS", refreshToken: "FAKE-REFRESH", expiresAt: "2099-12-01T00:00:00Z"
    )
    func saveTokens(_ tokens: AuthTokensDto, userId: String?) throws { self.tokens = tokens }
    func loadTokens() -> AuthTokensDto? { tokens }
    func loadUserId() -> String? { nil }
    func clearTokens() { tokens = nil }
}

/// Answers only `GET /api/auth/me`; every other endpoint returns 500 so the store keeps its
/// local data for the rest of `refreshFromServerAfterAuth`.
private final class FakeMeServer: @unchecked Sendable {
    private let lock = NSLock()
    private var meBody: Data
    var meCalls = 0

    init(meBody: Data) { self.meBody = meBody }

    func respond(to request: URLRequest) -> (Int, Data) {
        lock.withLock {
            let path = request.url?.path ?? ""
            if request.httpMethod == "GET", path == "/api/auth/me" {
                meCalls += 1
                return (200, meBody)
            }
            return (500, Data(#"{"message":"Not mocked"}"#.utf8))
        }
    }
}

private final class FakeMeURLProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var servers: [String: FakeMeServer] = [:]
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

final class UserRefreshAfterAuthTests: XCTestCase {
    private var directories: [URL] = []

    override func tearDown() {
        for dir in directories { try? FileManager.default.removeItem(at: dir) }
        directories = []
        super.tearDown()
    }

    @MainActor
    private func makeStore(server: FakeMeServer, user: UserDto) -> OfflineStore {
        let host = "fake-me-\(UUID().uuidString.lowercased()).test"
        FakeMeURLProtocol.lock.withLock { FakeMeURLProtocol.servers[host] = server }
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [FakeMeURLProtocol.self]
        let client = APIClient(
            baseURL: URL(string: "https://\(host)")!,
            tokenStore: UserRefreshTokenStore(),
            session: URLSession(configuration: config)
        )
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("UserRefreshAfterAuthTests-\(UUID().uuidString)", isDirectory: true)
        directories.append(dir)
        let store = OfflineStore(storageDirectory: dir, apiClient: client)
        store.saveAuthenticatedUser(user)
        return store
    }

    /// A user cached before `aiKeyConfigured` existed decodes it as false; the refresh must
    /// pick up the live value (and features) without dropping local preferences.
    @MainActor
    func testRefreshFromServerAfterAuthPicksUpAiKeyConfiguredAndFeatures() async throws {
        // JSON without `aiKeyConfigured`, like caches written by older app versions.
        let cachedJson = Data(#"{"id":"u1","email":"me@example.com"}"#.utf8)
        var user = try JSONDecoder().decode(UserDto.self, from: cachedJson)
        XCTAssertFalse(user.aiKeyConfigured)
        user.preferences = UserPreferencesDto(weeklyGoalSessions: 7)
        user.tokens = AuthTokensDto(
            accessToken: "FAKE-ACCESS", refreshToken: "FAKE-REFRESH", expiresAt: "2099-12-01T00:00:00Z"
        )

        let meJson = Data(#"""
        {"success":true,"data":{"id":"u1","email":"me@example.com","aiKeyConfigured":true,"features":["AI_WORKOUT_BUILDER"],"permissions":[]}}
        """#.utf8)
        let server = FakeMeServer(meBody: meJson)
        let store = makeStore(server: server, user: user)

        await store.refreshFromServerAfterAuth()

        let refreshed = try XCTUnwrap(store.currentUser)
        XCTAssertTrue(refreshed.aiKeyConfigured)
        XCTAssertTrue(refreshed.hasFeature(.AI_WORKOUT_BUILDER))
        XCTAssertEqual(refreshed.preferences?.weeklyGoalSessions, 7)
        XCTAssertEqual(refreshed.tokens?.accessToken, "FAKE-ACCESS")
        XCTAssertEqual(server.meCalls, 1)
    }

    /// A `me` for a different account must never overwrite the cached user.
    @MainActor
    func testRefreshFromServerAfterAuthIgnoresMismatchedUserId() async throws {
        var user = UserDto(id: "u1", email: "me@example.com")
        user.aiKeyConfigured = false

        let meJson = Data(#"""
        {"success":true,"data":{"id":"other-user","email":"other@example.com","aiKeyConfigured":true}}
        """#.utf8)
        let server = FakeMeServer(meBody: meJson)
        let store = makeStore(server: server, user: user)

        await store.refreshFromServerAfterAuth()

        XCTAssertEqual(store.currentUser?.id, "u1")
        XCTAssertFalse(store.currentUser?.aiKeyConfigured ?? true)
    }
}
