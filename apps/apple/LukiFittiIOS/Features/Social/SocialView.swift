import SwiftUI
import PhotosUI
import CoreImage.CIFilterBuiltins
import Contacts
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain
import LukiFittiStore

/// Social tab: own card, friends/requests, add-friends (search, invite, contacts) and the
/// blocked list. League and effort-point sections from PR 2 slot in above `friendsSection`.
public struct SocialView: View {
    @Bindable public var viewModel: LukiAppViewModel
    @Environment(\.lukiLocale) private var tr
    @Environment(\.scenePhase) private var scenePhase

    @State private var showProfileSheet = false
    @State private var showOnboarding = false
    @State private var showInbox = false
    @State private var showContactsConsent = false
    @State private var searchText = ""
    @State private var searchResults: [SocialUserDto] = []
    @State private var searchTask: Task<Void, Never>?
    @State private var invite: FriendInviteDto?
    @State private var reportTarget: SocialCardDto?
    @State private var removeTarget: SocialCardDto?
    @State private var blockTarget: SocialCardDto?
    @State private var friendSheetTarget: SocialCardDto?
    @State private var streakEndTarget: SocialCardDto?
    /// Unread polling: on appear/activate and every 60 s while visible.
    @State private var unreadTimer: Timer?

    public init(viewModel: LukiAppViewModel) {
        self.viewModel = viewModel
    }

    private var social: SocialStore { viewModel.social }

    public var body: some View {
        List {
            ownCardSection
            if let week = social.pointsWeek {
                Section { ThisWeekCard(week: week) }
            }
            if let league = social.league {
                Section { LeagueCard(league: league, social: social) } header: {
                    Text(tr("League"))
                }
            }
            Section {
                DuelsSection(
                    social: social,
                    myHandle: social.profile?.handle,
                    myName: social.profile?.name,
                    myAvatarUrl: social.profile?.avatarUrl,
                    myUserId: viewModel.store.currentUser?.id ?? "me"
                )
            }
            RaidsSection(social: social, myUserId: viewModel.store.currentUser?.id ?? "me")
            friendsSection
            requestsSection
            sentSection
            addFriendsSection
            blockedSection
        }
        .listStyle(.insetGrouped)
        .listSectionSpacing(14)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showInbox = true
                } label: {
                    Image(systemName: social.unreadCount > 0 ? "bell.badge" : "bell")
                }
                .accessibilityLabel(tr("Notifications"))
                .accessibilityIdentifier("ios.social.inboxButton")
            }
        }
        .refreshable { await social.refreshAll() }
        .task {
            await social.refreshAll()
            maybeShowOnboarding()
            startUnreadPolling()
        }
        .onDisappear { unreadTimer?.invalidate(); unreadTimer = nil }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await social.refreshUnread() } }
        }
        .onChange(of: social.requestedSection) { _, section in
            guard let section else { return }
            social.requestedSection = nil
            if section == .inbox { showInbox = true }
            // friends/requests are the default list sections — no extra navigation needed.
        }
        .sheet(isPresented: $showProfileSheet) {
            NavigationStack { SocialProfileSheet(viewModel: viewModel) }
        }
        .sheet(isPresented: $showOnboarding) {
            SocialOnboardingSheet(viewModel: viewModel, isPresented: $showOnboarding)
        }
        .sheet(isPresented: $showInbox) {
            NavigationStack { SocialInboxSheet(viewModel: viewModel) }
        }
        .sheet(isPresented: $showContactsConsent) {
            ContactSyncSheet(viewModel: viewModel)
        }
        .sheet(item: $reportTarget) { target in
            NavigationStack { SocialReportSheet(viewModel: viewModel, target: target) }
        }
        .sheet(item: $friendSheetTarget) { target in
            NavigationStack { FriendSheet(friend: target, social: social) }
        }
        .fullScreenCover(
            item: Binding<RaidResultDto?>(
                get: { social.raids?.pendingResults.first },
                set: { _ in }
            )
        ) { result in
            RaidCelebrationOverlay(result: result) {
                Task { await social.markRaidResultSeen(raidId: result.raidId) }
            }
        }
        .fullScreenCover(
            item: Binding<DuelItemDto?>(
                get: { social.duels?.pendingResult },
                set: { _ in }
            )
        ) { result in
            DuelCelebrationOverlay(
                result: result,
                onDismiss: { Task { await social.markDuelResultSeen() } },
                onRematch: {
                    let opponentId = result.opponent.userId
                    Task {
                        await social.markDuelResultSeen()
                        await social.challengeDuel(opponentId: opponentId)
                    }
                }
            )
        }
        // PROMOTED/DEMOTED get a real full-screen cover so the celebration also covers
        // the floating tab bar (the old .overlay left it tappable and unhittable).
        .fullScreenCover(
            item: Binding<LeaguePendingResultDto?>(
                get: {
                    guard let r = social.league?.pendingResult, r.outcome != .STAYED else { return nil }
                    return r
                },
                set: { _ in }
            )
        ) { result in
            LeagueCelebrationOverlay(result: result) {
                Task { await social.markResultSeen() }
            }
        }
        .overlay(alignment: .top) {
            if let result = social.league?.pendingResult, result.outcome == .STAYED {
                StayedToast(arena: result.toArena)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .padding(.top, 4)
                    .task {
                        try? await Task.sleep(nanoseconds: 2_500_000_000)
                        await social.markResultSeen()
                    }
            }
        }
        .animation(.easeInOut(duration: 0.25), value: social.league?.pendingResult != nil)
        .confirmationDialog(
            tr("Remove @%@ as a friend?", removeTarget?.handle ?? ""),
            isPresented: Binding(get: { removeTarget != nil }, set: { if !$0 { removeTarget = nil } }),
            titleVisibility: .visible
        ) {
            Button(tr("Remove friend"), role: .destructive) {
                if let t = removeTarget { Task { await social.remove(t.userId) } }
            }
            Button(tr("Cancel"), role: .cancel) {}
        } message: {
            Text(tr("You can send a new request any time."))
        }
        .confirmationDialog(
            tr("Block @%@?", blockTarget?.handle ?? ""),
            isPresented: Binding(get: { blockTarget != nil }, set: { if !$0 { blockTarget = nil } }),
            titleVisibility: .visible
        ) {
            Button(tr("Block"), role: .destructive) {
                if let t = blockTarget { Task { await social.block(t.userId) } }
            }
            Button(tr("Cancel"), role: .cancel) {}
        } message: {
            Text(tr("They can no longer find you or send you requests."))
        }
        .confirmationDialog(
            tr("End the streak with @%@?", streakEndTarget?.handle ?? ""),
            isPresented: Binding(get: { streakEndTarget != nil }, set: { if !$0 { streakEndTarget = nil } }),
            titleVisibility: .visible
        ) {
            Button(tr("End streak"), role: .destructive) {
                if let t = streakEndTarget,
                   let streak = social.streaks?.streak(with: t.userId) {
                    Task { await social.endStreak(streakId: streak.id) }
                }
            }
            Button(tr("Cancel"), role: .cancel) {}
        } message: {
            Text(tr("The count resets and you can start again any time."))
        }
    }

    private func maybeShowOnboarding() {
        guard let profile = social.profile, profile.handle == nil,
              !social.onboardingDismissedThisLaunch else { return }
        social.onboardingDismissedThisLaunch = true
        showOnboarding = true
    }

    private func startUnreadPolling() {
        unreadTimer?.invalidate()
        unreadTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [social] _ in
            Task { @MainActor in await social.refreshUnread() }
        }
    }

    // MARK: - Own card

    @ViewBuilder
    private var ownCardSection: some View {
        Section {
            HStack(spacing: 12) {
                if let profile = social.profile {
                    SocialAvatarView(
                        userId: viewModel.store.currentUser?.id ?? "me",
                        handle: profile.handle ?? "",
                        name: profile.name,
                        avatarUrl: profile.avatarUrl,
                        social: social,
                        size: 52
                    )
                    VStack(alignment: .leading, spacing: 2) {
                        if let handle = profile.handle {
                            Text("@\(handle)").font(.headline)
                        } else {
                            Text(tr("Pick a handle so friends can find you."))
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        if let name = profile.name, !name.isEmpty {
                            Text(name).font(.subheadline).foregroundStyle(.secondary)
                        }
                    }
                    Spacer()
                    Button(tr("Edit profile")) { showProfileSheet = true }
                        .font(.subheadline)
                        .accessibilityIdentifier("ios.social.editProfileButton")
                } else {
                    ProgressView()
                        .frame(maxWidth: .infinity, alignment: .center)
                }
            }
            .padding(.vertical, 2)
        }
        if social.profile?.socialPaused == true {
            Section {
                Text(tr("Friends features are paused — you're invisible in search and leagues."))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }

    // MARK: - Friends / requests / sent

    private var friendsSection: some View {
        Section {
            if social.friends.friends.isEmpty {
                Text(tr("No friends yet. Search for a handle or send an invite."))
                    .foregroundStyle(.secondary)
            }
            ForEach(social.friends.friends) { friend in
                SocialPersonRow(
                    person: friend,
                    social: social,
                    streak: social.streaks?.streak(with: friend.userId)
                ) {
                    friendMenu(for: friend)
                }
                .contentShape(Rectangle())
                .onTapGesture { friendSheetTarget = friend }
            }
        } header: {
            Text(tr("Friends"))
        }
    }

    @ViewBuilder
    private var requestsSection: some View {
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
    }

    @ViewBuilder
    private var sentSection: some View {
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
    }

    /// The ⋯ menu on a friend row: duel challenge, streak actions, then the
    /// destructive friend actions.
    @ViewBuilder
    private func friendMenu(for friend: SocialCardDto) -> some View {
        Menu {
            if social.duels != nil {
                let blocked = social.openDuel(with: friend.userId) != nil
                    ? tr("A duel with @%@ is already open", friend.handle)
                    : social.openDuelCount >= 3 ? tr("You already have 3 open duels") : nil
                Button {
                    Task { await social.challengeDuel(opponentId: friend.userId) }
                } label: {
                    Label(blocked ?? tr("Challenge to a duel"), systemImage: "figure.fencing")
                }
                .disabled(blocked != nil)
                .accessibilityIdentifier("ios.duel.challenge.\(friend.userId)")
            }
            if let streaks = social.streaks {
                let streak = streaks.streak(with: friend.userId)
                if streak == nil {
                    Button {
                        Task { await social.inviteStreak(friendId: friend.userId) }
                    } label: {
                        Label(tr("Start streak"), systemImage: "flame")
                    }
                    .accessibilityIdentifier("ios.streak.invite.\(friend.userId)")
                } else if let streak, streak.status == .PENDING,
                          streaks.incoming.contains(where: { $0.id == streak.id }) {
                    Button {
                        Task { await social.acceptStreak(streakId: streak.id) }
                    } label: {
                        Label(tr("Accept streak"), systemImage: "flame")
                    }
                    .accessibilityIdentifier("ios.streak.accept.\(friend.userId)")
                } else if streak?.status == .ACTIVE {
                    Button(role: .destructive) { streakEndTarget = friend } label: {
                        Label(tr("End streak"), systemImage: "flame")
                    }
                    .accessibilityIdentifier("ios.streak.end.\(friend.userId)")
                }
            }
            Button(role: .destructive) { removeTarget = friend } label: {
                Label(tr("Remove friend"), systemImage: "person.badge.minus")
            }
            Button(role: .destructive) { blockTarget = friend } label: {
                Label(tr("Block"), systemImage: "hand.raised")
            }
            Button { reportTarget = friend } label: {
                Label(tr("Report"), systemImage: "flag")
            }
        } label: {
            Image(systemName: "ellipsis.circle")
                .foregroundStyle(.secondary)
        }
        .accessibilityLabel(tr("More options for @%@", friend.handle))
        .accessibilityIdentifier("ios.social.menu.\(friend.userId)")
    }

    // MARK: - Add friends

    private var addFriendsSection: some View {
        Section {
            TextField(tr("Search by @handle"), text: $searchText)
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
                    Text(tr("Nobody found with that handle.")).font(.footnote).foregroundStyle(.secondary)
                }
            }
            ForEach(searchResults) { user in
                SocialPersonRow(person: SocialCardDto(userId: user.userId, handle: user.handle, avatarUrl: user.avatarUrl, name: user.name), social: social) {
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
    }

    // MARK: - Invite

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

    // MARK: - Blocked

    @ViewBuilder
    private var blockedSection: some View {
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
        if let image {
            image
                .interpolation(.none)
                .resizable()
                .scaledToFit()
                .accessibilityLabel("QR")
        }
    }
}

/// Short "stayed in <arena>" toast — the quiet STAYED outcome gets no full-screen overlay.
private struct StayedToast: View {
    let arena: Arena
    @Environment(\.lukiLocale) private var tr

    var body: some View {
        Text(tr("You stayed in %@", arenaName(arena, tr)))
            .font(.footnote.weight(.medium))
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(.ultraThinMaterial, in: Capsule())
            .shadow(radius: 4, y: 2)
            .accessibilityIdentifier("ios.league.stayedToast")
    }
}
