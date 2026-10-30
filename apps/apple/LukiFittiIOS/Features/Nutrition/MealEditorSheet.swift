import SwiftUI
import UIKit
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain
import LukiFittiAPI
import LukiFittiStore

/// Create or edit a meal. Changing only the amount rescales an item's nutrients; photos can be
/// added and estimated by AI right here (same entry id, manual foods are kept).
struct MealEditorSheet: View {
    @Bindable var viewModel: LukiAppViewModel
    let context: MealEditorContext
    let onSaved: (_ reachedServer: Bool) -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.lukiLocale) private var tr
    @State private var mealType: MealType
    @State private var time: Date
    @State private var label: String
    @State private var items: [MealItemDto]
    /// Chosen input unit per item id (`l` is display-only; stored as ml).
    @State private var displayUnits: [String: NutritionMath.AmountDisplayUnit] = [:]
    @State private var recent: [MealItemDto] = []
    @State private var error: String?
    @State private var saving = false
    @State private var confirmDelete = false
    @State private var clientEntryId: String
    @State private var serverEntry: MealEntryDto?
    /// An estimate created this meal on the server and it hasn't been saved since.
    @State private var unsavedEstimate = false
    @State private var analyzing = false
    @State private var confirmDiscard = false
    @State private var pickedPhotos: [MealPhotoSection.LocalPhoto] = []
    @State private var showsCamera = false
    @State private var photoViewerStart: MealPhotoSection.ViewerStart?

    init(viewModel: LukiAppViewModel, context: MealEditorContext, onSaved: @escaping (Bool) -> Void) {
        self.viewModel = viewModel
        self.context = context
        self.onSaved = onSaved
        let entry = context.entry
        _mealType = State(initialValue: entry?.mealType ?? MealType.forTime(Date()))
        _time = State(initialValue: entry?.eatenAtDate ?? Date())
        _label = State(initialValue: entry?.label ?? "")
        _items = State(initialValue: entry?.items.isEmpty == false ? entry!.items : [MealItemDto(name: "")])
        _clientEntryId = State(initialValue: entry?.clientEntryId ?? NutritionStore.newClientId())
        _serverEntry = State(initialValue: entry)
    }

    static func label(_ type: MealType, _ tr: SupportedLocale) -> String {
        switch type {
        case .BREAKFAST: return tr("Breakfast")
        case .LUNCH: return tr("Lunch")
        case .DINNER: return tr("Dinner")
        case .SNACK: return tr("Snack")
        case .COFFEE: return tr("Coffee")
        case .OTHER: return tr("Other")
        }
    }

    private var isSignedIn: Bool { viewModel.store.currentUser != nil }
    private var mealLabel: String { Self.label(mealType, tr) }
    private var timeLabel: String {
        eatenAt.formatted(Date.FormatStyle(date: .omitted, time: .shortened).locale(locale))
    }
    private var canUsePhotos: Bool { viewModel.store.currentUser?.hasFeature(.AI_MEAL_PHOTO) ?? false }
    private var totals: NutritionTotalsDto { NutritionMath.sum(items) }
    private var locale: Locale { Locale(identifier: tr.rawValue) }
    private var eatenAt: Date {
        let cal = Calendar.current
        let hm = cal.dateComponents([.hour, .minute], from: time)
        return cal.date(bySettingHour: hm.hour ?? 12, minute: hm.minute ?? 0, second: 0, of: context.day) ?? time
    }

    var body: some View {
        editor
            .fullScreenCover(isPresented: $showsCamera) {
                CameraPicker { image in
                    if pickedPhotos.count < MealPhotoSheet.maxPhotos {
                        pickedPhotos.append(MealPhotoSection.LocalPhoto(image: image))
                    }
                }
                .ignoresSafeArea()
            }
            .fullScreenCover(item: $photoViewerStart) { start in
                MealPhotoViewer(
                    items: MealPhotoSection.items(saved: serverEntry?.photos ?? [], picked: pickedPhotos),
                    startAt: start.id,
                    mealLabel: mealLabel,
                    timeLabel: timeLabel,
                    api: viewModel.store.apiClient,
                    onDelete: viewerDelete
                )
            }
    }

    private var viewerDelete: ((MealPhotoDto) async -> Bool)? {
        guard isSignedIn else { return nil }
        return { await deletePhoto($0) }
    }

    private var editor: some View {
        NavigationStack {
            Form {
                if canUsePhotos {
                    MealPhotoSection(
                        savedPhotos: serverEntry?.photos ?? [],
                        mealLabel: mealLabel,
                        timeLabel: timeLabel,
                        isOnline: isSignedIn,
                        busy: analyzing,
                        api: viewModel.store.apiClient,
                        onEstimate: estimate,
                        onDeleteSaved: deletePhoto,
                        picked: $pickedPhotos,
                        showsCamera: $showsCamera,
                        viewerStart: $photoViewerStart
                    )
                }

                Section {
                    Picker(tr("Meal"), selection: $mealType) {
                        ForEach(MealType.allCases, id: \.self) { Text(Self.label($0, tr)).tag($0) }
                    }
                    DatePicker(tr("Time"), selection: $time, displayedComponents: .hourAndMinute)
                    TextField(tr("Name (optional)"), text: $label)
                }
                .disabled(analyzing)

                ForEach($items) { $item in
                    Section {
                        HStack {
                            TextField(tr("Food"), text: $item.name)
                                .font(.body.weight(.medium))
                            if item.source == .AI {
                                Label(tr("Estimated"), systemImage: "sparkles")
                                    .font(.caption)
                                    .labelStyle(.titleAndIcon)
                                    .foregroundStyle(LukiColors.accent)
                            }
                        }
                        amountRow($item)
                        numberRow("kcal", id: "kcal", value: nonOptional($item.kcal))
                        numberRow(tr("Protein (g)"), id: "protein", value: nonOptional($item.proteinG))
                        numberRow(tr("Carbs (g)"), id: "carbs", value: nonOptional($item.carbsG))
                        numberRow(tr("Fat (g)"), id: "fat", value: nonOptional($item.fatG))
                        if item.source == .AI, let c = item.confidence, c < 0.5 {
                            Text(tr("Rough estimate — check the amount"))
                                .font(.footnote)
                                .foregroundStyle(LukiColors.warning)
                        }
                        Button(role: .destructive) {
                            items.removeAll { $0.id == item.id }
                            if items.isEmpty { items = [MealItemDto(name: "")] }
                        } label: {
                            Label(tr("Remove"), systemImage: "minus.circle")
                        }
                    }
                    .disabled(analyzing)
                }

                Section {
                    Button {
                        items.append(MealItemDto(name: ""))
                    } label: {
                        Label(tr("Add another food"), systemImage: "plus")
                    }
                    if !recent.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack {
                                ForEach(recent.prefix(12)) { r in
                                    Button(recentTitle(r)) {
                                        items.removeAll { $0.name.isEmpty && $0.kcal == 0 }
                                        var copy = r
                                        copy.id = UUID().uuidString
                                        copy.source = .MANUAL
                                        copy.confidence = nil
                                        items.append(copy)
                                    }
                                    .buttonStyle(.bordered)
                                }
                            }
                        }
                    }
                } header: {
                    if !recent.isEmpty { Text(tr("Recent")) }
                }
                .disabled(analyzing)

                Section {
                    Text(tr("Total: %d kcal", Int(totals.kcal)))
                        .font(.headline)
                    Text("\(tr("Protein")) \(Int(totals.proteinG)) g · \(tr("Carbs")) \(Int(totals.carbsG)) g · \(tr("Fat")) \(Int(totals.fatG)) g")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    if let error {
                        Text(error).foregroundStyle(LukiColors.destructive).font(.footnote)
                    }
                    if serverEntry != nil {
                        Button(tr("Delete meal"), role: .destructive) { confirmDelete = true }
                            .disabled(analyzing)
                    }
                }
            }
            .navigationTitle(context.entry == nil ? tr("New meal") : tr("Edit meal"))
            .navigationBarTitleDisplayMode(.inline)
            .interactiveDismissDisabled(analyzing || unsavedEstimate)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(tr("Cancel")) {
                        if unsavedEstimate { confirmDiscard = true } else { dismiss() }
                    }
                    .disabled(analyzing)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(tr("Save")) { Task { await save() } }
                        .disabled(saving || analyzing)
                        .accessibilityIdentifier("ios.nutrition.saveMealButton")
                }
            }
            .confirmationDialog(tr("Delete this meal and its photos?"), isPresented: $confirmDelete, titleVisibility: .visible) {
                Button(tr("Delete meal"), role: .destructive) {
                    guard let entry = serverEntry else { return }
                    Task {
                        await viewModel.nutrition.remove(entry, isSignedIn: isSignedIn)
                        dismiss()
                    }
                }
            }
            .confirmationDialog(tr("Discard estimate?"), isPresented: $confirmDiscard, titleVisibility: .visible) {
                Button(tr("Discard"), role: .destructive) {
                    guard let entry = serverEntry else { return dismiss() }
                    Task {
                        await viewModel.nutrition.remove(entry, isSignedIn: isSignedIn)
                        dismiss()
                    }
                }
                Button(tr("Keep meal")) { dismiss() }
            } message: {
                Text(tr("The photos and estimated foods of this meal will be deleted."))
            }
            .task {
                guard isSignedIn else { return }
                recent = (try? await viewModel.store.apiClient.fetchRecentMealItems()) ?? []
            }
        }
    }

    // MARK: Amount

    private func displayUnit(_ item: MealItemDto) -> NutritionMath.AmountDisplayUnit {
        if let chosen = displayUnits[item.id], chosen.stored == item.amountUnit { return chosen }
        return item.grams.map { NutritionMath.displayAmount($0, item.amountUnit).unit } ?? (item.amountUnit == .ML ? .ml : .g)
    }

    private func amountRow(_ item: Binding<MealItemDto>) -> some View {
        let unit = displayUnit(item.wrappedValue)
        let value = Binding<Double?>(
            get: { item.wrappedValue.grams.map { unit == .l ? $0 / 1000 : $0 } },
            set: { typed in
                guard let typed else { item.wrappedValue.grams = nil; return }
                let stored = NutritionMath.storedAmount(max(0, typed), unit)
                displayUnits[item.wrappedValue.id] = unit
                if (item.wrappedValue.grams ?? 0) > 0 {
                    item.wrappedValue = NutritionMath.scale(item.wrappedValue, toAmount: stored.amount, unit: stored.unit)
                } else {
                    item.wrappedValue.grams = stored.amount
                    item.wrappedValue.amountUnit = stored.unit
                }
            }
        )
        let unitBinding = Binding<NutritionMath.AmountDisplayUnit>(
            get: { unit },
            set: { next in
                // Relabel only: the stored number stays (500 ml ↔ 0.5 l, 500 g → 500 ml).
                displayUnits[item.wrappedValue.id] = next
                item.wrappedValue.amountUnit = next.stored
            }
        )
        return HStack {
            Text(tr("Amount"))
            Spacer()
            LiveNumberField(value: value, fractionDigits: 3)
                .frame(maxWidth: 100)
                .accessibilityLabel(tr("Amount"))
                .accessibilityIdentifier("ios.nutrition.item.grams")
            Picker(tr("Unit"), selection: unitBinding) {
                ForEach(NutritionMath.AmountDisplayUnit.allCases) { Text($0.rawValue).tag($0) }
            }
            .labelsHidden()
            .pickerStyle(.menu)
            .fixedSize()
            .accessibilityLabel(tr("Unit"))
            .accessibilityIdentifier("ios.nutrition.item.unit")
        }
    }

    private func recentTitle(_ item: MealItemDto) -> String {
        let amount = NutritionMath.formatAmount(item.grams, item.amountUnit, locale: locale)
        return ([item.name] + (amount.isEmpty ? [] : [amount]) + ["\(Int(item.kcal)) kcal"]).joined(separator: " · ")
    }

    private func numberRow(_ title: String, id: String, value: Binding<Double?>) -> some View {
        HStack {
            Text(title)
            Spacer()
            LiveNumberField(value: value)
                .frame(maxWidth: 120)
                .accessibilityLabel(title)
                .accessibilityIdentifier("ios.nutrition.item.\(id)")
        }
    }

    private func nonOptional(_ binding: Binding<Double>) -> Binding<Double?> {
        Binding(get: { binding.wrappedValue }, set: { binding.wrappedValue = max(0, $0 ?? 0) })
    }

    // MARK: Photos & AI

    private func estimate(_ images: [UIImage], _ hint: String) async -> (message: String?, success: Bool, usage: AiRunUsageDto?) {
        guard isSignedIn else { return (tr("You need to be online to estimate from photos."), false, nil) }
        analyzing = true
        defer { analyzing = false }
        let jpegs = images.compactMap { MealPhotoSheet.uploadJPEG($0) }
        do {
            let result = try await viewModel.store.apiClient.analyzeMeal(
                jpegPhotos: jpegs,
                clientEntryId: clientEntryId,
                eatenAt: eatenAt,
                mealType: mealType,
                hint: hint
            )
            if serverEntry == nil { unsavedEstimate = true }
            serverEntry = result.entry
            viewModel.nutrition.upsertLocal(result.entry)
            // Server AI items replace earlier AI drafts; locally typed manual foods (maybe unsaved) stay.
            let manual = items.filter { $0.source == .MANUAL && (!$0.name.isEmpty || $0.kcal > 0 || ($0.grams ?? 0) > 0) }
            let ai = result.entry.items.filter { $0.source == .AI }
            items = manual + ai
            if items.isEmpty { items = [MealItemDto(name: "")] }
            if !result.analysis.containsFood { return (tr("We couldn’t find food in these photos."), true, result.usage) }
            if !result.photosStored { return (tr("Photos weren’t stored on the server."), true, result.usage) }
            return (nil, true, result.usage)
        } catch {
            return (MealPhotoSheet.message(for: error, tr), false, nil)
        }
    }

    private func deletePhoto(_ photo: MealPhotoDto) async -> Bool {
        do {
            try await viewModel.store.apiClient.deleteMealPhoto(id: photo.id)
        } catch APIClientError.serverError(404, _) {
            // Already gone (retention sweep): drop it locally too.
        } catch {
            self.error = MealPhotoSheet.message(for: error, tr)
            return false
        }
        MealPhotoCache.shared.remove(photo.id)
        guard var entry = serverEntry else { return true }
        entry.photos.removeAll { $0.id == photo.id }
        serverEntry = entry
        viewModel.nutrition.upsertLocal(entry)
        return true
    }

    private func save() async {
        let filled = items.filter { !$0.name.trimmingCharacters(in: .whitespaces).isEmpty || $0.kcal > 0 || ($0.grams ?? 0) > 0 }
        guard !filled.contains(where: { $0.name.trimmingCharacters(in: .whitespaces).isEmpty }) else {
            error = tr("Give each food a name.")
            return
        }
        saving = true
        defer { saving = false }
        let payload = UpsertMealEntryDto(
            clientEntryId: clientEntryId,
            eatenAt: LukiISODate.string(eatenAt),
            mealType: mealType,
            label: label.trimmingCharacters(in: .whitespaces).isEmpty ? nil : label.trimmingCharacters(in: .whitespaces),
            notes: serverEntry?.notes,
            items: filled.map {
                var item = $0
                item.name = item.name.trimmingCharacters(in: .whitespaces)
                return MealItemInputDto(item)
            }
        )
        let reached = await viewModel.nutrition.save(payload, isSignedIn: isSignedIn)
        unsavedEstimate = false
        onSaved(reached)
        dismiss()
    }
}

/// Number input that updates its value on every keystroke (a `TextField(value:format:)` only
/// commits on Return, so tapping Save right after typing would drop the value).
struct LiveNumberField: View {
    @Binding var value: Double?
    @State private var text: String
    @State private var lastWritten: Double?
    private let fractionDigits: Int

    init(value: Binding<Double?>, fractionDigits: Int = 1) {
        _value = value
        self.fractionDigits = fractionDigits
        _text = State(initialValue: Self.format(value.wrappedValue, fractionDigits: fractionDigits))
        _lastWritten = State(initialValue: value.wrappedValue)
    }

    static func format(_ v: Double?, fractionDigits: Int = 1) -> String {
        guard let v else { return "" }
        guard v.rounded() != v else { return String(Int(v)) }
        let text = String(format: "%.\(fractionDigits)f", v)
        return fractionDigits > 1 && text.contains(".")
            ? String(text.reversed().drop { $0 == "0" }.reversed())
            : text
    }

    var body: some View {
        TextField("0", text: $text)
            .keyboardType(.decimalPad)
            .multilineTextAlignment(.trailing)
            .monospacedDigit()
            .onChange(of: text) { _, newText in
                let parsed = Double(newText.replacingOccurrences(of: ",", with: "."))
                lastWritten = parsed
                value = parsed
            }
            .onChange(of: value) { _, newValue in
                // Reflect external changes (e.g. rescaling after an amount edit) without
                // fighting the user's own typing.
                if newValue != lastWritten {
                    lastWritten = newValue
                    text = Self.format(newValue, fractionDigits: fractionDigits)
                }
            }
    }
}
