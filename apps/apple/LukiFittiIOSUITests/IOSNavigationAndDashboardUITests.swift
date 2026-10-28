import XCTest

@MainActor
final class IOSNavigationAndDashboardUITests: XCTestCase {
    func testDashboardRendersKPIsAndNavigatesAcrossAllTabs() {
        let app = IOSUITestHelpers.launchApp(extraArguments: ["--uitesting-seed-history"])

        // Sync status is quiet in the toolbar but stays readable by VoiceOver on the profile button
        let profileButton = app.buttons["ios.header.profileButton"].firstMatch
        XCTAssertTrue(profileButton.waitForExistence(timeout: 10))
        XCTAssertTrue(profileButton.label.contains("Guest"))
        XCTAssertFalse(app.buttons["ios.header.syncBadge"].exists)

        // Today: weekly goal and weekly volume
        XCTAssertTrue(app.staticTexts["This week"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Weekly volume"].exists)

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
