import XCTest

@MainActor
final class IOSSyncConflictUITests: XCTestCase {
    func testSyncConflictAlertAppearsAndResolves() {
        let app = IOSUITestHelpers.launchApp(extraArguments: ["--uitesting-seed-conflict"])

        let conflictAlert = app.alerts["Workout Sync Conflict Detected"]
        XCTAssertTrue(conflictAlert.waitForExistence(timeout: 10))

        let keepLocalBtn = conflictAlert.buttons["Keep Local Workout Data"]
        XCTAssertTrue(keepLocalBtn.exists)
        keepLocalBtn.tap()

        XCTAssertFalse(conflictAlert.exists)
    }
}
