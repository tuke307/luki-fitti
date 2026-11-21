import Foundation
import LukiFittiModels

public enum WebAuthnError: Error, Equatable, Sendable {
    /// A required field is missing or not valid base64url — names the field.
    case invalidOptions(String)
}

/// Maps the @simplewebauthn options JSON the API emits onto the byte arrays
/// AuthenticationServices wants, and back into the response JSON it verifies.
public enum WebAuthnJSON {
    public struct RegistrationOptions: Sendable, Equatable {
        public var rpId: String
        public var challenge: Data
        public var userId: Data
        public var userName: String
        public var userDisplayName: String?
        public var excludedCredentialIds: [Data]
    }

    public struct RequestOptions: Sendable, Equatable {
        public var rpId: String
        public var challenge: Data
        public var allowCredentialIds: [Data]
    }

    /// Parses `generateRegistrationOptions` output (`challenge`, `user.id`, `excludeCredentials[].id`
    /// are base64url strings).
    public static func parseRegistrationOptions(_ json: [String: Any]) throws -> RegistrationOptions {
        guard let challenge = try base64Field(json, "challenge") else {
            throw WebAuthnError.invalidOptions("challenge")
        }
        let rp = json["rp"] as? [String: Any]
        guard let rpId = rp?["id"] as? String ?? rp?["name"] as? String, !rpId.isEmpty else {
            throw WebAuthnError.invalidOptions("rp.id")
        }
        guard let user = json["user"] as? [String: Any],
              let userIdRaw = user["id"] as? String,
              let userId = Base64URL.decode(userIdRaw) else {
            throw WebAuthnError.invalidOptions("user.id")
        }
        guard let userName = user["name"] as? String else {
            throw WebAuthnError.invalidOptions("user.name")
        }
        let excluded = (json["excludeCredentials"] as? [[String: Any]] ?? []).compactMap {
            ($0["id"] as? String).flatMap(Base64URL.decode)
        }
        return RegistrationOptions(
            rpId: rpId,
            challenge: challenge,
            userId: userId,
            userName: userName,
            userDisplayName: user["displayName"] as? String,
            excludedCredentialIds: excluded
        )
    }

    /// Parses `generateAuthenticationOptions` output (`challenge`, `allowCredentials[].id`).
    public static func parseRequestOptions(_ json: [String: Any]) throws -> RequestOptions {
        guard let challenge = try base64Field(json, "challenge") else {
            throw WebAuthnError.invalidOptions("challenge")
        }
        guard let rpId = json["rpId"] as? String, !rpId.isEmpty else {
            throw WebAuthnError.invalidOptions("rpId")
        }
        let allowed = (json["allowCredentials"] as? [[String: Any]] ?? []).compactMap {
            ($0["id"] as? String).flatMap(Base64URL.decode)
        }
        return RequestOptions(rpId: rpId, challenge: challenge, allowCredentialIds: allowed)
    }

    /// Attestation response the API's `verifyRegistration` expects (@simplewebauthn shape).
    public static func registrationResponse(
        credentialId: Data,
        clientDataJSON: Data,
        attestationObject: Data
    ) -> [String: Any] {
        [
            "id": Base64URL.encode(credentialId),
            "rawId": Base64URL.encode(credentialId),
            "type": "public-key",
            "response": [
                "clientDataJSON": Base64URL.encode(clientDataJSON),
                "attestationObject": Base64URL.encode(attestationObject),
                "transports": ["internal", "hybrid"],
            ],
            "clientExtensionResults": [:] as [String: Any],
            "authenticatorAttachment": "platform",
        ]
    }

    /// Assertion response the API's `verifyLogin` expects.
    public static func assertionResponse(
        credentialId: Data,
        clientDataJSON: Data,
        authenticatorData: Data,
        signature: Data,
        userHandle: Data?
    ) -> [String: Any] {
        var response: [String: Any] = [
            "clientDataJSON": Base64URL.encode(clientDataJSON),
            "authenticatorData": Base64URL.encode(authenticatorData),
            "signature": Base64URL.encode(signature),
        ]
        if let userHandle {
            response["userHandle"] = Base64URL.encode(userHandle)
        }
        return [
            "id": Base64URL.encode(credentialId),
            "rawId": Base64URL.encode(credentialId),
            "type": "public-key",
            "response": response,
            "clientExtensionResults": [:] as [String: Any],
            "authenticatorAttachment": "platform",
        ]
    }

    /// Wraps a response dict as `JSONValue` for the Codable request bodies.
    public static func jsonValue(_ dict: [String: Any]) throws -> JSONValue {
        let data = try JSONSerialization.data(withJSONObject: dict)
        return try JSONDecoder().decode(JSONValue.self, from: data)
    }

    /// Parses a `JSONValue` (opaque `options` from the API) into a Foundation dict.
    public static func objectDictionary(_ value: JSONValue) throws -> [String: Any] {
        guard let dict = value.foundationObject as? [String: Any] else {
            throw WebAuthnError.invalidOptions("options")
        }
        return dict
    }

    private static func base64Field(_ json: [String: Any], _ key: String) throws -> Data? {
        guard let raw = json[key] as? String else { return nil }
        return Base64URL.decode(raw)
    }
}
