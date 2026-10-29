import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ExerciseMechanic,
  ExerciseType,
  Laterality,
  MovementPattern,
  MuscleGroup,
  TargetRegion,
} from '../enums';
import { areMovementPatternsCompatible } from '../utils/exercise-alternatives.util';
import { CORE_EXERCISE_CATALOG } from './data';
import { ALL_SYSTEM_EXERCISES, EXTENDED_EXERCISE_CATALOG } from './extended';
import { inferMovementProfile } from './movement';
import { EXERCISE_OVERRIDES } from './overrides';

const P = MovementPattern;

const infer = (name: string, deName: string | null, muscle: `${MuscleGroup}`) =>
  inferMovementProfile({
    name,
    deName,
    exerciseType: ExerciseType.STRENGTH,
    primaryMuscleGroup: muscle,
  });

describe('inferMovementProfile', () => {
  const cases: Array<[string, string | null, `${MuscleGroup}`, MovementPattern, Laterality]> = [
    [
      'Alternative DB Gorilla rows',
      'Alternatives Gorilla-Rudern mit Kurzhanteln',
      'BACK',
      P.HORIZONTAL_PULL,
      Laterality.UNILATERAL,
    ],
    ['Straight-Arm Pulldown', null, 'BACK', P.SHOULDER_EXTENSION, Laterality.BILATERAL],
    [
      'Straight-arm Pull Down (bar Attachment)',
      'Lat-Ziehen Mit Gesteckten Armen Mit (Stange)',
      'BACK',
      P.SHOULDER_EXTENSION,
      Laterality.BILATERAL,
    ],
    [
      'High-pulley pullover',
      'Pullover am hohen Kabelzug',
      'BACK',
      P.SHOULDER_EXTENSION,
      Laterality.BILATERAL,
    ],
    ['Straight-Arm Dumbbell Pullover', null, 'CHEST', P.SHOULDER_EXTENSION, Laterality.BILATERAL],
    [
      'Underhand Lat Pull Down',
      'Latzug im Untergriff',
      'BACK',
      P.VERTICAL_PULL,
      Laterality.BILATERAL,
    ],
    ['One Arm Lat Pulldown', null, 'BACK', P.VERTICAL_PULL, Laterality.UNILATERAL],
    ['Archer Pull Up', 'Archer-Klimmzug', 'BACK', P.VERTICAL_PULL, Laterality.UNILATERAL],
    [
      'Australian pull-ups',
      'Australian Pull-ups (umgekehrtes Rudern)',
      'SHOULDERS',
      P.HORIZONTAL_PULL,
      Laterality.BILATERAL,
    ],
    ['One-Arm Kettlebell Row', null, 'BACK', P.HORIZONTAL_PULL, Laterality.UNILATERAL],
    [
      'Decline Barbell Bench Press',
      'Negativ Bankdrücken',
      'CHEST',
      P.HORIZONTAL_PUSH,
      Laterality.BILATERAL,
    ],
    [
      'Smith Machine Incline Bench Press',
      'Schrägbankdrücken an der Multipresse',
      'CHEST',
      P.INCLINE_PUSH,
      Laterality.BILATERAL,
    ],
    ['Low Pulley Cable Fly', 'Kabel-Fly am unteren Kabelzug', 'CHEST', P.FLY, Laterality.BILATERAL],
    [
      'Incline Bench Reverse Fly',
      'Reverse Fly auf der Schrägbank',
      'SHOULDERS',
      P.REAR_DELT,
      Laterality.BILATERAL,
    ],
    [
      'Lateral Rows on Cable, One Armed',
      'Seitheben am Kabel, Einarmig',
      'SHOULDERS',
      P.LATERAL_RAISE,
      Laterality.UNILATERAL,
    ],
    ['Seated Barbell Military Press', null, 'SHOULDERS', P.VERTICAL_PUSH, Laterality.BILATERAL],
    [
      'Upright Row, SZ-bar',
      'Rudern Aufrecht ß-Stange',
      'SHOULDERS',
      P.UPRIGHT_ROW,
      Laterality.BILATERAL,
    ],
    [
      'Concentration Curls',
      'Konzentrations-Curls',
      'BICEPS',
      P.ELBOW_FLEXION,
      Laterality.UNILATERAL,
    ],
    [
      'Triceps Pushdown',
      'Trizepsdrücken am Kabelzug',
      'TRICEPS',
      P.ELBOW_EXTENSION,
      Laterality.BILATERAL,
    ],
    [
      'EZ-Bar Skullcrusher',
      'Frenchpress SZ-Stange',
      'TRICEPS',
      P.ELBOW_EXTENSION,
      Laterality.BILATERAL,
    ],
    ['Pendulum Squat', 'Pendelkniebeube', 'QUADRICEPS', P.SQUAT, Laterality.BILATERAL],
    ['Leg Presses (wide)', 'Beinpresse (weit)', 'QUADRICEPS', P.SQUAT, Laterality.BILATERAL],
    [
      'Dumbbell Rear Lunge',
      'Rückwärtiger Ausfallschritt mit Kurzhanteln',
      'QUADRICEPS',
      P.LUNGE,
      Laterality.UNILATERAL,
    ],
    [
      'Single-Leg Leg Extension',
      'Beinstrecker Einbeinig',
      'QUADRICEPS',
      P.KNEE_EXTENSION,
      Laterality.UNILATERAL,
    ],
    [
      'Floor Glider Hamstring Curls',
      'Beinbeuger am Boden mit Glidern',
      'HAMSTRINGS',
      P.KNEE_FLEXION,
      Laterality.BILATERAL,
    ],
    ['Single Leg RDL', null, 'HAMSTRINGS', P.HINGE, Laterality.UNILATERAL],
    [
      'Dumbbell Hip Thrust',
      'Hip Thrust mit Kurzhantel',
      'GLUTES',
      P.HIP_THRUST,
      Laterality.BILATERAL,
    ],
    ['One-Legged Cable Kickback', null, 'GLUTES', P.HIP_EXTENSION, Laterality.UNILATERAL],
    [
      'Seated Hip Abduction',
      'Hüftabduktion sitzend',
      'GLUTES',
      P.HIP_ABDUCTION,
      Laterality.BILATERAL,
    ],
    [
      'Smith Machine Calf Raise',
      'Wadenheben an der Multipresse',
      'CALVES',
      P.CALF_RAISE,
      Laterality.BILATERAL,
    ],
    ['Barbell Shrug Behind The Back', null, 'BACK', P.SHRUG, Laterality.BILATERAL],
    ['Rope Crunch', null, 'ABS_CORE', P.CORE_FLEXION, Laterality.BILATERAL],
    ['Ab wheel', 'Bauchroller', 'ABS_CORE', P.ANTI_EXTENSION, Laterality.BILATERAL],
    ['Cable Woodchoppers', 'Holzhacker am Kabelzug', 'ABS_CORE', P.ROTATION, Laterality.BILATERAL],
    [
      'Dumbbell Side Bend',
      'Seitneigung mit Kurzhantel',
      'ABS_CORE',
      P.LATERAL_FLEXION,
      Laterality.UNILATERAL,
    ],
  ];

  for (const [name, deName, muscle, pattern, laterality] of cases) {
    it(`classifies "${name}" as ${pattern}`, () => {
      const profile = infer(name, deName, muscle);
      assert.equal(profile.movementPattern, pattern);
      assert.equal(profile.laterality, laterality);
      assert.ok(profile.targetRegions.length > 0);
    });
  }

  it('derives compound / isolation from the pattern', () => {
    assert.equal(infer('Row', 'Rudern', 'BACK').mechanic, ExerciseMechanic.COMPOUND);
    assert.equal(infer('Dumbbell Curl', null, 'BICEPS').mechanic, ExerciseMechanic.ISOLATION);
    assert.equal(infer('Straight-Arm Pulldown', null, 'BACK').mechanic, ExerciseMechanic.ISOLATION);
  });

  it('refines target regions from the name', () => {
    assert.deepEqual(infer('Decline Dumbbell Flyes', null, 'CHEST').targetRegions, [
      TargetRegion.LOWER_CHEST,
    ]);
    assert.ok(
      infer('Cable Hammer Curls - Rope Attachment', null, 'BICEPS').targetRegions.includes(
        TargetRegion.BRACHIALIS,
      ),
    );
  });

  it('leaves plyometrics, drills and unknown movements without a pattern', () => {
    for (const name of [
      'Box Jump (Multiple Response)',
      'Battling Ropes',
      'Neck half circles',
      'Moving Claw Series',
    ]) {
      assert.equal(infer(name, null, 'QUADRICEPS').movementPattern, null, name);
    }
    assert.equal(
      inferMovementProfile({
        name: 'Plank',
        exerciseType: ExerciseType.STRETCHING,
        primaryMuscleGroup: 'ABS_CORE',
      }).movementPattern,
      null,
    );
  });

  it('classifies most of the extended strength catalog', () => {
    const strength = EXTENDED_EXERCISE_CATALOG.filter(
      (e) => e.exerciseType === ExerciseType.STRENGTH,
    );
    const known = strength.filter((e) => e.movementPattern);
    assert.ok(known.length / strength.length > 0.8, `${known.length} of ${strength.length}`);
  });
});

describe('core exercise movement tags', () => {
  it('hand-tags every core strength exercise', () => {
    for (const ex of CORE_EXERCISE_CATALOG) {
      if (ex.exerciseType !== ExerciseType.STRENGTH) continue;
      const override = EXERCISE_OVERRIDES[ex.id]!;
      assert.ok(override.movementPattern, `${ex.id} has no movementPattern`);
      assert.ok(override.laterality, `${ex.id} has no laterality`);
      assert.ok(override.targetRegions?.length, `${ex.id} has no targetRegions`);
      assert.equal(ex.movementPattern, override.movementPattern);
      assert.ok(ex.mechanic, `${ex.id} has no mechanic`);
    }
  });

  it('only lists alternatives with the same or a compatible movement', () => {
    const byId = new Map(ALL_SYSTEM_EXERCISES.map((e) => [e.id, e]));
    for (const ex of CORE_EXERCISE_CATALOG) {
      if (!ex.movementPattern) continue;
      for (const altId of ex.alternativeExerciseIds) {
        const alt = byId.get(altId)!;
        assert.ok(
          alt.movementPattern === ex.movementPattern ||
            (alt.movementPattern &&
              areMovementPatternsCompatible(ex.movementPattern, alt.movementPattern)),
          `${ex.id} (${ex.movementPattern}) lists ${altId} (${alt.movementPattern})`,
        );
      }
    }
  });

  it('replaces the straight-arm pulldown with shoulder-extension exercises', () => {
    const ex = CORE_EXERCISE_CATALOG.find((e) => e.id === 'ex-straight-arm-pulldown')!;
    assert.equal(ex.movementPattern, P.SHOULDER_EXTENSION);
    assert.ok(ex.alternativeExerciseIds.includes('ex-rope-straight-arm-pulldown'));
  });
});
