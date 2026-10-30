import XCTest
import LukiFittiModels
import LukiFittiDesign

final class AICostFormatTests: XCTestCase {
    func testFormatsReportedUsdWithUpToFourDigits() {
        XCTAssertEqual(AICostFormat.usd(0.0041, locale: .en), "$0.0041")
        XCTAssertEqual(AICostFormat.usd(1.5, locale: .en), "$1.50")
        XCTAssertEqual(AICostFormat.usd(0.00002, locale: .en), "< $0.0001")
        XCTAssertEqual(AICostFormat.usd(nil, .de), "Kosten nicht verfügbar")
    }

    func testLineCombinesTokensAndCost() {
        let usage = AiRunUsageDto(promptTokens: 3000, completionTokens: 120, costUsd: 0.0041)
        XCTAssertEqual(AICostFormat.line(usage, .en), "3,120 tokens · $0.0041")
        let unknown = AiRunUsageDto(promptTokens: 10, completionTokens: 5, costUsd: nil)
        XCTAssertEqual(AICostFormat.line(unknown, .en), "15 tokens · Cost not available")
    }

    func testDecodesUsageAndToleratesOlderResponses() throws {
        let base = """
        {"runId":"r","name":"n","summary":"s","focusMuscleGroups":[],"estimatedDurationMinutes":30,
         "exercises":[],"notes":[],"droppedExerciseIds":[]
        """
        let old = try JSONDecoder().decode(WorkoutBuilderResponseDto.self, from: Data((base + "}").utf8))
        XCTAssertNil(old.usage)
        let withUsage = try JSONDecoder().decode(
            WorkoutBuilderResponseDto.self,
            from: Data((base + #","usage":{"promptTokens":1,"completionTokens":2,"costUsd":null}}"#).utf8)
        )
        XCTAssertEqual(withUsage.usage, AiRunUsageDto(promptTokens: 1, completionTokens: 2, costUsd: nil))

        let mine = """
        {"days":7,"totalRuns":1,"failedRuns":0,"promptTokens":100,"completionTokens":20,"costUsd":0.0012,
         "unknownCostRuns":0,"bySkill":[{"skill":"workout-builder","runs":1,"costUsd":0.0012}],
         "byDay":[{"date":"2026-01-01","runs":1,"costUsd":0.0012}],
         "recent":[{"id":"a","skill":"workout-builder","status":"SUCCESS","createdAt":"2026-01-01T10:00:00.000Z",
                    "promptTokens":100,"completionTokens":20,"costUsd":null,"durationMs":900}],
         "today":{"used":1,"limit":30}}
        """
        let usage = try JSONDecoder().decode(MyAiUsageDto.self, from: Data(mine.utf8))
        XCTAssertEqual(usage.recent.first?.usage.totalTokens, 120)
        XCTAssertNil(usage.recent.first?.costUsd)
        XCTAssertEqual(usage.today.limit, 30)
    }
}
