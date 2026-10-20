import XCTest

@MainActor
final class WatchHomeAndStartUITests: XCTestCase {
    func testWatchHomeDisplaysFoldersAndStartsWorkoutFromTemplate() {
        let app = WatchUITestHelpers.launchWatchApp()

        // Starter folder button should exist on WatchHomeView
        let firstFolder = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'watch.home.folder.'")).firstMatch
        XCTAssertTrue(firstFolder.waitForExistence(timeout: 10))
        firstFolder.tap()

        // Tap first workout template card inside folder
        let firstTemplate = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'watch.folder.template.'")).firstMatch
        XCTAssertTrue(firstTemplate.waitForExistence(timeout: 8))
        firstTemplate.tap()

        // Should land on WatchActiveWorkoutView Page 2 with neon-lime completion ring
        let ringButton = app.buttons["watch.execution.ringButton"]
        XCTAssertTrue(ringButton.waitForExistence(timeout: 8))
    }
}
