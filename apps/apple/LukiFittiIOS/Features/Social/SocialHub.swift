import SwiftUI
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain
import LukiFittiStore

/// Detail pages the social hub pushes via `navigationDestination(item:)`.
enum SocialRoute: String, Identifiable, Hashable {
    case league, duels, raids, friends, trophies
    var id: String { rawValue }
}

/// The page a next move opens — same mapping as the web `nextMoveTarget`.
func nextMoveRoute(_ move: NextMoveDto) -> SocialRoute {
    switch move {
    case .friendRequests, .streakInvite, .friendAhead:
        return .friends
    case .duelInvite, .duelBehind:
        return .duels
    case .squadInvite, .raidNoDamage:
        return .raids
    case .leagueDemotion:
        return .league
    }
}

/// The one-line, calm next-move copy (the mean voice is for pushes only).
func nextMoveText(_ move: NextMoveDto, _ tr: SupportedLocale) -> String {
    switch move {
    case .friendRequests(let count):
        return count == 1
            ? tr("1 friend request waiting")
            : tr("%d friend requests waiting", count)
    case .duelInvite(_, let actor):
        return tr("@%@ challenged you to a duel", actor.username)
    case .streakInvite(_, let actor):
        return tr("@%@ wants a weekly streak with you", actor.username)
    case .squadInvite(let squadName, let actor):
        return tr("@%@ invited you to %@", actor.username, squadName)
    case .friendAhead(let actor, let them, let you):
        return tr("@%@ has %d workouts this week, you have %d", actor.username, them, you)
    case .duelBehind(_, let actor, let you, let them, let daysLeft):
        return tr("@%@ leads your duel %d–%d · %d days left", actor.username, them, you, daysLeft)
    case .leagueDemotion(let arena):
        return tr("You're in the demotion zone of %@", arenaName(arena, tr))
    case .raidNoDamage(let bossSlug):
        let boss = RaidBossCatalog.boss(slug: bossSlug)
        let name = localizedBossName(boss, slug: bossSlug, locale: tr)
        return tr("%@ is waiting for your first hit", name)
    }
}

/// "This week" card on the hub: "{workouts} of {goal} workouts · {points} EP",
/// a progress bar and the tappable next-move row.
struct SocialWeekCardView: View {
    let week: SocialSummaryWeekDto
    let nextMove: NextMoveDto?
    let onNextMove: (SocialRoute) -> Void
    @Environment(\.lukiLocale) private var tr

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(tr("This week"))
                .font(.footnote)
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
            Text(tr("%d of %d workouts · %d EP", week.workouts, week.goal, week.points))
                .font(.subheadline.weight(.medium))
                .accessibilityIdentifier("ios.social.weekLine")
            ProgressView(
                value: week.goal > 0 ? min(1, Double(week.workouts) / Double(week.goal)) : 0
            )
            .tint(LukiColors.accent)
        }
        .padding(.vertical, 2)

        if let nextMove {
            Button {
                onNextMove(nextMoveRoute(nextMove))
            } label: {
                HStack(spacing: 8) {
                    Text(nextMoveText(nextMove, tr))
                        .font(.subheadline)
                        .foregroundStyle(.primary)
                        .multilineTextAlignment(.leading)
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
            }
            .accessibilityIdentifier("ios.social.nextMove")
        }
    }
}

/// "Friends this week": horizontal avatar strip ordered by weekly workouts, a tap opens the
/// friend sheet, "See all" opens the Friends page. Empty friends → one Add friends button.
struct FriendsWeekStripView: View {
    let friendsWeek: [FriendWeekDto]
    let hasFriends: Bool
    let social: SocialStore
    let onOpenFriend: (SocialCardDto) -> Void
    let onSeeAll: () -> Void
    @Environment(\.lukiLocale) private var tr

    var body: some View {
        if !hasFriends {
            Button(tr("Add friends")) { onSeeAll() }
                .accessibilityIdentifier("ios.social.friendsWeek.add")
        } else {
            VStack(alignment: .leading, spacing: 8) {
                Text(tr("Friends this week"))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .textCase(.uppercase)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 14) {
                        ForEach(friendsWeek, id: \.card.userId) { entry in
                            Button {
                                onOpenFriend(entry.card)
                            } label: {
                                VStack(spacing: 4) {
                                    SocialAvatarView(
                                        userId: entry.card.userId,
                                        username: entry.card.username,
                                        name: entry.card.name,
                                        avatarUrl: entry.card.avatarUrl,
                                        social: social,
                                        size: 48
                                    )
                                    Text("@\(entry.card.username)")
                                        .font(.caption.weight(.medium))
                                        .lineLimit(1)
                                    Text(tr("%d× this week", entry.workouts))
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                                .frame(width: 64)
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("ios.social.friendsWeek.\(entry.card.userId)")
                        }
                        Button(tr("See all")) { onSeeAll() }
                            .font(.caption.weight(.medium))
                            .foregroundStyle(.secondary)
                            .frame(width: 64)
                            .accessibilityIdentifier("ios.social.friendsWeek.seeAll")
                    }
                }
            }
            .padding(.vertical, 2)
        }
    }
}

/// One tappable compact row on the hub — icon, line, chevron.
struct HubCompactRow<Icon: View>: View {
    let title: String
    var sub: String? = nil
    let testId: String
    let action: () -> Void
    @ViewBuilder var icon: () -> Icon

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                icon()
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.primary)
                    if let sub {
                        Text(sub)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityIdentifier(testId)
    }
}

/// Trophy count + the latest three icons on the hub — opens the Trophies page.
struct TrophyHubRow: View {
    let userId: String
    let social: SocialStore
    let action: () -> Void
    @Environment(\.lukiLocale) private var tr
    @State private var trophies: TrophyListDto?

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: "trophy.fill")
                    .foregroundStyle(.yellow)
                VStack(alignment: .leading, spacing: 2) {
                    Text(tr("Trophies") + (total > 0 ? " · \(total)" : ""))
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.primary)
                    if !latestKinds.isEmpty {
                        HStack(spacing: 3) {
                            ForEach(latestKinds, id: \.self) { _ in
                                Image(systemName: "trophy.fill")
                                    .font(.caption2)
                                    .foregroundStyle(.yellow)
                            }
                        }
                    }
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityIdentifier("ios.social.trophiesRow")
        .task {
            if let seeded = social.seededTrophies?[userId] {
                trophies = seeded
            } else {
                trophies = try? await social.apiClient.fetchTrophies(userId: userId)
            }
        }
    }

    private var total: Int {
        (trophies?.counts ?? [:]).values.reduce(0, +)
    }

    /// Latest three distinct trophy kinds.
    private var latestKinds: [String] {
        var seen = Set<String>()
        return (trophies?.items.prefix(6) ?? []).compactMap { item in
            let k = item.kind.rawValue
            return seen.insert(k).inserted ? k : nil
        }
        .prefix(3).map { $0 }
    }
}
