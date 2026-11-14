import SwiftUI
import Contacts
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain
import LukiFittiStore

/// Contact sync: consent first, then read only `CNContactEmailAddressesKey`, normalise and
/// SHA-256 on-device (CryptoKit), send ≤ 2000 hashes. Raw addresses never leave the device and
/// are never logged.
struct ContactSyncSheet: View {
    @Bindable var viewModel: LukiAppViewModel
    @Environment(\.lukiLocale) private var tr
    @Environment(\.dismiss) private var dismiss

    @State private var consented = false
    @State private var syncing = false
    @State private var matches: [SocialUserDto]?
    @State private var failed = false
    @State private var requested: Set<String> = []

    private var social: SocialStore { viewModel.social }

    var body: some View {
        NavigationStack {
            Group {
                if !consented {
                    consentPage
                } else if let matches {
                    matchList(matches)
                } else {
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .navigationTitle(tr("Find your contacts"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(tr("Cancel")) { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private var consentPage: some View {
        VStack(spacing: 20) {
            Spacer()
            Image(systemName: "person.crop.circle.badge.magnifyingglass")
                .font(.system(size: 48))
                .foregroundStyle(LukiColors.accent)
            Text(tr("We hash the email addresses on this device and only send the hashes. Contacts who are not on LukiFitti are discarded — nothing is stored."))
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
            Button(tr("Continue")) {
                consented = true
                Task { await sync() }
            }
            .buttonStyle(.borderedProminent)
            .disabled(syncing)
            .accessibilityIdentifier("ios.social.contacts.consentButton")
            Spacer()
        }
        .padding()
    }

    private func matchList(_ matches: [SocialUserDto]) -> some View {
        List {
            if failed {
                Text(tr("Contacts could not be read."))
                    .foregroundStyle(.secondary)
            } else if matches.isEmpty {
                Text(tr("None of your contacts are on LukiFitti yet."))
                    .foregroundStyle(.secondary)
            }
            ForEach(matches) { user in
                SocialPersonRow(
                    person: SocialCardDto(userId: user.userId, handle: user.handle, avatarUrl: user.avatarUrl, name: user.name),
                    social: social
                ) {
                    if requested.contains(user.userId) || user.relation == .OUTGOING || user.relation == .FRIEND {
                        Text(user.relation == .FRIEND ? tr("Friends") : tr("Requested"))
                            .font(.footnote).foregroundStyle(.secondary)
                    } else {
                        Button(tr("Add")) {
                            requested.insert(user.userId)
                            Task { await social.sendRequest(to: user.userId) }
                        }
                        .buttonStyle(.borderedProminent).controlSize(.small)
                    }
                }
            }
        }
    }

    private func sync() async {
        syncing = true
        defer { syncing = false }
        let store = CNContactStore()
        do {
            guard try await store.requestAccess(for: .contacts) else { failed = true; matches = []; return }
            let keys: [CNKeyDescriptor] = [CNContactEmailAddressesKey as CNKeyDescriptor]
            let request = CNContactFetchRequest(keysToFetch: keys)
            var emails: [String] = []
            try store.enumerateContacts(with: request) { contact, _ in
                for labeled in contact.emailAddresses {
                    emails.append(labeled.value as String)
                }
            }
            var found: [SocialUserDto] = []
            for batch in EmailLookup.hashBatches(emails, maxPerBatch: 2000) {
                found.append(contentsOf: try await viewModel.store.apiClient.matchContacts(hashes: batch))
            }
            // Same person may appear under several emails.
            var seen = Set<String>()
            matches = found.filter { seen.insert($0.userId).inserted }
        } catch {
            failed = true
            matches = []
        }
    }
}
