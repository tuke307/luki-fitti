import XCTest
@testable import LukiFittiModels

/// Decoding for the personal API key DTOs (`GET /api/api-keys` → `{data: ApiKeyListDto}`).
final class ApiKeyDTODecodingTests: XCTestCase {
    private struct Envelope<T: Decodable>: Decodable {
        let data: T
    }

    func testListDecodes() throws {
        let json = Data(#"""
        {
          "data": {
            "enabled": true,
            "keys": [
              {
                "id": "imka4jyp",
                "prefix": "lf_pat_imka4jyp",
                "name": "Shortcuts",
                "scopes": ["read:sessions", "export"],
                "createdAt": "2026-11-10T09:00:00.000Z",
                "expiresAt": "2027-02-08T09:00:00.000Z",
                "lastUsedAt": null,
                "status": "active"
              },
              {
                "id": "abc23def",
                "prefix": "lf_pat_abc23def",
                "name": "Old key",
                "scopes": ["read:profile"],
                "createdAt": "2026-01-01T00:00:00.000Z",
                "expiresAt": null,
                "lastUsedAt": "2026-03-01T12:00:00.000Z",
                "status": "expired"
              }
            ]
          }
        }
        """#.utf8)
        let list = try JSONDecoder().decode(Envelope<ApiKeyListDto>.self, from: json).data
        XCTAssertTrue(list.enabled)
        XCTAssertEqual(list.keys.count, 2)
        XCTAssertEqual(list.keys[0].status, .active)
        XCTAssertEqual(list.keys[0].scopes, ["read:sessions", "export"])
        XCTAssertNil(list.keys[0].lastUsedAt)
        XCTAssertEqual(list.keys[1].status, .expired)
        XCTAssertNil(list.keys[1].expiresAt)
    }

    /// Scopes the app doesn't know yet must not break decoding.
    func testUnknownScopeStringsPassThrough() throws {
        let json = Data(#"""
        {
          "id": "zzzz9999",
          "prefix": "lf_pat_zzzz9999",
          "name": "Future",
          "scopes": ["read:whatever-next"],
          "createdAt": "2026-11-10T09:00:00.000Z",
          "expiresAt": null,
          "lastUsedAt": null,
          "status": "active"
        }
        """#.utf8)
        let key = try JSONDecoder().decode(ApiKeyDto.self, from: json)
        XCTAssertEqual(key.scopes, ["read:whatever-next"])
    }
}
