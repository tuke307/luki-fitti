import Foundation
import LukiFittiModels
import LukiFittiDomain
import LukiFittiDesign

#if os(iOS) && canImport(ActivityKit)
import ActivityKit
import AppIntents

/// Shared between the app (starts, updates and ends the activity; runs the intents) and the widget
/// extension (draws it). All copy arrives pre-localized because the extension can't read the
/// in-app language preference.
public struct WorkoutActivityAttributes: ActivityAttributes, Sendable {
    public struct ContentState: Codable, Hashable, Sendable {
        public var currentExerciseName: String
        /// "Set 2 of 4"
        public var currentSetLabel: String
        /// "60 kg × 8"
        public var targetLoadLabel: String
        public var liveHeartRateBpm: Int?
        public var restTimerEndsAt: Date?
        /// Set while the rest timer is paused.
        public var restPausedRemainingSeconds: Int?
        /// Elapsed workout time is drawn with `Text(timerInterval:)` from this start date.
        public var workoutStartedAt: Date

        public init(
            currentExerciseName: String,
            currentSetLabel: String,
            targetLoadLabel: String,
            liveHeartRateBpm: Int? = nil,
            restTimerEndsAt: Date? = nil,
            restPausedRemainingSeconds: Int? = nil,
            workoutStartedAt: Date
        ) {
            self.currentExerciseName = currentExerciseName
            self.currentSetLabel = currentSetLabel
            self.targetLoadLabel = targetLoadLabel
            self.liveHeartRateBpm = liveHeartRateBpm
            self.restTimerEndsAt = restTimerEndsAt
            self.restPausedRemainingSeconds = restPausedRemainingSeconds
            self.workoutStartedAt = workoutStartedAt
        }

        public var isResting: Bool {
            if let restTimerEndsAt { return restTimerEndsAt > Date() }
            return restPausedRemainingSeconds != nil
        }
    }

    public struct Labels: Codable, Hashable, Sendable {
        public var rest: String
        public var restPaused: String
        public var addRest: String
        public var skipRest: String
        public var elapsed: String

        public init(rest: String, restPaused: String, addRest: String, skipRest: String, elapsed: String) {
            self.rest = rest
            self.restPaused = restPaused
            self.addRest = addRest
            self.skipRest = skipRest
            self.elapsed = elapsed
        }
    }

    public var workoutName: String
    public var labels: Labels

    public init(workoutName: String, labels: Labels) {
        self.workoutName = workoutName
        self.labels = labels
    }
}

/// Handlers the app registers so Live Activity buttons act on the real session.
@MainActor
public enum WorkoutLiveActivityActions {
    public static var addRest: (() -> Void)?
    public static var skipRest: (() -> Void)?
}

public struct AddRestTimeIntent: LiveActivityIntent {
    public static let title: LocalizedStringResource = "Add 15 Seconds Rest"
    public init() {}
    public func perform() async throws -> some IntentResult {
        await MainActor.run { WorkoutLiveActivityActions.addRest?() }
        return .result()
    }
}

public struct SkipRestTimerIntent: LiveActivityIntent {
    public static let title: LocalizedStringResource = "Skip Rest Timer"
    public init() {}
    public func perform() async throws -> some IntentResult {
        await MainActor.run { WorkoutLiveActivityActions.skipRest?() }
        return .result()
    }
}

/// Keeps one Live Activity in step with the active session: started with the workout, updated as
/// sets and rest change, ended when the workout is finished or discarded.
@MainActor
public final class WorkoutLiveActivityController {
    private var activity: Activity<WorkoutActivityAttributes>?
    private var lastState: WorkoutActivityAttributes.ContentState?

    public init() {
        activity = Activity<WorkoutActivityAttributes>.activities.first
    }

    public func sync(session: WorkoutSessionDto?, heartRate: Int?, locale: SupportedLocale) {
        guard let session, session.status != .COMPLETED else {
            end()
            return
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        let state = Self.contentState(for: session, heartRate: heartRate, locale: locale)
        guard state != lastState else { return }
        lastState = state
        let content = ActivityContent(state: state, staleDate: nil)

        if let activity, activity.activityState == .active {
            Task {
                for running in Activity<WorkoutActivityAttributes>.activities {
                    await running.update(content)
                }
            }
        } else {
            let attributes = WorkoutActivityAttributes(
                workoutName: session.workoutNameSnapshot,
                labels: .init(
                    rest: locale("Rest"),
                    restPaused: locale("Rest paused"),
                    addRest: "+15s",
                    skipRest: locale("Skip Rest"),
                    elapsed: locale("Elapsed")
                )
            )
            activity = try? Activity.request(attributes: attributes, content: content, pushType: nil)
        }
    }

    public func end() {
        lastState = nil
        guard activity != nil else { return }
        activity = nil
        Task {
            for running in Activity<WorkoutActivityAttributes>.activities {
                await running.end(nil, dismissalPolicy: .immediate)
            }
        }
    }

    static func contentState(
        for session: WorkoutSessionDto,
        heartRate: Int?,
        locale: SupportedLocale
    ) -> WorkoutActivityAttributes.ContentState {
        let current = session.exercises.first {
            $0.status != .COMPLETED && $0.status != .SKIPPED
        } ?? session.exercises.last
        let sets = current?.sets ?? []
        let nextIndex = sets.firstIndex { !$0.completed } ?? max(0, sets.count - 1)
        let nextSet = sets.indices.contains(nextIndex) ? sets[nextIndex] : nil
        let unit = LukiFormat.unitLabel(session.weightUnit)
        let load: String
        if let nextSet, nextSet.setType == .STRETCH || current?.exerciseTypeSnapshot == .STRETCHING {
            load = "\(nextSet.durationSeconds ?? 45) s"
        } else if let nextSet {
            load = "\(LukiFormat.weight(nextSet.weight ?? 0)) \(unit) × \(nextSet.reps ?? 0)"
        } else {
            load = ""
        }
        let rest = SessionCalculator.computeRemainingRestSeconds(session: session)
        return .init(
            currentExerciseName: current?.exerciseNameSnapshot ?? session.workoutNameSnapshot,
            currentSetLabel: sets.isEmpty ? "" : locale("Set %d of %d", nextIndex + 1, sets.count),
            targetLoadLabel: load,
            liveHeartRateBpm: heartRate,
            restTimerEndsAt: rest.isRunning ? Date().addingTimeInterval(TimeInterval(rest.remainingSeconds)) : nil,
            restPausedRemainingSeconds: rest.isPaused ? rest.remainingSeconds : nil,
            workoutStartedAt: parse(session.startedAt) ?? Date()
        )
    }

    private static func parse(_ iso: String) -> Date? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return withFraction.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
    }
}
#endif
