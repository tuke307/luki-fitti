import SwiftUI
import LukiFittiModels
import LukiFittiDesign

/// Workout-summary "boss moment": the picked raid's boss appears at its
/// pre-workout HP, takes this session's hit, the HP bar drains, it enrages when
/// a threshold is crossed and explodes on the final blow. Driven by a `.task`
/// so it plays once per appearance and not on re-renders; Reduce Motion skips
/// the sequence and renders the post-hit state directly.
struct RaidHitMomentView: View {
    let boss: RaidBossRecipe
    let raid: RaidDto
    let moment: RaidHitMoment

    @Environment(\.lukiLocale) private var tr
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var phase: Int
    @State private var shownDamage: Int
    @State private var state: BossSceneView.VisualState = .idle
    @State private var hitToken = 0
    @State private var labelShown = false
    @State private var labelRisen = false
    @State private var caption: String?
    @State private var impactHaptic = 0
    @State private var warningHaptic = 0
    @State private var successHaptic = 0

    init(boss: RaidBossRecipe, raid: RaidDto, moment: RaidHitMoment) {
        self.boss = boss
        self.raid = raid
        self.moment = moment
        _phase = State(initialValue: moment.beforePhase)
        _shownDamage = State(initialValue: moment.beforeDamage)
    }

    private var hpFraction: Double {
        moment.maxHp > 0 ? max(0, 1 - Double(shownDamage) / Double(moment.maxHp)) : 0
    }

    private var hpLeft: Int { max(0, moment.maxHp - moment.afterDamage) }

    var body: some View {
        VStack(spacing: 10) {
            ZStack(alignment: .top) {
                BossSceneView(
                    boss: boss,
                    state: state,
                    phase: phase,
                    hitToken: hitToken,
                    reducedMotion: reduceMotion,
                    interactive: false
                )
                .frame(height: 160)
                if labelShown {
                    VStack(spacing: 2) {
                        Text("−\(formatNumber(moment.hit))")
                            .font(.title3.bold().monospacedDigit())
                        if moment.weakBonus > 0 {
                            Text(tr("+%@ weak spot", formatNumber(moment.weakBonus)))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .offset(y: labelRisen ? -24 : 0)
                    .opacity(labelRisen ? 0 : 1)
                }
            }
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(localizedBossName(boss, slug: raid.bossSlug, locale: tr))
                        .font(.subheadline.weight(.semibold))
                    Spacer()
                    Text(
                        raid.kind == .COMMUNITY
                            ? tr("Community raid")
                            : tr("%@ raid", raid.squad?.name ?? tr("Squad"))
                    )
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
                RaidHpBar(hpFraction: hpFraction, phase: phase)
                HStack {
                    if let caption {
                        Text(caption)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.red)
                    }
                    Spacer()
                    Text("\(formatNumber(hpLeft)) / \(formatNumber(moment.maxHp)) HP")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(LukiColors.fill))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            "\(localizedBossName(boss, slug: raid.bossSlug, locale: tr)), "
                + "\(tr("Raid damage")) −\(formatNumber(moment.hit)), "
                + "\(formatNumber(hpLeft)) / \(formatNumber(moment.maxHp)) HP"
        )
        .accessibilityIdentifier("ios.session.summary.raidDamage")
        .sensoryFeedback(.impact, trigger: impactHaptic)
        .sensoryFeedback(.warning, trigger: warningHaptic)
        .sensoryFeedback(.success, trigger: successHaptic)
        .task {
            if reduceMotion {
                phase = moment.afterPhase
                shownDamage = moment.afterDamage
                state = moment.finishes ? .defeated : .idle
                caption = endCaption
                labelShown = true
                return
            }
            try? await Task.sleep(for: .milliseconds(600))
            guard !Task.isCancelled else { return }
            hitToken += 1
            impactHaptic += 1
            labelShown = true
            withAnimation(.easeOut(duration: 1.1)) { labelRisen = true }
            withAnimation(.easeOut(duration: 0.8)) { shownDamage = moment.afterDamage }
            try? await Task.sleep(for: .milliseconds(400))
            guard !Task.isCancelled else { return }
            if moment.finishes {
                phase = moment.afterPhase
                state = .defeated
                successHaptic += 1
                withAnimation { caption = tr("Final blow!") }
            } else if moment.afterPhase > moment.beforePhase {
                phase = moment.afterPhase
                warningHaptic += 1
                withAnimation { caption = tr("Enraged!") }
            }
        }
    }

    private var endCaption: String? {
        if moment.finishes { return tr("Final blow!") }
        if moment.afterPhase > moment.beforePhase { return tr("Enraged!") }
        return nil
    }

    private func formatNumber(_ n: Int) -> String {
        n.formatted(.number.locale(Locale(identifier: tr.rawValue)))
    }
}
