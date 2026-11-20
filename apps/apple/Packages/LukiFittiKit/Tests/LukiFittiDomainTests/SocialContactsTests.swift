import XCTest
import LukiFittiDomain

final class SocialContactsTests: XCTestCase {
    /// Shared cross-platform vector from `social.util.spec.ts` in @luki-fitti/common — every
    /// platform must digest the normalised email to the same hex.
    func testHashMatchesSharedVector() {
        XCTAssertEqual(
            EmailLookup.hash(" Foo@Example.COM "),
            "321ba197033e81286fedb719d60d4ed5cecaed170733cb4a92013811afc0e3b6"
        )
        XCTAssertEqual(
            EmailLookup.hash("foo@example.com"),
            "321ba197033e81286fedb719d60d4ed5cecaed170733cb4a92013811afc0e3b6"
        )
    }

    func testNormalizeTrimsAndLowercases() {
        XCTAssertEqual(EmailLookup.normalize("  Max@Luki.de\t"), "max@luki.de")
    }

    func testHashBatchesDedupesSkipsNonEmailsAndChunks() {
        var emails = ["a@b.c", " A@B.c ", "not-an-email"]
        for i in 0..<2100 { emails.append("user\(i)@x.de") }
        let batches = EmailLookup.hashBatches(emails, maxPerBatch: 2000)
        XCTAssertEqual(batches.count, 2)
        XCTAssertEqual(batches[0].count, 2000)
        XCTAssertEqual(batches[1].count, 101) // deduped a@b.c once + 2100 uniques → 2101
        XCTAssertTrue(batches.flatMap { $0 }.allSatisfy { $0.range(of: "^[0-9a-f]{64}$", options: .regularExpression) != nil })
    }

    func testHashBatchesEmptyInput() {
        XCTAssertEqual(EmailLookup.hashBatches([]), [])
    }

    func testInviteLinkParsesUniversalLinkAndCustomScheme() {
        let token = String(repeating: "a", count: 43)
        XCTAssertEqual(
            InviteLink.token(from: URL(string: "https://app.luki-fitti.tony-luke.de/invite/\(token)")!),
            token
        )
        XCTAssertEqual(InviteLink.token(from: URL(string: "lukifitti://invite/\(token)")!), token)
    }

    func testInviteLinkRejectsMalformedLinks() {
        let token = String(repeating: "a", count: 43)
        XCTAssertNil(InviteLink.token(from: URL(string: "https://app.example/invite/short")!))
        XCTAssertNil(InviteLink.token(from: URL(string: "https://app.example/other/\(token)")!))
        XCTAssertNil(InviteLink.token(from: URL(string: "https://app.example/invite/\(token)/x")!))
        XCTAssertNil(InviteLink.token(from: URL(string: "lukifitti://social/\(token)")!))
        XCTAssertNil(InviteLink.token(from: URL(string: "http://app.example/invite/\(token)")!))
    }
}
