/// Dedupes rest-over alerts (haptic, notification) keyed by the rest's `restTimerEndsAt`
/// timestamp so a re-broadcast of the same rest doesn't schedule the alert twice.
public struct RestEndAlertGate: Sendable, Equatable {
    public private(set) var scheduledEndsAt: String?

    public init() {}

    /// Returns true once per distinct `endsAt`; repeated calls with the same value are deduped.
    public mutating func take(endsAt: String) -> Bool {
        guard endsAt != scheduledEndsAt else { return false }
        scheduledEndsAt = endsAt
        return true
    }

    /// Call when the rest is cleared so a later rest can be scheduled again.
    public mutating func reset() {
        scheduledEndsAt = nil
    }
}
