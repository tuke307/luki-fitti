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

        // Scroll down to Finish & Save Workout button
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
}
