import XCTest

/// Marketing screenshot capture — run only via `-only-testing:…/MarketingScreenshotsUITests`
/// (skipped by the normal e2e scripts). Each test saves a screenshot named after the shot id
/// in `marketing/screenshots.json`.
final class MarketingScreenshotsUITests: XCTestCase {
    @MainActor
    private func launchMarketingApp(language: String) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = [
            "--uitesting",
            "--uitesting-marketing",
            "-AppleLanguages", "(\(language))",
            "-AppleInterfaceStyle", "Dark",
        ]
        app.launch()
        return app
    }

    private func save(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    /// The seeded active session presents the full-screen workout view.
    private func waitForWorkoutView(_ app: XCUIApplication) {
        _ = app.buttons["ios.session.finishButton"].firstMatch.waitForExistence(timeout: 20)
    }

    @MainActor
    func test01ActiveWorkout() {
        let app = launchMarketingApp(language: "en")
        waitForWorkoutView(app)
        save("01-active-workout")
    }

    @MainActor
    func test02SetSuggestion() {
        let app = launchMarketingApp(language: "en")
        waitForWorkoutView(app)
        // The next uncompleted set carries the +2.5 kg suggestion from the seeded history.
        _ = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'kg'")).firstMatch
            .waitForExistence(timeout: 10)
        save("02-suggestion")
    }

    @MainActor
    func test04ExerciseLibrary() {
        let app = launchMarketingApp(language: "en")
        let tab = app.tabBars.buttons["Library"].firstMatch
        XCTAssertTrue(tab.waitForExistence(timeout: 15))
        tab.tap()
        sleep(3)
        save("04-exercises")
    }

    @MainActor
    func test05HistoryProgress() {
        let app = launchMarketingApp(language: "en")
        let tab = app.tabBars.buttons["History"].firstMatch
        XCTAssertTrue(tab.waitForExistence(timeout: 15))
        tab.tap()
        sleep(3)
        save("05-history")
    }

    @MainActor
    func test06MealPhoto() {
        let app = launchMarketingApp(language: "en")
        let tab = app.tabBars.buttons["Food"].firstMatch
        XCTAssertTrue(tab.waitForExistence(timeout: 15))
        tab.tap()
        // Open the seeded "Lunch" meal; if the row isn't found we still capture the day view.
        let meal = app.staticTexts["Lunch"].firstMatch
        if meal.waitForExistence(timeout: 8) {
            meal.tap()
            sleep(2)
        }
        save("06-meal")
    }
}
