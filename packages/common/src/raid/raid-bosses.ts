import { MuscleGroup } from '../enums';

/**
 * A muscle group a boss is weak to. Besides the real `MuscleGroup` values the
 * two pseudo spots 'CARDIO' and 'STRETCHING' cover non-strength work; they are
 * the keys `computeSessionEffortPoints` uses in `pointsByWeakSpot`.
 */
export type WeakSpot = MuscleGroup | 'CARDIO' | 'STRETCHING';

/** Body slots a boss part can be coloured in (part B fills the recipes). */
export type Slot = 'body' | 'accent' | 'belly' | 'eye' | 'pupil' | 'dark' | 'aura' | 'crack';

export interface BossPart {
  id: string;
  slot: Slot;
  /** Primitive shape tag interpreted by each renderer (sphere, box, …). */
  shape: string;
  params: Record<string, number>;
}

export interface RaidBoss {
  slug: string;
  name: { en: string; de: string };
  lore: { en: string; de: string };
  weakTo: WeakSpot[];
  /** Rendering recipes; filled in part B, absent until then. */
  palette?: Record<Slot, string>;
  enragedPalette?: Partial<Record<Slot, string>>;
  parts?: BossPart[];
  idle?: { bob: number; sway: number; periodMs: number };
}

/**
 * The 8-boss weekly rotation. `weakTo` maps onto real `MuscleGroup` values plus
 * the CARDIO/STRETCHING pseudo spots (see `WeakSpot`).
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
  },
  {
    slug: 'iron-back-golem',
    name: { en: 'Iron Back Golem', de: 'Eiserner Rückengolem' },
    lore: {
      en: 'Forged from every barbell ever dropped without control.',
      de: 'Geschmiedet aus jeder Langhantel, die je unkontrolliert fiel.',
    },
    weakTo: [MuscleGroup.BACK],
  },
  {
    slug: 'chest-hydra',
    name: { en: 'Chest Hydra', de: 'Brust-Hydra' },
    lore: {
      en: 'Cut one head off and it benches two more.',
      de: 'Schlag einen Kopf ab und es drückt zwei weitere.',
    },
    weakTo: [MuscleGroup.CHEST, MuscleGroup.TRICEPS],
  },
  {
    slug: 'shoulder-wyvern',
    name: { en: 'Shoulder Wyvern', de: 'Schulter-Wyvern' },
    lore: {
      en: 'Its wings are delts. Its delts are also wings.',
      de: 'Seine Flügel sind Deltas. Seine Deltas sind auch Flügel.',
    },
    weakTo: [MuscleGroup.SHOULDERS],
  },
  {
    slug: 'core-kraken',
    name: { en: 'Core Kraken', de: 'Rumpf-Krake' },
    lore: {
      en: 'Six tentacles, zero excuses. Planks are its only fear.',
      de: 'Sechs Tentakel, null Ausreden. Planks sind seine einzige Angst.',
    },
    weakTo: [MuscleGroup.ABS_CORE, MuscleGroup.HIP_FLEXORS],
  },
  {
    slug: 'arm-cyclops',
    name: { en: 'Arm Cyclops', de: 'Arm-Zyklop' },
    lore: {
      en: 'One eye, two pythons. Curls for the girls — and for the raid.',
      de: 'Ein Auge, zwei Pythons. Curls für den Raid.',
    },
    weakTo: [MuscleGroup.BICEPS, MuscleGroup.TRICEPS, MuscleGroup.FOREARMS],
  },
  {
    slug: 'mobility-phantom',
    name: { en: 'Mobility Phantom', de: 'Mobilitäts-Phantom' },
    lore: {
      en: 'It slipped through every stretching routine you skipped.',
      de: 'Es schlüpfte durch jede Dehneinheit, die du ausgelassen hast.',
    },
    weakTo: ['STRETCHING'],
  },
  {
    slug: 'cardio-comet',
    name: { en: 'Cardio Comet', de: 'Cardio-Komet' },
    lore: {
      en: 'It never stops moving. Neither should you.',
      de: 'Es bleibt nie stehen. Du auch nicht.',
    },
    weakTo: ['CARDIO'],
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
