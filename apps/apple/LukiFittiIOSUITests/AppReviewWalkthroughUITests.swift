import XCTest

/// App Review walkthrough — one continuous recorded run per language, captured via the
/// xctestrun `PreferredScreenCaptureFormat = screenRecording` keys (set by
/// scripts/app-review-video.sh). Skipped by the normal e2e suite.
///
/// Runs against the LOCAL dev stack: the API base URL comes from the runner env
/// `LUKIFITTI_API_BASE_URL`, confirmation/deletion mails are read from Mailpit
/// (`MAILPIT_URL`, default http://localhost:8025). The app is launched with
/// `--uitesting-review`, which only seeds the AI demo meal — everything else is
/// exercised live so a reviewer sees the real flows.
@MainActor
final class AppReviewWalkthroughUITests: XCTestCase {
    /// Locale comes from the method name (`…En` / `…De`) — env vars don't reach the runner.
    private var lang: String { name.contains("De]") ? "de" : "en" }

    private var tabToday: String { lang == "de" ? "Heute" : "Today" }
    private var tabWorkouts: String { "Workouts" }
    private var tabFood: String { lang == "de" ? "Essen" : "Food" }
    private var tabHistory: String { lang == "de" ? "Verlauf" : "History" }
    private var tabLibrary: String { lang == "de" ? "Bibliothek" : "Library" }
    private var registerSegment: String { lang == "de" ? "Registrieren" : "Register Account" }
    private var signInSegment: String { lang == "de" ? "Anmelden" : "Sign In" }
    private var skipRest: String { lang == "de" ? "Pause überspringen" : "Skip Rest" }
    private var cancelLabel: String { lang == "de" ? "Abbrechen" : "Cancel" }
    private var foodField: String { lang == "de" ? "Lebensmittel oder Getränk" : "Food or drink" }
    private var stretchingSegment: String { lang == "de" ? "Dehnen" : "Stretching" }

    private let paceSeconds: TimeInterval = {
        let raw = ProcessInfo.processInfo.environment["REVIEW_PACE_SECONDS"]
        return TimeInterval(raw ?? "") ?? 0.75
    }()

    private var startTime = Date()
    private var app: XCUIApplication!

    /// Pause so a human reviewer can follow each step, then log the video timestamp.
    /// Also sweeps system alerts — on a physical device they can appear at any
    /// network/touch boundary (Local Network, notification permission, "Open in …?").
    private func step(_ title: String) {
        XCTAssertEqual(app.state, .runningForeground, "app left the foreground")
        dismissSystemAlerts()
        Thread.sleep(forTimeInterval: paceSeconds)
        let elapsed = Date().timeIntervalSince(startTime)
        print(String(format: "[AppReviewWalkthrough] %02d:%02d %@", Int(elapsed) / 60, Int(elapsed) % 60, title))
    }

    /// Non-blocking: taps a system permission button only if one is already up —
    /// never waits for a snapshot. The per-step pause must stay cheap.
    private func dismissSystemAlerts() {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let allow = ["Allow", "Erlauben", "OK", "Allow While Using App", "Bei Verwendung erlauben", "Open", "Öffnen"]
        guard springboard.alerts.firstMatch.exists else { return }
        for label in allow {
            let button = springboard.buttons[label].firstMatch
            if button.exists { button.tap(); return }
        }
    }

    /// iOS offers to save the password after sign-up / sign-in ("Save Password?").
    /// Left open, it swallows the next tap — decline it.
    private func dismissSavePasswordPrompt(timeout: TimeInterval = 4) {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let labels = ["Not Now", "Nicht jetzt"]
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            for host in [app!, springboard] {
                for label in labels {
                    let button = host.buttons[label].firstMatch
                    if button.exists { button.tap(); return }
                }
            }
            Thread.sleep(forTimeInterval: 0.3)
        }
    }

    /// Blocking sweep for the few places a system prompt can actually appear:
    /// the first API call and the first Mailpit deep link.
    private func waitForSystemAlert() {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let allow = ["Allow", "Erlauben", "OK", "Allow While Using App", "Bei Verwendung erlauben", "Open", "Öffnen"]
        let alert = springboard.alerts.firstMatch
        guard alert.waitForExistence(timeout: 1) else { return }
        for label in allow {
            let button = springboard.buttons[label].firstMatch
            if button.exists { button.tap(); return }
        }
    }

    /// Ask the app to poll Mailpit and follow the token deep link itself — the test
    /// runner has no Local Network permission on a physical device, the app does.
    /// iOS covers the keyboard with a "Use Strong Password" AutoFill panel on
    /// .newPassword fields. Its X sits top-right — tap any recognisable close
    /// button, else the panel's top-right corner.
    private func dismissStrongPasswordPanel(_ app: XCUIApplication) {
        let labels = ["Close", "Schließen", "Dismiss", "Verwerfen",
                      "Choose My Own Password", "Eigenes Passwort wählen",
                      "Don't Use Strong Password", "Kein starkes Passwort verwenden",
                      "Other Options", "Weitere Optionen"]
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        for label in labels {
            for host in [app, springboard] {
                let button = host.buttons[label].firstMatch
                if button.exists { button.tap(); Thread.sleep(forTimeInterval: 0.5); return }
            }
        }
        // Fallback: the X in the panel's top-right corner (relative to the screen).
        for host in [app, springboard] {
            let close = host.buttons.matching(NSPredicate(
                format: "identifier CONTAINS[c] 'close' OR label CONTAINS[c] 'close'"
            )).firstMatch
            if close.exists { close.tap(); Thread.sleep(forTimeInterval: 0.5); return }
        }
    }

    /// Secure fields on a real device lose the keyboard to the strong-password
    /// panel — dismiss it, wait for a real keyboard, then type.
    private func focusAndType(_ app: XCUIApplication, field: XCUIElement, _ text: String) {
        for _ in 0..<4 {
            field.tap()
            Thread.sleep(forTimeInterval: 0.6)
            if !app.keyboards.firstMatch.exists {
                dismissStrongPasswordPanel(app)
                field.tap()
            }
            if app.keyboards.firstMatch.waitForExistence(timeout: 3) && field.hasFocus { break }
            if app.keyboards.firstMatch.exists { break }
        }
        field.typeText(text)
    }


    private func tabElement(_ app: XCUIApplication, _ name: String) -> XCUIElement {
        app.tabBars.buttons[name].firstMatch.exists
            ? app.tabBars.buttons[name].firstMatch
            : app.buttons[name].firstMatch
    }

    private func launch() -> XCUIApplication {
        let app = XCUIApplication()
        self.app = app
        app.launchArguments = ["--uitesting", "--uitesting-review",
                               "-AppleLanguages", "(\(lang))", "-AppleInterfaceStyle", "Dark"]
        app.launchEnvironment["LUKIFITTI_MARKETING_LANG"] = lang
        if let api = ProcessInfo.processInfo.environment["LUKIFITTI_API_BASE_URL"] {
            app.launchEnvironment["LUKIFITTI_API_BASE_URL"] = api
        }
        // The runner has no Local Network permission on a physical device, so the
        // The app polls Mailpit itself after register/delete-email (pollMailpitForReview).
        let mailpitURL = ProcessInfo.processInfo.environment["MAILPIT_URL"] ?? "http://localhost:8025"
        app.launchEnvironment["LUKIFITTI_MAILPIT_URL"] = mailpitURL
        // Host paths are unreadable on a physical device — pass the demo photo
        // bundled with this test target as base64 instead.
        if let photoURL = Bundle(for: AppReviewWalkthroughUITests.self)
            .url(forResource: "demo-meal", withExtension: "jpg"),
            let data = try? Data(contentsOf: photoURL) {
            app.launchEnvironment["LUKIFITTI_REVIEW_MEAL_PHOTO_B64"] = data.base64EncodedString()
        }
        addUIInterruptionMonitor(withDescription: "System alerts") { alert in
            for label in ["Allow", "Erlauben", "OK", "Open", "Öffnen"] where alert.buttons[label].exists {
                alert.buttons[label].tap()
                return true
            }
            return false
        }
        app.launch()
        return app
    }

    private func walkthrough() async throws {
        startTime = Date()
        let app = launch()
        step("launch")

        // Hard locale guard first so a De video can never come out in English.
        XCTAssertTrue(
            tabElement(app, tabToday).waitForExistence(timeout: 15),
            "expected \(lang) tab '\(tabToday)' — video would be in the wrong language"
        )
        dismissSystemAlerts()

        // 1. Profile → Register → the app polls Mailpit for verify-email and
        // follows the token link itself (no app.open — that would leave the app).
        app.buttons["ios.header.profileButton"].firstMatch.tap()
        let register = app.buttons[registerSegment]
        XCTAssertTrue(register.waitForExistence(timeout: 8), "register segment missing")
        register.tap()

        let email = "review.\(lang).\(Int(Date().timeIntervalSince1970))@lukifitti.test"
        let password = "ReviewPass123!"

        let profileName = app.textFields["ios.profile.nameField"]
        if profileName.waitForExistence(timeout: 3) {
            profileName.tap()
            profileName.typeText("App Review")
        }
        let emailField = app.textFields["ios.profile.emailField"]
        XCTAssertTrue(emailField.waitForExistence(timeout: 5))
        emailField.tap()
        emailField.typeText(email)
        let passwordField = app.secureTextFields["ios.profile.passwordField"]
        XCTAssertTrue(passwordField.waitForExistence(timeout: 5))
        focusAndType(app, field: passwordField, password)
        step("register \(email)")
        app.buttons["ios.profile.submitAuthButton"].tap()
        waitForSystemAlert()

        let accountRow = app.buttons["ios.profile.row.account"]
        step("email confirmed")
        // The app's own Mailpit poll has a 30 s window; give it room plus slack.
        XCTAssertTrue(accountRow.waitForExistence(timeout: 45), "account row missing")
        // iOS may raise "Save Password?" right after sign-up; it swallows the next tap.
        let badge = app.staticTexts["ios.profile.authenticatedBadge"]
        for _ in 0..<3 {
            dismissSavePasswordPrompt(timeout: 2)
            if accountRow.exists { accountRow.tap() }
            if badge.waitForExistence(timeout: 4) { break }
        }
        XCTAssertTrue(badge.waitForExistence(timeout: 5), "authenticated badge missing")
        dismissSavePasswordPrompt(timeout: 1)
        step("authenticated")

        // 2. Sign Out → Sign In with the same credentials (explicit login flow).
        let signOut = app.buttons["ios.profile.signOutButton"]
        XCTAssertTrue(signOut.waitForExistence(timeout: 8), "sign out button missing")
        signOut.tap()
        if !app.buttons[signInSegment].waitForExistence(timeout: 3) {
            dismissSavePasswordPrompt(timeout: 2)
            if signOut.exists { signOut.tap() }
        }
        step("signed out")

        let signIn = app.buttons[signInSegment]
        XCTAssertTrue(signIn.waitForExistence(timeout: 8), "sign in segment missing")
        signIn.tap()
        // Sign Out keeps the typed credentials in the form — only retype when they're gone.
        if (emailField.value as? String) != email {
            emailField.tap()
            emailField.typeText(email)
        }
        if (passwordField.value as? String ?? "").isEmpty || passwordField.value as? String == passwordField.placeholderValue {
            focusAndType(app, field: passwordField, password)
        }
        step("sign in")
        app.buttons["ios.profile.submitAuthButton"].tap()
        waitForSystemAlert()
        // Signing in returns to the Profile overview with the account row.
        XCTAssertTrue(accountRow.waitForExistence(timeout: 20), "not authenticated after sign in")
        dismissSavePasswordPrompt()
        step("signed in")

        let done = app.navigationBars.buttons[lang == "de" ? "Fertig" : "Done"].firstMatch
        XCTAssertTrue(done.waitForExistence(timeout: 5), "profile Done button missing")
        done.tap()
        XCTAssertTrue(tabElement(app, tabToday).waitForExistence(timeout: 8), "profile sheet still open")
        step("profile closed")

        // 3. Features, signed in.
        step("today")

        tabElement(app, tabWorkouts).tap()
        let startButton = app.descendants(matching: .any).matching(
            NSPredicate(format: "identifier BEGINSWITH 'ios.workouts.startTemplate.'")
        ).firstMatch
        if !startButton.waitForExistence(timeout: 5) {
            let folder = app.descendants(matching: .any).matching(
                NSPredicate(format: "identifier BEGINSWITH 'ios.workouts.folder.'")
            ).firstMatch
            if folder.waitForExistence(timeout: 5) { folder.tap() }
        }
        XCTAssertTrue(startButton.waitForExistence(timeout: 10), "no workout template to start")
        step("workouts")
        startButton.tap()

        let firstSet = app.buttons["ios.session.completeSet.1"]
        XCTAssertTrue(firstSet.waitForExistence(timeout: 10), "session did not open")
        dismissSystemAlerts()
        step("active session")

        for setNumber in 1...3 {
            let complete = app.buttons["ios.session.completeSet.\(setNumber)"]
            XCTAssertTrue(complete.waitForExistence(timeout: 8), "set \(setNumber) missing")
            let dock = app.descendants(matching: .any)["ios.session.restDock"]
            for _ in 0..<4 where dock.exists && complete.frame.maxY > dock.frame.minY {
                app.swipeUp(velocity: .slow)
            }
            complete.tap()
            step("completed set \(setNumber)")
            let skip = app.buttons[skipRest].firstMatch
            if skip.waitForExistence(timeout: 4) {
                step("rest timer running")
                skip.tap()
            }
        }

        step("finish workout")
        let finish = app.buttons["ios.session.finishButton"]
        for _ in 0..<10 where !(finish.exists && finish.isHittable) { app.swipeUp() }
        XCTAssertTrue(finish.waitForExistence(timeout: 5), "finish button missing")
        finish.tap()

        let viewInHistory = app.buttons["ios.session.viewInDiaryButton"]
        XCTAssertTrue(viewInHistory.waitForExistence(timeout: 10), "summary missing")
        step("workout summary")
        viewInHistory.tap()

        XCTAssertTrue(tabElement(app, tabHistory).waitForExistence(timeout: 10))
        step("history")

        IOSUITestHelpers.openLibrary(
            app,
            workoutsLabel: "Workouts",
            libraryLabel: tabLibrary
        )
        XCTAssertTrue(
            app.buttons.matching(
                NSPredicate(format: "identifier BEGINSWITH 'ios.library.exerciseRow.'")
            ).firstMatch.waitForExistence(timeout: 10),
            "exercise library missing"
        )
        step("exercise library")
        let stretching = app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH %@", stretchingSegment)
        ).firstMatch
        XCTAssertTrue(stretching.waitForExistence(timeout: 5), "stretching segment missing")
        stretching.tap()
        let startRoutine = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH 'ios.library.startRoutine.'")
        ).firstMatch
        XCTAssertTrue(startRoutine.waitForExistence(timeout: 8), "no stretching routine")
        step("stretching")
        startRoutine.tap()
        XCTAssertTrue(app.buttons["ios.session.completeSet.1"].waitForExistence(timeout: 10))
        step("stretching session")
        let abandon = app.buttons["ios.session.abandonButton"]
        XCTAssertTrue(abandon.waitForExistence(timeout: 8), "abandon button missing")
        abandon.tap()
        let confirmDiscard = app.buttons["ios.session.confirmDiscardButton"].firstMatch
        if confirmDiscard.waitForExistence(timeout: 5) { confirmDiscard.tap() }
        step("stretching stopped")

        tabElement(app, tabFood).tap()
        let addMeal = app.buttons["ios.nutrition.addMealButton"]
        XCTAssertTrue(addMeal.waitForExistence(timeout: 10), "food tab missing")
        step("food")

        // Seeded AI demo meal — put back by the Food tab after its server refresh.
        let lunchRow = app.buttons.containing(
            NSPredicate(format: "label CONTAINS 'Lunch' OR label CONTAINS 'Mittagessen'")
        ).firstMatch
        XCTAssertTrue(lunchRow.waitForExistence(timeout: 10), "seeded AI meal missing")
        lunchRow.tap()
        step("ai meal")
        app.buttons[cancelLabel].firstMatch.tap()

        XCTAssertTrue(addMeal.waitForExistence(timeout: 5))
        addMeal.tap()

        let nameField = app.textFields[foodField].firstMatch
        XCTAssertTrue(nameField.waitForExistence(timeout: 8), "meal name field missing")
        nameField.tap()
        nameField.typeText(lang == "de" ? "Griechischer Joghurt" : "Greek yogurt")
        let kcalField = app.textFields["ios.nutrition.item.kcal"].firstMatch
        XCTAssertTrue(kcalField.waitForExistence(timeout: 5), "kcal field missing")
        kcalField.tap()
        kcalField.typeText("190")
        XCTAssertEqual(kcalField.value as? String, "190", "kcal field must contain exactly '190'")
        app.buttons["ios.nutrition.saveMealButton"].tap()
        XCTAssertTrue(app.staticTexts[lang == "de" ? "Griechischer Joghurt" : "Greek yogurt"].waitForExistence(timeout: 8))
        step("meal logged")

        // 4. Profile → delete → email → app polls for delete-account → confirm.
        app.buttons["ios.header.profileButton"].firstMatch.tap()
        XCTAssertTrue(accountRow.waitForExistence(timeout: 8), "account row missing")
        accountRow.tap()
        step("delete account")
        let deleteButton = app.buttons["ios.profile.deleteAccountButton"]
        XCTAssertTrue(deleteButton.waitForExistence(timeout: 8), "delete button missing")
        deleteButton.tap()

        let deletePassword = app.secureTextFields["ios.profile.deletePasswordField"]
        XCTAssertTrue(deletePassword.waitForExistence(timeout: 5))

        let confirmDelete = app.buttons["ios.profile.confirmDeleteAccountButton"]
        for attempt in 0..<3 where !confirmDelete.exists {
            focusAndType(app, field: deletePassword, password)
            app.buttons["ios.profile.sendDeleteEmailButton"].tap()
            if attempt > 0 { try? await Task.sleep(nanoseconds: 1_500_000_000) }
            if !confirmDelete.exists {
                _ = confirmDelete.waitForExistence(timeout: 45)
            }
        }
        XCTAssertTrue(confirmDelete.waitForExistence(timeout: 10), "confirm delete missing")
        confirmDelete.tap()
        XCTAssertTrue(
            app.buttons["ios.profile.submitAuthButton"].waitForExistence(timeout: 15),
            "app did not return to guest mode"
        )
        step("account deleted — guest")
    }

    @MainActor func testAppReviewWalkthroughEn() async throws { try await walkthrough() }
    @MainActor func testAppReviewWalkthroughDe() async throws { try await walkthrough() }
}
