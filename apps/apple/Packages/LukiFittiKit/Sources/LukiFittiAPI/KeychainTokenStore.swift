import Foundation
import Security
import LukiFittiModels

public protocol TokenStoring: Sendable {
    func saveTokens(_ tokens: AuthTokensDto, userId: String?) throws
    func loadTokens() -> AuthTokensDto?
    func loadUserId() -> String?
    func clearTokens()
}

/// Encrypted Apple Keychain token store using `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`
/// so background Apple Watch sync and Widget extensions can read tokens while the screen is locked,
/// without ever writing tokens to `UserDefaults` or unencrypted disk.
public final class KeychainTokenStore: TokenStoring, @unchecked Sendable {
    private let service: String
    private let accessGroup: String?
    private let lock = NSLock()
    private var fallbackMemoryTokens: AuthTokensDto?
    private var fallbackMemoryUserId: String?

    public init(service: String = "com.lukifitti.auth", accessGroup: String? = nil) {
        self.service = service
        self.accessGroup = accessGroup
    }

    public func saveTokens(_ tokens: AuthTokensDto, userId: String? = nil) throws {
        lock.lock()
        defer { lock.unlock() }
        fallbackMemoryTokens = tokens
        if let userId { fallbackMemoryUserId = userId }

        let data = try JSONEncoder().encode(tokens)
        saveData(data, account: "auth_tokens")
        if let userId, let uidData = userId.data(using: .utf8) {
            saveData(uidData, account: "auth_user_id")
        }
    }

    public func loadTokens() -> AuthTokensDto? {
        lock.lock()
        defer { lock.unlock() }
        if let data = readData(account: "auth_tokens"),
           let decoded = try? JSONDecoder().decode(AuthTokensDto.self, from: data) {
            return decoded
        }
        return fallbackMemoryTokens
    }

    public func loadUserId() -> String? {
        lock.lock()
        defer { lock.unlock() }
        if let data = readData(account: "auth_user_id"),
           let uid = String(data: data, encoding: .utf8) {
            return uid
        }
        return fallbackMemoryUserId
    }

    public func clearTokens() {
        lock.lock()
        defer { lock.unlock() }
        fallbackMemoryTokens = nil
        fallbackMemoryUserId = nil
        deleteData(account: "auth_tokens")
        deleteData(account: "auth_user_id")
    }

    private func baseQuery(account: String) -> [String: Any] {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        if let accessGroup, !accessGroup.isEmpty {
            query[kSecAttrAccessGroup as String] = accessGroup
        }
        return query
    }

    private func saveData(_ data: Data, account: String) {
        deleteData(account: account)
        var query = baseQuery(account: account)
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        _ = SecItemAdd(query as CFDictionary, nil)
    }

    private func readData(account: String) -> Data? {
        var query = baseQuery(account: account)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess else { return nil }
        return result as? Data
    }

    private func deleteData(account: String) {
        let query = baseQuery(account: account)
        _ = SecItemDelete(query as CFDictionary)
    }
}
