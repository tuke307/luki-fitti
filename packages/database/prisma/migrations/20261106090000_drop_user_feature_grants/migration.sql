-- Drop the per-user AI feature grants: every usable OpenRouter key now
-- unlocks every globally enabled feature.
ALTER TABLE "User" DROP COLUMN "featureGrants";
