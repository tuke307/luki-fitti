export const DATABASE_URL =
  process.env.DATABASE_URL || `postgresql://postgres:postgres@localhost:5432/luki_fitti`;

/// Scratch database prisma migrate diff/dev uses to replay migrations.
export const SHADOW_DATABASE_URL = process.env.SHADOW_DATABASE_URL;
