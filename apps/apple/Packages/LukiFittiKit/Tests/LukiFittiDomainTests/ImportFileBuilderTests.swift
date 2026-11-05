import XCTest
@testable import LukiFittiModels
@testable import LukiFittiDomain

/// Runs the shared fixtures of `packages/common/src/utils/import-file.util.spec.ts`: the Swift
/// builder must produce the same file as the TypeScript one, whose output the TS test validates
/// against the `luki-fitti-import@1` schema.
final class ImportFileBuilderTests: XCTestCase {
    private struct BuilderInput: Decodable {
        var folders: [WorkoutFolderDto]
        var unfiledTemplates: [WorkoutTemplateDto]
        var historySessions: [WorkoutSessionDto]
        var catalog: [ExerciseDto]
        var customExercises: [ExerciseDto]
        var sourceApp: String
        var exportedAt: String
    }

    private func fixture(_ name: String) throws -> Data {
        let repositoryRoot = (0..<7).reduce(URL(fileURLWithPath: #filePath)) { url, _ in
            url.deletingLastPathComponent()
        }
        let url = repositoryRoot.appendingPathComponent("packages/common/src/utils/__fixtures__/\(name)")
        guard let data = try? Data(contentsOf: url) else {
            throw XCTSkip("shared import fixture not found at \(url.path)")
        }
        return data
    }

    func testMatchesTheSharedExpectedOutput() throws {
        let input = try JSONDecoder().decode(BuilderInput.self, from: fixture("import-builder-input.json"))
        let file = ImportFileBuilder.build(
            folders: input.folders,
            unfiledTemplates: input.unfiledTemplates,
            historySessions: input.historySessions,
            catalog: input.catalog,
            customExercises: input.customExercises,
            sourceApp: input.sourceApp,
            exportedAt: try XCTUnwrap(LukiDate.parseISO(input.exportedAt))
        )
        let actual = try JSONSerialization.jsonObject(with: ImportFileBuilder.encode(file)) as? NSDictionary
        let expected = try JSONSerialization.jsonObject(with: fixture("import-builder-output.json")) as? NSDictionary
        XCTAssertEqual(actual, expected)
        XCTAssertEqual(file.sessions.map(\.key), ["s-1", "s-3"])
    }

    func testDecodesTheSharedExampleFile() throws {
        let file = try JSONDecoder().decode(ImportFile.self, from: fixture("import-file-example.json"))
        XCTAssertEqual(file.format, ImportFormat.id)
        XCTAssertEqual(file.customExercises.first?.laterality, .UNILATERAL)
        XCTAssertEqual(file.templates.first?.exercises.map(\.exercise), [
            .slug("barbell-bench-press-medium-grip"),
            .custom("ex-landmine-press"),
        ])
        XCTAssertEqual(file.sessions.first?.exercises.first?.sets.map(\.rpe), [nil, 8, 9])
        let reencoded = try JSONDecoder().decode(ImportFile.self, from: ImportFileBuilder.encode(file))
        XCTAssertEqual(reencoded, file)
    }

    func testBackupFileName() {
        let date = Date(timeIntervalSince1970: 1_793_491_200) // 2026-11-01T00:00:00Z
        XCTAssertEqual(ImportFileBuilder.fileName(for: date), "luki-fitti-backup-2026-11-01.json")
    }
}
