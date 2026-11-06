import SwiftUI
import LukiFittiModels
import LukiFittiDesign
import LukiFittiAPI

/// Per-feature OpenRouter model choice with prices and an estimated cost per request.
struct AIModelsSettingsView: View {
    @Bindable var viewModel: LukiAppViewModel
    @Environment(\.lukiLocale) private var tr
    @State private var models: AiModelsDto?
    @State private var loadFailed = false
    @State private var saveError: String?

    var body: some View {
        List {
            if let models {
                content(models)
            } else if loadFailed {
                ContentUnavailableView {
                    Label(tr("Couldn’t load the models."), systemImage: "exclamationmark.triangle")
                } actions: {
                    Button(tr("Try again")) { Task { await load() } }
                }
            } else {
                HStack {
                    Spacer()
                    ProgressView().accessibilityLabel(tr("Loading models…"))
                    Spacer()
                }
                .listRowBackground(Color.clear)
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(tr("AI models"))
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
    }

    @ViewBuilder
    private func content(_ models: AiModelsDto) -> some View {
        Section {
            ForEach(models.skills) { skill in
                NavigationLink {
                    AIModelPickerView(skill: skill) { modelId in
                        await save(models, skill: skill.skill, modelId: modelId)
                    }
                } label: {
                    SettingsRow(
                        Self.skillTitle(skill.skill, tr),
                        systemImage: Self.skillIcon(skill.skill),
                        tint: LukiColors.setDropset,
                        subtitle: choiceLabel(skill)
                    )
                }
                .accessibilityIdentifier("ios.aiModels.\(skill.skill.rawValue)")
            }
        } footer: {
            Text(tr("Choose the OpenRouter model for each AI feature. Prices are per 1M tokens as listed by OpenRouter; the estimate is based on your recent requests."))
        }
        if models.keySource == .ADMIN {
            Section { Text(tr("Your AI key is provided by the admin, so you can choose from an approved list.")) }
        } else if models.keySource == nil {
            Section { Text(tr("Add your OpenRouter API key to use AI features and choose models.")) }
        }
        if !models.catalogAvailable {
            Section {
                Text(tr("The model list from OpenRouter is unavailable right now. The default models are used."))
                    .foregroundStyle(LukiColors.warning)
            }
        }
        if let saveError {
            Section { Text(saveError).foregroundStyle(LukiColors.destructive) }
        }
    }

    private func choiceLabel(_ skill: AiSkillModelsDto) -> String {
        if let selected = skill.selectedModel, skill.activeChoice == nil {
            return tr("%@ isn’t available anymore, so the default is used.", selected)
        }
        if let choice = skill.activeChoice { return skill.effectiveModelInfo?.name ?? choice }
        return tr("Default (%@)", skill.effectiveModelInfo?.name ?? skill.defaultModel)
    }

    static func skillTitle(_ skill: AiSkillName, _ tr: SupportedLocale) -> String {
        switch skill {
        case .workoutBuilder: return tr("Workout planner")
        case .mealAnalyzer: return tr("Meal photo")
        case .mealTextAnalyzer: return tr("Meal description")
        }
    }

    static func skillIcon(_ skill: AiSkillName) -> String {
        switch skill {
        case .workoutBuilder: return "dumbbell.fill"
        case .mealAnalyzer: return "camera.fill"
        case .mealTextAnalyzer: return "text.bubble.fill"
        }
    }

    private func load() async {
        guard viewModel.isSignedIn else { loadFailed = true; return }
        do {
            models = try await viewModel.store.apiClient.fetchAiModels()
            loadFailed = false
        } catch is CancellationError {
        } catch {
            loadFailed = true
        }
    }

    /// Saves via the preferences PATCH; returns whether it worked.
    private func save(_ current: AiModelsDto, skill: AiSkillName, modelId: String?) async -> Bool {
        var dto = UpdatePreferencesDto()
        dto.aiModels = current.nextChoices(skill, modelId: modelId)
        do {
            let updated = try await viewModel.store.apiClient.updatePreferences(dto)
            // Keep the local preferences (they may be ahead of the server); only take the choices.
            var prefs = viewModel.store.preferences
            prefs.aiModels = updated.preferences?.aiModels
            viewModel.store.savePreferences(prefs)
            if var user = viewModel.store.currentUser {
                user.preferences = prefs
                viewModel.store.saveAuthenticatedUser(user)
            }
            saveError = nil
            await load()
            return true
        } catch {
            saveError = tr("Couldn’t save the model. Try again.")
            return false
        }
    }
}

/// Searchable list of eligible models for one skill, plus "Use default".
struct AIModelPickerView: View {
    let skill: AiSkillModelsDto
    let onSelect: (String?) async -> Bool

    @Environment(\.dismiss) private var dismiss
    @Environment(\.lukiLocale) private var tr
    @State private var query = ""
    @State private var saving = false

    var body: some View {
        let filtered = skill.models.filtered(by: query)
        List {
            Section {
                row(title: tr("Use default"), detail: skill.defaultModel, selected: skill.activeChoice == nil) {
                    await pick(nil)
                }
            }
            Section {
                ForEach(filtered) { model in
                    row(
                        title: model.name,
                        detail: model.id,
                        pricing: pricingLine(model),
                        selected: skill.activeChoice == model.id
                    ) { await pick(model.id) }
                }
                if skill.models.isEmpty {
                    Text(tr("There are no models to choose from yet.")).foregroundStyle(.secondary)
                } else if filtered.isEmpty {
                    Text(tr("No models match your search.")).foregroundStyle(.secondary)
                }
            } footer: {
                if skill.restricted {
                    Text(tr("Your AI key is provided by the admin, so you can choose from an approved list."))
                }
            }
        }
        .listStyle(.insetGrouped)
        .searchable(text: $query, prompt: tr("Search models"))
        .disabled(saving)
        .navigationTitle(AIModelsSettingsView.skillTitle(skill.skill, tr))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if saving { ToolbarItem(placement: .confirmationAction) { ProgressView() } }
        }
    }

    private func pricingLine(_ model: AiModelOptionDto) -> String {
        let price = tr(
            "%@ in · %@ out per 1M tokens",
            AICostFormat.usd(model.pricing.promptPerMTokUsd, locale: tr),
            AICostFormat.usd(model.pricing.completionPerMTokUsd, locale: tr)
        )
        let estimate = model.estimatedCostPerRunUsd.map {
            tr("≈ %@ per request", AICostFormat.usd($0, locale: tr))
        } ?? tr("No estimate yet")
        return "\(price) · \(estimate)"
    }

    private func row(
        title: String,
        detail: String,
        pricing: String? = nil,
        selected: Bool,
        action: @escaping () async -> Void
    ) -> some View {
        Button {
            Task { await action() }
        } label: {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).foregroundStyle(.primary)
                    Text(detail).font(.caption).foregroundStyle(.secondary)
                    if let pricing {
                        Text(pricing).font(.footnote).monospacedDigit().foregroundStyle(.secondary)
                    }
                }
                Spacer()
                if selected {
                    Image(systemName: "checkmark")
                        .foregroundStyle(LukiColors.accent)
                        .accessibilityLabel(tr("Selected"))
                }
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func pick(_ modelId: String?) async {
        saving = true
        defer { saving = false }
        if await onSelect(modelId) { dismiss() }
    }
}
