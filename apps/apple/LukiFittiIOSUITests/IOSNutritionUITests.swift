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

    @MainActor
    func testSingleAddMealButtonAndDrinkInMillilitres() {
        let app = IOSUITestHelpers.launchApp()
        IOSUITestHelpers.navigateToTab(app, label: "Food")

        let add = app.buttons["ios.nutrition.addMealButton"]
        XCTAssertTrue(add.waitForExistence(timeout: 8))
        // Photos moved into the meal editor; there is no separate photo button any more.
        XCTAssertFalse(app.buttons["ios.nutrition.photoButton"].exists)
        add.tap()

        let name = app.textFields["Food"].firstMatch
        XCTAssertTrue(name.waitForExistence(timeout: 5))
        name.tap()
        name.typeText("Iced tea")

        let amount = app.textFields["ios.nutrition.item.grams"].firstMatch
        amount.tap()
        amount.typeText("500")

        let unit = app.buttons["ios.nutrition.item.unit"].firstMatch
        XCTAssertTrue(unit.waitForExistence(timeout: 5))
        unit.tap()
        let ml = app.buttons["ml"].firstMatch
        XCTAssertTrue(ml.waitForExistence(timeout: 5))
        ml.tap()

        app.buttons["ios.nutrition.saveMealButton"].tap()
        XCTAssertTrue(app.staticTexts["Iced tea"].waitForExistence(timeout: 5))
        let subtitle = app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "500 ml")).firstMatch
        XCTAssertTrue(subtitle.waitForExistence(timeout: 5))
    }
}
