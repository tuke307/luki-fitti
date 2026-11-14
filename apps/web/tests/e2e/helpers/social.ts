/**
 * Social e2e helpers: seed verified users and flip the social kill switch
 * straight in the dev database — the seeded admin password isn't part of the
 * repo, so the admin UI can't drive this in tests.
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Same convention as playwright.config.ts; the api env holds DATABASE_URL.
config({ path: resolve(__dirname, '../../.env.local') });
config({ path: resolve(__dirname, '../../../api/.env.local') });

import bcrypt from 'bcrypt';
import prisma from '@luki-fitti/database';

export interface SeededSocialUser {
  id: string;
  email: string;
  password: string;
  name: string;
}

/** Enables `socialEnabled` on the singleton AppSettings row (creates it on fresh DBs). */
export async function enableSocialForE2e(): Promise<void> {
  await prisma.appSettings.upsert({
    where: { id: 1 },
    update: { socialEnabled: true },
    create: { id: 1, socialEnabled: true },
  });
}

/** Creates an already-verified user so the spec can sign in without Mailpit. */
export async function seedSocialUser(
  prefix: string,
  password = 'SocialE2ePass123!',
  handle?: string,
): Promise<SeededSocialUser> {
  const unique = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`;
  const email = `e2e.social.${prefix}.${unique}@lukifitti.test`;
  const user = await prisma.user.create({
    data: {
      email,
      name: `E2E Social ${prefix}`,
      passwordHash: await bcrypt.hash(password, 10),
      emailVerified: true,
      ...(handle ? { handle, handleChangedAt: new Date() } : {}),
    },
  });
  return { id: user.id, email, password, name: `E2E Social ${prefix}` };
}
