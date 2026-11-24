import CryptoKit
import Foundation

/// Base64url without padding (RFC 4648 §5) — the encoding WebAuthn and PKCE use on the wire.
public enum Base64URL {
    public static func encode(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    /// Accepts both padded and unpadded input; returns nil for invalid base64url.
    public static func decode(_ string: String) -> Data? {
        var s = string
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        let remainder = s.count % 4
        if remainder == 1 { return nil }
        if remainder > 0 { s += String(repeating: "=", count: 4 - remainder) }
        return Data(base64Encoded: s)
    }
}

/// RFC 7636 PKCE: verifier in the unreserved charset, S256 challenge.
public enum PKCE {
    /// [A-Z] [a-z] [0-9] "-" "." "_" "~" — the only characters a verifier may contain.
    private static let unreserved = Array("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~")

    /// Random verifier, 43–128 chars per RFC 7636 §4.1 (default 64).
    public static func makeVerifier(length: Int = 64) -> String {
        let length = min(max(length, 43), 128)
        var bytes = [UInt8](repeating: 0, count: length)
        _ = SecRandomCopyBytes(kSecRandomDefault, length, &bytes)
        return String(bytes.map { unreserved[Int($0) % unreserved.count] })
    }

    /// BASE64URL-ENCODE(SHA256(ASCII(verifier))) — RFC 7636 Appendix B.
    public static func s256Challenge(verifier: String) -> String {
        Base64URL.encode(Data(SHA256.hash(data: Data(verifier.utf8))))
    }
}

/// Login nonces: raw value goes to our API; providers get its SHA-256 hex.
public enum OAuthNonce {
    /// 32 random bytes, base64url — url- and JWT-claim safe.
    public static func makeRaw() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return Base64URL.encode(Data(bytes))
    }

    /// Lowercase hex SHA-256 — what Apple/Google put in the `nonce` claim.
    public static func sha256Hex(_ raw: String) -> String {
        SHA256.hash(data: Data(raw.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}
