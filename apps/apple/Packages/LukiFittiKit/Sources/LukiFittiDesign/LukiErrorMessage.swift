import SwiftUI
import LukiFittiAPI
import LukiFittiModels

extension SupportedLocale {
    /// User-facing text for an error: API error codes and statuses map to localized copy,
    /// anything else falls back to translating the error's own description.
    public func errorMessage(_ error: Error) -> String {
        guard let apiError = error as? APIClientError else {
            return error.localizedDescription
        }
        var status: Int?
        var code: String?
        switch apiError {
        case .serverError(let s, _, let c):
            status = s
            code = c
        case .forbidden(_, let c):
            code = c
        default:
            break
        }
        switch code {
        case "EMAIL_ALREADY_EXISTS":
            return self("An account with this email already exists.")
        case "INVALID_CREDENTIALS":
            return self("Invalid email or password.")
        case "ACCOUNT_LOCKED":
            return self("Account temporarily locked after too many failed attempts. Try again later.")
        case "EMAIL_NOT_VERIFIED":
            return self("Please confirm your email address first. Check your inbox for the link.")
        default:
            break
        }
        if case .offline = apiError {
            return self("You’re offline. Check your connection and try again.")
        }
        if status == 429 {
            return self("Too many attempts. Wait a minute and try again.")
        }
        if let status, status >= 500 {
            return self("Something went wrong on our side. Please try again.")
        }
        if case .unauthorized = apiError {
            return self("Please sign in again.")
        }
        return self(apiError.localizedDescription)
    }
}

/// Inline form error: icon + message in destructive footnote, read as one accessibility element.
public struct ErrorMessageText: View {
    private let message: String

    public init(_ message: String) {
        self.message = message
    }

    public var body: some View {
        Label(message, systemImage: "exclamationmark.circle.fill")
            .font(.footnote)
            .foregroundStyle(LukiColors.destructive)
            .accessibilityElement(children: .combine)
    }
}
