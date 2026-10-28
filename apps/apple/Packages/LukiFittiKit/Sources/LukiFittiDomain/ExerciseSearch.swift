import Foundation
import LukiFittiModels

/// Swift port of `packages/common/src/utils/exercise-search.util.ts` — keep both in sync; they are
/// checked against the same cases (`packages/common/src/utils/__fixtures__/exercise-search-cases.json`).
///
/// Forgiving, ranked exercise search: spacing/hyphens/plurals don't matter ("situp" finds
/// "Sit-Ups"), umlauts may be typed with or without `e`, German/English names, slang and
/// abbreviations are interchangeable, small typos are tolerated, and name matches rank before
/// tag/alias matches before muscle/equipment labels. Words shorter than 4 letters only match whole
/// words or word starts, so "rdl" never finds "hurdle".
public enum ExerciseSearchText {
    nonisolated(unsafe) private static let phrases: [(NSRegularExpression, String)] =
        ExerciseSearchData.bundled.phrases.compactMap { phrase in
            (try? NSRegularExpression(pattern: phrase.pattern)).map { ($0, phrase.replacement) }
        }
    private static let synonyms = ExerciseSearchData.bundled.synonyms
    static let equipmentTokens = Set(ExerciseSearchData.bundled.equipment.map(stem))

    /// Lower case, umlauts and accents folded, punctuation (except hyphens) as spaces.
    public static func fold(_ text: String) -> String {
        var s = text.lowercased().replacingOccurrences(of: "ß", with: "ss")
        for (pattern, replacement) in [("ä|ae", "a"), ("ö|oe", "o"), ("ü|ue", "u")] {
            s = s.replacingOccurrences(of: pattern, with: replacement, options: .regularExpression)
        }
        s = s.folding(options: .diacriticInsensitive, locale: Locale(identifier: "en_US_POSIX"))
        s = s.replacingOccurrences(of: "[^a-z0-9-]+", with: " ", options: .regularExpression)
        return s.trimmingCharacters(in: .whitespaces)
    }

    private static func applyPhrases(_ folded: String) -> String {
        var text = folded
        for (regex, replacement) in phrases {
            text = regex.stringByReplacingMatches(
                in: text,
                range: NSRange(text.startIndex..., in: text),
                withTemplate: replacement
            )
        }
        return text
    }

    /// Light EN/DE stemming: "curls" → "curl", "kniebeugen" → "kniebeug", "presses" → "press".
    public static func stem(_ token: String) -> String {
        for suffix in ["en", "es", "er", "e", "s", "n"] {
            guard token.count - suffix.count >= 4, token.hasSuffix(suffix) else { continue }
            if suffix == "s" && token.hasSuffix("ss") { continue }
            return String(token.dropLast(suffix.count))
        }
        return token
    }

    /// Each word with its synonyms, as alternatives (a synonym may need several tokens).
    public static func tokenAlternatives(_ text: String) -> [[[String]]] {
        applyPhrases(fold(text))
            .split(whereSeparator: { $0 == " " || $0 == "-" })
            .map { word in
                let w = String(word)
                var alternatives = [[stem(w)]]
                if let synonym = synonyms[w] { alternatives.append(synonym.map(stem)) }
                return alternatives
            }
    }

    static func compact(_ text: String) -> String {
        fold(text).replacingOccurrences(of: "[\\s-]+", with: "", options: .regularExpression)
    }
}

public struct ExerciseSearchResult: Sendable, Equatable {
    public var exercise: ExerciseDto
    public var score: Double
}

public struct ExerciseSearchIndex: Sendable {
    private struct Field: Sendable {
        var tokens: Set<String>
        var compact: [String]
        var weight: Double
    }

    private struct Entry: Sendable {
        var exercise: ExerciseDto
        var names: [String]
        var foldedNames: [String]
        var nameWords: [[[[String]]]]
        var fields: [Field]
        var boost: Double
    }

    private let entries: [Entry]

    /// - Parameters:
    ///   - names: extra names of an exercise, e.g. its name in every language.
    ///   - labels: muscle group / equipment labels in every language.
    ///   - boost: small ranking bonus (0–0.1), e.g. for everyday exercises.
    public init(
        exercises: [ExerciseDto],
        names: (ExerciseDto) -> [String] = { _ in [] },
        labels: (ExerciseDto) -> [String] = { _ in [] },
        boost: (ExerciseDto) -> Double = { _ in 0 }
    ) {
        func tokens(_ texts: [String]) -> Set<String> {
            Set(texts.flatMap { ExerciseSearchText.tokenAlternatives($0).flatMap { $0.flatMap { $0 } } })
        }
        entries = exercises.map { exercise in
            var allNames = [exercise.name]
            for name in names(exercise) where !allNames.contains(name) { allNames.append(name) }
            return Entry(
                exercise: exercise,
                names: allNames,
                foldedNames: allNames.map(ExerciseSearchText.fold),
                nameWords: allNames.map(ExerciseSearchText.tokenAlternatives),
                fields: [
                    Field(tokens: tokens(allNames), compact: allNames.map(ExerciseSearchText.compact), weight: 1),
                    Field(tokens: tokens(exercise.tags), compact: exercise.tags.map(ExerciseSearchText.compact), weight: 0.85),
                    Field(tokens: tokens(labels(exercise)), compact: [], weight: 0.6),
                ],
                boost: boost(exercise)
            )
        }
    }

    /// Exercises matching `query`, best first. An empty query returns no results.
    /// - Parameter matchAllWords: `false` also returns exercises matching most (by weight, at least
    ///   half) of the words — for "Did you mean …?" suggestions.
    public func search(
        _ query: String,
        limit: Int? = nil,
        minScore: Double = 0.55,
        matchAllWords: Bool = true
    ) -> [ExerciseSearchResult] {
        let alternatives = ExerciseSearchText.tokenAlternatives(query)
        guard !alternatives.isEmpty else { return [] }
        let queryCompact = ExerciseSearchText.compact(query)
        let queryFolded = ExerciseSearchText.fold(query)
        let queryTokens = alternatives.flatMap { $0.flatMap { $0 } }
        let results = entries.enumerated()
            .compactMap { offset, entry -> (offset: Int, entry: Entry, score: Double)? in
                let score = Self.score(entry, alternatives, queryTokens, queryCompact, queryFolded, matchAllWords)
                guard score > 0 else { return nil }
                let total = score + entry.boost
                return total >= minScore ? (offset, entry, total) : nil
            }
            // Same order as the (stable) TypeScript sort: score, shorter name, catalog position.
            .sorted { a, b in
                if a.score != b.score { return a.score > b.score }
                if a.entry.exercise.name.count != b.entry.exercise.name.count {
                    return a.entry.exercise.name.count < b.entry.exercise.name.count
                }
                return a.offset < b.offset
            }
            .map { ExerciseSearchResult(exercise: $0.entry.exercise, score: $0.score) }
        if let limit { return Array(results.prefix(limit)) }
        return results
    }

    private static func score(
        _ entry: Entry,
        _ query: [[[String]]],
        _ queryTokens: [String],
        _ queryCompact: String,
        _ queryFolded: String,
        _ matchAllWords: Bool
    ) -> Double {
        var total = 0.0
        var weights = 0.0
        var unmatched = 0.0
        for alternatives in query {
            // Equipment words count double: "Kurzhantel" is what tells two presses apart.
            let weight: Double = alternatives.contains { $0.contains { ExerciseSearchText.equipmentTokens.contains($0) } } ? 2 : 1
            var best = 0.0
            for field in entry.fields {
                for tokens in alternatives {
                    let s = tokens.map { tokenScore($0, field.tokens) }.min() ?? 0
                    best = max(best, s * field.weight)
                }
            }
            if best == 0 { unmatched += weight }
            total += best * weight
            weights += weight
        }
        let enoughWords = matchAllWords ? unmatched == 0 : unmatched <= weights / 2
        var score = enoughWords ? total / weights : 0
        if queryCompact.count >= 4 {
            for field in entry.fields where field.compact.contains(where: { $0.contains(queryCompact) }) {
                score = max(score, 0.85 * field.weight)
            }
        }
        if score == 0 { return 0 }
        if entry.foldedNames.contains(queryFolded) {
            score += 0.3
        } else if entry.foldedNames.contains(where: { $0.hasPrefix(queryFolded) }) {
            score += 0.05
        }
        func wordMatched(_ word: [[String]]) -> Bool {
            word.contains { tokens in
                tokens.contains { t in queryTokens.contains { q in t == q || (q.count >= 3 && t.hasPrefix(q)) } }
            }
        }
        let precision = entry.nameWords
            .map { words in words.isEmpty ? 0 : Double(words.filter(wordMatched).count) / Double(words.count) }
            .max() ?? 0
        return score + 0.2 * precision
    }

    /// How well one query token matches a set of indexed tokens (0–1).
    private static func tokenScore(_ query: String, _ tokens: Set<String>) -> Double {
        if tokens.contains(query) { return 1 }
        var best = 0.0
        let maxTypos = query.count >= 8 ? 2 : query.count >= 4 ? 1 : 0
        let q = Array(query.utf8)
        for token in tokens {
            if token.hasPrefix(query) {
                best = max(best, 0.9)
            } else if query.count >= 4 && token.contains(query) {
                best = max(best, 0.75)
            } else if maxTypos > 0 && best < 0.6 && editDistance(q, Array(token.utf8), max: maxTypos) <= maxTypos {
                best = 0.6
            }
            if best >= 0.9 { break }
        }
        return best
    }

    /// Optimal string alignment distance, stopping early once it exceeds `max`.
    private static func editDistance(_ a: [UInt8], _ b: [UInt8], max limit: Int) -> Int {
        if abs(a.count - b.count) > limit { return limit + 1 }
        if a.isEmpty || b.isEmpty { return Swift.max(a.count, b.count) }
        var prev2: [Int] = []
        var prev = Array(0...b.count)
        for i in 1...a.count {
            var row = [i]
            var best = i
            for j in 1...b.count {
                let cost = a[i - 1] == b[j - 1] ? 0 : 1
                var v = Swift.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost)
                if i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1] {
                    v = Swift.min(v, prev2[j - 2] + 1)
                }
                row.append(v)
                best = Swift.min(best, v)
            }
            if best > limit { return limit + 1 }
            prev2 = prev
            prev = row
        }
        return prev[b.count]
    }
}

extension ExerciseSearchIndex {
    /// Index over system and custom exercises with names in every language and everyday
    /// exercises ranked first; `labels` adds muscle group / equipment labels.
    public static func catalog(
        _ exercises: [ExerciseDto],
        labels: @escaping (ExerciseDto) -> [String] = { _ in [] }
    ) -> ExerciseSearchIndex {
        let data = ExerciseSearchData.bundled
        let core = Set(data.coreExerciseIds)
        return ExerciseSearchIndex(
            exercises: exercises,
            names: { $0.isSystem ? data.exerciseNames[$0.id] ?? [] : [] },
            labels: labels,
            boost: { core.contains($0.id) ? 0.1 : 0 }
        )
    }
}
