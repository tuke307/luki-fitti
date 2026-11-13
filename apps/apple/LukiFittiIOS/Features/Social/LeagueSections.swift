import SwiftUI
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain
import LukiFittiStore

/// "2 d 4 h" / "4 h 12 m" / "45 m" until the ISO instant (week end, Berlin Monday 00:00).
func leagueCountdown(to endsAt: String, _ tr: SupportedLocale) -> String {
    guard let ms = EffortPoints.epochMillis(endsAt) else { return "" }
    let remaining = max(0, ms / 1000 - Date().timeIntervalSince1970)
    let days = Int(remaining) / 86_400
    let hours = (Int(remaining) % 86_400) / 3_600
    let minutes = (Int(remaining) % 3_600) / 60
    if days > 0 { return tr("%d d %d h", days, hours) }
    if hours > 0 { return tr("%d h %d m", hours, minutes) }
    return tr("%d m", minutes)
}

/// "This week" card: weekly EP total, Mon–Sun bars with the daily-cap marker, goal progress.
struct ThisWeekCard: View {
    let week: PointsWeekDto
    @Environment(\.lukiLocale) private var tr

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(tr("This week"))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .textCase(.uppercase)
                Spacer()
                HStack(alignment: .firstTextBaseline, spacing: 3) {
                    Text("\(week.points)")
                        .font(.title2.bold().monospacedDigit())
                    Text("EP")
                        .font(.footnote.weight(.medium))
                        .foregroundStyle(.secondary)
                }
            }

            WeekBarChart(week: week)

            if week.goal.target > 0 {
                Text(
                    week.goal.done >= week.goal.target
                        ? tr("Weekly goal reached · +%d", week.goal.bonus)
                        : tr(
                            "%d of %d workouts · +%d bonus at %d",
                            week.goal.done, week.goal.target, week.goal.available, week.goal.target
                        )
                )
                .font(.footnote)
                .foregroundStyle(.secondary)
                .accessibilityIdentifier("ios.league.weekGoal")
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("ios.league.thisWeek")
    }
}

/// Mon–Sun capped-EP bars with a dashed line at the daily cap.
private struct WeekBarChart: View {
    let week: PointsWeekDto
    @Environment(\.lukiLocale) private var tr
    private let barArea: CGFloat = 56

    private struct Day: Identifiable {
        var id: String { dayKey }
        var dayKey: String
        var label: String
        var capped: Int
    }

    private var days: [Day] {
        guard let monday = EffortPoints.epochMillis("\(week.weekKey)T12:00:00.000Z")
            .map({ Date(timeIntervalSince1970: $0 / 1000) }) else { return [] }
        let byDay = Dictionary(uniqueKeysWithValues: week.days.map { ($0.dayKey, $0.capped) })
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: tr.rawValue)
        formatter.dateFormat = "EEEEE"
        formatter.timeZone = TimeZone(identifier: "UTC")
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        return (0..<7).map { i in
            let date = monday.addingTimeInterval(TimeInterval(i * 86_400))
            let c = cal.dateComponents([.year, .month, .day], from: date)
            let key = String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
            return Day(dayKey: key, label: formatter.string(from: date), capped: byDay[key] ?? 0)
        }
    }

    var body: some View {
        let chartMax = max(week.dailyCap, days.map(\.capped).max() ?? 0, 1)
        VStack(spacing: 4) {
            HStack(alignment: .bottom, spacing: 6) {
                ForEach(days) { day in
                    RoundedRectangle(cornerRadius: 3, style: .continuous)
                        .fill(LukiColors.accent.opacity(0.85))
                        .frame(height: max(3, CGFloat(day.capped) / CGFloat(chartMax) * barArea))
                        .frame(maxWidth: .infinity)
                }
            }
            .frame(height: barArea, alignment: .bottom)
            .overlay(alignment: .top) {
                if week.dailyCap > 0 {
                    let capY = barArea - CGFloat(week.dailyCap) / CGFloat(chartMax) * barArea
                    HStack(spacing: 4) {
                        ForEach(0..<80, id: \.self) { _ in
                            Rectangle().frame(width: 5, height: 1)
                        }
                    }
                    .foregroundStyle(.secondary.opacity(0.6))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .clipped()
                    .offset(y: capY)
                }
            }
            .accessibilityHidden(true)
            HStack(spacing: 6) {
                ForEach(days) { day in
                    Text(day.label)
                        .font(.system(size: 9))
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity)
                }
            }
        }
    }
}

/// League board toggle state (League cohort vs. friends leaderboard).
enum LeagueBoard: Hashable {
    case league
    case friends
}

/// Stage-aware league card: FRIENDS shows the friends board + note; GLOBAL/ARENAS shows
/// the zoned cohort with a League · Friends segment and the History link.
struct LeagueCard: View {
    let league: LeagueCurrentDto
    @Bindable var social: SocialStore
    @State private var board: LeagueBoard = .league
    @State private var showHistory = false
    @Environment(\.lukiLocale) private var tr

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                ArenaBadge(arena: league.arena, size: 32)
                VStack(alignment: .leading, spacing: 1) {
                    Text(arenaName(league.arena, tr))
                        .font(.subheadline.weight(.semibold))
                    Text(tr("ends in %@", leagueCountdown(to: league.endsAt, tr)))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if league.stage != .FRIENDS {
                    Picker(tr("League"), selection: $board) {
                        Text(tr("League")).tag(LeagueBoard.league)
                        Text(tr("Friends")).tag(LeagueBoard.friends)
                    }
                    .pickerStyle(.segmented)
                    .frame(width: 180)
                    .accessibilityIdentifier("ios.league.boardPicker")
                }
            }

            if league.stage == .FRIENDS {
                Text(tr("Leagues start when more people train. You're in %@.", arenaName(league.arena, tr)))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("ios.league.friendsNote")
            }
        }
        .padding(.vertical, 4)

        if league.stage != .FRIENDS && board == .league {
            if let cohort = league.cohort {
                ForEach(cohort.members) { member in
                    leagueRow(
                        rank: member.rank,
                        card: member.card,
                        points: member.points,
                        isSelf: member.isSelf,
                        zone: member.zone
                    )
                }
            } else {
                Text(tr("Finish a workout to join this week’s league."))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        } else {
            ForEach(social.leagueFriends) { row in
                leagueRow(
                    rank: row.rank,
                    card: row.card,
                    points: row.points,
                    isSelf: row.isSelf,
                    zone: nil
                )
            }
        }

        Button {
            showHistory = true
        } label: {
            Label(tr("History"), systemImage: "clock.arrow.circlepath")
                .font(.subheadline)
        }
        .accessibilityIdentifier("ios.league.historyButton")
        .sheet(isPresented: $showHistory) {
            NavigationStack { LeagueHistorySheet(social: social) }
        }
    }

    private func leagueRow(
        rank: Int,
        card: SocialCardDto,
        points: Int,
        isSelf: Bool,
        zone: LeagueZone?
    ) -> some View {
        HStack(spacing: 10) {
            Text("\(rank)")
                .font(.footnote.monospacedDigit())
                .foregroundStyle(.secondary)
                .frame(width: 22, alignment: .trailing)
            SocialAvatarView(
                userId: card.userId,
                handle: card.handle,
                name: card.name,
                avatarUrl: card.avatarUrl,
                social: social,
                size: 30
            )
            Text("@\(card.handle)")
                .font(.subheadline.weight(isSelf ? .semibold : .regular))
                .lineLimit(1)
            Spacer()
            if zone == .PROMOTE {
                Image(systemName: "chevron.up")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.green)
                    .accessibilityLabel(tr("Promotion zone"))
            } else if zone == .DEMOTE {
                Image(systemName: "chevron.down")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.red)
                    .accessibilityLabel(tr("Demotion zone"))
            }
            Text("\(points)")
                .font(.subheadline.weight(.semibold).monospacedDigit())
        }
        .listRowBackground(
            (zone == .PROMOTE ? Color.green.opacity(0.08)
                : zone == .DEMOTE ? Color.red.opacity(0.08)
                : isSelf ? LukiColors.fill
                : LukiColors.cardBackground)
        )
        .accessibilityIdentifier("ios.league.row.\(card.userId)")
    }
}

/// Last 12 finished weeks behind the History row.
private struct LeagueHistorySheet: View {
    @Bindable var social: SocialStore
    @Environment(\.lukiLocale) private var tr
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        List {
            if social.leagueHistory.isEmpty {
                Text(tr("Finished weeks show up here."))
                    .foregroundStyle(.secondary)
            }
            ForEach(social.leagueHistory) { entry in
                HStack(spacing: 10) {
                    ArenaBadge(arena: entry.arena, size: 26)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(tr("Week of %@", weekLabel(entry.weekKey)))
                            .font(.subheadline)
                        Text(outcomeName(entry.outcome))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 1) {
                        Text("#\(entry.rank)")
                            .font(.subheadline.monospacedDigit())
                        Text("\(entry.points) EP")
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .navigationTitle(tr("History"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button(tr("Done")) { dismiss() }
            }
        }
        .task { await social.refreshLeagueHistory() }
    }

    private func weekLabel(_ weekKey: String) -> String {
        guard let ms = EffortPoints.epochMillis("\(weekKey)T12:00:00.000Z") else { return weekKey }
        let f = DateFormatter()
        f.locale = Locale(identifier: tr.rawValue)
        f.dateStyle = .medium
        f.timeStyle = .none
        return f.string(from: Date(timeIntervalSince1970: ms / 1000))
    }

    private func outcomeName(_ outcome: LeagueOutcome?) -> String {
        switch outcome {
        case .PROMOTED: tr("Promoted")
        case .DEMOTED: tr("Demoted")
        case .STAYED, nil: tr("Stayed")
        }
    }
}
