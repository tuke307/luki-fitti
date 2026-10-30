import SwiftUI
import Charts
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain

/// Today card: current weight, 7-day change, last weigh-in and a 30-day chart with the 7-day
/// average. Tapping opens the weight screen; "Log weight" opens the sheet directly.
struct WeightHomeCard: View {
    @Bindable var viewModel: LukiAppViewModel
    @Environment(\.lukiLocale) private var tr
    @State private var isLogging = false
    @State private var savedCount = 0
    @State private var chart = WeightChartData()
    @State private var trend = WeightTrend()

    private var display: WeightDisplay { WeightDisplay(unit: viewModel.store.preferences.weightUnit, locale: tr) }

    private struct DerivedKey: Equatable {
        let points: [WeighInPoint]
        let unit: WeightUnit
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Button {
                viewModel.isWeightPresented = true
            } label: {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Label(tr("Weight"), systemImage: "scalemass")
                            .font(.headline)
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(.tertiary)
                            .accessibilityHidden(true)
                    }
                    if let latest = trend.latestKg {
                        summary(latest)
                        if chart.points.count >= 2 {
                            WeightTrendChart(points: chart.points, compact: true)
                                .frame(height: 120)
                                .accessibilityHidden(true)
                        }
                    } else {
                        emptyState
                    }
                }
                .foregroundStyle(.primary)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint(tr("Opens your weight history"))
            .accessibilityIdentifier("ios.home.weightCard")

            Button {
                isLogging = true
            } label: {
                Label(tr("Log weight"), systemImage: "plus")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .accessibilityIdentifier("ios.home.logWeightButton")
        }
        .padding(18)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(LukiColors.cardBackground))
        .onChange(of: DerivedKey(points: viewModel.bodyWeight.points, unit: display.unit), initial: true) {
            let monthAgo = Calendar.current.date(byAdding: .day, value: -30, to: Date())
            chart = WeightChartData(viewModel.bodyWeight.points, from: monthAgo, unit: display.unit)
            trend = viewModel.bodyWeight.trend()
        }
        .sensoryFeedback(.success, trigger: savedCount)
        .sheet(isPresented: $isLogging) {
            LogWeightSheet(viewModel: viewModel, entry: nil) { _ in savedCount += 1 }
                .presentationDetents([.medium, .large])
        }
    }

    private func summary(_ latestKg: Double) -> some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .firstTextBaseline, spacing: 16) { summaryContent(latestKg) }
            VStack(alignment: .leading, spacing: 6) { summaryContent(latestKg) }
        }
    }

    @ViewBuilder
    private func summaryContent(_ latestKg: Double) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text(display.value(latestKg))
                .font(.system(.largeTitle, design: .rounded).weight(.semibold))
                .monospacedDigit()
            Text(LukiFormat.unitLabel(display.unit))
                .font(.title3)
                .foregroundStyle(.secondary)
        }
        VStack(alignment: .leading, spacing: 2) {
            if let change = trend.change7dKg {
                Text(tr("%@ in 7 days", display.delta(change)))
                    .font(.subheadline.weight(.medium))
                    .monospacedDigit()
            }
            if let ago = display.ago(days: trend.daysSinceLast) {
                Text(tr("Last weigh-in: %@", ago))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(tr("Start tracking your weight"))
                .font(.title3.weight(.semibold))
            Text(tr("Log your first weigh-in. After a few, your trend and 7-day average appear here."))
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
