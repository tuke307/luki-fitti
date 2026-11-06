import Foundation
import LukiFittiModels

/// "Add from history" picks from entries on this device (guests, or signed in but offline).
/// A port of `rankHistoryPicks` in `apps/api/src/modules/nutrition/nutrition.service.ts`.
public enum NutritionHistoryPicks {
    static let windowDays = 180.0
    static let maxEntries = 600
    static let halfLifeDays = 14.0
    static let entryLimit = 20
    static let itemLimit = 50
    private static let day: TimeInterval = 24 * 60 * 60

    private struct Bucket<T> {
        var pick: T
        var score: Double
        var times: Int
        var last: Date
        var added: Date
        /// First-seen position: equal ranks keep it, like the stable sort over a JS `Map`.
        var order: Int
    }

    private struct EntryPick {
        var label: String?
        var mealType: MealType
        var items: [MealItemDto]
    }

    static func normalize(_ name: String) -> String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .split(whereSeparator: \.isWhitespace)
            .joined(separator: " ")
    }

    /// Entries are grouped by food combination and foods by name. Each occurrence adds
    /// 0.5^(age / 14 days), so frequent and recent picks rank first; ties go to the most recently
    /// added. The returned foods are the latest logged version (newest amounts).
    public static func rank(_ entries: [MealEntryDto], query: String? = nil, now: Date = Date()) -> NutritionHistoryPicksDto {
        let since = now.addingTimeInterval(-windowDays * day)
        let recent = entries
            .compactMap { e -> (entry: MealEntryDto, eatenAt: Date, createdAt: Date)? in
                guard let eatenAt = e.eatenAtDate, eatenAt >= since else { return nil }
                return (e, eatenAt, LukiISODate.parse(e.createdAt) ?? eatenAt)
            }
            .sorted { $0.createdAt > $1.createdAt }
            .prefix(maxEntries)

        func weight(_ eatenAt: Date) -> Double {
            pow(0.5, max(0, now.timeIntervalSince(eatenAt)) / day / halfLifeDays)
        }
        func bump<T>(_ map: inout [String: Bucket<T>], _ key: String, eatenAt: Date, createdAt: Date, _ pick: () -> T) {
            let w = weight(eatenAt)
            guard var b = map[key] else {
                map[key] = Bucket(pick: pick(), score: w, times: 1, last: eatenAt, added: createdAt, order: map.count)
                return
            }
            b.score += w
            b.times += 1
            if eatenAt > b.last { b.last = eatenAt }
            if createdAt > b.added {
                b.added = createdAt
                b.pick = pick()
            }
            map[key] = b
        }

        var entryBuckets: [String: Bucket<EntryPick>] = [:]
        var itemBuckets: [String: Bucket<MealItemDto>] = [:]
        for (entry, eatenAt, createdAt) in recent {
            let named = entry.items.filter { !$0.name.trimmingCharacters(in: .whitespaces).isEmpty }
            for item in named { bump(&itemBuckets, normalize(item.name), eatenAt: eatenAt, createdAt: createdAt) { item } }
            guard named.count >= 2 else { continue }
            let key = named.map { normalize($0.name) }.sorted().joined(separator: "|")
            bump(&entryBuckets, key, eatenAt: eatenAt, createdAt: createdAt) {
                EntryPick(label: entry.label, mealType: entry.mealType, items: named)
            }
        }

        let needle = query.map(normalize) ?? ""
        func byRank<T>(_ a: (key: String, value: Bucket<T>), _ b: (key: String, value: Bucket<T>)) -> Bool {
            if a.value.score != b.value.score { return a.value.score > b.value.score }
            if a.value.added != b.value.added { return a.value.added > b.value.added }
            return a.value.order < b.value.order
        }
        let entryPicks = entryBuckets
            .filter { key, b in
                needle.isEmpty || key.contains(needle) || (b.pick.label.map { normalize($0).contains(needle) } ?? false)
            }
            .sorted(by: byRank)
            .prefix(entryLimit)
            .map { key, b in
                HistoryEntryPickDto(
                    key: key,
                    label: b.pick.label,
                    mealType: b.pick.mealType,
                    items: b.pick.items,
                    totals: NutritionMath.sum(b.pick.items),
                    timesLogged: b.times,
                    lastLoggedAt: LukiISODate.string(b.last)
                )
            }
        let itemPicks = itemBuckets
            .filter { key, _ in needle.isEmpty || key.contains(needle) }
            .sorted(by: byRank)
            .prefix(itemLimit)
            .map { HistoryItemPickDto(item: $0.value.pick, timesLogged: $0.value.times, lastLoggedAt: LukiISODate.string($0.value.last)) }
        return NutritionHistoryPicksDto(entries: Array(entryPicks), items: Array(itemPicks))
    }
}
