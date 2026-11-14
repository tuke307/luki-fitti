import Foundation
import LukiFittiModels

/// Points and league endpoints (PR 2 part A contract). Routes sit behind the server-side
/// `LeaguesEnabledGuard`, so calls can throw 403 when leagues are off for this user.
extension APIClient {
    /// Weekly EP view; `weekKey` defaults to the current Berlin week server-side.
    public func fetchPointsWeek(weekKey: String? = nil) async throws -> PointsWeekDto {
        var path = "/api/points/week"
        if let weekKey {
            let k = weekKey.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? weekKey
            path += "?weekKey=\(k)"
        }
        return try await request(path: path, method: "GET")
    }

    public func fetchLeagueCurrent() async throws -> LeagueCurrentDto {
        try await request(path: "/api/league/current", method: "GET")
    }

    public func fetchLeagueFriends() async throws -> [LeagueFriendRowDto] {
        struct Resp: Decodable { let entries: [LeagueFriendRowDto] }
        let res: Resp = try await request(path: "/api/league/friends", method: "GET")
        return res.entries
    }

    /// Most recent 12 finished weeks.
    public func fetchLeagueHistory() async throws -> [LeagueHistoryEntryDto] {
        struct Resp: Decodable { let entries: [LeagueHistoryEntryDto] }
        let res: Resp = try await request(path: "/api/league/history", method: "GET")
        return res.entries
    }

    /// Marks a pending promotion/demotion result as shown.
    public func markLeagueResultSeen(weekKey: String) async throws {
        struct Resp: Decodable {}
        let _: Resp = try await request(
            path: "/api/league/results/\(Self.pathComponent(weekKey))/seen", method: "POST")
    }
}
