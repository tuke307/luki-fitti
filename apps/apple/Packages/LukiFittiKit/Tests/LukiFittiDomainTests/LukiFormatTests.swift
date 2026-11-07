import XCTest
@testable import LukiFittiDesign

final class LukiFormatTests: XCTestCase {
    func testParseDecimalAcceptsCommaAndDot() {
        XCTAssertEqual(LukiFormat.parseDecimal("22,5"), 22.5)
        XCTAssertEqual(LukiFormat.parseDecimal(" 22.5 "), 22.5)
        XCTAssertNil(LukiFormat.parseDecimal("abc"))
        XCTAssertNil(LukiFormat.parseDecimal(""))
    }
}
