import XCTest

@MainActor
final class IOSNavigationAndDashboardUITests: XCTestCase {
    func testDashboardRendersKPIsAndNavigatesAcrossAllTabs() {
        let app = IOSUITestHelpers.launchApp(extraArguments: ["--uitesting-seed-history"])

        // Top Header & Guest Badge
        XCTAssertTrue(app.buttons["ios.header.homeButton"].waitForExistence(timeout: 10))
        let syncBadge = app.buttons["ios.header.syncBadge"]
        XCTAssertTrue(syncBadge.exists)
        XCTAssertTrue(syncBadge.label.contains("Guest"))

        // Home KPI Cards
        XCTAssertTrue(app.staticTexts["7-Day Frequency"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["30-Day Volume"].exists)

        // Navigate across tabs
        IOSUITestHelpers.navigateToTab(app, label: "Workouts")
        XCTAssertTrue(app.staticTexts["Workout Templates & Splits"].waitForExistence(timeout: 5))

        IOSUITestHelpers.navigateToTab(app, label: "Diary")
        XCTAssertTrue(app.staticTexts["Training Diary & Progress Analytics"].waitForExistence(timeout: 5))

        IOSUITestHelpers.navigateToTab(app, label: "Exercises")
        XCTAssertTrue(app.buttons["All Muscles"].waitForExistence(timeout: 5))

        IOSUITestHelpers.navigateToTab(app, label: "Profile")
        XCTAssertTrue(app.staticTexts["Guest (Local Only)"].exists || app.buttons["ios.header.syncBadge"].exists)

        // Tap brand logo in header to return to Home
        app.buttons["ios.header.homeButton"].tap()
        XCTAssertTrue(app.staticTexts["7-Day Frequency"].waitForExistence(timeout: 5))
    }
}
