import XCTest

/// Watch marketing shot (screenshots.json `watch`): an active workout showing live bpm.
/// `…En` / `…De` variants run in the matching locale.
final class MarketingScreenshotsUITests: XCTestCase {
    private var lang: String { name.hasSuffix("De") ? "de" : "en" }

    @MainActor
    private func shot() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--uitesting",
            "--uitesting-marketing",
            "-AppleLanguages", "(\(lang))",
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

    @MainActor func test03WatchWorkoutEn() { shot() }
    @MainActor func test03WatchWorkoutDe() { shot() }
}
