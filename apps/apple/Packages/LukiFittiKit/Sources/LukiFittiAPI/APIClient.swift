import Foundation
import LukiFittiModels

public enum APIClientError: Error, LocalizedError, Sendable, Equatable {
    case invalidURL
    case unauthorized
    case forbidden(String)
    case offline(String)
    case serverError(Int, String)
    case decodingError(String)

    public var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid API URL"
        case .unauthorized: return "Authentication required"
        case .forbidden(let msg): return msg
        case .offline(let msg): return msg
        case .serverError(_, let msg): return msg
        case .decodingError(let msg): return msg
        }
    }
}

private struct APIErrorDetail: Decodable {
    let message: String?
}

private struct APIEnvelope<T: Decodable>: Decodable {
    let success: Bool?
    let data: T?
    let message: String?
    let error: APIErrorDetail?
}

private struct RefreshResponseDto: Decodable {
    let success: Bool
    let tokens: AuthTokensDto?
}

public actor APIClient {
    public nonisolated let baseURL: URL
    public nonisolated let tokenStore: any TokenStoring
    private let session: URLSession
    private var inFlightRefreshTask: Task<Bool, Never>?
    /// Language of catalog content (exercise names, steps, starter workouts) returned by the API.
    private var locale: SupportedLocale = .resolve(nil)

    public init(
        baseURL: URL = APIClient.defaultBaseURL,
        tokenStore: any TokenStoring = KeychainTokenStore(),
        session: URLSession = .shared
    ) {
        self.baseURL = baseURL
        self.tokenStore = tokenStore
        self.session = session
    }

    public func setLocale(_ locale: SupportedLocale) {
        self.locale = locale
    }

    public static var defaultBaseURL: URL {
        if let envURL = ProcessInfo.processInfo.environment["LUKIFITTI_API_BASE_URL"],
           let parsed = URL(string: envURL),
           parsed.scheme != nil {
            return parsed
        }
        if let plistURL = Bundle.main.object(forInfoDictionaryKey: "LUKIFITTI_API_BASE_URL") as? String,
           let parsed = URL(string: plistURL),
           parsed.scheme != nil {
            return parsed
        }
        #if DEBUG
        return URL(string: "http://localhost:3001")!
        #else
        return URL(string: "https://luki-fitti.tony-luke.de")!
        #endif
    }

    public func isAuthenticated() -> Bool {
        tokenStore.loadTokens() != nil
    }

    // MARK: - Auth Endpoints

    public func login(email: String, password: String) async throws -> UserDto {
        struct Body: Encodable { let email: String; let password: String }
        let user: UserDto = try await request(
            path: "/api/auth/login",
            method: "POST",
            body: Body(email: email, password: password),
            requiresAuth: false
        )
        if let tokens = user.tokens {
            try? tokenStore.saveTokens(tokens, userId: user.id)
        }
        return user
    }

    public func register(email: String, password: String, name: String?, weightUnit: WeightUnit = .KG) async throws -> UserDto {
        struct Body: Encodable {
            let email: String
            let password: String
            let name: String?
            let weightUnit: WeightUnit
        }
        let user: UserDto = try await request(
            path: "/api/auth/register",
            method: "POST",
            body: Body(email: email, password: password, name: name, weightUnit: weightUnit),
            requiresAuth: false
        )
        if let tokens = user.tokens {
            try? tokenStore.saveTokens(tokens, userId: user.id)
        }
        return user
    }

    public func verifyEmail(token: String) async throws -> UserDto {
        struct Body: Encodable { let token: String }
        let user: UserDto = try await request(
            path: "/api/auth/verify-email",
            method: "POST",
            body: Body(token: token),
            requiresAuth: false
        )
        if let tokens = user.tokens {
            try? tokenStore.saveTokens(tokens, userId: user.id)
        }
        return user
    }

    public func forgotPassword(email: String) async throws {
        struct Body: Encodable { let email: String }
        struct EmptyResp: Decodable {}
        let _: EmptyResp = try await request(
            path: "/api/auth/forgot-password",
            method: "POST",
            body: Body(email: email),
            requiresAuth: false
        )
    }

    public func resetPassword(token: String, newPassword: String) async throws {
        struct Body: Encodable { let token: String; let newPassword: String }
        struct EmptyResp: Decodable {}
        let _: EmptyResp = try await request(
            path: "/api/auth/reset-password",
            method: "POST",
            body: Body(token: token, newPassword: newPassword),
            requiresAuth: false
        )
    }

    public func requestAccountDeletion(password: String) async throws {
        struct Body: Encodable { let password: String }
        struct EmptyResp: Decodable {}
        let _: EmptyResp = try await request(
            path: "/api/auth/request-delete-account",
            method: "POST",
            body: Body(password: password)
        )
    }

    public func confirmAccountDeletion(token: String) async throws {
        struct Body: Encodable { let token: String }
        struct EmptyResp: Decodable {}
        let _: EmptyResp = try await request(
            path: "/api/auth/confirm-delete-account",
            method: "POST",
            body: Body(token: token),
            requiresAuth: false
        )
        tokenStore.clearTokens()
    }

    public func getMe() async throws -> UserDto {
        try await request(path: "/api/auth/me", method: "GET")
    }

    public func updatePreferences(_ dto: UpdatePreferencesDto) async throws -> UserDto {
        try await request(path: "/api/auth/preferences", method: "PATCH", body: dto)
    }

    public func logout() async {
        struct EmptyBody: Encodable {}
        struct EmptyResp: Decodable {}
        _ = try? await request(path: "/api/auth/logout", method: "POST", body: EmptyBody()) as EmptyResp
        tokenStore.clearTokens()
    }

    // MARK: - Workouts, Exercises & Sessions Endpoints

    public func fetchExercises() async throws -> [ExerciseDto] {
        try await request(path: "/api/exercises?limit=200", method: "GET", requiresAuth: true)
    }

    public func fetchWorkoutsOverview() async throws -> WorkoutsOverviewDto {
        try await request(path: "/api/workouts", method: "GET")
    }

    public func fetchStretchingRoutines() async throws -> [StretchingRoutineDto] {
        try await request(path: "/api/stretching/routines", method: "GET")
    }

    public func syncSession(_ payload: SyncSessionPayloadDto) async throws -> SyncSessionResponseDto {
        try await request(path: "/api/sessions/sync", method: "POST", body: payload)
    }

    public func fetchSessions() async throws -> [WorkoutSessionDto] {
        try await request(path: "/api/sessions", method: "GET")
    }

    public func deleteSession(sessionId: String) async throws {
        struct Resp: Decodable { let success: Bool? }
        let _: Resp = try await request(path: "/api/sessions/\(sessionId)", method: "DELETE")
    }

    public func fetchAnalyticsSummary(period: String = "month") async throws -> AnalyticsSummaryDto {
        try await request(path: "/api/analytics/summary?period=\(period)", method: "GET")
    }

    // MARK: - Nutrition, AI & Exercise Feedback

    public func fetchMealEntries(from: Date, to: Date) async throws -> [MealEntryDto] {
        let f = ISO8601DateFormatter()
        var components = URLComponents()
        components.queryItems = [
            URLQueryItem(name: "from", value: f.string(from: from)),
            URLQueryItem(name: "to", value: f.string(from: to)),
        ]
        return try await request(path: "/api/nutrition/entries?\(components.percentEncodedQuery ?? "")", method: "GET")
    }

    public func upsertMealEntry(_ dto: UpsertMealEntryDto) async throws -> MealEntryDto {
        try await request(path: "/api/nutrition/entries", method: "PUT", body: dto)
    }

    public func deleteMealEntry(id: String) async throws {
        struct Resp: Decodable { let success: Bool? }
        let _: Resp = try await request(path: "/api/nutrition/entries/\(Self.pathComponent(id))", method: "DELETE")
    }

    public func fetchRecentMealItems() async throws -> [MealItemDto] {
        try await request(path: "/api/nutrition/recent-items", method: "GET")
    }

    // MARK: - Body Weight

    /// Weigh-ins sorted by `measuredAt` ascending. Both bounds are optional (whole history).
    public func fetchBodyWeightEntries(from: Date? = nil, to: Date? = nil) async throws -> [BodyWeightEntryDto] {
        let f = ISO8601DateFormatter()
        var items: [URLQueryItem] = []
        if let from { items.append(URLQueryItem(name: "from", value: f.string(from: from))) }
        if let to { items.append(URLQueryItem(name: "to", value: f.string(from: to))) }
        var components = URLComponents()
        components.queryItems = items.isEmpty ? nil : items
        let query = components.percentEncodedQuery.map { "?\($0)" } ?? ""
        return try await request(path: "/api/body-weight/entries\(query)", method: "GET")
    }

    /// Idempotent upsert keyed by `clientEntryId`.
    public func upsertBodyWeightEntry(_ dto: UpsertBodyWeightEntryDto) async throws -> BodyWeightEntryDto {
        try await request(path: "/api/body-weight/entries", method: "PUT", body: dto)
    }

    public func deleteBodyWeightEntry(id: String) async throws {
        struct Resp: Decodable { let success: Bool? }
        let _: Resp = try await request(path: "/api/body-weight/entries/\(Self.pathComponent(id))", method: "DELETE")
    }

    /// Uploads Apple Health weigh-ins (≤ 500 samples and ≤ 500 deletions per call).
    public func importBodyWeight(_ dto: ImportBodyWeightDto) async throws -> ImportBodyWeightResultDto {
        try await request(path: "/api/body-weight/import", method: "POST", body: dto)
    }

    // MARK: - Health Activity

    /// Uploads Apple Health daily active energy and workouts (≤ 400 days, ≤ 2000 workouts per call).
    public func importHealthActivity(_ dto: ImportHealthActivityDto) async throws -> ImportHealthActivityResultDto {
        try await request(path: "/api/activity/import", method: "POST", body: dto)
    }

    /// Daily active energy and workouts imported from Apple Health (range ≤ 400 days).
    public func fetchHealthActivity(from: Date, to: Date) async throws -> HealthActivityDto {
        let f = ISO8601DateFormatter()
        var components = URLComponents()
        components.queryItems = [
            URLQueryItem(name: "from", value: f.string(from: from)),
            URLQueryItem(name: "to", value: f.string(from: to)),
        ]
        return try await request(path: "/api/activity?\(components.percentEncodedQuery ?? "")", method: "GET")
    }

    public func buildWorkout(_ dto: WorkoutBuilderRequestDto) async throws -> WorkoutBuilderResponseDto {
        try await request(path: "/api/ai/workout-builder", method: "POST", body: dto)
    }

    /// Own AI requests, tokens and cost over the last `days` (7, 30 or 90).
    public func fetchMyAiUsage(days: Int = 30) async throws -> MyAiUsageDto {
        let range = [7, 30, 90].contains(days) ? days : 30
        return try await request(path: "/api/ai/usage/me?days=\(range)", method: "GET")
    }

    public func fetchExerciseFeedback() async throws -> [ExerciseFeedbackDto] {
        try await request(path: "/api/exercise-feedback", method: "GET")
    }

    public func setExerciseFeedback(exerciseId: String, verdict: ExerciseFeedbackVerdict?) async throws {
        struct Body: Encodable { let verdict: ExerciseFeedbackVerdict }
        struct Resp: Decodable {}
        let path = "/api/exercise-feedback/\(Self.pathComponent(exerciseId))"
        if let verdict {
            let _: ExerciseFeedbackDto = try await request(path: path, method: "PUT", body: Body(verdict: verdict))
        } else {
            let _: Resp = try await request(path: path, method: "DELETE")
        }
    }

    /// Uploads JPEG photos of one meal for AI analysis (multipart/form-data).
    public func analyzeMeal(
        jpegPhotos: [Data],
        clientEntryId: String,
        eatenAt: Date,
        mealType: MealType?,
        hint: String?
    ) async throws -> MealAnalysisResponseDto {
        let boundary = "LukiFitti-\(UUID().uuidString)"
        var body = Data()
        func field(_ name: String, _ value: String) {
            body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n".utf8))
        }
        field("clientEntryId", clientEntryId)
        field("eatenAt", ISO8601DateFormatter().string(from: eatenAt))
        if let mealType { field("mealType", mealType.rawValue) }
        if let hint, !hint.isEmpty { field("hint", hint) }
        for (index, jpeg) in jpegPhotos.enumerated() {
            body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"photos\"; filename=\"meal-\(index + 1).jpg\"\r\nContent-Type: image/jpeg\r\n\r\n".utf8))
            body.append(jpeg)
            body.append(Data("\r\n".utf8))
        }
        body.append(Data("--\(boundary)--\r\n".utf8))
        let data = try await send(
            path: "/api/ai/meal-analysis",
            method: "POST",
            body: body,
            contentType: "multipart/form-data; boundary=\(boundary)"
        )
        return try Self.decodeEnvelope(data)
    }

    /// Proposes foods from a written meal description (stateless; nothing is saved).
    public func describeMeal(_ dto: MealTextAnalysisRequestDto) async throws -> MealTextAnalysisResponseDto {
        try await request(path: "/api/ai/meal-text-analysis", method: "POST", body: dto)
    }

    /// Raw bytes of an authenticated API resource (e.g. a meal photo URL path).
    public func fetchData(path: String) async throws -> Data {
        try await send(path: path, method: "GET", body: nil, contentType: nil)
    }

    private static func pathComponent(_ raw: String) -> String {
        raw.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))) ?? raw
    }

    private static func decodeEnvelope<T: Decodable>(_ data: Data) throws -> T {
        let decoder = JSONDecoder()
        if let envelope = try? decoder.decode(APIEnvelope<T>.self, from: data), let unwrapped = envelope.data {
            return unwrapped
        }
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIClientError.decodingError(error.localizedDescription)
        }
    }

    /// Authenticated request with a raw body and response (multipart uploads, binary downloads).
    private func send(
        path: String,
        method: String,
        body: Data?,
        contentType: String?,
        allowRetryOn401: Bool = true
    ) async throws -> Data {
        guard let url = URL(string: path, relativeTo: baseURL) else { throw APIClientError.invalidURL }
        guard let tokens = tokenStore.loadTokens() else { throw APIClientError.unauthorized }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.timeoutInterval = 90
        if let contentType { req.setValue(contentType, forHTTPHeaderField: "Content-Type") }
        req.setValue("apple", forHTTPHeaderField: "X-Client-Platform")
        req.setValue(locale.rawValue, forHTTPHeaderField: "Accept-Language")
        req.setValue("Bearer \(tokens.accessToken)", forHTTPHeaderField: "Authorization")
        req.httpBody = body

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw APIClientError.offline(error.localizedDescription)
        }
        guard let http = response as? HTTPURLResponse else { throw APIClientError.offline("Invalid HTTP response") }
        if http.statusCode == 401 && allowRetryOn401 {
            guard await tryRefreshSession() else {
                tokenStore.clearTokens()
                throw APIClientError.unauthorized
            }
            return try await send(path: path, method: method, body: body, contentType: contentType, allowRetryOn401: false)
        }
        guard (200...299).contains(http.statusCode) else {
            let msg = (try? JSONDecoder().decode(APIEnvelope<EmptyObject>.self, from: data))
                .flatMap { $0.error?.message ?? $0.message } ?? "HTTP \(http.statusCode)"
            if http.statusCode == 403 { throw APIClientError.forbidden(msg) }
            throw APIClientError.serverError(http.statusCode, msg)
        }
        return data
    }

    // MARK: - Core Request & Single-Flight Token Refresh

    public func request<T: Decodable>(
        path: String,
        method: String,
        body: (any Encodable)? = nil,
        requiresAuth: Bool = true,
        allowRetryOn401: Bool = true
    ) async throws -> T {
        guard let url = URL(string: path, relativeTo: baseURL) else {
            throw APIClientError.invalidURL
        }

        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("apple", forHTTPHeaderField: "X-Client-Platform")
        req.setValue(locale.rawValue, forHTTPHeaderField: "Accept-Language")

        if let tokens = tokenStore.loadTokens() {
            req.setValue("Bearer \(tokens.accessToken)", forHTTPHeaderField: "Authorization")
        } else if requiresAuth {
            throw APIClientError.unauthorized
        }

        if let body {
            req.httpBody = try JSONEncoder().encode(AnyEncodable(body))
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw APIClientError.offline(error.localizedDescription)
        }

        guard let http = response as? HTTPURLResponse else {
            throw APIClientError.offline("Invalid HTTP response")
        }

        if http.statusCode == 401 && allowRetryOn401 && path != "/api/auth/refresh-token" && path != "/api/auth/login" {
            let refreshed = await tryRefreshSession()
            if refreshed {
                return try await request(
                    path: path,
                    method: method,
                    body: body,
                    requiresAuth: requiresAuth,
                    allowRetryOn401: false
                )
            }
            tokenStore.clearTokens()
            throw APIClientError.unauthorized
        }

        if http.statusCode == 401 {
            if let errEnv = try? JSONDecoder().decode(APIEnvelope<EmptyObject>.self, from: data),
               let msg = errEnv.error?.message ?? errEnv.message {
                throw APIClientError.serverError(401, msg)
            }
            throw APIClientError.unauthorized
        }
        if http.statusCode == 403 {
            if let errEnv = try? JSONDecoder().decode(APIEnvelope<EmptyObject>.self, from: data),
               let msg = errEnv.error?.message ?? errEnv.message {
                throw APIClientError.forbidden(msg)
            }
            throw APIClientError.forbidden("Forbidden")
        }
        if !(200...299).contains(http.statusCode) {
            if let errEnv = try? JSONDecoder().decode(APIEnvelope<EmptyObject>.self, from: data),
               let msg = errEnv.error?.message ?? errEnv.message {
                throw APIClientError.serverError(http.statusCode, msg)
            }
            let rawMsg = String(data: data, encoding: .utf8) ?? "HTTP \(http.statusCode)"
            throw APIClientError.serverError(http.statusCode, rawMsg)
        }

        let decoder = JSONDecoder()
        if let envelope = try? decoder.decode(APIEnvelope<T>.self, from: data),
           let unwrapped = envelope.data {
            return unwrapped
        }
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIClientError.decodingError(error.localizedDescription)
        }
    }

    public func tryRefreshSession() async -> Bool {
        if let existingTask = inFlightRefreshTask {
            return await existingTask.value
        }

        let task = Task<Bool, Never> {
            guard let currentTokens = tokenStore.loadTokens(),
                  let url = URL(string: "/api/auth/refresh-token", relativeTo: baseURL) else {
                return false
            }

            struct RefreshBody: Encodable { let refreshToken: String }
            var req = URLRequest(url: url)
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.setValue("apple", forHTTPHeaderField: "X-Client-Platform")
            req.httpBody = try? JSONEncoder().encode(RefreshBody(refreshToken: currentTokens.refreshToken))

            guard let (data, response) = try? await session.data(for: req),
                  let http = response as? HTTPURLResponse,
                  (200...299).contains(http.statusCode) else {
                return false
            }

            let decoder = JSONDecoder()
            if let envelope = try? decoder.decode(APIEnvelope<RefreshResponseDto>.self, from: data),
               let tokens = envelope.data?.tokens {
                try? tokenStore.saveTokens(tokens, userId: tokenStore.loadUserId())
                return true
            }
            if let direct = try? decoder.decode(RefreshResponseDto.self, from: data),
               let tokens = direct.tokens {
                try? tokenStore.saveTokens(tokens, userId: tokenStore.loadUserId())
                return true
            }
            return false
        }

        inFlightRefreshTask = task
        let result = await task.value
        inFlightRefreshTask = nil
        return result
    }
}

private struct EmptyObject: Decodable {}

private struct AnyEncodable: Encodable {
    private let encodeFunc: (Encoder) throws -> Void
    init(_ wrapped: any Encodable) {
        self.encodeFunc = wrapped.encode(to:)
    }
    func encode(to encoder: Encoder) throws {
        try encodeFunc(encoder)
    }
}
