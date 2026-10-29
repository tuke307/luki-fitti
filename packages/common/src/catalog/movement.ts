import {
  ExerciseMechanic,
  ExerciseType,
  Laterality,
  MovementPattern,
  MuscleGroup,
  TargetRegion,
} from '../enums';

/** Movement metadata of an exercise; `movementPattern: null` when it is not known. */
export interface MovementProfile {
  movementPattern: MovementPattern | null;
  laterality: Laterality | null;
  mechanic: ExerciseMechanic | null;
  targetRegions: TargetRegion[];
}

export interface MovementProfileInput {
  name: string;
  deName?: string | null;
  exerciseType: `${ExerciseType}`;
  primaryMuscleGroup: `${MuscleGroup}`;
}

const P = MovementPattern;
const R = TargetRegion;

const ISOLATION_PATTERNS = new Set<MovementPattern>([
  P.SHOULDER_EXTENSION,
  P.FLY,
  P.LATERAL_RAISE,
  P.FRONT_RAISE,
  P.REAR_DELT,
  P.SHRUG,
  P.SHOULDER_ROTATION,
  P.ELBOW_FLEXION,
  P.ELBOW_EXTENSION,
  P.WRIST,
  P.KNEE_EXTENSION,
  P.KNEE_FLEXION,
  P.HIP_EXTENSION,
  P.HIP_ABDUCTION,
  P.HIP_ADDUCTION,
  P.HIP_FLEXION,
  P.CALF_RAISE,
  P.BACK_EXTENSION,
  P.CORE_FLEXION,
  P.ANTI_EXTENSION,
  P.LATERAL_FLEXION,
  P.ROTATION,
]);

/** Whether a movement pattern works several joints at once. */
export function movementMechanic(pattern: MovementPattern): ExerciseMechanic {
  return ISOLATION_PATTERNS.has(pattern) ? ExerciseMechanic.ISOLATION : ExerciseMechanic.COMPOUND;
}

/** Movements that are never a strength alternative: plyometrics, drills, holds, mobility. */
const NO_PATTERN =
  /jump|\bhops?\b|hop-|\bbound\b|sprint|skipping|\bskip\b|burpee|throw|slam|shuffle|carioca|jumping jack|hampelmann|mountain climber|bergsteiger|battling rope|drill|neck (circles|half|resistance|exercise|tilts)|nacken|head (tilts|turns|harness)|kopf (neigen|drehen)|chest push|chin tuck|schluck|arm circles|armkreisen|shoulder rotation|schulter(rotation|drehung)|high knees|knieheben im stand|squat thrust|hocksprung|leg swing|beinschwingen|turkish get-up|halo|pirate ship|planche|front lever|handstand gegen|wall handstand|frog stand|froschstand|support hold|bar hold|isometria|stützhalt|halten am barren|muscle up|muscle-up|rope climb|sledgehammer|hang(ing)? (on )?(fingerboard|sloper)|fingerboard \d|sloper|dislocates|pendular|incline shoulder raise|shoulder press up|balance|arabesque|pancake(?! good)|toe touch|leg wheel|beinkreisen|ice cream|scorpion|wall slides|wandgleiten|car drivers|cocoons|reach ups|spider crawl|bear (crawl|walk)|\bcrawl\b/;

const UNILATERAL =
  /one[- ]?arm|one[- ]?leg|one[- ]handed|single[- ]?arm|single[- ]?leg|single dumbbell|\bunilateral|einarmig|einbeinig|einhändig|\balternat(e|ing)\b|abwechselnd|wechselseitig|\b1 leg\b|pistol|archer|split squat|\bsplit\b|lunge|ausfallschritt|step[- ]?ups?\b|steigungen|bulgarian|bulgarische|cossack|kosaken|side squat|concentration|konzentration|cross[- ]body|über kreuz|gorilla row|gorilla-rudern|see-?saw|kickback|kick back|donkey kick|glute kick|clamshell|side[- ]lying hip|copenhagen|side plank|seitstütz|side bridge|side bend|seitneigung|side hold|oberkörperbeugen|trunk flexion|side jackknife|seitliches klappmesser|lateral lunge/;

interface Rule {
  pattern: MovementPattern;
  test: (text: string, muscle: `${MuscleGroup}`) => boolean;
}

const rx =
  (re: RegExp) =>
  (text: string): boolean =>
    re.test(text);

/** First match wins, so the more specific rules come first. */
const RULES: Rule[] = [
  {
    pattern: P.OLYMPIC_LIFT,
    test: (t) =>
      !/shrug|deadlift|kreuzheben|pull\b(?!-)|clean grip/.test(t) &&
      /\bcleans?\b|snatch|\bjerk\b|umsetzen|reißen|stoßen|thruster|squat to press|clean and press/.test(
        t,
      ),
  },
  { pattern: P.SHRUG, test: rx(/shrug|schulterzucken/) },
  { pattern: P.CALF_RAISE, test: rx(/calf|waden|plantarflexion/) },
  {
    pattern: P.HINGE,
    test: rx(
      /deadlift|kreuzheben|\brdl\b|good ?morning|pull[- ]?through|rack pull|hip hinge|kettlebell swing|\bswings?\b|snatch pull|clean pull/,
    ),
  },
  {
    pattern: P.SHOULDER_EXTENSION,
    test: (t, m) =>
      /pull[- ]?overs?\b|pull-over|überz(u|ü)g|straight[- ]arm (pull ?down|pulldown)|gestreckte(n|m)? arm|gesteckten armen/.test(
        t,
      ) ||
      (m === MuscleGroup.BACK && /pushdown/.test(t)),
  },
  {
    pattern: P.REAR_DELT,
    test: rx(
      /face ?pull|rear[- ]?delt|reverse[- ]fl(y|ie|ye)|back fl(y|ie|ye)|reverse butterfly|pull[- ]?aparts?|rear lateral|bent[- ]over (dumbbell |low-pulley )?(lateral|side lateral|deltoid)|vorgebeugtes seitheben|ytwl|\by-raise|t\/y\/i|scapular retraction|schulterblatt-retraktion|schulter-rückzieher|trap-3|reverse flye|bent high pull|hyper y w/,
    ),
  },
  {
    pattern: P.SHOULDER_ROTATION,
    test: (t) =>
      !/curl|tri(ceps?|zeps)/.test(t) &&
      /external rotation|internal rotation|außenrotation|innenrotation|rotator|cuban press/.test(t),
  },
  {
    pattern: P.UPRIGHT_ROW,
    test: rx(/upright|aufrechtes rudern|rudern aufrecht|high pull\b|row to neck/),
  },
  {
    pattern: P.CORE_FLEXION,
    test: rx(/crunch|sit[- ]?ups?\b|situp/),
  },
  {
    pattern: P.HORIZONTAL_PULL,
    test: rx(/australian pull|inverted row|umgekehrtes rudern/),
  },
  {
    pattern: P.VERTICAL_PULL,
    test: (t, m) =>
      m !== MuscleGroup.TRICEPS &&
      /pull[- ]?ups?\b|pullups?\b|chin[- ]?ups?\b|\bchins?\b|klimmz|pull ?downs?\b|pulldowns?\b|latzug|lat-ziehen|lat pull/.test(
        t,
      ),
  },
  {
    pattern: P.HORIZONTAL_PULL,
    test: rx(
      /^(?!.*lateral rows).*(\brows?\b|rowing|rudern|bench pull|renegade|trx row|iso row|pulley row|long-pulley|mid row)/,
    ),
  },
  {
    pattern: P.WRIST,
    test: rx(
      /wrist|handgelenk|pronation|supination|finger curl|plate pinch|hand squeeze|forearm|unterarmtraining/,
    ),
  },
  {
    pattern: P.KNEE_FLEXION,
    test: rx(
      /leg curls?\b|hamstring curls?|beinbeuger|glute[- ]ham|nordic|hamstring slides|prone manual hamstring/,
    ),
  },
  { pattern: P.KNEE_EXTENSION, test: rx(/leg extensions?\b|beinstrecker|sissy squat/) },
  {
    pattern: P.HIP_EXTENSION,
    test: (t, m) =>
      /donkey kick|eselstritt|glute extension|gesäßstrecken|hip extension|reverse hyper|umgekehrte hyperextension|glute kickback|cable kickback|kneeling kickbacks/.test(
        t,
      ) ||
      ((m === MuscleGroup.GLUTES || m === MuscleGroup.HAMSTRINGS) && /kickback|kick back/.test(t)),
  },
  {
    pattern: P.ELBOW_EXTENSION,
    test: (t, m) =>
      (!/bench press|bankdrücken/.test(t) &&
        /tri(ceps?|zeps)/.test(t) &&
        /exten|strecken|press|kickback|drücken|machine|maschine|pushdown/.test(t)) ||
      /push[- ]?down|skull ?crusher|french ?press|frenchpress|jm press|tate press|kickback/.test(
        t,
      ) ||
      (m === MuscleGroup.TRICEPS && /extension/.test(t)),
  },
  {
    pattern: P.BACK_EXTENSION,
    test: rx(/hyperextension|back extension|rückenstrecker|superman|skydiver|fallschirmspringer/),
  },
  {
    pattern: P.HIP_THRUST,
    test: (t, m) =>
      m !== MuscleGroup.ABS_CORE &&
      m !== MuscleGroup.BACK &&
      /hip thrust|glute bridge|hip bridge|butt lift|beckenheben|hip raise|hip lift|hüftheben|hüftbrücke|\bbridge\b/.test(
        t,
      ),
  },
  {
    pattern: P.HIP_ABDUCTION,
    test: rx(
      /abduct|abduktion|clamshell|lateral walk|monster walk|seitwärtsgehen|glute press|side lying hip|side-lying hip/,
    ),
  },
  { pattern: P.HIP_ADDUCTION, test: rx(/adduct|adduktion|copenhagen/) },
  {
    pattern: P.LUNGE,
    test: rx(
      /lunge|ausfallschritt|split squat|bulgarian|bulgarische|step[- ]?ups?\b|steigungen|cossack|kosaken|side squat|seitliche kniebeuge|side split squat/,
    ),
  },
  {
    pattern: P.SQUAT,
    test: rx(
      /squat|kniebeuge|leg press|beinpresse|hack[- ]squat|wall[- ]sit|wandsitz|pendelkniebeu|horse stance|reiterstellung/,
    ),
  },
  {
    pattern: P.DIP,
    test: (t) =>
      !/knee raise|knieheben/.test(t) && /\bdips?\b|dip machine|zwischen 2 bänke/.test(t),
  },
  {
    pattern: P.VERTICAL_PUSH,
    test: rx(
      /shoulder press|schulterdrücken|schulterpresse|overhead press|military|\bohp\b|push press|arnold|bradford|handstand push|handstand-liegestütz|pike push|hecht-liegestütz|see-?saw press|kreis[- ]press|jammer|press behind (the )?neck|seated (dumbbell|barbell) press|standing (alternating |palms?-in (one-arm )?|palm-in one-arm )?dumbbell press|kettlebell (seated |military |arnold |para |seesaw )?press|one-arm kettlebell (military|para) press|alternating kettlebell press|anti-gravity press|landmine press|trap press|trapez-press|diagonal shoulder press/,
    ),
  },
  {
    pattern: P.INCLINE_PUSH,
    test: (t) =>
      /upper chest|obere brust/.test(t) ||
      (/incline|schrägbank/.test(t) && /press|drücken|presse|bench with palms/.test(t)),
  },
  {
    pattern: P.HORIZONTAL_PUSH,
    test: rx(
      /bench press|bankdrücken|chest press|brustdrücken|brustpresse|floor press|bodendrücken|push[- ]?ups?\b|pushups?\b|liegestütz|board press|pin press|guillotine|hex press|svend|close-grip (dumbbell|ez-bar) press|decline press|chain press|neck press/,
    ),
  },
  {
    pattern: P.FLY,
    test: rx(
      /\bfl(y|ie|ye)s?\b|flyes|fliegende|butterfly|cross-?over|kabelcross|cross over|pec deck|iron cross|around the worlds|kabel-fly/,
    ),
  },
  {
    pattern: P.LATERAL_RAISE,
    test: rx(
      /lateral raise|side lateral|seitheben|lateral rows on cable|deltoid raise|side laterals|laterals\b|one-arm side lateral/,
    ),
  },
  {
    pattern: P.FRONT_RAISE,
    test: rx(/front.*raise|frontheben|scaption|raises with plates|straight raises|raise over head/),
  },
  { pattern: P.ELBOW_FLEXION, test: rx(/curls?\b|bizeps|biceps|bicep\b|zottman/) },
  {
    pattern: P.LATERAL_FLEXION,
    test: rx(
      /side bend|seitneigung|side plank|seitstütz|side bridge|side hold|seitliches halten|trunk flexion|oberkörperbeugen|side jackknife|seitliches klappmesser/,
    ),
  },
  {
    pattern: P.ROTATION,
    test: rx(
      /twist|rotation|rotary|woodchop|wood ?chop|holzhacker|russian|windmill|pallof|landmine 180|judo flip|cable lift|corkscrew|korkenzieher|windshield|scheibenwischer|figure 8|spell caster|trx obliques|bauchmuskeln seitlich/,
    ),
  },
  {
    pattern: P.ANTI_EXTENSION,
    test: rx(
      /plank|planke|unterarmstütz|roll ?out|roll-out|ab roller|ab wheel|bauchroller|dead bug|fallout|bird dog|stir the pot|hollow|body saw|draw-in|einziehen/,
    ),
  },
  {
    pattern: P.CORE_FLEXION,
    test: (t, m) =>
      (m === MuscleGroup.ABS_CORE || m === MuscleGroup.HIP_FLEXORS) &&
      /leg raise|beinheben|knee raise|knieheben|leg pull-in|pull-in|jackknife|klappmesser|v-up|toes to bar|pike|flutter|scissors|schere|tuck|dragon[- ]flag|heel touch|fersen|otis|butt-ups|elbow to knee|abdominal press|bauchpresse|leg lift|bicycle|air bike|bottoms up|hip raise|l-sit/.test(
        t,
      ),
  },
  { pattern: P.HIP_FLEXION, test: rx(/hip flex|hüftbeuger|psoas/) },
  { pattern: P.CARRY, test: rx(/carry|farmer|suitcase|yoke|waiter walk/) },
];

/** Default regions per pattern, refined by name keywords in `targetRegionsFor`. */
const PATTERN_REGIONS: Record<MovementPattern, TargetRegion[]> = {
  [P.HORIZONTAL_PULL]: [R.UPPER_BACK, R.LATS],
  [P.VERTICAL_PULL]: [R.LATS],
  [P.SHOULDER_EXTENSION]: [R.LATS],
  [P.HORIZONTAL_PUSH]: [R.MID_CHEST, R.FRONT_DELT, R.TRICEPS],
  [P.INCLINE_PUSH]: [R.UPPER_CHEST, R.FRONT_DELT, R.TRICEPS],
  [P.VERTICAL_PUSH]: [R.FRONT_DELT, R.SIDE_DELT, R.TRICEPS],
  [P.DIP]: [R.LOWER_CHEST, R.TRICEPS, R.FRONT_DELT],
  [P.FLY]: [R.MID_CHEST],
  [P.LATERAL_RAISE]: [R.SIDE_DELT],
  [P.FRONT_RAISE]: [R.FRONT_DELT],
  [P.REAR_DELT]: [R.REAR_DELT, R.UPPER_BACK],
  [P.UPRIGHT_ROW]: [R.SIDE_DELT, R.TRAPS],
  [P.SHRUG]: [R.TRAPS],
  [P.SHOULDER_ROTATION]: [R.REAR_DELT],
  [P.ELBOW_FLEXION]: [R.BICEPS],
  [P.ELBOW_EXTENSION]: [R.TRICEPS],
  [P.WRIST]: [R.FOREARMS],
  [P.SQUAT]: [R.QUADS, R.GLUTES],
  [P.HINGE]: [R.HAMSTRINGS, R.GLUTES, R.LOWER_BACK],
  [P.LUNGE]: [R.QUADS, R.GLUTES],
  [P.KNEE_EXTENSION]: [R.QUADS],
  [P.KNEE_FLEXION]: [R.HAMSTRINGS],
  [P.HIP_THRUST]: [R.GLUTES, R.HAMSTRINGS],
  [P.HIP_EXTENSION]: [R.GLUTES, R.HAMSTRINGS],
  [P.HIP_ABDUCTION]: [R.ABDUCTORS, R.GLUTES],
  [P.HIP_ADDUCTION]: [R.ADDUCTORS],
  [P.HIP_FLEXION]: [R.HIP_FLEXORS],
  [P.CALF_RAISE]: [R.CALVES],
  [P.BACK_EXTENSION]: [R.LOWER_BACK, R.GLUTES],
  [P.CORE_FLEXION]: [R.ABS],
  [P.ANTI_EXTENSION]: [R.ABS],
  [P.LATERAL_FLEXION]: [R.OBLIQUES],
  [P.ROTATION]: [R.OBLIQUES, R.ABS],
  [P.CARRY]: [R.FOREARMS, R.TRAPS, R.ABS],
  [P.OLYMPIC_LIFT]: [R.QUADS, R.GLUTES, R.HAMSTRINGS, R.TRAPS],
};

function targetRegionsFor(
  pattern: MovementPattern,
  text: string,
  muscle: `${MuscleGroup}`,
): TargetRegion[] {
  const regions = [...PATTERN_REGIONS[pattern]];
  const swap = (from: TargetRegion, to: TargetRegion) => {
    const i = regions.indexOf(from);
    if (i >= 0) regions[i] = to;
  };
  const add = (r: TargetRegion) => {
    if (!regions.includes(r)) regions.push(r);
  };
  switch (pattern) {
    case P.HORIZONTAL_PUSH:
      if (/decline|negativ/.test(text)) swap(R.MID_CHEST, R.LOWER_CHEST);
      if (muscle === MuscleGroup.TRICEPS || /close|diamond|eng/.test(text)) {
        regions.splice(0, regions.length, R.TRICEPS, R.MID_CHEST, R.FRONT_DELT);
      }
      break;
    case P.FLY:
      if (/incline|schrägbank|low[- ](pulley|cable)|unteren kabel/.test(text)) {
        swap(R.MID_CHEST, R.UPPER_CHEST);
      } else if (/decline|negativ/.test(text)) {
        swap(R.MID_CHEST, R.LOWER_CHEST);
      }
      break;
    case P.DIP:
      if (muscle === MuscleGroup.TRICEPS || /bench|bank|chair|stuhl|floor|boden/.test(text)) {
        regions.splice(0, regions.length, R.TRICEPS, R.FRONT_DELT);
      }
      break;
    case P.VERTICAL_PULL:
      if (/chin|underhand|untergriff|supinated|v-bar|neutral|close|eng/.test(text)) add(R.BICEPS);
      else add(R.UPPER_BACK);
      break;
    case P.HORIZONTAL_PULL:
      if (/underhand|untergriff|reverse grip/.test(text)) add(R.BICEPS);
      break;
    case P.SHOULDER_EXTENSION:
      if (muscle === MuscleGroup.CHEST) add(R.MID_CHEST);
      break;
    case P.ELBOW_FLEXION:
      if (/hammer|neutral|rope|seil/.test(text)) add(R.BRACHIALIS);
      if (/reverse|zottman|pronated/.test(text)) {
        regions.splice(0, regions.length, R.BRACHIALIS, R.FOREARMS, R.BICEPS);
      }
      break;
    case P.SQUAT:
      if (/sumo|wide|weit|plie|plié/.test(text)) add(R.ADDUCTORS);
      break;
    case P.HINGE:
      if (/romanian|rumänisch|\brdl\b|stiff|gestreckt|good ?morning/.test(text)) {
        regions.splice(0, regions.length, R.HAMSTRINGS, R.GLUTES, R.LOWER_BACK);
      }
      if (/sumo/.test(text)) add(R.ADDUCTORS);
      if (/pull[- ]?through|swing/.test(text)) {
        regions.splice(0, regions.length, R.GLUTES, R.HAMSTRINGS);
      }
      break;
    case P.CORE_FLEXION:
      if (
        /oblique|cross|bicycle|elbow to knee|ellbogen zum knie|heel touch|fersen|side/.test(text)
      ) {
        add(R.OBLIQUES);
      }
      if (
        /leg raise|beinheben|knee raise|knieheben|hanging|reverse|leg pull|tuck|flutter/.test(text)
      ) {
        add(R.HIP_FLEXORS);
      }
      break;
    default:
      break;
  }
  return regions;
}

const EMPTY_PROFILE: MovementProfile = {
  movementPattern: null,
  laterality: null,
  mechanic: null,
  targetRegions: [],
};

/**
 * Infers the movement metadata of an exercise from its English and German name with keyword
 * rules. Deterministic, so the generated catalog needs no re-import. Exercises no rule recognises
 * (and stretches / cardio) get `movementPattern: null` and are only offered through search.
 */
export function inferMovementProfile(input: MovementProfileInput): MovementProfile {
  if (input.exerciseType !== ExerciseType.STRENGTH) return EMPTY_PROFILE;
  const text = `${input.name} | ${input.deName ?? ''}`.toLowerCase();
  if (NO_PATTERN.test(text)) return EMPTY_PROFILE;
  const rule = RULES.find((r) => r.test(text, input.primaryMuscleGroup));
  if (!rule) return EMPTY_PROFILE;
  return {
    movementPattern: rule.pattern,
    laterality: UNILATERAL.test(text) ? Laterality.UNILATERAL : Laterality.BILATERAL,
    mechanic: movementMechanic(rule.pattern),
    targetRegions: targetRegionsFor(rule.pattern, text, input.primaryMuscleGroup),
  };
}
