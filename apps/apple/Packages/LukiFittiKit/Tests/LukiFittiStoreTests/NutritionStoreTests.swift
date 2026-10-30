import XCTest
@testable import LukiFittiModels
@testable import LukiFittiAPI
@testable import LukiFittiStore

private final class NoTokenStore: TokenStoring, @unchecked Sendable {
    func saveTokens(_ tokens: AuthTokensDto, userId: String?) throws {}
    func loadTokens() -> AuthTokensDto? { nil }
    func loadUserId() -> String? { nil }
    func clearTokens() {}
}

final class NutritionStoreTests: XCTestCase {
    private func entry(_ id: String, _ eatenAt: String, kcal: Double) -> MealEntryDto {
        MealEntryDto(id: id, clientEntryId: id, eatenAt: eatenAt, mealType: .LUNCH, totals: NutritionTotalsDto(kcal: kcal))
    }

    private func payload(_ id: String, _ eatenAt: String, kcal: Double) -> UpsertMealEntryDto {
        UpsertMealEntryDto(
            clientEntryId: id,
            eatenAt: eatenAt,
            mealType: .DINNER,
            items: [MealItemInputDto(MealItemDto(name: "x", kcal: kcal, proteinG: 0, carbsG: 0, fatG: 0))]
        )
    }

    @MainActor
    func testDayIndexFollowsEveryMutationAndReload() async throws {
        let tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("NutritionStoreTests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: tempDir) }
        let api = APIClient(baseURL: URL(string: "http://127.0.0.1:9")!, tokenStore: NoTokenStore())
        let store = NutritionStore(apiClient: api, storageDirectory: tempDir)
        let day = LukiISODate.parse("2026-10-27T12:00:00Z")!

        store.upsertLocal(entry("late", "2026-10-27T13:00:00Z", kcal: 700))
        store.upsertLocal(entry("early", "2026-10-27T11:00:00Z", kcal: 300))
        XCTAssertEqual(store.entries(on: day).map(\.id), ["early", "late"])
        XCTAssertEqual(store.totals(on: day).kcal, 1000)

        await store.save(payload("offline", "2026-10-27T12:30:00Z", kcal: 200), isSignedIn: false)
        XCTAssertEqual(store.totals(on: day).kcal, 1200)

        await store.remove(store.entries(on: day)[0], isSignedIn: false)
        XCTAssertEqual(store.entries(on: day).map(\.clientEntryId), ["offline", "late"])

        let reloaded = NutritionStore(apiClient: api, storageDirectory: tempDir)
        XCTAssertEqual(reloaded.totals(on: day).kcal, 900)
        XCTAssertEqual(reloaded.totals(on: day.addingTimeInterval(-3 * 86_400)).kcal, 0)

        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC")!
        XCTAssertEqual(reloaded.entries(on: day, calendar: utc).count, 2)

        reloaded.clear()
        XCTAssertTrue(reloaded.entries(on: day).isEmpty)
    }

    func testMergeReplacesOnlyTheFetchedWindowAndKeepsPendingChanges() {
        let window = DateInterval(
            start: LukiISODate.parse("2026-10-01T00:00:00Z")!,
            end: LukiISODate.parse("2026-11-01T00:00:00Z")!
        )
        let merged = NutritionStore.merge(
            existing: [
                entry("older", "2026-09-10T12:00:00Z", kcal: 100),
                entry("deleted-elsewhere", "2026-10-05T12:00:00Z", kcal: 100),
                entry("edited", "2026-10-06T12:00:00Z", kcal: 100),
                entry("pending", "2026-10-07T12:00:00Z", kcal: 100),
            ],
            server: [
                entry("edited", "2026-10-06T12:00:00Z", kcal: 250),
                entry("pending", "2026-10-07T12:00:00Z", kcal: 100),
                entry("new", "2026-10-08T12:00:00Z", kcal: 400),
            ],
            window: window,
            pendingUpserts: [payload("pending", "2026-10-07T12:00:00Z", kcal: 900)],
            pendingIds: ["pending"]
        )
        XCTAssertEqual(merged.map(\.clientEntryId).sorted(), ["edited", "new", "older", "pending"])
        XCTAssertEqual(merged.first { $0.clientEntryId == "edited" }?.totals.kcal, 250)
        XCTAssertEqual(merged.first { $0.clientEntryId == "pending" }?.totals.kcal, 900)
        XCTAssertEqual(merged.first { $0.clientEntryId == "pending" }?.id, "pending", "keeps the server id")
    }

    func testRefreshThrottle() {
        let now = Date()
        XCTAssertTrue(NutritionStore.shouldRefresh(lastRefreshAt: nil, now: now, force: false))
        XCTAssertFalse(NutritionStore.shouldRefresh(lastRefreshAt: now.addingTimeInterval(-30), now: now, force: false))
        XCTAssertTrue(NutritionStore.shouldRefresh(lastRefreshAt: now.addingTimeInterval(-30), now: now, force: true))
        XCTAssertTrue(NutritionStore.shouldRefresh(lastRefreshAt: now.addingTimeInterval(-61), now: now, force: false))
    }
}
