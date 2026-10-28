import XCTest
import LukiFittiModels
import LukiFittiDesign

final class LukiStringsTests: XCTestCase {
    func testGermanTranslationsKeepEveryPlaceholder() throws {
        let placeholder = try NSRegularExpression(pattern: "%[@d]")
        func placeholders(_ s: String) -> [String] {
            placeholder.matches(in: s, range: NSRange(s.startIndex..., in: s)).map { (s as NSString).substring(with: $0.range) }
        }
        for (english, german) in LukiStrings.german {
            XCTAssertEqual(placeholders(english), placeholders(german), "Placeholder mismatch for “\(english)”")
        }
    }

    func testTranslatorFollowsLocaleAndFallsBackToEnglish() {
        XCTAssertEqual(SupportedLocale.en("Start"), "Start")
        XCTAssertEqual(SupportedLocale.de("Start"), "Starten")
        XCTAssertEqual(SupportedLocale.de("Not in the table"), "Not in the table")
        XCTAssertEqual(SupportedLocale.de("Round %d of %d", 2, 3), "Runde 2 von 3")
    }

    func testVolumeFollowsWeightUnit() {
        XCTAssertEqual(LukiFormat.volumeValue(kg: 1000, unit: .KG), 1000)
        XCTAssertEqual(LukiFormat.volumeValue(kg: 1000, unit: .LBS), 2205)
        XCTAssertEqual(LukiFormat.weightStep(.LBS), 5)
        XCTAssertEqual(LukiFormat.clock(3723), "1:02:03")
    }
}
