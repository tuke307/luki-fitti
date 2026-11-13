import Foundation
import Observation
import LukiFittiModels
import LukiFittiDomain
import LukiFittiAPI

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
        _ = await (p, f, u, l)
    }

    /// Points, league state and friends board. 403s (leagues disabled) are swallowed —
    /// the sections simply stay empty.
    public func refreshLeagues() async {
        var changed = false
        if let week = try? await apiClient.fetchPointsWeek() {
            pointsWeek = week
            changed = true
        }
        if let current = try? await apiClient.fetchLeagueCurrent() {
            league = current
            changed = true
        }
        if let friends = try? await apiClient.fetchLeagueFriends() {
            leagueFriends = friends
            changed = true
        }
        if changed { onLeagueDataChanged?() }
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
        return SocialWatchSnapshot(
            weekPoints: pointsWeek?.points ?? 0,
            arena: league.arena,
            rank: rank,
            cohortSize: league.cohort?.members.count,
            stage: league.stage
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
    }
}
