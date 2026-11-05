import SwiftUI
import LukiFittiDesign

/// Placeholder for per-feature model selection; filled in by the AI-settings work stream.
struct AIModelsSettingsView: View {
    @Bindable var viewModel: LukiAppViewModel
    @Environment(\.lukiLocale) private var tr

    var body: some View {
        List {
            Section {
                Text(tr("Coming soon"))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(tr("AI models"))
        .navigationBarTitleDisplayMode(.inline)
    }
}
