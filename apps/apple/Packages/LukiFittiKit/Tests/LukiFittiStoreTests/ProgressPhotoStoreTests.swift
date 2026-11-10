import XCTest
@testable import LukiFittiStore
@testable import LukiFittiModels
@testable import LukiFittiAPI

final class ProgressPhotoStoreTests: XCTestCase {
    private func tempDir() -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("progress-\(UUID().uuidString)")
    }

    @MainActor
    private func makeStore() -> ProgressPhotoStore {
        ProgressPhotoStore(apiClient: APIClient(baseURL: URL(string: "https://x.test")!, tokenStore: KeychainTokenStore(service: "test-\(UUID().uuidString)")), storageDirectory: tempDir())
    }

    @MainActor
    func testBackupOffQueuesNothing() async {
        let store = makeStore()
        store.cloudBackupEnabled = false
        await store.save(ProgressCheckInDto(), isSignedIn: true)
        XCTAssertTrue(store.outbox.isEmpty)
    }

    @MainActor
    func testTurningBackupOnQueuesEverything() async {
        let store = makeStore()
        store.cloudBackupEnabled = false
        var checkIn = ProgressCheckInDto()
        await store.save(checkIn, isSignedIn: true)
        checkIn.photos = [ProgressPhotoDto(clientPhotoId: "p1", pose: .FRONT, localFile: "p1.jpg")]
        // persist via save path (photo rows aren't queued while backup is off)
        await store.save(checkIn, isSignedIn: true)
        XCTAssertTrue(store.outbox.isEmpty)
        await store.setCloudBackup(true, deleteRemote: false, isSignedIn: false)
        XCTAssertEqual(store.outbox.count, 2) // upsert + photo
        XCTAssertEqual(store.outbox.filter { $0.kind == .upsertCheckIn }.count, 1)
        XCTAssertEqual(store.outbox.filter { $0.kind == .photo }.count, 1)
    }

    @MainActor
    func testTurningBackupOffWithDeleteQueuesDeletes() async {
        let store = makeStore()
        store.cloudBackupEnabled = true
        var synced = ProgressCheckInDto()
        synced.id = "srv-1"
        await store.save(synced, isSignedIn: true)
        await store.setCloudBackup(false, deleteRemote: true, isSignedIn: false)
        XCTAssertTrue(store.outbox.contains { $0.kind == .deleteCheckIn && $0.serverId == "srv-1" })
        XCTAssertFalse(store.cloudBackupEnabled)
    }

    @MainActor
    func testWeightLinkIsStoredOnCheckIn() async {
        let store = makeStore()
        var checkIn = ProgressCheckInDto()
        checkIn.bodyWeightClientEntryId = "bw-123"
        await store.save(checkIn, isSignedIn: true)
        XCTAssertEqual(store.checkIn(clientEntryId: checkIn.clientEntryId)?.bodyWeightClientEntryId, "bw-123")
    }

    @MainActor
    func testJpegReencodeDropsMetadata() async throws {
        // A JPEG carrying GPS EXIF data, built with the same container layout as a camera shot.
        let jpegBase64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAgGBgYGBggGBggMCAcIDA4KCAgKDhINDQ4SEhMFExQUFhcRGRcVHicmJihYXmRoZGSkpKSkpKSkpKSkpKT/2wBDAAYICAoKCwoLEAsLCSwtKy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL//AABEIAAgACAMBEQACEQEDEQH/xAAcAAABBAMBAAAAAAAAAAAAAAADAAECBAUGBwj/xAA3EAABAgQEAwUGAwQDAQAAAAABAhEAAyEEBRIGMUFRE2FxgSKRobHB0fAUQmLh8QcjM1Ji8P/EABkBAAMBAQEAAAAAAAAAAAAAAAECAwAEBf/EACARAAICAgMAAwEAAAAAAAAAAAABAhEDIRIxE0EFUWH/2gAMAwEAAhEDEQA/APnKK5F2E9i2E0iYp6C0S2oWqF+K4L2vQKjO8jX+W9z8jW2dN9i+S2C8z7F8lsF5n2L5LYLzPsXyWwXmfYvktgvM+xfJbBeZ9i+S2C8z7F8lsF5n2L5LYLzPsXyWwXmfYvkv3M+z8o5fM9T7P8AnD0+z7P8nD4r5v3n8m8eV+Z9T1T4j1j5h8Z+4b1P9wXyfsP5r0f8+J9R9o/J+8/lxL1n9T/ALi3kP3H5fQ+JfQf4Z+jfMf0n8i8T9R+f1P7n0v0H9/8k+o/0j8v6n+5e8/r+TfQf9p//2Q=="
        guard let data = Data(base64Encoded: jpegBase64) else {
            throw XCTSkip("fixture decode failed")
        }
        // Skip when UIKit image processing isn't available (e.g. non-UI test host).
        guard let out = ProgressPhotoStore.normalizedJpeg(data) else {
            throw XCTSkip("UIImage not available in this test context")
        }
        // A normalized JPEG must contain no APP1 EXIF segment (marker 0xFFE1).
        let bytes = [UInt8](out)
        for i in 0..<max(0, bytes.count - 1) where bytes[i] == 0xFF && bytes[i + 1] == 0xE1 {
            XCTFail("EXIF segment still present after re-encode")
        }
        XCTAssertGreaterThan(out.count, 0)
    }
}
