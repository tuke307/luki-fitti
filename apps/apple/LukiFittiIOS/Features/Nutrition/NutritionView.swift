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
    @State private var showsPhotoSheet = false
    @State private var offlineNote = false

    public init(viewModel: LukiAppViewModel) {
        self.viewModel = viewModel
    }

    private var nutrition: NutritionStore { viewModel.nutrition }
    private var prefs: UserPreferencesDto { viewModel.store.preferences }
    private var isSignedIn: Bool { viewModel.store.currentUser != nil }
    private var canUsePhotos: Bool { viewModel.store.currentUser?.hasFeature(.AI_MEAL_PHOTO) ?? false }
    private var isToday: Bool { Calendar.current.isDateInToday(day) }

    private var dayEntries: [MealEntryDto] { nutrition.entries(on: day) }
    private var totals: NutritionTotalsDto { NutritionMath.sum(dayEntries.map(\.totals)) }
    private var workouts: [(session: WorkoutSessionDto, kcal: Int)] {
        viewModel.store.historySessions
            .filter { LukiISODate.parse($0.startedAt).map { Calendar.current.isDate($0, inSameDayAs: day) } ?? false }
            .map { ($0, NutritionMath.burnedKcal(for: $0, bodyWeightKg: viewModel.bodyWeightKg(for: $0))) }
    }
    private var burned: Int { workouts.reduce(0) { $0 + $1.kcal } }

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
                if !workouts.isEmpty { burnCard }
                weekCard
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .background(LukiColors.groupedBackground)
        .refreshable { await nutrition.refresh(isSignedIn: isSignedIn) }
        .task { await nutrition.refresh(isSignedIn: isSignedIn) }
        .sheet(item: $editing) { context in
            MealEditorSheet(viewModel: viewModel, context: context) { reachedServer in
                offlineNote = !reachedServer
            }
        }
        .sheet(isPresented: $showsPhotoSheet) {
            MealPhotoSheet(viewModel: viewModel, day: day) { entry in
                nutrition.upsertLocal(entry)
                editing = MealEditorContext(entry: entry, day: day)
            }
        }
    }

    // MARK: Sections

    private var dayHeader: some View {
        HStack {
            Text(dayTitle)
                .font(.title3.weight(.semibold))
                .foregroundStyle(.secondary)
            Spacer()
            Button { shiftDay(-1) } label: { Image(systemName: "chevron.left") }
                .buttonStyle(.bordered)
                .accessibilityLabel(tr("Previous day"))
            Button { shiftDay(1) } label: { Image(systemName: "chevron.right") }
                .buttonStyle(.bordered)
                .disabled(isToday)
                .accessibilityLabel(tr("Next day"))
        }
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
                    Gauge(value: NutritionMath.progress(net, goal: goal) ?? (totals.kcal > 0 ? 1 : 0)) { EmptyView() }
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

    private var actions: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 10) { actionButtons }
            VStack(spacing: 10) { actionButtons }
        }
    }

    @ViewBuilder
    private var actionButtons: some View {
        Button {
            editing = MealEditorContext(entry: nil, day: day)
        } label: {
            Label(tr("Add meal"), systemImage: "plus").frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
        .accessibilityIdentifier("ios.nutrition.addMealButton")
        if canUsePhotos {
            Button {
                showsPhotoSheet = true
            } label: {
                Label(tr("Snap a photo"), systemImage: "camera").frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.large)
            .accessibilityIdentifier("ios.nutrition.photoButton")
        }
    }

    private var emptyCard: some View {
        VStack(spacing: 4) {
            Text(tr("Nothing logged yet.")).font(.headline)
            Text(tr("Log a meal by hand, or snap a photo and let LukiFitti estimate it."))
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
                        Label(tr("Delete meal"), systemImage: "trash")
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
        if entry.label != nil, !entry.items.isEmpty { parts.append(entry.items.map(\.name).joined(separator: ", ")) }
        if entry.items.contains(where: { $0.source == .AI }) { parts.append(tr("Estimated")) }
        return parts.joined(separator: " · ")
    }

    private var burnCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(tr("Burned"), systemImage: "flame.fill")
                .font(.headline)
                .foregroundStyle(LukiColors.calories)
            ForEach(workouts, id: \.session.clientSessionId) { item in
                HStack {
                    Text(item.session.workoutNameSnapshot).lineLimit(1)
                    Spacer()
                    Text("\(item.kcal) kcal").foregroundStyle(.secondary).monospacedDigit()
                }
                .font(.subheadline)
            }
            Text(tr("Estimated from duration and intensity. Apple Watch values are used when available."))
                .font(.footnote)
                .foregroundStyle(.secondary)
            if viewModel.currentBodyWeightKg == nil {
                Text(tr("Log your weight for a better estimate."))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(18)
        .background(cardShape)
    }

    private var weekCard: some View {
        let days = (0..<7).reversed().compactMap { Calendar.current.date(byAdding: .day, value: -$0, to: day) }
        let rows = days.map { d -> (date: Date, eaten: Double, burned: Int) in
            let burnedOnDay = viewModel.store.historySessions
                .filter { LukiISODate.parse($0.startedAt).map { Calendar.current.isDate($0, inSameDayAs: d) } ?? false }
                .reduce(0) { $0 + NutritionMath.burnedKcal(for: $1, bodyWeightKg: viewModel.bodyWeightKg(for: $1)) }
            return (d, nutrition.totals(on: d).kcal, burnedOnDay)
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

    private func shiftDay(_ delta: Int) {
        guard let next = Calendar.current.date(byAdding: .day, value: delta, to: day) else { return }
        day = min(Calendar.current.startOfDay(for: Date()), next)
    }

    private func mealTypeLabel(_ type: MealType) -> String { MealEditorSheet.label(type, tr) }

    private var cardShape: some View {
        RoundedRectangle(cornerRadius: 22, style: .continuous).fill(LukiColors.cardBackground)
    }
}

struct MealEditorContext: Identifiable {
    let id = UUID()
    let entry: MealEntryDto?
    let day: Date
}
