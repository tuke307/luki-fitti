import Foundation

/// Live workout metrics the Apple Watch streams to the iPhone while a HealthKit workout session
/// is mirrored (`sendToRemoteWorkoutSession`). Small enough to send every couple of seconds.
public struct WorkoutLiveMetricsPacket: Codable, Sendable, Equatable {
    public var bpm: Int?
    public var activeKcal: Double
    public var basalKcal: Double
    public var sentAt: Date

    public init(bpm: Int? = nil, activeKcal: Double = 0, basalKcal: Double = 0, sentAt: Date = Date()) {
        self.bpm = bpm
        self.activeKcal = activeKcal
        self.basalKcal = basalKcal
        self.sentAt = sentAt
    }
}
