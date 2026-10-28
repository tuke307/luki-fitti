/**
 * Builds the system exercise catalog from two open datasets:
 *  - free-exercise-db (yuhonas, public domain / Unlicense): ~870 exercises with start/finish photos
 *  - wger.de (CC-BY-SA 4.0): German names/descriptions and extra machine variants
 *
 * Output:
 *  - src/catalog/core-records.ts — the dataset entries named by `src/catalog/overrides.ts` (their
 *    hand-written text is applied at runtime)
 *  - src/catalog/extended/records.ts — everything else, loaded on demand
 * Duplicates are skipped, and so are ids listed in `src/catalog/retired.ts` (a retired dataset
 * duplicate lends its German text to the exercise that replaced it).
 * Re-run with `yarn workspace @luki-fitti/common catalog:import`.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXERCISE_OVERRIDES } from '../src/catalog/overrides';
import { RETIRED_EXERCISE_IDS } from '../src/catalog/retired';
import type { ExerciseRecord } from '../src/catalog/types';
import { EquipmentType, ExerciseCategory, ExerciseType, MuscleGroup } from '../src/enums';
import { exerciseTokens } from '../src/utils/exercise-match.util';

const FEDB_URL =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
const FEDB_IMAGE_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises';
const WGER_URL = 'https://wger.de/api/v2/exerciseinfo/?limit=2000';
const WGER_EN = 2;
const WGER_DE = 1;

interface FedbExercise {
  id: string;
  name: string;
  mechanic: string | null;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  category: string;
  images: string[];
}

interface WgerExercise {
  id: number;
  category: { name: string };
  muscles: Array<{ name: string; name_en: string }>;
  muscles_secondary: Array<{ name: string; name_en: string }>;
  equipment: Array<{ name: string }>;
  images: Array<{ image: string; is_main: boolean; license_author: string | null }>;
  translations: Array<{ language: number; name: string; description: string }>;
}

const FEDB_MUSCLE: Record<string, MuscleGroup> = {
  abdominals: MuscleGroup.ABS_CORE,
  abductors: MuscleGroup.GLUTES,
  adductors: MuscleGroup.QUADRICEPS,
  biceps: MuscleGroup.BICEPS,
  calves: MuscleGroup.CALVES,
  chest: MuscleGroup.CHEST,
  forearms: MuscleGroup.FOREARMS,
  glutes: MuscleGroup.GLUTES,
  hamstrings: MuscleGroup.HAMSTRINGS,
  lats: MuscleGroup.BACK,
  'lower back': MuscleGroup.BACK,
  'middle back': MuscleGroup.BACK,
  neck: MuscleGroup.SHOULDERS,
  quadriceps: MuscleGroup.QUADRICEPS,
  shoulders: MuscleGroup.SHOULDERS,
  traps: MuscleGroup.BACK,
  triceps: MuscleGroup.TRICEPS,
};

const WGER_MUSCLE: Record<string, MuscleGroup> = {
  Glutes: MuscleGroup.GLUTES,
  Shoulders: MuscleGroup.SHOULDERS,
  Lats: MuscleGroup.BACK,
  Quads: MuscleGroup.QUADRICEPS,
  Chest: MuscleGroup.CHEST,
  Abs: MuscleGroup.ABS_CORE,
  Biceps: MuscleGroup.BICEPS,
  Triceps: MuscleGroup.TRICEPS,
  Trapezius: MuscleGroup.BACK,
  Hamstrings: MuscleGroup.HAMSTRINGS,
  'Obliquus externus abdominis': MuscleGroup.ABS_CORE,
  Calves: MuscleGroup.CALVES,
  Soleus: MuscleGroup.CALVES,
  Brachialis: MuscleGroup.BICEPS,
  'Serratus anterior': MuscleGroup.CHEST,
};

const WGER_CATEGORY_MUSCLE: Record<string, MuscleGroup> = {
  Legs: MuscleGroup.QUADRICEPS,
  Back: MuscleGroup.BACK,
  Arms: MuscleGroup.BICEPS,
  Shoulders: MuscleGroup.SHOULDERS,
  Abs: MuscleGroup.ABS_CORE,
  Chest: MuscleGroup.CHEST,
  Calves: MuscleGroup.CALVES,
};

const EQUIPMENT_EN: Record<EquipmentType, string> = {
  [EquipmentType.BARBELL]: 'Barbell',
  [EquipmentType.DUMBBELL]: 'Dumbbell',
  [EquipmentType.MACHINE]: 'Machine',
  [EquipmentType.CABLE]: 'Cable',
  [EquipmentType.BODYWEIGHT]: 'Bodyweight',
  [EquipmentType.KETTLEBELL]: 'Kettlebell',
  [EquipmentType.BAND]: 'Resistance band',
  [EquipmentType.EZ_BAR]: 'EZ-bar',
  [EquipmentType.SMITH_MACHINE]: 'Smith machine',
  [EquipmentType.CARDIO_MACHINE]: 'Cardio machine',
  [EquipmentType.FOAM_ROLLER]: 'Foam roller',
  [EquipmentType.NONE]: 'Equipment-free',
  [EquipmentType.OTHER]: 'Accessory',
};

const EQUIPMENT_DE: Record<EquipmentType, string> = {
  [EquipmentType.BARBELL]: 'Langhantel',
  [EquipmentType.DUMBBELL]: 'Kurzhantel',
  [EquipmentType.MACHINE]: 'Maschine',
  [EquipmentType.CABLE]: 'Kabelzug',
  [EquipmentType.BODYWEIGHT]: 'Körpergewicht',
  [EquipmentType.KETTLEBELL]: 'Kettlebell',
  [EquipmentType.BAND]: 'Widerstandsband',
  [EquipmentType.EZ_BAR]: 'SZ-Stange',
  [EquipmentType.SMITH_MACHINE]: 'Multipresse',
  [EquipmentType.CARDIO_MACHINE]: 'Cardiogerät',
  [EquipmentType.FOAM_ROLLER]: 'Faszienrolle',
  [EquipmentType.NONE]: 'ohne Geräte',
  [EquipmentType.OTHER]: 'Hilfsmittel',
};

const MUSCLE_EN: Record<MuscleGroup, string> = {
  [MuscleGroup.CHEST]: 'chest',
  [MuscleGroup.BACK]: 'back',
  [MuscleGroup.SHOULDERS]: 'shoulders',
  [MuscleGroup.BICEPS]: 'biceps',
  [MuscleGroup.TRICEPS]: 'triceps',
  [MuscleGroup.FOREARMS]: 'forearms',
  [MuscleGroup.QUADRICEPS]: 'quadriceps',
  [MuscleGroup.HAMSTRINGS]: 'hamstrings',
  [MuscleGroup.GLUTES]: 'glutes',
  [MuscleGroup.CALVES]: 'calves',
  [MuscleGroup.ABS_CORE]: 'core',
  [MuscleGroup.HIP_FLEXORS]: 'hip flexors',
  [MuscleGroup.FULL_BODY]: 'whole body',
};

const MUSCLE_DE: Record<MuscleGroup, string> = {
  [MuscleGroup.CHEST]: 'die Brust',
  [MuscleGroup.BACK]: 'den Rücken',
  [MuscleGroup.SHOULDERS]: 'die Schultern',
  [MuscleGroup.BICEPS]: 'den Bizeps',
  [MuscleGroup.TRICEPS]: 'den Trizeps',
  [MuscleGroup.FOREARMS]: 'die Unterarme',
  [MuscleGroup.QUADRICEPS]: 'die Oberschenkelvorderseite',
  [MuscleGroup.HAMSTRINGS]: 'die Oberschenkelrückseite',
  [MuscleGroup.GLUTES]: 'den Po',
  [MuscleGroup.CALVES]: 'die Waden',
  [MuscleGroup.ABS_CORE]: 'den Rumpf',
  [MuscleGroup.HIP_FLEXORS]: 'die Hüftbeuger',
  [MuscleGroup.FULL_BODY]: 'den ganzen Körper',
};

/** Hand-written German names for imported exercises the user explicitly asked for. */
const DE_NAME_OVERRIDES: Record<string, string> = {
  'smith-machine-overhead-shoulder-press': 'Schulterdrücken an der Multipresse',
  'smith-machine-bench-press': 'Bankdrücken an der Multipresse',
  'smith-machine-incline-bench-press': 'Schrägbankdrücken an der Multipresse',
  'smith-machine-squat': 'Kniebeuge an der Multipresse',
  'smith-machine-calf-raise': 'Wadenheben an der Multipresse',
  'smith-machine-upright-row': 'Aufrechtes Rudern an der Multipresse',
  'smith-machine-shrug': 'Shrugs an der Multipresse',
  'rotary-torso-machine': 'Torso-Rotation-Maschine',
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function tokenKey(name: string): string {
  return exerciseTokens(name).sort().join(' ');
}

/** Near-duplicate check: same tokens, or one name's tokens almost fully contained in the other. */
function isNearDuplicate(name: string, known: string[][]): boolean {
  const a = new Set(exerciseTokens(name));
  if (a.size === 0) return true;
  return known.some((tokens) => {
    const b = new Set(tokens);
    const shared = [...a].filter((t) => b.has(t)).length;
    return shared / Math.max(a.size, b.size) >= 0.75;
  });
}

const SIDE_VARIANT = /\b(left|right|links|rechts)\b/i;
const STRETCH_NAME = /stretch|dehnung|mobility|mobilisation/i;
/** English names with accents/umlauts are usually untranslated (German, Spanish …) entries. */
const NON_ENGLISH_CHARS = /[^\x20-\x7E]/;
/** Trailing abbreviations some wger authors add ("Bodyweight Squat HD", "Snatch OL"). */
function cleanName(name: string): string {
  return name
    .replace(/\s+\b(HD|OL|KH|LH)\b$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** wger descriptions are HTML: turn list items / paragraphs into plain steps. */
function htmlToSteps(html: string): string[] {
  return html
    .replace(/<\/(li|p|br)\s*>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 2)
    .slice(0, 8);
}

function describe(equipment: EquipmentType, primary: MuscleGroup, secondary: MuscleGroup[]) {
  const assistEn = secondary.length
    ? `, with ${secondary.map((m) => MUSCLE_EN[m]).join(', ')} assisting`
    : '';
  const assistDe = secondary.length
    ? `, unterstützt von ${secondary
        .map((m) => MUSCLE_DE[m].replace(/^(die|den) /, ''))
        .join(', ')}`
    : '';
  return {
    en: `${EQUIPMENT_EN[equipment]} exercise for the ${MUSCLE_EN[primary]}${assistEn}.`,
    de: `Übung (${EQUIPMENT_DE[equipment]}) für ${MUSCLE_DE[primary]}${assistDe}.`,
  };
}

function fedbEquipment(e: FedbExercise): EquipmentType {
  if (/smith/i.test(e.name)) return EquipmentType.SMITH_MACHINE;
  switch (e.equipment) {
    case 'barbell':
      return EquipmentType.BARBELL;
    case 'dumbbell':
      return EquipmentType.DUMBBELL;
    case 'cable':
      return EquipmentType.CABLE;
    case 'machine':
      return EquipmentType.MACHINE;
    case 'body only':
      return EquipmentType.BODYWEIGHT;
    case 'kettlebells':
      return EquipmentType.KETTLEBELL;
    case 'bands':
      return EquipmentType.BAND;
    case 'e-z curl bar':
      return EquipmentType.EZ_BAR;
    case 'foam roll':
      return EquipmentType.FOAM_ROLLER;
    case null:
      return EquipmentType.NONE;
    default:
      return EquipmentType.OTHER;
  }
}

function wgerEquipment(e: WgerExercise, enName: string, deName: string): EquipmentType {
  const names = `${enName} ${deName}`;
  if (/smith|multipresse/i.test(names)) return EquipmentType.SMITH_MACHINE;
  const eq = e.equipment.map((q) => q.name);
  if (eq.includes('Cable machine')) return EquipmentType.CABLE;
  if (eq.includes('Barbell')) return EquipmentType.BARBELL;
  if (eq.includes('SZ-Bar')) return EquipmentType.EZ_BAR;
  if (eq.includes('Dumbbell')) return EquipmentType.DUMBBELL;
  if (eq.includes('Kettlebell')) return EquipmentType.KETTLEBELL;
  if (eq.includes('Resistance band')) return EquipmentType.BAND;
  if (/machine|maschine|gerät/i.test(names)) return EquipmentType.MACHINE;
  return EquipmentType.BODYWEIGHT;
}

function categoryFor(equipment: EquipmentType, compound: boolean, stretch: boolean) {
  if (stretch) return ExerciseCategory.STRETCH;
  if (equipment === EquipmentType.MACHINE || equipment === EquipmentType.SMITH_MACHINE) {
    return ExerciseCategory.MACHINE;
  }
  if (equipment === EquipmentType.CABLE) return ExerciseCategory.CABLE;
  if (equipment === EquipmentType.BODYWEIGHT) return ExerciseCategory.BODYWEIGHT;
  return compound ? ExerciseCategory.COMPOUND : ExerciseCategory.ISOLATION;
}

function uniqueMuscles(primary: MuscleGroup, list: Array<MuscleGroup | undefined>): MuscleGroup[] {
  return Array.from(new Set(list.filter((m): m is MuscleGroup => !!m && m !== primary)));
}

async function main() {
  const [fedb, wgerPage] = (await Promise.all([
    fetch(FEDB_URL).then((r) => r.json()),
    fetch(WGER_URL).then((r) => r.json()),
  ])) as [FedbExercise[], { results: WgerExercise[] }];

  const overrides = Object.entries(EXERCISE_OVERRIDES);
  const fedbTargets = new Map(
    overrides.flatMap(([id, o]) => ('fedb' in o.source ? [[o.source.fedb, id] as const] : [])),
  );
  const wgerTargets = new Map(
    overrides.flatMap(([id, o]) => ('wger' in o.source ? [[o.source.wger, id] as const] : [])),
  );
  const overrideNames = overrides.map(([, o]) => o.name);
  const isRetired = (slug: string) => `ex-${slug}` in RETIRED_EXERCISE_IDS;

  // wger entries with both an English and a German name, indexed for matching.
  const wger = wgerPage.results
    .filter((w) => w.category.name !== 'Cardio' || wgerTargets.has(w.id))
    .map((w) => {
      const en = w.translations.find((t) => t.language === WGER_EN);
      const de = w.translations.find((t) => t.language === WGER_DE);
      return en && de ? { w, en, de } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  const wgerByName = new Map(wger.map((x) => [x.en.name.trim().toLowerCase(), x]));
  const wgerByTokens = new Map(wger.map((x) => [tokenKey(x.en.name), x]));
  const usedWger = new Set<number>();

  const out: ExerciseRecord[] = [];
  /** Retired duplicates: their German text may fill gaps of the exercise that replaced them. */
  const retired: ExerciseRecord[] = [];
  const seenSlugs = new Set([
    ...overrides.map(([id]) => id.replace(/^ex-/, '')),
    ...Object.keys(RETIRED_EXERCISE_IDS).map((id) => id.replace(/^ex-/, '')),
  ]);
  const seenTokens = new Set(overrideNames.map(tokenKey));
  const accept = (record: ExerciseRecord) => (isRetired(record.slug) ? retired : out).push(record);

  for (const e of fedb) {
    const targetId = fedbTargets.get(e.id);
    if (!targetId && (e.category === 'cardio' || e.category === 'strongman')) continue;
    const slug = slugify(e.id.replace(/_/g, '-'));
    if (targetId && `ex-${slug}` !== targetId) {
      throw new Error(`override ${targetId} points at free-exercise-db ${e.id} (ex-${slug})`);
    }
    const tokens = tokenKey(e.name);
    if (!targetId && !isRetired(slug) && (seenSlugs.has(slug) || seenTokens.has(tokens))) continue;
    const primary = FEDB_MUSCLE[e.primaryMuscles[0] ?? ''] ?? (targetId && MuscleGroup.FULL_BODY);
    if (!primary) continue;

    const equipment = fedbEquipment(e);
    const stretch = e.category === 'stretching';
    const secondary = uniqueMuscles(
      primary,
      e.secondaryMuscles.map((m) => FEDB_MUSCLE[m]),
    );
    // Override targets carry their own German text; leave their wger twin to the wger pass.
    const match = targetId
      ? undefined
      : (wgerByName.get(e.name.trim().toLowerCase()) ?? wgerByTokens.get(tokens));
    if (match) usedWger.add(match.w.id);
    const text = describe(equipment, primary, secondary);
    const deSteps = match ? htmlToSteps(match.de.description) : [];

    accept({
      id: `ex-${slug}`,
      slug,
      name: e.name.trim(),
      description: text.en,
      instructions: e.instructions.map((s) => s.trim()).filter(Boolean),
      category: categoryFor(equipment, e.mechanic === 'compound', stretch),
      exerciseType: stretch ? ExerciseType.STRETCHING : ExerciseType.STRENGTH,
      primaryMuscleGroup: primary,
      secondaryMuscleGroups: secondary,
      equipment,
      tags: Array.from(
        new Set([e.name.toLowerCase(), ...(match ? [match.de.name.toLowerCase()] : [])]),
      ),
      media: e.images.slice(0, 2).map((img, idx) => ({
        id: `${slug}-frame-${idx}`,
        mediaType: 'IMAGE' as const,
        url: `${FEDB_IMAGE_BASE}/${img}`,
        caption: idx === 0 ? 'Start position' : 'Finish position',
        attribution: 'Free Exercise DB (Public Domain)',
        license: 'Unlicense',
      })),
      source: 'free-exercise-db',
      de: {
        name: match?.de.name.trim() ?? null,
        description: text.de,
        instructions: deSteps.length > 0 ? deSteps : null,
      },
    });
    seenSlugs.add(slug);
    // Override targets are already represented by their hand-written name.
    if (!targetId) seenTokens.add(tokens);
  }

  // wger-only exercises (mostly machine variants), with German text and wger attribution.
  const knownTokens = [
    ...overrideNames,
    ...out.filter((e) => !(e.id in EXERCISE_OVERRIDES)).map((e) => e.name),
    ...retired.map((e) => e.name),
  ].map((n) => exerciseTokens(n));
  for (const { w, en, de } of wger) {
    const targetId = wgerTargets.get(w.id);
    if (usedWger.has(w.id) && !targetId) continue;
    const enName = cleanName(en.name);
    const deName = cleanName(de.name);
    const slug = slugify(enName);
    if (targetId && `ex-${slug}` !== targetId) {
      throw new Error(`override ${targetId} points at wger ${w.id} (ex-${slug})`);
    }
    if (!targetId) {
      // Skip side-specific duplicates, untranslated entries and near-duplicates of what we have.
      if (SIDE_VARIANT.test(enName) || NON_ENGLISH_CHARS.test(enName) || enName === deName)
        continue;
      if (htmlToSteps(en.description).length === 0) continue;
      if (!isRetired(slug) && isNearDuplicate(enName, knownTokens)) continue;
      const tokens = tokenKey(enName);
      if (!slug || (!isRetired(slug) && (seenSlugs.has(slug) || seenTokens.has(tokens)))) continue;
      knownTokens.push(exerciseTokens(enName));
    }
    const primary =
      WGER_MUSCLE[w.muscles[0]?.name_en || w.muscles[0]?.name || ''] ??
      WGER_CATEGORY_MUSCLE[w.category.name] ??
      (targetId && MuscleGroup.FULL_BODY);
    if (!primary) continue;
    const equipment = wgerEquipment(w, enName, deName);
    const stretch = STRETCH_NAME.test(`${enName} ${deName}`);
    const secondary = uniqueMuscles(
      primary,
      [...w.muscles.slice(1), ...w.muscles_secondary].map((m) => WGER_MUSCLE[m.name_en || m.name]),
    );
    const text = describe(equipment, primary, secondary);
    const enSteps = htmlToSteps(en.description);
    const deSteps = htmlToSteps(de.description);
    const images = [...w.images].sort((a, b) => Number(b.is_main) - Number(a.is_main));

    accept({
      id: `ex-${slug}`,
      slug,
      name: enName,
      description: text.en,
      instructions: enSteps,
      category: categoryFor(equipment, w.muscles.length + w.muscles_secondary.length > 2, stretch),
      exerciseType: stretch ? ExerciseType.STRETCHING : ExerciseType.STRENGTH,
      primaryMuscleGroup: primary,
      secondaryMuscleGroups: secondary,
      equipment,
      tags: Array.from(new Set([enName.toLowerCase(), deName.toLowerCase()])),
      media: images.slice(0, 1).map((img, idx) => ({
        id: `${slug}-wger-${idx}`,
        mediaType: 'IMAGE' as const,
        url: img.image,
        caption: enName,
        attribution: `wger.de${img.license_author ? ` · ${img.license_author}` : ''}`,
        license: 'CC-BY-SA 4.0',
      })),
      source: 'wger',
      de: {
        name: deName,
        description: text.de,
        instructions: deSteps.length > 0 ? deSteps : null,
      },
    });
    seenSlugs.add(slug);
    seenTokens.add(tokenKey(enName));
  }

  for (const e of out) {
    const override = DE_NAME_OVERRIDES[e.slug];
    if (override) {
      e.de.name = override;
      e.tags = Array.from(new Set([...e.tags, override.toLowerCase()]));
    }
  }

  const byId = new Map(out.map((e) => [e.id, e]));
  for (const dup of retired) {
    const target = byId.get(RETIRED_EXERCISE_IDS[dup.id]!);
    if (!target || target.id in EXERCISE_OVERRIDES) continue;
    if (!target.de.name && dup.de.name) target.de.name = dup.de.name;
    target.de.instructions ??= dup.de.instructions;
    target.tags = Array.from(new Set([...target.tags, ...dup.tags]));
  }

  const missing = overrides.map(([id]) => id).filter((id) => !byId.has(id));
  if (missing.length > 0) throw new Error(`override targets not found: ${missing.join(', ')}`);

  out.sort((a, b) => a.slug.localeCompare(b.slug));
  const core = out.filter((e) => e.id in EXERCISE_OVERRIDES);
  const extended = out.filter((e) => !(e.id in EXERCISE_OVERRIDES));
  const write = (path: string, name: string, records: ExerciseRecord[]) =>
    writeFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), path),
      [
        '// Generated by scripts/import-catalog.ts — do not edit by hand.',
        '// Sources: free-exercise-db (Unlicense) and wger.de (CC-BY-SA 4.0).',
        `import type { ExerciseRecord } from '${path.includes('extended') ? '../types' : './types'}';`,
        '',
        `export const ${name}: ExerciseRecord[] = ${JSON.stringify(records)};`,
        '',
      ].join('\n'),
    );
  write('../src/catalog/core-records.ts', 'CORE_EXERCISE_RECORDS', core);
  write('../src/catalog/extended/records.ts', 'EXTENDED_EXERCISE_RECORDS', extended);
  const bySource = out.reduce<Record<string, number>>((acc, e) => {
    acc[e.source] = (acc[e.source] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `wrote ${core.length} core + ${extended.length} extended exercises`,
    bySource,
    `German names (extended): ${extended.filter((e) => e.de.name).length}`,
  );
}

void main();
