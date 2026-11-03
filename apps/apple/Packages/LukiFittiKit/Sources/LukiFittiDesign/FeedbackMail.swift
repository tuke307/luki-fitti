import Foundation

/// "Request a feature" mail link — same template as `buildFeatureRequestMailto` on the web.
public enum FeedbackMail {
    public static let feedbackEmail = "tonymeissner70@gmail.com"

    public static func featureRequestURL(locale: String, appVersion: String, os: String? = nil) -> URL? {
        let isGerman = locale.hasPrefix("de")
        let subject = isGerman ? "LukiFitti – Feature-Wunsch" : "LukiFitti – Feature request"
        let lead = isGerman ? "Was wünschst du dir?" : "What would you like?"
        let why = isGerman ? "Wobei würde dir das helfen?" : "Why would it help you?"
        var meta = "App: LukiFitti \(appVersion) (iOS)"
        if let os { meta += "\nSystem: \(os)" }
        let body = "\(lead)\n\n\n\(why)\n\n\n—\n\(meta)"

        // URLComponents leaves "?" and "+" literal in query values — encode strictly so the
        // body can't break the mailto parsing.
        let allowed = CharacterSet.urlQueryAllowed.subtracting(CharacterSet(charactersIn: "?&=+"))
        guard let s = subject.addingPercentEncoding(withAllowedCharacters: allowed),
              let b = body.addingPercentEncoding(withAllowedCharacters: allowed) else { return nil }
        return URL(string: "mailto:\(feedbackEmail)?subject=\(s)&body=\(b)")
    }
}
