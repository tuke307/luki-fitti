import SwiftUI
import LukiFittiDesign

/// Placeholder for file import (backup restore and app migrations); filled in by the
/// import work stream.
struct ImportDataView: View {
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
        .navigationTitle(tr("Import file"))
        .navigationBarTitleDisplayMode(.inline)
    }
}
