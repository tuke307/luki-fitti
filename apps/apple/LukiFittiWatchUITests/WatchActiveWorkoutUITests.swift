import XCTest

@MainActor
final class WatchActiveWorkoutUITests: XCTestCase {
    func testWatchRingSetCompletionRestSkipAndPageNavigation() {
        let app = WatchUITestHelpers.launchWatchApp(extraArguments: ["--uitesting-seed-active-session"])

        let ringButton = app.buttons["watch.execution.ringButton"]
        XCTAssertTrue(ringButton.waitForExistence(timeout: 10))

        // Tap 1: Completes current set and starts rest timer ("Tap to skip rest")
        ringButton.tap()
        XCTAssertTrue(WatchUITestHelpers.dismissEffortPrompt(in: app))

        // Tap 2: Skips running rest timer and advances to next set
        if ringButton.exists {
            ringButton.tap()
        }

        // Swipe right to Page 1 (2x2 Action Grid: Change, Edit, Pause, Finish)
        app.swipeRight()
        let pauseTile = app.buttons["watch.action.pause"]
        if pauseTile.waitForExistence(timeout: 5) {
            pauseTile.tap()
            // Tapping Pause toggles status and returns to Page 2
            XCTAssertTrue(ringButton.waitForExistence(timeout: 5))
        }
    }

    func testEffortPromptRatesSetAndDismisses() {
        let app = WatchUITestHelpers.launchWatchApp(extraArguments: ["--uitesting-seed-active-session"])

        // Complete a set: the effort sheet appears.
        let ringButton = app.buttons["watch.execution.ringButton"]
        XCTAssertTrue(ringButton.waitForExistence(timeout: 10))
        ringButton.tap()

        XCTAssertTrue(app.staticTexts["watch.effort.prompt"].waitForExistence(timeout: 5))
        let maxOption = app.buttons["watch.effort.option.max"]
        XCTAssertTrue(maxOption.waitForExistence(timeout: 2))
        maxOption.tap()

        // Answered: the sheet closes and the rest screen shows.
        XCTAssertTrue(maxOption.waitForNonExistence(timeout: 5))
        XCTAssertTrue(ringButton.waitForExistence(timeout: 5))
    }

    func testEffortPromptAutoDismissesWithoutRating() {
        let app = WatchUITestHelpers.launchWatchApp(extraArguments: ["--uitesting-seed-active-session"])

        let ringButton = app.buttons["watch.execution.ringButton"]
        XCTAssertTrue(ringButton.waitForExistence(timeout: 10))
        ringButton.tap()

        let maxOption = app.buttons["watch.effort.option.max"]
        XCTAssertTrue(maxOption.waitForExistence(timeout: 5))
        XCTAssertTrue(maxOption.waitForNonExistence(timeout: 8))
    }

    func testEffortPromptHiddenWhenRatingDisabled() {
        let app = WatchUITestHelpers.launchWatchApp(extraArguments: [
            "--uitesting-seed-active-session",
            "--uitesting-effort-off",
        ])
        let ringButton = app.buttons["watch.execution.ringButton"]
        XCTAssertTrue(ringButton.waitForExistence(timeout: 10))
        ringButton.tap()

        XCTAssertFalse(app.buttons["watch.effort.option.max"].waitForExistence(timeout: 3))
        // Rest screen shows instead (the ring button becomes "tap to skip rest").
        XCTAssertTrue(ringButton.waitForExistence(timeout: 10))
    }
}
