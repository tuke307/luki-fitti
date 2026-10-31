import XCTest
import LukiFittiModels

final class AIKeyDTOsTests: XCTestCase {
    func testKeyFormatMatchesTheAPIRule() {
        // Clearly fake keys.
        XCTAssertTrue(SetAiKeyDto.isValidFormat("sk-or-v1-FAKE-KEY-FOR-TESTING-0000000000"))
        XCTAssertTrue(SetAiKeyDto.isValidFormat("  sk-or-v1-FAKE_KEY_FOR_TESTING_000000  "))
        XCTAssertFalse(SetAiKeyDto.isValidFormat("sk-or-short"))
        XCTAssertFalse(SetAiKeyDto.isValidFormat("sk-proj-FAKE-KEY-FOR-TESTING-000000000"))
        XCTAssertFalse(SetAiKeyDto.isValidFormat("sk-or-v1-FAKE KEY WITH SPACES 0000000000"))
        XCTAssertFalse(SetAiKeyDto.isValidFormat("sk-or-v1-FÄKE-KEY-FOR-TESTING-000000000"))
    }

    func testStatusDecodesWithoutKeyMaterial() throws {
        let json = Data(#"{"available":true,"hasKey":true,"source":"USER","own":{"last4":"abcd","updatedAt":"2026-11-04T09:00:00.000Z"},"adminAssigned":false}"#.utf8)
        let status = try JSONDecoder().decode(AiKeyStatusDto.self, from: json)
        XCTAssertEqual(status.source, .USER)
        XCTAssertEqual(status.own?.last4, "abcd")

        let none = Data(#"{"available":true,"hasKey":false,"source":null,"own":null,"adminAssigned":false}"#.utf8)
        XCTAssertNil(try JSONDecoder().decode(AiKeyStatusDto.self, from: none).source)
    }
}
