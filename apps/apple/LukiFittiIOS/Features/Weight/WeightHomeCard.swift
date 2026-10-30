import SwiftUI
import Charts
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain

/// Today card: current weight, 7-day change and a 30-day sparkline. Opens the weight screen.
struct WeightHomeCard: View {
    @Bindable var viewModel: LukiAppViewModel
    @Environment(\.lukiLocale) private var tr
    @State private var isLogging = false

    private var display: WeightDisplay { WeightDisplay(unit: viewModel.store.preferences.weightUnit, locale: tr) }

    var body: some View {
        let points = viewModel.bodyWeight.points
        let trend = viewModel.bodyWeight.trend()
        let monthAgo = Date().addingTimeInterval(-30 * 86_400)
        let recent = points.filter { $0.date >= monthAgo }
        return HStack(alignment: .center, spacing: 14) {
            NavigationLink {
                WeightView(viewModel: viewModel)
            } label: {
                HStack(spacing: 14) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(tr("Weight"))
                            .font(.headline)
                            .foregroundStyle(.primary)
                        if let latest = trend.latestKg {
                            Text(display.withUnit(latest))
                                .font(.system(.title2, design: .rounded).weight(.semibold))
                                .monospacedDigit()
                                .foregroundStyle(.primary)
                            Text(subtitle(trend))
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        } else {
                            Text(tr("Track your weight to see the trend."))
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }
                    Spacer(minLength: 0)
                    if recent.count >= 2 {
                        Chart(recent, id: \.date) { p in
                            LineMark(x: .value(tr("Date"), p.date), y: .value(tr("Weight"), p.weightKg))
                                .foregroundStyle(LukiColors.accent)
                                .interpolationMethod(.monotone)
                        }
                        .chartXAxis(.hidden)
                        .chartYAxis(.hidden)
                        .chartYScale(domain: ((recent.map(\.weightKg).min() ?? 0) - 0.5)...((recent.map(\.weightKg).max() ?? 1) + 0.5))
                        .frame(width: 84, height: 40)
                        .accessibilityHidden(true)
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint(tr("Opens your weight history"))
            .accessibilityIdentifier("ios.home.weightCard")

            Button {
                isLogging = true
            } label: {
                Text(tr("Log"))
            }
            .buttonStyle(.bordered)
            .accessibilityLabel(tr("Log weight"))
            .accessibilityIdentifier("ios.home.logWeightButton")
        }
        .padding(18)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(LukiColors.cardBackground))
        .sheet(isPresented: $isLogging) {
            LogWeightSheet(viewModel: viewModel, entry: nil)
        }
    }

    private func subtitle(_ trend: WeightTrend) -> String {
        var parts: [String] = []
        if let change = trend.change7dKg { parts.append(tr("%@ in 7 days", display.delta(change))) }
        if let ago = display.ago(days: trend.daysSinceLast) { parts.append(ago) }
        return parts.joined(separator: " · ")
    }
}
