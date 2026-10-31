import XCTest

@MainActor
final class IOSAuthEmailLifecycleUITests: XCTestCase {
    func testFullRegisterVerifyForgotResetAndDeleteAccountViaMailpit() async throws {
        let app = IOSUITestHelpers.launchApp()
        IOSUITestHelpers.navigateToTab(app, label: "Profile")

        let uniqueId = "\(Int(Date().timeIntervalSince1970))-\(Int.random(in: 1000...9999))"
        let email = "ios.e2e.\(uniqueId)@lukifitti.test"
        let initialPassword = "InitialPass123!"
        let updatedPassword = "UpdatedPass456!"

        try await MailpitTestClient.clearMailbox(for: email)

        // 1. Switch to Register Account mode and submit
        let registerSegment = app.buttons["Register Account"]
        XCTAssertTrue(registerSegment.waitForExistence(timeout: 8))
        registerSegment.tap()

        let nameField = app.textFields["ios.profile.nameField"]
        if nameField.waitForExistence(timeout: 3) {
            nameField.tap()
            nameField.typeText("iOS Mailpit Athlete")
        }

        let emailField = app.textFields["ios.profile.emailField"]
        XCTAssertTrue(emailField.waitForExistence(timeout: 5))
        emailField.tap()
        emailField.typeText(email)

        let passwordField = app.secureTextFields["ios.profile.passwordField"]
        XCTAssertTrue(passwordField.waitForExistence(timeout: 5))
        passwordField.tap()
        passwordField.typeText(initialPassword)

        let submitButton = app.buttons["ios.profile.submitAuthButton"]
        XCTAssertTrue(submitButton.exists)
        submitButton.tap()

        // 2. Fetch Account Confirmation email from Mailpit & open deep link in iOS Simulator
        let confirmEmail = try await MailpitTestClient.waitForEmail(
            to: email,
            subjectContains: "Confirm your account"
        )
        let verifyURL = try MailpitTestClient.extractDeepLinkURL(from: confirmEmail, route: "verify-email")
        app.open(verifyURL)

        let accountRow = app.buttons["ios.profile.row.account"]
        XCTAssertTrue(accountRow.waitForExistence(timeout: 12))
        accountRow.tap()
        let authBadge = app.staticTexts["ios.profile.authenticatedBadge"]
        XCTAssertTrue(authBadge.waitForExistence(timeout: 5))

        // 3. Sign out and request password reset email
        try await MailpitTestClient.clearMailbox(for: email)
        let signOutButton = app.buttons["ios.profile.signOutButton"]
        XCTAssertTrue(signOutButton.waitForExistence(timeout: 5))
        signOutButton.tap()

        let signInSegment = app.buttons["Sign In"]
        XCTAssertTrue(signInSegment.waitForExistence(timeout: 8))
        signInSegment.tap()

        let forgotButton = app.buttons["ios.profile.forgotPasswordButton"]
        XCTAssertTrue(forgotButton.waitForExistence(timeout: 5))
        forgotButton.tap()

        // 4. Fetch Password Reset email from Mailpit & open deep link
        let resetEmail = try await MailpitTestClient.waitForEmail(
            to: email,
            subjectContains: "Reset your password"
        )
        let resetURL = try MailpitTestClient.extractDeepLinkURL(from: resetEmail, route: "reset-password")
        app.open(resetURL)

        let newPassField = app.secureTextFields["ios.profile.newPasswordField"]
        XCTAssertTrue(newPassField.waitForExistence(timeout: 8))
        newPassField.tap()
        newPassField.typeText(updatedPassword)

        let saveNewPassButton = app.buttons["ios.profile.confirmResetButton"]
        XCTAssertTrue(saveNewPassButton.exists)
        saveNewPassButton.tap()

        // 5. Sign in with new password
        XCTAssertTrue(passwordField.waitForExistence(timeout: 5))
        passwordField.tap()
        passwordField.typeText(updatedPassword)
        submitButton.tap()

        XCTAssertTrue(accountRow.waitForExistence(timeout: 10))
        accountRow.tap()
        XCTAssertTrue(authBadge.waitForExistence(timeout: 5))

        // 6. Request Account Deletion & confirm via Mailpit email deep link
        try await MailpitTestClient.clearMailbox(for: email)
        let deleteAccountBtn = app.buttons["ios.profile.deleteAccountButton"]
        XCTAssertTrue(deleteAccountBtn.waitForExistence(timeout: 5))
        deleteAccountBtn.tap()

        let deletePassField = app.secureTextFields["ios.profile.deletePasswordField"]
        XCTAssertTrue(deletePassField.waitForExistence(timeout: 5))
        deletePassField.tap()
        deletePassField.typeText(updatedPassword)

        let sendDeleteEmailBtn = app.buttons["ios.profile.sendDeleteEmailButton"]
        XCTAssertTrue(sendDeleteEmailBtn.exists)
        sendDeleteEmailBtn.tap()

        let deleteEmail = try await MailpitTestClient.waitForEmail(
            to: email,
            subjectContains: "Confirm account deletion"
        )
        let deleteURL = try MailpitTestClient.extractDeepLinkURL(from: deleteEmail, route: "delete-account")
        app.open(deleteURL)

        let confirmDeleteBtn = app.buttons["ios.profile.confirmDeleteAccountButton"]
        XCTAssertTrue(confirmDeleteBtn.waitForExistence(timeout: 8))
        confirmDeleteBtn.tap()

        // Account is deleted and app returns to Guest mode
        XCTAssertTrue(app.buttons["ios.profile.submitAuthButton"].waitForExistence(timeout: 10))
        try await MailpitTestClient.clearMailbox(for: email)
    }
}
