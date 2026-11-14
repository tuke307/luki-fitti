import { MuscleGroup } from '../enums';

/**
 * A muscle group a boss is weak to. Besides the real `MuscleGroup` values the
 * two pseudo spots 'CARDIO' and 'STRETCHING' cover non-strength work; they are
 * the keys `computeSessionEffortPoints` uses in `pointsByWeakSpot`.
 */
export type WeakSpot = MuscleGroup | 'CARDIO' | 'STRETCHING';

export type Shape = 'sphere' | 'capsule' | 'box' | 'roundedBox' | 'cone' | 'cylinder' | 'torus';

/** Palette slot a part is coloured from. `dark` is also the outline colour. */
export type Slot = 'primary' | 'secondary' | 'accent' | 'eyeWhite' | 'pupil' | 'dark';

export type Role =
  'body' | 'limb' | 'eye' | 'pupil' | 'horn' | 'armor' | 'crack' | 'aura' | 'detail';

/**
 * Canonical recipe convention — every renderer (web three.js, iOS SceneKit,
 * tests) must map a part identically:
 *
 * - `size`/`position` are in boss space (unit-less, body ≈ 1, +Y up, +Z
 *   towards the camera). A part is rotated about its own centre, then
 *   translated by `position`.
 * - `size` semantics per shape:
 *     sphere     — x/y/z ellipsoid diameters
 *     capsule    — x = diameter, y = total height incl. caps (axis Y);
 *                  z is ignored (round cross-section)
 *     box        — x/y/z extents
 *     roundedBox — x/y/z outer extents, bevel ≈ 0.18·min(size)
 *     cone       — x = base diameter, y = height (axis Y, apex at +Y),
 *                  z = depth scale (elliptical base d = size[2])
 *     cylinder   — like cone, with a flat top
 *     torus      — x = ring diameter (centre-to-tube-centre × 2),
 *                  z = tube diameter; the ring lies in the XY plane
 *                  (hole axis Z); y is ignored
 * - `rotation` is in degrees, applied XYZ intrinsic (the three.js 'XYZ'
 *   order, i.e. the composed matrix Rx·Ry·Rz).
 * - `parent` nests the part under another part's scene node so animation
 *   (blink scaling, limb sway, explosions) propagates. `position` and
 *   `rotation` stay authored in boss space: renderers attach the node under
 *   its parent by compensating with the parent's inverse rest transform —
 *   see `bossLocalTransforms` — so the rest pose is identical whether a
 *   renderer builds a flat or a nested scene.
 */
export interface BossPart {
  id: string;
  shape: Shape;
  /** unit-less, body ≈ 1 — see the shape table above */
  size: [number, number, number];
  position: [number, number, number];
  /** degrees, XYZ intrinsic */
  rotation?: [number, number, number];
  slot: Slot;
  role: Role;
  /** animation hierarchy — see the convention note above */
  parent?: string;
  /** cracks/extra armour appear per enrage phase */
  minPhase?: 0 | 1 | 2 | 3;
  /** render the slot colour with an emissive boost (glowing eyes/runes) */
  emissive?: boolean;
}

export interface RaidBoss {
  slug: string;
  name: { en: string; de: string };
  lore: { en: string; de: string };
  weakTo: WeakSpot[];
  palette: Record<Slot, string>;
  enragedPalette: Partial<Record<Slot, string>>;
  /** ≤ 40 parts, ≤ ~6k triangles rendered */
  parts: BossPart[];
  idle: { bob: number; sway: number; periodMs: number };
}

export const MAX_BOSS_PARTS = 40;

const EYE_WHITE = '#FFFFFF';
const PUPIL_DARK = '#23272F';

/**
 * The 8-boss weekly rotation. `weakTo` maps onto real `MuscleGroup` values plus
 * the CARDIO/STRETCHING pseudo spots (see `WeakSpot`). Coordinates are
 * unit-less with the body ≈ 1, +Y up, +Z facing the camera.
 */
export const RAID_BOSSES: RaidBoss[] = [
  {
    slug: 'leg-day-titan',
    name: { en: 'Leg Day Titan', de: 'Beintag-Titan' },
    lore: {
      en: 'It skipped arm day for a decade. Make it regret the squat rack.',
      de: 'Es hat zehn Jahre lang den Arm-Tag geschwänzt. Zeit fürs Squat-Rack.',
    },
    weakTo: [
      MuscleGroup.QUADRICEPS,
      MuscleGroup.GLUTES,
      MuscleGroup.HAMSTRINGS,
      MuscleGroup.CALVES,
    ],
    palette: {
      primary: '#E2723A',
      secondary: '#F5C469',
      accent: '#7C3F21',
      eyeWhite: EYE_WHITE,
      pupil: PUPIL_DARK,
      dark: '#2B1B12',
    },
    enragedPalette: { primary: '#D1472B', accent: '#FF3D2E' },
    idle: { bob: 0.02, sway: 0.03, periodMs: 2600 },
    parts: [
      // squat block body sitting high on massive legs
      {
        id: 'body',
        shape: 'roundedBox',
        size: [1.1, 0.95, 0.85],
        position: [0, 1.15, 0],
        slot: 'primary',
        role: 'body',
      },
      {
        id: 'belt',
        shape: 'roundedBox',
        size: [1.14, 0.14, 0.9],
        position: [0, 0.72, 0],
        slot: 'dark',
        role: 'armor',
      },
      {
        id: 'buckle',
        shape: 'box',
        size: [0.2, 0.12, 0.05],
        position: [0, 0.72, 0.44],
        slot: 'secondary',
        role: 'detail',
      },
      // huge legs
      {
        id: 'leg-l',
        shape: 'capsule',
        size: [0.34, 0.62, 0.34],
        position: [-0.32, 0.32, 0],
        slot: 'primary',
        role: 'limb',
      },
      {
        id: 'leg-r',
        shape: 'capsule',
        size: [0.34, 0.62, 0.34],
        position: [0.32, 0.32, 0],
        slot: 'primary',
        role: 'limb',
      },
      {
        id: 'calf-l',
        shape: 'sphere',
        size: [0.3, 0.22, 0.3],
        position: [-0.32, 0.38, -0.16],
        slot: 'primary',
        role: 'limb',
        parent: 'leg-l',
      },
      {
        id: 'calf-r',
        shape: 'sphere',
        size: [0.3, 0.22, 0.3],
        position: [0.32, 0.38, -0.16],
        slot: 'primary',
        role: 'limb',
        parent: 'leg-r',
      },
      {
        id: 'foot-l',
        shape: 'roundedBox',
        size: [0.4, 0.16, 0.55],
        position: [-0.32, 0.05, 0.1],
        slot: 'dark',
        role: 'limb',
      },
      {
        id: 'foot-r',
        shape: 'roundedBox',
        size: [0.4, 0.16, 0.55],
        position: [0.32, 0.05, 0.1],
        slot: 'dark',
        role: 'limb',
      },
      // comically tiny arms, mid-flex
      {
        id: 'arm-l',
        shape: 'capsule',
        size: [0.1, 0.28, 0.1],
        position: [-0.62, 1.34, 0.05],
        rotation: [0, 0, 58],
        slot: 'primary',
        role: 'limb',
      },
      {
        id: 'arm-r',
        shape: 'capsule',
        size: [0.1, 0.28, 0.1],
        position: [0.62, 1.34, 0.05],
        rotation: [0, 0, -58],
        slot: 'primary',
        role: 'limb',
      },
      {
        id: 'fist-l',
        shape: 'sphere',
        size: [0.14, 0.14, 0.14],
        position: [-0.74, 1.46, 0.05],
        slot: 'primary',
        role: 'limb',
      },
      {
        id: 'fist-r',
        shape: 'sphere',
        size: [0.14, 0.14, 0.14],
        position: [0.74, 1.46, 0.05],
        slot: 'primary',
        role: 'limb',
      },
      // face on the block
      {
        id: 'eye-l',
        shape: 'sphere',
        size: [0.2, 0.24, 0.1],
        position: [-0.22, 1.35, 0.42],
        slot: 'eyeWhite',
        role: 'eye',
        parent: 'body',
      },
      {
        id: 'eye-r',
        shape: 'sphere',
        size: [0.2, 0.24, 0.1],
        position: [0.22, 1.35, 0.42],
        slot: 'eyeWhite',
        role: 'eye',
        parent: 'body',
      },
      {
        id: 'pupil-l',
        shape: 'sphere',
        size: [0.09, 0.11, 0.05],
        position: [-0.22, 1.35, 0.5],
        slot: 'pupil',
        role: 'pupil',
        parent: 'eye-l',
      },
      {
        id: 'pupil-r',
        shape: 'sphere',
        size: [0.09, 0.11, 0.05],
        position: [0.22, 1.35, 0.5],
        slot: 'pupil',
        role: 'pupil',
        parent: 'eye-r',
      },
      {
        id: 'brow-l',
        shape: 'roundedBox',
        size: [0.26, 0.07, 0.06],
        position: [-0.24, 1.56, 0.44],
        rotation: [0, 0, -12],
        slot: 'dark',
        role: 'detail',
      },
      {
        id: 'brow-r',
        shape: 'roundedBox',
        size: [0.26, 0.07, 0.06],
        position: [0.24, 1.56, 0.44],
        rotation: [0, 0, 12],
        slot: 'dark',
        role: 'detail',
      },
      {
        id: 'mouth',
        shape: 'roundedBox',
        size: [0.34, 0.1, 0.05],
        position: [0, 1.0, 0.44],
        slot: 'dark',
        role: 'detail',
      },
      {
        id: 'tooth-1',
        shape: 'box',
        size: [0.08, 0.05, 0.02],
        position: [-0.1, 1.03, 0.47],
        slot: 'eyeWhite',
        role: 'detail',
      },
      {
        id: 'tooth-2',
        shape: 'box',
        size: [0.08, 0.05, 0.02],
        position: [0.02, 1.03, 0.47],
        slot: 'eyeWhite',
        role: 'detail',
      },
      {
        id: 'tooth-3',
        shape: 'box',
        size: [0.08, 0.05, 0.02],
        position: [0.14, 1.03, 0.47],
        slot: 'eyeWhite',
        role: 'detail',
      },
      // headband
      {
        id: 'headband',
        shape: 'roundedBox',
        size: [1.12, 0.1, 0.88],
        position: [0, 1.58, 0],
        slot: 'secondary',
        role: 'detail',
      },
      // enrage: quad striations + cracked belt
      {
        id: 'crack-leg-l',
        shape: 'box',
        size: [0.04, 0.3, 0.02],
        position: [-0.32, 0.4, 0.33],
        rotation: [0, 0, 18],
        slot: 'dark',
        role: 'crack',
        minPhase: 1,
      },
      {
        id: 'crack-leg-r',
        shape: 'box',
        size: [0.04, 0.3, 0.02],
        position: [0.32, 0.32, 0.33],
        rotation: [0, 0, -14],
        slot: 'dark',
        role: 'crack',
        minPhase: 2,
      },
      {
        id: 'crack-body',
        shape: 'box',
        size: [0.05, 0.4, 0.02],
        position: [0.46, 1.05, 0.44],
        rotation: [0, 0, -24],
        slot: 'dark',
        role: 'crack',
        minPhase: 3,
      },
      {
        id: 'vein-l',
        shape: 'box',
        size: [0.03, 0.26, 0.02],
        position: [-0.2, 0.34, 0.34],
        rotation: [0, 0, -22],
        slot: 'accent',
        role: 'crack',
        minPhase: 3,
      },
    ],
  },
  {
    slug: 'iron-back-golem',
    name: { en: 'Iron Back Golem', de: 'Eiserner Rückengolem' },
    lore: {
      en: 'Forged from every barbell ever dropped without control.',
      de: 'Geschmiedet aus jeder Langhantel, die je unkontrolliert fiel.',
    },
    weakTo: [MuscleGroup.BACK],
    palette: {
      primary: '#5B6470',
      secondary: '#3E4550',
      accent: '#F5A623',
      eyeWhite: '#FFE9C4',
      pupil: '#B33B1D',
      dark: '#1E232B',
    },
    enragedPalette: { accent: '#FF6B1A', eyeWhite: '#FFC46B', primary: '#6E4A3A' },
    idle: { bob: 0.015, sway: 0.02, periodMs: 3400 },
    parts: [
      // hunched torso leaning forward
      {
        id: 'torso',
        shape: 'roundedBox',
        size: [1.15, 1.0, 0.9],
        position: [0, 0.95, 0],
        rotation: [14, 0, 0],
        slot: 'primary',
        role: 'body',
      },
      {
        id: 'belly',
        shape: 'roundedBox',
        size: [0.8, 0.6, 0.3],
        position: [0, 0.75, 0.42],
        slot: 'secondary',
        role: 'body',
        parent: 'torso',
      },
      // armour plates stacked on the back
      {
        id: 'plate-1',
        shape: 'roundedBox',
        size: [1.05, 0.22, 0.18],
        position: [0, 1.5, -0.32],
        rotation: [20, 0, 0],
        slot: 'secondary',
        role: 'armor',
        parent: 'torso',
      },
      {
        id: 'plate-2',
        shape: 'roundedBox',
        size: [0.95, 0.22, 0.18],
        position: [0, 1.24, -0.4],
        rotation: [24, 0, 0],
        slot: 'secondary',
        role: 'armor',
        parent: 'torso',
      },
      {
        id: 'plate-3',
        shape: 'roundedBox',
        size: [0.85, 0.22, 0.18],
        position: [0, 0.98, -0.44],
        rotation: [28, 0, 0],
        slot: 'secondary',
        role: 'armor',
        parent: 'torso',
      },
      {
        id: 'plate-4',
        shape: 'roundedBox',
        size: [0.75, 0.2, 0.16],
        position: [0, 0.74, -0.44],
        rotation: [32, 0, 0],
        slot: 'secondary',
        role: 'armor',
        parent: 'torso',
        minPhase: 1,
      },
      // low head, almost swallowed by the torso
      {
        id: 'head',
        shape: 'sphere',
        size: [0.5, 0.42, 0.42],
        position: [0, 1.32, 0.32],
        slot: 'primary',
        role: 'body',
      },
      {
        id: 'brow',
        shape: 'roundedBox',
        size: [0.56, 0.14, 0.14],
        position: [0, 1.42, 0.44],
        slot: 'dark',
        role: 'armor',
        parent: 'head',
      },
      {
        id: 'eye-l',
        shape: 'sphere',
        size: [0.18, 0.2, 0.08],
        position: [-0.14, 1.3, 0.55],
        slot: 'eyeWhite',
        role: 'eye',
        parent: 'head',
        emissive: true,
      },
      {
        id: 'eye-r',
        shape: 'sphere',
        size: [0.18, 0.2, 0.08],
        position: [0.14, 1.3, 0.55],
        slot: 'eyeWhite',
        role: 'eye',
        parent: 'head',
        emissive: true,
      },
      {
        id: 'pupil-l',
        shape: 'sphere',
        size: [0.08, 0.09, 0.05],
        position: [-0.14, 1.3, 0.62],
        slot: 'pupil',
        role: 'pupil',
        parent: 'eye-l',
      },
      {
        id: 'pupil-r',
        shape: 'sphere',
        size: [0.08, 0.09, 0.05],
        position: [0.14, 1.3, 0.62],
        slot: 'pupil',
        role: 'pupil',
        parent: 'eye-r',
      },
      // glowing rune stripes across the belly
      {
        id: 'rune-1',
        shape: 'roundedBox',
        size: [0.5, 0.07, 0.03],
        position: [0, 0.92, 0.58],
        rotation: [0, 0, 10],
        slot: 'accent',
        role: 'detail',
        emissive: true,
      },
      {
        id: 'rune-2',
        shape: 'roundedBox',
        size: [0.34, 0.06, 0.03],
        position: [-0.08, 0.78, 0.58],
        rotation: [0, 0, -14],
        slot: 'accent',
        role: 'detail',
        emissive: true,
      },
      // stubby arms and legs
      {
        id: 'arm-l',
        shape: 'capsule',
        size: [0.24, 0.6, 0.24],
        position: [-0.66, 0.8, 0.15],
        rotation: [0, 0, 12],
        slot: 'primary',
        role: 'limb',
      },
      {
        id: 'arm-r',
        shape: 'capsule',
        size: [0.24, 0.6, 0.24],
        position: [0.66, 0.8, 0.15],
        rotation: [0, 0, -12],
        slot: 'primary',
        role: 'limb',
      },
      {
        id: 'fist-l',
        shape: 'roundedBox',
        size: [0.32, 0.28, 0.3],
        position: [-0.74, 0.42, 0.2],
        slot: 'secondary',
        role: 'limb',
        parent: 'arm-l',
      },
      {
        id: 'fist-r',
        shape: 'roundedBox',
        size: [0.32, 0.28, 0.3],
        position: [0.74, 0.42, 0.2],
        slot: 'secondary',
        role: 'limb',
        parent: 'arm-r',
      },
      {
        id: 'leg-l',
        shape: 'cylinder',
        size: [0.3, 0.36, 0.3],
        position: [-0.32, 0.16, 0.05],
        slot: 'secondary',
        role: 'limb',
      },
      {
        id: 'leg-r',
        shape: 'cylinder',
        size: [0.3, 0.36, 0.3],
        position: [0.32, 0.16, 0.05],
        slot: 'secondary',
        role: 'limb',
      },
      // molten cracks through the stone
      {
        id: 'crack-1',
        shape: 'box',
        size: [0.04, 0.5, 0.02],
        position: [-0.2, 1.0, 0.46],
        rotation: [0, 0, 20],
        slot: 'accent',
        role: 'crack',
        minPhase: 1,
      },
      {
        id: 'crack-2',
        shape: 'box',
        size: [0.04, 0.4, 0.02],
        position: [0.24, 0.85, 0.46],
        rotation: [0, 0, -26],
        slot: 'accent',
        role: 'crack',
        minPhase: 2,
      },
      {
        id: 'crack-3',
        shape: 'box',
        size: [0.05, 0.55, 0.02],
        position: [0.02, 1.15, 0.47],
        rotation: [0, 0, 8],
        slot: 'accent',
        role: 'crack',
        minPhase: 3,
      },
    ],
  },
  {
    slug: 'chest-hydra',
    name: { en: 'Chest Hydra', de: 'Brust-Hydra' },
    lore: {
      en: 'Cut one head off and it benches two more.',
      de: 'Schlag einen Kopf ab und es drückt zwei weitere.',
    },
    weakTo: [MuscleGroup.CHEST, MuscleGroup.TRICEPS],
    palette: {
      primary: '#C65B4E',
      secondary: '#F0C8A0',
      accent: '#5B8C5A',
      eyeWhite: EYE_WHITE,
      pupil: PUPIL_DARK,
      dark: '#331A17',
    },
    enragedPalette: { primary: '#A83226', accent: '#E8D44D' },
    idle: { bob: 0.03, sway: 0.05, periodMs: 2200 },
    parts: [
      // round chest body with a belly plate
      {
        id: 'body',
        shape: 'sphere',
        size: [1.1, 1.0, 0.95],
        position: [0, 0.75, 0],
        slot: 'primary',
        role: 'body',
      },
      {
        id: 'belly',
        shape: 'sphere',
        size: [0.72, 0.7, 0.3],
        position: [0, 0.6, 0.55],
        slot: 'secondary',
        role: 'body',
        parent: 'body',
      },
      {
        id: 'pec-l',
        shape: 'sphere',
        size: [0.4, 0.3, 0.2],
        position: [-0.26, 0.95, 0.52],
        slot: 'secondary',
        role: 'body',
        parent: 'body',
      },
      {
        id: 'pec-r',
        shape: 'sphere',
        size: [0.4, 0.3, 0.2],
        position: [0.26, 0.95, 0.52],
        slot: 'secondary',
        role: 'body',
        parent: 'body',
      },
      // three necks + heads, each with its own eye pair
      {
        id: 'neck-c',
        shape: 'capsule',
        size: [0.16, 0.55, 0.16],
        position: [0, 1.5, 0.05],
        slot: 'primary',
        role: 'limb',
        parent: 'body',
      },
      {
        id: 'neck-l',
        shape: 'capsule',
        size: [0.14, 0.5, 0.14],
        position: [-0.4, 1.42, 0],
        rotation: [0, 0, 28],
        slot: 'primary',
        role: 'limb',
        parent: 'body',
      },
      {
        id: 'neck-r',
        shape: 'capsule',
        size: [0.14, 0.5, 0.14],
        position: [0.4, 1.42, 0],
        rotation: [0, 0, -28],
        slot: 'primary',
        role: 'limb',
        parent: 'body',
      },
      {
        id: 'head-c',
        shape: 'sphere',
        size: [0.34, 0.3, 0.3],
        position: [0, 1.82, 0.08],
        slot: 'primary',
        role: 'body',
        parent: 'neck-c',
      },
      {
        id: 'head-l',
        shape: 'sphere',
        size: [0.3, 0.27, 0.27],
        position: [-0.58, 1.72, 0.05],
        slot: 'primary',
        role: 'body',
        parent: 'neck-l',
      },
      {
        id: 'head-r',
        shape: 'sphere',
        size: [0.3, 0.27, 0.27],
        position: [0.58, 1.72, 0.05],
        slot: 'primary',
        role: 'body',
        parent: 'neck-r',
      },
      {
        id: 'crest-c',
        shape: 'cone',
        size: [0.12, 0.18, 0.06],
        position: [0, 2.0, 0.02],
        rotation: [-15, 0, 0],
        slot: 'accent',
        role: 'horn',
        parent: 'head-c',
      },
      {
        id: 'crest-l',
        shape: 'cone',
        size: [0.1, 0.15, 0.05],
        position: [-0.64, 1.86, 0],
        rotation: [-15, 0, 10],
        slot: 'accent',
        role: 'horn',
        parent: 'head-l',
      },
      {
        id: 'crest-r',
        shape: 'cone',
        size: [0.1, 0.15, 0.05],
        position: [0.64, 1.86, 0],
        rotation: [-15, 0, -10],
        slot: 'accent',
        role: 'horn',
        parent: 'head-r',
      },
      {
        id: 'eye-cl',
        shape: 'sphere',
        size: [0.1, 0.12, 0.06],
        position: [-0.08, 1.86, 0.32],
        slot: 'eyeWhite',
        role: 'eye',
        parent: 'head-c',
      },
      {
        id: 'eye-cr',
        shape: 'sphere',
        size: [0.1, 0.12, 0.06],
        position: [0.08, 1.86, 0.32],
        slot: 'eyeWhite',
        role: 'eye',
        parent: 'head-c',
      },
      {
        id: 'pupil-cl',
        shape: 'sphere',
        size: [0.05, 0.06, 0.03],
        position: [-0.08, 1.86, 0.37],
        slot: 'pupil',
        role: 'pupil',
        parent: 'eye-cl',
      },
      {
        id: 'pupil-cr',
        shape: 'sphere',
        size: [0.05, 0.06, 0.03],
        position: [0.08, 1.86, 0.37],
        slot: 'pupil',
        role: 'pupil',
        parent: 'eye-cr',
      },
      {
        id: 'eye-ll',
        shape: 'sphere',
        size: [0.09, 0.11, 0.05],
        position: [-0.64, 1.76, 0.28],
        slot: 'eyeWhite',
        role: 'eye',
        parent: 'head-l',
      },
      {
        id: 'eye-lr',
        shape: 'sphere',
        size: [0.09, 0.11, 0.05],
        position: [-0.5, 1.76, 0.3],
        slot: 'eyeWhite',
        role: 'eye',
        parent: 'head-l',
      },
      {
        id: 'pupil-ll',
        shape: 'sphere',
        size: [0.045, 0.055, 0.03],
        position: [-0.64, 1.76, 0.33],
        slot: 'pupil',
        role: 'pupil',
        parent: 'eye-ll',
      },
      {
        id: 'pupil-lr',
        shape: 'sphere',
        size: [0.045, 0.055, 0.03],
        position: [-0.5, 1.76, 0.35],
        slot: 'pupil',
        role: 'pupil',
        parent: 'eye-lr',
      },
      {
        id: 'eye-rl',
        shape: 'sphere',
        size: [0.09, 0.11, 0.05],
        position: [0.5, 1.76, 0.3],
        slot: 'eyeWhite',
        role: 'eye',
        parent: 'head-r',
      },
      {
        id: 'eye-rr',
        shape: 'sphere',
        size: [0.09, 0.11, 0.05],
        position: [0.64, 1.76, 0.28],
        slot: 'eyeWhite',
        role: 'eye',
        parent: 'head-r',
      },
      {
        id: 'pupil-rl',
        shape: 'sphere',
        size: [0.045, 0.055, 0.03],
        position: [0.5, 1.76, 0.35],
        slot: 'pupil',
        role: 'pupil',
        parent: 'eye-rl',
      },
      {
        id: 'pupil-rr',
        shape: 'sphere',
        size: [0.045, 0.055, 0.03],
        position: [0.64, 1.76, 0.33],
        slot: 'pupil',
        role: 'pupil',
        parent: 'eye-rr',
      },
      // stubby feet
      {
        id: 'foot-l',
        shape: 'roundedBox',
        size: [0.32, 0.14, 0.4],
        position: [-0.3, 0.05, 0.15],
        slot: 'dark',
        role: 'limb',
      },
      {
        id: 'foot-r',
        shape: 'roundedBox',
        size: [0.32, 0.14, 0.4],
        position: [0.3, 0.05, 0.15],
        slot: 'dark',
        role: 'limb',
      },
      // enrage: scale ridges + a fourth neck stub
      {
        id: 'neck-sprout',
        shape: 'capsule',
        size: [0.1, 0.28, 0.1],
        position: [-0.18, 1.62, -0.15],
        rotation: [-20, 0, 18],
        slot: 'accent',
        role: 'limb',
        parent: 'body',
        minPhase: 2,
      },
      {
        id: 'crack-belly',
        shape: 'box',
        size: [0.04, 0.35, 0.02],
        position: [0.1, 0.62, 0.83],
        rotation: [0, 0, -18],
        slot: 'dark',
        role: 'crack',
        minPhase: 1,
      },
      {
        id: 'crack-pec',
        shape: 'box',
        size: [0.04, 0.3, 0.02],
        position: [-0.28, 0.98, 0.66],
        rotation: [0, 0, 24],
        slot: 'dark',
        role: 'crack',
        minPhase: 3,
      },
    ],
  },
  {
    slug: 'shoulder-wyvern',
    name: { en: 'Shoulder Wyvern', de: 'Schulter-Wyvern' },
    lore: {
      en: 'Its wings are delts. Its delts are also wings.',
      de: 'Seine Flügel sind Deltas. Seine Deltas sind auch Flügel.',
    },
    weakTo: [MuscleGroup.SHOULDERS],
    palette: {
      primary: '#4EA3E2',
      secondary: '#BFE3F7',
      accent: '#FFB02E',
      eyeWhite: EYE_WHITE,
      pupil: PUPIL_DARK,
      dark: '#16334A',
    },
    enragedPalette: { primary: '#2E6FC2', accent: '#FF7A1A' },
    idle: { bob: 0.05, sway: 0.06, periodMs: 2000 },
    parts: [
      // small body all shoulder
      {
        id: 'body',
        shape: 'capsule',
        size: [0.55, 0.7, 0.5],
        position: [0, 0.7, 0],
        slot: 'primary',
        role: 'body',
      },
      {
        id: 'belly',
        shape: 'sphere',
        size: [0.42, 0.5, 0.2],
        position: [0, 0.62, 0.28],
        slot: 'secondary',
        role: 'body',
        parent: 'body',
      },
      // oversized wing-shoulders
      {
        id: 'wing-l',
        shape: 'roundedBox',
        size: [0.85, 0.55, 0.14],
        position: [-0.68, 1.05, -0.05],
        rotation: [0, 12, 32],
        slot: 'primary',
        role: 'limb',
      },
      {
        id: 'wing-r',
        shape: 'roundedBox',
        size: [0.85, 0.55, 0.14],
        position: [0.68, 1.05, -0.05],
        rotation: [0, -12, -32],
        slot: 'primary',
        role: 'limb',
      },
      {
        id: 'wingtip-l',
        shape: 'cone',
        size: [0.22, 0.4, 0.1],
        position: [-1.1, 1.28, -0.08],
        rotation: [0, 0, 60],
        slot: 'accent',
        role: 'detail',
        parent: 'wing-l',
      },
      {
        id: 'wingtip-r',
        shape: 'cone',
        size: [0.22, 0.4, 0.1],
        position: [1.1, 1.28, -0.08],
        rotation: [0, 0, -60],
        slot: 'accent',
        role: 'detail',
        parent: 'wing-r',
      },
      {
        id: 'delt-l',
        shape: 'sphere',
        size: [0.34, 0.32, 0.3],
        position: [-0.42, 1.0, 0.05],
        slot: 'primary',
        role: 'body',
      },
      {
        id: 'delt-r',
        shape: 'sphere',
        size: [0.34, 0.32, 0.3],
        position: [0.42, 1.0, 0.05],
        slot: 'primary',
        role: 'body',
      },
      // head + beak
      {
        id: 'head',
        shape: 'sphere',
        size: [0.42, 0.4, 0.4],
        position: [0, 1.3, 0.08],
        slot: 'primary',
        role: 'body',
      },
      {
        id: 'beak',
        shape: 'cone',
        size: [0.14, 0.28, 0.12],
        position: [0, 1.24, 0.45],
        rotation: [95, 0, 0],
        slot: 'accent',
        role: 'horn',
        parent: 'head',
      },
      {
        id: 'crest',
        shape: 'cone',
        size: [0.1, 0.24, 0.06],
        position: [0, 1.55, 0],
        rotation: [-25, 0, 0],
        slot: 'accent',
        role: 'horn',
        parent: 'head',
      },
      {
        id: 'eye-l',
        shape: 'sphere',
        size: [0.12, 0.15, 0.07],
        position: [-0.13, 1.36, 0.4],
        slot: 'eyeWhite',
        role: 'eye',
        parent: 'head',
      },
      {
        id: 'eye-r',
        shape: 'sphere',
        size: [0.12, 0.15, 0.07],
        position: [0.13, 1.36, 0.4],
        slot: 'eyeWhite',
        role: 'eye',
        parent: 'head',
      },
      {
        id: 'pupil-l',
        shape: 'sphere',
        size: [0.06, 0.075, 0.04],
        position: [-0.13, 1.36, 0.46],
        slot: 'pupil',
        role: 'pupil',
        parent: 'eye-l',
      },
      {
        id: 'pupil-r',
        shape: 'sphere',
        size: [0.06, 0.075, 0.04],
        position: [0.13, 1.36, 0.46],
        slot: 'pupil',
        role: 'pupil',
        parent: 'eye-r',
      },
      // tail + feet
      {
        id: 'tail',
        shape: 'cone',
        size: [0.14, 0.5, 0.12],
        position: [0, 0.3, -0.4],
        rotation: [-60, 0, 0],
        slot: 'primary',
        role: 'limb',
      },
      {
        id: 'foot-l',
        shape: 'cone',
        size: [0.12, 0.16, 0.14],
        position: [-0.18, 0.06, 0.15],
        rotation: [180, 0, 0],
        slot: 'accent',
        role: 'limb',
      },
      {
        id: 'foot-r',
        shape: 'cone',
        size: [0.12, 0.16, 0.14],
        position: [0.18, 0.06, 0.15],
        rotation: [180, 0, 0],
        slot: 'accent',
        role: 'limb',
      },
      // enrage: feather spikes + cracks
      {
        id: 'feather-l',
        shape: 'cone',
        size: [0.08, 0.22, 0.05],
        position: [-0.85, 0.78, -0.02],
        rotation: [0, 0, 100],
        slot: 'accent',
        role: 'detail',
        parent: 'wing-l',
        minPhase: 1,
      },
      {
        id: 'feather-r',
        shape: 'cone',
        size: [0.08, 0.22, 0.05],
        position: [0.85, 0.78, -0.02],
        rotation: [0, 0, -100],
        slot: 'accent',
        role: 'detail',
        parent: 'wing-r',
        minPhase: 1,
      },
      {
        id: 'crack-wing',
        shape: 'box',
        size: [0.03, 0.3, 0.02],
        position: [-0.7, 1.1, 0.03],
        rotation: [0, 0, 30],
        slot: 'dark',
        role: 'crack',
        minPhase: 2,
      },
      {
        id: 'crack-delt',
        shape: 'box',
        size: [0.03, 0.2, 0.02],
        position: [0.42, 1.02, 0.32],
        rotation: [0, 0, -18],
        slot: 'dark',
        role: 'crack',
        minPhase: 3,
      },
    ],
  },
  {
    slug: 'core-kraken',
    name: { en: 'Core Kraken', de: 'Rumpf-Krake' },
    lore: {
      en: 'Six tentacles, zero excuses. Planks are its only fear.',
      de: 'Sechs Tentakel, null Ausreden. Planks sind seine einzige Angst.',
    },
    weakTo: [MuscleGroup.ABS_CORE, MuscleGroup.HIP_FLEXORS],
    palette: {
      primary: '#8A6BD1',
      secondary: '#D9CFF5',
      accent: '#FF7A59',
      eyeWhite: EYE_WHITE,
      pupil: PUPIL_DARK,
      dark: '#2D1F4A',
    },
    enragedPalette: { primary: '#6B44B8', accent: '#FF3D2E' },
    idle: { bob: 0.04, sway: 0.05, periodMs: 2400 },
    parts: [
      // round body
      {
        id: 'body',
        shape: 'sphere',
        size: [1.1, 0.95, 1.0],
        position: [0, 0.9, 0],
        slot: 'primary',
        role: 'body',
      },
      {
        id: 'belly',
        shape: 'sphere',
        size: [0.7, 0.6, 0.3],
        position: [0, 0.72, 0.6],
        slot: 'secondary',
        role: 'body',
        parent: 'body',
      },
      // six tentacle arcs around the base
      {
        id: 'tent-1',
        shape: 'torus',
        size: [0.34, 0.34, 0.14],
        position: [-0.62, 0.28, 0.3],
        rotation: [80, 0, 30],
        slot: 'primary',
        role: 'limb',
      },
      {
        id: 'tent-2',
        shape: 'torus',
        size: [0.34, 0.34, 0.14],
        position: [0.62, 0.28, 0.3],
        rotation: [80, 0, -30],
        slot: 'primary',
        role: 'limb',
      },
      {
        id: 'tent-3',
        shape: 'torus',
        size: [0.34, 0.34, 0.14],
        position: [-0.4, 0.22, -0.42],
        rotation: [100, 20, 0],
        slot: 'primary',
        role: 'limb',
      },
      {
        id: 'tent-4',
        shape: 'torus',
        size: [0.34, 0.34, 0.14],
        position: [0.4, 0.22, -0.42],
        rotation: [100, -20, 0],
        slot: 'primary',
        role: 'limb',
      },
      {
        id: 'tent-5',
        shape: 'torus',
        size: [0.34, 0.34, 0.14],
        position: [-0.75, 0.3, -0.1],
        rotation: [85, 0, 55],
        slot: 'primary',
        role: 'limb',
      },
      {
        id: 'tent-6',
        shape: 'torus',
        size: [0.34, 0.34, 0.14],
        position: [0.75, 0.3, -0.1],
        rotation: [85, 0, -55],
        slot: 'primary',
        role: 'limb',
      },
      // suction dots on two front tentacles
      {
        id: 'suck-1',
        shape: 'sphere',
        size: [0.07, 0.07, 0.05],
        position: [-0.62, 0.42, 0.5],
        slot: 'accent',
        role: 'detail',
        parent: 'tent-1',
      },
      {
        id: 'suck-2',
        shape: 'sphere',
        size: [0.07, 0.07, 0.05],
        position: [0.62, 0.42, 0.5],
        slot: 'accent',
        role: 'detail',
        parent: 'tent-2',
      },
      // one huge central eye pair (kraken eyes sit side by side, big)
      {
        id: 'eye-l',
        shape: 'sphere',
        size: [0.3, 0.36, 0.14],
        position: [-0.24, 1.05, 0.72],
        slot: 'eyeWhite',
        role: 'eye',
        parent: 'body',
      },
      {
        id: 'eye-r',
        shape: 'sphere',
        size: [0.3, 0.36, 0.14],
        position: [0.24, 1.05, 0.72],
        slot: 'eyeWhite',
        role: 'eye',
        parent: 'body',
      },
      {
        id: 'pupil-l',
        shape: 'sphere',
        size: [0.13, 0.16, 0.07],
        position: [-0.24, 1.05, 0.84],
        slot: 'pupil',
        role: 'pupil',
        parent: 'eye-l',
      },
      {
        id: 'pupil-r',
        shape: 'sphere',
        size: [0.13, 0.16, 0.07],
        position: [0.24, 1.05, 0.84],
        slot: 'pupil',
        role: 'pupil',
        parent: 'eye-r',
      },
      {
        id: 'brow-l',
        shape: 'roundedBox',
        size: [0.3, 0.07, 0.06],
        position: [-0.26, 1.34, 0.68],
        rotation: [0, 0, -14],
        slot: 'dark',
        role: 'detail',
        parent: 'body',
      },
      {
        id: 'brow-r',
        shape: 'roundedBox',
        size: [0.3, 0.07, 0.06],
        position: [0.26, 1.34, 0.68],
        rotation: [0, 0, 14],
        slot: 'dark',
        role: 'detail',
        parent: 'body',
      },
      // beak hint
      {
        id: 'beak',
        shape: 'cone',
        size: [0.16, 0.18, 0.14],
        position: [0, 0.68, 0.85],
        rotation: [90, 0, 0],
        slot: 'dark',
        role: 'detail',
      },
      // enrage: extra suction rows + cracks
      {
        id: 'suck-3',
        shape: 'sphere',
        size: [0.06, 0.06, 0.04],
        position: [-0.4, 0.36, -0.2],
        slot: 'accent',
        role: 'detail',
        parent: 'tent-3',
        minPhase: 1,
      },
      {
        id: 'suck-4',
        shape: 'sphere',
        size: [0.06, 0.06, 0.04],
        position: [0.4, 0.36, -0.2],
        slot: 'accent',
        role: 'detail',
        parent: 'tent-4',
        minPhase: 1,
      },
      {
        id: 'crack-body',
        shape: 'box',
        size: [0.04, 0.4, 0.02],
        position: [0.44, 0.6, 0.62],
        rotation: [0, 0, -20],
        slot: 'dark',
        role: 'crack',
        minPhase: 2,
      },
      {
        id: 'crack-head',
        shape: 'box',
        size: [0.04, 0.3, 0.02],
        position: [-0.45, 1.12, 0.55],
        rotation: [0, 0, 26],
        slot: 'dark',
        role: 'crack',
        minPhase: 3,
      },
    ],
  },
  {
    slug: 'arm-cyclops',
    name: { en: 'Arm Cyclops', de: 'Arm-Zyklop' },
    lore: {
      en: 'One eye, two pythons. Curls for the girls — and for the raid.',
      de: 'Ein Auge, zwei Pythons. Curls für den Raid.',
    },
    weakTo: [MuscleGroup.BICEPS, MuscleGroup.TRICEPS, MuscleGroup.FOREARMS],
    palette: {
      primary: '#78B159',
      secondary: '#3E6B34',
      accent: '#E8D44D',
      eyeWhite: EYE_WHITE,
      pupil: '#7A2A1F',
      dark: '#1F3318',
    },
    enragedPalette: { primary: '#4E8C3A', accent: '#FF5A2E' },
    idle: { bob: 0.025, sway: 0.035, periodMs: 2800 },
    parts: [
      // compact body, all arms
      {
        id: 'body',
        shape: 'roundedBox',
        size: [0.85, 0.9, 0.7],
        position: [0, 0.85, 0],
        slot: 'primary',
        role: 'body',
      },
      {
        id: 'belly',
        shape: 'sphere',
        size: [0.5, 0.5, 0.25],
        position: [0, 0.7, 0.4],
        slot: 'secondary',
        role: 'body',
        parent: 'body',
      },
      // one giant eye
      {
        id: 'eye',
        shape: 'sphere',
        size: [0.52, 0.55, 0.2],
        position: [0, 1.05, 0.45],
        slot: 'eyeWhite',
        role: 'eye',
        parent: 'body',
      },
      {
        id: 'pupil',
        shape: 'sphere',
        size: [0.2, 0.24, 0.08],
        position: [0, 1.05, 0.62],
        slot: 'pupil',
        role: 'pupil',
        parent: 'eye',
      },
      {
        id: 'brow',
        shape: 'roundedBox',
        size: [0.5, 0.1, 0.08],
        position: [0, 1.36, 0.4],
        rotation: [0, 0, 0],
        slot: 'dark',
        role: 'armor',
        parent: 'body',
      },
      {
        id: 'horn-l',
        shape: 'cone',
        size: [0.1, 0.2, 0.08],
        position: [-0.3, 1.42, 0],
        rotation: [0, 0, 20],
        slot: 'accent',
        role: 'horn',
        parent: 'body',
      },
      {
        id: 'horn-r',
        shape: 'cone',
        size: [0.1, 0.2, 0.08],
        position: [0.3, 1.42, 0],
        rotation: [0, 0, -20],
        slot: 'accent',
        role: 'horn',
        parent: 'body',
      },
      // massive arms: shoulder boulder + python forearm + fist
      {
        id: 'shoulder-l',
        shape: 'sphere',
        size: [0.4, 0.38, 0.38],
        position: [-0.55, 1.15, 0.05],
        slot: 'primary',
        role: 'limb',
      },
      {
        id: 'shoulder-r',
        shape: 'sphere',
        size: [0.4, 0.38, 0.38],
        position: [0.55, 1.15, 0.05],
        slot: 'primary',
        role: 'limb',
      },
      {
        id: 'bicep-l',
        shape: 'sphere',
        size: [0.34, 0.4, 0.34],
        position: [-0.78, 0.85, 0.1],
        slot: 'primary',
        role: 'limb',
        parent: 'shoulder-l',
      },
      {
        id: 'bicep-r',
        shape: 'sphere',
        size: [0.34, 0.4, 0.34],
        position: [0.78, 0.85, 0.1],
        slot: 'primary',
        role: 'limb',
        parent: 'shoulder-r',
      },
      {
        id: 'forearm-l',
        shape: 'capsule',
        size: [0.26, 0.5, 0.26],
        position: [-0.82, 0.5, 0.12],
        rotation: [0, 0, 8],
        slot: 'secondary',
        role: 'limb',
        parent: 'bicep-l',
      },
      {
        id: 'forearm-r',
        shape: 'capsule',
        size: [0.26, 0.5, 0.26],
        position: [0.82, 0.5, 0.12],
        rotation: [0, 0, -8],
        slot: 'secondary',
        role: 'limb',
        parent: 'bicep-r',
      },
      {
        id: 'fist-l',
        shape: 'roundedBox',
        size: [0.32, 0.3, 0.32],
        position: [-0.86, 0.2, 0.15],
        slot: 'primary',
        role: 'limb',
        parent: 'forearm-l',
      },
      {
        id: 'fist-r',
        shape: 'roundedBox',
        size: [0.32, 0.3, 0.32],
        position: [0.86, 0.2, 0.15],
        slot: 'primary',
        role: 'limb',
        parent: 'forearm-r',
      },
      // wristbands
      {
        id: 'band-l',
        shape: 'torus',
        size: [0.3, 0.3, 0.08],
        position: [-0.83, 0.36, 0.12],
        rotation: [0, 0, 8],
        slot: 'accent',
        role: 'detail',
        parent: 'forearm-l',
      },
      {
        id: 'band-r',
        shape: 'torus',
        size: [0.3, 0.3, 0.08],
        position: [0.83, 0.36, 0.12],
        rotation: [0, 0, -8],
        slot: 'accent',
        role: 'detail',
        parent: 'forearm-r',
      },
      // small legs
      {
        id: 'leg-l',
        shape: 'capsule',
        size: [0.18, 0.3, 0.18],
        position: [-0.2, 0.18, 0],
        slot: 'secondary',
        role: 'limb',
      },
      {
        id: 'leg-r',
        shape: 'capsule',
        size: [0.18, 0.3, 0.18],
        position: [0.2, 0.18, 0],
        slot: 'secondary',
        role: 'limb',
      },
      // enrage: shoulder spikes + vein cracks
      {
        id: 'spike-l',
        shape: 'cone',
        size: [0.1, 0.22, 0.1],
        position: [-0.62, 1.42, 0.02],
        rotation: [0, 0, 30],
        slot: 'accent',
        role: 'horn',
        parent: 'shoulder-l',
        minPhase: 1,
      },
      {
        id: 'spike-r',
        shape: 'cone',
        size: [0.1, 0.22, 0.1],
        position: [0.62, 1.42, 0.02],
        rotation: [0, 0, -30],
        slot: 'accent',
        role: 'horn',
        parent: 'shoulder-r',
        minPhase: 1,
      },
      {
        id: 'vein-l',
        shape: 'box',
        size: [0.03, 0.3, 0.02],
        position: [-0.78, 0.88, 0.42],
        rotation: [0, 0, -20],
        slot: 'accent',
        role: 'crack',
        minPhase: 2,
      },
      {
        id: 'vein-r',
        shape: 'box',
        size: [0.03, 0.3, 0.02],
        position: [0.78, 0.88, 0.42],
        rotation: [0, 0, 20],
        slot: 'accent',
        role: 'crack',
        minPhase: 2,
      },
      {
        id: 'crack-eye',
        shape: 'box',
        size: [0.04, 0.3, 0.02],
        position: [0.52, 1.32, 0.3],
        rotation: [0, 0, 12],
        slot: 'dark',
        role: 'crack',
        minPhase: 3,
      },
    ],
  },
  {
    slug: 'mobility-phantom',
    name: { en: 'Mobility Phantom', de: 'Mobilitäts-Phantom' },
    lore: {
      en: 'It slipped through every stretching routine you skipped.',
      de: 'Es schlüpfte durch jede Dehneinheit, die du ausgelassen hast.',
    },
    weakTo: ['STRETCHING'],
    palette: {
      primary: '#CFE8FF',
      secondary: '#8FD0FF',
      accent: '#6C8CFF',
      eyeWhite: '#2A3345',
      pupil: '#E8F4FF',
      dark: '#42506B',
    },
    enragedPalette: { primary: '#9FB8E8', accent: '#4A5BE0' },
    idle: { bob: 0.06, sway: 0.08, periodMs: 3000 },
    parts: [
      // floating capsule body — sits higher, no feet
      {
        id: 'body',
        shape: 'capsule',
        size: [0.85, 1.0, 0.8],
        position: [0, 1.0, 0],
        slot: 'primary',
        role: 'body',
      },
      {
        id: 'inner',
        shape: 'capsule',
        size: [0.55, 0.7, 0.5],
        position: [0, 0.9, 0.1],
        slot: 'secondary',
        role: 'body',
        parent: 'body',
      },
      // ribbon tail: staggered spheres tapering down
      {
        id: 'tail-1',
        shape: 'sphere',
        size: [0.4, 0.3, 0.38],
        position: [0, 0.42, -0.05],
        slot: 'primary',
        role: 'limb',
        parent: 'body',
      },
      {
        id: 'tail-2',
        shape: 'sphere',
        size: [0.28, 0.22, 0.26],
        position: [0.12, 0.2, -0.12],
        slot: 'primary',
        role: 'limb',
        parent: 'tail-1',
      },
      {
        id: 'tail-3',
        shape: 'sphere',
        size: [0.18, 0.15, 0.17],
        position: [-0.08, 0.05, -0.18],
        slot: 'secondary',
        role: 'limb',
        parent: 'tail-2',
      },
      {
        id: 'tail-4',
        shape: 'sphere',
        size: [0.1, 0.09, 0.1],
        position: [0.08, -0.06, -0.24],
        slot: 'secondary',
        role: 'limb',
        parent: 'tail-3',
      },
      // wispy arm nubs stretched outward
      {
        id: 'arm-l',
        shape: 'capsule',
        size: [0.12, 0.5, 0.12],
        position: [-0.55, 0.95, 0.1],
        rotation: [0, 0, 70],
        slot: 'primary',
        role: 'limb',
      },
      {
        id: 'arm-r',
        shape: 'capsule',
        size: [0.12, 0.5, 0.12],
        position: [0.55, 0.95, 0.1],
        rotation: [0, 0, -70],
        slot: 'primary',
        role: 'limb',
      },
      // dark eye sockets with light pupils (inverted ghost eyes)
      {
        id: 'eye-l',
        shape: 'sphere',
        size: [0.16, 0.24, 0.08],
        position: [-0.2, 1.15, 0.62],
        slot: 'eyeWhite',
        role: 'eye',
        parent: 'body',
      },
      {
        id: 'eye-r',
        shape: 'sphere',
        size: [0.16, 0.24, 0.08],
        position: [0.2, 1.15, 0.62],
        slot: 'eyeWhite',
        role: 'eye',
        parent: 'body',
      },
      {
        id: 'pupil-l',
        shape: 'sphere',
        size: [0.07, 0.1, 0.04],
        position: [-0.2, 1.15, 0.69],
        slot: 'pupil',
        role: 'pupil',
        parent: 'eye-l',
      },
      {
        id: 'pupil-r',
        shape: 'sphere',
        size: [0.07, 0.1, 0.04],
        position: [0.2, 1.15, 0.69],
        slot: 'pupil',
        role: 'pupil',
        parent: 'eye-r',
      },
      // mouth: small dark oval
      {
        id: 'mouth',
        shape: 'sphere',
        size: [0.1, 0.12, 0.05],
        position: [0, 0.9, 0.66],
        slot: 'eyeWhite',
        role: 'detail',
        parent: 'body',
      },
      // glow motes orbiting
      {
        id: 'mote-1',
        shape: 'sphere',
        size: [0.06, 0.06, 0.06],
        position: [-0.7, 1.4, 0.2],
        slot: 'accent',
        role: 'detail',
      },
      {
        id: 'mote-2',
        shape: 'sphere',
        size: [0.05, 0.05, 0.05],
        position: [0.72, 0.7, 0.25],
        slot: 'accent',
        role: 'detail',
      },
      {
        id: 'mote-3',
        shape: 'sphere',
        size: [0.045, 0.045, 0.045],
        position: [0.4, 1.6, -0.1],
        slot: 'accent',
        role: 'detail',
      },
      // enrage: trailing shreds + eye cracks
      {
        id: 'shred-1',
        shape: 'cone',
        size: [0.1, 0.3, 0.06],
        position: [-0.35, 0.35, 0.1],
        rotation: [0, 0, 150],
        slot: 'secondary',
        role: 'detail',
        parent: 'body',
        minPhase: 1,
      },
      {
        id: 'shred-2',
        shape: 'cone',
        size: [0.08, 0.26, 0.05],
        position: [0.38, 0.32, -0.05],
        rotation: [0, 0, -160],
        slot: 'secondary',
        role: 'detail',
        parent: 'body',
        minPhase: 2,
      },
      {
        id: 'crack-eye',
        shape: 'box',
        size: [0.03, 0.24, 0.02],
        position: [0.44, 1.05, 0.5],
        rotation: [0, 0, -20],
        slot: 'dark',
        role: 'crack',
        minPhase: 3,
      },
    ],
  },
  {
    slug: 'cardio-comet',
    name: { en: 'Cardio Comet', de: 'Cardio-Komet' },
    lore: {
      en: 'It never stops moving. Neither should you.',
      de: 'Es bleibt nie stehen. Du auch nicht.',
    },
    weakTo: ['CARDIO'],
    palette: {
      primary: '#FF7A59',
      secondary: '#FFC94D',
      accent: '#FF3D2E',
      eyeWhite: EYE_WHITE,
      pupil: PUPIL_DARK,
      dark: '#4A1A0E',
    },
    enragedPalette: { primary: '#FF4A2E', secondary: '#FF9A2E' },
    idle: { bob: 0.05, sway: 0.1, periodMs: 1600 },
    parts: [
      // sphere body
      {
        id: 'body',
        shape: 'sphere',
        size: [0.95, 0.95, 0.95],
        position: [0, 0.9, 0],
        slot: 'primary',
        role: 'body',
      },
      // flame trail: nested cones sweeping back and up
      {
        id: 'flame-1',
        shape: 'cone',
        size: [0.55, 0.9, 0.55],
        position: [0, 1.0, -0.75],
        rotation: [-70, 0, 0],
        slot: 'accent',
        role: 'detail',
      },
      {
        id: 'flame-2',
        shape: 'cone',
        size: [0.38, 0.7, 0.38],
        position: [0, 1.05, -0.62],
        rotation: [-70, 0, 0],
        slot: 'secondary',
        role: 'detail',
        parent: 'flame-1',
      },
      {
        id: 'flame-3',
        shape: 'cone',
        size: [0.22, 0.45, 0.22],
        position: [0, 1.1, -0.5],
        rotation: [-70, 0, 0],
        slot: 'primary',
        role: 'detail',
        parent: 'flame-2',
      },
      // headband with knot
      {
        id: 'sweatband',
        shape: 'torus',
        size: [0.95, 0.95, 0.12],
        position: [0, 1.15, 0],
        rotation: [90, 0, 0],
        slot: 'secondary',
        role: 'detail',
        parent: 'body',
      },
      {
        id: 'knot',
        shape: 'sphere',
        size: [0.14, 0.12, 0.12],
        position: [0.4, 1.28, 0.28],
        slot: 'secondary',
        role: 'detail',
        parent: 'body',
      },
      // determined eyes
      {
        id: 'eye-l',
        shape: 'sphere',
        size: [0.18, 0.22, 0.09],
        position: [-0.2, 0.95, 0.68],
        slot: 'eyeWhite',
        role: 'eye',
        parent: 'body',
      },
      {
        id: 'eye-r',
        shape: 'sphere',
        size: [0.18, 0.22, 0.09],
        position: [0.2, 0.95, 0.68],
        slot: 'eyeWhite',
        role: 'eye',
        parent: 'body',
      },
      {
        id: 'pupil-l',
        shape: 'sphere',
        size: [0.08, 0.1, 0.05],
        position: [-0.2, 0.95, 0.76],
        slot: 'pupil',
        role: 'pupil',
        parent: 'eye-l',
      },
      {
        id: 'pupil-r',
        shape: 'sphere',
        size: [0.08, 0.1, 0.05],
        position: [0.2, 0.95, 0.76],
        slot: 'pupil',
        role: 'pupil',
        parent: 'eye-r',
      },
      {
        id: 'brow-l',
        shape: 'roundedBox',
        size: [0.2, 0.05, 0.04],
        position: [-0.2, 1.14, 0.7],
        rotation: [0, 0, -18],
        slot: 'dark',
        role: 'detail',
        parent: 'body',
      },
      {
        id: 'brow-r',
        shape: 'roundedBox',
        size: [0.2, 0.05, 0.04],
        position: [0.2, 1.14, 0.7],
        rotation: [0, 0, 18],
        slot: 'dark',
        role: 'detail',
        parent: 'body',
      },
      // gritted smile
      {
        id: 'mouth',
        shape: 'roundedBox',
        size: [0.22, 0.08, 0.04],
        position: [0, 0.68, 0.68],
        slot: 'eyeWhite',
        role: 'detail',
        parent: 'body',
      },
      // tiny running legs mid-stride
      {
        id: 'leg-l',
        shape: 'capsule',
        size: [0.14, 0.3, 0.14],
        position: [-0.2, 0.2, 0.12],
        rotation: [25, 0, 10],
        slot: 'dark',
        role: 'limb',
      },
      {
        id: 'leg-r',
        shape: 'capsule',
        size: [0.14, 0.3, 0.14],
        position: [0.22, 0.22, -0.08],
        rotation: [-20, 0, -10],
        slot: 'dark',
        role: 'limb',
      },
      // speed lines
      {
        id: 'speed-1',
        shape: 'box',
        size: [0.03, 0.03, 0.3],
        position: [-0.55, 0.7, -0.5],
        slot: 'secondary',
        role: 'detail',
      },
      {
        id: 'speed-2',
        shape: 'box',
        size: [0.03, 0.03, 0.36],
        position: [0.55, 1.0, -0.55],
        slot: 'secondary',
        role: 'detail',
      },
      {
        id: 'speed-3',
        shape: 'box',
        size: [0.025, 0.025, 0.26],
        position: [-0.3, 1.3, -0.45],
        slot: 'secondary',
        role: 'detail',
        minPhase: 1,
      },
      // enrage: bigger flames + scorch cracks
      {
        id: 'flame-4',
        shape: 'cone',
        size: [0.6, 1.1, 0.6],
        position: [0, 0.95, -0.95],
        rotation: [-70, 0, 0],
        slot: 'accent',
        role: 'detail',
        minPhase: 2,
      },
      {
        id: 'scorch-1',
        shape: 'box',
        size: [0.03, 0.25, 0.02],
        position: [0.46, 0.62, 0.45],
        rotation: [0, 0, -24],
        slot: 'dark',
        role: 'crack',
        minPhase: 2,
      },
      {
        id: 'scorch-2',
        shape: 'box',
        size: [0.03, 0.2, 0.02],
        position: [-0.48, 0.95, 0.4],
        rotation: [0, 0, 18],
        slot: 'dark',
        role: 'crack',
        minPhase: 3,
      },
    ],
  },
];

/** Roster anchor: the week starting 2026-01-05 ran boss index 0. */
const ROSTER_EPOCH_WEEK = '2026-01-05';

const WEEK_MS = 7 * 86_400_000;

const weekStartMs = (weekKey: string): number => {
  const [y, m, d] = weekKey.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
};

/** The boss for a league week (YYYY-MM-DD, Monday), rotating weekly. */
export function bossForWeek(weekKey: string): RaidBoss {
  const weeks = Math.floor((weekStartMs(weekKey) - weekStartMs(ROSTER_EPOCH_WEEK)) / WEEK_MS);
  const index = ((weeks % RAID_BOSSES.length) + RAID_BOSSES.length) % RAID_BOSSES.length;
  return RAID_BOSSES[index]!;
}

/** Damage dealt by one session entry against a boss (weak spots count twice). */
export function raidDamage(
  points: number,
  pointsByWeakSpot: Record<string, number>,
  boss: Pick<RaidBoss, 'weakTo'>,
): number {
  let bonus = 0;
  for (const spot of boss.weakTo) {
    bonus += pointsByWeakSpot[spot] ?? 0;
  }
  return points + bonus;
}

const SLOTS: Slot[] = ['primary', 'secondary', 'accent', 'eyeWhite', 'pupil', 'dark'];

/**
 * Structural validation for a boss recipe: unique part ids, existing parents,
 * the part budget, palette coverage for every used slot and a defined idle.
 * Returns the list of violations (empty when the recipe is valid).
 */
export function validateBossRecipe(boss: RaidBoss): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const part of boss.parts) {
    if (ids.has(part.id)) problems.push(`duplicate part id ${part.id}`);
    ids.add(part.id);
    if (!SLOTS.includes(part.slot)) problems.push(`${part.id}: unknown slot ${part.slot}`);
    if (boss.palette[part.slot] === undefined) {
      problems.push(`${part.id}: slot ${part.slot} missing from palette`);
    }
    if (part.minPhase !== undefined && (part.minPhase < 0 || part.minPhase > 3)) {
      problems.push(`${part.id}: minPhase ${part.minPhase} out of range`);
    }
  }
  for (const part of boss.parts) {
    if (part.parent !== undefined && !ids.has(part.parent)) {
      problems.push(`${part.id}: parent ${part.parent} does not exist`);
    }
  }
  if (boss.parts.length > MAX_BOSS_PARTS) {
    problems.push(`${boss.parts.length} parts exceeds the ${MAX_BOSS_PARTS} budget`);
  }
  // cracks live on open body surface — never across eyes, pupils or the mouth
  const boxOf = (p: BossPart) => {
    // true rotated bounds: rotate the 8 corners by the part's euler angles
    const rot = p.rotation ?? ([0, 0, 0] as const);
    const rx = ((rot[0] ?? 0) * Math.PI) / 180;
    const ry = ((rot[1] ?? 0) * Math.PI) / 180;
    const rz = ((rot[2] ?? 0) * Math.PI) / 180;
    const [cx, sx, cy, sy, cz, sz] = [
      Math.cos(rx),
      Math.sin(rx),
      Math.cos(ry),
      Math.sin(ry),
      Math.cos(rz),
      Math.sin(rz),
    ];
    const lo = [Infinity, Infinity, Infinity] as number[];
    const hi = [-Infinity, -Infinity, -Infinity] as number[];
    for (const px of [-1, 1])
      for (const py of [-1, 1])
        for (const pz of [-1, 1]) {
          let [vx, vy, vz] = [(p.size[0] * px) / 2, (p.size[1] * py) / 2, (p.size[2] * pz) / 2];
          [vy, vz] = [vy * cx - vz * sx, vy * sx + vz * cx]; // rotate X
          [vx, vz] = [vx * cy + vz * sy, -vx * sy + vz * cy]; // rotate Y
          [vx, vy] = [vx * cz - vy * sz, vx * sz + vy * cz]; // rotate Z
          const w = [vx + p.position[0], vy + p.position[1], vz + p.position[2]];
          for (let i = 0; i < 3; i++) {
            lo[i] = Math.min(lo[i]!, w[i]!);
            hi[i] = Math.max(hi[i]!, w[i]!);
          }
        }
    return { lo, hi };
  };
  const face = boss.parts.filter(
    (p) => p.role === 'eye' || p.role === 'pupil' || (p.role === 'detail' && p.position[2] > 0),
  );
  for (const crack of boss.parts.filter((p) => p.role === 'crack')) {
    const c = boxOf(crack);
    for (const part of face) {
      const f = boxOf(part);
      const overlap =
        c.lo[0]! < f.hi[0]! &&
        c.hi[0]! > f.lo[0]! &&
        c.lo[1]! < f.hi[1]! &&
        c.hi[1]! > f.lo[1]! &&
        c.lo[2]! < f.hi[2]! &&
        c.hi[2]! > f.lo[2]!;
      if (overlap) {
        problems.push(`${crack.id}: crack overlaps ${part.id} — keep cracks off the face`);
      }
    }
  }
  if (!boss.idle || boss.idle.periodMs <= 0) problems.push('idle animation is missing');
  return problems;
}

/**
 * Bounds of a recipe in scene units: the axis-aligned box plus the padded
 * bounding sphere (worst-case idle bob/sway + the 1.15 hit squash). Clients
 * frame the camera from the projected box so no part is ever clipped. Pure —
 * shared by the web renderer and iOS.
 */
export interface BossBounds {
  center: [number, number, number];
  /** padded sphere radius — used for the wide defeated framing */
  radius: number;
  min: [number, number, number];
  max: [number, number, number];
  /**
   * projected half extents of the idle pose at `yaw` (radians about Y,
   * relative to `center`) — the silhouette the camera actually sees. Use
   * for tight framing; `radius` is the conservative fallback.
   */
  halfWidth: number;
  halfHeight: number;
}

const partRadius = (p: BossPart) =>
  0.5 * Math.sqrt(p.size[0] ** 2 + p.size[1] ** 2 + p.size[2] ** 2);

export function bossBounds(boss: RaidBoss, yaw = 0): BossBounds {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const part of boss.parts) {
    const r = partRadius(part);
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i]!, part.position[i]! - r);
      max[i] = Math.max(max[i]!, part.position[i]! + r);
    }
  }
  const center: [number, number, number] = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ];
  let radius = 0;
  let halfWidth = 0;
  let halfHeight = 0;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  for (const part of boss.parts) {
    const dx = part.position[0] - center[0];
    const dy = part.position[1] - center[1];
    const dz = part.position[2] - center[2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const r = partRadius(part);
    radius = Math.max(radius, d + r);
    // rotate the part centre about Y into camera space
    const px = dx * cos + dz * sin;
    halfWidth = Math.max(halfWidth, Math.abs(px) + r);
    halfHeight = Math.max(halfHeight, Math.abs(dy) + r);
  }
  // idle motion + hit squash (1.15 scale on the widest axis)
  radius += boss.idle.bob + boss.idle.sway * radius;
  radius *= 1.15;
  return { center, radius, min, max, halfWidth, halfHeight };
}

/**
 * Enrage phase for a damage/HP pair: 1/2/3 crossed at 75/50/25 % HP left.
 * Mirrors the server-side transition so clients can derive it when only the
 * bar values are at hand.
 */
export function raidPhaseFor(damage: number, maxHp: number): number {
  const left = maxHp > 0 ? 1 - damage / maxHp : 1;
  if (left <= 0.25) return 3;
  if (left <= 0.5) return 2;
  if (left <= 0.75) return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// Shared recipe geometry math (pure — no three/SceneKit dependencies)

export type Vec3 = [number, number, number];
/** row-major 3x3 */
export type Mat3 = [Vec3, Vec3, Vec3];

const DEG = Math.PI / 180;

/**
 * `rotation` degrees → matrix, XYZ intrinsic (three.js 'XYZ'): M = Rx·Ry·Rz.
 * Applied to column vectors.
 */
export function bossRotationMatrix(rotation?: Vec3): Mat3 {
  const [x, y, z] = rotation ?? [0, 0, 0];
  const cx = Math.cos(x * DEG),
    sx = Math.sin(x * DEG),
    cy = Math.cos(y * DEG),
    sy = Math.sin(y * DEG),
    cz = Math.cos(z * DEG),
    sz = Math.sin(z * DEG);
  const rx: Mat3 = [
    [1, 0, 0],
    [0, cx, -sx],
    [0, sx, cx],
  ];
  const ry: Mat3 = [
    [cy, 0, sy],
    [0, 1, 0],
    [-sy, 0, cy],
  ];
  const rz: Mat3 = [
    [cz, -sz, 0],
    [sz, cz, 0],
    [0, 0, 1],
  ];
  return mat3Mul(rx, mat3Mul(ry, rz));
}

function mat3Mul(a: Mat3, b: Mat3): Mat3 {
  const m = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ] as Mat3;
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) m[i]![j]! += a[i]![k]! * b[k]![j]!;
  return m;
}

function mat3Vec(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

function mat3Transpose(m: Mat3): Mat3 {
  return [
    [m[0][0], m[1][0], m[2][0]],
    [m[0][1], m[1][1], m[2][1]],
    [m[0][2], m[1][2], m[2][2]],
  ];
}

/** rotation matrix → XYZ-intrinsic euler degrees (inverse of bossRotationMatrix) */
function matrixToEulerXYZ(m: Mat3): Vec3 {
  // M = Rx·Ry·Rz  ⇒  m[0][2] = sin(y)
  const sy = Math.max(-1, Math.min(1, m[0][2]));
  const y = Math.asin(sy);
  const cy = Math.cos(y);
  let x: number, z: number;
  if (Math.abs(cy) > 1e-6) {
    x = Math.atan2(-m[1][2], m[2][2]);
    z = Math.atan2(-m[0][1], m[0][0]);
  } else {
    // gimbal lock: take x = 0 and solve z
    x = 0;
    z = Math.atan2(m[1][0], m[1][1]);
  }
  return [x / DEG, y / DEG, z / DEG];
}

/** A part's local axis-aligned bounding box before rotation/translation. */
export function bossPartLocalBounds(part: BossPart): { min: Vec3; max: Vec3 } {
  const [w, h, d] = part.size;
  switch (part.shape) {
    case 'torus': {
      const r = (w + d) / 2;
      return { min: [-r, -r, -d / 2], max: [r, r, d / 2] };
    }
    case 'capsule':
      return { min: [-w / 2, -h / 2, -w / 2], max: [w / 2, h / 2, w / 2] };
    default:
      return { min: [-w / 2, -h / 2, -d / 2], max: [w / 2, h / 2, d / 2] };
  }
}

/**
 * Rest-pose world transform of a part: R·v + position (positions and the
 * local AABB are in boss space — `parent` does not change the rest pose).
 */
export function bossPartWorldTransform(part: BossPart): { rot: Mat3; pos: Vec3 } {
  return { rot: bossRotationMatrix(part.rotation), pos: [...part.position] };
}

/**
 * World-space AABB of every part in the rest pose — what the parity tests on
 * both renderers compare against. No animation applied.
 */
export function bossPartWorldBounds(boss: RaidBoss): Record<string, { min: Vec3; max: Vec3 }> {
  const out: Record<string, { min: Vec3; max: Vec3 }> = {};
  for (const part of boss.parts) {
    const local = bossPartLocalBounds(part);
    const { rot, pos } = bossPartWorldTransform(part);
    const min: Vec3 = [Infinity, Infinity, Infinity];
    const max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < 8; i++) {
      const corner: Vec3 = [
        i & 1 ? local.max[0] : local.min[0],
        i & 2 ? local.max[1] : local.min[1],
        i & 4 ? local.max[2] : local.min[2],
      ];
      const w = mat3Vec(rot, corner);
      for (let j = 0; j < 3; j++) {
        const v = w[j]! + pos[j]!;
        min[j] = Math.min(min[j]!, v);
        max[j] = Math.max(max[j]!, v);
      }
    }
    out[part.id] = { min, max };
  }
  return out;
}

export interface BossLocalTransform {
  position: Vec3;
  /** degrees, XYZ intrinsic — feed straight into Euler 'XYZ'/SCN eulerAngles */
  rotation: Vec3;
}

/**
 * Node-local transforms for a nested scene graph: root parts keep their
 * authored transform; a child part's transform is the parent's inverse rest
 * transform composed with the child's rest transform. Attaching children this
 * way reproduces the boss-space rest pose exactly, while letting parents drive
 * their children's animation.
 */
export function bossLocalTransforms(boss: RaidBoss): Record<string, BossLocalTransform> {
  const byId = new Map(boss.parts.map((p) => [p.id, p]));
  const out: Record<string, BossLocalTransform> = {};
  for (const part of boss.parts) {
    const rot = bossRotationMatrix(part.rotation);
    if (!part.parent) {
      out[part.id] = { position: [...part.position], rotation: part.rotation ?? [0, 0, 0] };
      continue;
    }
    const parent = byId.get(part.parent);
    if (!parent) {
      out[part.id] = { position: [...part.position], rotation: part.rotation ?? [0, 0, 0] };
      continue;
    }
    // local = inv(Tp·Rp) · (Tc·Rc)  ⇒  pos = Rpᵀ·(pc − pp), rot = Rpᵀ·Rc
    const rp = bossRotationMatrix(parent.rotation);
    const inv = mat3Transpose(rp);
    const delta: Vec3 = [
      part.position[0] - parent.position[0],
      part.position[1] - parent.position[1],
      part.position[2] - parent.position[2],
    ];
    const localRot = mat3Mul(inv, rot);
    out[part.id] = {
      position: mat3Vec(inv, delta),
      rotation: matrixToEulerXYZ(localRot),
    };
  }
  return out;
}
