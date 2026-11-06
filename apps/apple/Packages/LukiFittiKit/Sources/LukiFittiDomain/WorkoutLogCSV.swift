import Foundation
import LukiFittiModels

/// "Workout Log (CSV)": one row per completed set, same columns and escaping as the web
/// `handleExportCsv` (`apps/web/components/gym/profile-import-view.tsx`).
public enum WorkoutLogCSV {
    public static let headers = [
        "Date", "Workout", "Folder", "SessionType", "DurationSeconds", "Exercise", "PrimaryMuscle",
        "SetNumber", "SetType", "Weight", "Unit", "Reps", "DurationSec", "RPE", "Notes",
    ]

    public static func fileName(now: Date = Date()) -> String {
        "luki-fitti-workouts-\(String(ISO8601DateFormatter().string(from: now).prefix(10))).csv"
    }

    public static func build(historySessions: [WorkoutSessionDto], folders: [WorkoutFolderDto]) -> String {
        var folderByTemplateId: [String: String] = [:]
        for folder in folders {
            for template in folder.templates { folderByTemplateId[template.id] = folder.name }
        }
        var rows = [headers.joined(separator: ",")]
        for session in historySessions {
            let folderName = session.templateId.flatMap { folderByTemplateId[$0] } ?? ""
            for exercise in session.exercises {
                for set in exercise.sets where set.completed {
                    rows.append([
                        escape(session.startedAt),
                        escape(session.workoutNameSnapshot),
                        escape(folderName),
                        escape(session.sessionType.rawValue),
                        escape(String(session.activeDurationSeconds)),
                        escape(exercise.exerciseNameSnapshot),
                        escape(exercise.primaryMuscleSnapshot.rawValue),
                        escape(String(set.setNumber)),
                        escape(set.setType.rawValue),
                        escape(set.weight.map(jsNumber)),
                        escape(set.weightUnit.rawValue),
                        escape(set.reps.map(String.init)),
                        escape(set.durationSeconds.map(String.init)),
                        escape(set.rpe.map(jsNumber)),
                        escape(set.notes ?? session.notes),
                    ].joined(separator: ","))
                }
            }
        }
        return rows.joined(separator: "\n")
    }

    /// Quotes cells with a comma, quote or newline; `nil` is an empty cell.
    static func escape(_ value: String?) -> String {
        guard let value else { return "" }
        guard value.contains(",") || value.contains("\"") || value.contains("\n") else { return value }
        return "\"\(value.replacingOccurrences(of: "\"", with: "\"\""))\""
    }

    /// `String(number)` in JavaScript: 85 → "85", 82.5 → "82.5".
    static func jsNumber(_ value: Double) -> String {
        value.rounded() == value && abs(value) < 1e15 ? String(Int64(value)) : String(value)
    }
}
