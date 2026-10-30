import SwiftUI
import Charts
import Accessibility
import LukiFittiModels
import LukiFittiDesign
import LukiFittiAPI

/// Personal AI usage: requests, tokens and cost (USD as reported by OpenRouter) over 7/30/90 days.
struct AIUsageView: View {
    @Bindable var viewModel: LukiAppViewModel
    @Environment(\.lukiLocale) private var tr
    @State private var days = 30
    @State private var usage: MyAiUsageDto?
    @State private var loadFailed = false

    private static let ranges = [7, 30, 90]

    var body: some View {
        List {
            Section {
                Picker(tr("Time range"), selection: $days) {
                    ForEach(Self.ranges, id: \.self) { Text(tr("%d days", $0)).tag($0) }
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("ios.aiUsage.range")
            }
            if !viewModel.isSignedIn {
                ContentUnavailableView(tr("Sign in to see your AI usage."), systemImage: "sparkles")
            } else if let usage {
                if loadFailed {
                    Text(tr("Couldn’t load your AI usage."))
                        .font(.footnote)
                        .foregroundStyle(LukiColors.destructive)
                }
                content(usage)
            } else if loadFailed {
                ContentUnavailableView {
                    Label(tr("Couldn’t load your AI usage."), systemImage: "exclamationmark.triangle")
                } actions: {
                    Button(tr("Try again")) { Task { await load() } }
                }
            } else {
                HStack {
                    Spacer()
                    ProgressView().accessibilityLabel(tr("Loading AI usage…"))
                    Spacer()
                }
                .listRowBackground(Color.clear)
            }
        }
        .navigationTitle(tr("AI usage"))
        .navigationBarTitleDisplayMode(.inline)
        .task(id: days) { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        guard viewModel.isSignedIn else { return }
        do {
            let fetched = try await viewModel.store.apiClient.fetchMyAiUsage(days: days)
            usage = fetched
            loadFailed = false
        } catch is CancellationError {
        } catch {
            loadFailed = true
        }
    }

    @ViewBuilder
    private func content(_ u: MyAiUsageDto) -> some View {
        Section {
            VStack(alignment: .leading, spacing: 4) {
                Text(tr("Cost")).font(.subheadline).foregroundStyle(.secondary)
                Text(AICostFormat.usd(u.costUsd, locale: tr))
                    .font(.system(.largeTitle, design: .rounded).bold())
                    .monospacedDigit()
                Text(tokensLine(prompt: u.promptTokens, completion: u.completionTokens))
                    .font(.footnote)
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
                if u.unknownCostRuns > 0 {
                    Text(tr("%d requests without a reported cost", u.unknownCostRuns))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .accessibilityElement(children: .combine)
            LabeledContent(tr("Requests"), value: count(u.totalRuns))
            if u.failedRuns > 0 { LabeledContent(tr("Failed"), value: count(u.failedRuns)) }
            Gauge(value: Double(min(u.today.used, max(u.today.limit, 1))), in: 0...Double(max(u.today.limit, 1))) {
                Text(tr("Daily limit"))
            } currentValueLabel: {
                Text(tr("%d of %d today", u.today.used, u.today.limit))
            }
            .gaugeStyle(.linearCapacity)
            .tint(u.today.used >= u.today.limit ? LukiColors.destructive : LukiColors.accent)
            .accessibilityValue(tr("%d of %d today", u.today.used, u.today.limit))
        } footer: {
            Text(tr("Costs in US dollars, exactly as reported by the AI provider."))
        }

        if u.totalRuns == 0 {
            ContentUnavailableView(tr("No AI requests in this period."), systemImage: "sparkles")
        } else {
            Section(tr("Requests per day")) { chart(u) }
            Section(tr("By feature")) {
                ForEach(u.bySkill) { s in
                    LabeledContent(skillName(s.skill)) {
                        Text("\(count(s.runs)) · \(AICostFormat.usd(s.costUsd, locale: tr))").monospacedDigit()
                    }
                }
            }
            Section(tr("Recent requests")) {
                ForEach(u.recent) { run in recentRow(run) }
            }
        }
    }

    private func chart(_ u: MyAiUsageDto) -> some View {
        let points = u.byDay.compactMap { d in day(d.date).map { (date: $0, runs: d.runs, cost: d.costUsd) } }
        return Chart(points, id: \.date) { p in
            BarMark(
                x: .value(tr("Date"), p.date, unit: .day),
                y: .value(tr("Requests"), p.runs)
            )
            .foregroundStyle(LukiColors.accent)
            .cornerRadius(3)
        }
        .chartYAxis { AxisMarks(values: .automatic(desiredCount: 3)) }
        .frame(height: 160)
        .padding(.vertical, 4)
        .accessibilityChartDescriptor(AIUsageChartDescriptor(
            title: tr("Requests per day"),
            dateTitle: tr("Date"),
            valueTitle: tr("Requests"),
            points: points.map { ($0.date, $0.runs, AICostFormat.usd($0.cost, locale: tr)) },
            locale: Locale(identifier: tr.rawValue)
        ))
        .accessibilityIdentifier("ios.aiUsage.chart")
    }

    private func recentRow(_ run: AiUsageRunDto) -> some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(skillName(run.skill)).font(.subheadline.weight(.semibold))
                    if run.failed {
                        Text(tr("Failed"))
                            .font(.caption2.weight(.semibold))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(LukiColors.destructive.opacity(0.15), in: Capsule())
                            .foregroundStyle(LukiColors.destructive)
                    }
                }
                if let date = LukiISODate.parse(run.createdAt) {
                    Text(date.formatted(.dateTime.day().month().hour().minute().locale(Locale(identifier: tr.rawValue))))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(AICostFormat.usd(run.costUsd, tr)).font(.subheadline)
                Text(tr("%@ tokens", count(run.promptTokens + run.completionTokens)))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .monospacedDigit()
        }
        .accessibilityElement(children: .combine)
    }

    private func skillName(_ skill: String) -> String {
        switch skill {
        case "workout-builder": return tr("Workout builder")
        case "meal-analyzer": return tr("Meal photo")
        case "meal-text-analyzer": return tr("Meal description")
        default: return skill
        }
    }

    private func count(_ value: Int) -> String { AICostFormat.count(value, locale: tr) }

    private func tokensLine(prompt: Int, completion: Int) -> String {
        "\(tr("%@ tokens", count(prompt + completion))) (\(tr("%@ in · %@ out", count(prompt), count(completion))))"
    }

    private func day(_ iso: String) -> Date? { LukiISODate.parse("\(iso)T12:00:00Z") }
}

/// VoiceOver audio graph / data table for the requests-per-day chart.
struct AIUsageChartDescriptor: AXChartDescriptorRepresentable {
    let title: String
    let dateTitle: String
    let valueTitle: String
    let points: [(Date, Int, String)]
    let locale: Locale

    func makeChartDescriptor() -> AXChartDescriptor {
        let times = points.map { $0.0.timeIntervalSince1970 }
        let minX = times.min() ?? 0
        let maxX = max(times.max() ?? 1, minX + 1)
        let maxY = Double(max(points.map(\.1).max() ?? 1, 1))
        let locale = self.locale
        let xAxis = AXNumericDataAxisDescriptor(title: dateTitle, range: minX...maxX, gridlinePositions: []) { value in
            Date(timeIntervalSince1970: value).formatted(.dateTime.day().month().locale(locale))
        }
        let yAxis = AXNumericDataAxisDescriptor(title: valueTitle, range: 0...maxY, gridlinePositions: []) { value in
            Int(value).formatted(.number.locale(locale))
        }
        let series = AXDataSeriesDescriptor(
            name: title,
            isContinuous: false,
            dataPoints: points.map { AXDataPoint(x: $0.0.timeIntervalSince1970, y: Double($0.1), label: $0.2) }
        )
        return AXChartDescriptor(title: title, summary: nil, xAxis: xAxis, yAxis: yAxis, additionalAxes: [], series: [series])
    }
}
