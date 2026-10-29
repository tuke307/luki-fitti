import XCTest

@MainActor
final class IOSExercisesAndStretchingUITests: XCTestCase {
    func testCatalogSearchAndStartStretchingSession() {
        let app = IOSUITestHelpers.launchApp()
        IOSUITestHelpers.navigateToTab(app, label: "Library")

        let searchField = app.textFields["Search exercises"]
        XCTAssertTrue(searchField.waitForExistence(timeout: 8))
        searchField.tap()
        searchField.typeText("Barbell Bench Press")

        let benchRow = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Barbell Bench Press'")).firstMatch
        XCTAssertTrue(benchRow.waitForExistence(timeout: 5))

        // Tapping a row opens its how-to guide
        benchRow.tap()
        XCTAssertTrue(app.descendants(matching: .any)["ios.exerciseGuide.sheet"].waitForExistence(timeout: 5))
        app.buttons["ios.exerciseGuide.doneButton"].tap()

        // Switch segmented control to Stretching Studio
        let stretchingSegment = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Stretching'")).firstMatch
        if stretchingSegment.exists {
            stretchingSegment.tap()
            let startStretchBtn = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'ios.library.startRoutine.'")).firstMatch
            XCTAssertTrue(startStretchBtn.waitForExistence(timeout: 5))
            startStretchBtn.tap()

            // Verify stretching session started in Live Gym
            XCTAssertTrue(app.buttons["ios.session.completeSet.1"].waitForExistence(timeout: 8))
        }
    }
}
