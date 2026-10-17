import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { WeightUnit } from '@luki-fitti/common/enums';

function createMockPrisma() {
  const users = new Map<string, any>();
  const refreshTokens: any[] = [];

  const prisma: any = {
    exercise: {
      count: async () => 50,
      upsert: async () => ({}),
    },
    user: {
      findUnique: async ({ where }: any) => {
        if (where.email) {
          return Array.from(users.values()).find((u) => u.email === where.email) ?? null;
        }
        if (where.id) {
          return users.get(where.id) ?? null;
        }
        return null;
      },
      create: async ({ data }: any) => {
        const id = `user-${users.size + 1}`;
        const user = {
          id,
          email: data.email,
          name: data.name,
          passwordHash: data.passwordHash,
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: data.lastLoginAt ?? new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          preferences: {
            id: `pref-${id}`,
            userId: id,
            weightUnit: data.preferences?.create?.weightUnit ?? WeightUnit.KG,
            distanceUnit: 'KM',
            defaultRestSeconds: 90,
            theme: 'dark',
            restTimerSound: true,
            weeklyGoalSessions: 4,
          },
        };
        users.set(id, user);
        return user;
      },
      update: async ({ where, data }: any) => {
        const u = users.get(where.id);
        if (!u) throw new Error('Not found');
        Object.assign(u, data);
        return u;
      },
    },
    workoutFolder: {
      create: async ({ data }: any) => ({ id: 'folder-1', ...data }),
    },
    workoutTemplate: {
      create: async ({ data }: any) => ({ id: 'tpl-1', ...data }),
    },
    workoutTemplateExercise: {
      create: async ({ data }: any) => ({ id: 'tple-1', ...data }),
    },
    stretchingRoutine: {
      create: async ({ data }: any) => ({ id: 'sr-1', ...data }),
    },
    stretchingRoutineExercise: {
      create: async ({ data }: any) => ({ id: 'sre-1', ...data }),
    },
    refreshToken: {
      deleteMany: async () => ({ count: refreshTokens.length }),
    },
    $transaction: async (fn: any) => fn(prisma),
  };

  return prisma;
}

describe('AuthService — Registration, Authentication & Brute-Force Protection', () => {
  it('registers a new account, hashes password with bcrypt, and initializes preferences', async () => {
    const prisma = createMockPrisma();
    const service = new AuthService(prisma);

    const registered = await service.registerUser({
      email: 'GymBuddy@LukiFitti.de',
      password: 'FAKE-PASSWORD-TEST-123',
      name: 'GymBuddy',
      weightUnit: WeightUnit.KG,
    });

    assert.equal(registered.email, 'gymbuddy@lukifitti.de');
    assert.equal(registered.name, 'GymBuddy');
    assert.equal(registered.preferences?.weightUnit, WeightUnit.KG);

    const dbUser = await prisma.user.findUnique({ where: { id: registered.id } });
    assert.notEqual(dbUser.passwordHash, 'FAKE-PASSWORD-TEST-123');
    const valid = await bcrypt.compare('FAKE-PASSWORD-TEST-123', dbUser.passwordHash);
    assert.equal(valid, true);
  });

  it('rejects duplicate email registration with ConflictException', async () => {
    const prisma = createMockPrisma();
    const service = new AuthService(prisma);

    await service.registerUser({
      email: 'gymbuddy@example.com',
      password: 'FAKE-PASSWORD-TEST-123',
    });

    await assert.rejects(
      () =>
        service.registerUser({
          email: 'GYMBUDDY@example.com',
          password: 'FAKE-PASSWORD-TEST-456',
        }),
      /already exists/i,
    );
  });

  it('locks the account after 5 consecutive failed login attempts to prevent brute force', async () => {
    const prisma = createMockPrisma();
    const service = new AuthService(prisma);

    await service.registerUser({
      email: 'athlete@example.com',
      password: 'FAKE-PASSWORD-TEST-123',
    });

    for (let i = 0; i < 5; i++) {
      await assert.rejects(
        () => service.authenticateUser('athlete@example.com', 'WRONG-PASSWORD-999'),
        /Invalid email or password/i,
      );
    }

    // 6th attempt even with correct password must be rejected while locked
    await assert.rejects(
      () => service.authenticateUser('athlete@example.com', 'FAKE-PASSWORD-TEST-123'),
      /Account temporarily locked/i,
    );
  });
});
