import XCTest
@testable import LukiFittiModels
@testable import LukiFittiStore

final class HealthActivityStoreTests: XCTestCase {
    private func workout(_ uuid: String, _ start: String) -> HealthWorkoutDto {
        HealthWorkoutDto(
            id: uuid, healthKitUuid: uuid, activityType: "running", sourceName: "Strava",
            startedAt: start, endedAt: start, activeKcal: 100
        )
    }

    func testImportIsChunkedWithinApiLimits() {
        let workouts = (0..<400).map {
            HealthWorkoutInputDto(
                healthKitUuid: "w\($0)", activityType: "running", sourceName: "Strava", isOwn: false,
                startedAt: "2026-10-27T05:00:00Z", endedAt: "2026-10-27T06:00:00Z"
            )
        }
        let days = (0..<10).map { HealthDailyEnergyInputDto(day: "2026-10-\(10 + $0)", activeKcal: 300) }
        let chunks = HealthActivityStore.chunks(
            ImportHealthActivityDto(days: days, workouts: workouts, deletedWorkoutUuids: ["gone"])
        )
        XCTAssertEqual(chunks.map(\.workouts.count), [150, 150, 100])
        XCTAssertEqual(chunks.map(\.days.count), [10, 0, 0])
        XCTAssertEqual(chunks.map(\.deletedWorkoutUuids.count), [1, 0, 0])
        XCTAssertEqual(HealthActivityStore.chunks(ImportHealthActivityDto(days: days)).count, 1)
    }

    func testWorstCaseChunkStaysUnderApiBodyLimit() throws {
        let uuid = UUID().uuidString.lowercased()
        let workouts = (0..<HealthActivityLimits.uploadChunkWorkouts).map { _ in
            HealthWorkoutInputDto(
                healthKitUuid: uuid, activityType: "highIntensityIntervalTraining",
                sourceName: String(repeating: "x", count: HealthActivityLimits.sourceNameMaxLength), isOwn: false,
                startedAt: "2026-10-27T05:00:00.000Z", endedAt: "2026-10-27T06:00:00.000Z",
                activeKcal: 12_345.678, distanceMeters: 123_456.789
            )
        }
        let days = (0..<HealthActivityLimits.uploadChunkDays).map { _ in
            HealthDailyEnergyInputDto(day: "2026-10-27", activeKcal: 12_345.678)
        }
        let deleted = Array(repeating: uuid, count: HealthActivityLimits.uploadChunkDeleted)
        let data = try JSONEncoder().encode(ImportHealthActivityDto(days: days, workouts: workouts, deletedWorkoutUuids: deleted))
        XCTAssertLessThan(data.count, 100_000)
    }

    func testMergeReplacesRowsInsideTheWindowOnly() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Berlin")!
        let window = DateInterval(
            start: LukiDayKey.date("2026-10-20", calendar: calendar)!,
            end: LukiDayKey.date("2026-10-30", calendar: calendar)!
        )
        let existing = HealthActivityDto(
            days: [
                HealthDailyEnergyDto(day: "2026-10-01", activeKcal: 100),
                HealthDailyEnergyDto(day: "2026-10-25", activeKcal: 200),
                HealthDailyEnergyDto(day: "2026-10-26", activeKcal: 250),
            ],
            workouts: [workout("old", "2026-10-01T08:00:00Z"), workout("deleted", "2026-10-25T08:00:00Z")]
        )
        let server = HealthActivityDto(
            days: [HealthDailyEnergyDto(day: "2026-10-25", activeKcal: 333)],
            workouts: [workout("new", "2026-10-26T08:00:00Z")]
        )
        let merged = HealthActivityStore.merge(existing: existing, server: server, window: window, calendar: calendar)
        XCTAssertEqual(merged.days.map(\.day), ["2026-10-01", "2026-10-25"])
        XCTAssertEqual(merged.days.last?.activeKcal, 333)
        XCTAssertEqual(merged.workouts.map(\.healthKitUuid), ["old", "new"])
    }

    func testDecodesServerActivityWithMissingOptionals() throws {
        let json = """
        {"days":[{"day":"2026-10-27","activeKcal":512.5,"updatedAt":"2026-10-27T20:00:00Z"}],
         "workouts":[{"id":"x","healthKitUuid":"u1","activityType":"cycling","sourceName":"Garmin Connect",
                      "isOwn":false,"startedAt":"2026-10-27T05:00:00.000Z","endedAt":"2026-10-27T06:00:00.000Z"}]}
        """
        let dto = try JSONDecoder().decode(HealthActivityDto.self, from: Data(json.utf8))
        XCTAssertEqual(dto.days.first?.activeKcal, 512.5)
        XCTAssertNil(dto.workouts.first?.activeKcal)
        XCTAssertNotNil(dto.workouts.first?.startedAtDate)
    }
}
