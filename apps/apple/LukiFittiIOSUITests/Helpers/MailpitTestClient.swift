import Foundation
import XCTest

struct MailpitSummaryItem: Decodable {
    let ID: String
    let Subject: String
}

struct MailpitSearchResult: Decodable {
    let messages: [MailpitSummaryItem]?
}

struct MailpitMessageDetail: Decodable {
    let ID: String
    let Subject: String
    let HTML: String
    let Text: String
}

enum MailpitTestClient {
    static var baseURL: URL {
        let raw = ProcessInfo.processInfo.environment["MAILPIT_URL"] ?? "http://localhost:8025"
        return URL(string: raw)!
    }

    static func clearMailbox(for recipientEmail: String) async throws {
        var components = URLComponents(url: baseURL.appendingPathComponent("/api/v1/search"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "query", value: "to:\(recipientEmail)")]
        let (data, _) = try await URLSession.shared.data(from: components.url!)
        let search = try JSONDecoder().decode(MailpitSearchResult.self, from: data)
        let ids = (search.messages ?? []).map(\.ID)
        guard !ids.isEmpty else { return }

        var deleteReq = URLRequest(url: baseURL.appendingPathComponent("/api/v1/messages"))
        deleteReq.httpMethod = "DELETE"
        deleteReq.setValue("application/json", forHTTPHeaderField: "Content-Type")
        deleteReq.httpBody = try JSONSerialization.data(withJSONObject: ["IDs": ids])
        _ = try await URLSession.shared.data(for: deleteReq)
    }

    static func waitForEmail(
        to recipientEmail: String,
        subjectContains: String,
        timeoutSeconds: TimeInterval = 20
    ) async throws -> MailpitMessageDetail {
        let deadline = Date().addingTimeInterval(timeoutSeconds)
        var components = URLComponents(url: baseURL.appendingPathComponent("/api/v1/search"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "query", value: "to:\(recipientEmail)")]
        let searchURL = components.url!

        while Date() < deadline {
            if let (data, _) = try? await URLSession.shared.data(from: searchURL),
               let search = try? JSONDecoder().decode(MailpitSearchResult.self, from: data),
               let matched = (search.messages ?? []).first(where: {
                   $0.Subject.localizedCaseInsensitiveContains(subjectContains)
               }) {
                let detailURL = baseURL.appendingPathComponent("/api/v1/message/\(matched.ID)")
                let (detailData, _) = try await URLSession.shared.data(from: detailURL)
                return try JSONDecoder().decode(MailpitMessageDetail.self, from: detailData)
            }
            try await Task.sleep(nanoseconds: 400_000_000)
        }

        throw NSError(
            domain: "MailpitTestClient",
            code: 408,
            userInfo: [
                NSLocalizedDescriptionKey: "Timed out waiting for Mailpit email to \(recipientEmail) containing '\(subjectContains)'"
            ]
        )
    }

    /// Extracts the `token` query parameter for `/verify-email`, `/reset-password`, or `/delete-account`
    /// and returns a custom scheme URL (`lukifitti://<route>?token=<token>`) for opening in the iOS Simulator.
    static func extractDeepLinkURL(
        from email: MailpitMessageDetail,
        route: String
    ) throws -> URL {
        let combined = "\(email.HTML)\n\(email.Text)"
        let pattern = "\(NSRegularExpression.escapedPattern(for: route))\\?token=([a-fA-F0-9]+)"
        let regex = try NSRegularExpression(pattern: pattern, options: [.caseInsensitive])
        let nsRange = NSRange(combined.startIndex..<combined.endIndex, in: combined)
        guard let match = regex.firstMatch(in: combined, options: [], range: nsRange),
              let tokenRange = Range(match.range(at: 1), in: combined) else {
            throw NSError(
                domain: "MailpitTestClient",
                code: 404,
                userInfo: [
                    NSLocalizedDescriptionKey: "Could not find \(route)?token=... in email '\(email.Subject)'"
                ]
            )
        }
        let token = String(combined[tokenRange])
        return URL(string: "lukifitti://\(route)?token=\(token)")!
    }
}
