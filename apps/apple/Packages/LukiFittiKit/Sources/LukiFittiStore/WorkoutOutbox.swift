import Foundation
import LukiFittiModels

/// A queued folder/template change of a signed-in user (mirrors `workout-outbox.ts` on the web).
/// Changes apply locally right away and are sent by `OfflineStore.flushWorkoutOutbox()`; until
/// then they are laid over every server overview, so nothing comes back or disappears.
public struct WorkoutOutboxOp: Codable, Sendable, Equatable {
    public enum Kind: String, Codable, Sendable { case folder, template }
    public enum Action: String, Codable, Sendable { case upsert, delete }

    public var kind: Kind
    public var id: String
    public var action: Action
    /// Snapshot for folder upserts (`templates` is always empty).
    public var folder: WorkoutFolderDto?
    /// Snapshot for template upserts.
    public var template: WorkoutTemplateDto?
    public var queuedAt: String
    /// Unique per enqueue: a flush only removes the op it actually sent.
    public var opId: String
    /// Whether the server has (or may have) this entity. A delete of an unknown one is dropped.
    public var serverKnown: Bool
    /// Failed attempts with a server error (5xx).
    public var attempts: Int

    public var key: String { "\(kind.rawValue):\(id)" }

    init(kind: Kind, id: String, action: Action, folder: WorkoutFolderDto? = nil, template: WorkoutTemplateDto? = nil, serverKnown: Bool) {
        self.kind = kind
        self.id = id
        self.action = action
        self.folder = folder
        self.template = template
        self.queuedAt = ISO8601DateFormatter().string(from: Date())
        self.opId = UUID().uuidString.lowercased()
        self.serverKnown = serverKnown
        self.attempts = 0
    }

    /// `serverKnown: false` for entities created on this device.
    public static func upsert(_ folder: WorkoutFolderDto, serverKnown: Bool = true) -> WorkoutOutboxOp {
        var snapshot = folder
        snapshot.templates = []
        return WorkoutOutboxOp(kind: .folder, id: folder.id, action: .upsert, folder: snapshot, serverKnown: serverKnown)
    }

    public static func upsert(_ template: WorkoutTemplateDto, serverKnown: Bool = true) -> WorkoutOutboxOp {
        WorkoutOutboxOp(kind: .template, id: template.id, action: .upsert, template: template, serverKnown: serverKnown)
    }

    public static func delete(_ kind: Kind, id: String) -> WorkoutOutboxOp {
        WorkoutOutboxOp(kind: kind, id: id, action: .delete, serverKnown: true)
    }

    fileprivate var flushRank: Int {
        switch (action, kind) {
        case (.upsert, .folder): return 0
        case (.upsert, .template): return 1
        case (.delete, .template): return 2
        case (.delete, .folder): return 3
        }
    }
}

public enum WorkoutOutbox {
    public static let maxServerErrorAttempts = 5

    /// Server rows always have UUIDs; bundled starter content and old local entities don't.
    public static func isServerId(_ id: String) -> Bool {
        id.count == 36 && UUID(uuidString: id) != nil
    }

    public static let starterIds: Set<String> = {
        let folders = StarterCatalogLoader.load(locale: .en).folders
        return Set(folders.map(\.id) + folders.flatMap { $0.templates.map(\.id) })
    }()

    /// Plain lowercase UUID for new folders and workouts.
    public static func newId() -> String { UUID().uuidString.lowercased() }

    /// Adds `op`, replacing any older op for the same entity. A delete of an entity the server has
    /// never confirmed drops both, unless a request for it is in flight (it may just be arriving).
    public static func enqueue(_ op: WorkoutOutboxOp, into outbox: [WorkoutOutboxOp], inFlightKeys: Set<String> = []) -> [WorkoutOutboxOp] {
        let existing = outbox.first { $0.key == op.key }
        var rest = outbox.filter { $0.key != op.key }
        var next = op
        next.serverKnown = (existing?.serverKnown ?? op.serverKnown) || inFlightKeys.contains(op.key)
        if op.action == .delete && !next.serverKnown { return rest }
        rest.append(next)
        return rest
    }

    /// Folder upserts → template upserts → template deletes → folder deletes (stable).
    public static func flushOrder(_ outbox: [WorkoutOutboxOp]) -> [WorkoutOutboxOp] {
        outbox.enumerated()
            .sorted { ($0.element.flushRank, $0.offset) < ($1.element.flushRank, $1.offset) }
            .map(\.element)
    }

    /// Applies still-pending ops to an overview (e.g. the server's), like the server will.
    public static func overlay(_ overview: WorkoutsOverviewDto, with outbox: [WorkoutOutboxOp]) -> WorkoutsOverviewDto {
        var folders = overview.folders
        var unfiled = overview.unfiledTemplates
        for op in flushOrder(outbox) {
            switch (op.kind, op.action) {
            case (.folder, .upsert):
                guard let snapshot = op.folder else { continue }
                if let idx = folders.firstIndex(where: { $0.id == op.id }) {
                    let templates = folders[idx].templates
                    folders[idx] = snapshot
                    folders[idx].templates = templates
                } else {
                    folders.append(snapshot)
                }
            case (.template, .upsert):
                guard var tpl = op.template else { continue }
                let targetIdx = tpl.folderId.flatMap { fid in folders.firstIndex { $0.id == fid } }
                if targetIdx == nil { tpl.folderId = nil }
                func replaceOrAppend(_ list: inout [WorkoutTemplateDto]) {
                    if let i = list.firstIndex(where: { $0.id == tpl.id }) { list[i] = tpl } else { list.append(tpl) }
                }
                for i in folders.indices where i != targetIdx {
                    folders[i].templates.removeAll { $0.id == tpl.id }
                }
                if let targetIdx {
                    replaceOrAppend(&folders[targetIdx].templates)
                    unfiled.removeAll { $0.id == tpl.id }
                } else {
                    replaceOrAppend(&unfiled)
                }
            case (.template, .delete):
                for i in folders.indices { folders[i].templates.removeAll { $0.id == op.id } }
                unfiled.removeAll { $0.id == op.id }
            case (.folder, .delete):
                guard let idx = folders.firstIndex(where: { $0.id == op.id }) else { continue }
                let removed = folders.remove(at: idx)
                unfiled += removed.templates.map { var t = $0; t.folderId = nil; return t }
            }
        }
        let sorted = folders.enumerated()
            .sorted { ($0.element.sortOrder, $0.offset) < ($1.element.sortOrder, $1.offset) }
            .map(\.element)
        return WorkoutsOverviewDto(folders: sorted, unfiledTemplates: unfiled)
    }

    /// Entities created before the outbox existed (non-UUID id, not starter content) get a UUID so
    /// they can be uploaded; template folder references follow. Returns the upserts to enqueue.
    public static func rekeyLegacyEntities(
        _ overview: WorkoutsOverviewDto,
        makeId: () -> String = newId
    ) -> (overview: WorkoutsOverviewDto, ops: [WorkoutOutboxOp]) {
        func isLegacy(_ id: String) -> Bool { !isServerId(id) && !starterIds.contains(id) }
        var folderIds: [String: String] = [:]
        for f in overview.folders where isLegacy(f.id) { folderIds[f.id] = makeId() }

        var folderOps: [WorkoutOutboxOp] = []
        var templateOps: [WorkoutOutboxOp] = []
        func rekey(_ t: WorkoutTemplateDto) -> WorkoutTemplateDto {
            let legacy = isLegacy(t.id)
            let folderId = t.folderId.map { folderIds[$0] ?? $0 }
            guard legacy || folderId != t.folderId else { return t }
            var next = t
            if legacy {
                next.id = makeId()
                next.systemKey = nil
            }
            next.folderId = folderId
            for i in next.exercises.indices { next.exercises[i].templateId = next.id }
            if isServerId(next.id) { templateOps.append(.upsert(next, serverKnown: !legacy)) }
            return next
        }

        let folders = overview.folders.map { f -> WorkoutFolderDto in
            var folder = f
            if let newId = folderIds[f.id] {
                folder.id = newId
                folder.systemKey = nil
                folderOps.append(.upsert(folder, serverKnown: false))
            }
            folder.templates = folder.templates.map(rekey)
            return folder
        }
        let unfiled = overview.unfiledTemplates.map(rekey)
        let ops = folderOps + templateOps
        guard !ops.isEmpty else { return (overview, []) }
        return (WorkoutsOverviewDto(folders: folders, unfiledTemplates: unfiled), ops)
    }

    /// "Name (2)", "Name (3)", … — the first name not taken locally (≤ 80 characters).
    public static func nextFolderName(_ name: String, taken: [String]) -> String {
        var base = name
        if let range = base.range(of: #" \(\d+\)$"#, options: .regularExpression) {
            base.removeSubrange(range)
        }
        var used = Set(taken.map { $0.lowercased() })
        used.insert(name.lowercased())
        var n = 2
        while true {
            let suffix = " (\(n))"
            let candidate = String(base.prefix(80 - suffix.count)) + suffix
            if !used.contains(candidate.lowercased()) { return candidate }
            n += 1
        }
    }

    /// PUT body. Untouched starter copies (`systemKey`) only send structural fields: their text
    /// would detach them from the catalog (they'd stop following the app language).
    public static func body(for folder: WorkoutFolderDto, includeId: Bool = false) -> WorkoutFolderUpsertDto {
        WorkoutFolderUpsertDto(
            id: includeId ? folder.id : nil,
            name: folder.systemKey == nil ? String(folder.name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(80)) : nil,
            color: folder.color,
            sortOrder: max(0, folder.sortOrder)
        )
    }

    public static func body(for template: WorkoutTemplateDto, includeId: Bool = false) -> WorkoutTemplateUpsertDto {
        let name = String(template.name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(100))
        let description = template.description?.trimmingCharacters(in: .whitespacesAndNewlines)
        return WorkoutTemplateUpsertDto(
            id: includeId ? template.id : nil,
            // Starter folders of guests never reach the server: such workouts are unfiled there.
            folderId: template.folderId.flatMap { isServerId($0) ? $0 : nil },
            sortOrder: max(0, template.sortOrder),
            estimatedDurationMinutes: min(360, max(5, template.estimatedDurationMinutes ?? 60)),
            trainingGoal: template.trainingGoal,
            text: template.systemKey != nil ? nil : .init(
                name: name.isEmpty ? "Workout" : name,
                description: description.flatMap { $0.isEmpty ? nil : String($0.prefix(500)) },
                exercises: template.exercises.enumerated().map { TemplateExerciseInputDto($1, orderIndex: $0) }
            )
        )
    }
}
