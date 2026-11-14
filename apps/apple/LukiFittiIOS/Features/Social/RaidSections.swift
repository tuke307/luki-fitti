import SwiftUI
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain
import LukiFittiStore

/// Raids + squads sections above Duels: the community raid card with a live
/// SceneKit boss, squad raid cards, squad management and the detail sheet with
/// the big boss, HP, weak spots, top dealers and the live hit feed.
struct RaidsSection: View {
    @Bindable var social: SocialStore
    let myUserId: String
    @Environment(\.lukiLocale) private var tr
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var detailRaid: RaidDto?
    @State private var showSquads = false

    var body: some View {
        if social.raids != nil {
            Group {
                Label(tr("Raids"), systemImage: "bolt.shield")
                    .font(.subheadline.weight(.semibold))
                    .padding(.top, 4)
                ForEach(social.shownRaids) { raid in
                    Button { detailRaid = raid } label: {
                        RaidCardView(raid: raid, reducedMotion: reduceMotion)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("ios.raid.card.\(raid.id)")
                }
                if social.shownRaids.isEmpty {
                    Text(tr("No raid this week — check back Monday."))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Button { showSquads = true } label: {
                    Label(tr("Squads"), systemImage: "person.3")
                        .font(.subheadline.weight(.semibold))
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("ios.raid.squadsButton")
            }
            .sheet(item: $detailRaid) { raid in
                NavigationStack {
                    RaidDetailView(raidId: raid.id, social: social)
                }
            }
            .sheet(isPresented: $showSquads) {
                NavigationStack { SquadsView(social: social, myUserId: myUserId) }
            }
        }
    }

    struct SheetId: Identifiable { let id: String }
}

// MARK: - Shared bits

func localizedBossName(_ boss: RaidBossRecipe?, slug: String, locale: SupportedLocale) -> String {
    guard let boss else { return slug }
    return locale == .de ? boss.name.de : boss.name.en
}

func localizedBossLore(_ boss: RaidBossRecipe?, locale: SupportedLocale) -> String? {
    guard let boss else { return nil }
    return locale == .de ? boss.lore.de : boss.lore.en
}

func weakSpotLabel(_ spot: String, locale: SupportedLocale) -> String {
    if spot == "CARDIO" { return locale("Cardio") }
    if spot == "STRETCHING" { return locale("Stretching") }
    if let muscle = MuscleGroup(rawValue: spot) {
        return LukiI18n.muscleLabel(muscle, locale: locale)
    }
    return spot
}

/// "1 d 22 h" / "3 h" until `endsAt` (ISO-8601).
func raidEndsIn(_ endsAt: String, now: Date = Date(), locale: SupportedLocale) -> String? {
    let withFraction = ISO8601DateFormatter()
    withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let end = withFraction.date(from: endsAt)
        ?? ISO8601DateFormatter().date(from: endsAt)
    guard let end else { return nil }
    let s = Int(end.timeIntervalSince(now))
    if s <= 0 { return locale("ended") }
    let d = s / 86_400
    let h = (s % 86_400) / 3600
    if d > 0 { return locale("%d d %d h", d, h) }
    let m = (s % 3600) / 60
    if h > 0 { return locale("%d h %d m", h, m) }
    return locale("%d m", max(1, m))
}

/// HP bar with enrage tick marks at the 75/50/25 % thresholds.
struct RaidHpBar: View {
    let hpFraction: Double
    let phase: Int

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let frac = max(0, min(1, hpFraction))
            ZStack(alignment: .leading) {
                Capsule().fill(LukiColors.fill)
                Capsule()
                    .fill(phase >= 3 ? Color.red : LukiColors.accent)
                    .frame(width: w * frac)
                // phase ticks at 25/50/75 % HP-left (the enrage thresholds)
                ForEach([0.25, 0.5, 0.75], id: \.self) { t in
                    Rectangle()
                        .fill(Color(.systemBackground).opacity(0.9))
                        .frame(width: 2)
                        .offset(x: w * t - 1)
                }
            }
        }
        .frame(height: 10)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("HP")
        .accessibilityValue("\(Int(max(0, min(1, hpFraction)) * 100))%")
    }
}

struct WeakSpotChips: View {
    let weakTo: [String]
    @Environment(\.lukiLocale) private var tr

    var body: some View {
        HStack(spacing: 6) {
            ForEach(weakTo, id: \.self) { spot in
                Text(weakSpotLabel(spot, locale: tr))
                    .font(.caption.weight(.medium))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(LukiColors.fill))
            }
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Raid card

struct RaidCardView: View {
    let raid: RaidDto
    var reducedMotion: Bool = false
    @Environment(\.lukiLocale) private var tr

    private var boss: RaidBossRecipe? { RaidBossCatalog.boss(slug: raid.bossSlug) }

    var body: some View {
        HStack(spacing: 12) {
            if let boss {
                BossSceneView(
                    boss: boss,
                    state: raid.status == .DEFEATED ? .defeated : raid.status == .ESCAPED ? .escaped : .idle,
                    phase: raid.effectivePhase,
                    reducedMotion: reducedMotion,
                    interactive: false
                )
                .frame(width: 64, height: 64)
                .allowsHitTesting(false)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(localizedBossName(boss, slug: raid.bossSlug, locale: tr))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                Text(
                    raid.kind == .COMMUNITY
                        ? tr("Community raid")
                        : tr("%@ raid", raid.squad?.name ?? tr("Squad"))
                )
                .font(.caption)
                .foregroundStyle(.secondary)
                RaidHpBar(hpFraction: raid.hpFraction, phase: raid.effectivePhase)
                HStack {
                    if let ends = raidEndsIn(raid.endsAt, locale: tr) {
                        Text(ends)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    if raid.yourDamage > 0 {
                        Text(tr("You dealt %@", formatDamage(raid.yourDamage)))
                            .font(.caption.weight(.medium))
                            .foregroundStyle(LukiColors.accent)
                    }
                }
                if let boss, !boss.weakTo.isEmpty {
                    WeakSpotChips(weakTo: boss.weakTo)
                }
            }
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 16).fill(LukiColors.cardBackground))
    }

    private func formatDamage(_ n: Int) -> String {
        n.formatted(.number.locale(Locale(identifier: tr.rawValue)))
    }
}

// MARK: - Raid detail

struct RaidDetailView: View {
    let raidId: String
    @Bindable var social: SocialStore
    @Environment(\.lukiLocale) private var tr
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dismiss) private var dismiss

    @State private var detail: RaidDetailDto?
    @State private var feed: [RaidFeedHitDto] = []
    @State private var hitToken = 0
    @State private var hitHaptic = 0
    @State private var feedTask: Task<Void, Never>?

    private var raid: RaidDto? {
        social.shownRaids.first { $0.id == raidId }
    }
    private var boss: RaidBossRecipe? { RaidBossCatalog.boss(slug: raid?.bossSlug ?? detail?.bossSlug ?? "") }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                if let boss {
                    BossSceneView(
                        boss: boss,
                        state: detail?.status == .DEFEATED ? .defeated
                            : detail?.status == .ESCAPED ? .escaped : .idle,
                        phase: detail.map { max($0.phase, RaidBossMath.raidPhaseFor(damage: $0.damage, maxHp: $0.maxHp)) }
                            ?? raid?.effectivePhase ?? 0,
                        hitToken: hitToken,
                        reducedMotion: reduceMotion
                    )
                    .frame(height: 300)
                    .accessibilityIdentifier("ios.raid.bossCanvas")
                }

                if let detail {
                    header(detail)
                    if let boss, !boss.weakTo.isEmpty {
                        WeakSpotChips(weakTo: boss.weakTo)
                    }
                    ownStanding(detail)
                    topDealers(detail)
                    feedSection
                } else {
                    ProgressView().padding(.top, 40)
                }
            }
            .padding(16)
        }
        .navigationTitle(localizedBossName(boss, slug: raid?.bossSlug ?? "", locale: tr))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { dismiss() } label: { Image(systemName: "xmark") }
                    .accessibilityIdentifier("ios.raid.detailClose")
            }
        }
        .task {
            if detail == nil { detail = social.seededRaidDetails[raidId] }
            if feed.isEmpty, let seeded = social.seededRaidFeeds[raidId] { feed = seeded }
            await refreshDetail()
            await refreshFeed(animate: false)
        }
        .onAppear {
            // live feed: poll every 20 s; genuinely new hits trigger the hit anim.
            feedTask = Task {
                while !Task.isCancelled {
                    try? await Task.sleep(nanoseconds: 20_000_000_000)
                    guard !Task.isCancelled else { return }
                    await refreshFeed(animate: true)
                    await refreshDetail()
                }
            }
        }
        .onDisappear { feedTask?.cancel() }
        .sensoryFeedback(.impact, trigger: hitHaptic)
    }

    private func refreshDetail() async {
        if let d = try? await social.apiClient.fetchRaidDetail(raidId: raidId) {
            detail = d
        }
    }

    private func refreshFeed(animate: Bool) async {
        guard let res = try? await social.apiClient.fetchRaidFeed(raidId: raidId) else { return }
        let oldTop = feed.first?.at
        feed = res.items
        if animate, let newest = res.items.first?.at, newest != oldTop {
            hitToken += 1
            hitHaptic += 1
        }
    }

    @ViewBuilder
    private func header(_ detail: RaidDetailDto) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if let lore = localizedBossLore(boss, locale: tr) {
                Text(lore)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            RaidHpBar(
                hpFraction: detail.maxHp > 0
                    ? max(0, 1 - Double(detail.damage) / Double(detail.maxHp)) : 0,
                phase: max(detail.phase, RaidBossMath.raidPhaseFor(damage: detail.damage, maxHp: detail.maxHp)))
            HStack {
                Text("\(formatNumber(detail.maxHp - detail.damage)) / \(formatNumber(detail.maxHp)) HP")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
                Spacer()
                let phase = max(detail.phase, RaidBossMath.raidPhaseFor(damage: detail.damage, maxHp: detail.maxHp))
                if phase > 0 {
                    Text(tr("Phase %d", phase))
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(phase >= 3 ? .red : .secondary)
                }
                if let ends = raidEndsIn(detail.endsAt, locale: tr) {
                    Text(tr("%@ left", ends))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    @ViewBuilder
    private func ownStanding(_ detail: RaidDetailDto) -> some View {
        HStack {
            Text(tr("You dealt %@ · #%d", formatNumber(detail.you.damage), detail.you.rank ?? 0))
                .font(.subheadline.weight(.semibold))
            Spacer()
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 12).fill(LukiColors.fill))
    }

    @ViewBuilder
    private func topDealers(_ detail: RaidDetailDto) -> some View {
        if !detail.top.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text(tr("Top damage dealers"))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .textCase(.uppercase)
                ForEach(detail.top.prefix(5), id: \.rank) { entry in
                    HStack {
                        Text("#\(entry.rank)")
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(.secondary)
                            .frame(width: 28, alignment: .leading)
                        Text("@\(entry.card.handle)")
                            .font(.subheadline)
                            .lineLimit(1)
                        Spacer()
                        Text(formatNumber(entry.damage))
                            .font(.subheadline.monospacedDigit())
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    @ViewBuilder
    private var feedSection: some View {
        if !feed.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text(tr("Latest hits"))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .textCase(.uppercase)
                ForEach(Array(feed.prefix(20).enumerated()), id: \.offset) { _, hit in
                    HStack {
                        Text("@\(hit.card.handle)")
                            .font(.subheadline)
                            .lineLimit(1)
                        Spacer()
                        VStack(alignment: .trailing, spacing: 1) {
                            Text("-\(formatNumber(hit.damage))")
                                .font(.subheadline.monospacedDigit())
                            if hit.weakSpotDamage > 0 {
                                Text(tr("+%@ weak spot", formatNumber(hit.weakSpotDamage)))
                                    .font(.caption)
                                    .foregroundStyle(LukiColors.accent)
                            }
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func formatNumber(_ n: Int) -> String {
        n.formatted(.number.locale(Locale(identifier: tr.rawValue)))
    }
}

// MARK: - Squads

struct SquadsView: View {
    @Bindable var social: SocialStore
    let myUserId: String
    @Environment(\.lukiLocale) private var tr
    @Environment(\.dismiss) private var dismiss

    @State private var showCreate = false
    @State private var newName = ""
    @State private var renameTarget: SquadDto?
    @State private var renameText = ""
    @State private var startRaidSquad: SquadDto?
    @State private var inviteSquad: SquadDto?
    @State private var leaveTarget: SquadDto?

    var body: some View {
        List {
            if let list = social.squadList {
                if !list.invites.isEmpty {
                    Section(tr("Squad invites")) {
                        ForEach(list.invites) { invite in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(invite.squadName).font(.subheadline.weight(.semibold))
                                    Text(tr("from @%@", invite.invitedBy.handle))
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                Button(tr("Accept")) {
                                    Task { await social.acceptSquadInvite(squadId: invite.squadId) }
                                }
                                .buttonStyle(.borderedProminent)
                                .controlSize(.small)
                                Button(tr("Decline")) {
                                    Task { await social.declineSquadInvite(squadId: invite.squadId) }
                                }
                                .buttonStyle(.bordered)
                                .controlSize(.small)
                            }
                        }
                    }
                }

                Section(tr("Squads")) {
                    if list.squads.isEmpty {
                        Text(tr("Squads raid their own boss every week — start one with friends."))
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    ForEach(list.squads) { squad in
                        squadRow(squad)
                    }
                    Button { showCreate = true } label: {
                        Label(tr("Create squad"), systemImage: "plus")
                    }
                    .accessibilityIdentifier("ios.squad.createButton")
                }
            } else {
                ProgressView()
            }
        }
        .navigationTitle(tr("Squads"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { dismiss() } label: { Image(systemName: "xmark") }
            }
        }
        .alert(tr("Create squad"), isPresented: $showCreate) {
            TextField(tr("Squad name"), text: $newName)
            Button(tr("Create")) {
                let name = newName.trimmingCharacters(in: .whitespaces)
                guard !name.isEmpty else { return }
                newName = ""
                Task { await social.createSquad(name: name) }
            }
            Button(tr("Cancel"), role: .cancel) { newName = "" }
        }
        .alert(tr("Rename squad"), isPresented: Binding(get: { renameTarget != nil }, set: { if !$0 { renameTarget = nil } })) {
            TextField(tr("Squad name"), text: $renameText)
            Button(tr("Save")) {
                if let s = renameTarget {
                    let name = renameText.trimmingCharacters(in: .whitespaces)
                    if !name.isEmpty { Task { await social.renameSquad(squadId: s.id, name: name) } }
                }
            }
            Button(tr("Cancel"), role: .cancel) {}
        }
        .confirmationDialog(
            tr("Leave %@?", leaveTarget?.name ?? ""),
            isPresented: Binding(get: { leaveTarget != nil }, set: { if !$0 { leaveTarget = nil } }),
            titleVisibility: .visible
        ) {
            Button(tr("Leave squad"), role: .destructive) {
                if let s = leaveTarget { Task { await social.leaveSquad(squadId: s.id) } }
            }
            Button(tr("Cancel"), role: .cancel) {}
        }
        .sheet(item: $startRaidSquad) { squad in
            NavigationStack { StartRaidSheet(squad: squad, social: social) }
        }
        .sheet(item: $inviteSquad) { squad in
            NavigationStack { SquadInviteSheet(squad: squad, social: social) }
        }
    }

    @ViewBuilder
    private func squadRow(_ squad: SquadDto) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(squad.name).font(.subheadline.weight(.semibold))
                Spacer()
                Menu {
                    Button(tr("Invite friend")) { inviteSquad = squad }
                    Button(tr("Start this week's raid")) { startRaidSquad = squad }
                    if squad.role == .OWNER {
                        Button(tr("Rename")) {
                            renameText = squad.name
                            renameTarget = squad
                        }
                    }
                    Button(tr("Leave"), role: .destructive) { leaveTarget = squad }
                } label: {
                    Image(systemName: "ellipsis")
                        .padding(6)
                }
                .accessibilityIdentifier("ios.squad.menu.\(squad.id)")
            }
            ForEach(Array(squad.members.enumerated()), id: \.offset) { _, member in
                HStack {
                    Text("@\(member.card.handle)")
                        .font(.subheadline)
                        .lineLimit(1)
                    if member.role == .OWNER {
                        Text(tr("owner"))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    if squad.role == .OWNER && member.card.userId != myUserId {
                        Button(role: .destructive) {
                            Task { await social.kickSquadMember(squadId: squad.id, userId: member.card.userId) }
                        } label: {
                            Image(systemName: "person.badge.minus")
                        }
                        .buttonStyle(.borderless)
                        .accessibilityIdentifier("ios.squad.kick.\(member.card.userId)")
                    }
                }
            }
        }
        .padding(.vertical, 4)
    }
}

/// Boss picker + difficulty for starting a squad raid.
struct StartRaidSheet: View {
    let squad: SquadDto
    @Bindable var social: SocialStore
    @Environment(\.lukiLocale) private var tr
    @Environment(\.dismiss) private var dismiss
    @State private var bossSlug = RaidBossCatalog.bosses.first?.slug ?? ""
    @State private var difficulty = RaidDifficulty.NORMAL
    @State private var starting = false

    var body: some View {
        List {
            Section(tr("Boss")) {
                ForEach(RaidBossCatalog.bosses, id: \.slug) { boss in
                    Button { bossSlug = boss.slug } label: {
                        HStack {
                            Text(localizedBossName(boss, slug: boss.slug, locale: tr))
                                .foregroundStyle(.primary)
                            Spacer()
                            if bossSlug == boss.slug { Image(systemName: "checkmark") }
                        }
                    }
                    .accessibilityIdentifier("ios.squad.boss.\(boss.slug)")
                }
            }
            Section(tr("Difficulty")) {
                Picker(tr("Difficulty"), selection: $difficulty) {
                    ForEach(RaidDifficulty.allCases, id: \.self) { d in
                        Text(d.rawValue.capitalized).tag(d)
                    }
                }
                .pickerStyle(.segmented)
            }
            Section {
                Button {
                    starting = true
                    Task {
                        await social.startSquadRaid(
                            squadId: squad.id, bossSlug: bossSlug, difficulty: difficulty)
                        dismiss()
                    }
                } label: {
                    if starting { ProgressView().frame(maxWidth: .infinity) }
                    else { Text(tr("Start raid")).frame(maxWidth: .infinity) }
                }
                .disabled(starting)
                .accessibilityIdentifier("ios.squad.startRaidButton")
            }
        }
        .navigationTitle(tr("Start raid"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button(tr("Cancel")) { dismiss() }
            }
        }
    }
}

/// Friend picker for squad invites (friends who are not already members).
struct SquadInviteSheet: View {
    let squad: SquadDto
    @Bindable var social: SocialStore
    @Environment(\.lukiLocale) private var tr
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        List {
            let members = Set(squad.members.map(\.card.userId))
            let candidates = social.friends.friends.filter { !members.contains($0.userId) }
            if candidates.isEmpty {
                Text(tr("Everyone's already in."))
                    .foregroundStyle(.secondary)
            }
            ForEach(candidates) { friend in
                Button {
                    Task {
                        await social.inviteToSquad(squadId: squad.id, userId: friend.userId)
                        dismiss()
                    }
                } label: {
                    Text("@\(friend.handle)")
                        .foregroundStyle(.primary)
                }
            }
        }
        .navigationTitle(tr("Invite to %@", squad.name))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button(tr("Cancel")) { dismiss() }
            }
        }
    }
}

// MARK: - Result celebration

/// Full-screen raid result shown once per finished raid (loud DEFEATED, calm ESCAPED),
/// mirroring `raid-celebration.tsx`.
struct RaidCelebrationOverlay: View {
    let result: RaidResultDto
    let onDismiss: () -> Void
    @Environment(\.lukiLocale) private var tr
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var scale: CGFloat = 0.3
    @State private var contentOpacity: Double = 0
    @State private var successFeedback = 0

    private var defeated: Bool { result.outcome == .DEFEATED }
    private var boss: RaidBossRecipe? { RaidBossCatalog.boss(slug: result.bossSlug) }

    var body: some View {
        ZStack {
            LukiColors.groupedBackground.ignoresSafeArea()
            if defeated && !reduceMotion {
                ConfettiView(start: Date()).ignoresSafeArea()
            }
            VStack(spacing: 20) {
                if let boss {
                    BossSceneView(
                        boss: boss,
                        state: defeated ? .defeated : .escaped,
                        phase: defeated ? 3 : 0,
                        reducedMotion: reduceMotion,
                        interactive: false
                    )
                    .frame(width: 260, height: 260)
                    .allowsHitTesting(false)
                    .scaleEffect(scale)
                }
                VStack(spacing: 8) {
                    Text(
                        defeated
                            ? tr("%@ is defeated!", result.bossName)
                            : tr("%@ escaped", result.bossName)
                    )
                    .font(.largeTitle.weight(.heavy))
                    .multilineTextAlignment(.center)
                    Text(
                        result.crownRank != nil
                            ? tr("You dealt %@ · #%d", formatNumber(result.you), result.crownRank!)
                            : tr("You dealt %@", formatNumber(result.you))
                    )
                    .font(.title3.monospacedDigit())
                    .foregroundStyle(.secondary)
                    HStack(spacing: 8) {
                        if let rank = result.crownRank {
                            Label(tr("Crown #%d", rank), systemImage: "crown.fill")
                                .font(.footnote.weight(.semibold))
                                .padding(.horizontal, 10)
                                .padding(.vertical, 5)
                                .background(Capsule().fill(LukiColors.fill))
                        }
                        if result.finalBlow {
                            Label(tr("Final blow"), systemImage: "bolt.fill")
                                .font(.footnote.weight(.semibold))
                                .padding(.horizontal, 10)
                                .padding(.vertical, 5)
                                .background(Capsule().fill(LukiColors.fill))
                        }
                    }
                }
                .opacity(contentOpacity)
                Button {
                    onDismiss()
                } label: {
                    Text(tr("Continue")).frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .padding(.horizontal, 40)
                .opacity(contentOpacity)
                .accessibilityIdentifier("ios.raid.celebrationContinue")
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("ios.raid.celebration")
        .sensoryFeedback(.success, trigger: successFeedback)
        .onAppear {
            if reduceMotion {
                withAnimation(.easeIn(duration: 0.25)) { scale = 1; contentOpacity = 1 }
            } else {
                if defeated { successFeedback += 1 }
                withAnimation(.spring(response: 0.35, dampingFraction: 0.55)) {
                    scale = 1.1
                    contentOpacity = 1
                }
                withAnimation(.spring(response: 0.4, dampingFraction: 0.5).delay(0.5)) {
                    scale = 1
                }
            }
        }
    }

    private func formatNumber(_ n: Int) -> String {
        n.formatted(.number.locale(Locale(identifier: tr.rawValue)))
    }
}

// MARK: - Debug boss gallery (`--uitesting-boss-gallery`)

/// Renders every boss recipe live — screenshot/debug only, launched via
/// `--uitesting-boss-gallery` instead of the normal app shell.
struct BossGalleryView: View {
    @Environment(\.lukiLocale) private var tr

    var body: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                ForEach(RaidBossCatalog.bosses, id: \.slug) { boss in
                    VStack(spacing: 4) {
                        BossSceneView(boss: boss, interactive: false)
                            .frame(height: 180)
                        Text(localizedBossName(boss, slug: boss.slug, locale: tr))
                            .font(.caption.weight(.semibold))
                    }
                    .padding(8)
                    .background(RoundedRectangle(cornerRadius: 16).fill(LukiColors.cardBackground))
                    .accessibilityIdentifier("gallery.boss.\(boss.slug)")
                }
            }
            .padding()
        }
        .background(LukiColors.groupedBackground)
    }
}
