import Foundation
import CryptoKit

/// Contact-email normalisation + lookup hashing, mirroring `social.util.ts` in
/// `@luki-fitti/common`. The server stores the SHA-256 of the normalised email (never the raw
/// address); the same digest pins the cross-platform test vector.
public enum EmailLookup {
    /// `trim` + `lowercase` — identical to `normalizeEmailForLookup` in common.
    public static func normalize(_ email: String) -> String {
        email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    /// Lowercase hex SHA-256 of the normalised email.
    public static func hash(_ email: String) -> String {
        let digest = SHA256.hash(data: Data(normalize(email).utf8))
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    /// Deduped, normalised, hashed emails, chunked for `POST /social/contacts/match` (≤ 2000).
    public static func hashBatches(_ emails: [String], maxPerBatch: Int = 2000) -> [[String]] {
        var seen = Set<String>()
        var hashes: [String] = []
        for raw in emails {
            let normalized = normalize(raw)
            guard normalized.contains("@") else { continue }
            let hash = hash(normalized)
            if seen.insert(hash).inserted {
                hashes.append(hash)
            }
        }
        guard maxPerBatch > 0 else { return [hashes] }
        return stride(from: 0, to: hashes.count, by: maxPerBatch).map {
            Array(hashes[$0..<min($0 + maxPerBatch, hashes.count)])
        }
    }
}

/// Invite tokens are 32 random bytes encoded base64url → exactly 43 chars of [A-Za-z0-9_-].
/// Checked before any API call so malformed universal links never hit the server.
public enum InviteTokenValidator {
    public static func isValid(_ token: String) -> Bool {
        token.count == 43 && token.allSatisfy { $0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" }
    }
}

/// Routes a `?open=`/push `url` deep link the same way the web `parseOpenParam` does:
/// `/social/...` → social section, anything else → home.
public enum SocialDeepLink {
    public static func section(for url: String) -> SocialDeepLinkTarget {
        guard url.hasPrefix("/") else { return .home }
        guard url == "/social" || url.hasPrefix("/social/") else { return .home }
        let sub = url.dropFirst("/social".count).drop(while: { $0 == "/" }).split(separator: "/").first.map(String.init) ?? ""
        switch sub {
        case "friends": return .social(.friends)
        case "requests": return .social(.requests)
        case "inbox": return .social(.inbox)
        default: return .social(nil)
        }
    }
}

public enum SocialDeepLinkTarget: Sendable, Equatable {
    case home
    case social(SocialSectionTarget?)
}

public enum SocialSectionTarget: String, Sendable, Equatable {
    case friends
    case requests
    case inbox
}
