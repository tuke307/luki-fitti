import XCTest
@testable import LukiFittiModels
@testable import LukiFittiAPI
@testable import LukiFittiStore

private final class FakeTokenStore: TokenStoring, @unchecked Sendable {
    var tokens: AuthTokensDto? = AuthTokensDto(
        accessToken: "FAKE-ACCESS", refreshToken: "FAKE-REFRESH", expiresAt: "2099-12-01T00:00:00Z"
    )
    func saveTokens(_ tokens: AuthTokensDto, userId: String?) throws { self.tokens = tokens }
    func loadTokens() -> AuthTokensDto? { tokens }
    func loadUserId() -> String? { nil }
    func clearTokens() { tokens = nil }
}

/// In-memory stand-in for `/api/workouts` (overview, folders, templates). Other endpoints answer
/// 500, so the store keeps its local data for those.
private final class FakeWorkoutsServer: @unchecked Sendable {
    private let lock = NSLock()
    private var folders: [String: WorkoutFolderDto] = [:]
    private var templates: [String: WorkoutTemplateDto] = [:]
    private var writesFail = false
    private var takenFolderNames: Set<String> = []
    private(set) var log: [String] = []

    var requests: [String] { lock.withLock { log } }
    var folderIds: Set<String> { lock.withLock { Set(folders.keys) } }
    var templateIds: Set<String> { lock.withLock { Set(templates.keys) } }
    func setWritesFail(_ fail: Bool) { lock.withLock { writesFail = fail } }
    func takeFolderName(_ name: String) { lock.withLock { _ = takenFolderNames.insert(name) } }
    func clearLog() { lock.withLock { log = [] } }
    func folder(_ id: String) -> WorkoutFolderDto? { lock.withLock { folders[id] } }
    func template(_ id: String) -> WorkoutTemplateDto? { lock.withLock { templates[id] } }

    func put(_ folder: WorkoutFolderDto) { lock.withLock { folders[folder.id] = folder } }
    func put(_ template: WorkoutTemplateDto) { lock.withLock { templates[template.id] = template } }
    func removeFolder(_ id: String) {
        lock.withLock {
            folders[id] = nil
            for (tid, t) in templates where t.folderId == id { templates[tid]?.folderId = nil }
        }
    }

    private func body(_ request: URLRequest) -> [String: Any] {
        var data = request.httpBody
        if data == nil, let stream = request.httpBodyStream {
            stream.open()
            var buffer = Data()
            let chunk = UnsafeMutablePointer<UInt8>.allocate(capacity: 4096)
            while stream.hasBytesAvailable {
                let n = stream.read(chunk, maxLength: 4096)
                if n <= 0 { break }
                buffer.append(chunk, count: n)
            }
            chunk.deallocate()
            stream.close()
            data = buffer
        }
        return data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] } ?? [:]
    }

    private func applyFolder(_ id: String, _ b: [String: Any]) -> (Int, Data)? {
        if let name = b["name"] as? String {
            if takenFolderNames.contains(name) || folders.values.contains(where: { $0.name == name && $0.id != id }) {
                return (409, Data(#"{"error":"A folder with this name already exists","details":{"code":"FOLDER_NAME_TAKEN"}}"#.utf8))
            }
            folders[id]?.name = name
        }
        if let color = b["color"] as? String { folders[id]?.color = color }
        if let sortOrder = b["sortOrder"] as? Int { folders[id]?.sortOrder = sortOrder }
        return nil
    }

    private func applyTemplate(_ id: String, _ b: [String: Any]) {
        if let name = b["name"] as? String { templates[id]?.name = name }
        if b.keys.contains("folderId") { templates[id]?.folderId = b["folderId"] as? String }
        if let sortOrder = b["sortOrder"] as? Int { templates[id]?.sortOrder = sortOrder }
    }

    func respond(to request: URLRequest) -> (Int, Data) {
        let path = request.url?.path ?? ""
        let method = request.httpMethod ?? "GET"
        let b = body(request)
        return lock.withLock {
            log.append("\(method) \(path)")
            let ok = (200, Data(#"{"success":true,"data":{}}"#.utf8))
            let notFound = (404, Data(#"{"error":"Not found"}"#.utf8))
            if method == "GET", path == "/api/workouts" {
                var list = folders.values.sorted { $0.sortOrder < $1.sortOrder }
                for i in list.indices { list[i].templates = templates.values.filter { $0.folderId == list[i].id } }
                let overview = WorkoutsOverviewDto(
                    folders: list,
                    unfiledTemplates: templates.values.filter { $0.folderId == nil }
                )
                return (200, (try? JSONEncoder().encode(overview)) ?? Data())
            }
            guard path.hasPrefix("/api/workouts/") else { return (500, Data(#"{"error":"Not mocked"}"#.utf8)) }
            if writesFail { return (503, Data(#"{"error":"Unavailable"}"#.utf8)) }
            let parts = path.split(separator: "/").map(String.init) // api, workouts, kind, id?
            let kind = parts[2]
            let id = parts.count > 3 ? parts[3] : nil
            switch (kind, method, id) {
            case ("folders", "POST", nil):
                guard let newId = b["id"] as? String else { return (400, Data()) }
                if folders[newId] != nil { return ok }
                if let name = b["name"] as? String,
                   takenFolderNames.contains(name) || folders.values.contains(where: { $0.name == name }) {
                    return (409, Data(#"{"error":"Taken","details":{"code":"FOLDER_NAME_TAKEN"}}"#.utf8))
                }
                folders[newId] = WorkoutFolderDto(id: newId, userId: "u1", name: b["name"] as? String ?? "")
                _ = applyFolder(newId, b)
                return ok
            case ("folders", "PUT", let id?):
                guard folders[id] != nil else { return notFound }
                return applyFolder(id, b) ?? ok
            case ("folders", "DELETE", let id?):
                guard folders[id] != nil else { return notFound }
                folders[id] = nil
                for (tid, t) in templates where t.folderId == id { templates[tid]?.folderId = nil }
                return ok
            case ("templates", "POST", nil):
                guard let newId = b["id"] as? String else { return (400, Data()) }
                if templates[newId] == nil {
                    templates[newId] = WorkoutTemplateDto(id: newId, userId: "u1", name: b["name"] as? String ?? "")
                    applyTemplate(newId, b)
                }
                return ok
            case ("templates", "PUT", let id?):
                guard templates[id] != nil else { return notFound }
                applyTemplate(id, b)
                return ok
            case ("templates", "DELETE", let id?):
                guard templates[id] != nil else { return notFound }
                templates[id] = nil
                return ok
            default:
                return (500, Data())
            }
        }
    }
}

private final class FakeWorkoutsURLProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var servers: [String: FakeWorkoutsServer] = [:]
    static let lock = NSLock()

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let host = request.url?.host ?? ""
        let server = Self.lock.withLock { Self.servers[host] }
        let (status, body) = server?.respond(to: request) ?? (500, Data())
        let response = HTTPURLResponse(
            url: request.url!, statusCode: status, httpVersion: nil,
            headerFields: ["Content-Type": "application/json"]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

final class WorkoutLibrarySyncTests: XCTestCase {
    private var directories: [URL] = []

    override func tearDown() {
        for dir in directories { try? FileManager.default.removeItem(at: dir) }
        directories = []
        super.tearDown()
    }

    @MainActor
    private func makeStore(server: FakeWorkoutsServer, signedIn: Bool = true, dir existing: URL? = nil) -> OfflineStore {
        let host = "fake-\(UUID().uuidString.lowercased()).test"
        FakeWorkoutsURLProtocol.lock.withLock { FakeWorkoutsURLProtocol.servers[host] = server }
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [FakeWorkoutsURLProtocol.self]
        let client = APIClient(
            baseURL: URL(string: "https://\(host)")!,
            tokenStore: FakeTokenStore(),
            session: URLSession(configuration: config)
        )
        let dir = existing ?? FileManager.default.temporaryDirectory
            .appendingPathComponent("WorkoutLibrarySyncTests-\(UUID().uuidString)", isDirectory: true)
        if existing == nil { directories.append(dir) }
        let store = OfflineStore(storageDirectory: dir, apiClient: client)
        if signedIn { store.saveAuthenticatedUser(UserDto(id: "u1", email: "me@example.com")) }
        return store
    }

    private func folder(_ name: String, sortOrder: Int = 0) -> WorkoutFolderDto {
        WorkoutFolderDto(id: WorkoutOutbox.newId(), userId: "u1", name: name, sortOrder: sortOrder)
    }

    // MARK: - Pure outbox logic

    func testCoalescing() {
        let created = folder("Legs")
        var renamed = created
        renamed.name = "Leg day"
        var outbox = WorkoutOutbox.enqueue(.upsert(created, serverKnown: false), into: [])
        outbox = WorkoutOutbox.enqueue(.upsert(renamed), into: outbox)
        XCTAssertEqual(outbox.count, 1)
        XCTAssertEqual(outbox[0].action, .upsert)
        XCTAssertFalse(outbox[0].serverKnown)
        XCTAssertEqual(outbox[0].folder?.name, "Leg day")

        // Created and deleted before it ever reached the server: nothing to send.
        XCTAssertTrue(WorkoutOutbox.enqueue(.delete(.folder, id: created.id), into: outbox).isEmpty)

        // Confirmed by the server (no pending op, or a pending edit): the delete is sent.
        let delete = WorkoutOutbox.enqueue(.delete(.folder, id: created.id), into: [])
        XCTAssertEqual(delete.map(\.action), [.delete])
        let afterEdit = WorkoutOutbox.enqueue(.delete(.folder, id: created.id), into: [.upsert(renamed)])
        XCTAssertEqual(afterEdit.map(\.action), [.delete])

        // Create in flight: the delete is kept, the create may just be arriving.
        let inFlight = WorkoutOutbox.enqueue(
            .delete(.folder, id: created.id),
            into: [.upsert(created, serverKnown: false)],
            inFlightKeys: ["folder:\(created.id)"]
        )
        XCTAssertEqual(inFlight.map(\.action), [.delete])
    }

    func testFlushOrderAndStructuralBodies() {
        let f = folder("Legs")
        let t = WorkoutTemplateDto(id: WorkoutOutbox.newId(), folderId: f.id, name: "Squat day")
        let ordered = WorkoutOutbox.flushOrder([
            .delete(.folder, id: "a"), .delete(.template, id: "b"), .upsert(t), .upsert(f),
        ])
        XCTAssertEqual(ordered.map { "\($0.action.rawValue):\($0.kind.rawValue)" },
                       ["upsert:folder", "upsert:template", "delete:template", "delete:folder"])

        var starter = f
        starter.systemKey = "folder-4er-split"
        XCTAssertNil(WorkoutOutbox.body(for: starter).name)
        XCTAssertEqual(WorkoutOutbox.body(for: f).name, "Legs")
        var starterTemplate = t
        starterTemplate.systemKey = "tpl-legs"
        starterTemplate.folderId = "folder-4er-split"
        let body = WorkoutOutbox.body(for: starterTemplate)
        XCTAssertNil(body.text)
        XCTAssertNil(body.folderId)
        let json = String(data: try! JSONEncoder().encode(body), encoding: .utf8)!
        XCTAssertTrue(json.contains(#""folderId":null"#), json)
        XCTAssertFalse(json.contains("name"), json)

        XCTAssertEqual(WorkoutOutbox.nextFolderName("Legs", taken: ["Legs", "Legs (2)"]), "Legs (3)")
    }

    // MARK: - Store + fake server

    @MainActor
    func testCreatesAreUploadedWithPutThenPostAndDeletesFollow() async throws {
        let server = FakeWorkoutsServer()
        let store = makeStore(server: server)
        store.saveFolder(id: nil, name: "Upper", color: "#E8743B")
        let folderId = try XCTUnwrap(store.folders.first { $0.name == "Upper" }?.id)
        XCTAssertTrue(WorkoutOutbox.isServerId(folderId))
        XCTAssertEqual(folderId, folderId.lowercased())
        let template = try XCTUnwrap(store.saveTemplate(
            editingTemplateId: nil, name: "Push", description: "", folderId: folderId,
            durationMinutes: 45, exercises: []
        ))
        XCTAssertEqual(store.workoutOutbox.count, 2)
        XCTAssertEqual(store.pendingChangesCount, 2)
        XCTAssertEqual(store.syncState, .SAVED_LOCALLY)

        await store.flushSyncQueue()
        XCTAssertEqual(server.requests, [
            "PUT /api/workouts/folders/\(folderId)",
            "POST /api/workouts/folders",
            "PUT /api/workouts/templates/\(template.id)",
            "POST /api/workouts/templates",
        ])
        XCTAssertEqual(server.template(template.id)?.folderId, folderId)
        XCTAssertTrue(store.workoutOutbox.isEmpty)
        XCTAssertEqual(store.syncState, .SYNCED)

        // Delete on the iPhone, plus a workout another device already deleted (404 = done).
        server.clearLog()
        let goneId = WorkoutOutbox.newId()
        store.deleteTemplate(id: template.id)
        store.enqueueWorkoutOps([.delete(.template, id: goneId)])
        store.deleteFolder(id: folderId)
        await store.flushSyncQueue()
        XCTAssertEqual(server.requests, [
            "DELETE /api/workouts/templates/\(template.id)",
            "DELETE /api/workouts/templates/\(goneId)",
            "DELETE /api/workouts/folders/\(folderId)",
        ])
        XCTAssertTrue(server.folderIds.isEmpty)
        XCTAssertTrue(server.templateIds.isEmpty)
        XCTAssertTrue(store.workoutOutbox.isEmpty)
    }

    @MainActor
    func testCreateThenDeleteBeforeSyncSendsNothing() async {
        let server = FakeWorkoutsServer()
        let store = makeStore(server: server)
        store.saveFolder(id: nil, name: "Temp", color: "#E8743B")
        let id = store.folders.first { $0.name == "Temp" }!.id
        store.deleteFolder(id: id)
        XCTAssertTrue(store.workoutOutbox.isEmpty)
        await store.flushWorkoutOutbox()
        XCTAssertTrue(server.requests.isEmpty)
    }

    /// Changes not sent yet (server down) are laid over the downloaded overview: a deleted folder
    /// doesn't come back and a new one doesn't disappear. A delete made on the web arrives.
    @MainActor
    func testRefreshKeepsPendingChangesAndAppliesServerDeletes() async throws {
        let server = FakeWorkoutsServer()
        let keep = folder("Keep", sortOrder: 0)
        let deleteHere = folder("Delete here", sortOrder: 1)
        let deleteOnWeb = folder("Delete on web", sortOrder: 2)
        for f in [keep, deleteHere, deleteOnWeb] { server.put(f) }
        let store = makeStore(server: server)
        await store.refreshFromServerAfterAuth()
        XCTAssertEqual(store.folders.map(\.name), ["Keep", "Delete here", "Delete on web"])

        server.setWritesFail(true)
        store.deleteFolder(id: deleteHere.id)
        store.saveFolder(id: nil, name: "New offline", color: "#E8743B")
        server.removeFolder(deleteOnWeb.id)
        await store.refreshFromServerAfterAuth()
        XCTAssertEqual(store.folders.map(\.name), ["Keep", "New offline"])
        XCTAssertEqual(store.workoutOutbox.count, 2)
        XCTAssertEqual(store.workoutOutbox.map(\.attempts).max(), 1)

        server.setWritesFail(false)
        await store.refreshFromServerAfterAuth()
        XCTAssertEqual(store.folders.map(\.name), ["Keep", "New offline"])
        XCTAssertTrue(store.workoutOutbox.isEmpty)
        XCTAssertEqual(Set(server.folderIds), Set(store.folders.map(\.id)))
    }

    @MainActor
    func testFolderNameClashRenamesAndRetries() async {
        let server = FakeWorkoutsServer()
        server.takeFolderName("Legs")
        let store = makeStore(server: server)
        store.saveFolder(id: nil, name: "Legs", color: "#E8743B")
        await store.flushWorkoutOutbox()
        XCTAssertTrue(store.workoutOutbox.isEmpty)
        XCTAssertTrue(store.folders.contains { $0.name == "Legs (2)" })
        XCTAssertEqual(server.folderIds.compactMap { server.folder($0)?.name }, ["Legs (2)"])
    }

    @MainActor
    func testGuestChangesStayLocal() async {
        let server = FakeWorkoutsServer()
        let store = makeStore(server: server, signedIn: false)
        store.saveFolder(id: nil, name: "Mine", color: "#E8743B")
        XCTAssertTrue(store.workoutOutbox.isEmpty)
        await store.flushSyncQueue()
        XCTAssertTrue(server.requests.isEmpty)
    }

    /// Deleting every folder must not bring the starter folders back on the next launch.
    @MainActor
    func testEmptySavedOverviewDoesNotRestoreStarterFolders() {
        let server = FakeWorkoutsServer()
        let store = makeStore(server: server, signedIn: false)
        XCTAssertFalse(store.folders.isEmpty)
        for f in store.folders { store.deleteFolder(id: f.id) }
        for t in store.unfiledTemplates { store.deleteTemplate(id: t.id) }
        XCTAssertTrue(store.folders.isEmpty)
        let dir = store.storageDirectoryURL
        let reloaded = makeStore(server: server, signedIn: false, dir: dir)
        XCTAssertTrue(reloaded.folders.isEmpty)
        XCTAssertTrue(reloaded.unfiledTemplates.isEmpty)
    }

    /// Folders and workouts created before the outbox existed get UUIDs and are uploaded; starter
    /// content is left alone.
    @MainActor
    func testLegacyLocalEntitiesAreRekeyedAndUploaded() async throws {
        let server = FakeWorkoutsServer()
        let store = makeStore(server: server)
        let starterFolders = store.folders
        let legacyFolder = WorkoutFolderDto(id: "folder-legacy-1", userId: "u1", name: "Old folder", sortOrder: 9)
        var legacyTemplate = WorkoutTemplateDto(id: "tpl-legacy-1", folderId: "folder-legacy-1", name: "Old workout")
        legacyTemplate.exercises = [WorkoutTemplateExerciseDto(templateId: "tpl-legacy-1", exerciseId: "ex-1", orderIndex: 0)]
        var withTemplate = legacyFolder
        withTemplate.templates = [legacyTemplate]
        store.saveWorkoutsOverview(folders: starterFolders + [withTemplate], unfiledTemplates: [])

        await store.flushWorkoutOutbox()
        let folder = try XCTUnwrap(store.folders.first { $0.name == "Old folder" })
        let template = try XCTUnwrap(folder.templates.first)
        XCTAssertTrue(WorkoutOutbox.isServerId(folder.id))
        XCTAssertTrue(WorkoutOutbox.isServerId(template.id))
        XCTAssertEqual(template.folderId, folder.id)
        XCTAssertEqual(template.exercises.first?.templateId, template.id)
        XCTAssertEqual(server.folderIds, [folder.id])
        XCTAssertEqual(server.templateIds, [template.id])
        XCTAssertEqual(server.template(template.id)?.folderId, folder.id)
        // Bundled starter folders keep their catalog ids and are never uploaded.
        XCTAssertEqual(Array(store.folders.prefix(starterFolders.count)).map(\.id), starterFolders.map(\.id))
        XCTAssertTrue(store.workoutOutbox.isEmpty)
    }

    @MainActor
    func testOutboxSurvivesRelaunch() {
        let server = FakeWorkoutsServer()
        let store = makeStore(server: server)
        store.saveFolder(id: nil, name: "Persisted", color: "#E8743B")
        let reloaded = makeStore(server: server, dir: store.storageDirectoryURL)
        XCTAssertEqual(reloaded.workoutOutbox.map(\.folder?.name), ["Persisted"])
        XCTAssertEqual(reloaded.syncState, .SAVED_LOCALLY)
    }
}
