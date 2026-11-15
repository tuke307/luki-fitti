import XCTest
@testable import LukiFittiDomain

final class AppVersionCompareTests: XCTestCase {
    func testNewerVersions() {
        XCTAssertTrue(AppVersion.isNewer("1.10.0", than: "1.9.2"))
        XCTAssertTrue(AppVersion.isNewer("1.1.1", than: "1.1.0"))
        XCTAssertTrue(AppVersion.isNewer("2.0", than: "1.9.9"))
    }

    func testEqualAndOlderVersions() {
        XCTAssertFalse(AppVersion.isNewer("1.1", than: "1.1.0"))
        XCTAssertFalse(AppVersion.isNewer("1.1.0", than: "1.1.0"))
        XCTAssertFalse(AppVersion.isNewer("1.0.9", than: "1.1.0"))
        XCTAssertFalse(AppVersion.isNewer("0.9.9", than: "1.0.0"))
    }

    func testGarbageNeverCountsAsNewer() {
        XCTAssertFalse(AppVersion.isNewer("abc", than: "1.0.0"))
        XCTAssertFalse(AppVersion.isNewer("1.0.0", than: "abc"))
        XCTAssertFalse(AppVersion.isNewer("", than: "1.0.0"))
        XCTAssertFalse(AppVersion.isNewer("1..2", than: "1.0.0"))
        XCTAssertFalse(AppVersion.isNewer("1.0.beta", than: "1.0.0"))
    }
}

final class AppStoreLookupTests: XCTestCase {
    func testLookupURLContainsIDAndCountry() {
        let url = AppStoreLookup.lookupURL(countryCode: "de").absoluteString
        XCTAssertTrue(url.contains("id=6831508360"))
        XCTAssertTrue(url.contains("country=de"))
    }

    func testDecodesVersionFromResults() {
        let json = #"{"resultCount":1,"results":[{"version":"1.1.0"}]}"#.data(using: .utf8)!
        XCTAssertEqual(AppStoreLookup.decodeVersion(json), "1.1.0")
    }

    func testEmptyResultsReturnNil() {
        let json = #"{"resultCount":0,"results":[]}"#.data(using: .utf8)!
        XCTAssertNil(AppStoreLookup.decodeVersion(json))
    }

    func testMalformedJSONReturnsNil() {
        XCTAssertNil(AppStoreLookup.decodeVersion(Data("not json".utf8)))
        XCTAssertNil(AppStoreLookup.decodeVersion(Data(#"{"results":[{"bundleId":"x"}]}"#.utf8)))
        XCTAssertNil(AppStoreLookup.decodeVersion(Data()))
    }
}
