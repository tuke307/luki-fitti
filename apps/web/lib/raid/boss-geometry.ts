import type { BossPart, RaidBoss, Slot } from '@luki-fitti/common/raid';
import { bossLocalTransforms } from '@luki-fitti/common/raid';

/** injected so callers (component + specs) control how three is loaded */
export type Three = typeof import('three');
export type RoundedBoxCtor =
  typeof import('three/examples/jsm/geometries/RoundedBoxGeometry.js').RoundedBoxGeometry;

export interface BuiltPart {
  part: BossPart;
  mesh: import('three').Mesh;
  basePosition: import('three').Vector3;
  velocity: import('three').Vector3;
  spin: import('three').Vector3;
}

export interface BuiltBoss {
  group: import('three').Group;
  built: BuiltPart[];
  pupils: import('three').Mesh[];
  eyes: import('three').Mesh[];
  brows: Array<{ mesh: import('three').Mesh; side: number; baseRotZ: number }>;
  partMeshes: Map<string, import('three').Mesh>;
}

/**
 * Canonical shape mapping — see the convention table on `BossPart` in
 * `packages/common/src/raid/raid-bosses.ts`.
 */
export function geometryFor(
  THREE: Three,
  RoundedBox: RoundedBoxCtor | null,
  part: BossPart,
): import('three').BufferGeometry {
  const [w, h, d] = part.size;
  switch (part.shape) {
    case 'sphere':
      return new THREE.SphereGeometry(0.5, 24, 18).scale(w, h, d);
    case 'capsule':
      return new THREE.CapsuleGeometry(w / 2, Math.max(0.01, h - w), 6, 18);
    case 'roundedBox': {
      const radius = Math.min(w, h, d) * 0.18;
      if (RoundedBox) return new RoundedBox(w, h, d, 4, radius);
      return roundedBoxGeometry(THREE, w, h, d, radius);
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

/** Fallback rounded-box for when the examples addon fails to load: a subdivided
 *  box whose vertices are pulled toward the inscribed rounded shape. */
function roundedBoxGeometry(
  THREE: Three,
  w: number,
  h: number,
  d: number,
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

/**
 * Builds every part mesh into a group, nested under its `parent` mesh via the
 * inverse-rest-transform locals from `bossLocalTransforms` — the rest pose is
 * identical to a flat build but parents drive their children (blink scaling,
 * limb sway, explosions).
 */
export function buildBossParts(
  THREE: Three,
  RoundedBox: RoundedBoxCtor | null,
  boss: RaidBoss,
  materialFor: (slot: Slot, emissive?: boolean) => import('three').Material,
  outlineMat: import('three').Material,
  flashMat: import('three').Material,
  outlineScale: number,
): BuiltBoss {
  const deg = Math.PI / 180;
  const locals = bossLocalTransforms(boss);
  const built: BuiltPart[] = [];
  const pupils: import('three').Mesh[] = [];
  const eyes: import('three').Mesh[] = [];
  const brows: Array<{ mesh: import('three').Mesh; side: number; baseRotZ: number }> = [];
  const partMeshes = new Map<string, import('three').Mesh>();
  for (const part of boss.parts) {
    const geo = geometryFor(THREE, RoundedBox, part);
    const mesh = new THREE.Mesh(geo, materialFor(part.slot, part.emissive));
    const local = locals[part.id]!;
    mesh.position.set(...local.position);
    mesh.rotation.set(local.rotation[0] * deg, local.rotation[1] * deg, local.rotation[2] * deg);
    mesh.userData.minPhase = part.minPhase ?? 0;
    mesh.userData.slot = part.slot;
    mesh.userData.role = part.role;
    // inverted-hull outline
    const outline = new THREE.Mesh(geo, outlineMat);
    outline.scale.setScalar(outlineScale);
    outline.raycast = () => undefined;
    mesh.add(outline);
    // white flash hull for hits
    const flash = new THREE.Mesh(geo, flashMat);
    flash.scale.setScalar(outlineScale + 0.01);
    flash.raycast = () => undefined;
    mesh.add(flash);
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
    if (part.id.startsWith('brow')) {
      const side = part.position[0] === 0 ? 0 : Math.sign(part.position[0]);
      brows.push({ mesh, side, baseRotZ: mesh.rotation.z });
    }
  }
  // nest under parents — every parent id is guaranteed to resolve (validator)
  const group = new THREE.Group();
  for (const part of boss.parts) {
    const mesh = partMeshes.get(part.id)!;
    const parent = part.parent ? partMeshes.get(part.parent) : undefined;
    (parent ?? group).add(mesh);
  }
  return { group, built, pupils, eyes, brows, partMeshes };
}
