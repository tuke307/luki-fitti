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

private struct APIEnvelope<T: Decodable>: Decodable {
    let success: Bool?
    let data: T?
    let message: String?
}

private struct RefreshResponseDto: Decodable {
    let success: Bool
    let tokens: AuthTokensDto?
}

public actor APIClient {
    public let baseURL: URL
    public let tokenStore: any TokenStoring
    private let session: URLSession
    private var inFlightRefreshTask: Task<Bool, Never>?

    public init(
        baseURL: URL = URL(string: "http://localhost:3001")!,
        tokenStore: any TokenStoring = KeychainTokenStore(),
        session: URLSession = .shared
    ) {
        self.baseURL = baseURL
        self.tokenStore = tokenStore
        self.session = session
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
        try await request(path: "/api/exercises?limit=200", method: "GET", requiresAuth: false)
    }

    public func fetchWorkoutsOverview() async throws -> WorkoutsOverviewDto {
        try await request(path: "/api/workouts", method: "GET")
    }

    public func fetchStretchingRoutines() async throws -> [StretchingRoutineDto] {
        try await request(path: "/api/stretching-routines", method: "GET")
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
            throw APIClientError.unauthorized
        }
        if http.statusCode == 403 {
            throw APIClientError.forbidden("Forbidden")
        }
        if !(200...299).contains(http.statusCode) {
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

private struct AnyEncodable: Encodable {
    private let encodeFunc: (Encoder) throws -> Void
    init(_ wrapped: any Encodable) {
        self.encodeFunc = wrapped.encode(to:)
    }
    func encode(to encoder: Encoder) throws {
        try encodeFunc(encoder)
    }
}
