import XCTest
@testable import LukiFittiModels

/// Compares the Swift `NotificationCategories` mirror against the JSON fixture
/// exported from `@luki-fitti/common` (`yarn notifications:export`). A drift
/// fails here — same pattern as `RaidBossPortTests`.
final class NotificationCategoriesPortTests: XCTestCase {
    private struct Fixture: Decodable {
        struct Category: Decodable {
            var id: String
            var pref: String
            var kinds: [String]
        }
        var dailyCap: Int
        var categories: [Category]
        var capExemptKinds: [String]
    }

    private func loadFixture() throws -> Fixture {
        guard let url = Bundle.module.url(
            forResource: "notification_categories",
            withExtension: "json"
        ) else {
            throw XCTSkip("notification_categories.json not in the test bundle")
        }
        return try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: url))
    }

    func testCategoriesMatchTypeScript() throws {
        let fixture = try loadFixture()
        XCTAssertEqual(
            NotificationCategories.all.map { $0.id.rawValue },
            fixture.categories.map(\.id),
            "category order must match the common export"
        )
        for (category, expected) in zip(NotificationCategories.all, fixture.categories) {
            XCTAssertEqual(category.pref.rawValue, expected.pref, category.id.rawValue)
            XCTAssertEqual(
                category.kinds.map(\.rawValue),
                expected.kinds,
                "kinds of \(category.id.rawValue) must match"
            )
        }
    }

    func testCapExemptKindsMatchTypeScript() throws {
        let fixture = try loadFixture()
        XCTAssertEqual(
            NotificationCategories.capExemptKinds.map(\.rawValue).sorted(),
            fixture.capExemptKinds.sorted()
        )
        XCTAssertEqual(NotificationCategories.dailyCap, fixture.dailyCap)
    }

    func testEveryKindIsInExactlyOneCategory() {
        var seen: [SocialNotificationKind: Int] = [:]
        for category in NotificationCategories.all {
            for kind in category.kinds {
                seen[kind, default: 0] += 1
            }
        }
        for kind in SocialNotificationKind.allCases {
            XCTAssertEqual(seen[kind], 1, "\(kind) must be in exactly one category")
        }
        XCTAssertEqual(NotificationCategories.category(of: .FRIEND_REQUEST).id, .friends)
        XCTAssertEqual(NotificationCategories.category(of: .SQUAD_RAID_STARTED).id, .raids)
    }
}
