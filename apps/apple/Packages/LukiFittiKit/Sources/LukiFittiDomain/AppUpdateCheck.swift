import Foundation

/// Semantic-ish marketing version compare (`1.10.0` > `1.9.2`, `1.1` == `1.1.0`).
public enum AppVersion {
    /// `true` when `candidate` sorts above `current`; non-numeric input never counts as newer.
    public static func isNewer(_ candidate: String, than current: String) -> Bool {
        guard let candidateParts = numericParts(candidate),
              let currentParts = numericParts(current) else { return false }
        let count = max(candidateParts.count, currentParts.count)
        for i in 0..<count {
            let c = i < candidateParts.count ? candidateParts[i] : 0
            let k = i < currentParts.count ? currentParts[i] : 0
            if c != k { return c > k }
        }
        return false
    }

    private static func numericParts(_ version: String) -> [Int]? {
        let parts = version.split(separator: ".", omittingEmptySubsequences: false)
        guard !parts.isEmpty else { return nil }
        var numbers: [Int] = []
        for part in parts {
            guard !part.isEmpty, part.allSatisfy(\.isASCII), let n = Int(part) else { return nil }
            numbers.append(n)
        }
        return numbers
    }
}

/// External destinations the update notice links to; mirrors `apps/web/lib/site/config.ts`.
public enum AppLinks {
    public static let appStoreID = "6831508360"
    public static let appStoreURL = URL(string: "https://apps.apple.com/app/lukifitti/id6831508360")!
    public static let webAppURL = URL(string: "https://app.luki-fitti.tony-luke.de")!
}

/// iTunes Lookup: returns the live App Store version, or nil on any error. Sends no user data.
public enum AppStoreLookup {
    public static func lookupURL(countryCode: String) -> URL {
        URL(string: "https://itunes.apple.com/lookup?id=\(AppLinks.appStoreID)&country=\(countryCode)")!
    }

    /// `Locale.current.region?.identifier.lowercased()`, falling back to "de".
    public static var deviceCountryCode: String {
        Locale.current.region?.identifier.lowercased() ?? "de"
    }

    /// The `results[0].version` of a lookup response; nil for empty results or malformed JSON.
    public static func decodeVersion(_ data: Data) -> String? {
        struct Response: Decodable {
            struct Result: Decodable { let version: String? }
            let resultCount: Int
            let results: [Result]
        }
        guard let response = try? JSONDecoder().decode(Response.self, from: data),
              response.resultCount > 0,
              let version = response.results.first?.version,
              !version.isEmpty else { return nil }
        return version
    }

    /// One request, 10 s timeout, no cookies. Any error → nil (the notice is best-effort).
    public static func fetchLatestVersion(
        countryCode: String = deviceCountryCode,
        session: URLSession = .shared
    ) async -> String? {
        var request = URLRequest(url: lookupURL(countryCode: countryCode), timeoutInterval: 10)
        request.httpShouldHandleCookies = false
        guard let (data, _) = try? await session.data(for: request) else { return nil }
        return decodeVersion(data)
    }
}
