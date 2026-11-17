import XCTest

@MainActor
final class IOSRaidCelebrationUITests: XCTestCase {
    /// --uitesting-seed-raid-result seeds an unseen DEFEATED raid result; the celebration
    /// must present as a full-screen cover and Continue must dismiss it.
    func testRaidDefeatedCelebrationContinueDismissesCover() {
        let app = IOSUITestHelpers.launchApp(extraArguments: ["--uitesting-seed-raid-result"])

        IOSUITestHelpers.navigateToTab(app, label: "Social")

        let celebration = app.otherElements["ios.raid.celebration"]
        XCTAssertTrue(celebration.waitForExistence(timeout: 10), "Expected raid celebration cover")

        let continueButton = app.buttons["ios.raid.celebrationContinue"]
        XCTAssertTrue(continueButton.waitForExistence(timeout: 5))
        continueButton.tap()

        XCTAssertTrue(
            celebration.waitForNonExistence(timeout: 5),
            "Continue should dismiss the raid celebration cover"
        )
    }
}
