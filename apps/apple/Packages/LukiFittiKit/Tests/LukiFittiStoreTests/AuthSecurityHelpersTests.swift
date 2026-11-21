import Foundation
import XCTest
@testable import LukiFittiModels
@testable import LukiFittiAPI

final class Base64URLTests: XCTestCase {
    func testEncodeProducesNoPaddingAndUrlSafeAlphabet() {
        // 0xFB 0xFF 0xFE maps to "+/+" in standard base64 → "-__" in base64url.
        XCTAssertEqual(Base64URL.encode(Data([0xFB, 0xFF, 0xFE])), "-__-")
        XCTAssertEqual(Base64URL.encode(Data("hello".utf8)), "aGVsbG8")
    }

    func testDecodeRoundTripsWithoutPadding() {
        for length in [1, 2, 3, 4, 32, 64] {
            let data = Data((0..<length).map { UInt8($0 * 37 & 0xFF) })
            let encoded = Base64URL.encode(data)
            XCTAssertFalse(encoded.contains("="))
            XCTAssertEqual(Base64URL.decode(encoded), data)
        }
    }

    func testDecodeRejectsGarbage() {
        XCTAssertNil(Base64URL.decode("!!!"))
        XCTAssertNil(Base64URL.decode("A"))
    }
}

final class PKCETests: XCTestCase {
    func testVerifierLengthAndCharset() {
        let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~")
        for _ in 0..<50 {
            let verifier = PKCE.makeVerifier()
            XCTAssertEqual(verifier.count, 64)
            XCTAssertTrue(verifier.unicodeScalars.allSatisfy(allowed.contains))
        }
        XCTAssertEqual(PKCE.makeVerifier(length: 43).count, 43)
        XCTAssertEqual(PKCE.makeVerifier(length: 128).count, 128)
        // Out-of-range lengths clamp into [43, 128].
        XCTAssertEqual(PKCE.makeVerifier(length: 10).count, 43)
        XCTAssertEqual(PKCE.makeVerifier(length: 500).count, 128)
    }

    func testVerifiersAreUnique() {
        XCTAssertNotEqual(PKCE.makeVerifier(), PKCE.makeVerifier())
    }

    /// RFC 7636 Appendix B vector.
    func testS256ChallengeMatchesRFC7636() {
        XCTAssertEqual(
            PKCE.s256Challenge(verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        )
    }
}

final class OAuthNonceTests: XCTestCase {
    func testRawNonceIsBase64URLAndUnique() {
        let a = OAuthNonce.makeRaw()
        let b = OAuthNonce.makeRaw()
        XCTAssertNotEqual(a, b)
        XCTAssertFalse(a.contains("="))
        XCTAssertNotNil(Base64URL.decode(a))
        XCTAssertEqual(Base64URL.decode(a)?.count, 32)
    }

    func testSha256HexKnownVector() {
        // sha256("abc") from FIPS 180-4.
        XCTAssertEqual(
            OAuthNonce.sha256Hex("abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        )
    }

    func testSha256HexFormat() {
        let hex = OAuthNonce.sha256Hex(OAuthNonce.makeRaw())
        XCTAssertEqual(hex.count, 64)
        XCTAssertTrue(hex.allSatisfy { $0.isHexDigit && !$0.isUppercase })
    }
}

final class GoogleOAuthTests: XCTestCase {
    private let clientId = "123-abc.apps.googleusercontent.com"

    func testRedirectSchemeAndURIFromClientId() {
        XCTAssertEqual(
            GoogleOAuth.redirectScheme(clientId: clientId),
            "com.googleusercontent.apps.123-abc"
        )
        XCTAssertEqual(
            GoogleOAuth.redirectURI(clientId: clientId),
            "com.googleusercontent.apps.123-abc:/oauthredirect"
        )
        XCTAssertEqual(
            GoogleOAuth.callbackURLScheme(clientId: clientId),
            "com.googleusercontent.apps.123-abc"
        )
    }

    func testAuthorizationURLContainsAllParameters() throws {
        let url = GoogleOAuth.authorizationURL(
            clientId: clientId,
            state: "state-1",
            nonce: "raw-nonce",
            codeChallenge: "challenge-xyz"
        )
        XCTAssertEqual(url.host, "accounts.google.com")
        let items = Dictionary(
            uniqueKeysWithValues: (URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? [])
                .map { ($0.name, $0.value ?? "") }
        )
        XCTAssertEqual(items["client_id"], clientId)
        XCTAssertEqual(items["redirect_uri"], "com.googleusercontent.apps.123-abc:/oauthredirect")
        XCTAssertEqual(items["response_type"], "code")
        XCTAssertEqual(items["scope"], "openid email profile")
        XCTAssertEqual(items["state"], "state-1")
        XCTAssertEqual(items["nonce"], "raw-nonce")
        XCTAssertEqual(items["code_challenge"], "challenge-xyz")
        XCTAssertEqual(items["code_challenge_method"], "S256")
    }

    func testParseCallbackExtractsCode() throws {
        let url = URL(string: "com.googleusercontent.apps.123-abc:/oauthredirect?code=auth-code-1&state=s")!
        XCTAssertEqual(try GoogleOAuth.parseCallback(url, expectedState: "s"), "auth-code-1")
    }

    func testParseCallbackRejectsStateMismatch() {
        let url = URL(string: "com.googleusercontent.apps.123-abc:/oauthredirect?code=x&state=evil")!
        XCTAssertThrowsError(try GoogleOAuth.parseCallback(url, expectedState: "s")) {
            XCTAssertEqual($0 as? GoogleOAuthError, .stateMismatch)
        }
    }

    func testParseCallbackSurfacesProviderError() {
        let url = URL(string: "com.googleusercontent.apps.123-abc:/oauthredirect?error=access_denied&state=s")!
        XCTAssertThrowsError(try GoogleOAuth.parseCallback(url, expectedState: "s")) {
            XCTAssertEqual($0 as? GoogleOAuthError, .providerError("access_denied"))
        }
    }

    func testTokenExchangeRequestBody() throws {
        let request = GoogleOAuth.tokenExchangeRequest(clientId: clientId, code: "c", verifier: "v")
        XCTAssertEqual(request.url?.absoluteString, "https://oauth2.googleapis.com/token")
        let body = String(data: request.httpBody ?? Data(), encoding: .utf8) ?? ""
        XCTAssertTrue(body.contains("grant_type=authorization_code"))
        XCTAssertTrue(body.contains("code_verifier=v"))
        XCTAssertTrue(body.contains("code=c"))
    }
}

final class WebAuthnJSONTests: XCTestCase {
    private func dict(_ json: String) throws -> [String: Any] {
        try JSONSerialization.jsonObject(with: Data(json.utf8)) as! [String: Any]
    }

    /// @simplewebauthn v14 `generateRegistrationOptions` shape.
    private let registrationOptionsJSON = """
        {
          "challenge": "Y2hhbGxlbmdlLTEyMw",
          "rp": { "name": "LukiFitti", "id": "app.luki-fitti.tony-luke.de" },
          "user": {
            "id": "dXNlci0xMjM",
            "name": "athlete@example.com",
            "displayName": "Athlete"
          },
          "pubKeyCredParams": [{ "type": "public-key", "alg": -7 }],
          "excludeCredentials": [
            { "id": "Y3JlZC0x", "type": "public-key", "transports": ["internal"] }
          ],
          "authenticatorSelection": { "residentKey": "required", "userVerification": "required" },
          "attestation": "none"
        }
        """

    /// @simplewebauthn v14 `generateAuthenticationOptions` shape.
    private let requestOptionsJSON = """
        {
          "challenge": "YXV0aC1jaGFsbGVuZ2U",
          "rpId": "app.luki-fitti.tony-luke.de",
          "allowCredentials": [
            { "id": "Y3JlZC0y", "type": "public-key", "transports": ["internal"] }
          ],
          "userVerification": "required"
        }
        """

    func testParseRegistrationOptions() throws {
        let options = try WebAuthnJSON.parseRegistrationOptions(dict(registrationOptionsJSON))
        XCTAssertEqual(options.rpId, "app.luki-fitti.tony-luke.de")
        XCTAssertEqual(options.challenge, Data("challenge-123".utf8))
        XCTAssertEqual(options.userId, Data("user-123".utf8))
        XCTAssertEqual(options.userName, "athlete@example.com")
        XCTAssertEqual(options.userDisplayName, "Athlete")
        XCTAssertEqual(options.excludedCredentialIds, [Data("cred-1".utf8)])
    }

    func testParseRequestOptions() throws {
        let options = try WebAuthnJSON.parseRequestOptions(dict(requestOptionsJSON))
        XCTAssertEqual(options.rpId, "app.luki-fitti.tony-luke.de")
        XCTAssertEqual(options.challenge, Data("auth-challenge".utf8))
        XCTAssertEqual(options.allowCredentialIds, [Data("cred-2".utf8)])
    }

    func testParseRejectsMissingChallenge() throws {
        let json = registrationOptionsJSON.replacingOccurrences(
            of: "\"challenge\": \"Y2hhbGxlbmdlLTEyMw\",", with: ""
        )
        XCTAssertThrowsError(try WebAuthnJSON.parseRegistrationOptions(dict(json))) {
            XCTAssertEqual($0 as? WebAuthnError, .invalidOptions("challenge"))
        }
    }

    func testRegistrationResponseShape() throws {
        let response = try WebAuthnJSON.jsonValue(
            WebAuthnJSON.registrationResponse(
                credentialId: Data("cred".utf8),
                clientDataJSON: Data("cdj".utf8),
                attestationObject: Data("att".utf8)
            )
        )
        let data = try JSONEncoder().encode(response)
        let obj = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        XCTAssertEqual(obj["id"] as? String, Base64URL.encode(Data("cred".utf8)))
        XCTAssertEqual(obj["rawId"] as? String, obj["id"] as? String)
        XCTAssertEqual(obj["type"] as? String, "public-key")
        XCTAssertEqual(obj["authenticatorAttachment"] as? String, "platform")
        let r = obj["response"] as! [String: Any]
        XCTAssertEqual(r["clientDataJSON"] as? String, Base64URL.encode(Data("cdj".utf8)))
        XCTAssertEqual(r["attestationObject"] as? String, Base64URL.encode(Data("att".utf8)))
        XCTAssertEqual(r["transports"] as? [String], ["internal", "hybrid"])
    }

    func testAssertionResponseShape() throws {
        let response = try WebAuthnJSON.jsonValue(
            WebAuthnJSON.assertionResponse(
                credentialId: Data("cred".utf8),
                clientDataJSON: Data("cdj".utf8),
                authenticatorData: Data("ad".utf8),
                signature: Data("sig".utf8),
                userHandle: Data("uh".utf8)
            )
        )
        let data = try JSONEncoder().encode(response)
        let obj = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        let r = obj["response"] as! [String: Any]
        XCTAssertEqual(r["authenticatorData"] as? String, Base64URL.encode(Data("ad".utf8)))
        XCTAssertEqual(r["signature"] as? String, Base64URL.encode(Data("sig".utf8)))
        XCTAssertEqual(r["userHandle"] as? String, Base64URL.encode(Data("uh".utf8)))
    }

    func testAssertionResponseOmitsNilUserHandle() throws {
        let response = try WebAuthnJSON.jsonValue(
            WebAuthnJSON.assertionResponse(
                credentialId: Data("c".utf8),
                clientDataJSON: Data("c".utf8),
                authenticatorData: Data("a".utf8),
                signature: Data("s".utf8),
                userHandle: nil
            )
        )
        let data = try JSONEncoder().encode(response)
        let obj = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        let r = obj["response"] as! [String: Any]
        XCTAssertNil(r["userHandle"])
    }
}

final class LoginResultDecodingTests: XCTestCase {
    private func decode(_ json: String) throws -> LoginResult {
        try JSONDecoder().decode(LoginResponseDto.self, from: Data(json.utf8)).result
    }

    func testDecodesUser() throws {
        let result = try decode("""
            {"id":"u1","email":"a@b.c","emailVerified":true}
            """)
        guard case .signedIn(let user) = result else { return XCTFail("expected signedIn") }
        XCTAssertEqual(user.id, "u1")
    }

    func testDecodesMfaRequired() throws {
        let result = try decode("""
            {"mfaRequired":true,"mfaToken":"tok-123"}
            """)
        guard case .mfaRequired(let token) = result else { return XCTFail("expected mfaRequired") }
        XCTAssertEqual(token, "tok-123")
    }

    func testMfaWithoutTokenThrows() {
        XCTAssertThrowsError(try decode("{\"mfaRequired\":true}"))
    }
}
