import Foundation

/// Custom event names, keep in sync with `ANALYTICS_EVENT_NAMES` in packages/common.
public enum AnalyticsEvent: String, Sendable {
    case signup
    case login
    case passwordResetRequest = "password_reset_request"
    case accountDeleteRequest = "account_delete_request"
    case workoutStart = "workout_start"
    case workoutComplete = "workout_complete"
    case workoutAbandon = "workout_abandon"
    case exerciseSwap = "exercise_swap"
    case suggestionAccept = "suggestion_accept"
    case suggestionDismiss = "suggestion_dismiss"
    case offlineSync = "offline_sync"
    case dataExport = "data_export"
}

/// Low-cardinality event values only — never PII, weights, heart rate or body data.
public enum AnalyticsValue: Sendable, Encodable {
    case string(String)
    case int(Int)
    case bool(Bool)

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .int(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        }
    }
}

/**
 * Anonymous, best-effort usage analytics: screen views and custom events posted to the
 * first-party collector (`POST {baseURL}/api/analytics/collect`, same endpoint as the web app).
 * Cookie-free ephemeral session, no Authorization, no retries — failures are ignored.
 */
// @unchecked: `lastScreenPath` is the only mutable state and is always accessed under `lock`.
public final class AnalyticsClient: @unchecked Sendable {
    private static let maxURLLength = 500
    private static let maxDataKeys = 10
    private static let maxStringLength = 100

    private let baseURL: URL
    private let enabled: Bool
    private let userAgent: String
    private let language: @Sendable () -> String?
    private let session: URLSession

    private let lock = NSLock()
    /// Last screen path passed to `screen(_:)`; events are reported against it.
    private var lastScreenPath = "/"

    public init(
        baseURL: URL,
        enabled: Bool,
        userAgent: String,
        language: @escaping @Sendable () -> String?
    ) {
        self.baseURL = baseURL
        self.enabled = enabled
        self.userAgent = userAgent
        self.language = language
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil
        config.httpShouldSetCookies = false
        config.httpCookieAcceptPolicy = .never
        config.urlCache = nil
        config.timeoutIntervalForRequest = 5
        self.session = URLSession(configuration: config)
    }

    /// Tracks a screen view (`/workouts`, …). Token-like path segments drop the hit.
    public func screen(_ path: String) {
        guard let url = Self.sanitizedPath(path) else { return }
        lock.lock()
        lastScreenPath = url
        lock.unlock()
        send(makeRequest(type: "pageview", url: url))
    }

    /// Tracks a custom event on the last reported screen path.
    public func event(_ event: AnalyticsEvent, _ data: [String: AnalyticsValue] = [:]) {
        send(makeEventRequest(event, data))
    }

    /// The event request as `event(_:_:)` would send it (screen path from `screen(_:)`).
    func makeEventRequest(_ event: AnalyticsEvent, _ data: [String: AnalyticsValue] = [:]) -> URLRequest? {
        lock.lock()
        let url = lastScreenPath
        lock.unlock()
        return makeRequest(type: "event", name: event, url: url, data: data)
    }

    /// Coarse duration bucket so exact training times never leave the device (same as web).
    public static func durationBucket(seconds: Int) -> String {
        let minutes = Double(seconds) / 60
        if minutes < 15 { return "<15m" }
        if minutes < 30 { return "15-30m" }
        if minutes < 60 { return "30-60m" }
        if minutes < 90 { return "60-90m" }
        return "90m+"
    }

    /// Coarse count bucket (e.g. completed sets), same as web.
    public static func countBucket(_ count: Int) -> String {
        if count <= 0 { return "0" }
        if count <= 5 { return "1-5" }
        if count <= 15 { return "6-15" }
        if count <= 30 { return "16-30" }
        return "31+"
    }

    /// Builds the collector request, or nil when disabled or the body fails to encode.
    func makeRequest(
        type: String,
        name: AnalyticsEvent? = nil,
        url: String,
        data: [String: AnalyticsValue] = [:]
    ) -> URLRequest? {
        guard enabled else { return nil }
        guard let endpoint = URL(string: "/api/analytics/collect", relativeTo: baseURL) else { return nil }

        var body: [String: Any] = ["type": type, "url": url, "platform": "ios"]
        if let name { body["name"] = name.rawValue }
        let filtered = Self.sanitizedData(data)
        if !filtered.isEmpty {
            body["data"] = filtered
        }
        guard JSONSerialization.isValidJSONObject(body),
              let payload = try? JSONSerialization.data(withJSONObject: body) else { return nil }

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.httpBody = payload
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(userAgent, forHTTPHeaderField: "User-Agent")
        if let language = language() {
            request.setValue(language, forHTTPHeaderField: "Accept-Language")
        }
        return request
    }

    /// Path must be `/…`, not `//…`, no query/fragment, ≤ 500 chars, and no segment that looks
    /// like a token or id (24+ chars of [A-Za-z0-9_-] — the same rule as the web tracker).
    static func sanitizedPath(_ path: String) -> String? {
        var p = path
        if let cut = p.firstIndex(where: { $0 == "?" || $0 == "#" }) {
            p = String(p[..<cut])
        }
        guard p.hasPrefix("/"), !p.hasPrefix("//"), p.count <= maxURLLength else { return nil }
        for segment in p.split(separator: "/", omittingEmptySubsequences: false) {
            if segment.count >= 24,
               segment.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-" || $0 == "_") }) {
                return nil
            }
        }
        return p
    }

    /// Keys must match `^[a-z][a-z0-9_]{0,39}$`; at most 10 entries; strings cut to 100 chars.
    static func sanitizedData(_ data: [String: AnalyticsValue]) -> [String: Any] {
        var out: [String: Any] = [:]
        for (key, value) in data {
            guard out.count < maxDataKeys, isValidKey(key) else { continue }
            switch value {
            case .string(let s): out[key] = String(s.prefix(maxStringLength))
            case .int(let i): out[key] = i
            case .bool(let b): out[key] = b
            }
        }
        return out
    }

    static func isValidKey(_ key: String) -> Bool {
        guard let first = key.first, first >= "a", first <= "z", key.count <= 40 else { return false }
        return key.allSatisfy {
            ($0 >= "a" && $0 <= "z") || ($0 >= "0" && $0 <= "9") || $0 == "_"
        }
    }

    private func send(_ request: URLRequest?) {
        guard let request else { return }
        Task.detached { [session] in
            _ = try? await session.data(for: request)
        }
    }
}
