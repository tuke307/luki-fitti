import Foundation
import CryptoKit
import ImageIO
import LukiFittiModels
import SwiftUI

/// Media frame URLs for an exercise, ordered start → finish. Mirrors the web rule in
/// `resolveExerciseMedia`: never guess photos for user-created exercises.
public enum ExerciseMediaFrames {
    public static func imageURLs(for exercise: ExerciseDto?) -> [URL] {
        guard let exercise, exercise.isSystem else { return [] }
        return (exercise.media ?? []).compactMap { item in
            guard ["IMAGE", "GIF"].contains(item.mediaType),
                  let url = URL(string: item.url),
                  url.scheme?.lowercased() == "https" else { return nil }
            return url
        }
    }
}

/// Fetch + decode abstraction so tests can drive the loader without the network.
public protocol ExerciseImageFetching: Sendable {
    func data(for url: URL) async throws -> Data
}

public struct URLSessionExerciseImageFetcher: ExerciseImageFetching {
    public init() {}
    public func data(for url: URL) async throws -> Data {
        let (data, response) = try await URLSession.shared.data(from: url)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        return data
    }
}

/// NSCache needs an object; `CGImage` itself isn't one.
private final class CachedCGImage: NSObject {
    let image: CGImage
    init(_ image: CGImage) { self.image = image }
}

/// Two-tier exercise photo cache: memory (NSCache) + disk (Caches dir, SHA256 of URL as filename).
/// Concurrent requests for the same URL+size are coalesced; JPEGs are downsampled at decode time.
public actor ExerciseImageLoader {
    public static let shared = ExerciseImageLoader()

    public struct Error: Swift.Error, Sendable {
        public enum Kind: Sendable { case rejectedURL, fetchFailed, decodeFailed }
        public let kind: Kind
    }

    private let fetcher: ExerciseImageFetching
    private let cache = NSCache<NSString, CachedCGImage>()
    private var inFlight: [String: Task<CGImage, Swift.Error>] = [:]

    public init(fetcher: ExerciseImageFetching = URLSessionExerciseImageFetcher()) {
        self.fetcher = fetcher
    }

    /// Memory + disk cache key for a URL at a pixel size. Pure — unit tested.
    public nonisolated static func cacheKey(url: URL, maxPixelSize: Int) -> String {
        let hash = SHA256.hash(data: Data(url.absoluteString.utf8))
            .map { String(format: "%02x", $0) }.joined()
        return "\(maxPixelSize)-\(hash)"
    }

    private nonisolated static func diskURL(forKey key: String) -> URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("exercise-images", isDirectory: true)
            .appendingPathComponent("\(key).img")
    }

    /// Loads an https image downsampled to `maxPixelSize` pixels on the larger dimension.
    public func image(for url: URL, maxPixelSize: Int) async throws -> CGImage {
        guard url.scheme?.lowercased() == "https" else { throw Error(kind: .rejectedURL) }
        let key = Self.cacheKey(url: url, maxPixelSize: maxPixelSize)

        if let cached = cache.object(forKey: key as NSString) { return cached.image }
        let file = Self.diskURL(forKey: key)
        if let data = try? Data(contentsOf: file),
           let image = Self.decode(data: data, maxPixelSize: maxPixelSize) {
            cache.setObject(CachedCGImage(image), forKey: key as NSString)
            return image
        }

        if let task = inFlight[key] { return try await task.value }
        let task = Task<CGImage, Swift.Error> { [fetcher] in
            let data = try await fetcher.data(for: url)
            guard let image = Self.decode(data: data, maxPixelSize: maxPixelSize) else {
                throw Error(kind: .decodeFailed)
            }
            try? FileManager.default.createDirectory(
                at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
            try? data.write(to: file, options: .atomic)
            return image
        }
        inFlight[key] = task
        defer { inFlight[key] = nil }
        let image = try await task.value
        cache.setObject(CachedCGImage(image), forKey: key as NSString)
        return image
    }

    /// Downsampled decode via ImageIO: never rasterizes the full JPEG for a thumbnail.
    nonisolated static func decode(data: Data, maxPixelSize: Int) -> CGImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceThumbnailMaxPixelSize: max(1, maxPixelSize),
            kCGImageSourceCreateThumbnailWithTransform: true,
        ]
        return CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
    }
}
