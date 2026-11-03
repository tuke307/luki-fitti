import XCTest
@testable import LukiFittiDesign

final class FeedbackMailTests: XCTestCase {
    func testEnglishLink() throws {
        let url = try XCTUnwrap(
            FeedbackMail.featureRequestURL(locale: "en", appVersion: "1.0.0 (1)", os: "iOS 26.1")
        )
        let s = url.absoluteString
        XCTAssertTrue(s.hasPrefix("mailto:tonymeissner70@gmail.com?"))
        XCTAssertTrue(s.contains("subject=LukiFitti%20%E2%80%93%20Feature%20request"))
        XCTAssertFalse(s.contains("+"))
        XCTAssertTrue(s.contains("What%20would%20you%20like%3F"))
        XCTAssertTrue(s.contains("%0A"))
        XCTAssertTrue(s.contains("(iOS)"))
        XCTAssertTrue(s.contains("System:%20iOS%2026.1"))
    }

    func testGermanLink() throws {
        let url = try XCTUnwrap(FeedbackMail.featureRequestURL(locale: "de", appVersion: "1.0.0 (1)"))
        let s = url.absoluteString
        XCTAssertTrue(s.contains("subject=LukiFitti%20%E2%80%93%20Feature-Wunsch"))
        XCTAssertTrue(s.contains("Was%20w%C3%BCnschst%20du%20dir%3F"))
        XCTAssertTrue(s.contains("Wobei%20w%C3%BCrde%20dir%20das%20helfen%3F"))
        XCTAssertFalse(s.contains("System:"))
    }
}
