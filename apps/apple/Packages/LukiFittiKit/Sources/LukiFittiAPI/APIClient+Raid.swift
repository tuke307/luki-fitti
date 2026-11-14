import Foundation
import LukiFittiModels

/// Raid and squad endpoints (PR 4 part A contract). Routes sit behind the
/// `SocialEnabledGuard` plus `raidsEnabled`, so calls can throw 403 while the
/// feature is off — the caller hides the section instead of surfacing it.
extension APIClient {
    // MARK: - Raids

    public func fetchRaids() async throws -> RaidListDto {
        try await request(path: "/api/raids/current", method: "GET")
    }

    public func fetchRaidBosses() async throws -> [RaidBossDto] {
        try await request(path: "/api/raids/bosses", method: "GET")
    }

    public func fetchRaidDetail(raidId: String) async throws -> RaidDetailDto {
        try await request(path: "/api/raids/\(Self.pathComponent(raidId))", method: "GET")
    }

    public func fetchRaidFeed(raidId: String, cursor: String? = nil) async throws -> RaidFeedDto {
        var path = "/api/raids/\(Self.pathComponent(raidId))/feed"
        if let cursor {
            let escaped = cursor.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? cursor
            path += "?cursor=\(escaped)"
        }
        return try await request(path: path, method: "GET")
    }

    /// Marks a finished raid's result as shown (drives `pendingResults`).
    public func markRaidSeen(raidId: String) async throws {
        struct Resp: Decodable {}
        let _: Resp = try await request(
            path: "/api/raids/\(Self.pathComponent(raidId))/seen", method: "POST")
    }

    // MARK: - Squads

    public func fetchSquads() async throws -> SquadListDto {
        try await request(path: "/api/squads", method: "GET")
    }

    public func createSquad(name: String) async throws -> SquadDto {
        struct Body: Encodable { let name: String }
        return try await request(path: "/api/squads", method: "POST", body: Body(name: name))
    }

    public func renameSquad(squadId: String, name: String) async throws {
        struct Body: Encodable { let name: String }
        struct Resp: Decodable {}
        let _: Resp = try await request(
            path: "/api/squads/\(Self.pathComponent(squadId))", method: "PATCH",
            body: Body(name: name))
    }

    public func deleteSquad(squadId: String) async throws {
        struct Resp: Decodable {}
        let _: Resp = try await request(
            path: "/api/squads/\(Self.pathComponent(squadId))", method: "DELETE")
    }

    public func inviteToSquad(squadId: String, userId: String) async throws {
        struct Body: Encodable { let userId: String }
        struct Resp: Decodable {}
        let _: Resp = try await request(
            path: "/api/squads/\(Self.pathComponent(squadId))/invites", method: "POST",
            body: Body(userId: userId))
    }

    public func acceptSquadInvite(squadId: String) async throws {
        struct Resp: Decodable {}
        let _: Resp = try await request(
            path: "/api/squads/\(Self.pathComponent(squadId))/invites/accept", method: "POST")
    }

    public func declineSquadInvite(squadId: String) async throws {
        struct Resp: Decodable {}
        let _: Resp = try await request(
            path: "/api/squads/\(Self.pathComponent(squadId))/invites/decline", method: "POST")
    }

    public func leaveSquad(squadId: String) async throws {
        struct Resp: Decodable {}
        let _: Resp = try await request(
            path: "/api/squads/\(Self.pathComponent(squadId))/leave", method: "POST")
    }

    public func kickSquadMember(squadId: String, userId: String) async throws {
        struct Resp: Decodable {}
        let _: Resp = try await request(
            path: "/api/squads/\(Self.pathComponent(squadId))/members/\(Self.pathComponent(userId))",
            method: "DELETE")
    }

    public func startSquadRaid(squadId: String, bossSlug: String, difficulty: RaidDifficulty) async throws {
        struct Body: Encodable { let bossSlug: String; let difficulty: RaidDifficulty }
        struct Resp: Decodable {}
        let _: Resp = try await request(
            path: "/api/squads/\(Self.pathComponent(squadId))/raids", method: "POST",
            body: Body(bossSlug: bossSlug, difficulty: difficulty))
    }
}
