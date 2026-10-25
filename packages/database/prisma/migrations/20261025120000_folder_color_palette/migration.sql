-- Move folder accents from the old neon palette to the calmer redesign palette.
-- Unknown/custom colors are left untouched.
UPDATE "WorkoutFolder"
SET "color" = CASE UPPER("color")
    WHEN '#CCFF00' THEN '#5E9C76'
    WHEN '#00E5FF' THEN '#3A7BD5'
    WHEN '#FF6B00' THEN '#E8743B'
    WHEN '#A855F7' THEN '#8E6CC4'
    WHEN '#22C55E' THEN '#5E9C76'
    ELSE "color"
  END
WHERE UPPER("color") IN ('#CCFF00', '#00E5FF', '#FF6B00', '#A855F7', '#22C55E');

ALTER TABLE "WorkoutFolder" ALTER COLUMN "color" SET DEFAULT '#E8743B';
