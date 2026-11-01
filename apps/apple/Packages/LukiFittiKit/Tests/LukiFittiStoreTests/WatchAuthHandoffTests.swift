import XCTest
@testable import LukiFittiModels
@testable import LukiFittiWatchSync

private let watchTokens = AuthTokensDto(accessToken: "FAKE-WATCH-ACCESS", refreshToken: "FAKE-WATCH-REFRESH", expiresAt: "2099-01-01T00:00:00Z")
private let rotatedTokens = AuthTokensDto(accessToken: "FAKE-ROTATED-ACCESS", refreshToken: "FAKE-ROTATED-REFRESH", expiresAt: "2099-01-01T00:00:00Z")

private final class MemoryHandoffStore: WatchAuthHandoffStoring, @unchecked Sendable {
    private let lock = NSLock()
    private var handoff: WatchAuthHandoff?
    func load() -> WatchAuthHandoff? { lock.withLock { handoff } }
    func save(_ handoff: WatchAuthHandoff) { lock.withLock { self.handoff = handoff } }
    func clear() { lock.withLock { handoff = nil } }
}

private final class MintCounter: @unchecked Sendable {
    private let lock = NSLock()
    private var count = 0
    var value: Int { lock.withLock { count } }
    func increment() { lock.withLock { count += 1 } }
}

final class WatchAuthHandoffPolicyTests: XCTestCase {
    private func decide(
        incoming: AuthTokensDto? = watchTokens,
        incomingUser: String? = "u1",
        handoffId: String?,
        stored: AuthTokensDto? = rotatedTokens,
        storedUser: String? = "u1",
        lastApplied: String?
    ) -> WatchAuthTokenDecision {
        WatchAuthHandoffPolicy.decide(
            incomingTokens: incoming,
            incomingUserId: incomingUser,
            incomingHandoffId: handoffId,
            storedTokens: stored,
            storedUserId: storedUser,
            lastAppliedHandoffId: lastApplied
        )
    }

    func testRePushOfAppliedHandoffKeepsRotatedTokens() {
        XCTAssertEqual(decide(handoffId: "h1", lastApplied: "h1"), .keep)
    }

    func testNewHandoffIdReplacesTokens() {
        XCTAssertEqual(decide(handoffId: "h2", lastApplied: "h1"), .apply)
        XCTAssertEqual(decide(handoffId: "h1", lastApplied: nil), .apply)
    }

    func testOtherUserReplacesTokens() {
        XCTAssertEqual(decide(incomingUser: "u2", handoffId: "h1", lastApplied: "h1"), .apply)
    }

    func testWatchWithoutTokensApplies() {
        XCTAssertEqual(decide(handoffId: "h1", stored: nil, lastApplied: "h1"), .apply)
        XCTAssertEqual(decide(handoffId: nil, stored: nil, lastApplied: nil), .apply)
    }

    /// Older iPhone apps send their own tokens without an id; a signed-in Watch must not take them.
    func testTokensWithoutHandoffIdDoNotReplaceExistingOnes() {
        XCTAssertEqual(decide(handoffId: nil, lastApplied: "h1"), .keep)
    }

    func testNoIncomingTokensKeepsOwnUnlessAccountChanged() {
        XCTAssertEqual(decide(incoming: nil, handoffId: nil, lastApplied: "h1"), .keep)
        XCTAssertEqual(decide(incoming: nil, incomingUser: nil, handoffId: nil, lastApplied: "h1"), .keep)
        XCTAssertEqual(decide(incoming: nil, incomingUser: "u2", handoffId: nil, lastApplied: "h1"), .discardStored)
        XCTAssertEqual(decide(incoming: nil, incomingUser: "u2", handoffId: nil, stored: nil, lastApplied: nil), .keep)
    }

    func testPayloadsWithoutHandoffIdStillDecode() throws {
        let payload = WatchAuthPayload(preferences: UserPreferencesDto(), authTokens: watchTokens, authHandoffId: "h1")
        var legacy = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(payload)) as? [String: Any])
        legacy.removeValue(forKey: "authHandoffId")
        let decoded = try JSONDecoder().decode(WatchAuthPayload.self, from: JSONSerialization.data(withJSONObject: legacy))
        XCTAssertNil(decoded.authHandoffId)
        XCTAssertEqual(decoded.authTokens, watchTokens)

        let roundTrip = try JSONDecoder().decode(WatchAuthPayload.self, from: JSONEncoder().encode(payload))
        XCTAssertEqual(roundTrip.authHandoffId, "h1")
        let context = WatchContextPayload(
            folders: [], unfiledTemplates: [], stretchingRoutines: [], preferences: UserPreferencesDto(),
            authTokens: watchTokens, authHandoffId: "h1"
        )
        XCTAssertEqual(try JSONDecoder().decode(WatchContextPayload.self, from: JSONEncoder().encode(context)), context)
    }
}

final class WatchAuthHandoffProviderTests: XCTestCase {
    @MainActor
    func testConcurrentMintsShareOneDeviceSession() async {
        let store = MemoryHandoffStore()
        let provider = WatchAuthHandoffProvider(store: store)
        let counter = MintCounter()
        let create: @Sendable () async throws -> AuthTokensDto = {
            counter.increment()
            try await Task.sleep(for: .milliseconds(100))
            return watchTokens
        }
        let first = provider.mint(userId: "u1", isStillSignedIn: { _ in true }, using: create)
        let second = provider.mint(userId: "u1", isStillSignedIn: { _ in true }, using: create)
        XCTAssertTrue(provider.isMinting)
        let a = await first.value
        let b = await second.value
        XCTAssertEqual(counter.value, 1)
        XCTAssertEqual(a, b)
        XCTAssertEqual(store.load(), a)
        XCTAssertFalse(provider.isMinting)
        XCTAssertFalse(provider.needsMint(for: "u1"))
    }

    @MainActor
    func testReusesStoredHandoffUntilWatchAsksForANewOne() async throws {
        let store = MemoryHandoffStore()
        let provider = WatchAuthHandoffProvider(store: store)
        let firstMint = await provider.mint(userId: "u1", isStillSignedIn: { _ in true }) { watchTokens }.value
        let first = try XCTUnwrap(firstMint)
        XCTAssertEqual(provider.handoff(for: "u1")?.id, first.id)
        XCTAssertFalse(provider.needsMint(for: "u1"))

        provider.requestNewHandoff()
        XCTAssertTrue(provider.needsMint(for: "u1"))
        let secondMint = await provider.mint(userId: "u1", isStillSignedIn: { _ in true }) { rotatedTokens }.value
        let second = try XCTUnwrap(secondMint)
        XCTAssertNotEqual(second.id, first.id)
        XCTAssertEqual(provider.handoff(for: "u1"), second)
        XCTAssertFalse(provider.needsMint(for: "u1"))
    }

    @MainActor
    func testFailedOrStaleMintStoresNothing() async {
        let store = MemoryHandoffStore()
        let provider = WatchAuthHandoffProvider(store: store)
        let offline = await provider.mint(userId: "u1", isStillSignedIn: { _ in true }) {
            throw URLError(.notConnectedToInternet)
        }.value
        XCTAssertNil(offline)
        XCTAssertTrue(provider.needsMint(for: "u1"))

        let signedOutMeanwhile = await provider.mint(userId: "u1", isStillSignedIn: { _ in false }) { watchTokens }.value
        XCTAssertNil(signedOutMeanwhile)
        XCTAssertNil(store.load())
    }

    @MainActor
    func testOtherAccountAndSignOutDropTheHandoff() async {
        let store = MemoryHandoffStore()
        let provider = WatchAuthHandoffProvider(store: store)
        _ = await provider.mint(userId: "u1", isStillSignedIn: { _ in true }) { watchTokens }.value
        XCTAssertNil(provider.handoff(for: "u2"))
        XCTAssertNil(store.load())

        _ = await provider.mint(userId: "u2", isStillSignedIn: { _ in true }) { watchTokens }.value
        provider.clear()
        XCTAssertNil(store.load())
    }
}
