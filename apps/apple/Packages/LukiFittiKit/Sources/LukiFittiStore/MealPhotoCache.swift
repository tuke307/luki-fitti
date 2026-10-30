import Foundation
import LukiFittiModels
import LukiFittiAPI

/// Small memory + disk cache for authenticated meal photos, keyed by photo id. Bytes are only
/// fetched through `APIClient` (bearer token, owner check server-side) and cleared on sign-out.
public final class MealPhotoCache: @unchecked Sendable {
    public static let shared = MealPhotoCache()

    public enum LoadError: Error, Equatable {
        /// 404: removed by the retention sweep or deleted elsewhere.
        case unavailable
        case offline
        case failed
    }

    private let memory = NSCache<NSString, NSData>()
    private let directory: URL
    private let lock = NSLock()

    public init(directory: URL? = nil) {
        self.directory = directory ?? FileManager.default
            .urls(for: .cachesDirectory, in: .userDomainMask).first!
            .appendingPathComponent("LukiFittiMealPhotos", isDirectory: true)
        memory.totalCostLimit = 40 * 1024 * 1024
    }

    public func cached(_ photoId: String) -> Data? {
        guard let file = fileURL(photoId) else { return nil }
        if let hit = memory.object(forKey: photoId as NSString) { return hit as Data }
        guard let data = try? Data(contentsOf: file) else { return nil }
        memory.setObject(data as NSData, forKey: photoId as NSString, cost: data.count)
        return data
    }

    public func store(_ data: Data, for photoId: String) {
        guard let file = fileURL(photoId) else { return }
        memory.setObject(data as NSData, forKey: photoId as NSString, cost: data.count)
        lock.lock()
        defer { lock.unlock() }
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try? data.write(to: file, options: [.atomic, .completeFileProtection])
    }

    public func load(_ photo: MealPhotoDto, api: APIClient) async throws(LoadError) -> Data {
        if let hit = cached(photo.id) { return hit }
        guard let path = photo.url, path.hasPrefix("/api/") else { throw .unavailable }
        do {
            let data = try await api.fetchData(path: path)
            store(data, for: photo.id)
            return data
        } catch APIClientError.serverError(404, _) {
            throw .unavailable
        } catch APIClientError.offline {
            throw .offline
        } catch {
            throw .failed
        }
    }

    public func remove(_ photoId: String) {
        memory.removeObject(forKey: photoId as NSString)
        if let file = fileURL(photoId) { try? FileManager.default.removeItem(at: file) }
    }

    public func clear() {
        memory.removeAllObjects()
        lock.lock()
        defer { lock.unlock() }
        try? FileManager.default.removeItem(at: directory)
    }

    /// Ids are server UUIDs; anything else is rejected so it can never shape a file path.
    private func fileURL(_ photoId: String) -> URL? {
        guard !photoId.isEmpty, photoId.count <= 64,
              photoId.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-") }) else { return nil }
        return directory.appendingPathComponent("\(photoId).jpg")
    }
}

extension APIClient {
    /// Deletes one photo of the caller's meal (`DELETE /api/nutrition/photos/:id`).
    public func deleteMealPhoto(id: String) async throws {
        struct Resp: Decodable { let success: Bool? }
        guard id.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-") }) else {
            throw APIClientError.invalidURL
        }
        let _: Resp = try await request(path: "/api/nutrition/photos/\(id)", method: "DELETE")
    }
}
