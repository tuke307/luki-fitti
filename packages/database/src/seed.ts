import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseJsonc } from 'jsonc-parser';
import prisma from './client';
import logger from '@luki-fitti/logger';
import { ALL_SYSTEM_EXERCISES } from '@luki-fitti/common/catalog/extended';
import {
  CORE_EXERCISE_CATALOG,
  DEFAULT_STARTER_FOLDERS,
  DEFAULT_STARTER_TEMPLATES,
  DEFAULT_STRETCHING_ROUTINES,
} from '@luki-fitti/common/catalog';
import { ADMIN_PERMISSIONS, FEATURE_GRANTS } from '@luki-fitti/common/enums';

interface SeedUser {
  email: string;
  name: string;
  passwordHash: string;
}

const currentDir = path.dirname(fileURLToPath(import.meta.url));

async function loadSeedUsers(): Promise<SeedUser[]> {
  const filePath = path.join(currentDir, '..', 'data', 'users.jsonc');
  return parseJsonc(await fs.promises.readFile(filePath, 'utf-8'));
}

async function main(): Promise<void> {
  const seedUsers = await loadSeedUsers();

  try {
    await prisma.$transaction(async (tx) => {
      // Seeded accounts are the project owners, so they get every permission and feature.
      // Skipped in production so fixture credentials never reach a live database.
      if (process.env.NODE_ENV !== 'production') {
        for (const seedUser of seedUsers) {
          const email = seedUser.email.toLowerCase();
          const grants = {
            permissions: [...ADMIN_PERMISSIONS],
            featureGrants: [...FEATURE_GRANTS],
          };
          await tx.user.upsert({
            where: { email },
            update: grants,
            create: { email, name: seedUser.name, passwordHash: seedUser.passwordHash, ...grants },
          });
        }
      }

      for (const item of ALL_SYSTEM_EXERCISES) {
        await tx.exercise.upsert({
          where: { slug: item.slug },
          update: {
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

        await tx.exerciseMuscleGroup.deleteMany({ where: { exerciseId: item.id } });
        await tx.exerciseMuscleGroup.create({
          data: {
            exerciseId: item.id,
            muscleGroup: item.primaryMuscleGroup,
            isPrimary: true,
          },
        });

        for (const sec of item.secondaryMuscleGroups) {
          if (sec !== item.primaryMuscleGroup) {
            await tx.exerciseMuscleGroup.create({
              data: {
                exerciseId: item.id,
                muscleGroup: sec,
                isPrimary: false,
              },
            });
          }
        }
      }

      for (const item of CORE_EXERCISE_CATALOG) {
        await tx.exerciseAlternative.deleteMany({ where: { exerciseId: item.id } });
        for (const altId of item.alternativeExerciseIds) {
          await tx.exerciseAlternative.create({
            data: {
              exerciseId: item.id,
              alternativeExerciseId: altId,
              reason: 'Equipment busy / biomechanical alternative',
            },
          });
        }
      }

      await tx.emailTemplate.upsert({
        where: { type: 'ACCOUNT_CONFIRMATION' },
        update: {
          name: 'Account Confirmation',
          subject: 'LukiFitti — Confirm your account ({{ name }})',
          htmlFile: 'account-confirmation.mjml',
        },
        create: {
          name: 'Account Confirmation',
          subject: 'LukiFitti — Confirm your account ({{ name }})',
          htmlFile: 'account-confirmation.mjml',
          type: 'ACCOUNT_CONFIRMATION',
        },
      });

      await tx.emailTemplate.upsert({
        where: { type: 'PASSWORD_RESET' },
        update: {
          name: 'Password Reset',
          subject: 'LukiFitti — Reset your password',
          htmlFile: 'password-reset.mjml',
        },
        create: {
          name: 'Password Reset',
          subject: 'LukiFitti — Reset your password',
          htmlFile: 'password-reset.mjml',
          type: 'PASSWORD_RESET',
        },
      });

      await tx.emailTemplate.upsert({
        where: { type: 'ACCOUNT_DELETION' },
        update: {
          name: 'Account Deletion',
          subject: 'LukiFitti — Confirm account deletion',
          htmlFile: 'account-deletion.mjml',
        },
        create: {
          name: 'Account Deletion',
          subject: 'LukiFitti — Confirm account deletion',
          htmlFile: 'account-deletion.mjml',
          type: 'ACCOUNT_DELETION',
        },
      });

      const seedEmails =
        process.env.NODE_ENV !== 'production' ? seedUsers.map((u) => u.email.toLowerCase()) : [];
      for (const email of seedEmails) {
        const user = await tx.user.findUnique({ where: { email } });
        if (user) {
          for (const starterFolder of DEFAULT_STARTER_FOLDERS) {
            const folder = await tx.workoutFolder.upsert({
              where: { userId_name: { userId: user.id, name: starterFolder.name } },
              update: { color: starterFolder.color },
              create: {
                userId: user.id,
                systemKey: starterFolder.id,
                name: starterFolder.name,
                color: starterFolder.color,
                sortOrder: starterFolder.sortOrder,
              },
            });

            const folderTemplates = DEFAULT_STARTER_TEMPLATES.filter(
              (t) => t.folderId === starterFolder.id,
            );
            for (const tpl of folderTemplates) {
              const existingTpl = await tx.workoutTemplate.findFirst({
                where: { userId: user.id, systemKey: tpl.id },
              });
              if (existingTpl) continue;
              const createdTpl = await tx.workoutTemplate.create({
                data: {
                  userId: user.id,
                  systemKey: tpl.id,
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
            const existingRoutine = await tx.stretchingRoutine.findFirst({
              where: { userId: user.id, systemKey: routine.id },
            });
            if (existingRoutine) continue;
            const createdRoutine = await tx.stretchingRoutine.create({
              data: {
                userId: user.id,
                systemKey: routine.id,
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
        }
      }
    });

    logger.info('LukiFitti exercise catalog and starter templates seeded successfully');
  } catch (error) {
    logger.error('Error seeding LukiFitti database:', error);
    await prisma.$disconnect();
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
