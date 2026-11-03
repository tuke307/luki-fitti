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

    @MainActor
    func test01ActiveWorkout() {
        let app = launchMarketingApp(language: "en")
        let session = app.buttons["ios.session.workoutView"].firstMatch
        _ = session.waitForExistence(timeout: 15)
        save("01-active-workout")
    }

    @MainActor
    func test02SetSuggestion() {
        let app = launchMarketingApp(language: "en")
        _ = app.buttons["ios.session.workoutView"].firstMatch.waitForExistence(timeout: 15)
        save("02-suggestion")
    }

    @MainActor
    func test04ExerciseLibrary() {
        let app = launchMarketingApp(language: "en")
        let tab = app.tabBars.buttons["Library"].firstMatch
        XCTAssertTrue(tab.waitForExistence(timeout: 15))
        tab.tap()
        sleep(2)
        save("04-exercises")
    }

    @MainActor
    func test05HistoryProgress() {
        let app = launchMarketingApp(language: "en")
        let tab = app.tabBars.buttons["History"].firstMatch
        XCTAssertTrue(tab.waitForExistence(timeout: 15))
        tab.tap()
        sleep(2)
        save("05-history")
    }

    @MainActor
    func test06MealPhoto() {
        let app = launchMarketingApp(language: "en")
        let tab = app.tabBars.buttons["Nutrition"].firstMatch
        XCTAssertTrue(tab.waitForExistence(timeout: 15))
        tab.tap()
        let meal = app.buttons["ios.nutrition.mealRow.marketing-meal"].firstMatch
        _ = meal.waitForExistence(timeout: 10)
        meal.tap()
        sleep(1)
        save("06-meal")
    }
}
