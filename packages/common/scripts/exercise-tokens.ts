/**
 * Tokenizer the importer uses to skip duplicate dataset entries. Frozen on purpose: changing it
 * changes which entries get imported (and so which exercise ids exist). The app's search lives in
 * `src/utils/exercise-search.util.ts`.
 *
 * German and English gym words mapped onto shared canonical tokens, so "Sitzendes Schulterdrücken
 * Multipresse" and "Seated Smith Machine Shoulder Press" end up with the same tokens.
 * Compound German words expand to several tokens.
 */
const SYNONYMS: Record<string, string[]> = {
  // equipment
  multipresse: ['smith'],
  smith: ['smith'],
  kabelzug: ['cable'],
  kabel: ['cable'],
  seilzug: ['cable'],
  cable: ['cable'],
  kurzhantel: ['dumbbell'],
  kurzhanteln: ['dumbbell'],
  dumbbell: ['dumbbell'],
  dumbbells: ['dumbbell'],
  langhantel: ['barbell'],
  barbell: ['barbell'],
  sz: ['ez'],
  ez: ['ez'],
  maschine: ['machine'],
  geraet: ['machine'],
  machine: ['machine'],
  lever: ['machine'],
  leverage: ['machine'],
  band: ['band'],
  baender: ['band'],
  // positions
  sitzend: ['seated'],
  sitzendes: ['seated'],
  sitzende: ['seated'],
  sitzender: ['seated'],
  seated: ['seated'],
  stehend: ['standing'],
  stehendes: ['standing'],
  standing: ['standing'],
  liegend: ['lying'],
  lying: ['lying'],
  schraeg: ['incline'],
  schraegbank: ['incline', 'bench'],
  incline: ['incline'],
  negativ: ['decline'],
  decline: ['decline'],
  einarmig: ['single'],
  single: ['single'],
  'one-arm': ['single'],
  // movements
  schulterdruecken: ['shoulder', 'press'],
  ueberkopfdruecken: ['overhead', 'press'],
  bankdruecken: ['bench', 'press'],
  brustpresse: ['chest', 'press'],
  druecken: ['press'],
  presse: ['press'],
  press: ['press'],
  rudern: ['row'],
  row: ['row'],
  rows: ['row'],
  latzug: ['lat', 'pulldown'],
  pulldown: ['pulldown'],
  klimmzug: ['pullup'],
  klimmzuege: ['pullup'],
  pullup: ['pullup'],
  pullups: ['pullup'],
  beinpresse: ['leg', 'press'],
  beinstrecker: ['leg', 'extension'],
  beinbeuger: ['leg', 'curl'],
  kniebeuge: ['squat'],
  kniebeugen: ['squat'],
  squat: ['squat'],
  kreuzheben: ['deadlift'],
  deadlift: ['deadlift'],
  seitheben: ['lateral', 'raise'],
  frontheben: ['front', 'raise'],
  heben: ['raise'],
  raise: ['raise'],
  raises: ['raise'],
  wadenheben: ['calf', 'raise'],
  waden: ['calf'],
  calf: ['calf'],
  bizeps: ['biceps'],
  bizepscurl: ['biceps', 'curl'],
  biceps: ['biceps'],
  bicep: ['biceps'],
  trizeps: ['triceps'],
  triceps: ['triceps'],
  tricep: ['triceps'],
  curl: ['curl'],
  curls: ['curl'],
  fliegende: ['fly'],
  fly: ['fly'],
  flyes: ['fly'],
  flys: ['fly'],
  butterfly: ['fly', 'machine'],
  // body parts
  schulter: ['shoulder'],
  schultern: ['shoulder'],
  shoulder: ['shoulder'],
  shoulders: ['shoulder'],
  brust: ['chest'],
  chest: ['chest'],
  ruecken: ['back'],
  back: ['back'],
  bein: ['leg'],
  beine: ['leg'],
  leg: ['leg'],
  legs: ['leg'],
  bauch: ['abs'],
  abs: ['abs'],
  rumpf: ['torso'],
  torso: ['torso'],
  oberkoerper: ['torso'],
  // rotation
  rotation: ['rotation'],
  rotations: ['rotation'],
  drehung: ['rotation'],
  rumpfdrehung: ['torso', 'rotation'],
  rumpfrotation: ['torso', 'rotation'],
  twist: ['rotation'],
  twists: ['rotation'],
};

/** Filler words that say nothing about the exercise. */
const STOP_WORDS = new Set([
  'an',
  'am',
  'der',
  'die',
  'das',
  'mit',
  'auf',
  'im',
  'in',
  'und',
  'the',
  'with',
  'on',
  'at',
  'a',
  'of',
  'zur',
  'zum',
  'for',
  'von',
  'exercise',
  'uebung',
]);

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Canonical tokens of a free-text exercise name. */
export function exerciseTokens(text: string): string[] {
  const words = normalize(text)
    .split(/[^a-z0-9-]+/)
    .flatMap((w) => (SYNONYMS[w] ? [w] : w.split('-')))
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
  const tokens = words.flatMap((w) => SYNONYMS[w] ?? [w]);
  return Array.from(new Set(tokens));
}
