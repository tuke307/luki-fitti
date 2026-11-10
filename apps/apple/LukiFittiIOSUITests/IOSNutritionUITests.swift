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

        let name = app.textFields["Food or drink"].firstMatch
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

    /// LiveNumberField must show an empty placeholder for a new item — a literal "0"
    /// made typed digits append instead of replace.
    @MainActor
    func testNewItemNumericFieldsStartEmptyAndKeepTypedDecimals() {
        let app = IOSUITestHelpers.launchApp()
        IOSUITestHelpers.navigateToTab(app, label: "Food")
        app.buttons["ios.nutrition.addMealButton"].tap()

        let kcal = app.textFields["ios.nutrition.item.kcal"].firstMatch
        XCTAssertTrue(kcal.waitForExistence(timeout: 5))
        // Empty field: XCUI reports the placeholder as the value.
        XCTAssertEqual(kcal.placeholderValue as? String, "0")
        XCTAssertFalse(kcal.value as? String == "0" && kcal.placeholderValue == nil)
        kcal.tap()
        kcal.typeText("190")
        XCTAssertEqual(kcal.value as? String, "190")

        // Typing a decimal must not be reset while typing.
        let fat = app.textFields["ios.nutrition.item.fat"].firstMatch
        for _ in 0..<4 where !fat.isHittable { app.swipeUp() }
        XCTAssertTrue(fat.waitForExistence(timeout: 5))
        fat.tap()
        fat.typeText("0.5")
        let typed = fat.value as? String
        XCTAssertTrue(typed == "0.5" || typed == "0,5", "expected typed decimal kept, got \(typed ?? "nil")")
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

        let name = app.textFields["Food or drink"].firstMatch
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
