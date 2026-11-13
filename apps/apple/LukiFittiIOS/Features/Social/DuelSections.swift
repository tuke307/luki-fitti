import SwiftUI
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain
import LukiFittiStore

/// Duels section between the league card and Friends: active head-to-head duels with a
/// two-sided score bar and a tap-through detail sheet, incoming/outgoing challenges and a
/// friendly empty state.
struct DuelsSection: View {
    @Bindable var social: SocialStore
    let myHandle: String?
    let myName: String?
    let myAvatarUrl: String?
    let myUserId: String
    @Environment(\.lukiLocale) private var tr
    @State private var detailId: SheetId?

    var body: some View {
        if let duels = social.duels {
            let open = duels.active.count + duels.incoming.count + duels.outgoing.count
            VStack(alignment: .leading, spacing: 8) {
                Label(tr("Duels"), systemImage: "figure.fencing")
                    .font(.subheadline.weight(.semibold))
                if open == 0 {
                    Text(tr("Challenge a friend to a 7-day duel."))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.vertical, 4)

            ForEach(duels.active) { duel in
                Button {
                    detailId = SheetId(id: duel.id)
                } label: {
                    ActiveDuelRow(duel: duel, social: social, myUserId: myUserId,
                                myHandle: myHandle, myName: myName, myAvatarUrl: myAvatarUrl)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("ios.duel.row.\(duel.id)")
            }

            if !duels.incoming.isEmpty {
                Text(tr("Challenges"))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .textCase(.uppercase)
                ForEach(duels.incoming) { duel in
                    HStack(spacing: 10) {
                        SocialAvatarView(
                            userId: duel.opponent.userId, handle: duel.opponent.handle,
                            name: duel.opponent.name, avatarUrl: duel.opponent.avatarUrl,
                            social: social, size: 34)
                        Text("@\(duel.opponent.handle)")
                            .font(.subheadline.weight(.semibold))
                            .lineLimit(1)
                        Spacer()
                        Button(tr("Accept")) { Task { await social.acceptDuel(duelId: duel.id) } }
                            .buttonStyle(.borderedProminent)
                            .controlSize(.small)
                            .accessibilityIdentifier("ios.duel.accept.\(duel.id)")
                        Button(tr("Decline")) { Task { await social.declineDuel(duelId: duel.id) } }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                            .accessibilityIdentifier("ios.duel.decline.\(duel.id)")
                    }
                }
            }

            if !duels.outgoing.isEmpty {
                Text(tr("Sent"))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .textCase(.uppercase)
                ForEach(duels.outgoing) { duel in
                    HStack(spacing: 10) {
                        SocialAvatarView(
                            userId: duel.opponent.userId, handle: duel.opponent.handle,
                            name: duel.opponent.name, avatarUrl: duel.opponent.avatarUrl,
                            social: social, size: 34)
                        Text("@\(duel.opponent.handle)")
                            .font(.subheadline.weight(.semibold))
                            .lineLimit(1)
                        Spacer()
                        Button(tr("Withdraw")) { Task { await social.cancelDuel(duelId: duel.id) } }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                            .accessibilityIdentifier("ios.duel.withdraw.\(duel.id)")
                    }
                }
            }

            Color.clear
                .frame(height: 0)
                .sheet(item: $detailId) { sel in
                    NavigationStack { DuelDetailSheet(duelId: sel.id, social: social) }
                }
        }
    }
}

private struct SheetId: Identifiable {
    let id: String
}

/// Avatar vs avatar with a two-sided score bar and "3 d left".
private struct ActiveDuelRow: View {
    let duel: DuelItemDto
    let social: SocialStore
    let myUserId: String
    let myHandle: String?
    let myName: String?
    let myAvatarUrl: String?
    @Environment(\.lukiLocale) private var tr

    private var youFraction: CGFloat {
        let total = duel.you + duel.them
        return total > 0 ? CGFloat(duel.you) / CGFloat(total) : 0.5
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
                SocialAvatarView(
                    userId: myUserId, handle: myHandle ?? "", name: myName,
                    avatarUrl: myAvatarUrl, social: social, size: 34)
                VStack(alignment: .leading, spacing: 3) {
                    HStack {
                        Text("\(duel.you)")
                            .font(.subheadline.weight(.semibold).monospacedDigit())
                        Spacer()
                        Text("@\(duel.opponent.handle)")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                        Spacer()
                        Text("\(duel.them)")
                            .font(.subheadline.weight(.semibold).monospacedDigit())
                    }
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(LukiColors.fill)
                            Capsule()
                                .fill(LukiColors.accent)
                                .frame(width: geo.size.width * youFraction)
                        }
                    }
                    .frame(height: 8)
                }
                SocialAvatarView(
                    userId: duel.opponent.userId, handle: duel.opponent.handle,
                    name: duel.opponent.name, avatarUrl: duel.opponent.avatarUrl,
                    social: social, size: 34)
            }
            if let daysLeft = duel.daysLeft {
                Text(tr("%d d left", daysLeft))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
        }
    }
}

/// Per-day paired bars inside the duel detail sheet.
private struct DuelDetailSheet: View {
    let duelId: String
    let social: SocialStore
    @Environment(\.lukiLocale) private var tr
    @Environment(\.dismiss) private var dismiss
    @State private var detail: DuelDetailDto?

    private var dayMax: Int {
        max(1, detail?.days.flatMap { [$0.you, $0.them] }.max() ?? 0)
    }

    var body: some View {
        List {
            if let detail {
                Section {
                    HStack {
                        Text("\(detail.you)")
                            .font(.title2.bold().monospacedDigit())
                        Spacer()
                        if let daysLeft = detail.daysLeft {
                            Text(tr("%d d left", daysLeft))
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                        Text("\(detail.them)")
                            .font(.title2.bold().monospacedDigit())
                    }
                }
                Section {
                    ForEach(detail.days) { day in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text("\(day.you)").font(.caption.monospacedDigit())
                                Spacer()
                                Text(dayLabel(day.dayKey))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                Spacer()
                                Text("\(day.them)").font(.caption.monospacedDigit())
                            }
                            HStack(spacing: 4) {
                                GeometryReader { geo in
                                    ZStack(alignment: .trailing) {
                                        Capsule().fill(LukiColors.fill)
                                        Capsule()
                                            .fill(LukiColors.accent)
                                            .frame(width: geo.size.width * CGFloat(day.you) / CGFloat(dayMax))
                                    }
                                }
                                .frame(height: 6)
                                GeometryReader { geo in
                                    ZStack(alignment: .leading) {
                                        Capsule().fill(LukiColors.fill)
                                        Capsule()
                                            .fill(.secondary.opacity(0.5))
                                            .frame(width: geo.size.width * CGFloat(day.them) / CGFloat(dayMax))
                                    }
                                }
                                .frame(height: 6)
                            }
                        }
                    }
                }
            } else {
                ProgressView()
            }
        }
        .navigationTitle(detail.map { tr("Duel vs @%@", $0.opponent.handle) } ?? "…")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button(tr("Done")) { dismiss() }
            }
        }
        .task {
            detail = try? await social.apiClient.fetchDuelDetail(duelId: duelId)
        }
        .accessibilityIdentifier("ios.duel.detail")
    }

    private func dayLabel(_ dayKey: String) -> String {
        guard let ms = EffortPoints.epochMillis("\(dayKey)T12:00:00.000Z") else { return dayKey }
        let f = DateFormatter()
        f.locale = Locale(identifier: tr.rawValue)
        f.dateFormat = "EEE d MMM"
        f.timeZone = TimeZone(identifier: "UTC")
        return f.string(from: Date(timeIntervalSince1970: ms / 1000))
    }
}

/// Grid of small trophy tiles (duel wins for now) for the profile/friend sheets.
struct TrophyShelfView: View {
    let userId: String
    let social: SocialStore
    @Environment(\.lukiLocale) private var tr
    @State private var trophies: TrophyListDto?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(tr("Trophies"))
                .font(.footnote)
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
            if let trophies, !trophies.items.isEmpty {
                HStack(spacing: 12) {
                    ForEach(trophies.items.prefix(6)) { trophy in
                        VStack(spacing: 4) {
                            Image(systemName: "trophy.fill")
                                .font(.title3)
                                .foregroundStyle(.yellow)
                            Text("\(trophies.counts[trophy.kind.rawValue] ?? 1)×")
                                .font(.caption2.monospacedDigit())
                                .foregroundStyle(.secondary)
                        }
                        .frame(width: 52, height: 56)
                        .background(LukiColors.fill, in: RoundedRectangle(cornerRadius: 10))
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel(tr("Duel wins"))
                    }
                }
            } else {
                Text(tr("No trophies yet."))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .task {
            if let seeded = social.seededTrophies?[userId] {
                trophies = seeded
            } else {
                trophies = try? await social.apiClient.fetchTrophies(userId: userId)
            }
        }
        .accessibilityIdentifier("ios.trophy.shelf")
    }
}

/// Friend sheet: the card plus their trophy shelf.
struct FriendSheet: View {
    let friend: SocialCardDto
    let social: SocialStore
    @Environment(\.lukiLocale) private var tr
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        List {
            Section {
                HStack(spacing: 12) {
                    SocialAvatarView(
                        userId: friend.userId, handle: friend.handle, name: friend.name,
                        avatarUrl: friend.avatarUrl, social: social, size: 52)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("@\(friend.handle)").font(.headline)
                        if let name = friend.name, !name.isEmpty {
                            Text(name).font(.subheadline).foregroundStyle(.secondary)
                        }
                    }
                }
                .padding(.vertical, 2)
            }
            Section {
                TrophyShelfView(userId: friend.userId, social: social)
                    .padding(.vertical, 4)
            }
        }
        .navigationTitle(tr("Friend"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button(tr("Done")) { dismiss() }
            }
        }
        .accessibilityIdentifier("ios.friend.sheet")
    }
}
