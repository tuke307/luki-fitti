import SwiftUI
import PhotosUI
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain
import LukiFittiStore

/// Progress check-ins, newest first: date, weight and the 3 pose thumbnails.
public struct ProgressListView: View {
    @Bindable public var viewModel: LukiAppViewModel
    @Environment(\.lukiLocale) private var tr
    @State private var editorDraft: ProgressCheckInDto? = nil
    @State private var showGuide = false
    @State private var compareCheckIn: ProgressCheckInDto? = nil
    @State private var askDeleteRemote = false

    public init(viewModel: LukiAppViewModel) {
        self.viewModel = viewModel
    }

    private var checkIns: [ProgressCheckInDto] { viewModel.progress.checkIns }

    public var body: some View {
        List {
            if checkIns.isEmpty {
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(tr("Track how your body changes over time."))
                            .font(.subheadline.weight(.semibold))
                        Text(tr("Take a photo from the front, side and back on check-in days. Photos stay on this device unless you turn on cloud backup."))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 8)
                }
            }

            ForEach(checkIns) { checkIn in
                checkInRow(checkIn)
            }

            Section {
                Toggle(isOn: Binding(
                    get: { viewModel.store.preferences.progressPhotoCloudBackup },
                    set: { on in
                        if on {
                            Task { await viewModel.setProgressCloudBackup(true) }
                        } else {
                            askDeleteRemote = true
                        }
                    }
                )) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(tr("Cloud backup"))
                        Text(tr("Backs photos up to your account so a reinstall restores them."))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .accessibilityIdentifier("ios.progress.cloudBackupToggle")
            }
        }
        .navigationTitle(tr("Progress Photos"))
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    editorDraft = ProgressCheckInDto()
                } label: { Image(systemName: "plus") }
                .accessibilityIdentifier("ios.progress.addCheckIn")
            }
            ToolbarItem(placement: .topBarLeading) {
                Button { showGuide = true } label: { Image(systemName: "questionmark.circle") }
                    .accessibilityLabel(tr("How to take the right photo"))
            }
        }
        .alert(tr("Turn off cloud backup?"), isPresented: $askDeleteRemote) {
            Button(tr("Keep cloud copies")) {
                Task { await viewModel.setProgressCloudBackup(false, deleteRemote: false) }
            }
            Button(tr("Delete cloud copies"), role: .destructive) {
                Task { await viewModel.setProgressCloudBackup(false, deleteRemote: true) }
            }
            Button(tr("Cancel"), role: .cancel) {}
        } message: {
            Text(tr("Photos stay on this device. Do you also want to delete the copies already backed up?"))
        }
        .sheet(isPresented: $showGuide) { ProgressGuideSheet() }
        .sheet(item: $editorDraft) { draft in
            CheckInEditorView(viewModel: viewModel, existing: draft)
        }
        .sheet(item: $compareCheckIn) { first in
            ProgressCompareView(viewModel: viewModel, first: first)
        }
    }

    private func checkInRow(_ checkIn: ProgressCheckInDto) -> some View {
        let date = LukiDate.parseISO(checkIn.takenAt)
        let weight = viewModel.bodyWeight.entry(clientEntryId: checkIn.bodyWeightClientEntryId ?? "")
        return Section {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline) {
                    Text(date.map { $0.formatted(.dateTime.day().month(.abbreviated).year().locale(Locale(identifier: tr.rawValue))) } ?? checkIn.takenAt)
                        .font(.subheadline.weight(.semibold))
                    Spacer()
                    if let weight {
                        Text("\(displayWeight(weight.weightKg)) \(LukiFormat.unitLabel(viewModel.store.preferences.weightUnit))")
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(.secondary)
                    }
                }
                HStack(spacing: 8) {
                    ForEach(ProgressPose.allCases, id: \.self) { pose in
                        poseThumb(checkIn, pose)
                    }
                }
            }
            .contentShape(Rectangle())
            .onTapGesture { editorDraft = checkIn }
            .swipeActions(edge: .trailing) {
                Button(role: .destructive) {
                    Task { await viewModel.progress.remove(checkIn, isSignedIn: viewModel.isSignedIn) }
                } label: { Label(tr("Delete"), systemImage: "trash") }
            }
            .swipeActions(edge: .leading) {
                Button { compareCheckIn = checkIn } label: { Label(tr("Compare"), systemImage: "rectangle.split.2x1") }
                    .tint(LukiColors.accent)
            }
            .accessibilityIdentifier("ios.progress.checkIn.\(checkIn.clientEntryId)")
        }
    }

    private func poseThumb(_ checkIn: ProgressCheckInDto, _ pose: ProgressPose) -> some View {
        let photo = checkIn.photos.first { $0.pose == pose }
        let date = LukiDate.parseISO(checkIn.takenAt).map {
            $0.formatted(.dateTime.day().month(.abbreviated).locale(Locale(identifier: tr.rawValue)))
        } ?? ""
        return ZStack {
            RoundedRectangle(cornerRadius: 10, style: .continuous).fill(LukiColors.fill)
            if let photo {
                ProgressThumbView(viewModel: viewModel, photo: photo)
                    .accessibilityLabel(tr("%@ photo, %@", poseLabel(pose), date))
            } else {
                VStack(spacing: 2) {
                    Image(systemName: "camera")
                    Text(poseLabel(pose)).font(.caption2)
                }
                .foregroundStyle(.secondary)
            }
        }
        .aspectRatio(2.0 / 3.0, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func displayWeight(_ kg: Double) -> String {
        LukiFormat.weight(viewModel.store.preferences.weightUnit == .LBS ? kg * ProgressionEngine.kgToLbs : kg)
    }

    private func poseLabel(_ pose: ProgressPose) -> String {
        switch pose {
        case .FRONT: return tr("Front")
        case .SIDE: return tr("Side")
        case .BACK: return tr("Back")
        }
    }
}

/// Loads a progress photo's bytes (local file first, lazy server download for backups).
private struct ProgressThumbView: View {
    let viewModel: LukiAppViewModel
    let photo: ProgressPhotoDto
    @State private var image: UIImage? = nil

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                ProgressView().controlSize(.small)
            }
        }
        .task {
            if let data = await viewModel.progress.photoData(photo, isSignedIn: viewModel.isSignedIn) {
                image = UIImage(data: data)
            }
        }
    }
}

/// New or existing check-in: date, pose photos, weight and note.
public struct CheckInEditorView: View {
    @Bindable var viewModel: LukiAppViewModel
    let existing: ProgressCheckInDto
    @Environment(\.lukiLocale) private var tr
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @ScaledMetric(relativeTo: .body) private var stepperMinWidth: CGFloat = 120

    @State private var takenAt: Date
    @State private var note: String
    @State private var weightText: String
    @State private var photoPick: PhotosPickerItem? = nil
    @State private var pickPose: ProgressPose = .FRONT
    @State private var showCamera = false

    public init(viewModel: LukiAppViewModel, existing: ProgressCheckInDto) {
        self.viewModel = viewModel
        self.existing = existing
        _takenAt = State(initialValue: LukiDate.parseISO(existing.takenAt) ?? Date())
        _note = State(initialValue: existing.note ?? "")
        let latest = viewModel.bodyWeight.entry(clientEntryId: existing.bodyWeightClientEntryId ?? "")
            ?? viewModel.bodyWeight.latest
        let kg = latest?.weightKg
        _weightText = State(initialValue: kg.map {
            LukiFormat.weight(viewModel.store.preferences.weightUnit == .LBS ? $0 * ProgressionEngine.kgToLbs : $0)
        } ?? "")
    }

    private var unitText: String { LukiFormat.unitLabel(viewModel.store.preferences.weightUnit) }
    private var checkIn: ProgressCheckInDto {
        viewModel.progress.checkIn(clientEntryId: existing.clientEntryId) ?? existing
    }

    public var body: some View {
        NavigationStack {
            Form {
                DatePicker(tr("Date"), selection: $takenAt, displayedComponents: .date)
                Section {
                    Picker(tr("Pose"), selection: $pickPose) {
                        Text(tr("Front")).tag(ProgressPose.FRONT)
                        Text(tr("Side")).tag(ProgressPose.SIDE)
                        Text(tr("Back")).tag(ProgressPose.BACK)
                    }
                    .pickerStyle(.segmented)
                    .listRowInsets(.init())
                    let photo = checkIn.photos.first { $0.pose == pickPose }
                    if let photo {
                        ProgressThumbView(viewModel: viewModel, photo: photo)
                            .aspectRatio(2.0 / 3.0, contentMode: .fit)
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                            .swipeActions {
                                Button(role: .destructive) {
                                    Task { await viewModel.progress.removePhoto(photo, from: checkIn.clientEntryId, isSignedIn: viewModel.isSignedIn) }
                                } label: { Label(tr("Delete"), systemImage: "trash") }
                            }
                        Button(role: .destructive) {
                            Task { await viewModel.progress.removePhoto(photo, from: checkIn.clientEntryId, isSignedIn: viewModel.isSignedIn) }
                        } label: { Label(tr("Remove photo"), systemImage: "trash") }
                    }
                    HStack(spacing: 10) {
                        PhotosPicker(selection: $photoPick, matching: .images) {
                            Label(photo == nil ? tr("Add photo") : tr("Replace photo"), systemImage: "photo")
                        }
                        .buttonStyle(.bordered)
                        .accessibilityIdentifier("ios.progress.addPhoto.\(pickPose.rawValue)")
                        #if os(iOS)
                        Button { showCamera = true } label: { Label(tr("Camera"), systemImage: "camera") }
                            .buttonStyle(.bordered)
                        #endif
                    }
                }
                Section {
                    LukiValueStepper(
                        value: weightText.isEmpty ? "–" : weightText,
                        unit: unitText,
                        minusLabel: tr("Decrease weight by %@, check-in", LukiFormat.weight(LukiFormat.weightStep(viewModel.store.preferences.weightUnit))),
                        plusLabel: tr("Increase weight by %@, check-in", LukiFormat.weight(LukiFormat.weightStep(viewModel.store.preferences.weightUnit))),
                        editLabel: tr("Weight"),
                        keyboard: .decimal,
                        onMinus: { stepWeight(by: -1) },
                        onPlus: { stepWeight(by: 1) },
                        onSubmit: { text in
                            if let v = LukiFormat.parseDecimal(text) { weightText = LukiFormat.weight(max(0, v)) }
                        }
                    )
                    .frame(minWidth: stepperMinWidth)
                } header: { Text(tr("Weight")) }
                Section {
                    TextField(tr("Note (optional)"), text: $note, axis: .vertical)
                        .lineLimit(2...4)
                }
            }
            .navigationTitle(tr("Check-in"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(tr("Cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(tr("Save")) { Task { await save() } }
                        .accessibilityIdentifier("ios.progress.saveCheckIn")
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button(tr("Done")) {
                        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
                    }
                    .fontWeight(.semibold)
                }
            }
            .onChange(of: photoPick) { _, item in
                guard let item else { return }
                Task {
                    if let data = try? await item.loadTransferable(type: Data.self) {
                        _ = await viewModel.progress.addPhoto(to: checkIn.clientEntryId, pose: pickPose, data: data, isSignedIn: viewModel.isSignedIn)
                    }
                    photoPick = nil
                }
            }
            #if os(iOS)
            .fullScreenCover(isPresented: $showCamera) {
                CameraPicker { image in
                    if let data = image.jpegData(compressionQuality: 0.9) {
                        Task { _ = await viewModel.progress.addPhoto(to: checkIn.clientEntryId, pose: pickPose, data: data, isSignedIn: viewModel.isSignedIn) }
                    }
                }
            }
            #endif
        }
    }

    private func stepWeight(by direction: Double) {
        let step = LukiFormat.weightStep(viewModel.store.preferences.weightUnit)
        let current = LukiFormat.parseDecimal(weightText) ?? 0
        weightText = LukiFormat.weight(max(0, current + direction * step))
    }

    private func save() async {
        var draft = checkIn
        draft.takenAt = ISO8601DateFormatter().string(from: takenAt)
        draft.note = note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : note
        if let kg = parsedWeightKg() {
            let existingWeightId = draft.bodyWeightClientEntryId
            let weightId = existingWeightId ?? "bw-\(UUID().uuidString.lowercased())"
            let iso = ISO8601DateFormatter().string(from: takenAt)
            _ = await viewModel.bodyWeight.save(
                UpsertBodyWeightEntryDto(clientEntryId: weightId, measuredAt: iso, weightKg: kg),
                isSignedIn: viewModel.isSignedIn
            )
            draft.bodyWeightClientEntryId = weightId
        } else {
            draft.bodyWeightClientEntryId = nil
        }
        await viewModel.progress.save(draft, isSignedIn: viewModel.isSignedIn)
        dismiss()
    }

    private func parsedWeightKg() -> Double? {
        guard let v = LukiFormat.parseDecimal(weightText), v > 0 else { return nil }
        return viewModel.store.preferences.weightUnit == .LBS ? v / ProgressionEngine.kgToLbs : v
    }
}


/// "How to take the right photo" — the short tips sheet.
public struct ProgressGuideSheet: View {
    @Environment(\.lukiLocale) private var tr
    @Environment(\.dismiss) private var dismiss

    private var tips: [String] {
        [
            tr("Same spot and light every time"),
            tr("Same time of day — morning, before eating"),
            tr("Phone at chest height or on a timer"),
            tr("Relaxed stance, fitted clothing"),
            tr("Take all 3 poses: front, side, back"),
        ]
    }

    public init() {}

    public var body: some View {
        NavigationStack {
            List {
                ForEach(tips, id: \.self) { tip in
                    Label(tip, systemImage: "checkmark.circle.fill")
                        .font(.subheadline)
                        .foregroundStyle(.primary)
                }
            }
            .navigationTitle(tr("How to take the right photo"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(tr("Done")) { dismiss() }
                }
            }
        }
        .presentationDetents([.medium])
        .accessibilityIdentifier("ios.progress.guideSheet")
    }
}

/// Pick a second check-in and a pose, then compare them side-by-side or with a drag slider.
public struct ProgressCompareView: View {
    let viewModel: LukiAppViewModel
    let first: ProgressCheckInDto
    @Environment(\.lukiLocale) private var tr
    @Environment(\.dismiss) private var dismiss

    @State private var pose: ProgressPose = .FRONT
    @State private var secondId: String? = nil
    @State private var overlay = false
    @State private var slider: CGFloat = 0.5

    public init(viewModel: LukiAppViewModel, first: ProgressCheckInDto) {
        self.viewModel = viewModel
        self.first = first
    }

    public var body: some View {
        NavigationStack {
            Form {
                Picker(tr("Pose"), selection: $pose) {
                    Text(tr("Front")).tag(ProgressPose.FRONT)
                    Text(tr("Side")).tag(ProgressPose.SIDE)
                    Text(tr("Back")).tag(ProgressPose.BACK)
                }
                .pickerStyle(.segmented)
                Picker(tr("Compare with"), selection: $secondId) {
                    Text(tr("Choose a check-in")).tag(String?.none)
                    ForEach(viewModel.progress.checkIns.filter { $0.clientEntryId != first.clientEntryId }) { c in
                        Text(LukiDate.parseISO(c.takenAt).map {
                            $0.formatted(.dateTime.day().month(.abbreviated).year().locale(Locale(identifier: tr.rawValue)))
                        } ?? c.takenAt).tag(String?.some(c.clientEntryId))
                    }
                }
                if let second = viewModel.progress.checkIns.first(where: { $0.clientEntryId == secondId }) {
                    let a = first.photos.first { $0.pose == pose }
                    let b = second.photos.first { $0.pose == pose }
                    Toggle(tr("Slider compare"), isOn: $overlay)
                    if overlay {
                        ZStack(alignment: .leading) {
                            compareImage(b)
                            compareImage(a)
                                .mask(
                                    GeometryReader { geo in
                                        Rectangle().frame(width: geo.size.width * slider)
                                    }
                                )
                        }
                        .aspectRatio(2.0 / 3.0, contentMode: .fit)
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        Slider(value: $slider, in: 0...1)
                    } else {
                        HStack(spacing: 8) {
                            compareImage(a)
                            compareImage(b)
                        }
                    }
                }
            }
            .navigationTitle(tr("Compare"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(tr("Done")) { dismiss() }
                }
            }
        }
        .accessibilityIdentifier("ios.progress.compareSheet")
    }

    private func compareImage(_ photo: ProgressPhotoDto?) -> some View {
        Group {
            if let photo {
                ProgressThumbView(viewModel: viewModel, photo: photo)
                    .aspectRatio(2.0 / 3.0, contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            } else {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(LukiColors.fill)
                    .aspectRatio(2.0 / 3.0, contentMode: .fit)
                    .overlay { Image(systemName: "camera").foregroundStyle(.secondary) }
            }
        }
    }
}
