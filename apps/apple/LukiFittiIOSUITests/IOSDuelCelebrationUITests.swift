import XCTest

@MainActor
final class IOSDuelCelebrationUITests: XCTestCase {
    /// --uitesting-seed-duel-result seeds an unseen WON duel result; the celebration must
    /// present as a full-screen cover and Continue must dismiss it.
    func testDuelWonCelebrationContinueDismissesCover() {
        let app = IOSUITestHelpers.launchApp(extraArguments: ["--uitesting-seed-duel-result"])

        IOSUITestHelpers.navigateToTab(app, label: "Social")

        let celebration = app.otherElements["ios.duel.celebration"]
        XCTAssertTrue(celebration.waitForExistence(timeout: 10), "Expected duel celebration cover")

        let continueButton = app.buttons["ios.duel.celebrationContinue"]
        XCTAssertTrue(continueButton.waitForExistence(timeout: 5))
        continueButton.tap()

        XCTAssertTrue(
            celebration.waitForNonExistence(timeout: 5),
            "Continue should dismiss the duel celebration cover"
        )
    }
}
