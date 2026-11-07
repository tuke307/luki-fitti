import XCTest
@testable import LukiFittiAPI

final class AnalyticsClientTests: XCTestCase {
    private let base = URL(string: "https://app.example.test")!

    private func client(enabled: Bool = true) -> AnalyticsClient {
        AnalyticsClient(baseURL: base, enabled: enabled, userAgent: "LukiFittiTest/1.0", language: { "de-DE" })
    }

    private func body(_ request: URLRequest?) -> [String: Any] {
        guard let data = request?.httpBody,
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            XCTFail("request has no JSON body")
            return [:]
        }
        return json
    }

    func testDurationBucketBoundaries() {
        XCTAssertEqual(AnalyticsClient.durationBucket(seconds: 0), "<15m")
        XCTAssertEqual(AnalyticsClient.durationBucket(seconds: 14 * 60 + 59), "<15m")
        XCTAssertEqual(AnalyticsClient.durationBucket(seconds: 15 * 60), "15-30m")
        XCTAssertEqual(AnalyticsClient.durationBucket(seconds: 30 * 60), "30-60m")
        XCTAssertEqual(AnalyticsClient.durationBucket(seconds: 60 * 60), "60-90m")
        XCTAssertEqual(AnalyticsClient.durationBucket(seconds: 90 * 60), "90m+")
    }

    func testCountBucketBoundaries() {
        XCTAssertEqual(AnalyticsClient.countBucket(0), "0")
        XCTAssertEqual(AnalyticsClient.countBucket(5), "1-5")
        XCTAssertEqual(AnalyticsClient.countBucket(6), "6-15")
        XCTAssertEqual(AnalyticsClient.countBucket(15), "6-15")
        XCTAssertEqual(AnalyticsClient.countBucket(16), "16-30")
        XCTAssertEqual(AnalyticsClient.countBucket(30), "16-30")
        XCTAssertEqual(AnalyticsClient.countBucket(31), "31+")
    }

    func testSanitizedPath() {
        XCTAssertEqual(AnalyticsClient.sanitizedPath("/workouts?x=1#y"), "/workouts")
        XCTAssertEqual(AnalyticsClient.sanitizedPath("/"), "/")
        XCTAssertNil(AnalyticsClient.sanitizedPath("//evil.example"))
        XCTAssertNil(AnalyticsClient.sanitizedPath("workouts"))
        XCTAssertNil(AnalyticsClient.sanitizedPath("/verify/abcdefghijklmnopqrstuvwxyz0123"))
        XCTAssertNil(AnalyticsClient.sanitizedPath("/" + String(repeating: "a", count: 500)))
    }

    func testSanitizedDataFiltersKeysCapsAndTruncates() {
        var data: [String: AnalyticsValue] = [
            "status": .string("success"),
            "Bad-Key": .string("x"),
            "1bad": .string("x"),
            String(repeating: "a", count: 41): .string("x"),
            "long": .string(String(repeating: "x", count: 120)),
            "count": .int(3),
            "flag": .bool(true),
        ]
        for i in 0..<15 { data["extra_\(i)"] = .int(i) }
        let out = AnalyticsClient.sanitizedData(data)
        XCTAssertLessThanOrEqual(out.count, 10)
        XCTAssertNil(out["Bad-Key"])
        XCTAssertNil(out["1bad"])
        if let s = out["long"] as? String { XCTAssertEqual(s.count, 100) }
        if out["count"] != nil { XCTAssertEqual(out["count"] as? Int, 3) }
        if out["flag"] != nil { XCTAssertEqual(out["flag"] as? Bool, true) }
    }

    func testDisabledClientBuildsNoRequest() {
        let request = client(enabled: false).makeRequest(type: "pageview", url: "/")
        XCTAssertNil(request)
    }

    func testRequestHasNoAuthOrCookieAndCarriesPlatform() {
        let request = client().makeRequest(
            type: "event",
            name: .workoutStart,
            url: "/workouts",
            data: ["source": .string("template")]
        )
        XCTAssertNotNil(request)
        XCTAssertEqual(request?.url?.absoluteString, "https://app.example.test/api/analytics/collect")
        XCTAssertNil(request?.value(forHTTPHeaderField: "Authorization"))
        XCTAssertNil(request?.value(forHTTPHeaderField: "Cookie"))
        XCTAssertEqual(request?.value(forHTTPHeaderField: "User-Agent"), "LukiFittiTest/1.0")
        XCTAssertEqual(request?.value(forHTTPHeaderField: "Accept-Language"), "de-DE")
        let json = body(request)
        XCTAssertEqual(json["type"] as? String, "event")
        XCTAssertEqual(json["name"] as? String, "workout_start")
        XCTAssertEqual(json["platform"] as? String, "ios")
        XCTAssertEqual((json["data"] as? [String: Any])?["source"] as? String, "template")
    }

    func testEventsAreReportedAgainstTheLastScreenPath() {
        let c = client()
        c.screen("/nutrition")
        XCTAssertEqual(body(c.makeEventRequest(.login))["url"] as? String, "/nutrition")
        c.screen("/workouts")
        XCTAssertEqual(body(c.makeEventRequest(.login))["url"] as? String, "/workouts")
        // A dropped screen (token-like segment) keeps the previous path.
        c.screen("/verify/abcdefghijklmnopqrstuvwxyz0123")
        XCTAssertEqual(body(c.makeEventRequest(.login))["url"] as? String, "/workouts")
    }
}
