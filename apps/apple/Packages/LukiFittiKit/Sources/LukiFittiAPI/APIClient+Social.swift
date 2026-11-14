import Foundation
import LukiFittiModels

/// Social, push-device and inbox endpoints (PR 1 part A contract). All routes sit behind the
/// server-side `SocialEnabledGuard`, so every call can throw 403 when social is off for this user.
extension APIClient {
    // MARK: - Social profile

    public func fetchSocialMe() async throws -> SocialProfileDto {
        try await request(path: "/api/social/me", method: "GET")
    }

    public func updateSocialMe(_ dto: UpdateSocialProfileDto) async throws -> SocialProfileDto {
        try await request(path: "/api/social/me", method: "PATCH", body: dto)
    }

    public func handleAvailability(_ handle: String) async throws -> HandleAvailabilityDto {
        try await request(path: "/api/social/handles/\(Self.pathComponent(handle))/availability", method: "GET")
    }

    /// Uploads one JPEG avatar (multipart/form-data; ≤ 2 MB — downscale before calling).
    public func uploadAvatar(jpeg: Data) async throws -> SocialProfileDto {
        let boundary = "LukiFitti-\(UUID().uuidString)"
        var body = Data()
        body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"avatar\"; filename=\"avatar.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n".utf8))
        body.append(jpeg)
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))
        let data = try await send(
            path: "/api/social/me/avatar",
            method: "PUT",
            body: body,
            contentType: "multipart/form-data; boundary=\(boundary)"
        )
        return try Self.decodeEnvelope(data)
    }

    public func deleteAvatar() async throws -> SocialProfileDto {
        try await request(path: "/api/social/me/avatar", method: "DELETE")
    }

    // MARK: - Discovery, friends, invites

    public func searchSocialUsers(query: String) async throws -> [SocialUserDto] {
        let q = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query
        return try await request(path: "/api/social/search?q=\(q)", method: "GET")
    }

    public func fetchFriendLists() async throws -> FriendListsDto {
        try await request(path: "/api/social/friends", method: "GET")
    }

    public func sendFriendRequest(userId: String) async throws -> SocialUserDto {
        struct Body: Encodable { let userId: String }
        struct Resp: Decodable { let relation: SocialRelation }
        let res: Resp = try await request(path: "/api/social/friends/requests", method: "POST", body: Body(userId: userId))
        return SocialUserDto(userId: userId, handle: "", avatarUrl: nil, name: nil, relation: res.relation)
    }

    public func acceptFriendRequest(userId: String) async throws {
        struct Resp: Decodable {}
        let _: Resp = try await request(
            path: "/api/social/friends/requests/\(Self.pathComponent(userId))/accept", method: "POST")
    }

    public func declineFriendRequest(userId: String) async throws {
        struct Resp: Decodable {}
        let _: Resp = try await request(
            path: "/api/social/friends/requests/\(Self.pathComponent(userId))/decline", method: "POST")
    }

    /// Unfriends a FRIEND row or withdraws an OUTGOING request (server treats both silently).
    public func removeFriend(userId: String) async throws {
        struct Resp: Decodable {}
        let _: Resp = try await request(
            path: "/api/social/friends/\(Self.pathComponent(userId))", method: "DELETE")
    }

    public func createInvite() async throws -> FriendInviteDto {
        try await request(path: "/api/social/invites", method: "POST")
    }

    public func previewInvite(token: String) async throws -> SocialCardDto {
        try await request(path: "/api/social/invites/\(Self.pathComponent(token))", method: "GET")
    }

    public func acceptInvite(token: String) async throws {
        struct Resp: Decodable { let relation: SocialRelation? }
        let _: Resp = try await request(
            path: "/api/social/invites/\(Self.pathComponent(token))/accept", method: "POST")
    }

    /// SHA-256 email hashes matched server-side; hashes are never stored or logged there.
    public func matchContacts(hashes: [String]) async throws -> [SocialUserDto] {
        struct Body: Encodable { let hashes: [String] }
        if hashes.isEmpty { return [] }
        return try await request(path: "/api/social/contacts/match", method: "POST", body: Body(hashes: hashes))
    }

    // MARK: - Blocks & reports

    /// Rows carry `userId`/`handle`/`avatarUrl` (+ `blockedAt`), which decode onto `SocialCardDto`.
    public func fetchBlocks() async throws -> [SocialCardDto] {
        try await request(path: "/api/social/blocks", method: "GET")
    }

    public func createBlock(userId: String) async throws {
        struct Body: Encodable { let userId: String }
        struct Resp: Decodable {}
        let _: Resp = try await request(path: "/api/social/blocks", method: "POST", body: Body(userId: userId))
    }

    public func deleteBlock(userId: String) async throws {
        struct Resp: Decodable {}
        let _: Resp = try await request(
            path: "/api/social/blocks/\(Self.pathComponent(userId))", method: "DELETE")
    }

    public func createReport(userId: String, reason: ReportReason, details: String?) async throws {
        struct Body: Encodable {
            let userId: String
            let reason: ReportReason
            let details: String?
        }
        struct Resp: Decodable {}
        let _: Resp = try await request(
            path: "/api/social/reports",
            method: "POST",
            body: Body(userId: userId, reason: reason, details: details))
    }

    // MARK: - Push devices & preferences

    public func fetchPushConfig() async throws -> PushConfigDto {
        try await request(path: "/api/push/config", method: "GET")
    }

    public func registerPushDevice(_ dto: RegisterPushDeviceDto) async throws {
        struct Resp: Decodable {}
        let _: Resp = try await request(path: "/api/push/devices", method: "PUT", body: dto)
    }

    public func deletePushDevice(token: String) async throws {
        struct Body: Encodable { let token: String }
        struct Resp: Decodable {}
        let _: Resp = try await request(path: "/api/push/devices", method: "DELETE", body: Body(token: token))
    }

    public func fetchPushPreferences() async throws -> PushPreferencesDto {
        try await request(path: "/api/push/preferences", method: "GET")
    }

    public func updatePushPreferences(_ dto: UpdatePushPreferencesDto) async throws -> PushPreferencesDto {
        try await request(path: "/api/push/preferences", method: "PATCH", body: dto)
    }

    // MARK: - Inbox

    public func fetchNotifications(cursor: String? = nil, limit: Int = 20) async throws -> NotificationListDto {
        var path = "/api/notifications?limit=\(limit)"
        if let cursor {
            let c = cursor.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? cursor
            path += "&cursor=\(c)"
        }
        return try await request(path: path, method: "GET")
    }

    /// `ids == nil` marks everything read; returns how many rows changed.
    @discardableResult
    public func markNotificationsRead(ids: [String]? = nil) async throws -> Int {
        struct Body: Encodable {
            let ids: [String]?
            let all: Bool?
        }
        struct Resp: Decodable { let updated: Int? }
        let body = ids == nil ? Body(ids: nil, all: true) : Body(ids: ids, all: nil)
        let res: Resp = try await request(path: "/api/notifications/read", method: "POST", body: body)
        return res.updated ?? 0
    }
}
