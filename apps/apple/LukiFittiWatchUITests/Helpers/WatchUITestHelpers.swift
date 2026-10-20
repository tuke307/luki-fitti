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
}
