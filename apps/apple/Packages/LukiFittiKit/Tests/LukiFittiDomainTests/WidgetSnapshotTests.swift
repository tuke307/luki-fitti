import XCTest
@testable import LukiFittiModels
@testable import LukiFittiDomain

final class WidgetSnapshotTests: XCTestCase {
    private func template(_ id: String, name: String? = nil, folderId: String? = "f1") -> WorkoutTemplateDto {
        WorkoutTemplateDto(id: id, folderId: folderId, name: name ?? id)
    }

    private func session(templateId: String?, name: String, daysAgo: Double) -> WorkoutSessionDto {
        WorkoutSessionDto(
            clientSessionId: UUID().uuidString,
            templateId: templateId,
            workoutNameSnapshot: name,
            status: .COMPLETED,
            startedAt: ISO8601DateFormatter().string(from: Date().addingTimeInterval(-daysAgo * 86400)),
            exercises: []
        )
    }

    private func folder(_ id: String, _ templates: [WorkoutTemplateDto]) -> WorkoutFolderDto {
        WorkoutFolderDto(id: id, name: id, templates: templates)
    }

    // MARK: - Codable

    func testSnapshotCodableRoundTrip() throws {
        let snapshot = HomeWidgetSnapshot(
            generatedAt: "2026-11-10T09:00:00Z",
            locale: .de,
            nextWorkout: .init(templateId: "t1", name: "Push A", exerciseCount: 5),
            weekSessionsDone: 2,
            weeklyGoal: 4,
            weekStartISO: "2026-11-09T00:00:00Z",
            nutrition: .init(day: "2026-11-10", kcalEaten: 1450, kcalGoal: 2600, proteinG: 95, proteinGoalG: 180)
        )
        let decoded = try JSONDecoder().decode(HomeWidgetSnapshot.self, from: JSONEncoder().encode(snapshot))
        XCTAssertEqual(decoded, snapshot)
    }

    // MARK: - Rollover

    func testNutritionRolloverZeroesEatenOnOtherDay() {
        let snapshot = HomeWidgetSnapshot(
            generatedAt: "", locale: .en, weekSessionsDone: 3, weekStartISO: "w1",
            nutrition: .init(day: "2026-11-10", kcalEaten: 1000, kcalGoal: 2500, proteinG: 80, proteinGoalG: 170)
        )
        XCTAssertEqual(snapshot.kcalEatenToday(dayKey: "2026-11-10"), 1000)
        XCTAssertEqual(snapshot.kcalEatenToday(dayKey: "2026-11-11"), 0)
        XCTAssertEqual(snapshot.proteinToday(dayKey: "2026-11-10"), 80)
        XCTAssertEqual(snapshot.proteinToday(dayKey: "2026-11-11"), 0)
        // Goals survive the rollover even when eaten resets.
        XCTAssertEqual(snapshot.nutrition?.kcalGoal, 2500)
    }

    func testWeekRolloverZeroesDoneOnOtherWeek() {
        let snapshot = HomeWidgetSnapshot(
            generatedAt: "", locale: .en, weekSessionsDone: 3, weekStartISO: "w1"
        )
        XCTAssertEqual(snapshot.sessionsDone(currentWeekStartISO: "w1"), 3)
        XCTAssertEqual(snapshot.sessionsDone(currentWeekStartISO: "w2"), 0)
    }

    // MARK: - WorkoutRotation.nextUp

    func testNextUpEmptyTemplatesReturnsNil() {
        XCTAssertNil(WorkoutRotation.nextUp(folders: [], unfiledTemplates: [], historySessions: []))
    }

    func testNextUpNoHistoryReturnsFirstTemplate() {
        let folders = [folder("f1", [template("a"), template("b")])]
        XCTAssertEqual(
            WorkoutRotation.nextUp(folders: folders, unfiledTemplates: [], historySessions: [])?.template.id,
            "a"
        )
    }

    func testNextUpWrapsToLeastRecentlyTrained() {
        let folders = [folder("f1", [template("a"), template("b"), template("c")])]
        // history newest-first: b yesterday, c a week ago, a never trained → a wins.
        let history = [
            session(templateId: "b", name: "b", daysAgo: 1),
            session(templateId: "c", name: "c", daysAgo: 7)
        ]
        XCTAssertEqual(
            WorkoutRotation.nextUp(folders: folders, unfiledTemplates: [], historySessions: history)?.template.id,
            "a"
        )
    }

    func testNextUpPicksStalestTemplate() {
        let folders = [folder("f1", [template("a"), template("b")])]
        // a trained 9 days ago, b 2 days ago → a is next.
        let history = [
            session(templateId: "b", name: "b", daysAgo: 2),
            session(templateId: "a", name: "a", daysAgo: 9)
        ]
        XCTAssertEqual(
            WorkoutRotation.nextUp(folders: folders, unfiledTemplates: [], historySessions: history)?.template.id,
            "a"
        )
    }

    func testNextUpMatchesSessionByName() {
        // Sessions recorded before template ids existed match on the name snapshot.
        let folders = [folder("f1", [template("a", name: "Push"), template("b", name: "Pull")])]
        let history = [session(templateId: nil, name: "pull", daysAgo: 1)]
        XCTAssertEqual(
            WorkoutRotation.nextUp(folders: folders, unfiledTemplates: [], historySessions: history)?.template.id,
            "a"
        )
    }

    func testNextUpUnfiledOnly() {
        XCTAssertEqual(
            WorkoutRotation.nextUp(folders: [], unfiledTemplates: [template("u", folderId: nil)], historySessions: [])?.template.id,
            "u"
        )
    }

    // MARK: - SharedSnapshotStore.write

    func testWriteSkipsWhenOnlyGeneratedAtDiffers() throws {
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("widgets-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: dir) }
        var snapshot = HomeWidgetSnapshot(
            generatedAt: "t1", locale: .en, weekStartISO: "w1",
            nutrition: .init(day: "d", kcalEaten: 100, proteinG: 10)
        )
        XCTAssertTrue(SharedSnapshotStore.write(snapshot, to: dir))
        snapshot.generatedAt = "t2"
        // Same content, new timestamp → no write, no widget reload needed.
        XCTAssertFalse(SharedSnapshotStore.write(snapshot, to: dir))
        snapshot.nutrition?.kcalEaten = 250
        // A real change → write.
        XCTAssertTrue(SharedSnapshotStore.write(snapshot, to: dir))
    }

    // MARK: - sessionsDoneThisWeek

    func testSessionsDoneThisWeekCountsOnlyCurrentWeek() {
        var calendar = Calendar(identifier: .iso8601)
        calendar.timeZone = .current
        let now = Date()
        let weekStart = calendar.dateInterval(of: .weekOfYear, for: now)!.start
        let inside = ISO8601DateFormatter().string(from: weekStart.addingTimeInterval(3600))
        let outside = ISO8601DateFormatter().string(from: weekStart.addingTimeInterval(-3600))
        let history = [
            WorkoutSessionDto(clientSessionId: "1", workoutNameSnapshot: "x", status: .COMPLETED, startedAt: inside, exercises: []),
            WorkoutSessionDto(clientSessionId: "2", workoutNameSnapshot: "y", status: .COMPLETED, startedAt: outside, exercises: [])
        ]
        XCTAssertEqual(WorkoutRotation.sessionsDoneThisWeek(historySessions: history, now: now).done, 1)
        XCTAssertEqual(WorkoutRotation.sessionsDoneThisWeek(historySessions: [], now: now).done, 0)
    }
}
