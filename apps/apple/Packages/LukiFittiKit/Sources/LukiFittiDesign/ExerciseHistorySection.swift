import SwiftUI
import Charts
import LukiFittiModels
import LukiFittiDomain

/// "History" of one exercise in the exercise sheet: summary, estimated 1RM trend and recent
/// sessions (warm-ups muted, PR marked). Mirrors `apps/web/components/gym/exercise-history-section.tsx`.
/// History is passed in so this view never depends on the store.
public struct ExerciseHistorySection: View {
    private static let initialSessions = 5

    private let log: ExerciseHistoryLog
    private let weightUnit: WeightUnit
    @Environment(\.lukiLocale) private var tr
    @State private var expanded = false

    public init(
        exerciseId: String?,
        exerciseName: String?,
        exerciseType: ExerciseType?,
        historySessions: [WorkoutSessionDto],
        weightUnit: WeightUnit
    ) {
        self.log = ExerciseHistoryLog.build(
            exerciseId: exerciseId,
            exerciseName: exerciseName,
            exerciseType: exerciseType,
            historySessions: historySessions,
            weightUnit: weightUnit
        )
        self.weightUnit = weightUnit
    }

    private struct ChartPoint: Identifiable {
        let date: Date
        let value: Double
        var id: Date { date }
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(tr("History"))
                .font(.headline)
                .accessibilityAddTraits(.isHeader)

            if log.sessions.isEmpty {
                Text(tr("No history yet — complete this exercise in a workout to see your progress here."))
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(14)
                    .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(LukiColors.cardBackground))
                    .accessibilityIdentifier("ios.exerciseHistory.empty")
            } else {
                summary
                chart
                recentSessions
            }
        }
        .accessibilityIdentifier("ios.exerciseHistory")
    }

    // MARK: - Summary

    private var summaryItems: [(label: String, value: String)] {
        var items: [(String, String)] = switch log.metric {
        case .WEIGHT:
            [
                (tr("Best est. 1RM"), log.bestEstimated1RM.map(metricValue) ?? "–"),
                (tr("Heaviest set"), log.heaviestSet.map { $0.reps > 0 ? weightReps($0.weight, $0.reps) : weightOnly($0.weight) } ?? "–"),
            ]
        case .REPS:
            [(tr("Most reps"), log.mostReps.map(String.init) ?? "–")]
        case .DURATION:
            [(tr("Longest set"), log.longestDurationSeconds.map(LukiFormat.clock) ?? "–")]
        }
        items.append((tr("Sessions"), "\(log.sessions.count)"))
        return items
    }

    private var summary: some View {
        HStack(alignment: .top, spacing: 8) {
            ForEach(summaryItems, id: \.label) { item in
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.label)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                    Text(item.value)
                        .font(.subheadline.bold().monospacedDigit())
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .padding(10)
                .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(LukiColors.cardBackground))
                .accessibilityElement(children: .combine)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    // MARK: - Chart

    private var chartPoints: [ChartPoint] {
        log.trend.compactMap { p in LukiDate.parseISO(p.startedAt).map { ChartPoint(date: $0, value: p.value) } }
    }

    private var chartTitle: String {
        log.metric == .REPS ? tr("Most reps over time") : tr("Estimated 1RM over time")
    }

    /// True when the trend covers more than ~12 months, so month labels would repeat.
    private func spansMultipleYears(_ points: [ChartPoint]) -> Bool {
        let dates = points.map(\.date)
        guard let first = dates.min(), let last = dates.max() else { return false }
        return last.timeIntervalSince(first) > 366 * 24 * 60 * 60
    }

    @ViewBuilder
    private var chart: some View {
        let points = chartPoints
        if points.count >= 2 {
            let values = points.map(\.value)
            let pad = max(1, ((values.max() ?? 1) - (values.min() ?? 0)) * 0.15)
            let label = chartTitle
            VStack(alignment: .leading, spacing: 6) {
                Text(label)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
                Chart(points) { p in
                    LineMark(x: .value(tr("Date"), p.date), y: .value(label, p.value))
                        .foregroundStyle(LukiColors.accent)
                        .interpolationMethod(.monotone)
                    PointMark(x: .value(tr("Date"), p.date), y: .value(label, p.value))
                        .foregroundStyle(LukiColors.accent)
                        .symbolSize(24)
                }
                .chartYScale(domain: ((values.min() ?? 0) - pad)...((values.max() ?? 1) + pad))
                .chartXAxis {
                    // Multi-year spans get one yearly mark instead of repeating month labels.
                    if spansMultipleYears(points) {
                        AxisMarks(values: .stride(by: .year)) { _ in
                            AxisValueLabel(format: .dateTime.year())
                        }
                    } else {
                        AxisMarks(values: .automatic(desiredCount: 3)) {
                            AxisValueLabel(format: .dateTime.day().month(.abbreviated))
                        }
                    }
                }
                .frame(height: 120)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(label)
                .accessibilityValue(chartSummary(points))
                .accessibilityIdentifier("ios.exerciseHistory.chart")
            }
            .padding(12)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(LukiColors.cardBackground))
        }
    }

    private func chartSummary(_ points: [ChartPoint]) -> String {
        guard let first = points.first, let last = points.last else { return "" }
        let best = points.map(\.value).max() ?? last.value
        return tr(
            "%@ on %@, %@ on %@, best %@",
            metricValue(first.value), date(first.date), metricValue(last.value), date(last.date), metricValue(best)
        )
    }

    // MARK: - Sessions

    private var recentSessions: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(tr("Recent sessions"))
                .font(.caption.weight(.medium))
                .foregroundStyle(.secondary)
            let visible = expanded ? log.sessions : Array(log.sessions.prefix(Self.initialSessions))
            ForEach(visible) { entry in
                sessionRow(entry)
            }
            if !expanded && log.sessions.count > Self.initialSessions {
                Button(tr("Show more")) { expanded = true }
                    .font(.subheadline.weight(.medium))
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .accessibilityIdentifier("ios.exerciseHistory.showMore")
            }
        }
    }

    private func sessionRow(_ entry: ExerciseHistoryLog.Entry) -> some View {
        let day = LukiDate.parseISO(entry.startedAt).map(date) ?? ""
        return VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(day)
                    .font(.subheadline.bold().monospacedDigit())
                Text(entry.workoutName)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Spacer(minLength: 0)
                if entry.isPersonalRecord {
                    Label(tr("PR"), systemImage: "trophy.fill")
                        .font(.caption.bold())
                        .foregroundStyle(LukiColors.success)
                        .accessibilityLabel(tr("Personal record"))
                }
            }
            FlowSets(sets: entry.sets.map { (setText($0), $0.warmup) })
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(LukiColors.cardBackground))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(rowAccessibilityLabel(entry, day: day))
        .accessibilityIdentifier("ios.exerciseHistory.session.\(entry.clientSessionId)")
    }

    private func rowAccessibilityLabel(_ entry: ExerciseHistoryLog.Entry, day: String) -> String {
        var parts = [day, entry.workoutName]
        if entry.isPersonalRecord { parts.append(tr("Personal record")) }
        parts.append(contentsOf: entry.sets.map { $0.warmup ? "\(tr("Warm-up")): \(setText($0))" : setText($0) })
        return parts.joined(separator: ", ")
    }

    // MARK: - Formatting

    private var locale: Locale { Locale(identifier: tr.rawValue) }
    private var unit: String { LukiFormat.unitLabel(weightUnit) }

    private func number(_ value: Double) -> String {
        value.formatted(.number.precision(.fractionLength(0...1)).locale(locale))
    }

    private func date(_ date: Date) -> String {
        date.formatted(Date.FormatStyle.dateTime.day().month(.abbreviated).year().locale(locale))
    }

    private func weightReps(_ weight: Double, _ reps: Int) -> String { "\(number(weight)) \(unit) × \(reps)" }
    private func weightOnly(_ weight: Double) -> String { "\(number(weight)) \(unit)" }

    private func metricValue(_ value: Double) -> String {
        switch log.metric {
        case .WEIGHT: weightOnly(value)
        case .REPS: tr("%d reps", Int(value))
        case .DURATION: LukiFormat.clock(Int(value))
        }
    }

    private func setText(_ s: ExerciseHistoryLog.LoggedSet) -> String {
        if let weight = s.weight, let reps = s.reps { return weightReps(weight, reps) }
        if let weight = s.weight { return weightOnly(weight) }
        if let reps = s.reps { return tr("%d reps", reps) }
        return LukiFormat.clock(s.durationSeconds ?? 0)
    }
}

/// Set chips that wrap onto new lines; warm-ups are muted.
private struct FlowSets: View {
    let sets: [(text: String, warmup: Bool)]

    var body: some View {
        FlowLayout(spacing: 4) {
            ForEach(Array(sets.enumerated()), id: \.offset) { _, set in
                Text(set.text)
                    .font(.caption.monospacedDigit().weight(set.warmup ? .regular : .semibold))
                    .foregroundStyle(set.warmup ? AnyShapeStyle(.tertiary) : AnyShapeStyle(.primary))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(RoundedRectangle(cornerRadius: 6, style: .continuous).fill(LukiColors.fill.opacity(set.warmup ? 0.5 : 1)))
            }
        }
    }
}

private struct FlowLayout: Layout {
    var spacing: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(subviews, width: proposal.width ?? .infinity)
        return CGSize(width: proposal.width ?? rows.map(\.width).max() ?? 0, height: rows.last.map { $0.y + $0.height } ?? 0)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        for row in arrange(subviews, width: bounds.width) {
            var x = bounds.minX
            for index in row.indices {
                let size = subviews[index].sizeThatFits(.unspecified)
                subviews[index].place(at: CGPoint(x: x, y: bounds.minY + row.y), proposal: ProposedViewSize(size))
                x += size.width + spacing
            }
        }
    }

    private func arrange(_ subviews: Subviews, width: CGFloat) -> [(indices: [Int], y: CGFloat, width: CGFloat, height: CGFloat)] {
        var rows: [(indices: [Int], y: CGFloat, width: CGFloat, height: CGFloat)] = []
        var current: [Int] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.unspecified)
            if !current.isEmpty && x + size.width > width {
                rows.append((current, y, x - spacing, rowHeight))
                y += rowHeight + spacing
                current = []
                x = 0
                rowHeight = 0
            }
            current.append(index)
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        if !current.isEmpty { rows.append((current, y, x - spacing, rowHeight)) }
        return rows
    }
}
