-- CreateEnum: how an exercise moves and whether it works one side at a time, so replacements can
-- match the movement instead of only the muscle group. Only set for custom exercises; system
-- exercises take it from the catalog.
CREATE TYPE "MovementPattern" AS ENUM ('HORIZONTAL_PULL', 'VERTICAL_PULL', 'SHOULDER_EXTENSION', 'HORIZONTAL_PUSH', 'INCLINE_PUSH', 'VERTICAL_PUSH', 'DIP', 'FLY', 'LATERAL_RAISE', 'FRONT_RAISE', 'REAR_DELT', 'UPRIGHT_ROW', 'SHRUG', 'SHOULDER_ROTATION', 'ELBOW_FLEXION', 'ELBOW_EXTENSION', 'WRIST', 'SQUAT', 'HINGE', 'LUNGE', 'KNEE_EXTENSION', 'KNEE_FLEXION', 'HIP_THRUST', 'HIP_EXTENSION', 'HIP_ABDUCTION', 'HIP_ADDUCTION', 'HIP_FLEXION', 'CALF_RAISE', 'BACK_EXTENSION', 'CORE_FLEXION', 'ANTI_EXTENSION', 'LATERAL_FLEXION', 'ROTATION', 'CARRY', 'OLYMPIC_LIFT');

CREATE TYPE "Laterality" AS ENUM ('BILATERAL', 'UNILATERAL');

-- AlterTable
ALTER TABLE "Exercise" ADD COLUMN "movementPattern" "MovementPattern",
ADD COLUMN "laterality" "Laterality";
