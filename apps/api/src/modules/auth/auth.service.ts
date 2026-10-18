import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import {
  ACCOUNT_DELETION_EXPIRY_MS,
  BCRYPT_SALT_ROUNDS,
  EMAIL_VERIFICATION_EXPIRY_MS,
  PASSWORD_RESET_EXPIRY_MS,
} from '@/config/env.config';
import { PrismaService } from '../database/prisma.service';
import { EmailService } from '../email/email.service';
import {
  DEFAULT_STARTER_FOLDERS,
  DEFAULT_STARTER_TEMPLATES,
  DEFAULT_STRETCHING_ROUTINES,
  INITIAL_EXERCISE_CATALOG,
} from '@luki-fitti/common/catalog';
import { DistanceUnit, WeightUnit } from '@luki-fitti/common/enums';
import type {
  RegisterDto,
  RegisterResponseDto,
  UpdatePreferencesDto,
  UserDto,
} from '@luki-fitti/common/schemas';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly emailService?: EmailService,
  ) {}

  private hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

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

  async registerUser(dto: RegisterDto): Promise<RegisterResponseDto> {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await this.hashPassword(dto.password);
    const rawVerificationToken = crypto.randomBytes(32).toString('hex');
    const hashedVerificationToken = this.hashToken(rawVerificationToken);
    const verificationExpires = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_MS);

    await this.ensureSystemCatalogSeeded();

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          name: dto.name?.trim() || email.split('@')[0] || 'Athlete',
          passwordHash,
          emailVerified: false,
          emailVerificationToken: hashedVerificationToken,
          emailVerificationExpires: verificationExpires,
          lastLoginAt: null,
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

      for (const starterFolder of DEFAULT_STARTER_FOLDERS) {
        const folder = await tx.workoutFolder.create({
          data: {
            userId: user.id,
            name: starterFolder.name,
            color: starterFolder.color,
            sortOrder: starterFolder.sortOrder,
          },
        });

        const folderTemplates = DEFAULT_STARTER_TEMPLATES.filter(
          (t) => t.folderId === starterFolder.id,
        );
        for (const tpl of folderTemplates) {
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

    if (this.emailService) {
      await this.emailService
        .enqueueAccountConfirmationEmail(created, rawVerificationToken)
        .catch(() => undefined);
    }

    return {
      ...this.formatUserDto(created),
      requiresEmailConfirmation: true,
      message:
        'Account created! Please check your email and click the activation link to confirm your account.',
    };
  }

  async verifyEmail(rawToken: string): Promise<UserDto> {
    const trimmed = rawToken.trim();
    const hashed = this.hashToken(trimmed);
    const user = await this.prisma.user.findUnique({
      where: { emailVerificationToken: hashed },
      include: { preferences: true },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired confirmation link.');
    }

    if (user.emailVerificationExpires && user.emailVerificationExpires < new Date()) {
      throw new BadRequestException(
        'Confirmation link has expired. Please request a new confirmation email.',
      );
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null,
        lastLoginAt: new Date(),
      },
      include: { preferences: true },
    });

    return this.formatUserDto(updated);
  }

  async resendConfirmationEmail(email: string): Promise<{ success: boolean; message: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (user && user.emailVerified === false) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const hashed = this.hashToken(rawToken);
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerificationToken: hashed,
          emailVerificationExpires: new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_MS),
        },
      });

      if (this.emailService) {
        await this.emailService
          .enqueueAccountConfirmationEmail(user, rawToken)
          .catch(() => undefined);
      }
    }

    return {
      success: true,
      message:
        'If an unverified account exists for that email address, a new confirmation link has been sent.',
    };
  }

  async requestPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (user) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const hashed = this.hashToken(rawToken);
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetToken: hashed,
          passwordResetExpires: new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS),
        },
      });

      if (this.emailService) {
        await this.emailService
          .enqueuePasswordResetEmail(user, rawToken)
          .catch(() => undefined);
      }
    }

    return {
      success: true,
      message:
        'If an account with that email exists, a password reset link has been sent to your inbox.',
    };
  }

  async resetPassword(
    rawToken: string,
    newPassword: string,
  ): Promise<{ success: boolean; message: string }> {
    const trimmed = rawToken.trim();
    const hashed = this.hashToken(trimmed);
    const user = await this.prisma.user.findUnique({
      where: { passwordResetToken: hashed },
    });

    if (!user || !user.passwordResetExpires || user.passwordResetExpires < new Date()) {
      throw new BadRequestException(
        'Password reset link is invalid or has expired. Please request a new reset link.',
      );
    }

    const passwordHash = await this.hashPassword(newPassword);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpires: null,
        emailVerified: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    await this.prisma.refreshToken.deleteMany({ where: { userId: user.id } });

    return {
      success: true,
      message: 'Your password has been reset successfully. You can now sign in.',
    };
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

    if (user.emailVerified === false) {
      throw new ForbiddenException(
        'Please confirm your email address before signing in. Check your inbox for the activation link.',
      );
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

  async requestAccountDeletion(
    userId: string,
    password: string,
  ): Promise<{ success: boolean; message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashed = this.hashToken(rawToken);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        accountDeletionToken: hashed,
        accountDeletionExpires: new Date(Date.now() + ACCOUNT_DELETION_EXPIRY_MS),
      },
    });

    if (this.emailService) {
      await this.emailService
        .enqueueAccountDeletionEmail(user, rawToken)
        .catch(() => undefined);
    }

    return {
      success: true,
      message:
        'A confirmation link has been sent to your email address. Click the link in the email and confirm in your browser to permanently delete your account.',
    };
  }

  async confirmAccountDeletion(
    rawToken: string,
  ): Promise<{ success: boolean; userId: string; message: string }> {
    const trimmed = rawToken.trim();
    const hashed = this.hashToken(trimmed);
    const user = await this.prisma.user.findUnique({
      where: { accountDeletionToken: hashed },
    });

    if (!user || !user.accountDeletionExpires || user.accountDeletionExpires < new Date()) {
      throw new BadRequestException(
        'Account deletion link is invalid or has expired. Please request a new deletion link from your profile settings.',
      );
    }

    await this.prisma.user.delete({ where: { id: user.id } });

    return {
      success: true,
      userId: user.id,
      message: 'Your account and all associated workout data have been permanently deleted.',
    };
  }

  private formatUserDto(user: {
    id: string;
    email: string;
    name: string | null;
    emailVerified?: boolean;
    lastLoginAt: Date | null;
    createdAt: Date;
    preferences?: {
      id: string;
      userId: string;
      weightUnit: WeightUnit | `${WeightUnit}`;
      distanceUnit: DistanceUnit | `${DistanceUnit}`;
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
      emailVerified: user.emailVerified ?? true,
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
      createdAt: user.createdAt.toISOString(),
      preferences: user.preferences
        ? {
            id: user.preferences.id,
            userId: user.preferences.userId,
            weightUnit: user.preferences.weightUnit as WeightUnit,
            distanceUnit: user.preferences.distanceUnit as DistanceUnit,
            defaultRestSeconds: user.preferences.defaultRestSeconds,
            theme: user.preferences.theme,
            restTimerSound: user.preferences.restTimerSound,
            weeklyGoalSessions: user.preferences.weeklyGoalSessions,
          }
        : null,
    };
  }
}
