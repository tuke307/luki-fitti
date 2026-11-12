import SwiftUI
import LukiFittiDesign

/// Shared "AI needs setup" alert. Signed in without a key → "Add key" (OpenRouter copy);
/// guest → "Sign In" (account-first copy). `onAction` runs for the primary button.
private struct AIAccessAlert: ViewModifier {
    @Environment(\.lukiLocale) private var tr
    @Binding var isPresented: Bool
    let isSignedIn: Bool
    let onAction: () -> Void

    func body(content: Content) -> some View {
        content
            .alert(
                isSignedIn ? tr("OpenRouter key required") : tr("Sign in required"),
                isPresented: $isPresented
            ) {
                Button(isSignedIn ? tr("Add key") : tr("Sign In")) { onAction() }
                Button(tr("Cancel"), role: .cancel) {}
            } message: {
                Text(isSignedIn
                    ? tr("AI features run on your own OpenRouter API key. Add it in your profile to use them.")
                    : tr("AI features need an account and your own OpenRouter API key. Sign in, then add the key in your profile."))
            }
    }
}

extension View {
    func aiAccessAlert(
        isPresented: Binding<Bool>,
        isSignedIn: Bool,
        onAction: @escaping () -> Void
    ) -> some View {
        modifier(AIAccessAlert(isPresented: isPresented, isSignedIn: isSignedIn, onAction: onAction))
    }
}
