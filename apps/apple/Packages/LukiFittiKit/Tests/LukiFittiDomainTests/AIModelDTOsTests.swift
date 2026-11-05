import XCTest
import LukiFittiModels
import LukiFittiDesign

final class AIModelDTOsTests: XCTestCase {
    private let json = Data(#"""
    {"catalogAvailable":true,"keySource":"ADMIN","skills":[
      {"skill":"workout-builder","defaultModel":"x/default","selectedModel":"a/one","effectiveModel":"a/one",
       "effectiveModelInfo":{"id":"a/one","name":"A One","contextLength":128000,
         "pricing":{"promptPerMTokUsd":2.5,"completionPerMTokUsd":10,"imageUsd":null},
         "supportsTools":true,"supportsImages":false,"estimatedCostPerRunUsd":0.012},
       "restricted":true,"models":[
         {"id":"a/one","name":"A One","contextLength":null,"pricing":{"promptPerMTokUsd":2.5,"completionPerMTokUsd":10,"imageUsd":null},
          "supportsTools":true,"supportsImages":false,"estimatedCostPerRunUsd":null},
         {"id":"google/gemini-y","name":"Google: Gemini Y","contextLength":null,"pricing":{"promptPerMTokUsd":0.1,"completionPerMTokUsd":0.4,"imageUsd":null},
          "supportsTools":true,"supportsImages":true,"estimatedCostPerRunUsd":0.001}]},
      {"skill":"meal-analyzer","defaultModel":"x/meal","selectedModel":"stale/model","effectiveModel":"x/meal",
       "effectiveModelInfo":null,"restricted":true,"models":[]},
      {"skill":"meal-text-analyzer","defaultModel":"x/meal","selectedModel":null,"effectiveModel":"x/meal",
       "effectiveModelInfo":null,"restricted":true,"models":[]}
    ]}
    """#.utf8)

    func testDecodesModelsAndActiveChoice() throws {
        let dto = try JSONDecoder().decode(AiModelsDto.self, from: json)
        XCTAssertEqual(dto.keySource, .ADMIN)
        XCTAssertEqual(dto.skill(.workoutBuilder)?.activeChoice, "a/one")
        XCTAssertNil(dto.skill(.mealAnalyzer)?.activeChoice, "stale choice is not active")
        XCTAssertEqual(dto.skill(.workoutBuilder)?.effectiveModelInfo?.pricing.completionPerMTokUsd, 10)
    }

    func testNextChoicesKeepsOthersAndClearsForDefault() throws {
        let dto = try JSONDecoder().decode(AiModelsDto.self, from: json)
        XCTAssertEqual(
            dto.nextChoices(.mealTextAnalyzer, modelId: "b/two"),
            ["workout-builder": "a/one", "meal-analyzer": "stale/model", "meal-text-analyzer": "b/two"]
        )
        XCTAssertEqual(dto.nextChoices(.workoutBuilder, modelId: nil), ["meal-analyzer": "stale/model"])
    }

    func testSearchMatchesIdOrName() throws {
        let models = try XCTUnwrap(JSONDecoder().decode(AiModelsDto.self, from: json).skill(.workoutBuilder)?.models)
        XCTAssertEqual(models.filtered(by: "GEMINI").map(\.id), ["google/gemini-y"])
        XCTAssertEqual(models.filtered(by: "a/").map(\.id), ["a/one"])
        XCTAssertEqual(models.filtered(by: "  ").count, 2)
    }

    func testPromptURLsPointAtMain() {
        for skill in AiSkillName.allCases {
            XCTAssertNotNil(AIPromptFiles.paths[skill], "missing prompt path for \(skill)")
        }
        XCTAssertEqual(
            AIPromptFiles.rawURL(.workoutBuilder)?.absoluteString,
            "https://raw.githubusercontent.com/tuke307/luki-fitti/main/apps/api/src/modules/ai/prompts/workout-builder.md"
        )
        XCTAssertEqual(
            AIPromptFiles.githubURL(.mealTextAnalyzer)?.absoluteString,
            "https://github.com/tuke307/luki-fitti/blob/main/apps/api/src/modules/ai/prompts/meal-text-analyzer.md"
        )
    }

    func testPreferencesCarryModelChoices() throws {
        var dto = UpdatePreferencesDto()
        dto.aiModels = ["workout-builder": "a/one"]
        let body = try XCTUnwrap(String(data: JSONEncoder().encode(dto), encoding: .utf8))
        XCTAssertTrue(body.contains(#""aiModels":{"workout-builder":"a\/one"}"#), body)

        let prefs = try JSONDecoder().decode(
            UserPreferencesDto.self,
            from: Data(#"{"aiModels":{"meal-analyzer":"b/two"}}"#.utf8)
        )
        XCTAssertEqual(prefs.aiModels, ["meal-analyzer": "b/two"])
        let malformed = try JSONDecoder().decode(UserPreferencesDto.self, from: Data(#"{"aiModels":42}"#.utf8))
        XCTAssertNil(malformed.aiModels)
    }

    func testCostLineIncludesModel() {
        let usage = AiRunUsageDto(promptTokens: 100, completionTokens: 20, costUsd: 0.002)
        XCTAssertTrue(AICostFormat.line(usage, model: "a/one", .en).hasSuffix(" · Model: a/one"))
        XCTAssertEqual(AICostFormat.line(usage, model: nil, .en), AICostFormat.line(usage, .en))
        XCTAssertEqual(
            AICostFormat.pricing(AiModelPricingDto(promptPerMTokUsd: 2.5, completionPerMTokUsd: 10), .en),
            "$2.50 per 1M input tokens · $10.00 per 1M output tokens"
        )
    }
}
