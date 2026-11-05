import Foundation

// MARK: - AI transparency: system prompts on GitHub + per-user model choice
// Mirrors packages/common/src/schemas/ai-models.schemas.ts.

/// AI skills (same raw values as the API's `AiSkillName`).
public enum AiSkillName: String, Codable, Sendable, CaseIterable, Hashable, Identifiable {
    case workoutBuilder = "workout-builder"
    case mealAnalyzer = "meal-analyzer"
    case mealTextAnalyzer = "meal-text-analyzer"

    public var id: String { rawValue }
}

public enum AIPromptFiles {
    public static let githubRawBase = "https://raw.githubusercontent.com/tuke307/luki-fitti/main"
    public static let githubBlobBase = "https://github.com/tuke307/luki-fitti/blob/main"

    /// Repo-relative path of each skill's system prompt (the API reads the same files).
    public static let paths: [AiSkillName: String] = [
        .workoutBuilder: "apps/api/src/modules/ai/prompts/workout-builder.md",
        .mealAnalyzer: "apps/api/src/modules/ai/prompts/meal-analyzer.md",
        .mealTextAnalyzer: "apps/api/src/modules/ai/prompts/meal-text-analyzer.md",
    ]

    public static func rawURL(_ skill: AiSkillName) -> URL? {
        paths[skill].flatMap { URL(string: "\(githubRawBase)/\($0)") }
    }

    public static func githubURL(_ skill: AiSkillName) -> URL? {
        paths[skill].flatMap { URL(string: "\(githubBlobBase)/\($0)") }
    }
}

public struct AiModelPricingDto: Codable, Sendable, Equatable, Hashable {
    /// USD per 1M input tokens.
    public var promptPerMTokUsd: Double
    /// USD per 1M output tokens.
    public var completionPerMTokUsd: Double
    public var imageUsd: Double?

    public init(promptPerMTokUsd: Double, completionPerMTokUsd: Double, imageUsd: Double? = nil) {
        self.promptPerMTokUsd = promptPerMTokUsd
        self.completionPerMTokUsd = completionPerMTokUsd
        self.imageUsd = imageUsd
    }
}

public struct AiModelOptionDto: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var id: String
    public var name: String
    public var contextLength: Int?
    public var pricing: AiModelPricingDto
    public var supportsTools: Bool
    public var supportsImages: Bool
    /// Average tokens of recent runs × this model's prices; nil without run history.
    public var estimatedCostPerRunUsd: Double?

    public init(
        id: String,
        name: String,
        contextLength: Int? = nil,
        pricing: AiModelPricingDto,
        supportsTools: Bool = true,
        supportsImages: Bool = false,
        estimatedCostPerRunUsd: Double? = nil
    ) {
        self.id = id
        self.name = name
        self.contextLength = contextLength
        self.pricing = pricing
        self.supportsTools = supportsTools
        self.supportsImages = supportsImages
        self.estimatedCostPerRunUsd = estimatedCostPerRunUsd
    }
}

public struct AiSkillModelsDto: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var skill: AiSkillName
    public var defaultModel: String
    /// Saved choice (may be stale; then the default is used).
    public var selectedModel: String?
    /// Model the next run will use.
    public var effectiveModel: String
    public var effectiveModelInfo: AiModelOptionDto?
    /// True when the user can only pick from the admin allowlist.
    public var restricted: Bool
    /// Eligible models, sorted by estimated cost, then name.
    public var models: [AiModelOptionDto]

    public var id: String { skill.rawValue }

    /// The saved choice when it is the model in use (nil = default).
    public var activeChoice: String? {
        selectedModel.flatMap { $0 == effectiveModel ? $0 : nil }
    }

    public init(
        skill: AiSkillName,
        defaultModel: String,
        selectedModel: String? = nil,
        effectiveModel: String,
        effectiveModelInfo: AiModelOptionDto? = nil,
        restricted: Bool = false,
        models: [AiModelOptionDto] = []
    ) {
        self.skill = skill
        self.defaultModel = defaultModel
        self.selectedModel = selectedModel
        self.effectiveModel = effectiveModel
        self.effectiveModelInfo = effectiveModelInfo
        self.restricted = restricted
        self.models = models
    }
}

public struct AiModelsDto: Codable, Sendable, Equatable, Hashable {
    public var catalogAvailable: Bool
    public var keySource: AiKeySlot?
    public var skills: [AiSkillModelsDto]

    public init(catalogAvailable: Bool, keySource: AiKeySlot?, skills: [AiSkillModelsDto]) {
        self.catalogAvailable = catalogAvailable
        self.keySource = keySource
        self.skills = skills
    }

    public func skill(_ name: AiSkillName) -> AiSkillModelsDto? {
        skills.first { $0.skill == name }
    }

    /// Choices map to save after picking `modelId` (nil = use the default) for `skill`.
    public func nextChoices(_ skill: AiSkillName, modelId: String?) -> [String: String] {
        var next: [String: String] = [:]
        for s in skills { if let selected = s.selectedModel { next[s.skill.rawValue] = selected } }
        next[skill.rawValue] = modelId
        return next
    }
}

public extension Array where Element == AiModelOptionDto {
    /// Case-insensitive search over model id and name.
    func filtered(by query: String) -> [AiModelOptionDto] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return self }
        return filter { $0.id.contains(q) || $0.name.lowercased().contains(q) }
    }
}
