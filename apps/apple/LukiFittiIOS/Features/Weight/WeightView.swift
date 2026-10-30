import SwiftUI
import Charts
import Accessibility
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain
import LukiFittiStore

/// Unit-aware weight formatting. Weigh-ins are stored in kg; people see their chosen unit.
struct WeightDisplay {
    let unit: WeightUnit
    let locale: SupportedLocale

    func number(_ kg: Double) -> Double { BodyWeightMath.display(kg, unit: unit) }

    func value(_ kg: Double) -> String {
        number(kg).formatted(.number.precision(.fractionLength(1)).locale(Locale(identifier: locale.rawValue)))
    }

    func withUnit(_ kg: Double) -> String { "\(value(kg)) \(LukiFormat.unitLabel(unit))" }

    /// "+0.4 kg" / "−1.2 kg" / "±0.0 kg".
    func delta(_ kg: Double) -> String {
        let magnitude = abs(number(kg)).formatted(.number.precision(.fractionLength(1)).locale(Locale(identifier: locale.rawValue)))
        let sign = kg > 0.049 ? "+" : kg < -0.049 ? "−" : "±"
        return "\(sign)\(magnitude) \(LukiFormat.unitLabel(unit))"
    }

    /// "Today" / "Yesterday" / "3 days ago".
    func ago(days: Int?) -> String? {
        guard let days else { return nil }
        switch days {
        case 0: return locale("Today")
        case 1: return locale("Yesterday")
        default: return locale("%d days ago", days)
        }
    }
}

enum WeightChartRange: String, CaseIterable, Identifiable {
    case month1 = "1M", month3 = "3M", month6 = "6M", year1 = "1Y", all = "All"
    var id: String { rawValue }

    func label(_ tr: SupportedLocale) -> String {
        switch self {
        case .month1: return tr("1M")
        case .month3: return tr("3M")
        case .month6: return tr("6M")
        case .year1: return tr("1Y")
        case .all: return tr("All")
        }
    }

    func start(now: Date = Date(), calendar: Calendar = .current) -> Date? {
        switch self {
        case .month1: return calendar.date(byAdding: .month, value: -1, to: now)
        case .month3: return calendar.date(byAdding: .month, value: -3, to: now)
        case .month6: return calendar.date(byAdding: .month, value: -6, to: now)
        case .year1: return calendar.date(byAdding: .year, value: -1, to: now)
        case .all: return nil
        }
    }
}

struct WeightEditorContext: Identifiable {
    let id = UUID()
    let entry: BodyWeightEntryDto?
}

/// Weigh-in history: current weight and trend, a chart with a 7-day average and the full list.
struct WeightView: View {
    @Bindable var viewModel: LukiAppViewModel
    @Environment(\.lukiLocale) private var tr
    @State private var range: WeightChartRange = .month3
    @State private var selectedDate: Date?
    @State private var editing: WeightEditorContext?
    @State private var offlineNote = false

    private var store: BodyWeightStore { viewModel.bodyWeight }
    private var display: WeightDisplay { WeightDisplay(unit: viewModel.store.preferences.weightUnit, locale: tr) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if store.entries.isEmpty {
                    emptyCard
                } else {
                    headerCard
                    chartCard
                    if offlineNote || !store.outbox.isEmpty {
                        Text(tr("Saved on this device. It will sync when you’re online."))
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    entriesList
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .background(LukiColors.groupedBackground)
        .navigationTitle(tr("Weight"))
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    editing = WeightEditorContext(entry: nil)
                } label: {
                    Label(tr("Log weight"), systemImage: "plus")
                }
                .accessibilityIdentifier("ios.weight.logButton")
            }
        }
        .task { await viewModel.syncBodyWeight(requestHealthAccess: true) }
        .refreshable { await viewModel.syncBodyWeight() }
        .sheet(item: $editing) { context in
            LogWeightSheet(viewModel: viewModel, entry: context.entry) { reachedServer in
                offlineNote = !reachedServer && viewModel.isSignedIn
            }
        }
    }

    // MARK: Header

    private var headerCard: some View {
        let trend = store.trend()
        return VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 2) {
                Text(tr("Current weight"))
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.secondary)
                if let latest = trend.latestKg {
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Text(display.value(latest))
                            .font(.system(.largeTitle, design: .rounded).weight(.semibold))
                            .monospacedDigit()
                        Text(LukiFormat.unitLabel(display.unit))
                            .font(.title3)
                            .foregroundStyle(.secondary)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("ios.weight.currentValue")
                }
                if let ago = display.ago(days: trend.daysSinceLast) {
                    Text(tr("Last weigh-in: %@", ago))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
            HStack(spacing: 12) {
                changeStat(tr("7 days"), trend.change7dKg)
                changeStat(tr("30 days"), trend.change30dKg)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(cardShape)
    }

    private func changeStat(_ label: String, _ change: Double?) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.footnote).foregroundStyle(.secondary)
            Text(change.map(display.delta) ?? "–")
                .font(.headline)
                .monospacedDigit()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(tr("Change over %@", label))
        .accessibilityValue(change.map(display.delta) ?? tr("Not enough data"))
    }

    // MARK: Chart

    private struct ChartPoint: Identifiable {
        let date: Date
        let value: Double
        let average: Double
        var id: Date { date }
    }

    private var chartPoints: [ChartPoint] {
        let start = range.start()
        return BodyWeightMath.movingAverage(store.points, windowDays: 7)
            .filter { start == nil || $0.point.date >= start! }
            .map { ChartPoint(date: $0.point.date, value: display.number($0.point.weightKg), average: display.number($0.averageKg)) }
    }

    private var chartCard: some View {
        let points = chartPoints
        let selected = nearest(to: selectedDate, in: points)
        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(tr("Trend")).font(.headline)
                    Text(selected.map { "\(display.value(BodyWeightMath.kilograms($0.value, unit: display.unit))) \(LukiFormat.unitLabel(display.unit)) · \($0.date.formatted(.dateTime.day().month(.abbreviated).year().locale(Locale(identifier: tr.rawValue))))" }
                        ?? tr("Dashed line: 7-day average"))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }
                Spacer()
            }
            Picker(tr("Range"), selection: $range) {
                ForEach(WeightChartRange.allCases) { Text($0.label(tr)).tag($0) }
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("ios.weight.rangePicker")

            if points.isEmpty {
                Text(tr("No weigh-ins in this period."))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, minHeight: 180)
            } else {
                chart(points, selected: selected)
            }
        }
        .padding(18)
        .background(cardShape)
    }

    private func chart(_ points: [ChartPoint], selected: ChartPoint?) -> some View {
        let values = points.flatMap { [$0.value, $0.average] }
        let low = (values.min() ?? 0) - 1
        let high = (values.max() ?? 1) + 1
        let weightLabel = tr("Weight")
        let averageLabel = tr("7-day average")
        return Chart {
            ForEach(points) { p in
                LineMark(x: .value(tr("Date"), p.date), y: .value(weightLabel, p.value), series: .value("Series", weightLabel))
                    .foregroundStyle(LukiColors.accent)
                    .interpolationMethod(.monotone)
                PointMark(x: .value(tr("Date"), p.date), y: .value(weightLabel, p.value))
                    .foregroundStyle(LukiColors.accent)
                    .symbolSize(points.count > 60 ? 12 : 28)
            }
            ForEach(points) { p in
                LineMark(x: .value(tr("Date"), p.date), y: .value(averageLabel, p.average), series: .value("Series", averageLabel))
                    .foregroundStyle(Color.secondary)
                    .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [5, 4]))
                    .interpolationMethod(.monotone)
            }
            if let selected {
                RuleMark(x: .value(tr("Date"), selected.date))
                    .foregroundStyle(Color.secondary.opacity(0.4))
                PointMark(x: .value(tr("Date"), selected.date), y: .value(weightLabel, selected.value))
                    .foregroundStyle(LukiColors.accent)
                    .symbolSize(90)
            }
        }
        .chartYScale(domain: low...high)
        .chartXSelection(value: $selectedDate)
        .frame(height: 220)
        .accessibilityChartDescriptor(WeightChartDescriptor(
            title: tr("Weight trend"),
            unit: LukiFormat.unitLabel(display.unit),
            dateTitle: tr("Date"),
            points: points.map { ($0.date, $0.value) },
            locale: Locale(identifier: tr.rawValue)
        ))
        .accessibilityIdentifier("ios.weight.chart")
    }

    private func nearest(to date: Date?, in points: [ChartPoint]) -> ChartPoint? {
        guard let date else { return nil }
        return points.min { abs($0.date.timeIntervalSince(date)) < abs($1.date.timeIntervalSince(date)) }
    }

    // MARK: List

    private var monthGroups: [(month: Date, entries: [BodyWeightEntryDto])] {
        let calendar = Calendar.current
        let grouped = Dictionary(grouping: store.entries.reversed()) { entry -> Date in
            let date = entry.measuredAtDate ?? .distantPast
            return calendar.dateInterval(of: .month, for: date)?.start ?? date
        }
        return grouped.keys.sorted(by: >).map { ($0, grouped[$0] ?? []) }
    }

    private var entriesList: some View {
        VStack(alignment: .leading, spacing: 18) {
            ForEach(monthGroups, id: \.month) { group in
                VStack(alignment: .leading, spacing: 8) {
                    Text(group.month.formatted(.dateTime.month(.wide).year().locale(Locale(identifier: tr.rawValue))))
                        .font(.headline)
                        .accessibilityAddTraits(.isHeader)
                    ForEach(group.entries) { entry in
                        entryRow(entry)
                    }
                }
            }
        }
    }

    private func entryRow(_ entry: BodyWeightEntryDto) -> some View {
        LukiSwipeRow(
            leading: [
                LukiSwipeAction(id: "edit", label: tr("Edit"), systemImage: "pencil", tone: .accent) {
                    editing = WeightEditorContext(entry: entry)
                },
            ],
            trailing: [
                LukiSwipeAction(id: "delete", label: tr("Delete"), systemImage: "trash", tone: .destructive) {
                    Task { await viewModel.deleteWeighIn(entry) }
                },
            ],
            cornerRadius: 16
        ) {
            Button {
                editing = WeightEditorContext(entry: entry)
            } label: {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(display.withUnit(entry.weightKg))
                            .font(.headline)
                            .monospacedDigit()
                        Text(entry.measuredAtDate?.formatted(
                            .dateTime.weekday(.abbreviated).day().month(.abbreviated).hour().minute()
                                .locale(Locale(identifier: tr.rawValue))
                        ) ?? "")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                        if let note = entry.note, !note.isEmpty {
                            Text(note)
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                                .lineLimit(2)
                        }
                    }
                    Spacer(minLength: 8)
                    if entry.source == .HEALTHKIT {
                        HealthBadge(label: tr("Health"))
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .background(LukiColors.cardBackground)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint(tr("Opens the weigh-in to edit it"))
        }
        .accessibilityIdentifier("ios.weight.entry.\(entry.clientEntryId)")
    }

    // MARK: Empty

    private var emptyCard: some View {
        VStack(spacing: 10) {
            Image(systemName: "scalemass")
                .font(.largeTitle)
                .foregroundStyle(LukiColors.accent)
                .accessibilityHidden(true)
            Text(tr("No weigh-ins yet.")).font(.headline)
            Text(tr("Log your weight once a week, ideally in the morning. Weigh-ins from Apple Health appear here too."))
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button {
                editing = WeightEditorContext(entry: nil)
            } label: {
                Label(tr("Log weight"), systemImage: "plus")
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .padding(.top, 4)
            .accessibilityIdentifier("ios.weight.emptyLogButton")
        }
        .frame(maxWidth: .infinity)
        .padding(24)
        .background(cardShape)
    }

    private var cardShape: some View {
        RoundedRectangle(cornerRadius: 22, style: .continuous).fill(LukiColors.cardBackground)
    }
}

/// Small "Health" capsule for weigh-ins imported from Apple Health.
struct HealthBadge: View {
    let label: String

    var body: some View {
        Label(label, systemImage: "heart.fill")
            .labelStyle(.titleAndIcon)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(LukiColors.heartRate)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Capsule().fill(LukiColors.heartRate.opacity(0.12)))
    }
}

/// VoiceOver audio graph / data table for the weight chart.
struct WeightChartDescriptor: AXChartDescriptorRepresentable {
    let title: String
    let unit: String
    let dateTitle: String
    let points: [(Date, Double)]
    let locale: Locale

    func makeChartDescriptor() -> AXChartDescriptor {
        let times = points.map { $0.0.timeIntervalSince1970 }
        let values = points.map(\.1)
        let minX = times.min() ?? 0
        let maxX = max(times.max() ?? 1, minX + 1)
        let minY = values.min() ?? 0
        let maxY = max(values.max() ?? 1, minY + 0.1)
        let locale = self.locale
        let unit = self.unit
        let xAxis = AXNumericDataAxisDescriptor(title: dateTitle, range: minX...maxX, gridlinePositions: []) { value in
            Date(timeIntervalSince1970: value).formatted(.dateTime.day().month().year().locale(locale))
        }
        let yAxis = AXNumericDataAxisDescriptor(title: unit, range: minY...maxY, gridlinePositions: []) { value in
            "\(value.formatted(.number.precision(.fractionLength(1)).locale(locale))) \(unit)"
        }
        let series = AXDataSeriesDescriptor(
            name: title,
            isContinuous: true,
            dataPoints: points.map { AXDataPoint(x: $0.0.timeIntervalSince1970, y: $0.1) }
        )
        return AXChartDescriptor(title: title, summary: nil, xAxis: xAxis, yAxis: yAxis, additionalAxes: [], series: [series])
    }
}
