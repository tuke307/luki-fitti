import SwiftUI
import LukiFittiDesign
import LukiFittiModels

/// Read-only list of the account's personal API keys. Keys are created on the web (they need a
/// password confirmation); the app can revoke them.
struct ApiKeysView: View {
    @Bindable var viewModel: LukiAppViewModel
    @Environment(\.lukiLocale) private var tr
    @Environment(\.openURL) private var openURL

    @State private var list: ApiKeyListDto?
    @State private var failed = false
    @State private var revoking: ApiKeyDto?

    private static let webKeysURL = URL(string: "https://luki-fitti.tony-luke.de/?open=/profile/api-keys")

    var body: some View {
        List {
            Section {
                Text(tr("API keys let other apps read your LukiFitti data."))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                if let url = Self.webKeysURL {
                    Button {
                        openURL(url)
                    } label: {
                        Label(tr("Create on the web"), systemImage: "safari")
                    }
                    .accessibilityIdentifier("ios.apiKeys.createOnWeb")
                }
            }

            if let list, !list.enabled {
                Section {
                    Label(tr("API keys are currently turned off."), systemImage: "exclamationmark.triangle")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .accessibilityIdentifier("ios.apiKeys.disabledNotice")
                }
            }

            Section {
                if let list {
                    if list.keys.isEmpty {
                        Text(tr("No API keys yet."))
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(list.keys) { key in
                            ApiKeyRow(key: key)
                                .swipeActions(edge: .trailing) {
                                    Button(role: .destructive) {
                                        revoking = key
                                    } label: {
                                        Label(tr("Revoke"), systemImage: "trash")
                                    }
                                }
                        }
                    }
                } else if failed {
                    Text(tr("Couldn't load your API keys."))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                } else {
                    ProgressView()
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(tr("API keys"))
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
        .confirmationDialog(
            tr("Revoke API key?"),
            isPresented: Binding(get: { revoking != nil }, set: { if !$0 { revoking = nil } }),
            titleVisibility: .visible
        ) {
            Button(tr("Revoke"), role: .destructive) {
                if let key = revoking {
                    Task { await viewModel.revokeApiKey(id: key.id) }
                    revoking = nil
                    Task { await load() }
                }
            }
            Button(tr("Cancel"), role: .cancel) { revoking = nil }
        } message: {
            if let key = revoking {
                Text(tr("Apps using \"%@\" lose access immediately. This can’t be undone.", key.name))
            }
        }
        .accessibilityIdentifier("ios.apiKeys.view")
    }

    private func load() async {
        if let result = await viewModel.fetchApiKeys() {
            list = result
            failed = false
        } else {
            failed = true
        }
    }
}

private struct ApiKeyRow: View {
    let key: ApiKeyDto
    @Environment(\.lukiLocale) private var tr

    private var expired: Bool { key.status == .expired }

    private var detail: String {
        var parts = [String]()
        if let created = LukiDate.parseISO(key.createdAt) {
            parts.append(tr("Created %@", created.formatted(date: .abbreviated, time: .omitted)))
        }
        if let lastUsed = LukiDate.parseISO(key.lastUsedAt) {
            parts.append(tr("Last used %@", relative(lastUsed)))
        } else {
            parts.append(tr("Never used"))
        }
        if expired {
            parts.append(tr("Expired"))
        } else if let expires = LukiDate.parseISO(key.expiresAt) {
            parts.append(tr("Expires %@", expires.formatted(date: .abbreviated, time: .omitted)))
        } else {
            parts.append(tr("No expiry"))
        }
        return parts.joined(separator: " · ")
    }

    private func relative(_ date: Date) -> String {
        date.formatted(.relative(presentation: .named).locale(Locale(identifier: tr.rawValue)))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(key.name)
                    .font(.body)
                Spacer()
                if expired {
                    Text(tr("Expired"))
                        .font(.caption)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(.secondary.opacity(0.15), in: Capsule())
                }
            }
            Text("\(key.prefix)…")
                .font(.footnote.monospaced())
                .foregroundStyle(.secondary)
            if !key.scopes.isEmpty {
                Text(key.scopes.joined(separator: ", "))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Text(detail)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .opacity(expired ? 0.5 : 1)
        .accessibilityIdentifier("ios.apiKeys.item.\(key.id)")
    }
}
