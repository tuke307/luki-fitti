/**
 * Grant (or revoke) admin permissions and feature grants for a user by email.
 *
 *   yarn --cwd packages/database admin:grant you@example.com            # all admin permissions + all features
 *   yarn --cwd packages/database admin:grant you@example.com --revoke   # remove all admin permissions
 *   yarn --cwd packages/database admin:grant you@example.com --permissions=USERS_MANAGE --features=
 *
 * Runs against DATABASE_URL (loaded from .env.local by the script wrapper). The user must
 * already have registered; no accounts or credentials are created here.
 */
import prisma from './client';
import { ADMIN_PERMISSIONS, FEATURE_GRANTS } from '@luki-fitti/common/enums';

function parseList(arg: string | undefined, allowed: readonly string[], label: string): string[] {
  if (arg === undefined) return [...allowed];
  const values = arg
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  const invalid = values.filter((v) => !allowed.includes(v));
  if (invalid.length) {
    throw new Error(`Unknown ${label}: ${invalid.join(', ')}. Allowed: ${allowed.join(', ')}`);
  }
  return values;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const email = args.find((a) => !a.startsWith('--'))?.trim().toLowerCase();
  if (!email) {
    throw new Error('Usage: admin:grant <email> [--revoke] [--permissions=A,B] [--features=X,Y]');
  }
  const flag = (name: string) =>
    args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const revoke = args.includes('--revoke');

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new Error(`No user with email ${email}. Register in the app first.`);

  const permissions = revoke ? [] : parseList(flag('permissions'), ADMIN_PERMISSIONS, 'permissions');
  const featureGrants = revoke
    ? undefined
    : parseList(flag('features'), FEATURE_GRANTS, 'features');

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { permissions, ...(featureGrants ? { featureGrants } : {}) },
    select: { email: true, permissions: true, featureGrants: true },
  });
  console.log(
    `${updated.email}\n  permissions:   ${updated.permissions.join(', ') || '—'}\n  featureGrants: ${updated.featureGrants.join(', ') || '—'}`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
