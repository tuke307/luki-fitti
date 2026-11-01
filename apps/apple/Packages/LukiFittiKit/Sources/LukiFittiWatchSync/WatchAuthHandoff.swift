import Foundation
import Security
import LukiFittiModels

/// A session minted by the iPhone for the Watch (`POST /api/auth/device-session`). The Watch owns
/// and rotates these tokens; the iPhone only re-sends them until the Watch asks for a new one.
public struct WatchAuthHandoff: Codable, Sendable, Equatable {
    public var id: String
    public var userId: String
    public var tokens: AuthTokensDto

    public init(id: String = UUID().uuidString, userId: String, tokens: AuthTokensDto) {
        self.id = id
        self.userId = userId
        self.tokens = tokens
    }
}

public enum WatchAuthTokenDecision: Equatable, Sendable {
    /// Save the incoming tokens.
    case apply
    /// Keep the Watch's own (possibly rotated) tokens.
    case keep
    /// The iPhone switched to another account but sent no tokens yet: drop the old account's tokens.
    case discardStored
}

public enum WatchAuthHandoffPolicy {
    /// Watch side: whether tokens arriving from the iPhone replace the stored ones. Re-sends of an
    /// already applied handoff are ignored, so they can't roll back tokens the Watch rotated since.
    public static func decide(
        incomingTokens: AuthTokensDto?,
        incomingUserId: String?,
        incomingHandoffId: String?,
        storedTokens: AuthTokensDto?,
        storedUserId: String?,
        lastAppliedHandoffId: String?
    ) -> WatchAuthTokenDecision {
        let isOtherUser = incomingUserId != nil && storedUserId != nil && incomingUserId != storedUserId
        guard incomingTokens != nil else {
            return isOtherUser && storedTokens != nil ? .discardStored : .keep
        }
        if storedTokens == nil { return .apply }
        if let incomingUserId, incomingUserId != storedUserId { return .apply }
        if let incomingHandoffId, incomingHandoffId != lastAppliedHandoffId { return .apply }
        return .keep
    }
}

public protocol WatchAuthHandoffStoring: Sendable {
    func load() -> WatchAuthHandoff?
    func save(_ handoff: WatchAuthHandoff)
    func clear()
}

/// iPhone side: keeps the Watch handoff in the Keychain (it contains tokens).
public final class KeychainWatchAuthHandoffStore: WatchAuthHandoffStoring, @unchecked Sendable {
    private let service: String
    private let account = "watch_auth_handoff"
    private let lock = NSLock()

    public init(service: String = "com.lukifitti.watch-handoff") {
        self.service = service
    }

    public func load() -> WatchAuthHandoff? {
        lock.lock()
        defer { lock.unlock() }
        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return try? JSONDecoder().decode(WatchAuthHandoff.self, from: data)
    }

    public func save(_ handoff: WatchAuthHandoff) {
        lock.lock()
        defer { lock.unlock() }
        guard let data = try? JSONEncoder().encode(handoff) else { return }
        SecItemDelete(baseQuery() as CFDictionary)
        var query = baseQuery()
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(query as CFDictionary, nil)
    }

    public func clear() {
        lock.lock()
        defer { lock.unlock() }
        SecItemDelete(baseQuery() as CFDictionary)
    }

    private func baseQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }
}

/// iPhone side: hands out the stored Watch handoff for the signed-in user and mints a new one
/// (one at a time) when there is none or the Watch asked for fresh sign-in.
@MainActor
public final class WatchAuthHandoffProvider {
    private let store: any WatchAuthHandoffStoring
    private var mintTask: Task<WatchAuthHandoff?, Never>?
    /// The Watch reported its session as rejected; the next mint replaces the stored handoff.
    public private(set) var isNewHandoffRequested = false

    public init(store: any WatchAuthHandoffStoring = KeychainWatchAuthHandoffStore()) {
        self.store = store
    }

    /// The stored handoff of `userId`; one left over from another account is deleted.
    public func handoff(for userId: String) -> WatchAuthHandoff? {
        guard let stored = store.load() else { return nil }
        guard stored.userId == userId else {
            store.clear()
            return nil
        }
        return stored
    }

    public func needsMint(for userId: String) -> Bool {
        isNewHandoffRequested || handoff(for: userId) == nil
    }

    public func requestNewHandoff() {
        isNewHandoffRequested = true
    }

    public func clear() {
        isNewHandoffRequested = false
        store.clear()
    }

    public var isMinting: Bool { mintTask != nil }

    /// Mints and stores a new handoff; while one is in flight, callers get that same task.
    /// `isStillSignedIn` is checked after the network call so a sign-out or account switch
    /// meanwhile doesn't store a session for the wrong state. The task yields nil when minting
    /// failed (e.g. offline); the next push tries again.
    @discardableResult
    public func mint(
        userId: String,
        isStillSignedIn: @escaping @MainActor (String) -> Bool,
        using createSession: @escaping @Sendable () async throws -> AuthTokensDto
    ) -> Task<WatchAuthHandoff?, Never> {
        if let mintTask { return mintTask }
        let task = Task<WatchAuthHandoff?, Never> { @MainActor in
            defer { mintTask = nil }
            guard let tokens = try? await createSession(), isStillSignedIn(userId) else { return nil }
            let handoff = WatchAuthHandoff(userId: userId, tokens: tokens)
            store.save(handoff)
            isNewHandoffRequested = false
            return handoff
        }
        mintTask = task
        return task
    }
}
