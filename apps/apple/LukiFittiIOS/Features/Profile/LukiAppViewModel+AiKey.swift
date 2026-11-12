import Foundation
import LukiFittiModels
import LukiFittiStore

extension LukiAppViewModel {
    /// Guests see AI entry points (they can read how they work); once signed in, the
    /// account's global feature switch decides.
    func showsAiFeature(_ feature: FeatureGrant) -> Bool {
        guard let user = store.currentUser else { return true }
        return user.hasFeature(feature)
    }

    /// Whether a usable OpenRouter key exists. The cached `aiKeyConfigured` can be stale (users
    /// cached before the flag existed decode it as false), so a miss is verified live against the
    /// server once before the AI entry points show the "key required" alert.
    func ensureAiKeyConfigured() async -> Bool {
        if store.currentUser == nil { return false }
        if store.currentUser?.aiKeyConfigured == true { return true }
        guard let status = try? await store.apiClient.fetchAiKeyStatus(), status.hasKey else {
            return false
        }
        if var user = store.currentUser {
            user.aiKeyConfigured = true
            store.saveAuthenticatedUser(user)
        }
        return true
    }
}
