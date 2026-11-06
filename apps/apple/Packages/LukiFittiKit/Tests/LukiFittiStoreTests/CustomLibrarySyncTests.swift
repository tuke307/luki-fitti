import XCTest
@testable import LukiFittiModels
@testable import LukiFittiAPI
@testable import LukiFittiStore

private final class LibraryTokenStore: TokenStoring, @unchecked Sendable {
    var tokens: AuthTokensDto? = AuthTokensDto(
        accessToken: "FAKE-ACCESS", refreshToken: "FAKE-REFRESH", expiresAt: "2099-12-01T00:00:00Z"
    )
    func saveTokens(_ tokens: AuthTokensDto, userId: String?) throws { self.tokens = tokens }
    func loadTokens() -> AuthTokensDto? { tokens }
    func loadUserId() -> String? { nil }
    func clearTokens() { tokens = nil }
}

/// In-memory stand-in for `/api/exercises` (create) and `/api/stretching/routines`.
private final class FakeLibraryServer: @unchecked Sendable {
    private let lock = NSLock()
    private var routines: [String: StretchingRoutineDto] = [:]
    private var exerciseCount = 0
    private var offline = false
    private var rejectExercises = false
    private(set) var log: [String] = []
    private(set) var bodies: [String: [String: Any]] = [:]

    var requests: [String] { lock.withLock { log } }
    var routineIds: Set<String> { lock.withLock { Set(routines.keys) } }
    func routine(_ id: String) -> StretchingRoutineDto? { lock.withLock { routines[id] } }
    func lastBody(_ key: String) -> [String: Any]? { lock.withLock { bodies[key] } }
    func setOffline(_ value: Bool) { lock.withLock { offline = value } }
    func setRejectExercises(_ value: Bool) { lock.withLock { rejectExercises = value } }
    func put(_ routine: StretchingRoutineDto) { lock.withLock { routines[routine.id] = routine } }

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

    private func routine(from b: [String: Any], id: String) -> StretchingRoutineDto {
        let items = (b["exercises"] as? [[String: Any]] ?? []).enumerated().map { idx, e in
            StretchingRoutineExerciseDto(
                routineId: id,
                exerciseId: e["exerciseId"] as? String ?? "",
                orderIndex: idx,
                sets: e["sets"] as? Int ?? 1,
                durationSeconds: e["durationSeconds"] as? Int,
                transitionSeconds: e["transitionSeconds"] as? Int ?? 15
            )
        }
        return StretchingRoutineDto(
            id: id,
            userId: "u1",
            name: b["name"] as? String ?? "",
            description: b["description"] as? String,
            targetArea: b["targetArea"] as? String ?? "Full Body",
            estimatedDurationSeconds: b["estimatedDurationSeconds"] as? Int ?? 600,
            exercises: items
        )
    }

    private func envelope<T: Encodable>(_ value: T) -> Data {
        let data = (try? JSONEncoder().encode(value)) ?? Data()
        return Data(#"{"success":true,"data":"#.utf8) + data + Data("}".utf8)
    }

    func respond(to request: URLRequest) -> (Int, Data)? {
        let path = request.url?.path ?? ""
        let method = request.httpMethod ?? "GET"
        let b = body(request)
        return lock.withLock {
            if offline { return nil }
            log.append("\(method) \(path)")
            bodies["\(method) \(path)"] = b
            let notFound = (404, Data(#"{"error":"Not found"}"#.utf8))
            switch (method, path) {
            case ("POST", "/api/exercises"):
                if rejectExercises { return (400, Data(#"{"error":"Invalid"}"#.utf8)) }
                exerciseCount += 1
                let created = ExerciseDto(
                    id: UUID().uuidString.lowercased(),
                    slug: "custom-\(exerciseCount)",
                    userId: "u1",
                    name: b["name"] as? String ?? "",
                    description: b["description"] as? String ?? "",
                    primaryMuscleGroup: MuscleGroup(rawValue: b["primaryMuscleGroup"] as? String ?? "") ?? .CHEST
                )
                return (201, envelope(created))
            case ("GET", "/api/stretching/routines"):
                return (200, envelope(Array(routines.values)))
            case ("POST", "/api/stretching/routines"):
                let created = routine(from: b, id: UUID().uuidString.lowercased())
                routines[created.id] = created
                return (201, envelope(created))
            default:
                let parts = path.split(separator: "/").map(String.init) // api, stretching, routines, id
                guard parts.count == 4, parts[1] == "stretching" else { return (500, Data()) }
                let id = parts[3]
                guard routines[id] != nil else { return notFound }
                if method == "DELETE" {
                    routines[id] = nil
                    return (200, Data(#"{"success":true,"data":{}}"#.utf8))
                }
                let updated = routine(from: b, id: id)
                routines[id] = updated
                return (200, envelope(updated))
            }
        }
    }
}

private final class FakeLibraryURLProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var servers: [String: FakeLibraryServer] = [:]
    static let lock = NSLock()

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let host = request.url?.host ?? ""
        let server = Self.lock.withLock { Self.servers[host] }
        guard let (status, body) = server?.respond(to: request) else {
            client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet))
            return
        }
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

final class CustomLibrarySyncTests: XCTestCase {
    private var directories: [URL] = []

    override func tearDown() {
        for dir in directories { try? FileManager.default.removeItem(at: dir) }
        directories = []
        super.tearDown()
    }

    @MainActor
    private func makeStore(server: FakeLibraryServer, signedIn: Bool = true, dir existing: URL? = nil) -> OfflineStore {
        let host = "library-\(UUID().uuidString.lowercased()).test"
        FakeLibraryURLProtocol.lock.withLock { FakeLibraryURLProtocol.servers[host] = server }
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [FakeLibraryURLProtocol.self]
        let client = APIClient(
            baseURL: URL(string: "https://\(host)")!,
            tokenStore: LibraryTokenStore(),
            session: URLSession(configuration: config)
        )
        let dir = existing ?? FileManager.default.temporaryDirectory
            .appendingPathComponent("CustomLibrarySyncTests-\(UUID().uuidString)", isDirectory: true)
        if existing == nil { directories.append(dir) }
        let store = OfflineStore(storageDirectory: dir, apiClient: client)
        if signedIn { store.saveAuthenticatedUser(UserDto(id: "u1", email: "me@example.com")) }
        return store
    }

    private func draft(_ name: String = "Pendlay Row") -> ExerciseDto {
        ExerciseDto(
            id: "",
            slug: "",
            name: name,
            description: "",
            primaryMuscleGroup: .BACK,
            equipment: .BARBELL,
            movementPattern: .HORIZONTAL_PULL,
            laterality: .BILATERAL
        )
    }

    private func routine(using exerciseId: String, name: String = "Evening Hips") -> StretchingRoutineDto {
        StretchingRoutineDto(
            name: name,
            targetArea: "Hips",
            exercises: [StretchingRoutineExerciseDto(routineId: "new", exerciseId: exerciseId, orderIndex: 0, sets: 2, durationSeconds: 60, transitionSeconds: 15)]
        )
    }

    // MARK: - Guests

    @MainActor
    func testGuestKeepsCustomExerciseAndRoutineLocallyAcrossRestarts() async {
        let server = FakeLibraryServer()
        let store = makeStore(server: server, signedIn: false)
        let created = store.createCustomExercise(draft())
        XCTAssertTrue(CustomLibraryOutbox.isLocalExerciseId(created.id))
        XCTAssertFalse(created.isSystem)
        let saved = store.saveStretchingRoutine(routine(using: created.id))
        XCTAssertTrue(CustomLibraryOutbox.isLocalRoutineId(saved.id))
        // 2 × (60 s hold + 15 s transition).
        XCTAssertEqual(saved.estimatedDurationSeconds, 150)
        XCTAssertEqual(saved.exercises.first?.exercise?.id, created.id)

        await store.flushSyncQueue()
        XCTAssertTrue(server.requests.isEmpty, "Guests never upload")
        XCTAssertEqual(store.customLibraryPendingCount, 0)

        let reloaded = makeStore(server: server, signedIn: false, dir: directories.last)
        XCTAssertTrue(reloaded.catalog.contains { $0.id == created.id && $0.name == "Pendlay Row" })
        XCTAssertTrue(reloaded.stretchingRoutines.contains { $0.id == saved.id })
    }

    @MainActor
    func testEditAndDeleteRoutineLocally() {
        let store = makeStore(server: FakeLibraryServer(), signedIn: false)
        let stretch = store.catalog.first { $0.exerciseType == .STRETCHING }!
        var saved = store.saveStretchingRoutine(routine(using: stretch.id))
        saved.name = "Morning Hips"
        saved.exercises[0].sets = 3
        let edited = store.saveStretchingRoutine(saved)
        XCTAssertEqual(edited.id, saved.id)
        XCTAssertEqual(store.stretchingRoutines.filter { $0.id == saved.id }.map(\.name), ["Morning Hips"])
        XCTAssertEqual(edited.estimatedDurationSeconds, 3 * 75)

        store.deleteStretchingRoutine(id: saved.id)
        XCTAssertFalse(store.stretchingRoutines.contains { $0.id == saved.id })
        // A local-only routine never needs a server delete.
        XCTAssertTrue(store.libraryOutbox.deletedRoutineIds.isEmpty)
    }

    // MARK: - Signed in

    @MainActor
    func testUploadSwapsLocalExerciseIdEverywhere() async {
        let server = FakeLibraryServer()
        let store = makeStore(server: server)
        let created = store.createCustomExercise(draft())
        let localRoutine = store.saveStretchingRoutine(routine(using: created.id))

        // A workout that uses the new exercise.
        var folder = WorkoutFolderDto(id: WorkoutOutbox.newId(), userId: "u1", name: "Pull")
        folder.templates = [WorkoutTemplateDto(
            id: WorkoutOutbox.newId(), userId: "u1", folderId: folder.id, name: "Back day",
            exercises: [WorkoutTemplateExerciseDto(templateId: "t", exerciseId: created.id, orderIndex: 0)]
        )]
        store.saveWorkoutsOverview(folders: [folder], unfiledTemplates: [])
        XCTAssertEqual(store.customLibraryPendingCount, 2)

        await store.flushCustomLibrary()

        let body = server.lastBody("POST /api/exercises")
        XCTAssertEqual(body?["name"] as? String, "Pendlay Row")
        XCTAssertEqual(body?["description"] as? String, "Pendlay Row custom exercise")
        XCTAssertEqual(body?["movementPattern"] as? String, "HORIZONTAL_PULL")
        XCTAssertEqual(body?["laterality"] as? String, "BILATERAL")

        XCTAssertFalse(store.catalog.contains { $0.id == created.id })
        let serverExercise = store.catalog.first { $0.name == "Pendlay Row" }!
        XCTAssertTrue(WorkoutOutbox.isServerId(serverExercise.id))

        // The routine went up after the exercise, with the server's exercise id.
        XCTAssertFalse(store.stretchingRoutines.contains { $0.id == localRoutine.id })
        let uploaded = store.stretchingRoutines.first { $0.name == "Evening Hips" }!
        XCTAssertTrue(server.routineIds.contains(uploaded.id))
        XCTAssertEqual(server.routine(uploaded.id)?.exercises.first?.exerciseId, serverExercise.id)

        XCTAssertEqual(store.folders.first?.templates.first?.exercises.first?.exerciseId, serverExercise.id)
        XCTAssertTrue(store.workoutOutbox.contains { $0.kind == .template }, "The workout is re-sent with the new id")
        XCTAssertEqual(store.customLibraryPendingCount, 0)
        XCTAssertEqual(server.requests, ["POST /api/exercises", "POST /api/stretching/routines"])
    }

    @MainActor
    func testOfflineChangesWaitAndServerRefreshKeepsThem() async {
        let server = FakeLibraryServer()
        let existing = StretchingRoutineDto(id: UUID().uuidString.lowercased(), userId: "u1", name: "Desk reset", exercises: [])
        let doomed = StretchingRoutineDto(id: UUID().uuidString.lowercased(), userId: "u1", name: "Old flow", exercises: [])
        server.put(existing)
        server.put(doomed)
        let store = makeStore(server: server)
        store.applyServerStretchingRoutines([existing, doomed])

        server.setOffline(true)
        var edited = existing
        edited.name = "Desk reset (long)"
        store.saveStretchingRoutine(edited)
        store.deleteStretchingRoutine(id: doomed.id)
        let stretch = store.catalog.first { $0.exerciseType == .STRETCHING }!
        let local = store.saveStretchingRoutine(routine(using: stretch.id, name: "Offline flow"))
        await store.flushCustomLibrary()
        XCTAssertEqual(store.customLibraryPendingCount, 3)
        XCTAssertEqual(store.syncState, .SAVED_LOCALLY)

        // A download while changes are pending keeps them.
        store.applyServerStretchingRoutines([existing, doomed])
        XCTAssertEqual(store.stretchingRoutines.first { $0.id == existing.id }?.name, "Desk reset (long)")
        XCTAssertFalse(store.stretchingRoutines.contains { $0.id == doomed.id })
        XCTAssertTrue(store.stretchingRoutines.contains { $0.id == local.id })

        server.setOffline(false)
        await store.flushCustomLibrary()
        XCTAssertEqual(server.routine(existing.id)?.name, "Desk reset (long)")
        XCTAssertNil(server.routine(doomed.id))
        XCTAssertTrue(server.routineIds.contains { server.routine($0)?.name == "Offline flow" })
        XCTAssertEqual(store.customLibraryPendingCount, 0)
        XCTAssertTrue(store.libraryOutbox.isEmpty)
    }

    @MainActor
    func testRejectedExerciseStaysLocalAndIsNotRetried() async {
        let server = FakeLibraryServer()
        server.setRejectExercises(true)
        let store = makeStore(server: server)
        let created = store.createCustomExercise(draft("Zercher thing"))
        await store.flushCustomLibrary()
        await store.flushCustomLibrary()
        XCTAssertEqual(server.requests, ["POST /api/exercises"])
        XCTAssertTrue(store.catalog.contains { $0.id == created.id })
        XCTAssertEqual(store.customLibraryPendingCount, 0)
    }

    func testRoutineBodyIsClampedToTheSchema() {
        var r = StretchingRoutineDto(name: "  Hips  ", description: "  ", targetArea: " ", estimatedDurationSeconds: 5)
        r.exercises = [StretchingRoutineExerciseDto(routineId: "r", exerciseId: "x", orderIndex: 4, sets: 20, durationSeconds: 2, transitionSeconds: 500)]
        let body = StretchingRoutineUpsertDto(from: r)
        XCTAssertEqual(body.name, "Hips")
        XCTAssertNil(body.description)
        XCTAssertEqual(body.targetArea, "Full Body")
        XCTAssertEqual(body.estimatedDurationSeconds, 30)
        XCTAssertEqual(body.exercises.first?.orderIndex, 0)
        XCTAssertEqual(body.exercises.first?.sets, 10)
        XCTAssertEqual(body.exercises.first?.durationSeconds, 5)
        XCTAssertEqual(body.exercises.first?.transitionSeconds, 120)
    }
}
