#if os(iOS)
import SceneKit
import SwiftUI
import UIKit
import LukiFittiModels

/// SceneKit port of `apps/web/components/gym/raid/boss-canvas.tsx`: the same
/// recipes, the same idle/hit/enrage/defeated/escaped states, toon banding,
/// inverted-hull outline, blob shadow, glow aura and −18° three-quarter pose.
public struct BossSceneView: UIViewRepresentable {
    public enum VisualState: String, Sendable {
        case idle
        case defeated
        case escaped
    }

    private let boss: RaidBossRecipe
    private let state: VisualState
    /// Enrage phase 0–3 — drives the palette lerp, cracks and aura.
    private let phase: Int
    /// Bump to trigger the hit squash + white flash.
    private let hitToken: Int
    private let reducedMotion: Bool
    private let interactive: Bool
    /// Pause rendering when the card scrolls off-screen or the app backgrounds.
    private let isVisible: Bool

    public init(
        boss: RaidBossRecipe,
        state: VisualState = .idle,
        phase: Int = 0,
        hitToken: Int = 0,
        reducedMotion: Bool = false,
        interactive: Bool = true,
        isVisible: Bool = true
    ) {
        self.boss = boss
        self.state = state
        self.phase = phase
        self.hitToken = hitToken
        self.reducedMotion = reducedMotion
        self.interactive = interactive
        self.isVisible = isVisible
    }

    public func makeCoordinator() -> Coordinator {
        Coordinator(boss: boss, interactive: interactive)
    }

    public func makeUIView(context: Context) -> SCNView {
        let view = SCNView()
        view.scene = context.coordinator.scene
        view.backgroundColor = .clear
        view.isOpaque = false
        view.antialiasingMode = .multisampling4X
        view.preferredFramesPerSecond = 60
        view.delegate = context.coordinator
        view.autoenablesDefaultLighting = false
        view.rendersContinuously = true
        if interactive {
            let pan = UIPanGestureRecognizer(
                target: context.coordinator, action: #selector(Coordinator.handlePan(_:)))
            view.addGestureRecognizer(pan)
        }
        context.coordinator.attach(view)
        return view
    }

    public func updateUIView(_ view: SCNView, context: Context) {
        let c = context.coordinator
        c.live.state = state
        c.live.phase = phase
        c.live.reduced = reducedMotion
        if hitToken != c.live.hitToken {
            c.live.hitToken = hitToken
            c.triggerHit()
        }
        let playing = isVisible && UIApplication.shared.applicationState != .background
        if view.isPlaying != playing { view.isPlaying = playing }
    }

    // MARK: - Coordinator

    @MainActor
    public final class Coordinator: NSObject, SCNSceneRendererDelegate {
        struct Live {
            var state: VisualState = .idle
            var phase = 0
            var reduced = false
            var hitToken = 0
        }

        let scene = SCNScene()
        let boss: RaidBossRecipe
        let interactive: Bool
        var live = Live()
        private weak var view: SCNView?

        // camera + framing
        private let camera = SCNCamera()
        private let cameraNode = SCNNode()
        private let bounds: RaidBossBounds
        private var camDist = 0.0
        private let fitDim: Double

        // parts
        private let group = SCNNode()
        private var built: [(part: RaidBossRecipe.Part, node: SCNNode, base: SCNVector3, velocity: SCNVector3, spin: SCNVector3)] = []
        private var pupils: [SCNNode] = []
        private var eyes: [SCNNode] = []
        private var brows: [(node: SCNNode, side: Double, baseRotZ: Double)] = []
        private var slotMaterials: [String: SCNMaterial] = [:]
        private var extraMaterials: [(mat: SCNMaterial, slot: String)] = []
        private var outlineMat = SCNMaterial()
        private var flashMat = SCNMaterial()
        private var shadowNode = SCNNode()
        private var shadowMat = SCNMaterial()
        private var auraNode = SCNNode()
        private var auraMat = SCNMaterial()
        private var auraSize = 0.0

        // animation clocks
        private var lastTime: TimeInterval?
        private var elapsed: TimeInterval = 0
        private var lastState: VisualState?
        private var lastPhase = -1
        private var hitStart: TimeInterval = -1
        private var flashStart: TimeInterval = -1
        private var explodeStart: TimeInterval = -1
        private var escapeStart: TimeInterval = -1
        private var blinkStart: TimeInterval = -1
        private var nextBlink: TimeInterval = 2
        private var explodeVelocities: [SCNVector3] = []
        private var explodeSpins: [SCNVector3] = []

        // drag rotation
        private var rotY = -0.32
        private var targetRotY = -0.32
        private var rotVel = 0.0
        private var dragging = false

        private static let baseYaw = -0.32
        private static let outlineScale: CGFloat = 1.045
        private static let blinkMs = 0.12
        private static let hitMs = 0.25
        private static let flashMs = 0.12
        private static let explodeMs = 1.2
        private static let escapeMs = 0.9

        init(boss: RaidBossRecipe, interactive: Bool) {
            self.boss = boss
            self.interactive = interactive
            let b = RaidBossMath.bossBounds(boss, yaw: Self.baseYaw)
            self.bounds = b
            // idle fit: larger projected silhouette dimension fills 80 % of the
            // smaller canvas side + bob/sway/squash allowance (mirrors the web).
            let swayPad = boss.idle.sway * max(b.halfWidth, b.halfHeight)
            self.fitDim =
                max(b.halfWidth + swayPad, b.halfHeight + swayPad + boss.idle.bob) * 2 * 1.15
            super.init()
            buildScene()
        }

        func attach(_ view: SCNView) {
            self.view = view
            applyAuraBlend(trait: view.traitCollection.userInterfaceStyle)
        }

        func triggerHit() {
            hitStart = elapsed
            flashStart = elapsed
        }

        @objc func handlePan(_ pan: UIPanGestureRecognizer) {
            guard let view else { return }
            let dx = pan.translation(in: view).x / max(1, view.bounds.width)
            switch pan.state {
            case .began: dragging = true
            case .changed: targetRotY = Self.baseYaw + Double(dx) * 2.2
            default: dragging = false
            }
        }

        // MARK: scene construction

        private func hex(_ string: String) -> UIColor {
            var s = string.trimmingCharacters(in: .init(charactersIn: "#"))
            if s.count == 6 { s += "FF" }
            var v: UInt64 = 0
            Scanner(string: s).scanHexInt64(&v)
            return UIColor(
                red: CGFloat((v >> 24) & 0xFF) / 255,
                green: CGFloat((v >> 16) & 0xFF) / 255,
                blue: CGFloat((v >> 8) & 0xFF) / 255,
                alpha: CGFloat(v & 0xFF) / 255)
        }

        private func geometry(for part: RaidBossRecipe.Part) -> SCNGeometry {
            let w = CGFloat(part.size.x), h = CGFloat(part.size.y), d = CGFloat(part.size.z)
            switch part.shape {
            case .sphere:
                let s = SCNSphere(radius: 0.5)
                s.segmentCount = 24
                return s.scaled(w, h, d)
            case .capsule:
                return SCNCapsule(capRadius: w / 2, height: h)
            case .roundedBox:
                return SCNBox(
                    width: w, height: h, length: d,
                    chamferRadius: min(w, h, d) * 0.18)
            case .cone:
                return SCNCone(topRadius: 0, bottomRadius: w / 2, height: h).scaled(1, 1, d / w)
            case .cylinder:
                return SCNCylinder(radius: w / 2, height: h).scaled(1, 1, d / w)
            case .torus:
                return SCNTorus(ringRadius: w / 2, pipeRadius: max(0.02, d / 2))
            case .box:
                return SCNBox(width: w, height: h, length: d, chamferRadius: 0)
            }
        }

        private func materialFor(_ slot: String, emissive: Bool) -> SCNMaterial {
            if !emissive, let mat = slotMaterials[slot] { return mat }
            let mat = SCNMaterial()
            mat.lightingModel = .lambert
            // 3-band toon quantisation of the shaded colour.
            mat.shaderModifiers = [
                .fragment: """
                    #pragma body
                    vec3 c = _output.color.rgb;
                    _output.color.rgb = mix(floor(c * 3.0 + 0.5) / 3.0, c, 0.2);
                    """
            ]
            let color = hex(boss.palette[slot] ?? "#888888")
            mat.diffuse.contents = color
            if emissive {
                mat.emission.contents = color
                mat.emission.intensity = 0.85
                extraMaterials.append((mat, slot))
            } else {
                slotMaterials[slot] = mat
            }
            return mat
        }

        private func radialTexture(
            size: Int = 128,
            peak: UInt8 = 255,
            exponent: Double = 2.4,
            rgb: (UInt8, UInt8, UInt8) = (255, 255, 255)
        ) -> UIImage {
            var data = [UInt8](repeating: 0, count: size * size * 4)
            for y in 0..<size {
                for x in 0..<size {
                    let dx = Double(x) / Double(size - 1) - 0.5
                    let dy = Double(y) / Double(size - 1) - 0.5
                    let r = (dx * dx + dy * dy).squareRoot() * 2
                    let a = pow(max(0, 1 - r), exponent)
                    let i = (y * size + x) * 4
                    data[i] = rgb.0; data[i + 1] = rgb.1; data[i + 2] = rgb.2
                    data[i + 3] = UInt8(min(255, Int(a * Double(peak))))
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

        private func buildScene() {
            let c = bounds.center
            camera.fieldOfView = 34
            camera.zFar = 30
            cameraNode.camera = camera
            scene.rootNode.addChildNode(cameraNode)
            camDist = targetDistance(aspect: 1)
            placeCamera()

            // key light upper-left + accent rim from behind + ambient fill
            let ambient = SCNNode()
            ambient.light = SCNLight()
            ambient.light!.type = .ambient
            ambient.light!.intensity = 700
            scene.rootNode.addChildNode(ambient)
            let key = SCNNode()
            key.light = SCNLight()
            key.light!.type = .directional
            key.light!.intensity = 1400
            key.position = SCNVector3(-2.5, 4.5, 3)
            key.look(at: SCNVector3(x: Float(c.x), y: Float(c.y), z: Float(c.z)))
            scene.rootNode.addChildNode(key)
            let rim = SCNNode()
            rim.light = SCNLight()
            rim.light!.type = .directional
            rim.light!.color = hex(boss.palette["accent"] ?? "#ffffff")
            rim.light!.intensity = 600
            rim.position = SCNVector3(2.5, 2.5, -3)
            rim.look(at: SCNVector3(x: Float(c.x), y: Float(c.y), z: Float(c.z)))
            scene.rootNode.addChildNode(rim)

            scene.rootNode.addChildNode(group)
            group.rotation = SCNVector4(0, 1, 0, Self.baseYaw)

            outlineMat.lightingModel = .constant
            outlineMat.diffuse.contents = hex(boss.palette["dark"] ?? "#222222")
            outlineMat.cullMode = .front
            flashMat.lightingModel = .constant
            flashMat.diffuse.contents = UIColor.white
            flashMat.transparency = 0
            flashMat.writesToDepthBuffer = false

            for part in boss.parts {
                let geo = geometry(for: part)
                let mat = materialFor(part.slot.rawValue, emissive: part.emissive ?? false)
                geo.materials = [mat]
                let node = SCNNode(geometry: geo)
                node.position = SCNVector3(x: Float(part.position.x), y: Float(part.position.y), z: Float(part.position.z))
                if let r = part.rotation {
                    node.eulerAngles = SCNVector3(
                        Float(r.x * .pi / 180), Float(r.y * .pi / 180), Float(r.z * .pi / 180))
                }
                // inverted-hull outline + white hit flash
                let outline = SCNNode(geometry: geo.copy() as! SCNGeometry)
                outline.geometry!.materials = [outlineMat]
                outline.scale = SCNVector3(x: Float(Self.outlineScale), y: Float(Self.outlineScale), z: Float(Self.outlineScale))
                node.addChildNode(outline)
                let flash = SCNNode(geometry: geo.copy() as! SCNGeometry)
                flash.geometry!.materials = [flashMat]
                flash.scale = SCNVector3(x: Float(Self.outlineScale + 0.01), y: Float(Self.outlineScale + 0.01), z: Float(Self.outlineScale + 0.01))
                node.addChildNode(flash)
                node.name = part.id
                group.addChildNode(node)
                built.append((part, node, node.position, SCNVector3(), SCNVector3()))
                if part.role == .pupil { pupils.append(node) }
                if part.role == .eye { eyes.append(node) }
                if part.id.hasPrefix("brow") {
                    let side = part.position.x == 0 ? 0.0 : (part.position.x > 0 ? 1.0 : -1.0)
                    brows.append((node, side, Double(node.eulerAngles.z)))
                }
            }

            // soft contact shadow blob ~130 % of the body width, hugging the floor
            let bodyWidth = boss.parts.filter { $0.role == .body }
                .map(\.size.x).max() ?? bounds.radius
            let shadowGeo = SCNPlane(width: bodyWidth * 1.3, height: bodyWidth * 1.3)
            shadowMat.diffuse.contents = radialTexture(peak: 66, exponent: 1.7)
            shadowMat.isDoubleSided = false
            shadowMat.writesToDepthBuffer = false
            shadowMat.lightingModel = .constant
            shadowGeo.materials = [shadowMat]
            shadowNode = SCNNode(geometry: shadowGeo)
            shadowNode.eulerAngles = SCNVector3(-Float.pi / 2, 0, 0)
            let floorY = boss.parts.map { $0.position.y - $0.size.y / 2 }.min() ?? 0
            shadowNode.position = SCNVector3(Float(c.x), Float(floorY + 0.01), Float(c.z))
            scene.rootNode.addChildNode(shadowNode)

            // enrage aura: billboarded soft glow sprite, blended per theme
            auraSize = bounds.radius * 2 * 1.15
            let auraGeo = SCNPlane(width: auraSize, height: auraSize)
            auraMat.diffuse.contents = radialTexture(
                peak: 255, exponent: 2.4, rgb: (255, 90, 42))
            auraMat.lightingModel = .constant
            auraMat.writesToDepthBuffer = false
            auraMat.transparency = 0
            auraGeo.materials = [auraMat]
            auraNode = SCNNode(geometry: auraGeo)
            auraNode.constraints = [SCNBillboardConstraint()]
            auraNode.position = SCNVector3(x: Float(c.x), y: Float(c.y), z: Float(c.z))
            scene.rootNode.addChildNode(auraNode)

            setPhaseVisibility(live.phase)
        }

        private func applyAuraBlend(trait: UIUserInterfaceStyle) {
            // additive on dark; a normal blend at low alpha on light cards
            auraMat.blendMode = trait == .dark ? .add : .alpha
        }

        private func setPhaseVisibility(_ phase: Int) {
            for (part, node, _, _, _) in built {
                node.isHidden = (part.minPhase ?? 0) > phase
            }
        }

        private func targetDistance(aspect: Double) -> Double {
            let tan = Foundation.tan((Double(camera.fieldOfView) / 2) * .pi / 180)
            if live.state == .defeated {
                return bounds.radius * 1.12 / (tan * min(1, aspect))
            }
            return fitDim / (2 * 0.8 * tan * min(1, aspect))
        }

        /// Applies a phase's palette, cracks and parked camera for an off-screen
        /// still render (widget snapshot) — no per-frame ticks run here.
        func prepareStill(phase: Int, aspect: Double) {
            live.phase = phase
            lastPhase = phase
            setPhaseVisibility(phase)
            let f = Double(phase) / 3
            if f > 0 {
                for (slot, mat) in slotMaterials {
                    mat.diffuse.contents = enragedColor(slot, f: f)
                }
                for (mat, slot) in extraMaterials {
                    mat.diffuse.contents = enragedColor(slot, f: f)
                }
            }
            if phase > 0 {
                auraMat.transparency = 0.35 + 0.125 * Double(phase - 1)
                auraNode.scale = SCNVector3(x: Float(1 + 0.05 * f), y: Float(1 + 0.05 * f), z: Float(1 + 0.05 * f))
            }
            if phase >= 2 {
                for p in pupils { p.scale = SCNVector3(x: 0.8, y: 0.8, z: 0.8) }
            }
            camDist = targetDistance(aspect: aspect)
            placeCamera()
        }

        private func placeCamera() {
            let c = bounds.center
            cameraNode.position = SCNVector3(
                Float(c.x), Float(c.y + camDist * 0.14), Float(c.z + camDist))
            cameraNode.look(at: SCNVector3(x: Float(c.x), y: Float(c.y), z: Float(c.z)))
        }

        private func enragedColor(_ slot: String, f: Double) -> UIColor {
            let base = hex(boss.palette[slot] ?? "#888888")
            guard let target = boss.enragedPalette[slot], f > 0 else { return base }
            var r1: CGFloat = 0, g1: CGFloat = 0, b1: CGFloat = 0, a1: CGFloat = 0
            var r2: CGFloat = 0, g2: CGFloat = 0, b2: CGFloat = 0, a2: CGFloat = 0
            base.getRed(&r1, green: &g1, blue: &b1, alpha: &a1)
            hex(target).getRed(&r2, green: &g2, blue: &b2, alpha: &a2)
            let t = CGFloat(f)
            return UIColor(
                red: r1 + (r2 - r1) * t, green: g1 + (g2 - g1) * t, blue: b1 + (b2 - b1) * t,
                alpha: 1)
        }

        // MARK: per-frame update (mirrors the web tick)

        /// SceneKit calls the render delegate on its display-link queue, not the main
        /// actor — hop before touching actor state.
        nonisolated public func renderer(_ renderer: SCNSceneRenderer, updateAtTime time: TimeInterval) {
            DispatchQueue.main.async { [weak self] in
                MainActor.assumeIsolated { self?.updateFrame(time: time) }
            }
        }

        private func updateFrame(time: TimeInterval) {
            let dt = min(0.05, lastTime.map { time - $0 } ?? 0.016)
            lastTime = time
            elapsed = time
            let state = live.state
            let phase = live.phase

            // state transitions
            if state != lastState {
                if state == .defeated && lastState != nil {
                    explodeStart = time
                    explodeVelocities = built.map { _ in
                        SCNVector3(
                            Float.random(in: -1.6...1.6), Float.random(in: 1.2...2.6),
                            Float.random(in: -0.8...0.8))
                    }
                    explodeSpins = built.map { _ in
                        SCNVector3(
                            Float.random(in: -4...4), Float.random(in: -4...4),
                            Float.random(in: -4...4))
                    }
                }
                if state == .escaped && lastState != nil { escapeStart = time }
                lastState = state
            }
            if phase != lastPhase {
                setPhaseVisibility(phase)
                lastPhase = phase
            }

            // camera ease + theme-aware aura
            let aspect = max(0.01, (view?.bounds.width ?? 1) / (view?.bounds.height ?? 1))
            let target = targetDistance(aspect: aspect)
            camDist += (target - camDist) * 0.12
            placeCamera()
            if let trait = view?.traitCollection.userInterfaceStyle {
                applyAuraBlend(trait: trait)
            }

            if live.reduced {
                rotY += (Self.baseYaw - rotY) * 0.12
                group.rotation = SCNVector4(0, 1, 0, Float(rotY))
                let targetOpacity: CGFloat = state == .idle ? 1 : 0.25
                for mat in slotMaterials.values {
                    mat.transparency += (targetOpacity - mat.transparency) * 0.1
                }
            } else {
                // idle bob + sway, faster when enraged
                let speed = 1 + Double(phase) * 0.35
                let bob = sin(time * speed * (2000 / boss.idle.periodMs) * .pi) * boss.idle.bob
                group.position.y = Float(bob)
                let shadowScale = max(0.85, 1 - max(0, bob) * 2)
                shadowNode.scale = SCNVector3(x: Float(shadowScale), y: Float(shadowScale), z: Float(shadowScale))
                shadowMat.transparency = max(0.6, 1 - max(0, bob) * 3)
                let period = (boss.idle.periodMs / 1000) * .pi * 2
                group.eulerAngles.z = Float(sin(time * speed * (period / .pi) * 0.5) * boss.idle.sway)

                // drag rotation with spring back to the three-quarter pose
                if !dragging { targetRotY += (Self.baseYaw - targetRotY) * 0.1 }
                let spring = (targetRotY - rotY) * 14
                rotVel = (rotVel + spring * dt) * pow(0.0015, dt)
                rotY += rotVel * dt
                group.rotation = SCNVector4(0, 1, 0, Float(rotY))

                // pupils shrink once enraged
                let pupilScale: Float = phase >= 2 ? 0.8 : 1
                for p in pupils { p.scale = SCNVector3(x: pupilScale, y: pupilScale, z: pupilScale) }

                // eyebrows angle down from phase 2
                let anger = phase >= 2 ? min(1, Double(phase - 1) / 2) : 0
                for b in brows {
                    b.node.eulerAngles.z =
                        Float(b.baseRotZ + (b.side == 0 ? -0.12 : b.side * -0.25) * anger)
                }

                // blink
                if blinkStart < 0 && time >= nextBlink { blinkStart = time }
                if blinkStart >= 0 {
                    let k = min(1, (time - blinkStart) / Self.blinkMs)
                    let s = k < 0.5 ? 1 - k * 1.8 : 0.1 + (k - 0.5) * 1.8
                    for e in eyes {
                        e.scale = SCNVector3(e.scale.x, Float(max(0.1, s)), e.scale.z)
                    }
                    if k >= 1 {
                        blinkStart = -1
                        nextBlink = time + 3 + Double.random(in: 0...2)
                        for e in eyes { e.scale = SCNVector3(e.scale.x, 1, e.scale.z) }
                    }
                }

                // hit squash + flash
                if hitStart >= 0 {
                    let k = (time - hitStart) / Self.hitMs
                    if k >= 1 {
                        group.scale = SCNVector3(1, 1, 1)
                        hitStart = -1
                    } else {
                        let s = sin(k * .pi)
                        group.scale = SCNVector3(Float(1 + s * 0.12), Float(1 - s * 0.18), Float(1 + s * 0.12))
                    }
                }
                if flashStart >= 0 {
                    let k = (time - flashStart) / Self.flashMs
                    flashMat.transparency = k >= 1 ? 0 : (1 - k) * 0.85
                    if k >= 1 { flashStart = -1 }
                }

                // enrage palette lerp + red-orange aura pulse
                let f = Double(phase) / 3
                for (slot, mat) in slotMaterials {
                    mat.diffuse.contents = enragedColor(slot, f: f)
                }
                for e in extraMaterials {
                    let c = enragedColor(e.slot, f: f)
                    e.mat.diffuse.contents = c
                    e.mat.emission.contents = c
                }
                if phase > 0 {
                    let peak = 0.35 + 0.125 * Double(phase - 1)
                    let themeScale = view?.traitCollection.userInterfaceStyle == .dark ? 1.0 : 0.5
                    auraMat.transparency = peak * themeScale * (1 + 0.15 * sin(time * 4))
                    let scale = auraSize * (1 + 0.05 * f + 0.03 * f * sin(time * 4))
                    auraNode.scale = SCNVector3(x: Float(scale / auraSize), y: Float(scale / auraSize), z: Float(scale / auraSize))
                } else {
                    auraMat.transparency = 0
                }
            }

            // defeated: parts fly out with gravity then fade
            if explodeStart >= 0 {
                let k = (time - explodeStart) / Self.explodeMs
                for i in built.indices {
                    built[i].velocity.y -= Float(4.5 * dt)
                    let pos = built[i].node.position
                    built[i].node.position = SCNVector3(
                        pos.x + built[i].velocity.x * Float(dt),
                        pos.y + built[i].velocity.y * Float(dt),
                        pos.z + built[i].velocity.z * Float(dt))
                    built[i].node.eulerAngles.x += built[i].spin.x * Float(dt)
                    built[i].node.eulerAngles.y += built[i].spin.y * Float(dt)
                    built[i].node.eulerAngles.z += built[i].spin.z * Float(dt)
                }
                let fade = max(0, 1 - max(0, k - 0.6) / 0.4)
                for mat in slotMaterials.values { mat.transparency = CGFloat(fade) }
                outlineMat.transparency = CGFloat(fade)
                shadowMat.transparency = CGFloat(fade)
                if k >= 1.4 { group.isHidden = true }
            }

            // escaped: shrink + rise + fade
            if escapeStart >= 0 {
                let k = min(1, (time - escapeStart) / Self.escapeMs)
                let e = 1 - pow(1 - k, 3)
                group.scale = SCNVector3(x: Float(max(0.001, 1 - e)), y: Float(max(0.001, 1 - e)), z: Float(max(0.001, 1 - e)))
                group.position.y = Float(e * 1.4)
                for mat in slotMaterials.values { mat.transparency = CGFloat(max(0, 1 - k)) }
            }
        }
    }
}

private extension SCNGeometry {
    /// Uniformly scaled copy for shapes expressed via a base radius of 0.5.
    func scaled(_ x: CGFloat, _ y: CGFloat, _ z: CGFloat) -> SCNGeometry {
        let node = SCNNode(geometry: self)
        node.scale = SCNVector3(Float(x), Float(y), Float(z))
        let sources = node.geometry!.sources(for: .vertex).map { src -> SCNGeometrySource in
            let count = src.vectorCount
            var data = src.data
            data.withUnsafeMutableBytes { ptr in
                let base = ptr.baseAddress!
                for i in 0..<count {
                    let offset = src.dataOffset + i * src.dataStride
                    let f = base.advanced(by: offset).assumingMemoryBound(to: Float.self)
                    f[0] *= Float(x); f[1] *= Float(y); f[2] *= Float(z)
                }
            }
            return SCNGeometrySource(
                data: data, semantic: src.semantic, vectorCount: src.vectorCount,
                usesFloatComponents: src.usesFloatComponents,
                componentsPerVector: src.componentsPerVector,
                bytesPerComponent: src.bytesPerComponent,
                dataOffset: src.dataOffset, dataStride: src.dataStride)
        }
        let elements = node.geometry!.elements
        return SCNGeometry(sources: sources, elements: elements)
    }
}


public extension BossSceneView {
    /// Renders a phase-accurate still of the boss for the home widget snapshot.
    @MainActor
    static func renderImage(
        boss: RaidBossRecipe,
        phase: Int = 0,
        size: CGSize = CGSize(width: 320, height: 320)
    ) -> UIImage? {
        let coordinator = Coordinator(boss: boss, interactive: false)
        let view = SCNView(frame: CGRect(origin: .zero, size: size))
        view.scene = coordinator.scene
        view.backgroundColor = .clear
        view.isOpaque = false
        coordinator.attach(view)
        coordinator.prepareStill(phase: phase, aspect: Double(size.width / size.height))
        return view.snapshot()
    }
}
#endif
