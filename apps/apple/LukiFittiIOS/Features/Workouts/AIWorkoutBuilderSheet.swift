import SwiftUI
import LukiFittiModels
import LukiFittiDesign
import LukiFittiAPI

/// Describe a workout; the AI planner proposes one from the catalog, history and weak points.
struct AIWorkoutBuilderSheet: View {
    @Bindable var viewModel: LukiAppViewModel
    let onSaved: (WorkoutTemplateDto) -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.lukiLocale) private var tr
    @State private var prompt = ""
    @State private var duration: Int? = nil
    @State private var result: WorkoutBuilderResponseDto?
    @State private var busy = false
    @State private var error: String?

    private var examples: [String] {
        [
            tr("Chest workout, upper chest is my weak point"),
            tr("45 minutes legs, no barbell"),
            tr("Full body with dumbbells only"),
        ]
    }

    var body: some View {
        NavigationStack {
            Form {
                if let result {
                    proposal(result)
                } else {
                    Section {
                        Text(tr("Describe what you want. LukiFitti looks at your history, weak points and what didn’t work for you."))
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        TextField(tr("e.g. A chest workout. My upper chest is my weak point."), text: $prompt, axis: .vertical)
                            .lineLimit(3...6)
                            .disabled(busy)
                            .accessibilityIdentifier("ios.aiBuilder.prompt")
                        Picker(tr("Duration"), selection: $duration) {
                            Text(tr("Any")).tag(Int?.none)
                            ForEach([30, 45, 60, 75, 90], id: \.self) { Text(tr("%d min", $0)).tag(Int?.some($0)) }
                        }
                    }
                    Section(tr("Ideas")) {
                        ForEach(examples, id: \.self) { example in
                            Button(example) { prompt = example }
                                .disabled(busy)
                        }
                    }
                }
                if let error {
                    Section { Text(error).foregroundStyle(LukiColors.destructive) }
                }
            }
            .navigationTitle(result == nil ? tr("Plan a workout") : tr("Suggested workout"))
            .navigationBarTitleDisplayMode(.inline)
            .interactiveDismissDisabled(busy)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(tr("Cancel")) { dismiss() }.disabled(busy)
                }
                ToolbarItem(placement: .confirmationAction) {
                    if busy {
                        ProgressView().accessibilityLabel(tr("Planning your workout…"))
                    } else if let result {
                        Button(tr("Save")) { save(result) }
                    } else {
                        Button(tr("Plan workout")) { Task { await generate() } }
                            .disabled(prompt.trimmingCharacters(in: .whitespacesAndNewlines).count < 3)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func proposal(_ p: WorkoutBuilderResponseDto) -> some View {
        Section {
            VStack(alignment: .leading, spacing: 4) {
                Text(p.name).font(.title3.bold())
                Text(p.summary).font(.subheadline).foregroundStyle(.secondary)
                Text(tr("About %d min", p.estimatedDurationMinutes)).font(.footnote).foregroundStyle(.secondary)
            }
        }
        Section {
            ForEach(Array(p.exercises.enumerated()), id: \.element.exerciseId) { index, ex in
                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .firstTextBaseline) {
                        Text("\(index + 1). \(ex.name)").font(.subheadline.weight(.semibold))
                        Spacer()
                        Text("\(ex.workingSets) × \(ex.repsMin)–\(ex.repsMax)")
                            .font(.footnote)
                            .monospacedDigit()
                            .foregroundStyle(.secondary)
                    }
                    Text(restLine(ex)).font(.footnote).foregroundStyle(.secondary)
                    if !ex.rationale.isEmpty { Text(ex.rationale).font(.footnote) }
                    if !ex.alternatives.isEmpty {
                        Text(tr("Alternatives: %@", ex.alternatives.map(\.name).joined(separator: ", ")))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 2)
            }
        }
        if !p.notes.isEmpty || !p.droppedExerciseIds.isEmpty {
            Section {
                ForEach(p.notes, id: \.self) { Text($0).font(.footnote) }
                if !p.droppedExerciseIds.isEmpty {
                    Text(tr("Some suggestions weren’t in the library and were left out."))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
        }
        if let usage = p.usage {
            Section { AICostLabel(usage: usage) }
        }
        Section {
            Button(tr("Try again")) { result = nil }
        }
    }

    private func restLine(_ ex: WorkoutProposalExerciseDto) -> String {
        var parts = [tr("%d s rest", ex.restSeconds)]
        if ex.warmupSets > 0 { parts.append(tr("+%d warm-up", ex.warmupSets)) }
        if let replaced = ex.replaces { parts.append(tr("Instead of %@", replaced.name)) }
        return parts.joined(separator: " · ")
    }

    private func generate() async {
        busy = true
        error = nil
        defer { busy = false }
        do {
            result = try await viewModel.store.apiClient.buildWorkout(
                WorkoutBuilderRequestDto(prompt: prompt.trimmingCharacters(in: .whitespacesAndNewlines), durationMinutes: duration)
            )
        } catch {
            self.error = MealPhotoSheet.message(for: error, tr)
        }
    }

    /// Saves the proposal as a regular (unfiled) workout: warm-ups + working sets, no weights yet.
    private func save(_ p: WorkoutBuilderResponseDto) {
        let templateId = "tpl-\(UUID().uuidString.lowercased())"
        let exercises = p.exercises.enumerated().map { index, ex in
            WorkoutTemplateExerciseDto(
                templateId: templateId,
                exerciseId: ex.exerciseId,
                orderIndex: index,
                plannedSets: ex.workingSets,
                warmupSets: ex.warmupSets,
                targetRepsMin: ex.repsMin,
                targetRepsMax: ex.repsMax,
                weightUnit: viewModel.store.preferences.weightUnit,
                restSeconds: ex.restSeconds,
                notes: ex.rationale.isEmpty ? nil : String(ex.rationale.prefix(500)),
                alternativeExerciseIds: ex.alternatives.map(\.exerciseId),
                exercise: viewModel.store.catalog.first { $0.id == ex.exerciseId },
                sets: Array(repeating: TemplateSetDto(setType: .WARMUP, reps: ex.repsMax), count: ex.warmupSets)
                    + Array(repeating: TemplateSetDto(setType: .WORKING, reps: ex.repsMax), count: ex.workingSets)
            )
        }
        let template = WorkoutTemplateDto(
            id: templateId,
            userId: viewModel.store.currentUser?.id ?? "local-user",
            name: String(p.name.prefix(100)),
            description: p.summary.isEmpty ? nil : String(p.summary.prefix(500)),
            estimatedDurationMinutes: p.estimatedDurationMinutes,
            exercises: exercises
        )
        viewModel.store.saveWorkoutsOverview(
            folders: viewModel.store.folders,
            unfiledTemplates: viewModel.store.unfiledTemplates + [template]
        )
        onSaved(template)
        dismiss()
    }
}
