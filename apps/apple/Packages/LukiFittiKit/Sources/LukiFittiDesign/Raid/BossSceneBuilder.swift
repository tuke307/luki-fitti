#if canImport(SceneKit)
import SceneKit
import LukiFittiModels
#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

/**
 * Builds the SceneKit node graph for a boss recipe, mirroring
 * `apps/web/lib/raid/boss-geometry.ts` (the canonical shape/axis/rotation
 * convention is documented on `BossPart` in raid-bosses.ts).
 *
 * Per part: a `holder` node carries the part transform (nested under its
 * `parent` via the inverse-rest compensation from
 * `RaidBossMath.localTransforms`); a `shape` child carries the geometry plus
 * any baked scale/orientation fixes. SceneKit primitives share vertex buffers
 * between identical-parameter instances, so scale is never baked into vertex
 * data — it lives on `shape.scale`, which also keeps normals correct.
 */
public enum BossSceneBuilder {
    public struct Built {
        /// unrotated group holding every part (add to the yawed boss group)
        public var group: SCNNode
        /// part id → holder node (position/rotation, animations attach here)
        public var nodes: [String: SCNNode]
        /// part id → shape child (carries geometry + baked shape transform)
        public var shapes: [String: SCNNode]
    }

    /// Geometry for a part, parametric where SceneKit allows it.
    public static func geometry(for part: RaidBossRecipe.Part) -> SCNGeometry {
        let w = CGFloat(part.size.x), h = CGFloat(part.size.y), d = CGFloat(part.size.z)
        switch part.shape {
        case .sphere:
            let s = SCNSphere(radius: 0.5)
            s.segmentCount = 24
            return s
        case .capsule:
            return SCNCapsule(capRadius: w / 2, height: h)
        case .roundedBox:
            return SCNBox(width: w, height: h, length: d, chamferRadius: min(w, h, d) * 0.18)
        case .cone:
            return SCNCone(topRadius: 0, bottomRadius: w / 2, height: h)
        case .cylinder:
            return SCNCylinder(radius: w / 2, height: h)
        case .torus:
            return SCNTorus(ringRadius: w / 2, pipeRadius: max(0.02, d / 2))
        case .box:
            return SCNBox(width: w, height: h, length: d, chamferRadius: 0)
        }
    }

    /// Baked transform on the shape child (NOT on vertex data):
    /// ellipsoid/elliptical-base scaling and the torus plane fix — SCNTorus lies
    /// in the XZ plane, three's TorusGeometry in XY, so rotate +90° about X.
    private static func shapeTransform(_ shape: SCNNode, for part: RaidBossRecipe.Part) {
        let w = CGFloat(part.size.x), d = CGFloat(part.size.z)
        switch part.shape {
        case .sphere:
            shape.scale = SCNVector3(Float(part.size.x), Float(part.size.y), Float(part.size.z))
        case .cone, .cylinder:
            shape.scale = SCNVector3(1, 1, Float(d / w))
        case .torus:
            shape.eulerAngles = SCNVector3(Float.pi / 2, 0, 0)
        default:
            break
        }
    }

    /**
     * Builds the part tree. `materialFor` supplies the diffuse material per
     * slot; `outline`/`flash` are cloned per part on the shape child (the
     * inverted hull is scaled about the part's own centre by the shape's
     * transform, matching the web).
     */
    public static func build(
        boss: RaidBossRecipe,
        materialFor: (RaidBossRecipe.Part) -> SCNMaterial,
        outlineMat: SCNMaterial,
        flashMat: SCNMaterial,
        outlineScale: CGFloat = 1.04
    ) -> Built {
        let locals = RaidBossMath.localTransforms(boss)
        let group = SCNNode()
        var nodes: [String: SCNNode] = [:]
        var shapes: [String: SCNNode] = [:]

        for part in boss.parts {
            let geo = geometry(for: part)
            geo.materials = [materialFor(part)]
            let shape = SCNNode(geometry: geo)
            shapeTransform(shape, for: part)
            shapes[part.id] = shape

            // inverted-hull outline: front-face culled, depth-tested, dark
            let outline = SCNNode(geometry: geo.copy() as! SCNGeometry)
            outline.geometry!.materials = [outlineMat]
            outline.scale = SCNVector3(
                x: SCNFloat(outlineScale), y: SCNFloat(outlineScale), z: SCNFloat(outlineScale))
            outline.renderingOrder = -1
            shape.addChildNode(outline)
            // white hit flash hull
            let flash = SCNNode(geometry: geo.copy() as! SCNGeometry)
            flash.geometry!.materials = [flashMat]
            flash.scale = SCNVector3(
                x: SCNFloat(outlineScale + 0.01),
                y: SCNFloat(outlineScale + 0.01),
                z: SCNFloat(outlineScale + 0.01))
            flash.renderingOrder = 2
            shape.addChildNode(flash)

            let holder = SCNNode()
            holder.name = part.id
            if let local = locals[part.id] {
                // matrix, not eulerAngles — SceneKit composes eulers Rz·Ry·Rx,
                // the convention is Rx·Ry·Rz (three.js 'XYZ')
                let r = local.rotation
                let m = simd_float4x4(
                    simd_float4(simd_float3(r[0]), 0),
                    simd_float4(simd_float3(r[1]), 0),
                    simd_float4(simd_float3(r[2]), 0),
                    simd_float4(simd_float3(local.position), 1))
                holder.simdTransform = m
            }
            holder.addChildNode(shape)
            nodes[part.id] = holder
        }
        for part in boss.parts {
            let holder = nodes[part.id]!
            if let parentId = part.parent, let parent = nodes[parentId] {
                parent.addChildNode(holder)
            } else {
                group.addChildNode(holder)
            }
        }
        return Built(group: group, nodes: nodes, shapes: shapes)
    }

    /// World-space AABB of a part's shape node — used by the geometry parity
    /// tests against `raid_boss_vectors.json`. Add `Built.group` straight to a
    /// scene root (no yaw) so world space is boss space.
    public static func worldBounds(of holder: SCNNode) -> (min: SIMD3<Double>, max: SIMD3<Double>) {
        var minV = SIMD3<Double>(repeating: .infinity)
        var maxV = SIMD3<Double>(repeating: -.infinity)
        for child in holder.childNodes where child.geometry != nil {
            let bb = child.geometry!.boundingBox
            let m = child.simdWorldTransform
            for i in 0..<8 {
                let c = simd_float3(
                    Float((i & 1) == 0 ? bb.min.x : bb.max.x),
                    Float((i & 2) == 0 ? bb.min.y : bb.max.y),
                    Float((i & 4) == 0 ? bb.min.z : bb.max.z))
                let w4 = m * simd_float4(c, 1)
                let w = SIMD3<Double>(Double(w4.x), Double(w4.y), Double(w4.z))
                minV = simd_min(minV, w)
                maxV = simd_max(maxV, w)
            }
        }
        return (minV, maxV)
    }
}

#if canImport(UIKit)
public typealias BossColor = UIColor
#elseif canImport(AppKit)
public typealias BossColor = NSColor
#endif

public extension BossSceneBuilder {
    /// Palette hex → colour (RRGGBB / RRGGBBAA).
    static func hex(_ string: String) -> BossColor {
        var s = string.trimmingCharacters(in: .init(charactersIn: "#"))
        if s.count == 6 { s += "FF" }
        var v: UInt64 = 0
        Scanner(string: s).scanHexInt64(&v)
        return BossColor(
            red: CGFloat((v >> 24) & 0xFF) / 255,
            green: CGFloat((v >> 16) & 0xFF) / 255,
            blue: CGFloat((v >> 8) & 0xFF) / 255,
            alpha: CGFloat(v & 0xFF) / 255)
    }

    /// Enrage palette lerp at fraction `f` (0–1): the slot's base colour unless
    /// the boss defines an enraged override — mirrors the web `enragedColor`.
    static func enragedColor(boss: RaidBossRecipe, slot: String, f: Double) -> BossColor {
        let base = hex(boss.palette[slot] ?? "#888888")
        guard let target = boss.enragedPalette[slot], f > 0 else { return base }
        var r1: CGFloat = 0, g1: CGFloat = 0, b1: CGFloat = 0, a1: CGFloat = 0
        var r2: CGFloat = 0, g2: CGFloat = 0, b2: CGFloat = 0, a2: CGFloat = 0
        base.getRed(&r1, green: &g1, blue: &b1, alpha: &a1)
        hex(target).getRed(&r2, green: &g2, blue: &b2, alpha: &a2)
        let t = CGFloat(f)
        return BossColor(
            red: r1 + (r2 - r1) * t, green: g1 + (g2 - g1) * t, blue: b1 + (b2 - b1) * t,
            alpha: 1)
    }

#if canImport(UIKit)
    /// Soft radial glow texture, warm enraged colour — same (1-r)^2.4 alpha
    /// falloff as the web aura sprite, so the glow hugs the silhouette instead
    /// of reading as a hard-edged disc.
    static func auraTexture(
        size: Int = 256,
        rgb: (UInt8, UInt8, UInt8) = (255, 90, 42)
    ) -> UIImage {
        var data = [UInt8](repeating: 0, count: size * size * 4)
        for y in 0..<size {
            for x in 0..<size {
                let dx = Double(x) / Double(size - 1) - 0.5
                let dy = Double(y) / Double(size - 1) - 0.5
                let r = (dx * dx + dy * dy).squareRoot() * 2
                let a = pow(max(0, 1 - r), 2.4)
                let i = (y * size + x) * 4
                // premultiplied — RGB scaled by alpha so .add and .alpha both
                // read the falloff correctly
                data[i] = UInt8(min(255, Int(a * Double(rgb.0))))
                data[i + 1] = UInt8(min(255, Int(a * Double(rgb.1))))
                data[i + 2] = UInt8(min(255, Int(a * Double(rgb.2))))
                data[i + 3] = UInt8(min(255, Int(a * 255)))
            }
        }
        let provider = CGDataProvider(data: Data(data) as CFData)!
        let image = CGImage(
            width: size, height: size, bitsPerComponent: 8, bitsPerPixel: 32,
            bytesPerRow: size * 4, space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
            provider: provider, decode: nil, shouldInterpolate: true,
            intent: .defaultIntent)!
        return UIImage(cgImage: image)
    }
#endif
}
#endif
