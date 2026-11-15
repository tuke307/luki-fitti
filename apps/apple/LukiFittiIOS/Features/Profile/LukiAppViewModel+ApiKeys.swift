import Foundation
import LukiFittiModels
import LukiFittiStore

extension LukiAppViewModel {
    /// nil on failure — callers show a lightweight error state; the key list is best-effort.
    func fetchApiKeys() async -> ApiKeyListDto? {
        guard store.currentUser != nil else { return nil }
        return try? await store.apiClient.fetchApiKeys()
    }

    func revokeApiKey(id: String) async -> Bool {
        do {
            try await store.apiClient.revokeApiKey(id: id)
            return true
        } catch {
            return false
        }
    }
}
