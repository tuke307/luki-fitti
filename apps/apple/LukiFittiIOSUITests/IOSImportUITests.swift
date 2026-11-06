import XCTest

/// Import screen against a real API: sign in, pick the bundled example file in the document
/// picker, check the preview, import, then pick it again and expect "nothing new".
/// Needs a verified account: pass `TEST_RUNNER_TEST_USER_EMAIL` / `TEST_RUNNER_TEST_USER_PASSWORD`
/// to `xcodebuild test`; the test is skipped without them.
@MainActor
final class IOSImportUITests: XCTestCase {
    private static let fileName = "luki-import-example.json"

    func testImportPreviewCommitAndReimportIsANoOp() throws {
        let env = ProcessInfo.processInfo.environment
        guard let email = env["TEST_USER_EMAIL"], let password = env["TEST_USER_PASSWORD"] else {
            throw XCTSkip("Set TEST_USER_EMAIL and TEST_USER_PASSWORD for the import UI test")
        }
        try Self.placeFixtureInFilesApp()

        let app = IOSUITestHelpers.launchApp()
        IOSUITestHelpers.navigateToTab(app, label: "Profile")
        signIn(app, email: email, password: password)

        // Signing in closes the profile sheet; reopen it and scroll to the Data section.
        let importRow = app.buttons["ios.profile.row.importFile"]
        let profileList = app.buttons["ios.profile.row.account"]
        for _ in 0..<4 where !profileList.waitForExistence(timeout: 4) {
            app.buttons["ios.header.profileButton"].tap()
        }
        for _ in 0..<8 where !importRow.isHittable {
            app.swipeUp()
        }
        XCTAssertTrue(importRow.waitForExistence(timeout: 5), "Import row appears once signed in")
        importRow.tap()

        pickFixture(app)
        XCTAssertTrue(app.staticTexts["From Example"].waitForExistence(timeout: 15), "Preview shows the source app")

        let commit = app.buttons["ios.import.commit"]
        if commit.exists {
            commit.tap()
            XCTAssertTrue(app.staticTexts["Import complete"].waitForExistence(timeout: 20))
        }

        pickFixture(app)
        XCTAssertTrue(
            app.staticTexts["Everything in this file is already in your account."].waitForExistence(timeout: 15),
            "Re-importing the same file finds nothing new"
        )
        XCTAssertFalse(app.buttons["ios.import.commit"].exists)
    }

    private func signIn(_ app: XCUIApplication, email: String, password: String) {
        let emailField = app.textFields["ios.profile.emailField"]
        XCTAssertTrue(emailField.waitForExistence(timeout: 8))
        emailField.tap()
        emailField.typeText(email)
        let passwordField = app.secureTextFields["ios.profile.passwordField"]
        passwordField.tap()
        passwordField.typeText(password)
        app.buttons["ios.profile.submitAuthButton"].tap()
    }

    private func pickFixture(_ app: XCUIApplication) {
        let notNow = app.buttons["Not Now"]
        if notNow.waitForExistence(timeout: 2) { notNow.tap() } // "Save Password?" after sign-in
        let choose = app.buttons["ios.import.chooseFile"]
        XCTAssertTrue(choose.waitForExistence(timeout: 8))
        choose.tap()
        let file = app.cells.containing(.staticText, identifier: Self.fileName).firstMatch
        if !file.waitForExistence(timeout: 5) {
            // The picker opens on Recents the first time; switch to On My iPhone.
            let browse = app.buttons["Browse"]
            if browse.waitForExistence(timeout: 5) { browse.tap() }
            let onDevice = app.cells["On My iPhone"].exists ? app.cells["On My iPhone"] : app.staticTexts["On My iPhone"]
            if onDevice.waitForExistence(timeout: 5) { onDevice.tap() }
        }
        XCTAssertTrue(file.waitForExistence(timeout: 10), "Bundled import file is listed in the picker")
        file.tap()
    }

    /// Copies the bundled file into the simulator's "On My iPhone" storage (simulator only).
    private static func placeFixtureInFilesApp() throws {
        guard let source = Bundle(for: IOSImportUITests.self).url(forResource: "luki-import-example", withExtension: "json") else {
            throw XCTSkip("Fixture missing from the test bundle")
        }
        let home = URL(fileURLWithPath: NSHomeDirectory())
        guard let dataRange = home.path.range(of: "/data/Containers/") else {
            throw XCTSkip("Only runs on the simulator")
        }
        let groups = URL(fileURLWithPath: String(home.path[..<dataRange.lowerBound]) + "/data/Containers/Shared/AppGroup")
        let fm = FileManager.default
        let group = try fm.contentsOfDirectory(at: groups, includingPropertiesForKeys: nil).first { dir in
            let meta = dir.appendingPathComponent(".com.apple.mobile_container_manager.metadata.plist")
            let plist = NSDictionary(contentsOf: meta)
            return plist?["MCMMetadataIdentifier"] as? String == "group.com.apple.FileProvider.LocalStorage"
        }
        guard let group else { throw XCTSkip("Files app storage not found on this simulator") }
        let storage = group.appendingPathComponent("File Provider Storage", isDirectory: true)
        try fm.createDirectory(at: storage, withIntermediateDirectories: true)
        let target = storage.appendingPathComponent(fileName)
        try? fm.removeItem(at: target)
        try fm.copyItem(at: source, to: target)
    }
}
