'use client';

import React from 'react';
import { useReducedMotion } from 'framer-motion';
import type { BossPart, RaidBoss, Slot } from '@luki-fitti/common/raid';

export type BossVisualState = 'idle' | 'defeated' | 'escaped';

export interface BossHit {
  /** Incrementing id — a new value triggers the hit animation. */
  id: number;
  damage: number;
}

interface BossCanvasProps {
  boss: RaidBoss;
  state?: BossVisualState;
  /** Enrage phase 0–3 — drives the palette lerp, cracks and aura. */
  phase?: number;
  /** Latest hit to animate; new `id` re-triggers. */
  hit?: BossHit | null;
  /** Force reduced-motion rendering (defaults to the OS preference). */
  reducedMotion?: boolean;
  /** Allow drag-to-rotate (default true). */
  interactive?: boolean;
  /** Fallback/aria label — defaults to the boss's English name. */
  label?: string;
  /** HP fraction 0–1 for the 2D fallback card. */
  hpFraction?: number;
  className?: string;
}

type Three = typeof import('three');

interface BuiltPart {
  part: BossPart;
  mesh: import('three').Mesh;
  basePosition: import('three').Vector3;
  velocity: import('three').Vector3;
  spin: import('three').Vector3;
}

const OUTLINE_SCALE = 1.045;
const PUPIL_TRACK = 0.045;
const BLINK_MIN_MS = 3000;
const BLINK_SPAN_MS = 2000;
const BLINK_MS = 120;
const HIT_MS = 250;
const FLASH_MS = 120;
const EXPLODE_MS = 1200;
const ESCAPE_MS = 900;

function geometryFor(THREE: Three, part: BossPart): import('three').BufferGeometry {
  const [w, h, d] = part.size;
  switch (part.shape) {
    case 'sphere':
      return new THREE.SphereGeometry(0.5, 24, 18).scale(w, h, d);
    case 'capsule':
      return new THREE.CapsuleGeometry(w / 2, Math.max(0.01, h - w), 6, 18);
    case 'roundedBox': {
      const radius = Math.min(w, h, d) * 0.25;
      return RoundedBoxGeometry(THREE, w, h, d, 3, radius);
    }
    case 'cone':
      return new THREE.ConeGeometry(w / 2, h, 20).scale(1, 1, d / w);
    case 'cylinder':
      return new THREE.CylinderGeometry(w / 2, w / 2, h, 20).scale(1, 1, d / w);
    case 'torus':
      return new THREE.TorusGeometry(w / 2, Math.max(0.02, d / 2), 10, 28);
    case 'box':
    default:
      return new THREE.BoxGeometry(w, h, d);
  }
}

/** Minimal rounded-box: a box bevelled via a smoothed sphere blend is overkill;
 *  three ships RoundedBoxGeometry in examples, but to keep the lazy import to a
 *  single module we approximate with a subdivided box whose vertices are pulled
 *  toward the inscribed ellipsoid. */
function RoundedBoxGeometry(
  THREE: Three,
  w: number,
  h: number,
  d: number,
  _segments: number,
  radius: number,
): import('three').BufferGeometry {
  const geo = new THREE.BoxGeometry(w, h, d, 4, 4, 4);
  const pos = geo.attributes.position!;
  const half = new THREE.Vector3(w / 2 - radius, h / 2 - radius, d / 2 - radius);
  const v = new THREE.Vector3();
  const inner = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    inner.set(
      Math.sign(v.x) * Math.min(Math.abs(v.x), half.x),
      Math.sign(v.y) * Math.min(Math.abs(v.y), half.y),
      Math.sign(v.z) * Math.min(Math.abs(v.z), half.z),
    );
    const delta = v.clone().sub(inner);
    if (delta.lengthSq() > 0) {
      delta.setLength(Math.min(radius, delta.length()));
      pos.setXYZ(i, inner.x + delta.x, inner.y + delta.y, inner.z + delta.z);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

function toonGradient(THREE: Three): import('three').DataTexture {
  const data = new Uint8Array([90, 160, 255]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

/** 2D fallback for missing WebGL / low-power contexts. */
function BossFallback({
  boss,
  label,
  hpFraction,
  className,
}: {
  boss: RaidBoss;
  label: string;
  hpFraction?: number;
  className?: string;
}) {
  return (
    <div
      role="img"
      aria-label={label}
      className={`flex flex-col items-center justify-center rounded-2xl ${className ?? ''}`}
      style={{
        background: `radial-gradient(circle at 50% 35%, ${boss.palette.accent}33, transparent 70%), linear-gradient(160deg, ${boss.palette.primary}, ${boss.palette.dark})`,
      }}
    >
      <svg viewBox="0 0 40 40" width="40%" aria-hidden="true">
        <circle cx="20" cy="20" r="14" fill={boss.palette.secondary} />
        <circle cx="15.5" cy="18" r="3.4" fill={boss.palette.eyeWhite} />
        <circle cx="24.5" cy="18" r="3.4" fill={boss.palette.eyeWhite} />
        <circle cx="15.5" cy="18.6" r="1.7" fill={boss.palette.pupil} />
        <circle cx="24.5" cy="18.6" r="1.7" fill={boss.palette.pupil} />
        <path d="M14 26 q6 4 12 0" stroke={boss.palette.dark} strokeWidth="2" fill="none" />
      </svg>
      <span className="mt-1 text-xs font-bold text-white drop-shadow">{label}</span>
      {hpFraction !== undefined ? (
        <div className="mt-1 h-1.5 w-2/3 overflow-hidden rounded-full bg-black/40">
          <div
            className="h-full rounded-full bg-white/90"
            style={{ width: `${Math.round(hpFraction * 100)}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

export function BossCanvas({
  boss,
  state = 'idle',
  phase = 0,
  hit = null,
  reducedMotion,
  interactive = true,
  label,
  hpFraction,
  className,
}: BossCanvasProps) {
  const prefersReduced = useReducedMotion() ?? false;
  const reduced = reducedMotion ?? prefersReduced;
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [damageFloats, setDamageFloats] = React.useState<BossHit[]>([]);
  const engineRef = React.useRef<{ triggerHit: (damage: number) => void } | null>(null);
  const liveRef = React.useRef({ state, phase });
  React.useEffect(() => {
    liveRef.current = { state, phase };
  }, [state, phase]);

  // New hits queue a floating damage number (DOM overlay) + the mesh squash.
  const lastHitId = React.useRef(0);
  React.useEffect(() => {
    if (!hit || hit.id === lastHitId.current) return;
    lastHitId.current = hit.id;
    engineRef.current?.triggerHit(hit.damage);
    if (!reduced) {
      const add = setTimeout(() => setDamageFloats((list) => [...list, hit]), 0);
      const drop = setTimeout(
        () => setDamageFloats((list) => list.filter((f) => f.id !== hit.id)),
        1400,
      );
      return () => {
        clearTimeout(add);
        clearTimeout(drop);
      };
    }
  }, [hit, reduced]);

  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;

    const boot = async () => {
      let THREE: Three;
      try {
        THREE = await import('three');
      } catch {
        if (!disposed) setFailed(true);
        return;
      }
      if (disposed) return;

      let renderer: import('three').WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      } catch {
        setFailed(true);
        return;
      }
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 20);
      camera.position.set(0, 1.15, 3.4);
      camera.lookAt(0, 0.95, 0);

      scene.add(new THREE.AmbientLight(0xffffff, 1.1));
      const key = new THREE.DirectionalLight(0xffffff, 2.2);
      key.position.set(2.5, 4, 3);
      scene.add(key);
      const rim = new THREE.DirectionalLight(boss.palette.accent, 0.8);
      rim.position.set(-3, 2, -2);
      scene.add(rim);

      const gradient = toonGradient(THREE);
      const group = new THREE.Group();
      scene.add(group);

      const disposables: Array<{ dispose: () => void }> = [gradient];
      const slotMaterials = new Map<Slot, import('three').MeshToonMaterial>();
      const slotColor = (slot: Slot) => new THREE.Color(boss.palette[slot]);
      const materialFor = (slot: Slot) => {
        let mat = slotMaterials.get(slot);
        if (!mat) {
          mat = new THREE.MeshToonMaterial({ color: slotColor(slot), gradientMap: gradient });
          slotMaterials.set(slot, mat);
          disposables.push(mat);
        }
        return mat;
      };
      const outlineMat = new THREE.MeshBasicMaterial({
        color: boss.palette.dark,
        side: THREE.BackSide,
      });
      disposables.push(outlineMat);
      const flashMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      disposables.push(flashMat);

      const built: BuiltPart[] = [];
      const pupils: import('three').Mesh[] = [];
      const eyes: import('three').Mesh[] = [];
      const partMeshes = new Map<string, import('three').Mesh>();
      for (const part of boss.parts) {
        const geo = geometryFor(THREE, part);
        disposables.push(geo);
        const mesh = new THREE.Mesh(geo, materialFor(part.slot));
        mesh.position.set(...part.position);
        if (part.rotation) {
          mesh.rotation.set(
            (part.rotation[0] * Math.PI) / 180,
            (part.rotation[1] * Math.PI) / 180,
            (part.rotation[2] * Math.PI) / 180,
          );
        }
        mesh.userData.minPhase = part.minPhase ?? 0;
        mesh.userData.slot = part.slot;
        mesh.userData.role = part.role;
        // inverted-hull outline
        const outline = new THREE.Mesh(geo, outlineMat);
        outline.scale.setScalar(OUTLINE_SCALE);
        outline.raycast = () => undefined;
        mesh.add(outline);
        // white flash hull for hits
        const flash = new THREE.Mesh(geo, flashMat);
        flash.scale.setScalar(OUTLINE_SCALE + 0.01);
        flash.raycast = () => undefined;
        mesh.add(flash);
        group.add(mesh);
        partMeshes.set(part.id, mesh);
        built.push({
          part,
          mesh,
          basePosition: mesh.position.clone(),
          velocity: new THREE.Vector3(),
          spin: new THREE.Vector3(),
        });
        if (part.role === 'pupil') pupils.push(mesh);
        if (part.role === 'eye') eyes.push(mesh);
      }

      // contact shadow blob
      const shadowGeo = new THREE.CircleGeometry(0.85, 32);
      const shadowMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      });
      const shadow = new THREE.Mesh(shadowGeo, shadowMat);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = -0.02;
      scene.add(shadow);
      disposables.push(shadowGeo, shadowMat);

      // enrage aura
      const auraGeo = new THREE.SphereGeometry(1.5, 24, 18);
      const auraMat = new THREE.MeshBasicMaterial({
        color: boss.palette.accent,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const aura = new THREE.Mesh(auraGeo, auraMat);
      aura.position.y = 0.95;
      scene.add(aura);
      disposables.push(auraGeo, auraMat);

      host.appendChild(renderer.domElement);
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.touchAction = 'none';
      if (interactive) renderer.domElement.style.cursor = 'grab';

      const resize = () => {
        const w = host.clientWidth || 1;
        const h = host.clientHeight || 1;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(host);

      // visibility: pause off-screen and when the tab hides
      let visible = true;
      let pageVisible = !document.hidden;
      const io = new IntersectionObserver((entries) => {
        visible = entries[0]?.isIntersecting ?? true;
      });
      io.observe(host);
      const onVis = () => {
        pageVisible = !document.hidden;
      };
      document.addEventListener('visibilitychange', onVis);

      // pointer tracking (pupils) + drag-to-rotate with spring back
      const pointer = new THREE.Vector2(0, 0);
      let dragging = false;
      let lastX = 0;
      let targetRotY = reduced ? -0.4 : 0;
      let rotY = targetRotY;
      let rotVel = 0;
      const onPointerMove = (e: PointerEvent) => {
        const rect = host.getBoundingClientRect();
        pointer.set(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -(((e.clientY - rect.top) / rect.height) * 2 - 1),
        );
        if (dragging) {
          targetRotY += (e.clientX - lastX) * 0.01;
          lastX = e.clientX;
        }
      };
      const onPointerDown = (e: PointerEvent) => {
        if (!interactive || reduced) return;
        dragging = true;
        lastX = e.clientX;
        renderer.domElement.setPointerCapture(e.pointerId);
        renderer.domElement.style.cursor = 'grabbing';
      };
      const endDrag = () => {
        dragging = false;
        if (interactive) renderer.domElement.style.cursor = 'grab';
      };
      renderer.domElement.addEventListener('pointermove', onPointerMove);
      renderer.domElement.addEventListener('pointerdown', onPointerDown);
      renderer.domElement.addEventListener('pointerup', endDrag);
      renderer.domElement.addEventListener('pointercancel', endDrag);

      // animation state
      let hitStart = -1;
      let flashStart = -1;
      let nextBlink = performance.now() + BLINK_MIN_MS + Math.random() * BLINK_SPAN_MS;
      let blinkStart = -1;
      let explodeStart = -1;
      let escapeStart = -1;
      let lastPhase = -1;
      let lastState: BossVisualState | null = null;
      engineRef.current = {
        triggerHit: () => {
          hitStart = performance.now();
          flashStart = hitStart;
        },
      };

      const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
      const clock = new THREE.Clock();
      let raf = 0;

      const setPhaseVisibility = (p: number) => {
        for (const b of built) {
          const min = (b.mesh.userData.minPhase as number) ?? 0;
          b.mesh.visible = min <= p;
        }
      };
      setPhaseVisibility(phase);

      const tick = () => {
        raf = requestAnimationFrame(tick);
        if (!visible || !pageVisible) return;
        const now = performance.now();
        const dt = Math.min(0.05, clock.getDelta() || 0.016);
        const t = clock.elapsedTime;
        const { state, phase } = liveRef.current;

        // state transitions
        if (state !== lastState) {
          if (state === 'defeated' && lastState !== null) {
            explodeStart = now;
            for (const b of built) {
              b.velocity.set(rand(-1.6, 1.6), rand(1.2, 2.6), rand(-0.8, 0.8));
              b.spin.set(rand(-4, 4), rand(-4, 4), rand(-4, 4));
            }
          }
          if (state === 'escaped' && lastState !== null) escapeStart = now;
          lastState = state;
        }
        if (phase !== lastPhase) {
          setPhaseVisibility(phase);
          lastPhase = phase;
        }

        if (reduced) {
          // static three-quarter pose, state changes via opacity cross-fade
          rotY += (-0.4 - rotY) * 0.12;
          group.rotation.y = rotY;
          const targetOpacity = state === 'idle' ? 1 : 0.25;
          for (const mat of slotMaterials.values()) {
            mat.transparent = true;
            mat.opacity += (targetOpacity - mat.opacity) * 0.1;
          }
        } else {
          // idle bob + sway, faster when enraged
          const speed = 1 + phase * 0.35;
          const period = (boss.idle.periodMs / 1000) * Math.PI * 2;
          group.position.y =
            Math.sin(t * speed * (2000 / boss.idle.periodMs) * Math.PI) * boss.idle.bob;
          group.rotation.z = Math.sin(t * speed * (period / Math.PI) * 0.5) * boss.idle.sway;

          // drag rotation with spring back
          if (!dragging) targetRotY *= 0.9;
          const spring = (targetRotY - rotY) * 14;
          rotVel = (rotVel + spring * dt) * Math.pow(0.0015, dt);
          rotY += rotVel * dt;
          group.rotation.y = rotY;

          // pupils track the pointer
          for (const p of pupils) {
            if (p.userData.baseX === undefined) {
              p.userData.baseX = p.position.x;
              p.userData.baseY = p.position.y;
            }
            p.position.x = p.userData.baseX + pointer.x * PUPIL_TRACK;
            p.position.y = p.userData.baseY + pointer.y * PUPIL_TRACK;
          }

          // blink
          if (blinkStart < 0 && now >= nextBlink) blinkStart = now;
          if (blinkStart >= 0) {
            const k = Math.min(1, (now - blinkStart) / BLINK_MS);
            const s = k < 0.5 ? 1 - k * 1.8 : 0.1 + (k - 0.5) * 1.8;
            for (const e of eyes) e.scale.y = Math.max(0.1, s);
            if (k >= 1) {
              blinkStart = -1;
              nextBlink = now + BLINK_MIN_MS + Math.random() * BLINK_SPAN_MS;
              for (const e of eyes) e.scale.y = 1;
            }
          }

          // hit squash + flash
          if (hitStart >= 0) {
            const k = (now - hitStart) / HIT_MS;
            if (k >= 1) {
              group.scale.set(1, 1, 1);
              hitStart = -1;
            } else {
              const s = Math.sin(k * Math.PI);
              group.scale.set(1 + s * 0.12, 1 - s * 0.18, 1 + s * 0.12);
            }
          }
          if (flashStart >= 0) {
            const k = (now - flashStart) / FLASH_MS;
            flashMat.opacity = k >= 1 ? 0 : (1 - k) * 0.85;
            if (k >= 1) flashStart = -1;
          }

          // enrage palette lerp + aura pulse
          const f = phase / 3;
          for (const [slot, mat] of slotMaterials) {
            const base = slotColor(slot);
            const enraged = boss.enragedPalette[slot]
              ? new THREE.Color(boss.enragedPalette[slot]!)
              : base;
            mat.color.copy(base.lerp(enraged, f));
          }
          auraMat.opacity = phase > 0 ? 0.1 + 0.05 * f + Math.sin(t * 4) * 0.03 * f : 0;
          aura.scale.setScalar(1 + 0.08 * f + Math.sin(t * 4) * 0.03 * f);
        }

        // defeated: parts fly out with gravity then fade
        if (explodeStart >= 0) {
          const k = (now - explodeStart) / EXPLODE_MS;
          for (const b of built) {
            b.velocity.y -= 4.5 * dt;
            b.mesh.position.addScaledVector(b.velocity, dt);
            b.mesh.rotation.x += b.spin.x * dt;
            b.mesh.rotation.y += b.spin.y * dt;
            b.mesh.rotation.z += b.spin.z * dt;
          }
          const fade = Math.max(0, 1 - Math.max(0, k - 0.6) / 0.4);
          for (const mat of slotMaterials.values()) {
            mat.transparent = true;
            mat.opacity = fade;
          }
          outlineMat.transparent = true;
          outlineMat.opacity = fade;
          shadowMat.opacity = 0.18 * fade;
          if (k >= 1.4) group.visible = false;
        }

        // escaped: shrink + rise + fade
        if (escapeStart >= 0) {
          const k = Math.min(1, (now - escapeStart) / ESCAPE_MS);
          const e = 1 - Math.pow(1 - k, 3);
          group.scale.setScalar(Math.max(0.001, 1 - e));
          group.position.y = e * 1.4;
          for (const mat of slotMaterials.values()) {
            mat.transparent = true;
            mat.opacity = 1 - e;
          }
          outlineMat.transparent = true;
          outlineMat.opacity = 1 - e;
          shadowMat.opacity = 0.18 * (1 - e);
        }

        renderer.render(scene, camera);
      };
      raf = requestAnimationFrame(tick);

      cleanup = () => {
        cancelAnimationFrame(raf);
        document.removeEventListener('visibilitychange', onVis);
        io.disconnect();
        ro.disconnect();
        renderer.domElement.removeEventListener('pointermove', onPointerMove);
        renderer.domElement.removeEventListener('pointerdown', onPointerDown);
        renderer.domElement.removeEventListener('pointerup', endDrag);
        renderer.domElement.removeEventListener('pointercancel', endDrag);
        for (const d of disposables) d.dispose();
        renderer.dispose();
        renderer.domElement.remove();
        engineRef.current = null;
      };
    };

    void boot();
    return () => {
      disposed = true;
      cleanup?.();
    };
    // The scene is built once per boss; state/phase/hit are read live inside tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boss.slug, interactive]);

  const accessibleLabel = label ?? boss.name.en;

  if (failed) {
    return (
      <BossFallback
        boss={boss}
        label={accessibleLabel}
        hpFraction={hpFraction}
        className={className}
      />
    );
  }

  return (
    <div
      ref={hostRef}
      className={`relative overflow-hidden ${className ?? ''}`}
      role="img"
      aria-label={accessibleLabel}
    >
      {damageFloats.map((f) => (
        <span
          key={f.id}
          className="boss-damage-float pointer-events-none absolute left-1/2 top-1/3 z-10 -translate-x-1/2 text-lg font-black text-red-500 drop-shadow"
        >
          -{f.damage.toLocaleString()}
        </span>
      ))}
      <style>{`
        .boss-damage-float {
          animation: boss-damage-float 1.3s ease-out forwards;
        }
        @keyframes boss-damage-float {
          0% {
            transform: translate(-50%, 0) scale(0.6);
            opacity: 0;
          }
          15% {
            opacity: 1;
            transform: translate(-50%, -12px) scale(1.15);
          }
          100% {
            transform: translate(-50%, -52px) scale(1);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
