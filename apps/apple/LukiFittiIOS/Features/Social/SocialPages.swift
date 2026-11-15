import SwiftUI
import CoreImage
import CoreImage.CIFilterBuiltins
import PhotosUI
import Contacts
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain
import LukiFittiStore

/// Friends page: incoming requests (accept/decline inline), friends sorted by this week's
/// workouts (friends missing from the weekly list — paused, blocked — go last), sent requests,
/// Add friends (search, invite link, contacts) and the blocked list.
struct SocialFriendsPage: View {
    @Bindable var social: SocialStore
    @Bindable var viewModel: LukiAppViewModel
    let onOpenFriend: (SocialCardDto) -> Void
    @Environment(\.lukiLocale) private var tr

    @State private var showContactsConsent = false
    @State private var searchText = ""
    @State private var searchResults: [SocialUserDto] = []
    @State private var searchTask: Task<Void, Never>?
    @State private var invite: FriendInviteDto?

    /// friendsWeek order, then alphabetical — paused/blocked friends land at the end.
    private var sortedFriends: [SocialCardDto] {
        let week = social.summary?.friendsWeek ?? []
        let order = Dictionary(uniqueKeysWithValues: week.enumerated().map { ($0.element.card.userId, $0.offset) })
        return social.friends.friends.sorted { a, b in
            switch (order[a.userId], order[b.userId]) {
            case let (ai?, bi?): return ai < bi
            case (_?, nil): return true
            case (nil, _?): return false
            default: return a.username.localizedCaseInsensitiveCompare(b.username) == .orderedAscending
            }
        }
    }

    private func weekCount(for userId: String) -> Int? {
        social.summary?.friendsWeek.first { $0.card.userId == userId }?.workouts
    }

    var body: some View {
        List {
            if !social.friends.incoming.isEmpty {
                Section {
                    ForEach(social.friends.incoming) { person in
                        SocialPersonRow(person: person, social: social) {
                            HStack(spacing: 8) {
                                Button(tr("Accept")) { Task { await social.accept(person.userId) } }
                                    .buttonStyle(.borderedProminent)
                                    .controlSize(.small)
                                    .accessibilityIdentifier("ios.social.accept.\(person.userId)")
                                Button(tr("Decline")) { Task { await social.decline(person.userId) } }
                                    .buttonStyle(.bordered)
                                    .controlSize(.small)
                                    .accessibilityIdentifier("ios.social.decline.\(person.userId)")
                            }
                        }
                    }
                } header: {
                    Text(tr("Requests"))
                }
            }

            Section {
                if social.friends.friends.isEmpty {
                    Text(tr("No friends yet. Search for a username or send an invite."))
                        .foregroundStyle(.secondary)
                }
                ForEach(sortedFriends) { friend in
                    SocialPersonRow(
                        person: friend,
                        social: social,
                        streak: social.streaks?.streak(with: friend.userId),
                        weekCount: weekCount(for: friend.userId)
                    ) {
                        EmptyView()
                    }
                    .contentShape(Rectangle())
                    .onTapGesture { onOpenFriend(friend) }
                }
            } header: {
                Text(tr("Friends"))
            }

            if !social.friends.outgoing.isEmpty {
                Section {
                    ForEach(social.friends.outgoing) { person in
                        SocialPersonRow(person: person, social: social) {
                            Button(tr("Withdraw")) { Task { await social.remove(person.userId) } }
                                .buttonStyle(.bordered)
                                .controlSize(.small)
                                .accessibilityIdentifier("ios.social.withdraw.\(person.userId)")
                        }
                    }
                } header: {
                    Text(tr("Sent"))
                }
            }

            Section {
                TextField(tr("Search by username"), text: $searchText)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .accessibilityIdentifier("ios.social.searchField")
                    .onChange(of: searchText) { _, query in
                        searchTask?.cancel()
                        let trimmed = query.trimmingCharacters(in: .whitespaces).lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "@"))
                        guard trimmed.count >= 2 else { searchResults = []; return }
                        searchTask = Task {
                            try? await Task.sleep(nanoseconds: 350_000_000)
                            guard !Task.isCancelled else { return }
                            searchResults = (try? await viewModel.store.apiClient.searchSocialUsers(query: trimmed)) ?? []
                        }
                    }
                if !searchText.trimmingCharacters(in: .whitespaces).isEmpty {
                    if searchText.trimmingCharacters(in: .whitespaces).count < 2 {
                        Text(tr("Type at least 2 characters.")).font(.footnote).foregroundStyle(.secondary)
                    } else if searchResults.isEmpty {
                        Text(tr("Nobody found with that username.")).font(.footnote).foregroundStyle(.secondary)
                    }
                }
                ForEach(searchResults) { user in
                    SocialPersonRow(person: SocialCardDto(userId: user.userId, username: user.username, avatarUrl: user.avatarUrl, name: user.name), social: social) {
                        switch user.relation {
                        case .FRIEND:
                            Text(tr("Friends")).font(.footnote).foregroundStyle(.secondary)
                        case .OUTGOING:
                            Button(tr("Withdraw")) { Task { await social.remove(user.userId) } }
                                .buttonStyle(.bordered).controlSize(.small)
                        case .INCOMING:
                            Button(tr("Accept")) { Task { await social.accept(user.userId) } }
                                .buttonStyle(.borderedProminent).controlSize(.small)
                        case .SELF:
                            EmptyView()
                        default:
                            Button(tr("Add")) {
                                Task {
                                    await social.sendRequest(to: user.userId)
                                    searchResults = (try? await viewModel.store.apiClient.searchSocialUsers(query: searchText.trimmingCharacters(in: .whitespaces).lowercased())) ?? []
                                }
                            }
                            .buttonStyle(.borderedProminent).controlSize(.small)
                            .accessibilityIdentifier("ios.social.add.\(user.userId)")
                        }
                    }
                    .contentShape(Rectangle())
                    .onTapGesture { onOpenFriend(SocialCardDto(userId: user.userId, username: user.username, avatarUrl: user.avatarUrl, name: user.name)) }
                }

                inviteRow

                Button {
                    showContactsConsent = true
                } label: {
                    Label(tr("Find contacts"), systemImage: "person.crop.circle.badge.magnifyingglass")
                }
                .accessibilityIdentifier("ios.social.contactsButton")
            } header: {
                Text(tr("Add friends"))
            }

            if !social.blocked.isEmpty {
                Section {
                    ForEach(social.blocked) { person in
                        SocialPersonRow(person: person, social: social) {
                            Button(tr("Unblock")) { Task { await social.unblock(person.userId) } }
                                .buttonStyle(.bordered).controlSize(.small)
                        }
                    }
                } header: {
                    Text(tr("Blocked"))
                }
            }
        }
        .navigationTitle(tr("Friends"))
        .sheet(isPresented: $showContactsConsent) {
            ContactSyncSheet(viewModel: viewModel)
        }
        .accessibilityIdentifier("ios.social.friendsPage")
    }

    @ViewBuilder
    private var inviteRow: some View {
        if let invite, let url = URL(string: invite.url) {
            VStack(alignment: .leading, spacing: 8) {
                ShareLink(item: url) {
                    Label(tr("Share link"), systemImage: "square.and.arrow.up")
                }
                .accessibilityIdentifier("ios.social.shareInviteButton")
                HStack(spacing: 12) {
                    InviteQrImage(url: invite.url)
                        .frame(width: 64, height: 64)
                    Text(invite.url)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                        .truncationMode(.middle)
                }
            }
            .padding(.vertical, 2)
        } else {
            Button {
                Task { invite = try? await viewModel.store.apiClient.createInvite() }
            } label: {
                Label(tr("Invite friends"), systemImage: "link")
            }
            .accessibilityIdentifier("ios.social.createInviteButton")
        }
    }
}

/// QR code for the invite link, rendered by CoreImage `CIQRCodeGenerator` (never HTML).
private struct InviteQrImage: View {
    let url: String
    private let context = CIContext()
    private let filter = CIFilter.qrCodeGenerator()

    private var image: Image? {
        filter.setValue(Data(url.utf8), forKey: "inputMessage")
        filter.setValue("M", forKey: "inputCorrectionLevel")
        guard let output = filter.outputImage else { return nil }
        let scaled = output.transformed(by: CGAffineTransform(scaleX: 8, y: 8))
        guard let cg = context.createCGImage(scaled, from: scaled.extent) else { return nil }
        return Image(uiImage: UIImage(cgImage: cg))
    }

    var body: some View {
        Group {
            if let image {
                image
                    .interpolation(.none)
                    .resizable()
                    .scaledToFit()
            } else {
                Image(systemName: "qrcode")
            }
        }
        .accessibilityLabel("QR")
    }
}

/// League page: the full leaderboard card (today's LeagueCard content).
struct SocialLeaguePage: View {
    @Bindable var social: SocialStore
    @Environment(\.lukiLocale) private var tr

    var body: some View {
        List {
            if let league = social.league {
                Section {
                    LeagueCard(league: league, social: social)
                }
            }
        }
        .navigationTitle(tr("League"))
        .accessibilityIdentifier("ios.social.leaguePage")
    }
}

/// Duels page: incoming, active, sent and recent duels plus the friend challenge picker.
struct SocialDuelsPage: View {
    @Bindable var social: SocialStore
    let myUsername: String?
    let myName: String?
    let myAvatarUrl: String?
    let myUserId: String
    @Environment(\.lukiLocale) private var tr
    @State private var showChallenge = false

    var body: some View {
        List {
            Section {
                DuelsSection(
                    social: social,
                    myUsername: myUsername,
                    myName: myName,
                    myAvatarUrl: myAvatarUrl,
                    myUserId: myUserId
                )
                if challengeable.isEmpty == false {
                    Button {
                        showChallenge = true
                    } label: {
                        Label(tr("Challenge to a duel"), systemImage: "figure.fencing")
                    }
                    .accessibilityIdentifier("ios.duel.challengeButton")
                }
            }
        }
        .navigationTitle(tr("Duels"))
        .sheet(isPresented: $showChallenge) {
            NavigationStack {
                List(challengeable) { friend in
                    Button {
                        showChallenge = false
                        Task { await social.challengeDuel(opponentId: friend.userId) }
                    } label: {
                        SocialPersonRow(person: friend, social: social) { EmptyView() }
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("ios.duel.challengePick.\(friend.userId)")
                }
                .navigationTitle(tr("Challenge to a duel"))
                .navigationBarTitleDisplayMode(.inline)
            }
            .presentationDetents([.medium, .large])
        }
        .accessibilityIdentifier("ios.social.duelsPage")
    }

    /// Friends without an open duel.
    private var challengeable: [SocialCardDto] {
        let open = Set(
            (social.duels.map { $0.active + $0.incoming + $0.outgoing } ?? [])
                .map(\.opponent.userId)
        )
        return social.friends.friends.filter { !open.contains($0.userId) }
    }
}

/// Raids page: the community card, squad raid cards and squads.
struct SocialRaidsPage: View {
    @Bindable var social: SocialStore
    let myUserId: String
    @Environment(\.lukiLocale) private var tr

    var body: some View {
        List {
            RaidsSection(social: social, myUserId: myUserId)
        }
        .navigationTitle(tr("Raids"))
        .accessibilityIdentifier("ios.social.raidsPage")
    }
}

/// Trophies page: the full shelf.
struct SocialTrophiesPage: View {
    let userId: String
    let social: SocialStore
    @Environment(\.lukiLocale) private var tr

    var body: some View {
        List {
            Section {
                TrophyShelfView(userId: userId, social: social)
                    .padding(.vertical, 4)
            }
        }
        .navigationTitle(tr("Trophies"))
        .accessibilityIdentifier("ios.social.trophiesPage")
    }
}
