import XCTest

@MainActor
final class IOSActiveSessionUITests: XCTestCase {
    func testActiveWorkoutSetLoggingRestTimerAndTrophySummary() {
        let app = IOSUITestHelpers.launchApp(extraArguments: ["--uitesting-seed-active-session"])

        // Seeded active session opens on Live Gym tab
        let completeSet1Button = app.buttons["ios.session.completeSet.1"]
        XCTAssertTrue(completeSet1Button.waitForExistence(timeout: 10))
        completeSet1Button.tap()

        // Complete Set 2 (Working set with rest > 0s) or trigger 90s preset timer
        if app.buttons["90s"].exists {
            app.buttons["90s"].tap()
        }

        let headerTimerPill = app.buttons["ios.header.restTimerPill"]
        XCTAssertTrue(headerTimerPill.waitForExistence(timeout: 5))

        if app.buttons["Skip Rest"].exists {
            app.buttons["Skip Rest"].tap()
        }

        // Scroll down to the Finish Workout button
        let finishBtn = app.buttons["ios.session.finishButton"]
        var scrollAttempts = 0
        while !finishBtn.isHittable && scrollAttempts < 5 {
            app.swipeUp()
            scrollAttempts += 1
        }
        XCTAssertTrue(finishBtn.waitForExistence(timeout: 5))
        finishBtn.tap()

        // Verify Trophy Summary Card & navigate to Diary
        let viewInDiaryBtn = app.buttons["ios.session.viewInDiaryButton"]
        XCTAssertTrue(viewInDiaryBtn.waitForExistence(timeout: 8))
        viewInDiaryBtn.tap()

        XCTAssertTrue(app.navigationBars["History"].waitForExistence(timeout: 5))

        // Exercises without a logged set are listed apart as "not done", no Skip needed
        let detailsBtn = app.buttons["Details"].firstMatch
        scrollAttempts = 0
        while !(detailsBtn.exists && detailsBtn.isHittable) && scrollAttempts < 6 {
            app.swipeUp()
            scrollAttempts += 1
        }
        detailsBtn.tap()
        XCTAssertTrue(app.descendants(matching: .any)["ios.diary.notDoneExercises"].waitForExistence(timeout: 5))
    }

    func testChangesTheSetTypeOfAPastWorkout() {
        let app = IOSUITestHelpers.launchApp(extraArguments: ["--uitesting-seed-active-session"])
        let completeSet1Button = app.buttons["ios.session.completeSet.1"]
        XCTAssertTrue(completeSet1Button.waitForExistence(timeout: 10))
        completeSet1Button.tap()

        let finishBtn = app.buttons["ios.session.finishButton"]
        var scrollAttempts = 0
        while !finishBtn.isHittable && scrollAttempts < 6 {
            app.swipeUp()
            scrollAttempts += 1
        }
        finishBtn.tap()
        let viewInDiaryBtn = app.buttons["ios.session.viewInDiaryButton"]
        XCTAssertTrue(viewInDiaryBtn.waitForExistence(timeout: 8))
        viewInDiaryBtn.tap()

        let detailsBtn = app.buttons["Details"].firstMatch
        func openDetails() {
            var attempts = 0
            while !(detailsBtn.exists && detailsBtn.isHittable) && attempts < 6 {
                app.swipeUp()
                attempts += 1
            }
            detailsBtn.tap()
        }
        let dropsetBadges = app.buttons.matching(NSPredicate(
            format: "identifier BEGINSWITH 'ios.diary.setType.' AND label CONTAINS 'Dropset'"
        ))

        openDetails()
        let firstSetMenu = app.buttons["ios.diary.setType.1.1"]
        XCTAssertTrue(firstSetMenu.waitForExistence(timeout: 5))
        XCTAssertEqual(dropsetBadges.count, 0)
        firstSetMenu.tap()
        app.buttons["Dropset"].firstMatch.tap()
        XCTAssertTrue(dropsetBadges.firstMatch.waitForExistence(timeout: 5))
        app.buttons["ios.diary.saveButton"].tap()

        openDetails()
        XCTAssertTrue(firstSetMenu.waitForExistence(timeout: 5))
        XCTAssertEqual(dropsetBadges.count, 1)
    }

    func testNoSkipActionInTheExerciseMenu() {
        let app = IOSUITestHelpers.launchApp(extraArguments: ["--uitesting-seed-active-session"])
        let header = app.descendants(matching: .any)["ios.session.exerciseHeader.1"]
        XCTAssertTrue(header.waitForExistence(timeout: 10))
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'More actions'")).firstMatch.tap()
        XCTAssertTrue(app.buttons["Replace"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["Skip"].exists)
    }

    func testOpensTheExerciseGuideFromTheRunningWorkout() {
        let app = IOSUITestHelpers.launchApp(extraArguments: ["--uitesting-seed-active-session"])
        let guideButton = app.buttons["ios.session.guideButton.1"]
        XCTAssertTrue(guideButton.waitForExistence(timeout: 10))
        guideButton.tap()
        let sheet = app.descendants(matching: .any)["ios.exerciseGuide.sheet"]
        XCTAssertTrue(sheet.waitForExistence(timeout: 5))
        app.buttons["ios.exerciseGuide.doneButton"].tap()
        wait(for: [expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: sheet)], timeout: 5)

        app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'More actions'")).firstMatch.tap()
        app.buttons["How to do it"].tap()
        XCTAssertTrue(sheet.waitForExistence(timeout: 5))
    }

    func testReopensTheExerciseTheUserWasOnAfterMinimizing() {
        let app = IOSUITestHelpers.launchApp(extraArguments: ["--uitesting-seed-active-session"])

        let completeSet1Button = app.buttons["ios.session.completeSet.1"]
        XCTAssertTrue(completeSet1Button.waitForExistence(timeout: 10))
        completeSet1Button.tap()

        let secondRow = app.buttons["ios.session.exerciseRow.2"]
        XCTAssertTrue(secondRow.waitForExistence(timeout: 5))
        secondRow.tap()
        XCTAssertTrue(app.descendants(matching: .any)["ios.session.exerciseHeader.2"].waitForExistence(timeout: 5))

        app.buttons["ios.session.minimizeButton"].tap()
        let accessory = app.buttons["ios.shell.sessionAccessory"]
        XCTAssertTrue(accessory.waitForExistence(timeout: 5))
        accessory.tap()

        XCTAssertTrue(app.descendants(matching: .any)["ios.session.exerciseHeader.2"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.descendants(matching: .any)["ios.session.exerciseHeader.1"].exists)
    }

    /// Audit §7: while resting, the dock must not cover Finish / Discard at the end of the list.
    func testRestDockKeepsFinishAndDiscardReachable() {
        let app = IOSUITestHelpers.launchApp(extraArguments: ["--uitesting-seed-active-session"])
        let completeSet1Button = app.buttons["ios.session.completeSet.1"]
        XCTAssertTrue(completeSet1Button.waitForExistence(timeout: 10))
        completeSet1Button.tap()
        let dock = app.descendants(matching: .any)["ios.session.restDock"]
        if !app.buttons["Skip Rest"].waitForExistence(timeout: 3) { app.buttons["90s"].tap() }
        XCTAssertTrue(app.buttons["Skip Rest"].waitForExistence(timeout: 5), "rest timer should be running")

        let finish = app.buttons["ios.session.finishButton"]
        let discard = app.buttons["ios.session.abandonButton"]
        for _ in 0..<10 where !(discard.exists && discard.isHittable) { app.swipeUp() }
        // One more swipe so the list sits at its end, then both buttons must clear the dock.
        app.swipeUp()
        XCTAssertTrue(finish.isHittable)
        XCTAssertTrue(discard.isHittable)
        XCTAssertLessThanOrEqual(finish.frame.maxY, dock.frame.minY + 1)
        XCTAssertLessThanOrEqual(discard.frame.maxY, dock.frame.minY + 1)
        XCTAssertTrue(app.buttons["Skip Rest"].exists, "still resting")

        finish.tap()
        XCTAssertTrue(app.buttons["ios.session.viewInDiaryButton"].waitForExistence(timeout: 8))
    }

    /// Audit caveat: one run saved "0 sets" after minimize → re-open → exercise "…" menu → Finish.
    func testFinishAfterMinimizeReopenAndExerciseMenuKeepsCompletedSets() {
        let app = IOSUITestHelpers.launchApp()
        let start = app.buttons["ios.home.startSuggestedButton"]
        XCTAssertTrue(start.waitForExistence(timeout: 10))
        start.tap()

        for n in 1...3 {
            let complete = app.buttons["ios.session.completeSet.\(n)"]
            XCTAssertTrue(complete.waitForExistence(timeout: 5))
            // On small phones the rest dock can sit over the next row; scroll it clear first.
            let dock = app.descendants(matching: .any)["ios.session.restDock"]
            for _ in 0..<4 where dock.exists && complete.frame.maxY > dock.frame.minY {
                app.swipeUp(velocity: .slow)
            }
            complete.tap()
            XCTAssertTrue(
                complete.waitForLabel(beginningWith: "Mark set \(n) not done"),
                "set \(n) should be completed, label “\(complete.label)”"
            )
        }

        app.buttons["ios.session.minimizeButton"].tap()
        let accessory = app.buttons["ios.shell.sessionAccessory"]
        XCTAssertTrue(accessory.waitForExistence(timeout: 5))
        accessory.tap()
        XCTAssertTrue(app.descendants(matching: .any)["ios.session.exerciseHeader.1"].waitForExistence(timeout: 5))

        let menu = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'More actions'")).firstMatch
        XCTAssertTrue(menu.waitForExistence(timeout: 5))
        menu.tap()
        XCTAssertTrue(app.buttons["Replace"].waitForExistence(timeout: 5))
        // Close the menu without picking anything.
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.08)).tap()
        XCTAssertTrue(app.buttons["Replace"].waitForNonExistence(timeout: 5))

        let finish = app.buttons["ios.session.finishButton"]
        for _ in 0..<10 where !(finish.exists && finish.isHittable) { app.swipeUp() }
        finish.tap()

        let sets = app.descendants(matching: .any)["ios.session.summary.sets"]
        XCTAssertTrue(sets.waitForExistence(timeout: 8))
        let numbers = sets.label.split(whereSeparator: { !$0.isNumber })
        XCTAssertEqual(numbers.last, "3", "summary should show 3 sets, got “\(sets.label)”")
    }

    func testReplaceSheetOffersTheSameMovementFirst() {
        let app = IOSUITestHelpers.launchApp(extraArguments: ["--uitesting-seed-active-session"])
        let header = app.descendants(matching: .any)["ios.session.exerciseHeader.1"]
        XCTAssertTrue(header.waitForExistence(timeout: 10))
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'More actions'")).firstMatch.tap()
        let replace = app.buttons["Replace"]
        XCTAssertTrue(replace.waitForExistence(timeout: 5))
        replace.tap()

        let bestMatches = app.descendants(matching: .any)["ios.picker.section.bestMatches"]
        XCTAssertTrue(bestMatches.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Best matches"].exists)
        let sameMovement = bestMatches.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Same movement'"))
        XCTAssertGreaterThan(sameMovement.count, 0)
        XCTAssertTrue(app.staticTexts["All exercises"].exists)

        // Searching shows plain results without the suggestions.
        let search = app.textFields["Search exercises"]
        search.tap()
        search.typeText("curl")
        XCTAssertFalse(bestMatches.waitForExistence(timeout: 2))
    }
}

private extension XCUIElement {
    func waitForLabel(beginningWith prefix: String, timeout: TimeInterval = 5) -> Bool {
        let predicate = NSPredicate(format: "label BEGINSWITH %@", prefix)
        return XCTWaiter().wait(for: [XCTNSPredicateExpectation(predicate: predicate, object: self)], timeout: timeout) == .completed
    }
}
