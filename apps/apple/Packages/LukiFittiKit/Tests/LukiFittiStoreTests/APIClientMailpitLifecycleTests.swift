import Foundation
import XCTest
@testable import LukiFittiModels
@testable import LukiFittiAPI
@testable import LukiFittiStore

private final class InMemoryTokenStore: TokenStoring, @unchecked Sendable {
    private var tokens: AuthTokensDto?
    private var userId: String?

    func saveTokens(_ tokens: AuthTokensDto, userId: String?) throws {
        self.tokens = tokens
        self.userId = userId
    }

    func loadTokens() -> AuthTokensDto? {
        tokens
    }

    func loadUserId() -> String? {
        userId
    }

    func clearTokens() {
        tokens = nil
        userId = nil
    }
}

private struct MailpitTestSummary: Decodable {
    let ID: String
    let Subject: String
}

private struct MailpitTestSearchResponse: Decodable {
    let messages: [MailpitTestSummary]?
}

private struct MailpitTestMessageDetail: Decodable {
    let ID: String
    let Subject: String
    let HTML: String
    let Text: String
}

final class APIClientMailpitLifecycleTests: XCTestCase {
    private let apiBaseURL = URL(string: "http://localhost:3001")!
    private let mailpitBaseURL = URL(string: "http://localhost:8025")!

    private func isBackendAndMailpitReachable() async -> Bool {
        let healthURL = apiBaseURL.appendingPathComponent("/api/health")
        let mailpitURL = mailpitBaseURL.appendingPathComponent("/api/v1/info")
        guard let (_, res1) = try? await URLSession.shared.data(from: healthURL),
              let http1 = res1 as? HTTPURLResponse,
              (200..<500).contains(http1.statusCode),
              let (_, res2) = try? await URLSession.shared.data(from: mailpitURL),
              let http2 = res2 as? HTTPURLResponse,
              http2.statusCode == 200 else {
            return false
        }
        return true
    }

    private func waitForTokenInMailpit(
        recipientEmail: String,
        subjectContains: String,
        route: String
    ) async throws -> String {
        let deadline = Date().addingTimeInterval(20)
        var comps = URLComponents(url: mailpitBaseURL.appendingPathComponent("/api/v1/search"), resolvingAgainstBaseURL: false)!
        comps.queryItems = [URLQueryItem(name: "query", value: "to:\(recipientEmail)")]

        while Date() < deadline {
            if let (data, _) = try? await URLSession.shared.data(from: comps.url!),
               let search = try? JSONDecoder().decode(MailpitTestSearchResponse.self, from: data),
               let msg = (search.messages ?? []).first(where: {
                   $0.Subject.localizedCaseInsensitiveContains(subjectContains)
               }) {
                let detailURL = mailpitBaseURL.appendingPathComponent("/api/v1/message/\(msg.ID)")
                let (detailData, _) = try await URLSession.shared.data(from: detailURL)
                let detail = try JSONDecoder().decode(MailpitTestMessageDetail.self, from: detailData)
                let combined = "\(detail.HTML)\n\(detail.Text)"
                let pattern = "\(NSRegularExpression.escapedPattern(for: route))\\?token=([a-fA-F0-9]+)"
                let regex = try NSRegularExpression(pattern: pattern, options: [.caseInsensitive])
                let nsRange = NSRange(combined.startIndex..<combined.endIndex, in: combined)
                if let match = regex.firstMatch(in: combined, options: [], range: nsRange),
                   let tokenRange = Range(match.range(at: 1), in: combined) {
                    return String(combined[tokenRange])
                }
            }
            try await Task.sleep(nanoseconds: 400_000_000)
        }
        throw XCTSkip("Timed out waiting for Mailpit email (\(subjectContains))")
    }

    func testSwiftAPIClientFullEmailLifecycleWithMailpit() async throws {
        guard await isBackendAndMailpitReachable() else {
            throw XCTSkip("Local API (3001) or Mailpit (8025) not running — skipping live Mailpit integration test")
        }

        let tokenStore = InMemoryTokenStore()
        let client = APIClient(baseURL: apiBaseURL, tokenStore: tokenStore)

        let uniqueId = "\(Int(Date().timeIntervalSince1970))-\(Int.random(in: 1000...9999))"
        let email = "swift.lifecycle.\(uniqueId)@lukifitti.test"
        let initialPassword = "InitialPass123!"
        let updatedPassword = "UpdatedPass456!"

        // 1. Register
        let regUser = try await client.register(
            email: email,
            password: initialPassword,
            name: "Swift Mailpit Athlete"
        )
        XCTAssertEqual(regUser.email, email)
        XCTAssertEqual(regUser.requiresEmailConfirmation, true)

        // 2. Verify Email via token extracted from Mailpit
        let verifyToken = try await waitForTokenInMailpit(
            recipientEmail: email,
            subjectContains: "Confirm your account",
            route: "verify-email"
        )
        let verifiedUser = try await client.verifyEmail(token: verifyToken)
        XCTAssertEqual(verifiedUser.email, email)
        XCTAssertNotNil(tokenStore.loadTokens())

        // 3. Logout & Forgot Password
        await client.logout()
        XCTAssertNil(tokenStore.loadTokens())

        try await client.forgotPassword(email: email)
        let resetToken = try await waitForTokenInMailpit(
            recipientEmail: email,
            subjectContains: "Reset your password",
            route: "reset-password"
        )

        // 4. Reset Password & Login with new password
        try await client.resetPassword(token: resetToken, newPassword: updatedPassword)
        let loggedInUser = try await client.login(email: email, password: updatedPassword)
        XCTAssertEqual(loggedInUser.email, email)
        XCTAssertNotNil(tokenStore.loadTokens())

        // 5. Request Account Deletion & Confirm via token extracted from Mailpit
        try await client.requestAccountDeletion(password: updatedPassword)
        let deleteToken = try await waitForTokenInMailpit(
            recipientEmail: email,
            subjectContains: "Confirm account deletion",
            route: "delete-account"
        )
        try await client.confirmAccountDeletion(token: deleteToken)
        XCTAssertNil(tokenStore.loadTokens())

        // 6. Verify deleted user can no longer log in
        do {
            _ = try await client.login(email: email, password: updatedPassword)
            XCTFail("Expected login to fail after permanent account deletion")
        } catch {
            // Expected 401
        }
    }
}
