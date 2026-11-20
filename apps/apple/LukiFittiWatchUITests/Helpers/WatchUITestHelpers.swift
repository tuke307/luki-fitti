import XCTest

enum WatchUITestHelpers {
    /// Launch `LukiFittiWatch` with isolated temporary storage and optional seed arguments.
    @MainActor
    static func launchWatchApp(extraArguments: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--uitesting"] + extraArguments
        app.launch()
        return app
    }

    /// Completing a set opens the "How did it feel?" effort prompt, which swallows the next
    /// taps until it is answered or dismissed. Tests that keep interacting with the
    /// workout close it here without rating (mirrors the sheet's close button).
    @MainActor
    @discardableResult
    static func dismissEffortPrompt(in app: XCUIApplication, timeout: TimeInterval = 5) -> Bool {
        let dismiss = app.buttons["watch.effort.dismiss"]
        guard dismiss.waitForExistence(timeout: 2) else { return true }
        dismiss.tap()
        return dismiss.waitForNonExistence(timeout: timeout)
    }
}
