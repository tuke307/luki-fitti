import SwiftUI
import LukiFittiDesign
import LukiFittiDomain

/// Food tab day navigation: tappable title with a date picker, a "Today" shortcut and a paged
/// week strip whose rings show kcal eaten vs. the daily goal plus burned kcal.
struct NutritionDayNavigator: View {
    @Binding var day: Date
    @Binding var visibleWeek: Date?
    let title: String
    let goal: Int?
    let kcal: (Date) -> Double
    let burned: (Date) -> Int
    @Environment(\.lukiLocale) private var tr
    @State private var showsPicker = false

    private var isToday: Bool { Calendar.current.isDateInToday(day) }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Button { showsPicker = true } label: {
                    HStack(spacing: 4) {
                        Text(title)
                        Image(systemName: "chevron.down").font(.footnote.weight(.semibold))
                    }
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityHint(tr("Opens a calendar to pick a day"))
                .accessibilityIdentifier("ios.nutrition.dayPickerButton")
                Spacer()
                if !isToday {
                    Button(tr("Today")) { day = Calendar.current.startOfDay(for: Date()) }
                        .buttonStyle(.bordered)
                        .accessibilityIdentifier("ios.nutrition.todayButton")
                }
            }
            DayWeekStrip(selection: $day, visibleWeek: $visibleWeek, goal: goal, kcal: kcal, burned: burned)
        }
        .sheet(isPresented: $showsPicker) {
            NavigationStack {
                DatePicker(
                    tr("Day"),
                    selection: Binding(
                        get: { day },
                        set: { day = Calendar.current.startOfDay(for: $0); showsPicker = false }
                    ),
                    in: ...Date(),
                    displayedComponents: .date
                )
                .datePickerStyle(.graphical)
                .labelsHidden()
                .padding(.horizontal)
                .environment(\.locale, Locale(identifier: tr.rawValue))
                .navigationTitle(tr("Choose a day"))
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button(tr("Done")) { showsPicker = false }
                    }
                }
                .accessibilityIdentifier("ios.nutrition.dayPicker")
            }
            .presentationDetents([.medium, .large])
        }
    }
}

struct DayWeekStrip: View {
    @Binding var selection: Date
    @Binding var visibleWeek: Date?
    let goal: Int?
    let kcal: (Date) -> Double
    let burned: (Date) -> Int
    @Environment(\.lukiLocale) private var tr
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private static let historyWeeks = 52
    private var calendar: Calendar { .current }
    private var locale: Locale { Locale(identifier: tr.rawValue) }

    private var weeks: [Date] {
        let today = Date()
        let yearAgo = calendar.date(byAdding: .weekOfYear, value: -Self.historyWeeks, to: today) ?? today
        return NutritionCalendar.weekStarts(from: min(yearAgo, selection), through: today, calendar: calendar)
    }

    var body: some View {
        let weeks = weeks
        ScrollView(.horizontal, showsIndicators: false) {
            LazyHStack(spacing: 0) {
                ForEach(weeks, id: \.self) { start in
                    weekRow(start, weeks: weeks)
                        .containerRelativeFrame(.horizontal)
                }
            }
            .scrollTargetLayout()
        }
        .scrollTargetBehavior(.paging)
        .scrollPosition(id: $visibleWeek)
        .defaultScrollAnchor(.trailing)
        .dynamicTypeSize(...DynamicTypeSize.accessibility1)
        .onChange(of: selection) { _, new in
            let week = NutritionCalendar.weekStart(for: new, calendar: calendar)
            guard week != visibleWeek else { return }
            withAnimation(reduceMotion ? nil : .snappy) { visibleWeek = week }
        }
        .accessibilityIdentifier("ios.nutrition.weekStrip")
    }

    private func weekRow(_ start: Date, weeks: [Date]) -> some View {
        HStack(spacing: 2) {
            ForEach(NutritionCalendar.days(ofWeekStarting: start, calendar: calendar), id: \.self) { date in
                dayCell(date, weeks: weeks)
            }
        }
    }

    private func dayCell(_ date: Date, weeks: [Date]) -> some View {
        let isSelected = calendar.isDate(date, inSameDayAs: selection)
        let isToday = calendar.isDateInToday(date)
        let isFuture = date > Date()
        let eaten = isFuture ? 0 : kcal(date)
        let burnedKcal = isFuture ? 0 : max(0, burned(date))
        let progress = NutritionCalendar.ringProgress(eatenKcal: eaten, goal: goal, burnedKcal: burnedKcal)
        let over = goal.map { eaten > Double($0 + burnedKcal) } ?? false
        return Button {
            withAnimation(reduceMotion ? nil : .snappy) { selection = calendar.startOfDay(for: date) }
        } label: {
            VStack(spacing: 4) {
                Text(date.formatted(.dateTime.weekday(.narrow).locale(locale)))
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(isToday ? LukiColors.accent : .secondary)
                ZStack {
                    Circle().fill(isSelected ? LukiColors.accent.opacity(0.2) : .clear)
                    Circle().stroke(LukiColors.fill, lineWidth: 3)
                    Circle()
                        .trim(from: 0, to: progress)
                        .stroke(over ? LukiColors.warning : LukiColors.accent, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                    Text("\(calendar.component(.day, from: date))")
                        .font(.subheadline.weight(isSelected || isToday ? .bold : .regular))
                        .monospacedDigit()
                        .foregroundStyle(isToday ? LukiColors.accent : .primary)
                        .minimumScaleFactor(0.7)
                }
                .frame(width: 38, height: 38)
            }
            .frame(maxWidth: .infinity, minHeight: 60)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(isFuture)
        .opacity(isFuture ? 0.35 : 1)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityLabel(date, eaten: eaten, burned: burnedKcal, isToday: isToday))
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
        .accessibilityAction(named: tr("Previous week")) { page(-1, weeks: weeks) }
        .accessibilityAction(named: tr("Next week")) { page(1, weeks: weeks) }
        .accessibilityIdentifier("ios.nutrition.weekStrip.day.\(dayId(date))")
    }

    private func dayId(_ date: Date) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    private func accessibilityLabel(_ date: Date, eaten: Double, burned: Int, isToday: Bool) -> String {
        var text = date.formatted(.dateTime.weekday(.wide).day().month(.wide).locale(locale))
        if isToday { text = "\(tr("Today")), \(text)" }
        let eatenText = Int(eaten.rounded()).formatted(.number.locale(locale))
        if let goal {
            return tr("%@, %@ of %@ kcal", text, eatenText, (goal + burned).formatted(.number.locale(locale)))
        }
        return "\(text), \(eatenText) kcal"
    }

    private func page(_ delta: Int, weeks: [Date]) {
        let current = visibleWeek ?? NutritionCalendar.weekStart(for: selection, calendar: calendar)
        guard let index = weeks.firstIndex(of: current), weeks.indices.contains(index + delta) else { return }
        visibleWeek = weeks[index + delta]
    }
}
