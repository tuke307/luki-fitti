import Foundation
import Observation
import os
import LukiFittiModels
import LukiFittiDomain
import LukiFittiAPI

private let socialLog = Logger(subsystem: "LukiFitti", category: "SocialStore")

/// View-model store for the Social tab: own profile, friend lists, search results, inbox and
/// push preferences. All calls are best-effort — errors are surfaced via `lastError` and never
/// thrown at the UI.
@MainActor
@Observable
public final class SocialStore {
    public private(set) var apiClient: APIClient

    public var profile: SocialProfileDto?
    public var friends: FriendListsDto = FriendListsDto()
    public var blocked: [SocialCardDto] = []
    public var unreadCount = 0
    /// The section a push tap or deep link wants to open (consumed by SocialView).
    public var requestedSection: SocialSectionTarget?
    /// Invite token received via universal link while signed out — accepted after sign-in.
    public var pendingInviteToken: String?
    /// One onboarding presentation per launch while the user has no handle.
    public var onboardingDismissedThisLaunch = false
    public var lastError: String?

    // MARK: - Leagues & effort points (PR 2)

    public var pointsWeek: PointsWeekDto?
    public var league: LeagueCurrentDto?
    public var leagueFriends: [LeagueFriendRowDto] = []
    public var leagueHistory: [LeagueHistoryEntryDto] = []
    /// Called after league/points data changes so the app can push a watch snapshot.
    public var onLeagueDataChanged: (@MainActor () -> Void)?

    // MARK: - Duels, streaks & trophies (PR 3)

    /// nil while duels are off or the list hasn't loaded — sections hide on nil.
    public var duels: DuelListDto?
    public var streaks: StreakListDto?

    /// UI-test seed: trophy shelves prefer this over a live fetch when set.
    public var seededTrophies: [String: TrophyListDto]?

    /// Avatar JPEG bytes keyed by user id, fetched through the authenticated API client.
    @ObservationIgnored public private(set) var avatarCache: [String: Data] = [:]

    public init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    /// Social is enabled for this account (server beta/rollout gate).
    public static func isEnabled(for user: UserDto?) -> Bool {
        user?.social?.enabled ?? false
    }

    public var hasHandle: Bool { profile?.handle != nil }

    // MARK: - Refresh

    public func refreshAll() async {
        guard apiClient.isAuthenticated() else { return }
        async let p = fetchProfile()
        async let f = refreshFriends()
        async let u = refreshUnread()
        async let l = refreshLeagues()
        async let b = refreshBattles()
        _ = await (p, f, u, l, b)
    }

    /// Points, league state and friends board. 403s (leagues disabled or user ineligible) are
    /// expected and swallowed — the sections stay empty. Other failures land in `lastError` and
    /// the log so a decode/HTTP regression can't silently hide the whole section.
    public func refreshLeagues() async {
        var changed = false
        do {
            pointsWeek = try await apiClient.fetchPointsWeek()
            changed = true
        } catch let error as APIClientError where isForbidden(error) {
        } catch { recordLeagueError("points/week", error) }
        do {
            league = try await apiClient.fetchLeagueCurrent()
            changed = true
        } catch let error as APIClientError where isForbidden(error) {
        } catch { recordLeagueError("league/current", error) }
        do {
            leagueFriends = try await apiClient.fetchLeagueFriends()
            changed = true
        } catch let error as APIClientError where isForbidden(error) {
        } catch { recordLeagueError("league/friends", error) }
        if changed { onLeagueDataChanged?() }
    }

    private func isForbidden(_ error: APIClientError) -> Bool {
        if case .forbidden = error { return true }
        if case let .serverError(code, _) = error { return code == 403 }
        return false
    }

    private func recordLeagueError(_ endpoint: String, _ error: Error) {
        socialLog.error("\(endpoint, privacy: .public) failed: \(String(describing: error), privacy: .public)")
        lastError = String(describing: error)
    }

    /// Duels and streaks. Same failure policy as `refreshLeagues`: 403s hide the
    /// sections, everything else lands in `lastError` + the log.
    public func refreshBattles() async {
        var changed = false
        do {
            duels = try await apiClient.fetchDuels()
            changed = true
        } catch let error as APIClientError where isForbidden(error) {
        } catch { recordLeagueError("duels", error) }
        do {
            streaks = try await apiClient.fetchStreaks()
            changed = true
        } catch let error as APIClientError where isForbidden(error) {
        } catch { recordLeagueError("streaks", error) }
        if changed { onLeagueDataChanged?() }
    }

    // MARK: - Duel actions

    public func duelAction(_ fn: () async throws -> Void) async {
        do { try await fn() } catch { lastError = String(describing: error) }
        await refreshBattles()
    }

    public func challengeDuel(opponentId: String) async {
        await duelAction { _ = try await self.apiClient.challengeDuel(opponentId: opponentId) }
    }

    public func acceptDuel(duelId: String) async {
        await duelAction { _ = try await self.apiClient.acceptDuel(duelId: duelId) }
    }

    public func declineDuel(duelId: String) async {
        await duelAction { try await self.apiClient.declineDuel(duelId: duelId) }
    }

    public func cancelDuel(duelId: String) async {
        await duelAction { try await self.apiClient.cancelDuel(duelId: duelId) }
    }

    /// Clears the pending duel result locally and tells the server it was shown.
    public func markDuelResultSeen() async {
        guard let result = duels?.pendingResult else { return }
        duels?.pendingResult = nil
        do { try await apiClient.markDuelSeen(duelId: result.id) } catch {}
        onLeagueDataChanged?()
    }

    // MARK: - Streak actions

    public func inviteStreak(friendId: String) async {
        await duelAction { try await self.apiClient.inviteStreak(friendId: friendId) }
    }

    public func acceptStreak(streakId: String) async {
        await duelAction { try await self.apiClient.acceptStreak(streakId: streakId) }
    }

    public func endStreak(streakId: String) async {
        await duelAction { try await self.apiClient.endStreak(streakId: streakId) }
    }

    /// Open duels count for the max-3 challenge limit (PENDING + ACTIVE on either side).
    public var openDuelCount: Int {
        guard let duels else { return 0 }
        return duels.active.count + duels.incoming.count + duels.outgoing.count
    }

    /// The open duel with `friendId`, if one exists (blocks a fresh challenge).
    public func openDuel(with friendId: String) -> DuelItemDto? {
        guard let duels else { return nil }
        return (duels.active + duels.incoming + duels.outgoing).first {
            $0.opponent.userId == friendId
        }
    }

    public func refreshLeagueHistory() async {
        leagueHistory = (try? await apiClient.fetchLeagueHistory()) ?? leagueHistory
    }

    /// Clears the pending result locally and tells the server the celebration was shown.
    public func markResultSeen() async {
        guard let result = league?.pendingResult else { return }
        league?.pendingResult = nil
        do { try await apiClient.markLeagueResultSeen(weekKey: result.weekKey) } catch {}
        onLeagueDataChanged?()
    }

    /// Compact watch snapshot, nil when nothing has loaded yet.
    public var watchSnapshot: SocialWatchSnapshot? {
        guard let league else { return nil }
        let rank = league.cohort?.members.first(where: { $0.isSelf })?.rank
        let duel = duels?.active.first.map {
            DuelWatchSnapshot(
                opponentHandle: $0.opponent.handle,
                you: $0.you,
                them: $0.them,
                daysLeft: $0.daysLeft ?? 0,
                startsTomorrow: $0.startsTomorrow
            )
        }
        return SocialWatchSnapshot(
            weekPoints: pointsWeek?.points ?? 0,
            arena: league.arena,
            rank: rank,
            cohortSize: league.cohort?.members.count,
            stage: league.stage,
            duel: duel
        )
    }

    @discardableResult
    public func fetchProfile() async -> SocialProfileDto? {
        do {
            profile = try await apiClient.fetchSocialMe()
        } catch {
            lastError = error.localizedDescription
        }
        return profile
    }

    public func refreshFriends() async {
        do {
            friends = try await apiClient.fetchFriendLists()
            blocked = (try? await apiClient.fetchBlocks()) ?? blocked
        } catch {
            lastError = error.localizedDescription
        }
    }

    public func refreshUnread() async {
        do {
            unreadCount = try await apiClient.fetchNotifications(limit: 1).unreadCount
        } catch {
            // Inbox polling is opportunistic; don't surface transient failures.
        }
    }

    // MARK: - Friend actions

    public func sendRequest(to userId: String) async {
        do { _ = try await apiClient.sendFriendRequest(userId: userId) } catch { lastError = error.localizedDescription }
        await refreshFriends()
    }

    public func accept(_ userId: String) async {
        do { try await apiClient.acceptFriendRequest(userId: userId) } catch { lastError = error.localizedDescription }
        await refreshFriends()
    }

    public func decline(_ userId: String) async {
        do { try await apiClient.declineFriendRequest(userId: userId) } catch { lastError = error.localizedDescription }
        await refreshFriends()
    }

    public func remove(_ userId: String) async {
        do { try await apiClient.removeFriend(userId: userId) } catch { lastError = error.localizedDescription }
        await refreshFriends()
    }

    public func block(_ userId: String) async {
        do { try await apiClient.createBlock(userId: userId) } catch { lastError = error.localizedDescription }
        await refreshFriends()
    }

    public func unblock(_ userId: String) async {
        do { try await apiClient.deleteBlock(userId: userId) } catch { lastError = error.localizedDescription }
        await refreshFriends()
    }

    public func report(_ userId: String, reason: ReportReason, details: String?) async -> Bool {
        do {
            try await apiClient.createReport(userId: userId, reason: reason, details: details)
            return true
        } catch {
            lastError = error.localizedDescription
            return false
        }
    }

    // MARK: - Avatars (authenticated fetch through the API base URL)

    /// JPEG bytes for `/social/avatars/<userId>`-shaped URLs; nil hides the avatar.
    public func avatarData(for userId: String, url: String?) async -> Data? {
        if let hit = avatarCache[userId] { return hit }
        guard let url else { return nil }
        let path = url.hasPrefix("/api/") ? url : "/api\(url)"
        guard let data = try? await apiClient.fetchData(path: path) else { return nil }
        avatarCache[userId] = data
        return data
    }

    public func clearSignedInState() {
        profile = nil
        friends = FriendListsDto()
        blocked = []
        unreadCount = 0
        avatarCache = [:]
        requestedSection = nil
        pointsWeek = nil
        league = nil
        leagueFriends = []
        leagueHistory = []
        duels = nil
        streaks = nil
    }
}
