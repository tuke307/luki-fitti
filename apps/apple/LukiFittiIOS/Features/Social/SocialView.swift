import SwiftUI
import PhotosUI
import Contacts
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain
import LukiFittiStore

/// Social hub: weekly summary + next move, the friends-week strip, compact
/// cards for league/duels/raids/streaks and the trophies row. Each card pushes
/// a detail page (`SocialRoute`); celebrations, inbox, onboarding, report and
/// the friend sheet stay on the hub.
public struct SocialView: View {
    @Bindable public var viewModel: LukiAppViewModel
    @Environment(\.lukiLocale) private var tr
    @Environment(\.scenePhase) private var scenePhase

    @State private var route: SocialRoute?
    @State private var showOnboarding = false
    @State private var showInbox = false
    @State private var reportTarget: SocialCardDto?
    @State private var friendSheetTarget: SocialCardDto?
    /// Unread polling: on appear/activate and every 60 s while visible.
    @State private var unreadTimer: Timer?

    public init(viewModel: LukiAppViewModel) {
        self.viewModel = viewModel
    }

    private var social: SocialStore { viewModel.social }
    private var myUserId: String { viewModel.store.currentUser?.id ?? "me" }

    public var body: some View {
        List {
            ownCardSection
            if let week = social.summary?.week {
                Section {
                    SocialWeekCardView(
                        week: week,
                        nextMove: social.summary?.nextMove,
                        onNextMove: { route = $0 }
                    )
                }
            }
            Section {
                FriendsWeekStripView(
                    friendsWeek: social.summary?.friendsWeek ?? [],
                    hasFriends: !social.friends.friends.isEmpty,
                    social: social,
                    onOpenFriend: { friendSheetTarget = $0 },
                    onSeeAll: { route = .friends }
                )
            }
            compactCardsSection
            Section {
                TrophyHubRow(userId: myUserId, social: social) { route = .trophies }
            }
        }
        .listStyle(.insetGrouped)
        .listSectionSpacing(14)
        .navigationDestination(item: $route) { destination($0) }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    route = .friends
                } label: {
                    ZStack(alignment: .topTrailing) {
                        Image(systemName: "person.2")
                        if !social.friends.incoming.isEmpty {
                            Text("\(min(social.friends.incoming.count, 99))")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 3)
                                .background(LukiColors.destructive, in: Capsule())
                                .offset(x: 8, y: -6)
                        }
                    }
                }
                .accessibilityLabel(tr("Friends"))
                .accessibilityIdentifier("ios.social.friendsButton")
            }
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
        .onChange(of: social.requestedSection, initial: true) { _, section in
            guard let section else { return }
            social.requestedSection = nil
            switch section {
            case .inbox: showInbox = true
            case .friends, .requests: route = .friends
            case .duels: route = .duels
            case .raids: route = .raids
            case .league: route = .league
            }
        }
        .sheet(isPresented: $showOnboarding) {
            SocialOnboardingSheet(viewModel: viewModel, isPresented: $showOnboarding)
        }
        .sheet(isPresented: $showInbox) {
            NavigationStack { SocialInboxSheet(viewModel: viewModel) }
        }
        .sheet(item: $reportTarget) { target in
            NavigationStack { SocialReportSheet(viewModel: viewModel, target: target) }
        }
        .sheet(item: $friendSheetTarget) { target in
            NavigationStack {
                FriendSheet(friend: target, social: social) { reportTarget = $0 }
            }
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
    }

    @ViewBuilder
    private func destination(_ route: SocialRoute) -> some View {
        switch route {
        case .league:
            SocialLeaguePage(social: social)
        case .duels:
            SocialDuelsPage(
                social: social,
                myUsername: social.profile?.username,
                myName: social.profile?.name,
                myAvatarUrl: social.profile?.avatarUrl,
                myUserId: myUserId
            )
        case .raids:
            SocialRaidsPage(social: social, myUserId: myUserId)
        case .friends:
            SocialFriendsPage(
                social: social,
                viewModel: viewModel,
                onOpenFriend: { friendSheetTarget = $0 }
            )
        case .trophies:
            SocialTrophiesPage(userId: myUserId, social: social)
        }
    }

    private func maybeShowOnboarding() {
        guard let profile = social.profile, profile.username == nil,
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

    // MARK: - Own card (username prompt + paused note)

    @ViewBuilder
    private var ownCardSection: some View {
        if let profile = social.profile, profile.username == nil {
            Section {
                HStack(spacing: 12) {
                    Text(tr("Pick a username so friends can find you."))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button(tr("Choose username")) { showOnboarding = true }
                        .font(.subheadline)
                        .accessibilityIdentifier("ios.social.chooseUsernameButton")
                }
                .padding(.vertical, 2)
            }
        }
        if social.profile?.socialPaused == true {
            Section {
                Text(tr("Friends features are paused — you're invisible in search and leagues."))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }

    // MARK: - Compact cards

    @ViewBuilder
    private var compactCardsSection: some View {
        Section {
            if let league = social.league {
                leagueRow(league)
            }
            if let duels = social.duels {
                duelsRow(duels)
            }
            if let raids = social.raids, let community = raids.community {
                raidRow(raids: raids, community: community)
            }
            if let streaks = social.streaks {
                streaksRow(streaks)
            }
        }
    }

    @ViewBuilder
    private func leagueRow(_ league: LeagueCurrentDto) -> some View {
        if league.stage == .FRIENDS || league.cohort == nil {
            let rank = social.leagueFriends.first { $0.isSelf }?.rank
            HubCompactRow(
                title: tr("Friends leaderboard") + (rank.map { " · #\($0)" } ?? ""),
                testId: "ios.social.hubLeague",
                action: { route = .league }
            ) {
                ArenaBadge(arena: league.arena, size: 28)
            }
        } else {
            let self_ = league.cohort?.members.first { $0.isSelf }
            let toPromote = (self_?.rank ?? 0) - (league.cohort?.promoteCount ?? 0)
            HubCompactRow(
                title: arenaName(league.arena, tr) + (self_.map { " · #\($0.rank)" } ?? ""),
                sub: toPromote > 0 ? tr("%d to promotion", toPromote) : nil,
                testId: "ios.social.hubLeague",
                action: { route = .league }
            ) {
                ArenaBadge(arena: league.arena, size: 28)
            }
        }
    }

    @ViewBuilder
    private func duelsRow(_ duels: DuelListDto) -> some View {
        if let best = duels.active.first {
            let days = best.daysLeft.map { " · " + tr("%d d left", $0) } ?? ""
            HubCompactRow(
                title: "vs @\(best.opponent.username) · \(best.you)–\(best.them)\(days)",
                testId: "ios.social.hubDuels",
                action: { route = .duels }
            ) {
                Image(systemName: "figure.fencing").foregroundStyle(.secondary)
            }
        } else {
            let waiting = duels.incoming.count + duels.outgoing.count
            HubCompactRow(
                title: waiting > 0 ? tr("%d challenges waiting", waiting) : tr("Challenge a friend"),
                testId: "ios.social.hubDuels",
                action: { route = waiting > 0 ? .duels : .friends }
            ) {
                Image(systemName: "figure.fencing").foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private func raidRow(raids: RaidListDto, community: RaidDto) -> some View {
        Button { route = .raids } label: {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 12) {
                    Image(systemName: "bolt.shield").foregroundStyle(.secondary)
                    Text(
                        localizedBossName(
                            RaidBossCatalog.boss(slug: community.bossSlug),
                            slug: community.bossSlug,
                            locale: tr
                        )
                        + (raids.squads.isEmpty
                            ? ""
                            : " · " + tr("%d squad raids", raids.squads.count))
                    )
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.primary)
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
                ProgressView(
                    value: community.maxHp > 0
                        ? max(0, min(1, 1 - Double(community.damage) / Double(community.maxHp)))
                        : 0
                )
                .tint(.red)
                Text(tr("Your damage %d", community.yourDamage))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("ios.social.hubRaids")
    }

    @ViewBuilder
    private func streaksRow(_ streaks: StreakListDto) -> some View {
        let longest = streaks.active.map(\.longest).max() ?? 0
        HubCompactRow(
            title: streaks.active.isEmpty
                ? tr("Start a streak with a friend")
                : tr("%d active · longest %d weeks", streaks.active.count, longest),
            testId: "ios.social.hubStreaks",
            action: { route = .friends }
        ) {
            Image(systemName: "flame").foregroundStyle(.secondary)
        }
    }
}

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
