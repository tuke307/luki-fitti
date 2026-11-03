import XCTest
@testable import LukiFittiModels
@testable import LukiFittiDesign

final class ExerciseMediaFramesTests: XCTestCase {
    private func exercise(isSystem: Bool, media: [ExerciseMediaDto]) -> ExerciseDto {
        ExerciseDto(id: "ex-test", slug: "test", name: "Test", description: "",
                    instructions: [], category: .COMPOUND, exerciseType: .STRENGTH,
                    primaryMuscleGroup: .CHEST, secondaryMuscleGroups: [], equipment: .BARBELL,
                    tags: [], isSystem: isSystem, alternativeExerciseIds: [], media: media)
    }

    private func media(_ type: String, _ url: String) -> ExerciseMediaDto {
        ExerciseMediaDto(id: url, mediaType: type, url: url)
    }

    func testReturnsOnlyHttpsImageAndGifInOrder() {
        let ex = exercise(isSystem: true, media: [
            media("IMAGE", "https://example.com/a.jpg"),
            media("SVG", "https://example.com/icon.svg"),
            media("GIF", "http://insecure.com/b.gif"),
            media("IMAGE", "https://example.com/c.jpg"),
        ])
        XCTAssertEqual(ExerciseMediaFrames.imageURLs(for: ex).map(\.absoluteString),
                       ["https://example.com/a.jpg", "https://example.com/c.jpg"])
    }

    func testNoFramesForCustomExercise() {
        let ex = exercise(isSystem: false, media: [media("IMAGE", "https://example.com/a.jpg")])
        XCTAssertTrue(ExerciseMediaFrames.imageURLs(for: ex).isEmpty)
        XCTAssertTrue(ExerciseMediaFrames.imageURLs(for: nil).isEmpty)
    }

    func testCacheKeyIsUrlAndSizeScoped() {
        let a = URL(string: "https://example.com/a.jpg")!
        let b = URL(string: "https://example.com/b.jpg")!
        XCTAssertEqual(ExerciseImageLoader.cacheKey(url: a, maxPixelSize: 128),
                       ExerciseImageLoader.cacheKey(url: a, maxPixelSize: 128))
        XCTAssertNotEqual(ExerciseImageLoader.cacheKey(url: a, maxPixelSize: 128),
                          ExerciseImageLoader.cacheKey(url: a, maxPixelSize: 256))
        XCTAssertNotEqual(ExerciseImageLoader.cacheKey(url: a, maxPixelSize: 128),
                          ExerciseImageLoader.cacheKey(url: b, maxPixelSize: 128))
    }

    private actor CountingFetcher: ExerciseImageFetching {
        var calls = 0
        let data: Data
        init(data: Data) { self.data = data }
        func data(for url: URL) async throws -> Data {
            calls += 1
            try await Task.sleep(for: .milliseconds(20))
            return data
        }
    }

    func testRejectsNonHttps() async {
        let loader = ExerciseImageLoader(fetcher: CountingFetcher(data: Data()))
        do {
            _ = try await loader.image(for: URL(string: "http://example.com/a.jpg")!, maxPixelSize: 64)
            XCTFail("expected rejection")
        } catch {}
    }

    func testConcurrentLoadsAreCoalesced() async throws {
        // 1×1 white PNG.
        let png = Data(base64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")!
        let fetcher = CountingFetcher(data: png)
        let loader = ExerciseImageLoader(fetcher: fetcher)
        let url = URL(string: "https://example.com/coa-\(UUID().uuidString).png")!

        async let first = loader.image(for: url, maxPixelSize: 99999)
        async let second = loader.image(for: url, maxPixelSize: 99999)
        _ = try await (first, second)
        let calls = await fetcher.calls
        XCTAssertEqual(calls, 1)
    }
}
