import XCTest

/// Watch marketing shot (screenshots.json `watch`): an active workout showing live bpm.
final class MarketingScreenshotsUITests: XCTestCase {
    @MainActor
    func test03WatchWorkout() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--uitesting",
            "--uitesting-marketing",
            "-AppleLanguages", "(en)",
            "-AppleInterfaceStyle", "Dark",
        ]
        app.launch()

        // The seeded active workout shows sets, heart rate and the rest timer.
        sleep(8)
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = "03-watch"
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
