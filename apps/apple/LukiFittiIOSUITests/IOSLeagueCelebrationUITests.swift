import XCTest

@MainActor
final class IOSLeagueCelebrationUITests: XCTestCase {
    /// --uitesting-seed-league-celebration seeds an unseen PROMOTED result; the
    /// celebration must present as a full-screen cover and Continue must dismiss it.
    func testPromotionCelebrationContinueDismissesCover() {
        let app = IOSUITestHelpers.launchApp(extraArguments: ["--uitesting-seed-league-celebration"])

        IOSUITestHelpers.navigateToTab(app, label: "Social")

        let celebration = app.otherElements["ios.league.celebration"]
        XCTAssertTrue(celebration.waitForExistence(timeout: 10), "Expected celebration cover")

        let continueButton = app.buttons["ios.league.celebrationContinue"]
        XCTAssertTrue(continueButton.waitForExistence(timeout: 5))
        continueButton.tap()

        XCTAssertTrue(
            celebration.waitForNonExistence(timeout: 5),
            "Continue should dismiss the celebration cover"
        )
    }
}
