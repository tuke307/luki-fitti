import XCTest

@MainActor
final class WatchSummaryAndStretchingUITests: XCTestCase {
    func testFinishWorkoutOnWatchDisplaysSummaryAndDismissesToHome() {
        let app = WatchUITestHelpers.launchWatchApp(extraArguments: ["--uitesting-seed-active-session"])

        let ringButton = app.buttons["watch.execution.ringButton"]
        XCTAssertTrue(ringButton.waitForExistence(timeout: 10))
        ringButton.tap()

        // Swipe right to Page 1 (Action Grid) and tap Finish
        app.swipeRight()
        let finishTile = app.buttons["watch.action.finish"]
        XCTAssertTrue(finishTile.waitForExistence(timeout: 5))
        finishTile.tap()

        // Verify WatchWorkoutSummaryView renders
        let summaryTitle = app.staticTexts["watch.summary.title"]
        XCTAssertTrue(summaryTitle.waitForExistence(timeout: 8))

        // Scroll down and tap Done to return to WatchHomeView
        let doneBtn = app.buttons["watch.summary.doneButton"]
        var swipes = 0
        while !doneBtn.isHittable && swipes < 4 {
            app.swipeUp()
            swipes += 1
        }
        XCTAssertTrue(doneBtn.waitForExistence(timeout: 5))
        doneBtn.tap()

        let firstFolder = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'watch.home.folder.'")).firstMatch
        XCTAssertTrue(firstFolder.waitForExistence(timeout: 8))
    }
}
