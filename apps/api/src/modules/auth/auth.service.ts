import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import bcrypt from 'bcrypt';
import { BCRYPT_SALT_ROUNDS } from '@/config/env.config';
import { PrismaService } from '../database/prisma.service';
import {
  DEFAULT_STARTER_FOLDER,
  DEFAULT_STARTER_TEMPLATES,
  DEFAULT_STRETCHING_ROUTINES,
  INITIAL_EXERCISE_CATALOG,
} from '@luki-fitti/common/catalog';
import { WeightUnit } from '@luki-fitti/common/enums';
import type {
  RegisterDto,
  UpdatePreferencesDto,
  UserDto,
} from '@luki-fitti/common/schemas';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
  }

  async ensureSystemCatalogSeeded(): Promise<void> {
    const count = await this.prisma.exercise.count({ where: { isSystem: true } });
    if (count >= INITIAL_EXERCISE_CATALOG.length) return;

    for (const item of INITIAL_EXERCISE_CATALOG) {
      await this.prisma.exercise.upsert({
        where: { slug: item.slug },
        update: {},
        create: {
          id: item.id,
          slug: item.slug,
          name: item.name,
          description: item.description,
          instructions: item.instructions,
          category: item.category,
          exerciseType: item.exerciseType,
          primaryMuscleGroup: item.primaryMuscleGroup,
          equipment: item.equipment,
          recommendedDurationSeconds: item.recommendedDurationSeconds,
          tags: item.tags,
          isSystem: true,
        },
      });
    }
  }

  async registerUser(dto: RegisterDto): Promise<UserDto> {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await this.hashPassword(dto.password);
    await this.ensureSystemCatalogSeeded();

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          name: dto.name?.trim() || email.split('@')[0] || 'Athlete',
          passwordHash,
          lastLoginAt: new Date(),
          preferences: {
            create: {
              weightUnit: dto.weightUnit ?? WeightUnit.KG,
              defaultRestSeconds: 90,
              theme: 'dark',
              restTimerSound: true,
              weeklyGoalSessions: 4,
            },
          },
        },
        include: { preferences: true },
      });

      const folder = await tx.workoutFolder.create({
        data: {
          userId: user.id,
          name: DEFAULT_STARTER_FOLDER.name,
          color: DEFAULT_STARTER_FOLDER.color,
          sortOrder: 0,
        },
      });

      for (const tpl of DEFAULT_STARTER_TEMPLATES) {
        const createdTpl = await tx.workoutTemplate.create({
          data: {
            userId: user.id,
            folderId: folder.id,
            name: tpl.name,
            description: tpl.description,
            estimatedDurationMinutes: tpl.estimatedDurationMinutes,
            sortOrder: tpl.sortOrder,
          },
        });

        for (const ex of tpl.exercises) {
          await tx.workoutTemplateExercise.create({
            data: {
              templateId: createdTpl.id,
              exerciseId: ex.exerciseId,
              orderIndex: ex.orderIndex,
              plannedSets: ex.plannedSets,
              warmupSets: ex.warmupSets,
              targetRepsMin: ex.targetRepsMin,
              targetRepsMax: ex.targetRepsMax,
              targetWeight: ex.targetWeight,
              weightUnit: ex.weightUnit,
              restSeconds: ex.restSeconds,
              notes: ex.notes,
              alternativeExerciseIds: ex.alternativeExerciseIds,
            },
          });
        }
      }

      for (const routine of DEFAULT_STRETCHING_ROUTINES) {
        const createdRoutine = await tx.stretchingRoutine.create({
          data: {
            userId: user.id,
            name: routine.name,
            description: routine.description,
            targetArea: routine.targetArea,
            estimatedDurationSeconds: routine.estimatedDurationSeconds,
          },
        });

        for (const ex of routine.exercises) {
          await tx.stretchingRoutineExercise.create({
            data: {
              routineId: createdRoutine.id,
              exerciseId: ex.exerciseId,
              orderIndex: ex.orderIndex,
              sets: ex.sets,
              durationSeconds: ex.durationSeconds,
              reps: ex.reps,
              transitionSeconds: ex.transitionSeconds,
              notes: ex.notes,
            },
          });
        }
      }

      return user;
    });

    return this.formatUserDto(created);
  }

  async authenticateUser(email: string, password: string): Promise<UserDto> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { preferences: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new ForbiddenException(
        `Account temporarily locked due to repeated failed login attempts. Try again in ${minutesLeft} min.`,
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      const nextAttempts = user.failedLoginAttempts + 1;
      const lockedUntil =
        nextAttempts >= MAX_FAILED_ATTEMPTS
          ? new Date(Date.now() + LOCKOUT_DURATION_MS)
          : null;

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: nextAttempts,
          lockedUntil,
        },
      });

      throw new UnauthorizedException('Invalid email or password');
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
      include: { preferences: true },
    });

    return this.formatUserDto(updated);
  }

  async getUserById(userId: string): Promise<UserDto | null> {
    if (typeof userId !== 'string' || !userId.trim()) {
      return null;
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { preferences: true },
    });
    if (!user) return null;
    return this.formatUserDto(user);
  }

  async updatePreferences(userId: string, dto: UpdatePreferencesDto): Promise<UserDto> {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { preferences: true },
    });
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const { name, ...prefFields } = dto;
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(name !== undefined ? { name } : {}),
        preferences: {
          upsert: {
            create: {
              weightUnit: prefFields.weightUnit ?? WeightUnit.KG,
              distanceUnit: prefFields.distanceUnit,
              defaultRestSeconds: prefFields.defaultRestSeconds ?? 90,
              theme: prefFields.theme ?? 'dark',
              restTimerSound: prefFields.restTimerSound ?? true,
              weeklyGoalSessions: prefFields.weeklyGoalSessions ?? 4,
            },
            update: {
              ...(prefFields.weightUnit !== undefined ? { weightUnit: prefFields.weightUnit } : {}),
              ...(prefFields.distanceUnit !== undefined
                ? { distanceUnit: prefFields.distanceUnit }
                : {}),
              ...(prefFields.defaultRestSeconds !== undefined
                ? { defaultRestSeconds: prefFields.defaultRestSeconds }
                : {}),
              ...(prefFields.theme !== undefined ? { theme: prefFields.theme } : {}),
              ...(prefFields.restTimerSound !== undefined
                ? { restTimerSound: prefFields.restTimerSound }
                : {}),
              ...(prefFields.weeklyGoalSessions !== undefined
                ? { weeklyGoalSessions: prefFields.weeklyGoalSessions }
                : {}),
            },
          },
        },
      },
      include: { preferences: true },
    });

    return this.formatUserDto(updated);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isCurrentValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isCurrentValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const isSameAsCurrent = await bcrypt.compare(newPassword, user.passwordHash);
    if (isSameAsCurrent) {
      throw new BadRequestException('New password must be different from current password');
    }

    const passwordHash = await this.hashPassword(newPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    await this.prisma.refreshToken.deleteMany({ where: { userId } });
    return { success: true };
  }

  private formatUserDto(user: {
    id: string;
    email: string;
    name: string | null;
    lastLoginAt: Date | null;
    createdAt: Date;
    preferences?: {
      id: string;
      userId: string;
      weightUnit: any;
      distanceUnit: any;
      defaultRestSeconds: number;
      theme: string;
      restTimerSound: boolean;
      weeklyGoalSessions: number;
    } | null;
  }): UserDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
      createdAt: user.createdAt.toISOString(),
      preferences: user.preferences
        ? {
            id: user.preferences.id,
            userId: user.preferences.userId,
            weightUnit: user.preferences.weightUnit,
            distanceUnit: user.preferences.distanceUnit,
            defaultRestSeconds: user.preferences.defaultRestSeconds,
            theme: user.preferences.theme,
            restTimerSound: user.preferences.restTimerSound,
            weeklyGoalSessions: user.preferences.weeklyGoalSessions,
          }
        : null,
    };
  }
}
