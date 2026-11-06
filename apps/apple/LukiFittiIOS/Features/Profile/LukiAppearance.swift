import SwiftUI
import UIKit

/// The `theme` preference shared with the web ("system" / "light" / "dark").
enum LukiAppearance: String, CaseIterable {
    case system, light, dark

    /// English key, translated through `tr`.
    var title: String {
        switch self {
        case .system: "System"
        case .light: "Light"
        case .dark: "Dark"
        }
    }

    var interfaceStyle: UIUserInterfaceStyle {
        switch self {
        case .system: .unspecified
        case .light: .light
        case .dark: .dark
        }
    }
}

extension View {
    /// Applies the appearance preference to every window of the app. Set on the windows rather
    /// than with `preferredColorScheme`, which doesn't switch sheets that are already open back.
    func lukiAppearance(_ theme: String) -> some View {
        onChange(of: theme, initial: true) { _, theme in
            let style = (LukiAppearance(rawValue: theme) ?? .system).interfaceStyle
            for scene in UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }) {
                for window in scene.windows { window.overrideUserInterfaceStyle = style }
            }
        }
    }
}
