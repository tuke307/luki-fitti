import SwiftUI
import LukiFittiDesign

/// Attribution for the bundled exercise catalog, mirroring the web "Data sources" page:
/// names, instructions and photos partly come from these open databases.
struct DataSourcesView: View {
    @Environment(\.lukiLocale) private var tr

    var body: some View {
        List {
            Section {
                Text(tr("Exercise names, instructions and photos partly come from these open databases."))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Section {
                if let url = URL(string: "https://github.com/yuhonas/free-exercise-db") {
                    Link(destination: url) {
                        LabeledContent("free-exercise-db") {
                            Text("Unlicense (public domain)")
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                if let url = URL(string: "https://wger.de") {
                    Link(destination: url) {
                        LabeledContent("wger Workout Manager") {
                            Text("CC-BY-SA 4.0")
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                if let url = URL(string: "https://creativecommons.org/licenses/by-sa/4.0/") {
                    Link(destination: url) {
                        Text("CC-BY-SA 4.0 license")
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(tr("Data sources"))
        .navigationBarTitleDisplayMode(.inline)
    }
}
