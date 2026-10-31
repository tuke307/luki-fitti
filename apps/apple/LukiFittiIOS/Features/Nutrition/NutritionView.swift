import SwiftUI
import Charts
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain
import LukiFittiStore

/// Food tab: today's intake vs. goal and burn, meals grouped by type, and a 7-day chart.
public struct NutritionView: View {
    @Bindable public var viewModel: LukiAppViewModel
    @Environment(\.lukiLocale) private var tr
    @State private var day = Calendar.current.startOfDay(for: Date())
    @State private var editing: MealEditorContext?
    @State private var offlineNote = false
    @State private var visibleWeek: Date? = NutritionCalendar.weekStart(for: Date())
    @State private var burnMemo = BurnMemo()

    public init(viewModel: LukiAppViewModel) {
        self.viewModel = viewModel
    }

    private var nutrition: NutritionStore { viewModel.nutrition }
    private var prefs: UserPreferencesDto { viewModel.store.preferences }
    private var isSignedIn: Bool { viewModel.store.currentUser != nil }
    private var canUsePhotos: Bool { viewModel.store.currentUser?.hasFeature(.AI_MEAL_PHOTO) ?? false }
    private var isToday: Bool { Calendar.current.isDateInToday(day) }

    private var dayEntries: [MealEntryDto] { nutrition.entries(on: day) }
    private var totals: NutritionTotalsDto { nutrition.totals(on: day) }
    private var burnByDay: [Date: NutritionCalendar.DayBurn] {
        burnMemo.index(
            sessions: viewModel.store.historySessions,
            healthDays: viewModel.activity.days,
            healthWorkouts: viewModel.activity.workouts,
            points: viewModel.bodyWeight.points,
            fallbackKg: prefs.bodyWeightKg
        ) { viewModel.bodyWeightKg(at: $0) }
    }
    private var dayBurn: NutritionCalendar.DayBurn { burnByDay[day] ?? .empty }
    /// Rows of the burn card; a zero "daily activity" remainder is hidden.
    private var burnItems: [NutritionCalendar.BurnedItem] {
        dayBurn.items.filter { if case .dailyActivity(let kcal) = $0 { kcal > 0 } else { true } }
    }
    private var burned: Int { dayBurn.total }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                dayHeader
                summaryCard
                actions
                if offlineNote || !nutrition.outbox.isEmpty {
                    Text(tr("Saved on this device. It will sync when you’re online."))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                if dayEntries.isEmpty {
                    emptyCard
                } else {
                    ForEach(MealType.allCases, id: \.self) { type in
                        let list = dayEntries.filter { $0.mealType == type }
                        if !list.isEmpty { mealGroup(type, list) }
                    }
                }
                if !burnItems.isEmpty { burnCard }
                weekCard
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .background(LukiColors.groupedBackground)
        .refreshable {
            await nutrition.refresh(isSignedIn: isSignedIn)
            await viewModel.syncHealthActivity(force: true)
        }
        .task {
            await nutrition.refresh(isSignedIn: isSignedIn, force: false)
            await viewModel.activity.refresh(isSignedIn: isSignedIn, force: false)
        }
        .task(id: visibleWeek) {
            guard let visibleWeek else { return }
            await nutrition.ensureLoaded(from: visibleWeek, isSignedIn: isSignedIn)
            await viewModel.activity.ensureLoaded(from: visibleWeek, isSignedIn: isSignedIn)
        }
        .sheet(item: $editing) { context in
            MealEditorSheet(viewModel: viewModel, context: context) { reachedServer in
                offlineNote = !reachedServer
            }
        }
    }

    // MARK: Sections

    private var dayHeader: some View {
        let burnByDay = burnByDay
        return NutritionDayNavigator(
            day: $day,
            visibleWeek: $visibleWeek,
            title: dayTitle,
            goal: prefs.dailyKcalGoal,
            kcal: { nutrition.totals(on: $0).kcal },
            burned: { burnByDay[Calendar.current.startOfDay(for: $0)]?.total ?? 0 }
        )
    }

    private var dayTitle: String {
        if isToday { return tr("Today") }
        if Calendar.current.isDateInYesterday(day) { return tr("Yesterday") }
        return day.formatted(.dateTime.weekday(.wide).day().month(.wide).locale(Locale(identifier: tr.rawValue)))
    }

    private var summaryCard: some View {
        let goal = prefs.dailyKcalGoal
        let net = totals.kcal - Double(burned)
        let remaining = goal.map { Double($0) - net }
        return VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text(goal.map { tr("Goal: %d kcal", $0) } ?? tr("Daily goal"))
                    .font(.headline)
                    .monospacedDigit()
                Spacer()
                NutritionGoalsButton(viewModel: viewModel) {
                    Label(tr("Goals"), systemImage: "target")
                }
                .buttonStyle(.bordered)
                .accessibilityLabel(tr("Edit nutrition goals"))
                .accessibilityIdentifier("ios.nutrition.goalsButton")
            }
            HStack(spacing: 18) {
                NutritionGoalsButton(viewModel: viewModel) {
                    Gauge(value: NutritionCalendar.ringProgress(eatenKcal: totals.kcal, goal: goal, burnedKcal: burned)) { EmptyView() }
                        .gaugeStyle(.accessoryCircularCapacity)
                        .tint((remaining ?? 0) < 0 ? LukiColors.warning : LukiColors.accent)
                        .scaleEffect(1.3)
                        .frame(width: 72, height: 72)
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .accessibilityHidden(true)
                HStack(alignment: .top) {
                    stat(tr("Eaten"), "\(Int(totals.kcal))")
                    stat(tr("Burned"), "\(burned)")
                    stat((remaining ?? 0) < 0 ? tr("Over") : tr("Left"), remaining.map { "\(Int(abs($0).rounded()))" } ?? "–")
                }
            }
            if goal == nil {
                NutritionGoalsButton(viewModel: viewModel) {
                    Label(tr("Set a daily goal to see what’s left"), systemImage: "plus.circle")
                        .font(.subheadline.weight(.semibold))
                        .frame(minHeight: 44)
                }
                .buttonStyle(.borderless)
                .accessibilityIdentifier("ios.nutrition.setGoalButton")
            }
            HStack(spacing: 12) {
                macro(tr("Protein"), totals.proteinG, prefs.proteinGoalG)
                macro(tr("Carbs"), totals.carbsG, prefs.carbsGoalG)
                macro(tr("Fat"), totals.fatG, prefs.fatGoalG)
            }
        }
        .padding(18)
        .background(cardShape)
        .accessibilityElement(children: .contain)
    }

    private func stat(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.footnote).foregroundStyle(.secondary).lineLimit(1)
            Text(value).font(.title2.weight(.semibold)).monospacedDigit()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    private func macro(_ label: String, _ value: Double, _ goal: Int?) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.footnote).lineLimit(1)
            Text(goal.map { "\(Int(value)) / \($0) g" } ?? "\(Int(value)) g")
                .font(.caption)
                .foregroundStyle(.secondary)
                .monospacedDigit()
            ProgressView(value: NutritionMath.progress(value, goal: goal) ?? (value > 0 ? 1 : 0))
                .tint(LukiColors.accent)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    /// One entry point; photos and the AI estimate live inside the meal editor.
    private var actions: some View {
        Button {
            editing = MealEditorContext(entry: nil, day: day)
        } label: {
            Label(tr("Add food & drink"), systemImage: "plus").frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
        .accessibilityIdentifier("ios.nutrition.addMealButton")
    }

    private var emptyCard: some View {
        VStack(spacing: 4) {
            Text(tr("Nothing logged yet.")).font(.headline)
            Text(tr("Log food or drinks by hand, or snap a photo and let LukiFitti estimate it."))
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(18)
        .background(cardShape)
    }

    private func mealGroup(_ type: MealType, _ list: [MealEntryDto]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(mealTypeLabel(type)).font(.headline)
                Spacer()
                Text("\(Int(NutritionMath.sum(list.map(\.totals)).kcal)) kcal")
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
            .padding(.bottom, 6)
            ForEach(list) { entry in
                Button {
                    editing = MealEditorContext(entry: entry, day: day)
                } label: {
                    HStack(spacing: 12) {
                        if let photo = entry.photos.first {
                            MealPhotoImage(item: .saved(photo), api: viewModel.store.apiClient)
                                .frame(width: 44, height: 44)
                                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                                .accessibilityHidden(true)
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            Text(entry.label ?? entry.items.map(\.name).joined(separator: ", "))
                                .font(.subheadline.weight(.medium))
                                .lineLimit(1)
                            Text(entrySubtitle(entry))
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                        Spacer()
                        Text("\(Int(entry.totals.kcal))")
                            .font(.headline)
                            .monospacedDigit()
                    }
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .contextMenu {
                    Button(role: .destructive) {
                        Task { await nutrition.remove(entry, isSignedIn: isSignedIn) }
                    } label: {
                        Label(tr("Delete entry"), systemImage: "trash")
                    }
                }
                if entry.id != list.last?.id { Divider() }
            }
        }
        .padding(18)
        .background(cardShape)
    }

    private func entrySubtitle(_ entry: MealEntryDto) -> String {
        var parts: [String] = []
        if let date = entry.eatenAtDate { parts.append(date.formatted(date: .omitted, time: .shortened)) }
        let locale = Locale(identifier: tr.rawValue)
        let amounts = entry.items.compactMap { item -> String? in
            let amount = NutritionMath.formatAmount(item.grams, item.amountUnit, locale: locale)
            let text = [entry.label != nil ? item.name : "", amount].filter { !$0.isEmpty }.joined(separator: " ")
            return text.isEmpty ? nil : text
        }
        if !amounts.isEmpty { parts.append(amounts.joined(separator: ", ")) }
        if entry.items.contains(where: { $0.source == .AI }) { parts.append(tr("Estimated")) }
        return parts.joined(separator: " · ")
    }

    private var burnCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(tr("Burned"), systemImage: "flame.fill")
                .font(.headline)
                .foregroundStyle(LukiColors.calories)
            ForEach(burnItems) { item in
                burnRow(item)
            }
            Text(tr("Estimated from duration and intensity. Apple Watch values are used when available."))
                .font(.footnote)
                .foregroundStyle(.secondary)
            if dayBurn.hasHealthDay {
                Text(tr("Includes active energy from Apple Health."))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            if viewModel.currentBodyWeightKg == nil {
                Text(tr("Log your weight for a better estimate."))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(18)
        .background(cardShape)
    }

    @ViewBuilder
    private func burnRow(_ item: NutritionCalendar.BurnedItem) -> some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                switch item {
                case .session(let session, _, let merged):
                    Text(session.workoutNameSnapshot).lineLimit(1)
                    if let merged {
                        Text(tr("%@ · From Apple Health", merged.sourceName))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                case .healthWorkout(let workout, _):
                    Text(tr(Self.activityLabel(workout.activityType))).lineLimit(1)
                    Text(workout.sourceName.isEmpty ? tr("From Apple Health") : workout.sourceName)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                case .dailyActivity:
                    Text(tr("Daily activity")).lineLimit(1)
                    Text(tr("From Apple Health"))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer()
            Text("\(item.kcal) kcal").foregroundStyle(.secondary).monospacedDigit()
        }
        .font(.subheadline)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("ios.nutrition.burn.\(item.id)")
    }

    /// English key of a Health workout's activity type (translated through `tr`).
    static func activityLabel(_ activityType: String) -> String {
        switch activityType {
        case "running": "Running"
        case "cycling": "Cycling"
        case "walking": "Walking"
        case "swimming": "Swimming"
        case "hiking": "Hiking"
        case "traditionalStrengthTraining": "Strength training"
        case "functionalStrengthTraining": "Functional strength"
        case "highIntensityIntervalTraining": "HIIT"
        case "yoga": "Yoga"
        case "rowing": "Rowing"
        case "elliptical": "Elliptical"
        case "flexibility": "Stretching"
        default: "Workout"
        }
    }

    private var weekCard: some View {
        let burnByDay = burnByDay
        let days = (0..<7).reversed().compactMap { Calendar.current.date(byAdding: .day, value: -$0, to: day) }
        let rows = days.map { d -> (date: Date, eaten: Double, burned: Int) in
            (d, nutrition.totals(on: d).kcal, burnByDay[d]?.total ?? 0)
        }
        return VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(tr("Last 7 days")).font(.headline)
                Text(tr("Eaten vs. burned per day")).font(.footnote).foregroundStyle(.secondary)
            }
            Chart {
                ForEach(rows, id: \.date) { row in
                    BarMark(x: .value("Day", row.date, unit: .day), y: .value(tr("Eaten"), row.eaten))
                        .foregroundStyle(by: .value("Kind", tr("Eaten")))
                        .position(by: .value("Kind", tr("Eaten")))
                    BarMark(x: .value("Day", row.date, unit: .day), y: .value(tr("Burned"), row.burned))
                        .foregroundStyle(by: .value("Kind", tr("Burned")))
                        .position(by: .value("Kind", tr("Burned")))
                }
                if let goal = prefs.dailyKcalGoal {
                    RuleMark(y: .value(tr("Goal"), goal))
                        .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
                        .foregroundStyle(.secondary)
                }
            }
            .chartForegroundStyleScale([tr("Eaten"): LukiColors.accent, tr("Burned"): LukiColors.calories.opacity(0.55)])
            .chartXAxis { AxisMarks(values: .stride(by: .day)) { _ in AxisValueLabel(format: .dateTime.weekday(.narrow)) } }
            .frame(height: 180)
        }
        .padding(18)
        .background(cardShape)
    }

    // MARK: Helpers

    private func mealTypeLabel(_ type: MealType) -> String { MealEditorSheet.label(type, tr) }

    private var cardShape: some View {
        RoundedRectangle(cornerRadius: 22, style: .continuous).fill(LukiColors.cardBackground)
    }
}

/// Burned kcal per day, rebuilt only when history, Apple Health activity or body weight change
/// (array equality short-circuits on shared storage, so unchanged renders cost one comparison).
@MainActor
private final class BurnMemo {
    private struct Key: Equatable {
        let sessions: [WorkoutSessionDto]
        let healthDays: [HealthDailyEnergyDto]
        let healthWorkouts: [HealthWorkoutDto]
        let points: [WeighInPoint]
        let fallbackKg: Double?
    }
    private var key: Key?
    private var value: [Date: NutritionCalendar.DayBurn] = [:]

    func index(
        sessions: [WorkoutSessionDto],
        healthDays: [HealthDailyEnergyDto],
        healthWorkouts: [HealthWorkoutDto],
        points: [WeighInPoint],
        fallbackKg: Double?,
        bodyWeightKg: (Date) -> Double?
    ) -> [Date: NutritionCalendar.DayBurn] {
        let next = Key(
            sessions: sessions, healthDays: healthDays, healthWorkouts: healthWorkouts,
            points: points, fallbackKg: fallbackKg
        )
        if let key, key == next { return value }
        value = NutritionCalendar.dayBurns(
            sessions: sessions, healthDays: healthDays, healthWorkouts: healthWorkouts, bodyWeightKg: bodyWeightKg
        )
        key = next
        return value
    }
}

struct MealEditorContext: Identifiable {
    let id = UUID()
    let entry: MealEntryDto?
    let day: Date
}
