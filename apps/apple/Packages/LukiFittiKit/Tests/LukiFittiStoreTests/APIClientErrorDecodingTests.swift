import XCTest
@testable import LukiFittiAPI
@testable import LukiFittiDesign
@testable import LukiFittiModels

private final class FakeTokenStore: TokenStoring, @unchecked Sendable {
    var tokens: AuthTokensDto? = AuthTokensDto(
        accessToken: "FAKE-ACCESS", refreshToken: "FAKE-REFRESH", expiresAt: "2099-12-01T00:00:00Z"
    )
    func saveTokens(_ tokens: AuthTokensDto, userId: String?) throws { self.tokens = tokens }
    func loadTokens() -> AuthTokensDto? { tokens }
    func loadUserId() -> String? { nil }
    func clearTokens() { tokens = nil }
}

/// Answers every request with the queued status/body pair.
private final class StubURLProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var handler: ((URLRequest) -> (Int, Data))?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let (status, body) = Self.handler?(request) ?? (500, Data())
        let response = HTTPURLResponse(
            url: request.url!, statusCode: status, httpVersion: nil,
            headerFields: ["Content-Type": "application/json"]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

final class APIClientErrorDecodingTests: XCTestCase {
    private func makeClient() -> APIClient {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubURLProtocol.self]
        return APIClient(
            baseURL: URL(string: "https://error-decoding.test")!,
            tokenStore: FakeTokenStore(),
            session: URLSession(configuration: config)
        )
    }

    private func stub(_ status: Int, _ body: String) {
        StubURLProtocol.handler = { _ in (status, Data(body.utf8)) }
    }

    private func fetchError() async -> APIClientError? {
        do {
            _ = try await makeClient().fetchExercises()
            return nil
        } catch let error as APIClientError {
            return error
        } catch {
            return nil
        }
    }

    func testStringErrorEnvelopeYieldsMessageAndCode() async {
        stub(409, #"{"success":false,"data":null,"error":"An account with this email already exists","details":{"statusCode":409,"code":"EMAIL_ALREADY_EXISTS"}}"#)
        let error = await fetchError()
        XCTAssertEqual(
            error,
            .serverError(409, "An account with this email already exists", code: "EMAIL_ALREADY_EXISTS")
        )
    }

    func testObjectErrorEnvelopeYieldsMessage() async {
        stub(400, #"{"error":{"message":"Nope"}}"#)
        let error = await fetchError()
        XCTAssertEqual(error, .serverError(400, "Nope", code: nil))
    }

    func testNonJsonBodyYieldsEmptyMessageAndGenericDescription() async {
        stub(502, "<html>bad gateway</html>")
        let error = await fetchError()
        XCTAssertEqual(error, .serverError(502, "", code: nil))
        XCTAssertEqual(error?.errorDescription, "Something went wrong. Please try again.")
    }

    func testAiKeyRequiredCodeMapsToDedicatedCase() async {
        stub(403, #"{"error":"Forbidden","details":{"statusCode":403,"code":"AI_KEY_REQUIRED"}}"#)
        let error = await fetchError()
        XCTAssertEqual(error, .aiKeyRequired)
    }

    func testGermanLocaleMapsErrorCodes() {
        let error = APIClientError.serverError(
            409, "An account with this email already exists", code: "EMAIL_ALREADY_EXISTS"
        )
        XCTAssertEqual(
            SupportedLocale.de.errorMessage(error),
            "Mit dieser E-Mail-Adresse gibt es bereits ein Konto."
        )
        XCTAssertEqual(
            SupportedLocale.en.errorMessage(error),
            "An account with this email already exists."
        )
    }
}
