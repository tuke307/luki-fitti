import XCTest

/// Marketing screenshot capture — run only via `-only-testing:…/MarketingScreenshotsUITests`
/// (skipped by the normal e2e scripts). Each test launches the app fresh with only the seed
/// it needs and asserts the right screen is on display before saving — a test fails rather
/// than capturing the wrong screen. `*En` / `*De` variants run in the matching locale.
final class MarketingScreenshotsUITests: XCTestCase {
    /// Locale comes from the method name (`…En` / `…De`) — env vars don't reach the runner.
    private var lang: String { name.contains("De]") ? "de" : "en" }
    private var tabLibrary: String { lang == "de" ? "Bibliothek" : "Library" }
    private var tabHistory: String { lang == "de" ? "Verlauf" : "History" }
    private var tabFood: String { lang == "de" ? "Essen" : "Food" }
    private var neverTrained: String { lang == "de" ? "Noch nie trainiert" : "Never trained" }
    private var estimatedLabel: String { lang == "de" ? "Geschätzt" : "Estimated" }

    @MainActor
    private func launch(session: Bool) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = [
            "--uitesting",
            session ? "--uitesting-marketing-session" : "--uitesting-marketing",
            "-AppleLanguages", "(\(lang))",
            "-AppleInterfaceStyle", "Dark",
        ]
        app.launchEnvironment["LUKIFITTI_MARKETING_LANG"] = lang
        // Simulator apps read host paths — never ships in the bundle.
        app.launchEnvironment["LUKIFITTI_MARKETING_MEAL_PHOTO"] =
            URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .appendingPathComponent("marketing/assets/demo-meal.jpg")
                .path
        app.launch()
        // Guard the locale before any capture — the wrong language fails the test.
        // iPhone shows a TabBar; on iPad the same tabs live in the sidebar/top bar.
        let expectedTab = lang == "de" ? "Heute" : "Today"
        let tabButton = app.descendants(matching: .any)[expectedTab].firstMatch
        XCTAssertTrue(
            tabButton.waitForExistence(timeout: 15),
            "expected \(lang) tab '\(expectedTab)'"
        )
        return app
    }

    /// Tabs render in a UITabBar on iPhone and in the iPad sidebar/top bar.
    private func tabElement(_ app: XCUIApplication, _ name: String) -> XCUIElement {
        app.tabBars.buttons[name].firstMatch.exists
            ? app.tabBars.buttons[name].firstMatch
            : app.descendants(matching: .any)[name].firstMatch
    }

    @MainActor private func save(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    @MainActor private func assertSession(_ app: XCUIApplication) {
        XCTAssertTrue(
            app.buttons["ios.session.finishButton"].firstMatch.waitForExistence(timeout: 20),
            "active session view must be on screen"
        )
    }

    @MainActor private func shot01ActiveWorkout() {
        let app = launch(session: true)
        assertSession(app)
        save("01-active-workout")
    }

    @MainActor private func shot02Meal() {
        let app = launch(session: false)
        let tab = tabElement(app, tabFood)
        XCTAssertTrue(tab.waitForExistence(timeout: 15), "Food tab missing")
        tab.tap()
        // The seeded meal carries the demo photo + AI items; assert the meal is visible.
        let entryRow = app.descendants(matching: .any)["ios.nutrition.entry.marketing-meal"]
            .firstMatch
        XCTAssertTrue(
            entryRow.waitForExistence(timeout: 10),
            "seeded meal row must be visible"
        )
        sleep(1)
        // Goal card + meal list on the Food tab — the composer crops the goal card region
        // from this capture for the floating card overlay.
        save("02-meal-goal")

        // Open the seeded meal into the editor: photo strip on top, AI items below.
        let entry = app.descendants(matching: .any)["ios.nutrition.entry.marketing-meal"]
            .firstMatch
        XCTAssertTrue(entry.waitForExistence(timeout: 10), "seeded meal row missing")
        entry.tap()
        XCTAssertTrue(
            app.buttons["ios.nutrition.saveMealButton"].firstMatch.waitForExistence(timeout: 10),
            "meal editor must be open"
        )
        // On iPhone, scroll the editor until the "Estimate with AI" button and the first
        // item's "Estimated" badge both sit in the upper part of the screen — above where
        // the composed goal-card overlay lands. Short, slow drags avoid momentum flings.
        let estimated = app.staticTexts.matching(
            NSPredicate(format: "label == %@", estimatedLabel)
        )
        func estimatedVisible() -> [XCUIElement] {
            estimated.allElementsBoundByIndex.filter(\.isHittable)
        }
        if app.frame.width < 700 {
            let estimate = app.buttons["ios.nutrition.estimateButton"].firstMatch
            let badgeTarget = app.frame.height * 0.56
            let navBottom = app.frame.height * 0.13
            for _ in 0..<12 {
                let badge = estimatedVisible().first
                if let badge, badge.frame.minY < badgeTarget { break }
                // Once the estimate button reaches the nav bar, further scrolling only
                // pushes it off screen — stop there.
                guard estimate.isHittable, estimate.frame.minY > navBottom else { break }
                let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.72))
                let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.64))
                start.press(forDuration: 0.05, thenDragTo: end, withVelocity: .slow,
                            thenHoldForDuration: 0)
                usleep(300_000)
            }
            XCTAssertTrue(
                estimate.isHittable && estimate.frame.minY > navBottom,
                "AI estimate button must be fully visible below the nav bar"
            )
            XCTAssertGreaterThanOrEqual(
                estimatedVisible().count, 1, "an AI 'Estimated' badge must be visible"
            )
        }
        save("02-meal")
    }

    @MainActor private func shot03Suggestion() {
        let app = launch(session: true)
        assertSession(app)
        // The seeded regression on the first exercise produces the exercise-suggestion card at
        // the bottom of the exercise list — scroll until it's on screen.
        let card = app.descendants(matching: .any)["ios.session.rainbowSuggestion"].firstMatch
        for _ in 0..<6 where !card.isHittable {
            app.swipeUp()
        }
        XCTAssertTrue(card.waitForExistence(timeout: 10), "suggestion card must be visible")
        // The card grew taller (eyebrow + wrapped name + buttons): keep scrolling until the
        // lowest of the card's buttons (all carry the card's identifier) sits fully above
        // the rest dock — a bottom safe-area inset, so the list can always scroll clear.
        let restDock = app.descendants(matching: .any)["ios.session.restDock"].firstMatch
        XCTAssertTrue(restDock.waitForExistence(timeout: 5), "rest dock must be on screen")
        func cardBottom() -> CGFloat {
            app.buttons.matching(identifier: "ios.session.rainbowSuggestion")
                .allElementsBoundByIndex.map(\.frame.maxY).max() ?? .greatestFiniteMagnitude
        }
        for _ in 0..<12 where cardBottom() > restDock.frame.minY {
            app.swipeUp()
            usleep(300_000)
        }
        // That overscrolls past the set rows this shot is about — pull back down in slow,
        // measured drags until a "Try X kg (+2.5)" hint is visible again, keeping the card
        // above the dock. Slow velocity avoids the momentum that makes plain drags fling.
        let hints = app.staticTexts.matching(NSPredicate(format: "label CONTAINS '+2.5'"))
        func hintVisible() -> Bool {
            hints.allElementsBoundByIndex.contains { $0.isHittable }
        }
        let height = app.frame.height
        func drag(_ points: CGFloat) {
            let from = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
            let to = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5 + points / height))
            from.press(forDuration: 0.05, thenDragTo: to, withVelocity: 10, thenHoldForDuration: 0)
            usleep(300_000)
        }
        for _ in 0..<40 {
            if hintVisible() || cardBottom() > restDock.frame.minY - 30 { break }
            drag(40)
        }
        // The last drag may still push the card under the dock — nudge it back above.
        for _ in 0..<20 where hintVisible() {
            if cardBottom() <= restDock.frame.minY { break }
            drag(-min(cardBottom() - restDock.frame.minY, 20))
        }
        XCTAssertTrue(hintVisible(), "a set suggestion hint must be visible at the top")
        XCTAssertLessThanOrEqual(
            cardBottom(), restDock.frame.minY,
            "suggestion card incl. its buttons must sit fully above the rest dock"
        )
        save("03-suggestion")
    }

    @MainActor private func shot05Exercises() {
        let app = launch(session: false)
        // The library lives in the Workouts tab behind a segment — the tab bar is a
        // UITabBar on iPhone and a sidebar on iPad, so go through tabElement.
        let workoutsTab = tabElement(app, "Workouts")
        XCTAssertTrue(workoutsTab.waitForExistence(timeout: 15), "Workouts tab missing")
        workoutsTab.tap()
        let segment = app.buttons[tabLibrary].firstMatch
        XCTAssertTrue(segment.waitForExistence(timeout: 10), "Library segment missing")
        segment.tap()
        XCTAssertTrue(
            app.buttons.matching(
                NSPredicate(format: "identifier BEGINSWITH 'ios.library.exerciseRow.'")
            ).firstMatch.waitForExistence(timeout: 10),
            "exercise library list must be visible"
        )
        sleep(2)
        save("05-exercises")
    }

    @MainActor private func shot06History() {
        let app = launch(session: false)
        let tab = tabElement(app, tabHistory)
        XCTAssertTrue(tab.waitForExistence(timeout: 15), "History tab missing")
        tab.tap()
        XCTAssertFalse(
            app.staticTexts[neverTrained].firstMatch.waitForExistence(timeout: 5),
            "history must show seeded sessions"
        )
        sleep(2)
        save("06-history")
    }

    // MARK: - EN

    @MainActor func test01ActiveWorkoutEn() { shot01ActiveWorkout() }
    @MainActor func test02MealPhotoEn() { shot02Meal() }
    @MainActor func test03SetSuggestionEn() { shot03Suggestion() }
    @MainActor func test05ExerciseLibraryEn() { shot05Exercises() }
    @MainActor func test06HistoryProgressEn() { shot06History() }

    // MARK: - DE

    @MainActor func test01ActiveWorkoutDe() { shot01ActiveWorkout() }
    @MainActor func test02MealPhotoDe() { shot02Meal() }
    @MainActor func test03SetSuggestionDe() { shot03Suggestion() }
    @MainActor func test05ExerciseLibraryDe() { shot05Exercises() }
    @MainActor func test06HistoryProgressDe() { shot06History() }
}
