import Foundation
import simd

/// Swift port of the raid boss recipes in `packages/common/src/raid/raid-bosses.ts`.
/// The recipes themselves are decoded from `raid_bosses.json`, which the common
/// `raid:export`/`raid:check` flow keeps in sync — never edit the JSON by hand.
public struct RaidBossRecipe: Codable, Sendable {
    public enum Shape: String, Codable, Sendable {
        case sphere, capsule, box, roundedBox, cone, cylinder, torus
    }

    /// Palette slot a part is coloured from. `dark` is also the outline colour.
    public enum Slot: String, Codable, Sendable, CaseIterable {
        case primary, secondary, accent, eyeWhite, pupil, dark
    }

    public enum Role: String, Codable, Sendable {
        case body, limb, eye, pupil, horn, armor, crack, aura, detail
    }

    public struct Part: Codable, Sendable {
        public var id: String
        public var shape: Shape
        /// unit-less, body ≈ 1
        public var size: SIMD3<Double>
        public var position: SIMD3<Double>
        /// degrees
        public var rotation: SIMD3<Double>?
        public var slot: Slot
        public var role: Role
        /// hierarchy for limbs/eyes so parents drive them
        public var parent: String?
        /// cracks/extra armour appear per enrage phase
        public var minPhase: Int?
        /// render the slot colour with an emissive boost (glowing eyes/runes)
        public var emissive: Bool?

        enum CodingKeys: String, CodingKey {
            case id, shape, size, position, rotation, slot, role, parent, minPhase, emissive
        }
    }

    public struct Idle: Codable, Sendable {
        public var bob: Double
        public var sway: Double
        public var periodMs: Double
    }

    public struct Localized: Codable, Sendable, Equatable {
        public var en: String
        public var de: String
    }

    public var slug: String
    public var name: Localized
    public var lore: Localized
    /// Real `MuscleGroup` raw values plus the "CARDIO"/"STRETCHING" pseudo spots.
    public var weakTo: [String]
    /// Raw hex strings keyed by `Slot` raw value (enum-keyed dictionaries do not
    /// round-trip as JSON objects, so the keys stay strings).
    public var palette: [String: String]
    public var enragedPalette: [String: String]
    public var parts: [Part]
    public var idle: Idle

    public func paletteColor(_ slot: Slot) -> String {
        palette[slot.rawValue] ?? "#888888"
    }

    public func enragedPaletteColor(_ slot: Slot) -> String? {
        enragedPalette[slot.rawValue]
    }
}

/// Bounds of a recipe in scene units — mirrors `bossBounds` in
/// `packages/common/src/raid/raid-bosses.ts`.
public struct RaidBossBounds: Sendable, Equatable {
    public var center: SIMD3<Double>
    /// padded sphere radius — used for the wide defeated framing
    public var radius: Double
    public var min: SIMD3<Double>
    public var max: SIMD3<Double>
    /// projected half extents of the idle pose at `yaw` — the silhouette the
    /// camera actually sees. Use for tight framing; `radius` is the fallback.
    public var halfWidth: Double
    public var halfHeight: Double
}

public enum RaidBossMath {
    private static func partRadius(_ p: RaidBossRecipe.Part) -> Double {
        0.5 * (p.size.x * p.size.x + p.size.y * p.size.y + p.size.z * p.size.z).squareRoot()
    }

    public static func bossBounds(_ boss: RaidBossRecipe, yaw: Double = 0) -> RaidBossBounds {
        var minV = SIMD3<Double>(repeating: .infinity)
        var maxV = SIMD3<Double>(repeating: -.infinity)
        for part in boss.parts {
            let r = partRadius(part)
            minV = simd_min(minV, part.position - SIMD3(repeating: r))
            maxV = simd_max(maxV, part.position + SIMD3(repeating: r))
        }
        let center = (minV + maxV) / 2
        var radius = 0.0
        var halfWidth = 0.0
        var halfHeight = 0.0
        let cos = Foundation.cos(yaw)
        let sin = Foundation.sin(yaw)
        for part in boss.parts {
            let d = part.position - center
            let r = partRadius(part)
            radius = max(radius, simd_length(d) + r)
            // rotate the part centre about Y into camera space
            let px = d.x * cos + d.z * sin
            halfWidth = max(halfWidth, abs(px) + r)
            halfHeight = max(halfHeight, abs(d.y) + r)
        }
        // idle motion + hit squash (1.15 scale on the widest axis)
        radius += boss.idle.bob + boss.idle.sway * radius
        radius *= 1.15
        return RaidBossBounds(
            center: center,
            radius: radius,
            min: minV,
            max: maxV,
            halfWidth: halfWidth,
            halfHeight: halfHeight
        )
    }

    /// Enrage phase for a damage/HP pair: 1/2/3 crossed at 75/50/25 % HP left.
    /// Mirrors the server-side transition so clients can derive it when only the
    /// bar values are at hand.
    public static func raidPhaseFor(damage: Int, maxHp: Int) -> Int {
        raidPhaseFor(damage: Double(damage), maxHp: Double(maxHp))
    }

    /// Damage dealt by one session entry against a boss (weak spots count twice).
    public static func raidDamage(points: Int, pointsByWeakSpot: [String: Int], boss: RaidBossRecipe) -> Int {
        points + boss.weakTo.reduce(0) { $0 + (pointsByWeakSpot[$1] ?? 0) }
    }

    public static func raidPhaseFor(damage: Double, maxHp: Double) -> Int {
        let left = maxHp > 0 ? 1 - damage / maxHp : 1
        if left <= 0.25 { return 3 }
        if left <= 0.5 { return 2 }
        if left <= 0.75 { return 1 }
        return 0
    }

    // MARK: - Recipe geometry math (mirrors packages/common/src/raid/raid-bosses.ts)

    private static let deg = Double.pi / 180

    /// `rotation` degrees → matrix, XYZ intrinsic (three.js 'XYZ'): M = Rx·Ry·Rz.
    /// Applied to column vectors, as simd does.
    public static func rotationMatrix(_ rotation: SIMD3<Double>?) -> simd_double3x3 {
        let r = rotation ?? .zero
        let cx = Foundation.cos(r.x * deg), sx = Foundation.sin(r.x * deg)
        let cy = Foundation.cos(r.y * deg), sy = Foundation.sin(r.y * deg)
        let cz = Foundation.cos(r.z * deg), sz = Foundation.sin(r.z * deg)
        let rx = simd_double3x3(columns: (
            SIMD3(1, 0, 0), SIMD3(0, cx, sx), SIMD3(0, -sx, cx)))
        let ry = simd_double3x3(columns: (
            SIMD3(cy, 0, -sy), SIMD3(0, 1, 0), SIMD3(sy, 0, cy)))
        let rz = simd_double3x3(columns: (
            SIMD3(cz, sz, 0), SIMD3(-sz, cz, 0), SIMD3(0, 0, 1)))
        return rx * ry * rz
    }

    /// A part's local axis-aligned bounding box before rotation/translation.
    public static func partLocalBounds(_ part: RaidBossRecipe.Part) -> (min: SIMD3<Double>, max: SIMD3<Double>) {
        let w = part.size.x, h = part.size.y, d = part.size.z
        switch part.shape {
        case .torus:
            let r = (w + d) / 2
            return (SIMD3(-r, -r, -d / 2), SIMD3(r, r, d / 2))
        case .capsule:
            return (SIMD3(-w / 2, -h / 2, -w / 2), SIMD3(w / 2, h / 2, w / 2))
        default:
            return (SIMD3(-w / 2, -h / 2, -d / 2), SIMD3(w / 2, h / 2, d / 2))
        }
    }

    public struct LocalTransform: Sendable, Equatable {
        public var position: SIMD3<Double>
        /// rest rotation (XYZ intrinsic, M = Rx·Ry·Rz) — apply via a transform
        /// matrix, NOT `eulerAngles`: SceneKit's euler order composes Rz·Ry·Rx.
        public var rotation: simd_double3x3
    }

    /// Node-local transforms for a nested scene graph: a child part's
    /// transform is the parent's inverse rest transform composed with the
    /// child's rest transform. Attaching children this way reproduces the
    /// boss-space rest pose exactly while letting parents drive animation.
    /// Mirrors `bossLocalTransforms` in raid-bosses.ts.
    public static func localTransforms(_ boss: RaidBossRecipe) -> [String: LocalTransform] {
        let byId = Dictionary(uniqueKeysWithValues: boss.parts.map { ($0.id, $0) })
        var out: [String: LocalTransform] = [:]
        for part in boss.parts {
            let rot = rotationMatrix(part.rotation)
            guard let parentId = part.parent, let parent = byId[parentId] else {
                out[part.id] = LocalTransform(position: part.position, rotation: rot)
                continue
            }
            let rp = rotationMatrix(parent.rotation)
            let inv = rp.transpose
            let delta = part.position - parent.position
            out[part.id] = LocalTransform(
                position: inv * delta, rotation: inv * rot)
        }
        return out
    }
}

/// Loads the bundled boss roster. Returns an empty array if the resource is
/// missing (test hosts without the package bundle).
public enum RaidBossCatalog {
    public static let bosses: [RaidBossRecipe] = load()

    public static func boss(slug: String) -> RaidBossRecipe? {
        bosses.first { $0.slug == slug }
    }

    private static func load() -> [RaidBossRecipe] {
        guard let url = Bundle.module.url(forResource: "raid_bosses", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let bosses = try? JSONDecoder().decode([RaidBossRecipe].self, from: data)
        else {
            return []
        }
        return bosses
    }
}
