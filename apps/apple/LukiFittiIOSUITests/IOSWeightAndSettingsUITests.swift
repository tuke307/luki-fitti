import XCTest

@MainActor
final class IOSWeightAndSettingsUITests: XCTestCase {
    func testTodayWeightCardLogsAndPushesWeightScreen() {
        let app = IOSUITestHelpers.launchApp()

        let logButton = app.buttons["ios.home.logWeightButton"]
        XCTAssertTrue(logButton.waitForExistence(timeout: 10))
        logButton.tap()

        let save = app.buttons["ios.weight.saveButton"]
        XCTAssertTrue(save.waitForExistence(timeout: 5))
        save.tap()

        let card = app.buttons["ios.home.weightCard"]
        XCTAssertTrue(card.waitForExistence(timeout: 5))
        expectation(for: NSPredicate(format: "label CONTAINS 'kg'"), evaluatedWith: card)
        waitForExpectations(timeout: 5)
        card.tap()
        XCTAssertTrue(app.navigationBars["Weight"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any)["ios.weight.currentValue"].exists)

        // Pushed, not presented: the back button returns to Today.
        app.navigationBars["Weight"].buttons.firstMatch.tap()
        XCTAssertTrue(app.buttons["ios.home.weightCard"].waitForExistence(timeout: 5))
    }

    func testProfileGroupsHealthDetailsAndNutritionGoals() {
        let app = IOSUITestHelpers.launchApp()
        IOSUITestHelpers.navigateToTab(app, label: "Profile")
        XCTAssertTrue(app.navigationBars["Profile"].waitForExistence(timeout: 5))

        let health = app.buttons["ios.profile.healthDetailsRow"]
        XCTAssertTrue(health.waitForExistence(timeout: 5))
        health.tap()
        XCTAssertTrue(app.navigationBars["Health details"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["ios.profile.currentWeightRow"].exists)
        app.navigationBars["Health details"].buttons.firstMatch.tap()

        let goals = app.buttons["ios.profile.nutritionGoalsRow"]
        XCTAssertTrue(goals.waitForExistence(timeout: 5))
        goals.tap()
        XCTAssertTrue(app.navigationBars["Nutrition goals"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.textFields["ios.nutritionGoals.kcalField"].exists)
    }

    func testFoodSummaryOpensNutritionGoals() {
        let app = IOSUITestHelpers.launchApp()
        IOSUITestHelpers.navigateToTab(app, label: "Food")

        let goals = app.buttons["ios.nutrition.goalsButton"]
        XCTAssertTrue(goals.waitForExistence(timeout: 8))
        goals.tap()
        XCTAssertTrue(app.navigationBars["Nutrition goals"].waitForExistence(timeout: 5))
        app.buttons["ios.nutritionGoals.doneButton"].tap()
        XCTAssertTrue(goals.waitForExistence(timeout: 5))
    }
}
