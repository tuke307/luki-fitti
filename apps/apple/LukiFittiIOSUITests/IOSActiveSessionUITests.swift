import XCTest

@MainActor
final class IOSActiveSessionUITests: XCTestCase {
    func testActiveWorkoutSetLoggingRestTimerAndTrophySummary() {
        let app = IOSUITestHelpers.launchApp(extraArguments: ["--uitesting-seed-active-session"])

        // Seeded active session opens on Live Gym tab
        let completeSet1Button = app.buttons["ios.session.completeSet.1"]
        XCTAssertTrue(completeSet1Button.waitForExistence(timeout: 10))
        completeSet1Button.tap()

        // Complete Set 2 (Working set with rest > 0s) or trigger 90s preset timer
        if app.buttons["90s"].exists {
            app.buttons["90s"].tap()
        }

        let headerTimerPill = app.buttons["ios.header.restTimerPill"]
        XCTAssertTrue(headerTimerPill.waitForExistence(timeout: 5))

        if app.buttons["Skip Rest"].exists {
            app.buttons["Skip Rest"].tap()
        }

        // Scroll down to the Finish Workout button
        let finishBtn = app.buttons["ios.session.finishButton"]
        var scrollAttempts = 0
        while !finishBtn.isHittable && scrollAttempts < 5 {
            app.swipeUp()
            scrollAttempts += 1
        }
        XCTAssertTrue(finishBtn.waitForExistence(timeout: 5))
        finishBtn.tap()

        // Verify Trophy Summary Card & navigate to Diary
        let viewInDiaryBtn = app.buttons["ios.session.viewInDiaryButton"]
        XCTAssertTrue(viewInDiaryBtn.waitForExistence(timeout: 8))
        viewInDiaryBtn.tap()

        XCTAssertTrue(app.navigationBars["History"].waitForExistence(timeout: 5))
    }

    func testReopensTheExerciseTheUserWasOnAfterMinimizing() {
        let app = IOSUITestHelpers.launchApp(extraArguments: ["--uitesting-seed-active-session"])

        let completeSet1Button = app.buttons["ios.session.completeSet.1"]
        XCTAssertTrue(completeSet1Button.waitForExistence(timeout: 10))
        completeSet1Button.tap()

        let secondRow = app.buttons["ios.session.exerciseRow.2"]
        XCTAssertTrue(secondRow.waitForExistence(timeout: 5))
        secondRow.tap()
        XCTAssertTrue(app.descendants(matching: .any)["ios.session.exerciseHeader.2"].waitForExistence(timeout: 5))

        app.buttons["ios.session.minimizeButton"].tap()
        let accessory = app.buttons["ios.shell.sessionAccessory"]
        XCTAssertTrue(accessory.waitForExistence(timeout: 5))
        accessory.tap()

        XCTAssertTrue(app.descendants(matching: .any)["ios.session.exerciseHeader.2"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.descendants(matching: .any)["ios.session.exerciseHeader.1"].exists)
    }
}
