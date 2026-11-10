import Foundation
import Observation
import LukiFittiModels
import LukiFittiAPI
#if os(iOS)
import UIKit
#endif

/// A pending progress change kept on disk until the server confirms it. Used only when the
/// user opted in to cloud backup.
public struct ProgressOutboxItem: Codable, Sendable, Equatable {
    public enum Kind: String, Codable, Sendable { case upsertCheckIn, deleteCheckIn, photo, deletePhoto }
    public var kind: Kind
    public var clientEntryId: String
    public var payload: UpsertProgressCheckInDto?
    public var clientPhotoId: String?
    public var pose: ProgressPose?
    public var photoKind: ProgressPhotoKind?
    public var serverId: String?
}

/// Offline-first progress photo tracking, modeled on `BodyWeightStore` + `MealPhotoCache`.
/// Photos live on the device by default; the outbox only fills while
/// `progressPhotoCloudBackup` is on. JPEG re-encode on import drops camera-roll EXIF/GPS.
@MainActor
@Observable
public final class ProgressPhotoStore {
    /// All check-ins, newest first.
    public private(set) var checkIns: [ProgressCheckInDto] = []
    public private(set) var outbox: [ProgressOutboxItem] = []

    private let api: APIClient
    private let directory: URL
    private var flushing = false
    /// `progressPhotoCloudBackup` — the outbox is skipped entirely while off.
    public var cloudBackupEnabled = false

    private static let checkInsFile = "progress_check_ins.json"
    private static let outboxFile = "progress_outbox.json"

    public init(apiClient: APIClient, storageDirectory: URL? = nil) {
        self.api = apiClient
        self.directory = storageDirectory ?? FileManager.default
            .urls(for: .documentDirectory, in: .userDomainMask).first!
            .appendingPathComponent("LukiFittiProgress", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        checkIns = Self.sorted(read(Self.checkInsFile) ?? [])
        outbox = read(Self.outboxFile) ?? []
    }

    // MARK: Queries

    public func checkIn(clientEntryId: String) -> ProgressCheckInDto? {
        checkIns.first { $0.clientEntryId == clientEntryId }
    }

    public func photoFileURL(_ photo: ProgressPhotoDto) -> URL? {
        guard let file = photo.localFile else { return nil }
        return directory.appendingPathComponent(file)
    }

    /// Local bytes for a stored photo (used for thumbnails; remote photos are fetched lazily).
    public func photoData(_ photo: ProgressPhotoDto, isSignedIn: Bool) async -> Data? {
        if let file = photo.localFile, let data = try? Data(contentsOf: photoFileURL(photo)!) {
            return data
        }
        let cache = directory.appendingPathComponent("remote-\(photo.id).jpg")
        if let data = try? Data(contentsOf: cache) { return data }
        guard isSignedIn, let path = photo.url, path.hasPrefix("/api/") else { return nil }
        guard let data = try? await api.fetchData(path: path) else { return nil }
        try? data.write(to: cache, options: .atomic)
        return data
    }

    // MARK: Check-ins

    /// Upserts a check-in's metadata locally and queues the sync copy when backup is on.
    public func save(_ draft: ProgressCheckInDto, isSignedIn: Bool) async {
        replace(draft)
        enqueue(.init(kind: .upsertCheckIn, clientEntryId: draft.clientEntryId, payload: draft.toUpsert()))
        await flush(isSignedIn: isSignedIn)
    }

    public func remove(_ checkIn: ProgressCheckInDto, isSignedIn: Bool) async {
        checkIns.removeAll { $0.clientEntryId == checkIn.clientEntryId }
        for photo in checkIn.photos {
            removePhotoFiles(photo)
        }
        persistCheckIns()
        let localOnly = checkIn.id.hasPrefix("local-")
        if localOnly {
            outbox.removeAll { $0.clientEntryId == checkIn.clientEntryId }
            persistOutbox()
            return
        }
        enqueue(.init(kind: .deleteCheckIn, clientEntryId: checkIn.clientEntryId, serverId: checkIn.id))
        await flush(isSignedIn: isSignedIn)
    }

    // MARK: Photos

    /// Re-encodes the import as JPEG (drops EXIF/GPS) downscaled to a 2048px long edge and
    /// stores it next to the check-in. Returns nil when the data isn't a usable image.
    public func addPhoto(
        to checkInClientEntryId: String,
        pose: ProgressPose,
        data: Data,
        isSignedIn: Bool
    ) async -> ProgressPhotoDto? {
        guard let jpeg = Self.normalizedJpeg(data) else { return nil }
        guard var checkIn = checkIn(clientEntryId: checkInClientEntryId) else { return nil }
        let clientPhotoId = UUID().uuidString
        let file = "\(clientPhotoId).jpg"
        do {
            try jpeg.write(to: directory.appendingPathComponent(file), options: .atomic)
        } catch { return nil }
        var photo = ProgressPhotoDto(clientPhotoId: clientPhotoId, pose: pose, localFile: file)
        photo.sizeBytes = jpeg.count
        // One photo per pose: replacing drops the previous local file.
        if let old = checkIn.photos.first(where: { $0.pose == pose && $0.kind == .PHOTO }) {
            removePhotoFiles(old)
            checkIn.photos.removeAll { $0.id == old.id }
            if !old.id.hasPrefix("local-") {
                enqueue(.init(kind: .deletePhoto, clientEntryId: checkInClientEntryId, serverId: old.id))
            }
        }
        checkIn.photos.append(photo)
        checkIn.photos.sort { $0.pose.sortOrder < $1.pose.sortOrder }
        replace(checkIn)
        enqueue(.init(kind: .photo, clientEntryId: checkInClientEntryId, clientPhotoId: clientPhotoId, pose: pose, photoKind: .PHOTO))
        await flush(isSignedIn: isSignedIn)
        return photo
    }

    public func removePhoto(_ photo: ProgressPhotoDto, from checkInClientEntryId: String, isSignedIn: Bool) async {
        guard var checkIn = checkIn(clientEntryId: checkInClientEntryId) else { return }
        removePhotoFiles(photo)
        checkIn.photos.removeAll { $0.id == photo.id }
        replace(checkIn)
        outbox.removeAll { $0.clientPhotoId == photo.clientPhotoId }
        if !photo.id.hasPrefix("local-") {
            enqueue(.init(kind: .deletePhoto, clientEntryId: checkInClientEntryId, serverId: photo.id))
        }
        persistOutbox()
        await flush(isSignedIn: isSignedIn)
    }

    // MARK: Backup toggle

    /// Turning backup ON queues every local check-in and photo for upload.
    /// Turning it OFF with `deleteRemote` also queues deletes of the remote copies.
    public func setCloudBackup(_ enabled: Bool, deleteRemote: Bool, isSignedIn: Bool) async {
        let wasOn = cloudBackupEnabled
        // The toggle itself bypasses `enqueue`'s flag check: turning ON queues everything,
        // turning OFF with deleteRemote queues the remote deletes.
        if enabled && !wasOn {
            for checkIn in checkIns {
                outbox.append(.init(kind: .upsertCheckIn, clientEntryId: checkIn.clientEntryId, payload: checkIn.toUpsert()))
                for photo in checkIn.photos where photo.id.hasPrefix("local-") {
                    outbox.append(.init(kind: .photo, clientEntryId: checkIn.clientEntryId, clientPhotoId: photo.clientPhotoId, pose: photo.pose, photoKind: photo.kind))
                }
            }
            persistOutbox()
        }
        if !enabled && wasOn && deleteRemote {
            for checkIn in checkIns where !checkIn.id.hasPrefix("local-") {
                outbox.append(.init(kind: .deleteCheckIn, clientEntryId: checkIn.clientEntryId, serverId: checkIn.id))
            }
            persistOutbox()
        }
        cloudBackupEnabled = enabled
        await flush(isSignedIn: isSignedIn)
    }

    /// Pulls remote check-ins so a reinstall gets them back (only when backup is on).
    public func refresh(isSignedIn: Bool) async {
        guard isSignedIn, cloudBackupEnabled else { return }
        await flush(isSignedIn: isSignedIn)
        guard let remote = try? await api.fetchProgressCheckIns() else { return }
        merge(remote)
    }

    /// Server rows win on metadata; photos keep their local copies keyed by clientPhotoId.
    private func merge(_ remote: [ProgressCheckInDto]) {
        var byId = Dictionary(uniqueKeysWithValues: checkIns.map { ($0.clientEntryId, $0) })
        for row in remote {
            var merged = row
            if let local = byId[row.clientEntryId] {
                merged.photos = row.photos.map { photo in
                    var copy = photo
                    if let localPhoto = local.photos.first(where: { $0.clientPhotoId == photo.clientPhotoId }) {
                        copy.localFile = localPhoto.localFile
                    }
                    return copy
                }
            }
            byId[row.clientEntryId] = merged
        }
        checkIns = Self.sorted(byId.values.map { $0 })
        persistCheckIns()
    }

    // MARK: Outbox

    private func enqueue(_ item: ProgressOutboxItem) {
        guard cloudBackupEnabled else { return }
        outbox.append(item)
        persistOutbox()
    }

    public func flush(isSignedIn: Bool) async {
        guard isSignedIn, !flushing, !outbox.isEmpty else { return }
        // While backup is off, only remote deletes still drain; pending upserts/uploads are dropped.
        if !cloudBackupEnabled {
            let stale = outbox.filter { $0.kind == .upsertCheckIn || $0.kind == .photo }
            if !stale.isEmpty {
                outbox.removeAll { $0.kind == .upsertCheckIn || $0.kind == .photo }
                persistOutbox()
            }
            guard outbox.contains(where: { $0.kind == .deleteCheckIn || $0.kind == .deletePhoto }) else { return }
        }
        flushing = true
        defer { flushing = false }
        var index = 0
        while index < outbox.count {
            let item = outbox[index]
            let done: Bool
            switch item.kind {
            case .upsertCheckIn:
                guard let payload = item.payload else { index += 1; continue }
                if let saved = try? await api.upsertProgressCheckIn(payload) {
                    var merged = saved
                    merged.photos = checkIn(clientEntryId: item.clientEntryId)?.photos ?? saved.photos
                    replace(merged)
                    done = true
                } else { done = false }
            case .deleteCheckIn:
                if let id = item.serverId {
                    // Photos that only live as remote downloads get a real local file first,
                    // otherwise resetting to local-only ids would make them unreadable.
                    if await localizePhotos(for: item.clientEntryId, isSignedIn: isSignedIn) {
                        done = (try? await api.deleteProgressCheckIn(id: id)) != nil
                    } else {
                        done = false
                    }
                    // The cloud copy is gone: make the check-in local-only again so turning
                    // backup back on re-uploads it instead of skipping "synced" rows.
                    if done, var local = checkIn(clientEntryId: item.clientEntryId) {
                        local.id = "local-\(local.clientEntryId)"
                        local.photos = local.photos.map {
                            var p = $0
                            p.id = "local-\(p.clientPhotoId)"
                            p.url = nil
                            return p
                        }
                        replace(local)
                    }
                } else { done = true }
            case .photo:
                guard let clientPhotoId = item.clientPhotoId, let pose = item.pose,
                      var checkIn = checkIn(clientEntryId: item.clientEntryId),
                      let photo = checkIn.photos.first(where: { $0.clientPhotoId == clientPhotoId }),
                      let file = photoFileURL(photo),
                      let jpeg = try? Data(contentsOf: file) else { index += 1; continue }
                if let uploaded = try? await api.uploadProgressPhoto(
                    checkInClientEntryId: item.clientEntryId,
                    clientPhotoId: clientPhotoId,
                    pose: pose,
                    kind: item.photoKind ?? .PHOTO,
                    jpeg: jpeg
                ) {
                    var remote = uploaded
                    remote.localFile = photo.localFile
                    if let idx = checkIn.photos.firstIndex(where: { $0.clientPhotoId == clientPhotoId }) {
                        checkIn.photos[idx] = remote
                        replace(checkIn)
                    }
                    done = true
                } else { done = false }
            case .deletePhoto:
                if let id = item.serverId {
                    done = (try? await api.deleteProgressPhoto(id: id)) != nil
                } else { done = true }
            }
            if done {
                outbox.remove(at: index)
                persistOutbox()
            } else {
                index += 1
            }
        }
    }

    public func clear() {
        checkIns = []
        outbox = []
        try? FileManager.default.removeItem(at: directory)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    // MARK: Helpers

    /// Gives every photo of the check-in a real file on disk: move the downloaded
    /// `remote-<id>.jpg` cache to `<clientPhotoId>.jpg` and set `localFile`, or download it
    /// first when nothing is cached. Returns false when any photo can't be localized.
    private func localizePhotos(for clientEntryId: String, isSignedIn: Bool) async -> Bool {
        guard var checkIn = checkIn(clientEntryId: clientEntryId) else { return true }
        var changed = false
        for index in checkIn.photos.indices where checkIn.photos[index].localFile == nil {
            let photo = checkIn.photos[index]
            let cacheFile = directory.appendingPathComponent("remote-\(photo.id).jpg")
            let destFile = "\(photo.clientPhotoId).jpg"
            if let data = try? Data(contentsOf: cacheFile) {
                try? data.write(to: directory.appendingPathComponent(destFile), options: .atomic)
            } else {
                guard let bytes = await photoData(photo, isSignedIn: isSignedIn),
                      (try? bytes.write(to: directory.appendingPathComponent(destFile), options: .atomic)) != nil
                else { return false }
            }
            checkIn.photos[index].localFile = destFile
            changed = true
        }
        if changed { replace(checkIn) }
        return true
    }

    private func removePhotoFiles(_ photo: ProgressPhotoDto) {
        if let file = photoFileURL(photo) { try? FileManager.default.removeItem(at: file) }
        try? FileManager.default.removeItem(at: directory.appendingPathComponent("remote-\(photo.id).jpg"))
    }

    private func replace(_ checkIn: ProgressCheckInDto) {
        if let idx = checkIns.firstIndex(where: { $0.clientEntryId == checkIn.clientEntryId }) {
            checkIns[idx] = checkIn
        } else {
            checkIns.append(checkIn)
        }
        checkIns = Self.sorted(checkIns)
        persistCheckIns()
    }

    private static func sorted(_ list: [ProgressCheckInDto]) -> [ProgressCheckInDto] {
        list.sorted { $0.takenAt > $1.takenAt }
    }

    private func persistCheckIns() {
        write(checkIns, to: Self.checkInsFile)
    }

    private func persistOutbox() {
        write(outbox, to: Self.outboxFile)
    }

    private func read<T: Decodable>(_ file: String) -> T? {
        guard let data = try? Data(contentsOf: directory.appendingPathComponent(file)) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    private func write<T: Encodable>(_ value: T, to file: String) {
        guard let data = try? JSONEncoder().encode(value) else { return }
        try? data.write(to: directory.appendingPathComponent(file), options: [.atomic, .completeFileProtection])
    }

    /// JPEG bytes, EXIF-free, long edge ≤ 2048. `UIImage` re-encoding strips all metadata.
    public static func normalizedJpeg(_ data: Data) -> Data? {
        #if os(iOS)
        guard let image = UIImage(data: data) else { return nil }
        let maxEdge: CGFloat = 2048
        var size = image.size
        let longest = max(size.width, size.height)
        if longest > maxEdge {
            let scale = maxEdge / longest
            size = CGSize(width: size.width * scale, height: size.height * scale)
        }
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let rendered = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
        return rendered.jpegData(compressionQuality: 0.82)
        #else
        return nil
        #endif
    }
}

public extension ProgressCheckInDto {
    func toUpsert() -> UpsertProgressCheckInDto {
        UpsertProgressCheckInDto(
            clientEntryId: clientEntryId,
            takenAt: takenAt,
            note: note,
            bodyWeightClientEntryId: bodyWeightClientEntryId
        )
    }
}

public extension ProgressPose {
    /// FRONT < SIDE < BACK, matching the picker order.
    var sortOrder: Int {
        switch self {
        case .FRONT: return 0
        case .SIDE: return 1
        case .BACK: return 2
        }
    }
}
