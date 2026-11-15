import Foundation

/// Cross-process payload the iOS app publishes into the shared app group for the home-screen
/// widgets. Everything a widget needs is precomputed — the extension just renders it.
public struct HomeWidgetSnapshot: Codable, Sendable, Equatable {
    public struct NextWorkout: Codable, Sendable, Equatable {
        public var templateId: String
        public var name: String
        public var exerciseCount: Int

        public init(templateId: String, name: String, exerciseCount: Int) {
            self.templateId = templateId
            self.name = name
            self.exerciseCount = exerciseCount
        }
    }

    public struct Nutrition: Codable, Sendable, Equatable {
        /// Device-local "YYYY-MM-DD" the totals belong to.
        public var day: String
        public var kcalEaten: Int
        public var kcalGoal: Int?
        public var proteinG: Int
        public var proteinGoalG: Int?

        public init(day: String, kcalEaten: Int, kcalGoal: Int? = nil, proteinG: Int, proteinGoalG: Int? = nil) {
            self.day = day
            self.kcalEaten = kcalEaten
            self.kcalGoal = kcalGoal
            self.proteinG = proteinG
            self.proteinGoalG = proteinGoalG
        }
    }

    public struct Raid: Codable, Sendable, Equatable {
        public var bossSlug: String
        /// Localised at write time — the extension renders the string as stored.
        public var bossName: String
        public var hpFraction: Double
        public var phase: Int
        public var endsAt: String

        public init(bossSlug: String, bossName: String, hpFraction: Double, phase: Int, endsAt: String) {
            self.bossSlug = bossSlug
            self.bossName = bossName
            self.hpFraction = hpFraction
            self.phase = phase
            self.endsAt = endsAt
        }
    }

    public var generatedAt: String
    public var locale: SupportedLocale
    public var nextWorkout: NextWorkout?
    public var weekSessionsDone: Int
    public var weeklyGoal: Int
    /// ISO week start the count belongs to; a stale snapshot must not report last week as done.
    public var weekStartISO: String
    public var nutrition: Nutrition?
    /// Active community raid + a rendered boss image file (`raid_boss.png`) in the group container.
    public var raid: Raid?

    public init(
        generatedAt: String,
        locale: SupportedLocale,
        nextWorkout: NextWorkout? = nil,
        weekSessionsDone: Int = 0,
        weeklyGoal: Int = 4,
        weekStartISO: String,
        nutrition: Nutrition? = nil,
        raid: Raid? = nil
    ) {
        self.generatedAt = generatedAt
        self.locale = locale
        self.nextWorkout = nextWorkout
        self.weekSessionsDone = weekSessionsDone
        self.weeklyGoal = weeklyGoal
        self.weekStartISO = weekStartISO
        self.nutrition = nutrition
        self.raid = raid
    }

    /// Eaten calories for `dayKey` ("YYYY-MM-DD"); 0 when the snapshot is from another day.
    public func kcalEatenToday(dayKey: String) -> Int {
        nutrition?.day == dayKey ? (nutrition?.kcalEaten ?? 0) : 0
    }

    /// Eaten protein grams for `dayKey`; 0 when the snapshot is from another day.
    public func proteinToday(dayKey: String) -> Int {
        nutrition?.day == dayKey ? (nutrition?.proteinG ?? 0) : 0
    }

    /// Weekly count when `currentWeekStartISO` matches the stamped week, else 0.
    public func sessionsDone(currentWeekStartISO: String) -> Int {
        weekStartISO == currentWeekStartISO ? weekSessionsDone : 0
    }
}

/// Reads/writes the widget snapshot inside the shared app group. The group id is not hardcoded:
/// both the app and the extension expose their build-time `$(APP_GROUP_ID)` through the
/// `LukiFittiAppGroupID` Info.plist key, so whatever bundle calls this resolves its own.
public enum SharedSnapshotStore {
    public static let fileName = "home_widget_snapshot.json"
    /// Boss still rendered by the app for the raid widget, next to the JSON.
    public static let raidImageFileName = "raid_boss.png"

    public static func containerURL(fileManager: FileManager = .default, bundle: Bundle = .main) -> URL? {
        guard let groupId = bundle.object(forInfoDictionaryKey: "LukiFittiAppGroupID") as? String,
              !groupId.isEmpty, !groupId.hasPrefix("$(") else { return nil }
        return fileManager.containerURL(forSecurityApplicationGroupIdentifier: groupId)
    }

    public static func read(fileManager: FileManager = .default, bundle: Bundle = .main) -> HomeWidgetSnapshot? {
        guard let url = containerURL(fileManager: fileManager, bundle: bundle)?
            .appendingPathComponent(fileName),
            let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(HomeWidgetSnapshot.self, from: data)
    }

    /// Writes only when the snapshot actually changed; returns whether a write happened so the
    /// caller can decide to reload widget timelines.
    @discardableResult
    public static func write(
        _ snapshot: HomeWidgetSnapshot,
        fileManager: FileManager = .default,
        bundle: Bundle = .main
    ) -> Bool {
        guard let directory = containerURL(fileManager: fileManager, bundle: bundle) else { return false }
        return write(snapshot, to: directory, fileManager: fileManager)
    }

    /// Writes under an explicit directory — used by tests and non-app-group callers.
    /// `generatedAt` is a fresh timestamp on every publish, so it is excluded from the comparison;
    /// otherwise every call would look like a change and burn the widget-reload budget.
    @discardableResult
    public static func write(
        _ snapshot: HomeWidgetSnapshot,
        to directory: URL,
        fileManager: FileManager = .default
    ) -> Bool {
        let url = directory.appendingPathComponent(fileName)
        guard let data = try? JSONEncoder().encode(snapshot) else { return false }
        if let existing = try? Data(contentsOf: url),
           let decoded = try? JSONDecoder().decode(HomeWidgetSnapshot.self, from: existing) {
            var candidate = decoded
            candidate.generatedAt = snapshot.generatedAt
            if candidate == snapshot { return false }
        }
        do {
            try fileManager.createDirectory(
                at: url.deletingLastPathComponent(), withIntermediateDirectories: true
            )
            try data.write(to: url, options: .atomic)
            return true
        } catch {
            return false
        }
    }
}
