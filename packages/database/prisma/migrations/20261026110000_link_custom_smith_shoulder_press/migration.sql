-- The custom exercise "Sitzendes Schulterdrücken Multipresse" was created because the catalog had
-- no Smith machine shoulder press. The imported catalog now has one: create that system row (the
-- rest of the imported catalog is upserted by the API on first use) and re-point the custom
-- copies' references (templates, sessions, alternative id arrays) to it, then remove the copies.

INSERT INTO "Exercise" (id, slug, "userId", name, description, instructions, category, "exerciseType", "primaryMuscleGroup", equipment, "recommendedDurationSeconds", tags, "isSystem", "createdAt", "updatedAt")
VALUES ('ex-smith-machine-overhead-shoulder-press', 'smith-machine-overhead-shoulder-press', NULL, 'Smith Machine Overhead Shoulder Press', 'Smith machine exercise for the shoulders, with triceps assisting.', ARRAY['To begin, place a flat bench (or preferably one with back support) underneath a smith machine. Position the barbell at a height so that when seated on the flat bench, the arms must be almost fully extended to reach the barbell.', 'Once you have the correct height, sit slightly in behind the barbell so that there is an imaginary straight line from the tip of your nose to the barbell. Your feet should be stationary. Grab the barbell with the palms facing forward, unlock it and lift it up so that your arms are fully extended. This is the starting position.', 'Slowly begin to lower the barbell until it is level with your chin while inhaling.', 'Then lift the barbell back to the starting position using your shoulders while exhaling.', 'Repeat for the recommended amount of repetitions.']::TEXT[], 'MACHINE'::"ExerciseCategory", 'STRENGTH'::"ExerciseType", 'SHOULDERS'::"MuscleGroup", 'SMITH_MACHINE'::"EquipmentType", NULL, ARRAY['smith machine overhead shoulder press', 'schulterdrücken an der multipresse']::TEXT[], true, NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;

INSERT INTO "ExerciseMuscleGroup" (id, "exerciseId", "muscleGroup", "isPrimary")
VALUES (gen_random_uuid()::TEXT, 'ex-smith-machine-overhead-shoulder-press', 'SHOULDERS'::"MuscleGroup", true),
       (gen_random_uuid()::TEXT, 'ex-smith-machine-overhead-shoulder-press', 'TRICEPS'::"MuscleGroup", false)
ON CONFLICT DO NOTHING;

DROP TABLE IF EXISTS _custom_smith_press_map;
CREATE TEMP TABLE _custom_smith_press_map AS
  SELECT o.id AS old_id, 'ex-smith-machine-overhead-shoulder-press'::TEXT AS new_id
  FROM "Exercise" o
  WHERE o."isSystem" = false
    AND lower(trim(o.name)) = lower('Sitzendes Schulterdrücken Multipresse');

UPDATE "WorkoutTemplateExercise" t SET "exerciseId" = m.new_id FROM _custom_smith_press_map m WHERE t."exerciseId" = m.old_id;
UPDATE "StretchingRoutineExercise" t SET "exerciseId" = m.new_id FROM _custom_smith_press_map m WHERE t."exerciseId" = m.old_id;
UPDATE "SessionExercise" t SET "exerciseId" = m.new_id FROM _custom_smith_press_map m WHERE t."exerciseId" = m.old_id;

UPDATE "WorkoutTemplateExercise" t
SET "alternativeExerciseIds" = (
  SELECT COALESCE(array_agg(DISTINCT COALESCE(m.new_id, u.alt_id)), ARRAY[]::TEXT[])
  FROM unnest(t."alternativeExerciseIds") AS u(alt_id)
  LEFT JOIN _custom_smith_press_map m ON m.old_id = u.alt_id
)
WHERE t."alternativeExerciseIds" && (SELECT COALESCE(array_agg(old_id), ARRAY[]::TEXT[]) FROM _custom_smith_press_map);

UPDATE "SessionExercise" t
SET "alternativeExerciseIds" = (
  SELECT COALESCE(array_agg(DISTINCT COALESCE(m.new_id, u.alt_id)), ARRAY[]::TEXT[])
  FROM unnest(t."alternativeExerciseIds") AS u(alt_id)
  LEFT JOIN _custom_smith_press_map m ON m.old_id = u.alt_id
)
WHERE t."alternativeExerciseIds" && (SELECT COALESCE(array_agg(old_id), ARRAY[]::TEXT[]) FROM _custom_smith_press_map);

DELETE FROM "ExerciseAlternative"
WHERE "exerciseId" IN (SELECT old_id FROM _custom_smith_press_map)
   OR "alternativeExerciseId" IN (SELECT old_id FROM _custom_smith_press_map);

DELETE FROM "Exercise" WHERE id IN (SELECT old_id FROM _custom_smith_press_map);

DROP TABLE _custom_smith_press_map;
