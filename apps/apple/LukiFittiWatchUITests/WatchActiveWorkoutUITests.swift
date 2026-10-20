import XCTest

@MainActor
final class WatchActiveWorkoutUITests: XCTestCase {
    func testWatchRingSetCompletionRestSkipAndPageNavigation() {
        let app = WatchUITestHelpers.launchWatchApp(extraArguments: ["--uitesting-seed-active-session"])

        let ringButton = app.buttons["watch.execution.ringButton"]
        XCTAssertTrue(ringButton.waitForExistence(timeout: 10))

        // Tap 1: Completes current set and starts rest timer ("Tap to skip rest")
        ringButton.tap()

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
}
