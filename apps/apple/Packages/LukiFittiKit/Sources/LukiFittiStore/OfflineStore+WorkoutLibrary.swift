import Foundation
import os
import LukiFittiModels
import LukiFittiDomain
import LukiFittiAPI

private let workoutSyncLog = Logger(subsystem: "LukiFitti", category: "WorkoutSync")

/// Why `flushWorkoutOutbox()` stopped early (the rest of the outbox stays queued).
public enum WorkoutOutboxStopReason: Sendable, Equatable {
    case offline, server, auth
}

/// Folder and workout (template) edits. Every change applies locally right away; signed-in users
/// also queue it in the workout outbox, which is sent before every overview download.
extension OfflineStore {
    // MARK: - Mutations

    /// Creates a folder (`id == nil`) or renames / recolors one.
    public func saveFolder(id: String?, name: String, color: String) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        var folders = self.folders
        let op: WorkoutOutboxOp
        if let id, let idx = folders.firstIndex(where: { $0.id == id }) {
            // A renamed starter folder becomes the user's own text.
            if folders[idx].name != trimmed { folders[idx].systemKey = nil }
            folders[idx].name = trimmed
            folders[idx].color = color
            op = .upsert(folders[idx])
        } else {
            let folder = WorkoutFolderDto(
                id: WorkoutOutbox.newId(),
                userId: currentUser?.id ?? "local-user",
                name: trimmed,
                color: color,
                sortOrder: folders.count
            )
            folders.append(folder)
            op = .upsert(folder, serverKnown: false)
        }
        commitWorkouts(WorkoutsOverviewDto(folders: folders, unfiledTemplates: unfiledTemplates), ops: [op])
    }

    public func reorderFolder(id: String, moveUp: Bool) {
        var folders = self.folders
        guard let idx = folders.firstIndex(where: { $0.id == id }) else { return }
        let targetIdx = moveUp ? idx - 1 : idx + 1
        guard folders.indices.contains(targetIdx) else { return }
        folders.swapAt(idx, targetIdx)
        var ops: [WorkoutOutboxOp] = []
        for i in folders.indices where folders[i].sortOrder != i {
            folders[i].sortOrder = i
            ops.append(.upsert(folders[i]))
        }
        commitWorkouts(WorkoutsOverviewDto(folders: folders, unfiledTemplates: unfiledTemplates), ops: ops)
    }

    /// Deletes a folder; its workouts become unfiled (like on the server).
    public func deleteFolder(id: String) {
        guard let folder = folders.first(where: { $0.id == id }) else { return }
        let moved = folder.templates.map { t -> WorkoutTemplateDto in
            var copy = t
            copy.folderId = nil
            return copy
        }
        // Pending creates of its workouts must not point at the deleted folder.
        commitWorkouts(
            WorkoutsOverviewDto(folders: folders.filter { $0.id != id }, unfiledTemplates: unfiledTemplates + moved),
            ops: moved.map { .upsert($0) } + [.delete(.folder, id: id)]
        )
    }

    /// Saves the template builder: creates a workout (`editingTemplateId == nil`) or replaces the
    /// edited one's name, description, folder, duration and exercises in place.
    @discardableResult
    public func saveTemplate(
        editingTemplateId: String?,
        name: String,
        description: String,
        folderId: String?,
        durationMinutes: Int,
        exercises: [WorkoutTemplateExerciseDto]
    ) -> WorkoutTemplateDto? {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else { return nil }
        let existing = editingTemplateId.flatMap { template(id: $0) }
        let templateId = existing?.id ?? WorkoutOutbox.newId()
        let normalized = exercises.enumerated().map { idx, item -> WorkoutTemplateExerciseDto in
            var copy = item
            copy.templateId = templateId
            copy.orderIndex = idx
            if copy.exercise == nil {
                copy.exercise = catalog.first { $0.id == copy.exerciseId }
            }
            let range = TemplateSets.deriveRepRange(
                TemplateSets.resolve(copy),
                currentMin: copy.targetRepsMin,
                currentMax: copy.targetRepsMax
            )
            copy.targetRepsMin = range.min
            copy.targetRepsMax = range.max
            return copy
        }
        let trimmedDescription = description.trimmingCharacters(in: .whitespacesAndNewlines)
        let now = ISO8601DateFormatter().string(from: Date())
        var template = existing ?? WorkoutTemplateDto(
            id: templateId,
            userId: currentUser?.id ?? "local-user",
            name: trimmedName,
            sortOrder: siblings(ofFolder: folderId).count,
            createdAt: now
        )
        template.folderId = folderId
        template.name = trimmedName
        template.description = trimmedDescription.isEmpty ? nil : description
        template.estimatedDurationMinutes = durationMinutes
        template.exercises = normalized
        template.updatedAt = now
        // Edited text turns a starter copy into the user's own workout.
        template.systemKey = nil
        commitTemplate(template, serverKnown: existing != nil)
        return template
    }

    /// Inserts a copy right after `template` (same folder) under `name`.
    @discardableResult
    public func duplicateTemplate(_ template: WorkoutTemplateDto, name: String) -> WorkoutTemplateDto {
        let now = ISO8601DateFormatter().string(from: Date())
        var copy = template
        copy.id = WorkoutOutbox.newId()
        copy.systemKey = nil
        copy.name = name
        copy.userId = currentUser?.id ?? "local-user"
        copy.createdAt = now
        copy.updatedAt = now
        copy.exercises = template.exercises.enumerated().map { idx, ex in
            var e = ex
            e.id = WorkoutOutbox.newId()
            e.templateId = copy.id
            e.orderIndex = idx
            return e
        }

        var folders = self.folders
        var unfiled = unfiledTemplates
        let folderIdx = template.folderId.flatMap { fid in folders.firstIndex { $0.id == fid } }
        if folderIdx == nil { copy.folderId = nil }
        var list = folderIdx.map { folders[$0].templates } ?? unfiled
        let original = list
        let insertAt = list.firstIndex { $0.id == template.id }.map { $0 + 1 } ?? list.count
        list.insert(copy, at: insertAt)
        var ops: [WorkoutOutboxOp] = []
        for i in list.indices {
            list[i].sortOrder = i
            if list[i].id == copy.id {
                copy = list[i]
                ops.insert(.upsert(list[i], serverKnown: false), at: 0)
            } else if original.first(where: { $0.id == list[i].id })?.sortOrder != i {
                ops.append(.upsert(list[i]))
            }
        }
        if let folderIdx { folders[folderIdx].templates = list } else { unfiled = list }
        commitWorkouts(WorkoutsOverviewDto(folders: folders, unfiledTemplates: unfiled), ops: ops)
        return copy
    }

    /// Moves a workout to the end of a folder (`nil` = unfiled).
    public func moveTemplate(id: String, toFolderId: String?) {
        guard var template = template(id: id) else { return }
        template.folderId = toFolderId
        commitTemplate(template)
    }

    public func deleteTemplate(id: String) {
        var folders = self.folders
        for i in folders.indices { folders[i].templates.removeAll { $0.id == id } }
        commitWorkouts(
            WorkoutsOverviewDto(folders: folders, unfiledTemplates: unfiledTemplates.filter { $0.id != id }),
            ops: [.delete(.template, id: id)]
        )
    }

    /// Edits a saved workout's exercises in place (e.g. accepting a suggestion).
    public func updateTemplateExercises(id: String, _ transform: (inout [WorkoutTemplateExerciseDto]) -> Void) {
        guard var template = template(id: id) else { return }
        transform(&template.exercises)
        for i in template.exercises.indices { template.exercises[i].orderIndex = i }
        template.systemKey = nil
        template.updatedAt = ISO8601DateFormatter().string(from: Date())
        commitTemplate(template)
    }

    // MARK: - Local state & outbox

    func template(id: String) -> WorkoutTemplateDto? {
        folders.lazy.flatMap(\.templates).first { $0.id == id } ?? unfiledTemplates.first { $0.id == id }
    }

    private func siblings(ofFolder folderId: String?) -> [WorkoutTemplateDto] {
        folderId.flatMap { fid in folders.first { $0.id == fid }?.templates } ?? unfiledTemplates
    }

    /// Places `template` (in place when its folder is unchanged, else at the end) and queues it.
    private func commitTemplate(_ template: WorkoutTemplateDto, serverKnown: Bool = true) {
        let op = WorkoutOutboxOp.upsert(template, serverKnown: serverKnown)
        let current = WorkoutsOverviewDto(folders: folders, unfiledTemplates: unfiledTemplates)
        commitWorkouts(WorkoutOutbox.overlay(current, with: [op]), ops: [op])
    }

    /// Saves the overview (pushes it to the Watch) and queues `ops` for the server.
    func commitWorkouts(_ overview: WorkoutsOverviewDto, ops: [WorkoutOutboxOp]) {
        saveWorkoutsOverview(folders: overview.folders, unfiledTemplates: overview.unfiledTemplates)
        enqueueWorkoutOps(ops)
    }

    /// Only signed-in iPhones queue changes: guests stay local, starter content (non-UUID ids)
    /// never reaches the server, and the Watch only mirrors the iPhone's overview.
    func enqueueWorkoutOps(_ ops: [WorkoutOutboxOp]) {
        #if os(watchOS)
        return
        #else
        guard currentUser != nil else { return }
        let syncable = ops.filter { WorkoutOutbox.isServerId($0.id) }
        guard !syncable.isEmpty else { return }
        workoutOutbox = syncable.reduce(workoutOutbox) {
            WorkoutOutbox.enqueue($1, into: $0, inFlightKeys: inFlightWorkoutKeys)
        }
        writeJSON(workoutOutbox, to: "workout_outbox.json")
        updateSyncStateBadge()
        #endif
    }

    private func replaceWorkoutOutbox(_ outbox: [WorkoutOutboxOp]) {
        workoutOutbox = outbox
        writeJSON(workoutOutbox, to: "workout_outbox.json")
    }

    /// Replaces local folders and workouts with the server's, keeping changes not sent yet.
    public func applyServerWorkoutsOverview(_ overview: WorkoutsOverviewDto) {
        let merged = WorkoutOutbox.overlay(overview, with: workoutOutbox)
        saveWorkoutsOverview(folders: merged.folders, unfiledTemplates: merged.unfiledTemplates)
    }

    // MARK: - Flush

    /// Sends the outbox in `WorkoutOutbox.flushOrder`. Upserts are `PUT`s that fall back to a
    /// `POST` with the same id on 404; a delete's 404 counts as done. Stops (keeping the rest) when
    /// offline, on a server error or when the session expired; a folder name clash renames the
    /// folder ("Name (2)") and retries once; other rejected changes are dropped (`needsRefresh`).
    @discardableResult
    public func flushWorkoutOutbox() async -> (stoppedBy: WorkoutOutboxStopReason?, needsRefresh: Bool) {
        #if os(watchOS)
        return (nil, false)
        #else
        guard currentUser != nil, !isFlushingWorkoutOutbox else { return (nil, false) }
        isFlushingWorkoutOutbox = true
        defer {
            isFlushingWorkoutOutbox = false
            updateSyncStateBadge()
        }

        // Folders and workouts created before changes were queued get server ids and are uploaded.
        let legacy = WorkoutOutbox.rekeyLegacyEntities(
            WorkoutsOverviewDto(folders: folders, unfiledTemplates: unfiledTemplates)
        )
        if !legacy.ops.isEmpty { commitWorkouts(legacy.overview, ops: legacy.ops) }
        guard apiClient.isAuthenticated() else { return (nil, false) }

        var needsRefresh = false
        var attempted: Set<String> = []
        for _ in 0..<3 {
            let pending = WorkoutOutbox.flushOrder(workoutOutbox).filter { !attempted.contains($0.opId) }
            if pending.isEmpty { break }
            for queued in pending {
                attempted.insert(queued.opId)
                guard var op = workoutOutbox.first(where: { $0.opId == queued.opId }) else { continue }
                let key = op.key
                inFlightWorkoutKeys.insert(key)
                defer { inFlightWorkoutKeys.remove(key) }
                do {
                    var renamed = false
                    while true {
                        do {
                            if !(try await sendWorkoutOp(op)) { needsRefresh = true }
                            break
                        } catch let error as APIClientError
                                    where Self.status(of: error) == 409 && op.kind == .folder && op.action == .upsert && !renamed {
                            renamed = true
                            op = renameAfterNameClash(op)
                        }
                    }
                    let sent = op
                    replaceWorkoutOutbox(workoutOutbox.compactMap { x in
                        if x.opId == sent.opId { return nil }
                        // A newer change of the same entity: the server knows it now.
                        guard x.key == key, sent.action == .upsert else { return x }
                        var known = x
                        known.serverKnown = true
                        return known
                    })
                } catch {
                    let status = Self.status(of: error)
                    if status == 401 {
                        syncState = .AUTH_EXPIRED
                        return (.auth, needsRefresh)
                    }
                    if case APIClientError.offline = error { return (.offline, needsRefresh) }
                    if let status, status >= 500 || status == 408 || status == 429 {
                        let attempts = op.attempts + 1
                        if attempts < WorkoutOutbox.maxServerErrorAttempts {
                            replaceWorkoutOutbox(workoutOutbox.map { x in
                                guard x.opId == op.opId else { return x }
                                var retried = x
                                retried.attempts = attempts
                                return retried
                            })
                            return (.server, needsRefresh)
                        }
                    }
                    // 409 twice in a row stays queued for the next flush; anything else is given up.
                    if status == 409 && op.kind == .folder { continue }
                    replaceWorkoutOutbox(workoutOutbox.filter { $0.opId != op.opId })
                    workoutSyncLog.error(
                        "Dropped \(op.kind.rawValue, privacy: .public) \(op.action.rawValue, privacy: .public): \(error.localizedDescription, privacy: .public)"
                    )
                    needsRefresh = true
                }
            }
        }
        return (nil, needsRefresh)
        #endif
    }

    private static func status(of error: Error) -> Int? {
        switch error as? APIClientError {
        case .serverError(let status, _): return status
        case .forbidden, .aiKeyRequired: return 403
        case .unauthorized: return 401
        default: return nil
        }
    }

    private static func isNotFound(_ error: Error) -> Bool { status(of: error) == 404 }

    /// Renames the folder locally and in the queued op after a name clash.
    private func renameAfterNameClash(_ op: WorkoutOutboxOp) -> WorkoutOutboxOp {
        guard let folder = op.folder else { return op }
        let name = WorkoutOutbox.nextFolderName(folder.name, taken: folders.map(\.name))
        var next = op
        next.folder?.name = name
        next.folder?.systemKey = nil
        replaceWorkoutOutbox(workoutOutbox.map { $0.opId == op.opId ? next : $0 })
        var folders = self.folders
        if let idx = folders.firstIndex(where: { $0.id == op.id }) {
            folders[idx].name = name
            folders[idx].systemKey = nil
            saveWorkoutsOverview(folders: folders, unfiledTemplates: unfiledTemplates)
        }
        return next
    }

    /// Sends one op. Returns `false` when the entity is gone and can't be recreated.
    private func sendWorkoutOp(_ op: WorkoutOutboxOp) async throws -> Bool {
        do {
            switch (op.kind, op.action) {
            case (.folder, .delete), (.template, .delete):
                do {
                    if op.kind == .folder { try await apiClient.deleteFolder(id: op.id) }
                    else { try await apiClient.deleteTemplate(id: op.id) }
                } catch where Self.isNotFound(error) {}
                return true
            case (.folder, .upsert):
                guard let folder = op.folder else { return true }
                do {
                    try await apiClient.updateFolder(id: op.id, WorkoutOutbox.body(for: folder))
                    return true
                } catch where Self.isNotFound(error) {}
                // Not on the server (yet): create it under the same id. Starter copies can't be.
                guard folder.systemKey == nil else { return false }
                try await apiClient.createFolder(WorkoutOutbox.body(for: folder, includeId: true))
                return true
            case (.template, .upsert):
                guard let template = op.template else { return true }
                do {
                    try await apiClient.updateTemplate(id: op.id, WorkoutOutbox.body(for: template))
                    return true
                } catch where Self.isNotFound(error) {}
                guard template.systemKey == nil else { return false }
                try await apiClient.createTemplate(WorkoutOutbox.body(for: template, includeId: true))
                return true
            }
        } catch APIClientError.decodingError {
            // 2xx with an unexpected body: the change went through.
            return true
        }
    }
}
