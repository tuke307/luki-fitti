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
