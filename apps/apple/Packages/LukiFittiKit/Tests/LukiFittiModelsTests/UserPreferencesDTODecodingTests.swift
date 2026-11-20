import XCTest
@testable import LukiFittiModels

/// `UserPreferencesDto` decoding — new preference keys added server-side must default on
/// older app versions that predate them (`missing key` = default, not decode failure).
final class UserPreferencesDTODecodingTests: XCTestCase {
    func testMissingEffortTrackingEnabledDecodesAsTrue() throws {
        let json = Data(#"""
        {
          "id": "pref-1",
          "userId": "user-1",
          "weightUnit": "KG",
          "distanceUnit": "KM",
          "defaultRestSeconds": 90,
          "theme": "system",
          "restTimerSound": true,
          "weeklyGoalSessions": 4
        }
        """#.utf8)
        let prefs = try JSONDecoder().decode(UserPreferencesDto.self, from: json)
        XCTAssertTrue(prefs.effortTrackingEnabled)
    }

    func testExplicitEffortTrackingEnabledDecodes() throws {
        let json = Data(#"""
        {
          "id": "pref-1",
          "userId": "user-1",
          "weightUnit": "KG",
          "distanceUnit": "KM",
          "defaultRestSeconds": 90,
          "theme": "system",
          "restTimerSound": true,
          "weeklyGoalSessions": 4,
          "effortTrackingEnabled": false
        }
        """#.utf8)
        let prefs = try JSONDecoder().decode(UserPreferencesDto.self, from: json)
        XCTAssertFalse(prefs.effortTrackingEnabled)
    }
}
