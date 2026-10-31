import Foundation

/// ISO-8601 parsing shared by every target. The API serializes dates with `toISOString()`
/// (milliseconds, e.g. `2026-10-31T16:00:00.000Z`) while devices write whole seconds, so both
/// shapes must parse.
public enum LukiDate {
    nonisolated(unsafe) private static let withFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    nonisolated(unsafe) private static let plain = ISO8601DateFormatter()

    private static let lock = NSLock()

    public static func parseISO(_ iso: String?) -> Date? {
        guard let iso, !iso.isEmpty else { return nil }
        lock.lock()
        defer { lock.unlock() }
        return withFraction.date(from: iso) ?? plain.date(from: iso)
    }
}
