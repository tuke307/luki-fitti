import XCTest
import LukiFittiModels

final class SessionSourceDeviceTests: XCTestCase {
    private func decode(_ raw: String) throws -> SessionSourceDevice {
        try JSONDecoder().decode(SessionSourceDevice.self, from: Data("\"\(raw)\"".utf8))
    }

    func testDecodesKnownSourcesIncludingImport() throws {
        XCTAssertEqual(try decode("IMPORT"), .IMPORT)
        XCTAssertEqual(try decode("APPLE_WATCH"), .APPLE_WATCH)
    }

    func testUnknownSourceFallsBackToWebInsteadOfFailing() throws {
        XCTAssertEqual(try decode("ANDROID"), .WEB)
    }

    func testEncodesTheRawValue() throws {
        XCTAssertEqual(String(decoding: try JSONEncoder().encode(SessionSourceDevice.IMPORT), as: UTF8.self), "\"IMPORT\"")
    }
}
