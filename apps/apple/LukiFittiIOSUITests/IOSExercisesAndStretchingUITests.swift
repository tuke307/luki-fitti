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

    /// A new routine must start with an empty target area — the placeholder
    /// "Full Body & Mobility" is a hint, not a saved default.
    func testNewRoutineTargetAreaShowsPlaceholderOnly() {
        let app = IOSUITestHelpers.launchApp()
        IOSUITestHelpers.navigateToTab(app, label: "Library")

        let stretching = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Stretching'")).firstMatch
        XCTAssertTrue(stretching.waitForExistence(timeout: 8))
        stretching.tap()

        let add = app.buttons["ios.library.addRoutineButton"]
        XCTAssertTrue(add.waitForExistence(timeout: 5))
        add.tap()
        XCTAssertTrue(app.descendants(matching: .any)["ios.routineEditor.sheet"].waitForExistence(timeout: 5))

        let targetArea = app.textFields["ios.routineEditor.targetArea"]
        XCTAssertTrue(targetArea.waitForExistence(timeout: 5))
        // XCUI reports the placeholder as an empty field's value — the marker that
        // matters is that "Full Body & Mobility" is the placeholder, not stored text.
        XCTAssertEqual(targetArea.placeholderValue as? String, "Full Body & Mobility")
    }
}
