import Foundation
import LukiFittiModels

/// Duel, streak and trophy endpoints (PR 3 part A contract). Routes sit behind the
/// `SocialEnabledGuard` plus `duelsEnabled`/`streaksEnabled` switches, so calls can throw
/// 403 while a feature is off — the caller hides the section instead of surfacing it.
extension APIClient {
    // MARK: - Duels

    public func fetchDuels() async throws -> DuelListDto {
        try await request(path: "/api/duels", method: "GET")
    }

    public func fetchDuelDetail(duelId: String) async throws -> DuelDetailDto {
        try await request(path: "/api/duels/\(Self.pathComponent(duelId))", method: "GET")
    }

    public func challengeDuel(opponentId: String) async throws -> DuelItemDto {
        struct Body: Encodable { let opponentId: String }
        return try await request(path: "/api/duels", method: "POST", body: Body(opponentId: opponentId))
    }

    public func acceptDuel(duelId: String) async throws -> DuelItemDto {
        try await request(path: "/api/duels/\(Self.pathComponent(duelId))/accept", method: "POST")
    }

    public func declineDuel(duelId: String) async throws {
        struct Resp: Decodable {}
        let _: Resp = try await request(
            path: "/api/duels/\(Self.pathComponent(duelId))/decline", method: "POST")
    }

    public func cancelDuel(duelId: String) async throws {
        struct Resp: Decodable {}
        let _: Resp = try await request(
            path: "/api/duels/\(Self.pathComponent(duelId))/cancel", method: "POST")
    }

    /// Marks a finished duel's result as shown (drives `pendingResult`).
    public func markDuelSeen(duelId: String) async throws {
        struct Resp: Decodable {}
        let _: Resp = try await request(
            path: "/api/duels/\(Self.pathComponent(duelId))/seen", method: "POST")
    }

    // MARK: - Friend streaks

    public func fetchStreaks() async throws -> StreakListDto {
        try await request(path: "/api/streaks", method: "GET")
    }

    public func inviteStreak(friendId: String) async throws {
        struct Body: Encodable { let friendId: String }
        struct Resp: Decodable {}
        let _: Resp = try await request(path: "/api/streaks", method: "POST", body: Body(friendId: friendId))
    }

    public func acceptStreak(streakId: String) async throws {
        struct Resp: Decodable {}
        let _: Resp = try await request(
            path: "/api/streaks/\(Self.pathComponent(streakId))/accept", method: "POST")
    }

    public func endStreak(streakId: String) async throws {
        struct Resp: Decodable {}
        let _: Resp = try await request(
            path: "/api/streaks/\(Self.pathComponent(streakId))", method: "DELETE")
    }

    // MARK: - Trophies

    public func fetchTrophies(userId: String) async throws -> TrophyListDto {
        try await request(path: "/api/trophies/\(Self.pathComponent(userId))", method: "GET")
    }
}
