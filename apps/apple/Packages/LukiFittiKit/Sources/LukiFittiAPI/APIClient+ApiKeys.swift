import Foundation
import LukiFittiModels

/// Personal API key management (session-authenticated app routes, `/api/api-keys`).
extension APIClient {
    /// Keys that are not revoked; expired keys stay listed until the server drops them.
    public func fetchApiKeys() async throws -> ApiKeyListDto {
        try await request(path: "/api/api-keys", method: "GET")
    }

    /// Revoke works even while the feature is switched off.
    public func revokeApiKey(id: String) async throws {
        struct Resp: Decodable { let success: Bool? }
        let _: Resp = try await request(
            path: "/api/api-keys/\(Self.pathComponent(id))", method: "DELETE")
    }
}
