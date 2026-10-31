import XCTest
@testable import LukiFittiModels
@testable import LukiFittiAPI
@testable import LukiFittiDomain
@testable import LukiFittiStore

private final class SwitchableTokenStore: TokenStoring, @unchecked Sendable {
    var tokens: AuthTokensDto?
    func saveTokens(_ tokens: AuthTokensDto, userId: String?) throws { self.tokens = tokens }
    func loadTokens() -> AuthTokensDto? { tokens }
    func loadUserId() -> String? { nil }
    func clearTokens() { tokens = nil }
}

final class AuthExpiredSyncTests: XCTestCase {
    /// Signed in on this device but the tokens are gone (refresh rejected): the badge must ask to
    /// sign in again, and queued workouts must stay until then.
    @MainActor
    func testMissingTokensWhileSignedInAsksToSignInAndKeepsTheQueue() async throws {
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("AuthExpiredSyncTests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let tokens = SwitchableTokenStore()
        tokens.tokens = AuthTokensDto(accessToken: "FAKE-ACCESS", refreshToken: "FAKE-REFRESH", expiresAt: "2026-12-01T00:00:00Z")
        let store = OfflineStore(storageDirectory: dir, apiClient: APIClient(tokenStore: tokens))
        store.saveAuthenticatedUser(UserDto(id: "u1", email: "me@example.com"))
        XCTAssertFalse(store.needsReauthentication)

        let template = try XCTUnwrap(store.folders.first?.templates.first)
        let session = SessionCalculator.createOfflineSessionFromTemplate(
            template: template, catalog: store.catalog, userId: "u1", weightUnit: .KG, sourceDevice: .IPHONE
        )
        tokens.clearTokens()
        store.enqueueSessionSync(session)

        XCTAssertTrue(store.needsReauthentication)
        XCTAssertEqual(store.syncState, .AUTH_EXPIRED)
        await store.flushSyncQueue()
        XCTAssertEqual(store.syncState, .AUTH_EXPIRED)
        XCTAssertEqual(store.syncQueue.count, 1)
    }

    @MainActor
    func testGuestWithoutTokensIsNotAskedToSignInAgain() {
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("AuthExpiredSyncTests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let store = OfflineStore(storageDirectory: dir, apiClient: APIClient(tokenStore: SwitchableTokenStore()))
        XCTAssertFalse(store.needsReauthentication)
        XCTAssertNotEqual(store.syncState, .AUTH_EXPIRED)
    }
}
