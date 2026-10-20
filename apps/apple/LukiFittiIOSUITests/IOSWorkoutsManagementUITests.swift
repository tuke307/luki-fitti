import XCTest

@MainActor
final class IOSWorkoutsManagementUITests: XCTestCase {
    func testCollapseExpandFoldersAndCreateNewFolder() {
        let app = IOSUITestHelpers.launchApp()
        IOSUITestHelpers.navigateToTab(app, label: "Workouts")

        let collapseBtn = app.buttons["ios.workouts.collapseAllButton"]
        XCTAssertTrue(collapseBtn.waitForExistence(timeout: 8))
        collapseBtn.tap()
        collapseBtn.tap()

        // Open Create Folder Sheet
        let newFolderBtn = app.buttons["ios.workouts.newFolderButton"]
        XCTAssertTrue(newFolderBtn.exists)
        newFolderBtn.tap()

        let folderField = app.textFields["Folder Name (e.g. 4er Split)"]
        XCTAssertTrue(folderField.waitForExistence(timeout: 5))
        folderField.tap()
        folderField.typeText("E2E iOS Split")

        app.buttons["Save Folder"].tap()
        XCTAssertTrue(app.staticTexts["E2E iOS Split"].waitForExistence(timeout: 5))
    }

    func testOpenTemplateBuilderSheetAndCreateWorkout() {
        let app = IOSUITestHelpers.launchApp()
        IOSUITestHelpers.navigateToTab(app, label: "Workouts")

        let newWorkoutBtn = app.buttons["ios.workouts.newWorkoutButton"]
        XCTAssertTrue(newWorkoutBtn.waitForExistence(timeout: 8))
        newWorkoutBtn.tap()

        let nameField = app.textFields["e.g. Push A — Chest, Shoulders & Triceps"]
        XCTAssertTrue(nameField.waitForExistence(timeout: 5))
        nameField.tap()
        nameField.typeText("E2E iOS Bench Day")

        app.buttons["Create"].tap()
        XCTAssertTrue(app.staticTexts["E2E iOS Bench Day"].waitForExistence(timeout: 5))
    }
}
