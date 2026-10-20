import XCTest

enum IOSUITestHelpers {
    /// Launch `LukiFittiIOS` with isolated temporary storage and optional seed arguments.
    @MainActor
    static func launchApp(extraArguments: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--uitesting"] + extraArguments
        app.launch()
        return app
    }

    /// Tap a tab in the bottom `TabView` bar by its label (`Home`, `Workouts`, `Live Gym`, `Diary`, `Exercises`, `Profile`).
    @MainActor
    static func navigateToTab(_ app: XCUIApplication, label: String) {
        let tabButton = app.tabBars.buttons[label]
        XCTAssertTrue(tabButton.waitForExistence(timeout: 8), "Expected tab '\(label)' to exist")
        tabButton.tap()
    }
}
