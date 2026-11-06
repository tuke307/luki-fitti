import Foundation
import LukiFittiModels

extension LukiI18n {
    /// Matches `enums.exerciseTypes` on the web.
    public static func exerciseTypeLabel(_ type: ExerciseType, locale tr: SupportedLocale = .en) -> String {
        switch type {
        case .STRENGTH: tr("Strength")
        case .STRETCHING: tr("Stretching & Mobility")
        case .CARDIO: tr("Cardio")
        }
    }

    /// Matches `enums.movementPatterns` on the web.
    public static func movementPatternLabel(_ pattern: MovementPattern, locale tr: SupportedLocale = .en) -> String {
        let english: String = switch pattern {
        case .HORIZONTAL_PULL: "Row (horizontal pull)"
        case .VERTICAL_PULL: "Pull-up / pulldown"
        case .SHOULDER_EXTENSION: "Pullover / straight-arm pulldown"
        case .HORIZONTAL_PUSH: "Flat press / push-up"
        case .INCLINE_PUSH: "Incline press"
        case .VERTICAL_PUSH: "Overhead press"
        case .DIP: "Dip"
        case .FLY: "Chest fly"
        case .LATERAL_RAISE: "Lateral raise"
        case .FRONT_RAISE: "Front raise"
        case .REAR_DELT: "Rear delt / reverse fly"
        case .UPRIGHT_ROW: "Upright row"
        case .SHRUG: "Shrug"
        case .SHOULDER_ROTATION: "Shoulder rotation"
        case .ELBOW_FLEXION: "Curl"
        case .ELBOW_EXTENSION: "Triceps extension"
        case .WRIST: "Wrist / grip"
        case .SQUAT: "Squat / leg press"
        case .HINGE: "Hinge / deadlift"
        case .LUNGE: "Lunge / split squat"
        case .KNEE_EXTENSION: "Leg extension"
        case .KNEE_FLEXION: "Leg curl"
        case .HIP_THRUST: "Hip thrust / bridge"
        case .HIP_EXTENSION: "Glute kickback"
        case .HIP_ABDUCTION: "Hip abduction"
        case .HIP_ADDUCTION: "Hip adduction"
        case .HIP_FLEXION: "Hip flexion"
        case .CALF_RAISE: "Calf raise"
        case .BACK_EXTENSION: "Back extension"
        case .CORE_FLEXION: "Crunch / leg raise"
        case .ANTI_EXTENSION: "Plank / rollout"
        case .LATERAL_FLEXION: "Side bend / side plank"
        case .ROTATION: "Rotation"
        case .CARRY: "Carry"
        case .OLYMPIC_LIFT: "Olympic lift"
        }
        return tr(english)
    }
}

/// "Watch on YouTube" / "Open MuscleWiki" targets, built exactly like the web `ExerciseVisual`.
public enum ExerciseExternalLinks {
    /// `encodeURIComponent`: everything but `A–Z a–z 0–9 - _ . ! ~ * ' ( )` is escaped.
    private static let uriComponentAllowed = CharacterSet(
        charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()"
    )

    static func encodeURIComponent(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: uriComponentAllowed) ?? value
    }

    /// The exercise's own video link (https only), else a YouTube search for its form tutorial.
    public static func youtube(name: String, exercise: ExerciseDto?) -> URL? {
        if let link = exercise?.media?.first(where: { $0.mediaType == "VIDEO_LINK" }),
           let url = URL(string: link.url), url.scheme?.lowercased() == "https" {
            return url
        }
        return URL(string: "https://www.youtube.com/results?search_query=\(encodeURIComponent("\(name) exercise form tutorial"))")
    }

    public static func muscleWiki(name: String) -> URL? {
        URL(string: "https://musclewiki.com/exercises?search=\(encodeURIComponent(name))")
    }
}
