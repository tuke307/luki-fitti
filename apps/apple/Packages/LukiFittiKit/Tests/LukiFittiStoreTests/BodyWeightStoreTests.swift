import XCTest
@testable import LukiFittiModels
@testable import LukiFittiAPI
@testable import LukiFittiStore

private final class EmptyTokenStore: TokenStoring, @unchecked Sendable {
    func saveTokens(_ tokens: AuthTokensDto, userId: String?) throws {}
    func loadTokens() -> AuthTokensDto? { nil }
    func loadUserId() -> String? { nil }
    func clearTokens() {}
}

final class BodyWeightStoreTests: XCTestCase {
    @MainActor
    func testGuestWeighInsStayLocalQueueAndPersist() async throws {
        let tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("BodyWeightStoreTests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: tempDir) }
        let api = APIClient(baseURL: URL(string: "http://127.0.0.1:9")!, tokenStore: EmptyTokenStore())
        let store = BodyWeightStore(apiClient: api, storageDirectory: tempDir)

        let reached1 = await store.save(
            UpsertBodyWeightEntryDto(clientEntryId: "weight-aaaaaaaa", measuredAt: "2026-10-08T07:00:00Z", weightKg: 81),
            isSignedIn: false
        )
        await store.save(
            UpsertBodyWeightEntryDto(clientEntryId: "weight-bbbbbbbb", measuredAt: "2026-10-01T07:00:00Z", weightKg: 82),
            isSignedIn: false
        )
        XCTAssertFalse(reached1)
        XCTAssertEqual(store.entries.map(\.weightKg), [82, 81], "sorted oldest first")
        XCTAssertEqual(store.outbox.count, 2)
        XCTAssertEqual(store.latest?.weightKg, 81)
        XCTAssertEqual(store.weight(at: LukiISODate.parse("2026-10-05T00:00:00Z")!), 82)
        XCTAssertEqual(store.weight(at: LukiISODate.parse("2026-09-01T00:00:00Z")!), 82)

        // Editing keeps one entry per clientEntryId.
        await store.save(
            UpsertBodyWeightEntryDto(clientEntryId: "weight-aaaaaaaa", measuredAt: "2026-10-08T07:00:00Z", weightKg: 80.5),
            isSignedIn: false
        )
        XCTAssertEqual(store.entries.count, 2)
        XCTAssertEqual(store.outbox.count, 2)

        let reloaded = BodyWeightStore(apiClient: api, storageDirectory: tempDir)
        XCTAssertEqual(reloaded.entries.map(\.weightKg), [82, 80.5])
        XCTAssertEqual(reloaded.outbox.count, 2)

        // Deleting an entry that never reached the server drops its queued upsert too.
        await reloaded.remove(reloaded.entries[0], isSignedIn: false)
        XCTAssertEqual(reloaded.entries.count, 1)
        XCTAssertEqual(reloaded.outbox.map(\.clientEntryId), ["weight-aaaaaaaa"])

        reloaded.clear()
        XCTAssertTrue(reloaded.entries.isEmpty)
        XCTAssertTrue(BodyWeightStore(apiClient: api, storageDirectory: tempDir).entries.isEmpty)
    }

    @MainActor
    func testMergeReplacesByClientIdAndDropsDeletedHealthSamples() {
        let tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("BodyWeightStoreTests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: tempDir) }
        let api = APIClient(baseURL: URL(string: "http://127.0.0.1:9")!, tokenStore: EmptyTokenStore())
        let store = BodyWeightStore(apiClient: api, storageDirectory: tempDir)
        store.merge([
            BodyWeightEntryDto(id: "1", clientEntryId: "hk-11111111", measuredAt: "2026-10-01T07:00:00Z", weightKg: 82, source: .HEALTHKIT, healthKitUuid: "uuid-1"),
            BodyWeightEntryDto(id: "2", clientEntryId: "hk-22222222", measuredAt: "2026-10-02T07:00:00Z", weightKg: 81.5, source: .HEALTHKIT, healthKitUuid: "uuid-2"),
        ])
        store.merge(
            [BodyWeightEntryDto(id: "2", clientEntryId: "hk-22222222", measuredAt: "2026-10-02T07:00:00Z", weightKg: 81, source: .HEALTHKIT, healthKitUuid: "uuid-2")],
            removingHealthKitUuids: ["uuid-1"]
        )
        XCTAssertEqual(store.entries.map(\.weightKg), [81])
    }
}
