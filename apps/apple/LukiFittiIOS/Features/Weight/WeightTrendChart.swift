import SwiftUI
import Charts
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain

struct WeightChartPoint: Identifiable, Equatable {
    let date: Date
    let value: Double
    let average: Double
    var id: Date { date }
}

/// Chart-ready weigh-ins in the person's unit, with the 7-day average. Build once per data change,
/// not per frame.
struct WeightChartData: Equatable {
    var points: [WeightChartPoint] = []
    var rangeAverage: Double?

    init() {}

    init(_ weighIns: [WeighInPoint], from start: Date?, unit: WeightUnit) {
        points = BodyWeightMath.movingAverage(weighIns, windowDays: 7)
            .filter { start == nil || $0.point.date >= start! }
            .map {
                WeightChartPoint(
                    date: $0.point.date,
                    value: BodyWeightMath.display($0.point.weightKg, unit: unit),
                    average: BodyWeightMath.display($0.averageKg, unit: unit)
                )
            }
        rangeAverage = points.isEmpty ? nil : points.reduce(0) { $0 + $1.value } / Double(points.count)
    }

    /// "Ø 82.3 kg · 1 Aug – 30 Oct".
    func summary(_ tr: SupportedLocale, unit: WeightUnit) -> String? {
        guard let rangeAverage, let first = points.first, let last = points.last else { return nil }
        let locale = Locale(identifier: tr.rawValue)
        let value = rangeAverage.formatted(.number.precision(.fractionLength(1)).locale(locale))
        let format = Date.FormatStyle.dateTime.day().month(.abbreviated).locale(locale)
        let span = Calendar.current.isDate(first.date, inSameDayAs: last.date)
            ? first.date.formatted(format)
            : "\(first.date.formatted(format)) – \(last.date.formatted(format))"
        return "Ø \(value) \(LukiFormat.unitLabel(unit)) · \(span)"
    }

    func nearest(to date: Date?) -> WeightChartPoint? {
        guard let date else { return nil }
        return points.min { abs($0.date.timeIntervalSince(date)) < abs($1.date.timeIntervalSince(date)) }
    }
}

/// Weigh-ins as a line with points, plus the dashed 7-day average.
struct WeightTrendChart: View {
    let points: [WeightChartPoint]
    var selected: WeightChartPoint?
    var compact = false
    @Environment(\.lukiLocale) private var tr

    var body: some View {
        let values = points.flatMap { [$0.value, $0.average] }
        let padding = compact ? 0.5 : 1
        let low = (values.min() ?? 0) - padding
        let high = (values.max() ?? 1) + padding
        let weightLabel = tr("Weight")
        let averageLabel = tr("7-day average")
        Chart {
            ForEach(points) { p in
                LineMark(x: .value(tr("Date"), p.date), y: .value(weightLabel, p.value), series: .value("Series", weightLabel))
                    .foregroundStyle(LukiColors.accent)
                    .interpolationMethod(.monotone)
                PointMark(x: .value(tr("Date"), p.date), y: .value(weightLabel, p.value))
                    .foregroundStyle(LukiColors.accent)
                    .symbolSize(compact || points.count > 60 ? 12 : 28)
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
        .chartXAxis {
            AxisMarks(values: .automatic(desiredCount: compact ? 3 : 5)) {
                AxisGridLine()
                AxisValueLabel(format: .dateTime.day().month(.abbreviated).locale(Locale(identifier: tr.rawValue)))
            }
        }
        .chartYAxis {
            AxisMarks(position: .trailing, values: .automatic(desiredCount: compact ? 3 : 5))
        }
    }
}
