import XCTest

@MainActor
final class IOSExercisesAndStretchingUITests: XCTestCase {
    func testCatalogSearchAndStartStretchingSession() {
        let app = IOSUITestHelpers.launchApp()
        IOSUITestHelpers.navigateToTab(app, label: "Exercises")

        let searchField = app.textFields["Search 130+ exercises by name, muscle, or German alias..."]
        XCTAssertTrue(searchField.waitForExistence(timeout: 8))
        searchField.tap()
        searchField.typeText("Barbell Bench Press")

        XCTAssertTrue(app.staticTexts["Barbell Bench Press"].waitForExistence(timeout: 5))

        // Switch segmented control to Stretching Studio
        let stretchingSegment = app.buttons.matching(NSPredicate(format: "label CONTAINS 'Stretching Studio'")).firstMatch
        if stretchingSegment.exists {
            stretchingSegment.tap()
            let startStretchBtn = app.buttons["Start Stretching Session"].firstMatch
            XCTAssertTrue(startStretchBtn.waitForExistence(timeout: 5))
            startStretchBtn.tap()

            // Verify stretching session started in Live Gym
            XCTAssertTrue(app.buttons["ios.session.completeSet.1"].waitForExistence(timeout: 8))
        }
    }
}
