import XCTest
import LukiFittiModels
@testable import LukiFittiDomain
@testable import LukiFittiDesign

final class LibraryAndExportPortTests: XCTestCase {
    // MARK: - Workout log CSV (web `handleExportCsv`)

    func testWorkoutLogCSVMatchesWebColumnsAndEscaping() {
        let template = WorkoutTemplateDto(id: "tpl-1", name: "Push")
        let folder = WorkoutFolderDto(id: "f-1", name: "Upper, Lower", templates: [template])
        var session = WorkoutSessionDto(
            clientSessionId: "s-1",
            templateId: "tpl-1",
            sessionType: .STRENGTH,
            workoutNameSnapshot: "Push \"heavy\"",
            status: .COMPLETED,
            startedAt: "2026-11-02T08:00:00Z"
        )
        session.activeDurationSeconds = 3600
        session.notes = "Session note"
        session.exercises = [SessionExerciseDto(
            sessionId: "s-1",
            exerciseId: "ex-bench",
            exerciseNameSnapshot: "Bench Press",
            primaryMuscleSnapshot: .CHEST,
            orderIndex: 0,
            sets: [
                SessionSetDto(sessionExerciseId: "e", setNumber: 1, setType: .WORKING, weight: 82.5, weightUnit: .KG, reps: 8, rpe: 8, completed: true),
                SessionSetDto(sessionExerciseId: "e", setNumber: 2, setType: .WORKING, weight: 85, weightUnit: .KG, reps: 6, completed: true, notes: "line\nbreak"),
                SessionSetDto(sessionExerciseId: "e", setNumber: 3, setType: .WORKING, weight: 85, weightUnit: .KG, reps: 6, completed: false),
            ]
        )]

        let lines = WorkoutLogCSV.build(historySessions: [session], folders: [folder]).components(separatedBy: "\n")
        XCTAssertEqual(lines[0], "Date,Workout,Folder,SessionType,DurationSeconds,Exercise,PrimaryMuscle,SetNumber,SetType,Weight,Unit,Reps,DurationSec,RPE,Notes")
        XCTAssertEqual(lines[1], #"2026-11-02T08:00:00Z,"Push ""heavy""","Upper, Lower",STRENGTH,3600,Bench Press,CHEST,1,WORKING,82.5,KG,8,,8,Session note"#)
        // Set notes win over the session note; a newline is quoted (so the row spans two lines).
        XCTAssertEqual(lines[2], #"2026-11-02T08:00:00Z,"Push ""heavy""","Upper, Lower",STRENGTH,3600,Bench Press,CHEST,2,WORKING,85,KG,6,,,"line"#)
        XCTAssertEqual(lines[3], #"break""#)
        XCTAssertEqual(lines.count, 4, "Sets not done are left out")
        XCTAssertTrue(WorkoutLogCSV.fileName().hasPrefix("luki-fitti-workouts-"))
        XCTAssertTrue(WorkoutLogCSV.fileName().hasSuffix(".csv"))
    }

    // MARK: - History picks (API `rankHistoryPicks`)

    private func entry(_ names: [String], daysAgo: Double, now: Date, label: String? = nil, kcal: Double = 100) -> MealEntryDto {
        let eaten = LukiISODate.string(now.addingTimeInterval(-daysAgo * 86_400))
        return MealEntryDto(
            id: UUID().uuidString,
            clientEntryId: UUID().uuidString,
            eatenAt: eaten,
            mealType: .BREAKFAST,
            label: label,
            createdAt: eaten,
            items: names.enumerated().map { MealItemDto(orderIndex: $0.offset, name: $0.element, kcal: kcal) }
        )
    }

    func testLocalHistoryPicksRankLikeTheServer() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let entries = [
            entry(["Oats", "Banana"], daysAgo: 1, now: now),
            entry(["banana ", "OATS"], daysAgo: 2, now: now),
            entry(["Coffee"], daysAgo: 0.5, now: now),
            entry(["Pizza"], daysAgo: 30, now: now),
            entry(["Ancient"], daysAgo: 200, now: now),
        ]
        let picks = NutritionHistoryPicks.rank(entries, now: now)
        // Two-food meals become entry picks, grouped regardless of order/case.
        XCTAssertEqual(picks.entries.map(\.key), ["banana|oats"])
        XCTAssertEqual(picks.entries.first?.timesLogged, 2)
        XCTAssertEqual(picks.entries.first?.totals.kcal, 200)
        // Foods: frequent + recent first; outside the 180-day window is ignored.
        XCTAssertEqual(picks.items.map { NutritionHistoryPicks.normalize($0.item.name) }, ["oats", "banana", "coffee", "pizza"])
        // The latest logged version is returned.
        XCTAssertEqual(picks.items.first?.item.name, "Oats")

        let filtered = NutritionHistoryPicks.rank(entries, query: "  COF ", now: now)
        XCTAssertEqual(filtered.items.map(\.item.name), ["Coffee"])
        XCTAssertTrue(filtered.entries.isEmpty)
    }

    // MARK: - Exercise guide links (web `ExerciseVisual`)

    func testExternalLinksAreBuiltLikeTheWeb() {
        let bench = ExerciseDto(id: "ex-1", slug: "b", name: "Barbell Bench Press (Medium Grip)", description: "", primaryMuscleGroup: .CHEST)
        XCTAssertEqual(
            ExerciseExternalLinks.youtube(name: bench.name, exercise: bench)?.absoluteString,
            "https://www.youtube.com/results?search_query=Barbell%20Bench%20Press%20(Medium%20Grip)%20exercise%20form%20tutorial"
        )
        XCTAssertEqual(
            ExerciseExternalLinks.muscleWiki(name: "Curl & Press")?.absoluteString,
            "https://musclewiki.com/exercises?search=Curl%20%26%20Press"
        )
        var withVideo = bench
        withVideo.media = [ExerciseMediaDto(id: "m", mediaType: "VIDEO_LINK", url: "https://youtu.be/abc")]
        XCTAssertEqual(ExerciseExternalLinks.youtube(name: bench.name, exercise: withVideo)?.absoluteString, "https://youtu.be/abc")
        withVideo.media = [ExerciseMediaDto(id: "m", mediaType: "VIDEO_LINK", url: "http://insecure.example")]
        XCTAssertTrue(ExerciseExternalLinks.youtube(name: bench.name, exercise: withVideo)?.absoluteString.hasPrefix("https://www.youtube.com/") == true)
    }

    func testLibraryLabelsAreTranslated() {
        XCTAssertEqual(LukiI18n.exerciseTypeLabel(.STRETCHING, locale: .de), "Dehnen & Mobilität")
        XCTAssertEqual(LukiI18n.movementPatternLabel(.HINGE, locale: .en), "Hinge / deadlift")
        // These read the same in German.
        let sameInBoth: Set<MovementPattern> = [.ROTATION, .ELBOW_FLEXION]
        for pattern in MovementPattern.allCases where !sameInBoth.contains(pattern) {
            XCTAssertNotEqual(
                LukiI18n.movementPatternLabel(pattern, locale: .de),
                LukiI18n.movementPatternLabel(pattern, locale: .en),
                "Missing German for \(pattern)"
            )
        }
    }
}
