import XCTest

final class IOSNutritionUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    @MainActor
    func testLogsAMealByHandOnTheFoodTab() {
        let app = IOSUITestHelpers.launchApp()
        IOSUITestHelpers.navigateToTab(app, label: "Food")

        XCTAssertTrue(app.staticTexts["Nothing logged yet."].waitForExistence(timeout: 8))
        app.buttons["ios.nutrition.addMealButton"].tap()

        let name = app.textFields["Food"].firstMatch
        XCTAssertTrue(name.waitForExistence(timeout: 5))
        name.tap()
        name.typeText("Greek yogurt")

        let kcal = app.textFields["ios.nutrition.item.kcal"].firstMatch
        kcal.tap()
        kcal.typeText("190")

        app.buttons["ios.nutrition.saveMealButton"].tap()
        XCTAssertTrue(app.staticTexts["Greek yogurt"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["190"].exists)
    }
}
