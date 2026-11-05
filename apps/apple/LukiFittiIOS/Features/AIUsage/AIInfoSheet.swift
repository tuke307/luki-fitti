import SwiftUI
import LukiFittiModels
import LukiFittiDesign
import LukiFittiAPI

/// "?" button next to an AI action; opens `AIInfoSheet`.
struct AIInfoButton: View {
    let skill: AiSkillName
    let api: APIClient

    @Environment(\.lukiLocale) private var tr
    @State private var showsInfo = false

    var body: some View {
        Button {
            showsInfo = true
        } label: {
            Image(systemName: "questionmark.circle")
                .font(.title3)
                .frame(minWidth: 44, minHeight: 44)
        }
        .buttonStyle(.borderless)
        .foregroundStyle(.secondary)
        .accessibilityLabel(tr("How this works"))
        .accessibilityIdentifier("ios.aiInfo.\(skill.rawValue)")
        .sheet(isPresented: $showsInfo) {
            AIInfoSheet(skill: skill, api: api)
        }
    }
}

/// Model and price, what is sent, and the system prompt as plain text from GitHub `main`.
struct AIInfoSheet: View {
    let skill: AiSkillName
    let api: APIClient

    @Environment(\.dismiss) private var dismiss
    @Environment(\.lukiLocale) private var tr
    @State private var models: AiSkillModelsDto?
    @State private var modelsFailed = false
    @State private var prompt: String?
    @State private var promptFailed = false

    private static let maxPromptChars = 50_000

    var body: some View {
        NavigationStack {
            List {
                Section(tr("Model")) { modelSection }
                Section(tr("What gets sent")) {
                    Text(Self.dataSent(skill, tr))
                    Text(tr("Your name, email and account id are never sent. OpenRouter forwards the request to the model provider."))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                Section {
                    promptSection
                } header: {
                    Text(tr("Instructions for the model"))
                } footer: {
                    if let url = AIPromptFiles.githubURL(skill) {
                        Link(destination: url) {
                            Label(tr("View on GitHub"), systemImage: "arrow.up.right.square")
                        }
                        .font(.footnote)
                        .frame(minHeight: 44)
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle(tr("How this works"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(tr("Done")) { dismiss() }
                }
            }
            .task { await loadModels() }
            .task { await loadPrompt() }
        }
    }

    @ViewBuilder
    private var modelSection: some View {
        if let models {
            let info = models.effectiveModelInfo
            VStack(alignment: .leading, spacing: 4) {
                Text(info?.name ?? models.effectiveModel).font(.body.weight(.semibold))
                Text(models.activeChoice != nil ? tr("Your choice") : tr("Default"))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                if let info {
                    Text(info.id).font(.caption).foregroundStyle(.secondary).textSelection(.enabled)
                    Text(AICostFormat.pricing(info.pricing, tr))
                        .font(.footnote)
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                }
            }
            .accessibilityElement(children: .combine)
            Text(tr("You can change the model under Profile → AI models."))
                .font(.footnote)
                .foregroundStyle(.secondary)
        } else if modelsFailed {
            Text(tr("Model details are unavailable right now.")).foregroundStyle(.secondary)
        } else {
            ProgressView().accessibilityLabel(tr("Loading model…"))
        }
    }

    @ViewBuilder
    private var promptSection: some View {
        if let prompt {
            Text(prompt)
                .font(.system(.footnote, design: .monospaced))
                .textSelection(.enabled)
                .accessibilityIdentifier("ios.aiInfo.prompt")
        } else if promptFailed {
            Text(tr("Couldn’t load the instructions. You can read them on GitHub."))
                .foregroundStyle(.secondary)
        } else {
            ProgressView().accessibilityLabel(tr("Loading instructions…"))
        }
    }

    static func dataSent(_ skill: AiSkillName, _ tr: SupportedLocale) -> String {
        switch skill {
        case .workoutBuilder:
            return tr("Your request text and, through tools the model may call, your training data: profile and goals, exercise feedback, weak points, recent workouts and exercise catalog searches.")
        case .mealAnalyzer:
            return tr("The photos and your hint. Nothing else about you.")
        case .mealTextAnalyzer:
            return tr("Your meal description and the selected meal. Nothing else about you.")
        }
    }

    private func loadModels() async {
        do {
            models = try await api.fetchAiModels().skill(skill)
            modelsFailed = models == nil
        } catch is CancellationError {
        } catch {
            modelsFailed = true
        }
    }

    private func loadPrompt() async {
        guard let url = AIPromptFiles.rawURL(skill) else { promptFailed = true; return }
        var request = URLRequest(url: url, cachePolicy: .reloadRevalidatingCacheData, timeoutInterval: 15)
        request.httpShouldHandleCookies = false
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard (response as? HTTPURLResponse)?.statusCode == 200,
                  let text = String(data: data, encoding: .utf8) else {
                promptFailed = true
                return
            }
            prompt = String(text.prefix(Self.maxPromptChars))
        } catch is CancellationError {
        } catch {
            promptFailed = true
        }
    }
}
