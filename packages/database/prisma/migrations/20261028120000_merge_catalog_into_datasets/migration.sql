-- The built-in catalog no longer keeps its own copies of exercises: every former curated
-- exercise is now the free-exercise-db / wger entry it was built on (hand-written text is applied by
-- the app), and dataset entries that duplicate another exercise are retired. Mirrors
-- RETIRED_EXERCISE_IDS in packages/common/src/catalog/retired.ts.
--
-- For every retired id:
--  1) if the replacing exercise does not exist yet, the old row is renamed (id + slug); foreign
--     keys follow via ON UPDATE CASCADE. Former curated rows win over dataset duplicates.
--  2) otherwise references (templates, routines, sessions, alternative id arrays, replaced ids)
--     are re-pointed to the replacing exercise and the old row is deleted.

CREATE TEMP TABLE _retired_exercise_map (
  old_id TEXT PRIMARY KEY,
  new_id TEXT NOT NULL,
  new_slug TEXT NOT NULL,
  priority INT NOT NULL
);

INSERT INTO _retired_exercise_map (old_id, new_id, new_slug, priority) VALUES
  ('ex-barbell-bench-press', 'ex-barbell-bench-press-medium-grip', 'barbell-bench-press-medium-grip', 0),
  ('ex-dumbbell-incline-press', 'ex-incline-dumbbell-press', 'incline-dumbbell-press', 0),
  ('ex-machine-chest-press', 'ex-leverage-chest-press', 'leverage-chest-press', 0),
  ('ex-cable-chest-fly', 'ex-cable-crossover', 'cable-crossover', 0),
  ('ex-push-up', 'ex-pushups', 'pushups', 0),
  ('ex-dumbbell-fly', 'ex-dumbbell-flyes', 'dumbbell-flyes', 0),
  ('ex-incline-dumbbell-fly', 'ex-incline-dumbbell-flyes', 'incline-dumbbell-flyes', 0),
  ('ex-incline-barbell-bench-press', 'ex-barbell-incline-bench-press-medium-grip', 'barbell-incline-bench-press-medium-grip', 0),
  ('ex-pec-deck-fly', 'ex-butterfly', 'butterfly', 0),
  ('ex-machine-incline-chest-press', 'ex-leverage-incline-chest-press', 'leverage-incline-chest-press', 0),
  ('ex-weighted-pull-up', 'ex-pullups', 'pullups', 0),
  ('ex-lat-pulldown', 'ex-wide-grip-lat-pulldown', 'wide-grip-lat-pulldown', 0),
  ('ex-barbell-bent-over-row', 'ex-bent-over-barbell-row', 'bent-over-barbell-row', 0),
  ('ex-seated-cable-row', 'ex-seated-cable-rows', 'seated-cable-rows', 0),
  ('ex-chest-supported-dumbbell-row', 'ex-dumbbell-incline-row', 'dumbbell-incline-row', 0),
  ('ex-dumbbell-bent-over-row', 'ex-bent-over-two-dumbbell-row', 'bent-over-two-dumbbell-row', 0),
  ('ex-back-extension', 'ex-hyperextensions-back-extensions', 'hyperextensions-back-extensions', 0),
  ('ex-close-grip-lat-pulldown', 'ex-close-grip-front-lat-pulldown', 'close-grip-front-lat-pulldown', 0),
  ('ex-single-arm-cable-row', 'ex-seated-one-arm-cable-pulley-rows', 'seated-one-arm-cable-pulley-rows', 0),
  ('ex-machine-high-row', 'ex-leverage-high-row', 'leverage-high-row', 0),
  ('ex-overhead-barbell-press', 'ex-barbell-shoulder-press', 'barbell-shoulder-press', 0),
  ('ex-seated-dumbbell-shoulder-press', 'ex-dumbbell-shoulder-press', 'dumbbell-shoulder-press', 0),
  ('ex-dumbbell-lateral-raise', 'ex-side-lateral-raise', 'side-lateral-raise', 0),
  ('ex-cable-face-pull', 'ex-face-pull', 'face-pull', 0),
  ('ex-machine-shoulder-press', 'ex-machine-shoulder-military-press', 'machine-shoulder-military-press', 0),
  ('ex-arnold-press', 'ex-arnold-dumbbell-press', 'arnold-dumbbell-press', 0),
  ('ex-standing-dumbbell-shoulder-press', 'ex-standing-dumbbell-press', 'standing-dumbbell-press', 0),
  ('ex-cable-lateral-raise', 'ex-cable-seated-lateral-raise', 'cable-seated-lateral-raise', 0),
  ('ex-barbell-front-raise', 'ex-front-plate-raise', 'front-plate-raise', 0),
  ('ex-dumbbell-front-raise', 'ex-front-dumbbell-raise', 'front-dumbbell-raise', 0),
  ('ex-cable-upright-row', 'ex-upright-cable-row', 'upright-cable-row', 0),
  ('ex-dumbbell-reverse-fly', 'ex-seated-bent-over-rear-delt-raise', 'seated-bent-over-rear-delt-raise', 0),
  ('ex-reverse-pec-deck', 'ex-reverse-machine-flyes', 'reverse-machine-flyes', 0),
  ('ex-cable-reverse-fly', 'ex-cable-rear-delt-fly', 'cable-rear-delt-fly', 0),
  ('ex-cable-shrug', 'ex-cable-shrugs', 'cable-shrugs', 0),
  ('ex-ez-bar-bicep-curl', 'ex-ez-bar-curl', 'ez-bar-curl', 0),
  ('ex-hammer-curl', 'ex-hammer-curls', 'hammer-curls', 0),
  ('ex-cable-curl', 'ex-standing-biceps-cable-curl', 'standing-biceps-cable-curl', 0),
  ('ex-ez-bar-preacher-curl', 'ex-preacher-curl', 'preacher-curl', 0),
  ('ex-machine-preacher-curl', 'ex-machine-preacher-curls', 'machine-preacher-curls', 0),
  ('ex-overhead-cable-curl', 'ex-high-cable-curls', 'high-cable-curls', 0),
  ('ex-cable-tricep-pushdown', 'ex-triceps-pushdown-rope-attachment', 'triceps-pushdown-rope-attachment', 0),
  ('ex-overhead-cable-tricep-extension', 'ex-cable-rope-overhead-triceps-extension', 'cable-rope-overhead-triceps-extension', 0),
  ('ex-close-grip-bench-press', 'ex-close-grip-barbell-bench-press', 'close-grip-barbell-bench-press', 0),
  ('ex-dumbbell-skull-crusher', 'ex-lying-dumbbell-tricep-extension', 'lying-dumbbell-tricep-extension', 0),
  ('ex-seated-overhead-dumbbell-extension', 'ex-seated-triceps-press', 'seated-triceps-press', 0),
  ('ex-single-arm-overhead-dumbbell-extension', 'ex-dumbbell-one-arm-triceps-extension', 'dumbbell-one-arm-triceps-extension', 0),
  ('ex-dumbbell-kickback', 'ex-tricep-dumbbell-kickback', 'tricep-dumbbell-kickback', 0),
  ('ex-triceps-dip', 'ex-dips-triceps-version', 'dips-triceps-version', 0),
  ('ex-bench-dip', 'ex-bench-dips', 'bench-dips', 0),
  ('ex-reverse-grip-cable-pushdown', 'ex-reverse-grip-triceps-pushdown', 'reverse-grip-triceps-pushdown', 0),
  ('ex-barbell-wrist-curl', 'ex-palms-up-barbell-wrist-curl-over-a-bench', 'palms-up-barbell-wrist-curl-over-a-bench', 0),
  ('ex-barbell-back-squat', 'ex-barbell-squat', 'barbell-squat', 0),
  ('ex-bulgarian-split-squat', 'ex-split-squat-with-dumbbells', 'split-squat-with-dumbbells', 0),
  ('ex-leg-extension', 'ex-leg-extensions', 'leg-extensions', 0),
  ('ex-dumbbell-lunge', 'ex-dumbbell-lunges', 'dumbbell-lunges', 0),
  ('ex-lying-leg-curl', 'ex-lying-leg-curls', 'lying-leg-curls', 0),
  ('ex-hip-adduction-abduction', 'ex-thigh-abductor', 'thigh-abductor', 0),
  ('ex-glute-bridge', 'ex-butt-lift-bridge', 'butt-lift-bridge', 0),
  ('ex-weighted-glute-bridge', 'ex-barbell-glute-bridge', 'barbell-glute-bridge', 0),
  ('ex-standing-calf-raise', 'ex-standing-calf-raises', 'standing-calf-raises', 0),
  ('ex-kettlebell-hip-flexor-march', 'ex-standing-hip-flexors', 'standing-hip-flexors', 0),
  ('ex-conventional-deadlift', 'ex-barbell-deadlift', 'barbell-deadlift', 0),
  ('ex-rowing-ergometer', 'ex-rowing-stationary', 'rowing-stationary', 0),
  ('ex-crunch', 'ex-crunches', 'crunches', 0),
  ('ex-machine-crunch', 'ex-ab-crunch-machine', 'ab-crunch-machine', 0),
  ('ex-elbow-to-knee-crunch', 'ex-cross-body-crunch', 'cross-body-crunch', 0),
  ('ex-cable-core-rotation', 'ex-standing-cable-wood-chop', 'standing-cable-wood-chop', 0),
  ('ex-captains-chair-knee-raise', 'ex-knee-hip-raise-on-parallel-bars', 'knee-hip-raise-on-parallel-bars', 0),
  ('ex-side-plank', 'ex-side-bridge', 'side-bridge', 0),
  ('ex-lying-leg-raise', 'ex-flat-bench-lying-leg-raise', 'flat-bench-lying-leg-raise', 0),
  ('ex-couch-hip-flexor-stretch', 'ex-kneeling-hip-flexor', 'kneeling-hip-flexor', 0),
  ('ex-90-90-hip-mobility', 'ex-90-90-hamstring', '90-90-hamstring', 0),
  ('ex-thoracic-open-book', 'ex-spinal-stretch', 'spinal-stretch', 0),
  ('ex-doorway-pec-stretch', 'ex-chest-and-front-of-shoulder-stretch', 'chest-and-front-of-shoulder-stretch', 0),
  ('ex-supine-hamstring-band-stretch', 'ex-leg-up-hamstring-stretch', 'leg-up-hamstring-stretch', 0),
  ('ex-pigeon-glute-stretch', 'ex-ankle-on-the-knee', 'ankle-on-the-knee', 0),
  ('ex-butterfly-adductor-stretch', 'ex-groin-and-back-stretch', 'groin-and-back-stretch', 0),
  ('ex-deep-squat-ankle-pry', 'ex-sit-squats', 'sit-squats', 0),
  ('ex-standing-wall-calf-stretch', 'ex-standing-gastrocnemius-calf-stretch', 'standing-gastrocnemius-calf-stretch', 0),
  ('ex-standing-quad-stretch', 'ex-standing-elevated-quad-stretch', 'standing-elevated-quad-stretch', 0),
  ('ex-seated-pike-hamstring-fold', 'ex-seated-floor-hamstring-stretch', 'seated-floor-hamstring-stretch', 0),
  ('ex-childs-pose-lat-stretch', 'ex-childs-pose', 'childs-pose', 0),
  ('ex-cross-body-shoulder-stretch', 'ex-shoulder-stretch', 'shoulder-stretch', 0),
  ('ex-overhead-tricep-lat-stretch', 'ex-overhead-triceps', 'overhead-triceps', 0),
  ('ex-dead-hang-shoulder-decompression', 'ex-one-handed-hang', 'one-handed-hang', 0),
  ('ex-kneeling-wrist-forearm-stretch', 'ex-kneeling-forearm-stretch', 'kneeling-forearm-stretch', 0),
  ('ex-cat-cow-spinal-flow', 'ex-cat-stretch', 'cat-stretch', 0),
  ('ex-supine-knee-to-chest-twist', 'ex-hug-knees-to-chest', 'hug-knees-to-chest', 0),
  ('ex-neck-upper-trap-release', 'ex-side-neck-stretch', 'side-neck-stretch', 0),
  ('ex-benchpress-dumbbells', 'ex-dumbbell-bench-press', 'dumbbell-bench-press', 1),
  ('ex-bench-press', 'ex-barbell-bench-press-medium-grip', 'barbell-bench-press-medium-grip', 1),
  ('ex-seated-bench-press', 'ex-leverage-chest-press', 'leverage-chest-press', 1),
  ('ex-chest-press', 'ex-leverage-chest-press', 'leverage-chest-press', 1),
  ('ex-pull-ups', 'ex-pullups', 'pullups', 1),
  ('ex-weighted-pull-ups', 'ex-pullups', 'pullups', 1),
  ('ex-lat-pull-down-straight-back', 'ex-wide-grip-lat-pulldown', 'wide-grip-lat-pulldown', 1),
  ('ex-close-grip-lat-pull-down', 'ex-close-grip-front-lat-pulldown', 'close-grip-front-lat-pulldown', 1),
  ('ex-bent-over-rowing', 'ex-bent-over-barbell-row', 'bent-over-barbell-row', 1),
  ('ex-barbell-row-overhand', 'ex-bent-over-barbell-row', 'bent-over-barbell-row', 1),
  ('ex-incline-dumbbell-row', 'ex-dumbbell-incline-row', 'dumbbell-incline-row', 1),
  ('ex-bent-over-dumbbell-rows-single-arm', 'ex-one-arm-dumbbell-row', 'one-arm-dumbbell-row', 1),
  ('ex-unilateral-cable-row', 'ex-seated-one-arm-cable-pulley-rows', 'seated-one-arm-cable-pulley-rows', 1),
  ('ex-single-arm-row', 'ex-seated-one-arm-cable-pulley-rows', 'seated-one-arm-cable-pulley-rows', 1),
  ('ex-rowing-seated-narrow-grip', 'ex-seated-cable-rows', 'seated-cable-rows', 1),
  ('ex-seated-row-machine', 'ex-leverage-high-row', 'leverage-high-row', 1),
  ('ex-deadlifts', 'ex-barbell-deadlift', 'barbell-deadlift', 1),
  ('ex-lower-back-extensions', 'ex-hyperextensions-back-extensions', 'hyperextensions-back-extensions', 1),
  ('ex-shoulder-press-barbell', 'ex-barbell-shoulder-press', 'barbell-shoulder-press', 1),
  ('ex-standing-military-press', 'ex-barbell-shoulder-press', 'barbell-shoulder-press', 1),
  ('ex-arnold-shoulder-press', 'ex-arnold-dumbbell-press', 'arnold-dumbbell-press', 1),
  ('ex-lateral-raises', 'ex-side-lateral-raise', 'side-lateral-raise', 1),
  ('ex-front-raises', 'ex-front-dumbbell-raise', 'front-dumbbell-raise', 1),
  ('ex-reverse-flyes', 'ex-seated-bent-over-rear-delt-raise', 'seated-bent-over-rear-delt-raise', 1),
  ('ex-pec-deck-rear-delt-fly', 'ex-reverse-machine-flyes', 'reverse-machine-flyes', 1),
  ('ex-shrugs-barbells', 'ex-barbell-shrug', 'barbell-shrug', 1),
  ('ex-shrugs-dumbbells', 'ex-dumbbell-shrug', 'dumbbell-shrug', 1),
  ('ex-facepull', 'ex-face-pull', 'face-pull', 1),
  ('ex-biceps-curls-with-barbell', 'ex-barbell-curl', 'barbell-curl', 1),
  ('ex-preacher-curls', 'ex-preacher-curl', 'preacher-curl', 1),
  ('ex-tricep-rope-pushdowns', 'ex-triceps-pushdown-rope-attachment', 'triceps-pushdown-rope-attachment', 1),
  ('ex-skullcrusher-dumbbells', 'ex-lying-dumbbell-tricep-extension', 'lying-dumbbell-tricep-extension', 1),
  ('ex-triceps-overhead-dumbbell', 'ex-seated-triceps-press', 'seated-triceps-press', 1),
  ('ex-patadas-traseras', 'ex-tricep-dumbbell-kickback', 'tricep-dumbbell-kickback', 1),
  ('ex-parallel-bar-dip', 'ex-dips-triceps-version', 'dips-triceps-version', 1),
  ('ex-squats', 'ex-barbell-squat', 'barbell-squat', 1),
  ('ex-dumbbell-goblet-squat', 'ex-goblet-squat', 'goblet-squat', 1),
  ('ex-leg-curls-laying', 'ex-lying-leg-curls', 'lying-leg-curls', 1),
  ('ex-leg-curl', 'ex-lying-leg-curls', 'lying-leg-curls', 1),
  ('ex-sitting-calf-raises', 'ex-seated-calf-raise', 'seated-calf-raise', 1),
  ('ex-hip-thrust', 'ex-barbell-hip-thrust', 'barbell-hip-thrust', 1),
  ('ex-machine-hip-abduction', 'ex-thigh-abductor', 'thigh-abductor', 1),
  ('ex-seated-hip-adduction', 'ex-thigh-abductor', 'thigh-abductor', 1),
  ('ex-thigh-adductor', 'ex-thigh-abductor', 'thigh-abductor', 1),
  ('ex-abdominal-crunch', 'ex-crunches', 'crunches', 1),
  ('ex-crunches-on-machine', 'ex-ab-crunch-machine', 'ab-crunch-machine', 1),
  ('ex-crunches-with-cable', 'ex-cable-crunch', 'cable-crunch', 1),
  ('ex-negative-crunches', 'ex-decline-crunch', 'decline-crunch', 1),
  ('ex-heel-touches', 'ex-alternate-heel-touchers', 'alternate-heel-touchers', 1),
  ('ex-leg-raise', 'ex-flat-bench-lying-leg-raise', 'flat-bench-lying-leg-raise', 1),
  ('ex-doorway-pectoral-stretch', 'ex-chest-and-front-of-shoulder-stretch', 'chest-and-front-of-shoulder-stretch', 1),
  ('ex-yoga-exercise-cow-cat', 'ex-cat-stretch', 'cat-stretch', 1),
  ('ex-open-book', 'ex-spinal-stretch', 'spinal-stretch', 1),
  ('ex-child-s-pose', 'ex-childs-pose', 'childs-pose', 1),
  ('ex-butterfly-stretch', 'ex-groin-and-back-stretch', 'groin-and-back-stretch', 1),
  ('ex-quadriceps-stretch', 'ex-standing-elevated-quad-stretch', 'standing-elevated-quad-stretch', 1),
  ('ex-quad-stretch', 'ex-standing-elevated-quad-stretch', 'standing-elevated-quad-stretch', 1),
  ('ex-calf-stretch-hands-against-wall', 'ex-standing-gastrocnemius-calf-stretch', 'standing-gastrocnemius-calf-stretch', 1),
  ('ex-push-ohp', 'ex-push-press', 'push-press', 1),
  ('ex-decline-smith-press', 'ex-smith-machine-decline-press', 'smith-machine-decline-press', 1),
  ('ex-upright-row-on-multi-press', 'ex-smith-machine-upright-row', 'smith-machine-upright-row', 1),
  ('ex-shoulder-press-on-multi-press', 'ex-smith-machine-overhead-shoulder-press', 'smith-machine-overhead-shoulder-press', 1),
  ('ex-flat-machine-press', 'ex-machine-bench-press', 'machine-bench-press', 1),
  ('ex-cable-pull-through', 'ex-pull-through', 'pull-through', 1),
  ('ex-dumbell-tate-press', 'ex-tate-press', 'tate-press', 1),
  ('ex-side-bend', 'ex-dumbbell-side-bend', 'dumbbell-side-bend', 1),
  ('ex-reverse-curl', 'ex-reverse-barbell-curl', 'reverse-barbell-curl', 1),
  ('ex-dumbbell-concentration-curl', 'ex-concentration-curls', 'concentration-curls', 1),
  ('ex-weighted-crunch', 'ex-weighted-crunches', 'weighted-crunches', 1),
  ('ex-front-squats', 'ex-front-barbell-squat', 'front-barbell-squat', 1),
  ('ex-front-plank', 'ex-plank', 'plank', 1),
  ('ex-cable-triceps-press', 'ex-triceps-pushdown', 'triceps-pushdown', 1),
  ('ex-l-hold', 'ex-l-sit', 'l-sit', 1),
  ('ex-lateral-to-front-raises', 'ex-shoulder-raise-side-and-front-db', 'shoulder-raise-side-and-front-db', 1),
  ('ex-bench-dips-on-floor', 'ex-floor-dips', 'floor-dips', 1);

-- 1) Rename one existing old row per missing target.
UPDATE "Exercise" e
SET id = r.new_id, slug = r.new_slug, "updatedAt" = NOW()
FROM (
  SELECT DISTINCT ON (m.new_id) m.old_id, m.new_id, m.new_slug
  FROM _retired_exercise_map m
  JOIN "Exercise" o ON o.id = m.old_id
  WHERE NOT EXISTS (SELECT 1 FROM "Exercise" n WHERE n.id = m.new_id OR n.slug = m.new_slug)
  ORDER BY m.new_id, m.priority, m.old_id
) r
WHERE e.id = r.old_id;

-- Keep old rows whose replacement could not be created (slug taken by an unrelated row).
DELETE FROM _retired_exercise_map m
WHERE NOT EXISTS (SELECT 1 FROM "Exercise" n WHERE n.id = m.new_id)
  AND EXISTS (SELECT 1 FROM "Exercise" o WHERE o.id = m.old_id);

-- 2) Re-point everything else that still uses a retired id.
UPDATE "WorkoutTemplateExercise" t SET "exerciseId" = m.new_id FROM _retired_exercise_map m WHERE t."exerciseId" = m.old_id;
UPDATE "StretchingRoutineExercise" t SET "exerciseId" = m.new_id FROM _retired_exercise_map m WHERE t."exerciseId" = m.old_id;
UPDATE "SessionExercise" t SET "exerciseId" = m.new_id FROM _retired_exercise_map m WHERE t."exerciseId" = m.old_id;
UPDATE "SessionExercise" t SET "replacedExerciseId" = m.new_id FROM _retired_exercise_map m WHERE t."replacedExerciseId" = m.old_id;

UPDATE "WorkoutTemplateExercise" t
SET "alternativeExerciseIds" = (
  SELECT COALESCE(array_agg(DISTINCT COALESCE(m.new_id, u.alt_id)), ARRAY[]::TEXT[])
  FROM unnest(t."alternativeExerciseIds") AS u(alt_id)
  LEFT JOIN _retired_exercise_map m ON m.old_id = u.alt_id
)
WHERE t."alternativeExerciseIds" && (SELECT array_agg(old_id) FROM _retired_exercise_map);

UPDATE "SessionExercise" t
SET "alternativeExerciseIds" = (
  SELECT COALESCE(array_agg(DISTINCT COALESCE(m.new_id, u.alt_id)), ARRAY[]::TEXT[])
  FROM unnest(t."alternativeExerciseIds") AS u(alt_id)
  LEFT JOIN _retired_exercise_map m ON m.old_id = u.alt_id
)
WHERE t."alternativeExerciseIds" && (SELECT array_agg(old_id) FROM _retired_exercise_map);

DELETE FROM "ExerciseAlternative"
WHERE "exerciseId" IN (SELECT old_id FROM _retired_exercise_map)
   OR "alternativeExerciseId" IN (SELECT old_id FROM _retired_exercise_map);

DELETE FROM "Exercise" WHERE id IN (SELECT old_id FROM _retired_exercise_map);

DROP TABLE _retired_exercise_map;
