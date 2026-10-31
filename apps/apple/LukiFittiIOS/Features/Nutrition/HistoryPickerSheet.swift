import SwiftUI
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain
import LukiFittiAPI

/// Re-use foods or whole entries from earlier meals. Stays open so several picks can be added.
struct HistoryPickerSheet: View {
    let api: APIClient
    let onAdd: ([MealItemDto]) -> Void

    private enum Mode: Hashable { case entries, foods }

    private struct LoadKey: Hashable {
        var query: String
        var attempt: Int
    }

    @Environment(\.dismiss) private var dismiss
    @Environment(\.lukiLocale) private var tr
    @State private var query = ""
    @State private var picks: NutritionHistoryPicksDto?
    @State private var mode: Mode?
    @State private var loadFailed = false
    @State private var attempt = 0
    @State private var hasLoadedOnce = false
    @State private var addedCount = 0
    @State private var recentlyAdded: Set<String> = []

    private var trimmedQuery: String {
        String(query.trimmingCharacters(in: .whitespacesAndNewlines).prefix(NutritionHistoryPicksDto.maxQueryLength))
    }
    private var locale: Locale { Locale(identifier: tr.rawValue) }
    private var selectedMode: Mode { mode ?? .entries }
    private var modeBinding: Binding<Mode> {
        Binding(get: { selectedMode }, set: { mode = $0 })
    }

    var body: some View {
        NavigationStack {
            content
                .navigationTitle(tr("Add from history"))
                .navigationBarTitleDisplayMode(.inline)
                .searchable(
                    text: $query,
                    placement: .navigationBarDrawer(displayMode: .always),
                    prompt: tr("Search foods and entries")
                )
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button(tr("Done")) { dismiss() }
                            .accessibilityIdentifier("ios.nutrition.historyDoneButton")
                    }
                }
        }
        .sensoryFeedback(.impact(weight: .light), trigger: addedCount)
        .task(id: LoadKey(query: trimmedQuery, attempt: attempt)) { await load(trimmedQuery) }
        .accessibilityIdentifier("ios.nutrition.historySheet")
    }

    @ViewBuilder
    private var content: some View {
        if loadFailed {
            ContentUnavailableView {
                Label(tr("Couldn’t load your history."), systemImage: "exclamationmark.triangle")
            } actions: {
                Button(tr("Try again")) {
                    loadFailed = false
                    attempt += 1
                }
                .accessibilityIdentifier("ios.nutrition.historyRetryButton")
            }
        } else if let picks {
            if picks.entries.isEmpty && picks.items.isEmpty && trimmedQuery.isEmpty {
                ContentUnavailableView(tr("Foods you log appear here for quick re-use."), systemImage: "clock.arrow.circlepath")
            } else {
                list(picks)
            }
        } else {
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func list(_ picks: NutritionHistoryPicksDto) -> some View {
        List {
            Section {
                Picker(tr("Add from history"), selection: modeBinding) {
                    Text(tr("Entries")).tag(Mode.entries)
                    Text(tr("Foods")).tag(Mode.foods)
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
                .accessibilityIdentifier("ios.nutrition.historyMode")
            }

            Section {
                switch selectedMode {
                case .entries:
                    ForEach(picks.entries) { entry in
                        row(
                            id: "entry-\(entry.id)",
                            title: entryTitle(entry),
                            subtitle: tr("%d items · %d kcal", entry.items.count, Int(entry.totals.kcal.rounded())),
                            timesLogged: entry.timesLogged,
                            lastLogged: entry.lastLoggedDate,
                            items: entry.items
                        )
                    }
                case .foods:
                    ForEach(picks.items) { pick in
                        row(
                            id: "item-\(pick.id)",
                            title: pick.item.name,
                            subtitle: foodSubtitle(pick.item),
                            timesLogged: pick.timesLogged,
                            lastLogged: pick.lastLoggedDate,
                            items: [pick.item]
                        )
                    }
                }
            } footer: {
                if addedCount > 0 {
                    Text(tr("%d added", addedCount))
                        .accessibilityIdentifier("ios.nutrition.historyAddedCount")
                }
            }
        }
        .overlay {
            if isCurrentListEmpty(picks) {
                ContentUnavailableView(
                    trimmedQuery.isEmpty
                        ? tr("Foods you log appear here for quick re-use.")
                        : tr("Nothing found for “%@”.", trimmedQuery),
                    systemImage: trimmedQuery.isEmpty ? "clock.arrow.circlepath" : "magnifyingglass"
                )
            }
        }
    }

    private func isCurrentListEmpty(_ picks: NutritionHistoryPicksDto) -> Bool {
        selectedMode == .entries ? picks.entries.isEmpty : picks.items.isEmpty
    }

    private func row(
        id: String,
        title: String,
        subtitle: String,
        timesLogged: Int,
        lastLogged: Date?,
        items: [MealItemDto]
    ) -> some View {
        let added = recentlyAdded.contains(id)
        return Button {
            add(items, id: id, name: title)
        } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.body.weight(.medium))
                        .foregroundStyle(.primary)
                        .lineLimit(2)
                    if !subtitle.isEmpty {
                        Text(subtitle)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    if let hint = hint(timesLogged: timesLogged, lastLogged: lastLogged) {
                        Text(hint)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer(minLength: 8)
                if added {
                    Label(tr("Added"), systemImage: "checkmark.circle.fill")
                        .labelStyle(.iconOnly)
                        .font(.title3)
                        .foregroundStyle(LukiColors.success)
                        .transition(.scale.combined(with: .opacity))
                } else {
                    Image(systemName: "plus.circle")
                        .font(.title3)
                        .foregroundStyle(LukiColors.accent)
                        .accessibilityHidden(true)
                }
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .animation(.snappy, value: added)
        .accessibilityIdentifier("ios.nutrition.historyRow")
    }

    private func entryTitle(_ entry: HistoryEntryPickDto) -> String {
        if let label = entry.label?.trimmingCharacters(in: .whitespacesAndNewlines), !label.isEmpty { return label }
        return entry.items.map(\.name).joined(separator: ", ")
    }

    private func foodSubtitle(_ item: MealItemDto) -> String {
        let amount = NutritionMath.formatAmount(item.grams, item.amountUnit, locale: locale)
        return ((amount.isEmpty ? [] : [amount]) + ["\(Int(item.kcal.rounded())) kcal"]).joined(separator: " · ")
    }

    private func hint(timesLogged: Int, lastLogged: Date?) -> String? {
        guard let lastLogged else { return nil }
        let formatter = RelativeDateTimeFormatter()
        formatter.locale = locale
        formatter.dateTimeStyle = .named
        formatter.unitsStyle = .full
        return tr("%d× · last %@", timesLogged, formatter.localizedString(for: lastLogged, relativeTo: Date()))
    }

    private func add(_ items: [MealItemDto], id: String, name: String) {
        guard !items.isEmpty else { return }
        onAdd(items)
        addedCount += 1
        recentlyAdded.insert(id)
        AccessibilityNotification.Announcement(tr("%@ added", name)).post()
        Task {
            try? await Task.sleep(for: .seconds(1.5))
            recentlyAdded.remove(id)
        }
    }

    private func load(_ query: String) async {
        do {
            if hasLoadedOnce { try await Task.sleep(for: .milliseconds(250)) }
            hasLoadedOnce = true
            let fetched = try await api.fetchHistoryPicks(query: query.isEmpty ? nil : query)
            try Task.checkCancellation()
            if mode == nil { mode = fetched.entries.isEmpty ? .foods : .entries }
            picks = fetched
            loadFailed = false
        } catch {
            guard !Task.isCancelled, !(error is CancellationError) else { return }
            loadFailed = true
        }
    }
}
