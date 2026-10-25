import XCTest

@MainActor
final class IOSNavigationAndDashboardUITests: XCTestCase {
    func testDashboardRendersKPIsAndNavigatesAcrossAllTabs() {
        let app = IOSUITestHelpers.launchApp(extraArguments: ["--uitesting-seed-history"])

        // Toolbar sync status (always reachable via accessibility) reports guest mode
        let syncBadge = app.buttons["ios.header.syncBadge"].firstMatch
        XCTAssertTrue(syncBadge.waitForExistence(timeout: 10))
                XCTAssertTrue(syncBadge.label.contains("Guest"))

        // Today: weekly goal and overview
        XCTAssertTrue(app.staticTexts["This week"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Last 30 days"].exists)

        // Navigate across tabs
        IOSUITestHelpers.navigateToTab(app, label: "Workouts")
        XCTAssertTrue(app.navigationBars["Workouts"].waitForExistence(timeout: 5))

        IOSUITestHelpers.navigateToTab(app, label: "History")
        XCTAssertTrue(app.navigationBars["History"].waitForExistence(timeout: 5))

        IOSUITestHelpers.navigateToTab(app, label: "Library")
        XCTAssertTrue(app.buttons["All Muscles"].waitForExistence(timeout: 5))

        IOSUITestHelpers.navigateToTab(app, label: "Profile")
        XCTAssertTrue(app.navigationBars["Profile"].waitForExistence(timeout: 5))
        app.buttons["Done"].firstMatch.tap()

        // Back to Today
        IOSUITestHelpers.navigateToTab(app, label: "Today")
        XCTAssertTrue(app.staticTexts["This week"].waitForExistence(timeout: 5))
    }
}
