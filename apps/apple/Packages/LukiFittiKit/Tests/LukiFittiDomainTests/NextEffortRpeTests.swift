import XCTest
@testable import LukiFittiDomain

/// The 3-bar effort control's tap cycle, shared by the iOS set row and the Watch effort button.
final class NextEffortRpeTests: XCTestCase {
    func testUnratedCyclesToEasy() {
        XCTAssertEqual(ProgressionEngine.nextEffortRpe(after: nil), 7.0)
    }

    func testEasyCyclesToJustRight() {
        XCTAssertEqual(ProgressionEngine.nextEffortRpe(after: 7.0), 8.0)
        XCTAssertEqual(ProgressionEngine.nextEffortRpe(after: 7.5), 8.0)
    }

    func testJustRightCyclesToMax() {
        XCTAssertEqual(ProgressionEngine.nextEffortRpe(after: 8.0), ProgressionEngine.maxEffortRpe)
        XCTAssertEqual(ProgressionEngine.nextEffortRpe(after: 9.0), ProgressionEngine.maxEffortRpe)
    }

    func testMaxCyclesBackToUnrated() {
        XCTAssertNil(ProgressionEngine.nextEffortRpe(after: ProgressionEngine.maxEffortRpe))
    }
}
