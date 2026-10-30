import XCTest
@testable import LukiFittiModels
@testable import LukiFittiStore

final class MealPhotoCacheTests: XCTestCase {
    func testStoresReadsBackAndClears() throws {
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("MealPhotoCacheTests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let id = UUID().uuidString.lowercased()
        let cache = MealPhotoCache(directory: dir)
        cache.store(Data([1, 2, 3]), for: id)
        XCTAssertEqual(cache.cached(id), Data([1, 2, 3]))
        XCTAssertEqual(MealPhotoCache(directory: dir).cached(id), Data([1, 2, 3]), "persists on disk")
        cache.clear()
        XCTAssertNil(cache.cached(id))
        XCTAssertFalse(FileManager.default.fileExists(atPath: dir.path))
    }

    func testRejectsIdsThatCouldShapeAPath() {
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("MealPhotoCacheTests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let cache = MealPhotoCache(directory: dir)
        cache.store(Data([9]), for: "../escape")
        XCTAssertNil(cache.cached("../escape"))
        XCTAssertFalse(FileManager.default.fileExists(atPath: dir.deletingLastPathComponent().appendingPathComponent("escape.jpg").path))
    }
}
