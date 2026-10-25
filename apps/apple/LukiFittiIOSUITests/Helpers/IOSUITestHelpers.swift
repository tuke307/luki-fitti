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

    /// Tap a tab in the bottom `TabView` bar by its label (`Today`, `Workouts`, `History`, `Library`).
    /// `Profile` opens the profile sheet from the toolbar.
    @MainActor
    static func navigateToTab(_ app: XCUIApplication, label: String) {
        if label == "Profile" {
            let profileButton = app.buttons["ios.header.profileButton"].firstMatch
            XCTAssertTrue(profileButton.waitForExistence(timeout: 8), "Expected profile button")
            profileButton.tap()
            return
        }
        let tabButton = app.tabBars.buttons[label]
        XCTAssertTrue(tabButton.waitForExistence(timeout: 8), "Expected tab '\(label)' to exist")
        tabButton.tap()
    }
}
