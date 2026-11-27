import Foundation
import LukiFittiModels

/// Pause-aware workout duration math.
/// Port of `session-duration.util.ts` in `packages/common` — keep the semantics identical.
public enum SessionDuration {
    /// Active seconds actually spent training: wall time since `startedAt` minus all completed
    /// pauses (`pausedDurationSeconds`) minus the currently open pause. Never negative.
    public static func activeElapsedSeconds(_ session: WorkoutSessionDto, now: Date = Date()) -> Int {
        guard let started = LukiDate.parseISO(session.startedAt) else { return 0 }
        var openPause = 0.0
        if session.status == .PAUSED,
           let pausedAt = session.pausedAt,
           let paused = LukiDate.parseISO(pausedAt) {
            openPause = now.timeIntervalSince(paused)
        }
        let elapsed = Int(now.timeIntervalSince(started)) - session.pausedDurationSeconds - Int(openPause)
        return max(0, elapsed)
    }

    /// Field patch for pausing: snapshot the elapsed seconds and open the pause.
    public static func pause(_ session: inout WorkoutSessionDto, nowIso: String) {
        let now = LukiDate.parseISO(nowIso) ?? Date()
        session.status = .PAUSED
        session.pausedAt = nowIso
        session.activeDurationSeconds = activeElapsedSeconds(session, now: now)
    }

    /// Field patch for resuming: fold the open pause into `pausedDurationSeconds`.
    public static func resume(_ session: inout WorkoutSessionDto, nowIso: String) {
        let now = LukiDate.parseISO(nowIso) ?? Date()
        var extra = 0
        if let pausedAt = session.pausedAt, let paused = LukiDate.parseISO(pausedAt) {
            extra = max(0, Int(now.timeIntervalSince(paused)))
        }
        session.status = .IN_PROGRESS
        session.pausedAt = nil
        session.pausedDurationSeconds += extra
    }
}
