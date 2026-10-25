-- Link users' untouched copies of starter content to their catalog definition.
-- While "systemKey" is set the API serves the text (name, description, target area, notes) from
-- the catalog in the requested language; editing a copy clears it.

ALTER TABLE "WorkoutFolder" ADD COLUMN "systemKey" TEXT;
ALTER TABLE "WorkoutTemplate" ADD COLUMN "systemKey" TEXT;
ALTER TABLE "StretchingRoutine" ADD COLUMN "systemKey" TEXT;

-- Folders: still carrying the starter name.
UPDATE "WorkoutFolder" f
SET "systemKey" = s.key
FROM (VALUES
  ('folder-4er-split', '4er Split (Hypertrophy)'),
  ('folder-ppl-split', 'Push / Pull / Legs (PPL)'),
  ('folder-5er-brosplit', '5er Split (Bro Split)')
) AS s(key, name)
WHERE f."systemKey" IS NULL AND f.name = s.name;

-- Templates: name, description and every exercise (position, exercise, notes) unchanged.
WITH starter_exercise(key, order_index, exercise_id, notes) AS (VALUES
  ('tpl-chest-triceps', 0, 'ex-barbell-bench-press', 'Keep 1 RIR on working sets. Pause 1s on chest.'),
  ('tpl-chest-triceps', 1, 'ex-dumbbell-incline-press', '30° bench angle, deep stretch at bottom.'),
  ('tpl-chest-triceps', 2, 'ex-cable-chest-fly', 'Squeeze 1s at peak contraction.'),
  ('tpl-chest-triceps', 3, 'ex-overhead-cable-tricep-extension', 'Focus on long-head stretch.'),
  ('tpl-chest-triceps', 4, 'ex-cable-tricep-pushdown', 'Spread rope at bottom lockout.'),
  ('tpl-back-biceps', 0, 'ex-weighted-pull-up', 'Full dead hang to chin over bar.'),
  ('tpl-back-biceps', 1, 'ex-barbell-bent-over-row', 'Strict torso angle.'),
  ('tpl-back-biceps', 2, 'ex-seated-cable-row', 'Protract on eccentric, retract hard.'),
  ('tpl-back-biceps', 3, 'ex-incline-dumbbell-curl', 'Keep elbows behind torso.'),
  ('tpl-back-biceps', 4, 'ex-hammer-curl', 'Brachialis & forearm finisher.'),
  ('tpl-legs', 0, 'ex-barbell-back-squat', 'Below parallel depth.'),
  ('tpl-legs', 1, 'ex-romanian-deadlift', 'Push hips back, feel hamstring stretch.'),
  ('tpl-legs', 2, 'ex-leg-extension', '1s pause at top.'),
  ('tpl-legs', 3, 'ex-seated-leg-curl', 'Lock thigh pad tightly.'),
  ('tpl-legs', 4, 'ex-standing-calf-raise', '2s pause in bottom stretch.'),
  ('tpl-shoulders-core', 0, 'ex-overhead-barbell-press', 'Brace glutes & abs.'),
  ('tpl-shoulders-core', 1, 'ex-dumbbell-lateral-raise', 'Scapular plane, lead with elbows.'),
  ('tpl-shoulders-core', 2, 'ex-cable-face-pull', 'External rotation at forehead.'),
  ('tpl-shoulders-core', 3, 'ex-hanging-leg-raise', 'Posteriorly tilt pelvis.'),
  ('tpl-ppl-push', 0, 'ex-barbell-bench-press', 'Primary heavy press.'),
  ('tpl-ppl-push', 1, 'ex-seated-dumbbell-shoulder-press', 'Controlled scapular-plane press.'),
  ('tpl-ppl-push', 2, 'ex-dumbbell-incline-press', 'Upper pec stretch.'),
  ('tpl-ppl-push', 3, 'ex-dumbbell-lateral-raise', 'Superset with Rope Tricep Pushdown.'),
  ('tpl-ppl-push', 4, 'ex-cable-tricep-pushdown', 'Full elbow lockout.'),
  ('tpl-ppl-pull', 0, 'ex-weighted-pull-up', 'Full stretch at bottom.'),
  ('tpl-ppl-pull', 1, 'ex-barbell-bent-over-row', 'Drive elbows behind hips.'),
  ('tpl-ppl-pull', 2, 'ex-seated-cable-row', '1s scapular squeeze.'),
  ('tpl-ppl-pull', 3, 'ex-cable-face-pull', 'External rotation at top.'),
  ('tpl-ppl-pull', 4, 'ex-ez-bar-bicep-curl', 'Strict elbows.'),
  ('tpl-ppl-legs', 0, 'ex-barbell-back-squat', 'Deep controlled eccentric.'),
  ('tpl-ppl-legs', 1, 'ex-romanian-deadlift', 'Keep bar close to shins.'),
  ('tpl-ppl-legs', 2, 'ex-leg-press', 'Full quad ROM.'),
  ('tpl-ppl-legs', 3, 'ex-lying-leg-curl', 'Keep hips pressed into pad.'),
  ('tpl-ppl-legs', 4, 'ex-standing-calf-raise', '2s stretch at bottom.'),
  ('tpl-bro-chest', 0, 'ex-barbell-bench-press', 'Heavy compound opener.'),
  ('tpl-bro-chest', 1, 'ex-dumbbell-incline-press', 'Upper chest focus.'),
  ('tpl-bro-chest', 2, 'ex-machine-chest-press', 'Controlled 3s eccentric.'),
  ('tpl-bro-chest', 3, 'ex-cable-chest-fly', 'Peak contraction finisher.'),
  ('tpl-bro-back', 0, 'ex-conventional-deadlift', 'Reset on floor each rep.'),
  ('tpl-bro-back', 1, 'ex-weighted-pull-up', 'Wide pronated grip.'),
  ('tpl-bro-back', 2, 'ex-barbell-bent-over-row', 'Row to lower ribs.'),
  ('tpl-bro-back', 3, 'ex-lat-pulldown', 'Full lat stretch at top.'),
  ('tpl-bro-back', 4, 'ex-seated-cable-row', 'Squeeze rhomboids 1s.'),
  ('tpl-bro-shoulders', 0, 'ex-overhead-barbell-press', 'Strict standing OHP.'),
  ('tpl-bro-shoulders', 1, 'ex-seated-dumbbell-shoulder-press', 'Full ROM.'),
  ('tpl-bro-shoulders', 2, 'ex-dumbbell-lateral-raise', 'Lead with elbows.'),
  ('tpl-bro-shoulders', 3, 'ex-cable-face-pull', 'Rear delts & rotator cuff.'),
  ('tpl-bro-shoulders', 4, 'ex-cable-crunch', 'Spinal flexion.'),
  ('tpl-bro-legs', 0, 'ex-leg-extension', 'Pre-exhaust quads & warm up knees.'),
  ('tpl-bro-legs', 1, 'ex-leg-press', 'Deep sled travel.'),
  ('tpl-bro-legs', 2, 'ex-lying-leg-curl', '1s hold at peak flexion.'),
  ('tpl-bro-legs', 3, 'ex-hip-adduction-abduction', 'Controlled eccentric.'),
  ('tpl-bro-legs', 4, 'ex-standing-calf-raise', 'Full plantarflexion.'),
  ('tpl-bro-arms', 0, 'ex-ez-bar-bicep-curl', 'Superset with Rope Tricep Pushdown.'),
  ('tpl-bro-arms', 1, 'ex-cable-tricep-pushdown', 'Spread rope at bottom.'),
  ('tpl-bro-arms', 2, 'ex-incline-dumbbell-curl', 'Superset with Overhead Cable Tricep Extension.'),
  ('tpl-bro-arms', 3, 'ex-overhead-cable-tricep-extension', 'Deep long-head stretch.'),
  ('tpl-bro-arms', 4, 'ex-hammer-curl', 'Brachialis & forearm thickness.')
)
UPDATE "WorkoutTemplate" t
SET "systemKey" = s.key
FROM (VALUES
  ('tpl-chest-triceps', 'Day 1 — Chest & Triceps', 'Heavy horizontal & incline pressing paired with long-head and lateral triceps work.'),
  ('tpl-back-biceps', 'Day 2 — Back & Biceps', 'Vertical lats width, horizontal mid-back density, and lengthened-bias biceps curls.'),
  ('tpl-legs', 'Day 3 — Legs & Posterior Chain', 'Squat pattern, hip hinge RDL, unilateral quad/glute work, and calves.'),
  ('tpl-shoulders-core', 'Day 4 — Shoulders & Core', 'Overhead pressing, medial/rear deltoid volume, abs, and hip flexor strength.'),
  ('tpl-ppl-push', 'Push — Chest, Shoulders & Triceps', 'Complete anterior pressing session hitting chest, front/lateral delts, and triceps.'),
  ('tpl-ppl-pull', 'Pull — Back, Rear Delts & Biceps', 'Vertical and horizontal pulling paired with rear deltoid and bicep hypertrophy.'),
  ('tpl-ppl-legs', 'Legs — Quads, Hamstrings, Glutes & Calves', 'High-intensity lower-body session balancing quad knee flexion and posterior chain hinge.'),
  ('tpl-bro-chest', 'Day 1 — Chest Day', 'Dedicated chest hypertrophy across flat, incline, machine, and cable angles.'),
  ('tpl-bro-back', 'Day 2 — Back Day', 'Complete back thickness and lat width session from deadlifts to vertical pulls.'),
  ('tpl-bro-shoulders', 'Day 3 — Shoulders & Core', '3D deltoid volume (anterior, lateral, posterior) plus weighted abdominal work.'),
  ('tpl-bro-legs', 'Day 4 — Legs & Calves', 'High-volume leg day covering quads, hamstrings, glutes, adductors, and calves.'),
  ('tpl-bro-arms', 'Day 5 — Arm Blaster (Biceps & Triceps)', 'Dedicated arm hypertrophy with antagonist biceps/triceps supersets and forearm work.')
) AS s(key, name, description)
WHERE t."systemKey" IS NULL
  AND t.name = s.name
  AND t.description IS NOT DISTINCT FROM s.description
  AND (SELECT count(*) FROM "WorkoutTemplateExercise" te WHERE te."templateId" = t.id)
    = (SELECT count(*) FROM starter_exercise se WHERE se.key = s.key)
  AND NOT EXISTS (
    SELECT 1 FROM "WorkoutTemplateExercise" te
    WHERE te."templateId" = t.id
      AND NOT EXISTS (
        SELECT 1 FROM starter_exercise se
        WHERE se.key = s.key
          AND se.order_index = te."orderIndex"
          AND se.exercise_id = te."exerciseId"
          AND se.notes IS NOT DISTINCT FROM te.notes
      )
  );

-- Stretching routines: name, description, target area and every exercise unchanged.
WITH starter_exercise(key, order_index, exercise_id, notes) AS (VALUES
  ('stretch-lower-body-flow', 0, 'ex-couch-hip-flexor-stretch', '60s Left, 60s Right. Squeeze rear glute.'),
  ('stretch-lower-body-flow', 1, 'ex-90-90-hip-mobility', 'Smooth controlled transitions.'),
  ('stretch-lower-body-flow', 2, 'ex-pigeon-glute-stretch', 'Keep pelvis squared, hinge from hip crease.'),
  ('stretch-lower-body-flow', 3, 'ex-supine-hamstring-band-stretch', 'Deep nasal breathing.'),
  ('stretch-lower-body-flow', 4, 'ex-standing-wall-calf-stretch', '30s straight knee + 15s bent knee per side.'),
  ('stretch-upper-thoracic-reset', 0, 'ex-thoracic-open-book', 'Exhale on rotation.'),
  ('stretch-upper-thoracic-reset', 1, 'ex-doorway-pec-stretch', 'Avoid arching lower back.'),
  ('stretch-upper-thoracic-reset', 2, 'ex-childs-pose-lat-stretch', 'Walk hands left 30s, then right 30s.'),
  ('stretch-upper-thoracic-reset', 3, 'ex-cross-body-shoulder-stretch', 'Keep shoulder blade depressed.'),
  ('stretch-dynamic-warmup-flow', 0, 'ex-cat-cow-spinal-flow', 'Match movement to inhale and exhale.'),
  ('stretch-dynamic-warmup-flow', 1, 'ex-worlds-greatest-stretch', '5-6 dynamic lunges + T-spine reaches per side.'),
  ('stretch-dynamic-warmup-flow', 2, 'ex-deep-squat-ankle-pry', 'Shift weight gently over each ankle.'),
  ('stretch-dynamic-warmup-flow', 3, 'ex-dead-hang-shoulder-decompression', 'Relax lats and breathe deeply into ribcage.'),
  ('stretch-desk-posture-reset', 0, 'ex-neck-upper-trap-release', 'Gentle lateral tilt, anchor opposite hand behind back.'),
  ('stretch-desk-posture-reset', 1, 'ex-doorway-pec-stretch', 'Elbows at 90 degrees against doorway.'),
  ('stretch-desk-posture-reset', 2, 'ex-kneeling-wrist-forearm-stretch', 'Fingers pointed toward knees, rock hips back.'),
  ('stretch-desk-posture-reset', 3, 'ex-couch-hip-flexor-stretch', 'Open tight hip flexors from sitting.'),
  ('stretch-lumbar-glute-decompression', 0, 'ex-supine-knee-to-chest-twist', 'Slow diaphragmatic breaths into lower back.'),
  ('stretch-lumbar-glute-decompression', 1, 'ex-pigeon-glute-stretch', '60s per side.'),
  ('stretch-lumbar-glute-decompression', 2, 'ex-butterfly-adductor-stretch', 'Tall spine, press knees gently down.'),
  ('stretch-lumbar-glute-decompression', 3, 'ex-childs-pose-lat-stretch', 'Sink hips onto heels and lengthen spine.'),
  ('stretch-full-body-evening-recovery', 0, 'ex-cat-cow-spinal-flow', 'Slow 4-second inhale, 6-second exhale.'),
  ('stretch-full-body-evening-recovery', 1, 'ex-thoracic-open-book', 'Let top shoulder melt toward floor.'),
  ('stretch-full-body-evening-recovery', 2, 'ex-pigeon-glute-stretch', 'Release outer hip tension.'),
  ('stretch-full-body-evening-recovery', 3, 'ex-seated-pike-hamstring-fold', 'Relax neck and shoulders into the fold.'),
  ('stretch-full-body-evening-recovery', 4, 'ex-standing-quad-stretch', '45s per leg.'),
  ('stretch-full-body-evening-recovery', 5, 'ex-supine-knee-to-chest-twist', 'Finish with calm nasal breathing.')
)
UPDATE "StretchingRoutine" r
SET "systemKey" = s.key
FROM (VALUES
  ('stretch-lower-body-flow', 'Post-Leg Day Hip, Glute & Hamstring Flow', 'Decompresses the lumbar spine, opens tight hip flexors, releases the piriformis, and restores internal/external hip rotation.', 'Lower Body & Hips'),
  ('stretch-upper-thoracic-reset', 'Upper Body, Chest & Thoracic Opener', 'Ideal before or after pressing sessions to open the chest, lats, shoulders, and thoracic spine.', 'Upper Body & Thoracic'),
  ('stretch-dynamic-warmup-flow', '10-Min Pre-Workout Dynamic Mobility Warm-Up', 'Activates hip capsule rotation, ankle dorsiflexion, and thoracic extension before heavy compound lifts.', 'Full Body Readiness'),
  ('stretch-desk-posture-reset', 'Desk Posture, Neck & Wrist Recovery Flow', 'Counteracts prolonged sitting and keyboard work by releasing the neck, pecs, wrists, and hip flexors.', 'Neck, Shoulders & Hips'),
  ('stretch-lumbar-glute-decompression', 'Lower Back Decompression & Glute Release', 'Relieves lumbar spine compression after squats, deadlifts, or long travel days.', 'Lumbar & Glutes'),
  ('stretch-full-body-evening-recovery', 'Full-Body Evening Mobility & Downregulation', 'Complete head-to-toe parasympathetic cooldown flow to improve recovery and sleep quality.', 'Full Body Recovery')
) AS s(key, name, description, target_area)
WHERE r."systemKey" IS NULL
  AND r.name = s.name
  AND r.description IS NOT DISTINCT FROM s.description
  AND r."targetArea" = s.target_area
  AND (SELECT count(*) FROM "StretchingRoutineExercise" re WHERE re."routineId" = r.id)
    = (SELECT count(*) FROM starter_exercise se WHERE se.key = s.key)
  AND NOT EXISTS (
    SELECT 1 FROM "StretchingRoutineExercise" re
    WHERE re."routineId" = r.id
      AND NOT EXISTS (
        SELECT 1 FROM starter_exercise se
        WHERE se.key = s.key
          AND se.order_index = re."orderIndex"
          AND se.exercise_id = re."exerciseId"
          AND se.notes IS NOT DISTINCT FROM re.notes
      )
  );
