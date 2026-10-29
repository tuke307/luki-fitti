import { Injectable, type OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import {
  EquipmentType,
  ExerciseType,
  MuscleGroup,
  SessionExerciseStatus,
  SessionStatus,
  SetType,
} from '@luki-fitti/common/enums';
import type { WorkoutSessionDto } from '@luki-fitti/common/schemas';
import {
  analyzeExerciseTrend,
  classifyExerciseStall,
  extractGlobalExerciseHistory,
} from '@luki-fitti/common/utils';
import { PrismaService } from '../../database/prisma.service';
import { ExerciseService } from '../../exercise/exercise.service';
import { SessionService } from '../../session/session.service';
import { ToolRegistry } from '../harness/tool-registry';
import type { AiTool, ToolContext } from '../harness/types';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Muscles that are not trained on their own and should not be flagged as "weak". */
const NON_TARGET_MUSCLES = new Set<MuscleGroup>([MuscleGroup.FULL_BODY, MuscleGroup.HIP_FLEXORS]);

const tool = <T extends z.ZodType>(definition: AiTool<T>): AiTool => definition as unknown as AiTool;

interface HistorySummary {
  weeks: number;
  sessions: WorkoutSessionDto[];
  allSessions: WorkoutSessionDto[];
  muscleSets: Map<MuscleGroup, number>;
  exercises: Map<string, { name: string; muscle: MuscleGroup; sessions: number; last: string }>;
}

/** Workout-builder tools: catalog search, history, weak points and "what didn't work". */
@Injectable()
export class TrainingTools implements OnModuleInit {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly prisma: PrismaService,
    private readonly exercises: ExerciseService,
    private readonly sessions: SessionService,
  ) {}

  onModuleInit() {
    this.registry.register(
      tool({
        name: 'search_exercises',
        description:
          'Search the exercise catalog (English or German, typo tolerant). Returns ids you may use in the workout. Filter by muscle group, equipment and type.',
        input: z.object({
          query: z.string().max(80).optional().describe('Free text, e.g. "incline press" or "Schrägbank"'),
          muscleGroup: z.enum(MuscleGroup).optional(),
          equipment: z.array(z.enum(EquipmentType)).max(6).optional(),
          exerciseType: z.enum(ExerciseType).default(ExerciseType.STRENGTH),
          limit: z.number().int().min(1).max(25).default(12),
        }),
        execute: (ctx, input) => this.searchExercises(ctx, input),
      }),
      tool({
        name: 'get_exercise_details',
        description: 'Details for specific exercise ids: muscles, equipment, short description and known alternatives.',
        input: z.object({ exerciseIds: z.array(z.string().max(120)).min(1).max(10) }),
        execute: (ctx, input) => this.exerciseDetails(ctx, input.exerciseIds),
      }),
      tool({
        name: 'get_training_history',
        description:
          'The user\'s completed training over the last N weeks: working sets per muscle group, most used exercises with progress trend (progressing / plateau / grinding / regression), and recent workouts.',
        input: z.object({ weeks: z.number().int().min(1).max(26).default(8) }),
        execute: (ctx, input) => this.trainingHistory(ctx, input.weeks),
      }),
      tool({
        name: 'get_weak_points',
        description:
          'Under-trained muscle groups relative to the others and exercises that stopped progressing. Use to bias the workout toward weak points.',
        input: z.object({ weeks: z.number().int().min(2).max(26).default(8) }),
        execute: (ctx, input) => this.weakPoints(ctx, input.weeks),
      }),
      tool({
        name: 'get_exercise_feedback',
        description:
          'Exercises that did not work for the user: explicitly marked (not working / pain / dislike) and implicitly (often skipped or swapped out during workouts). Avoid these; prefer alternatives.',
        input: z.object({}),
        execute: (ctx) => this.exerciseFeedback(ctx),
      }),
      tool({
        name: 'get_user_profile',
        description: 'Training preferences: weight unit, default rest, weekly goal, saved workouts and equipment the user actually uses.',
        input: z.object({}),
        execute: (ctx) => this.userProfile(ctx),
      }),
    );
  }

  // ── Tool implementations ──────────────────────────────────────────────────

  async searchExercises(
    ctx: ToolContext,
    input: {
      query?: string;
      muscleGroup?: MuscleGroup;
      equipment?: EquipmentType[];
      exerciseType: ExerciseType;
      limit: number;
    },
  ) {
    const results = await this.exercises.findAll(
      ctx.userId,
      { search: input.query, muscleGroup: input.muscleGroup, exerciseType: input.exerciseType },
      ctx.locale,
    );
    const equipment = input.equipment?.length ? new Set(input.equipment) : null;
    return results
      .filter((e) => !equipment || equipment.has(e.equipment))
      .slice(0, input.limit)
      .map((e) => ({
        id: e.id,
        name: e.name,
        primaryMuscleGroup: e.primaryMuscleGroup,
        secondaryMuscleGroups: e.secondaryMuscleGroups,
        equipment: e.equipment,
        category: e.category,
      }));
  }

  async exerciseDetails(ctx: ToolContext, ids: string[]) {
    return Promise.all(
      [...new Set(ids)].map(async (id) => {
        try {
          const e = await this.exercises.findById(ctx.userId, id, ctx.locale);
          return {
            id: e.id,
            name: e.name,
            description: e.description.slice(0, 300),
            primaryMuscleGroup: e.primaryMuscleGroup,
            secondaryMuscleGroups: e.secondaryMuscleGroups,
            equipment: e.equipment,
            category: e.category,
            alternatives: (e.alternatives ?? []).slice(0, 6).map((a) => ({
              id: a.id,
              name: a.name,
              equipment: a.equipment,
            })),
          };
        } catch {
          return { id, error: 'not found' };
        }
      }),
    );
  }

  async trainingHistory(ctx: ToolContext, weeks: number) {
    const summary = await this.summarize(ctx.userId, weeks);
    return {
      weeks,
      completedWorkouts: summary.sessions.length,
      workoutsPerWeek: Math.round((summary.sessions.length / weeks) * 10) / 10,
      workingSetsPerMuscle: [...summary.muscleSets.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([muscle, sets]) => ({ muscle, sets, setsPerWeek: Math.round((sets / weeks) * 10) / 10 })),
      topExercises: [...summary.exercises.entries()]
        .sort((a, b) => b[1].sessions - a[1].sessions)
        .slice(0, 20)
        .map(([id, e]) => ({
          id,
          name: e.name,
          muscle: e.muscle,
          sessions: e.sessions,
          lastPerformed: e.last.slice(0, 10),
          ...this.trendFor(id, e.name, summary.allSessions),
        })),
      recentWorkouts: summary.sessions.slice(0, 6).map((s) => ({
        name: s.workoutNameSnapshot,
        date: s.startedAt.slice(0, 10),
        exercises: s.exercises.map((e) => e.exerciseNameSnapshot).slice(0, 10),
      })),
    };
  }

  async weakPoints(ctx: ToolContext, weeks: number) {
    const summary = await this.summarize(ctx.userId, weeks);
    const majors = Object.values(MuscleGroup).filter((m) => !NON_TARGET_MUSCLES.has(m));
    const volumes = majors.map((m) => ({ muscle: m, sets: summary.muscleSets.get(m) ?? 0 }));
    const trained = volumes.filter((v) => v.sets > 0).map((v) => v.sets).sort((a, b) => a - b);
    const median = trained.length ? trained[Math.floor(trained.length / 2)]! : 0;

    const stalled = [...summary.exercises.entries()]
      .map(([id, e]) => ({ id, name: e.name, muscle: e.muscle, ...this.trendFor(id, e.name, summary.allSessions) }))
      .filter((e) => e.status !== 'PROGRESSING' && e.status !== 'NOT_ENOUGH_DATA');

    return {
      weeks,
      hasEnoughData: summary.sessions.length >= 3,
      underTrainedMuscles: volumes
        .filter((v) => v.sets < median * 0.6)
        .map((v) => ({ ...v, setsPerWeek: Math.round((v.sets / weeks) * 10) / 10, medianSets: median })),
      stalledExercises: stalled.slice(0, 10),
    };
  }

  async exerciseFeedback(ctx: ToolContext) {
    const since = new Date(Date.now() - 120 * DAY_MS);
    const [explicit, skipped, replaced] = await Promise.all([
      this.prisma.exerciseFeedback.findMany({
        where: { userId: ctx.userId },
        select: { exerciseId: true, verdict: true, note: true, exercise: { select: { name: true } } },
      }),
      this.prisma.sessionExercise.groupBy({
        by: ['exerciseId'],
        where: {
          status: SessionExerciseStatus.SKIPPED,
          exerciseId: { not: null },
          session: { userId: ctx.userId, startedAt: { gte: since } },
        },
        _count: { _all: true },
      }),
      this.prisma.sessionExercise.findMany({
        where: {
          replacedExerciseId: { not: null },
          session: { userId: ctx.userId, startedAt: { gte: since } },
        },
        select: { replacedExerciseId: true, replacedExerciseName: true, exerciseId: true, exerciseNameSnapshot: true },
        take: 300,
      }),
    ]);

    const swaps = new Map<string, { name: string; count: number; replacedWith: Map<string, string> }>();
    for (const r of replaced) {
      const id = r.replacedExerciseId as string;
      const entry = swaps.get(id) ?? { name: r.replacedExerciseName ?? id, count: 0, replacedWith: new Map() };
      entry.count += 1;
      if (r.exerciseId) entry.replacedWith.set(r.exerciseId, r.exerciseNameSnapshot);
      swaps.set(id, entry);
    }
    const skippedIds = skipped.map((s) => s.exerciseId).filter((id): id is string => !!id);
    const names = skippedIds.length
      ? new Map(
          (
            await this.prisma.exercise.findMany({
              where: { id: { in: skippedIds } },
              select: { id: true, name: true },
            })
          ).map((e) => [e.id, e.name]),
        )
      : new Map<string, string>();

    return {
      explicit: explicit.map((f) => ({
        exerciseId: f.exerciseId,
        name: f.exercise.name,
        verdict: f.verdict,
        note: f.note?.slice(0, 200) ?? null,
      })),
      oftenSkipped: skipped
        .filter((s) => s.exerciseId && s._count._all >= 2)
        .map((s) => ({ exerciseId: s.exerciseId, name: names.get(s.exerciseId as string) ?? null, timesSkipped: s._count._all })),
      oftenSwappedOut: [...swaps.entries()]
        .filter(([, v]) => v.count >= 1)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 15)
        .map(([exerciseId, v]) => ({
          exerciseId,
          name: v.name,
          timesSwapped: v.count,
          userPreferredInstead: [...v.replacedWith.entries()].slice(0, 3).map(([id, name]) => ({ id, name })),
        })),
    };
  }

  async userProfile(ctx: ToolContext) {
    const since = new Date(Date.now() - 90 * DAY_MS);
    const [prefs, templates, equipmentRows] = await Promise.all([
      this.prisma.userPreferences.findUnique({
        where: { userId: ctx.userId },
        select: { weightUnit: true, defaultRestSeconds: true, weeklyGoalSessions: true },
      }),
      this.prisma.workoutTemplate.findMany({
        where: { userId: ctx.userId },
        orderBy: { updatedAt: 'desc' },
        take: 15,
        select: { name: true, _count: { select: { exercises: true } } },
      }),
      this.prisma.sessionExercise.findMany({
        where: { session: { userId: ctx.userId, startedAt: { gte: since } }, exerciseId: { not: null } },
        select: { exercise: { select: { equipment: true } } },
        take: 1000,
      }),
    ]);
    const equipment = new Map<string, number>();
    for (const row of equipmentRows) {
      const eq = row.exercise?.equipment;
      if (eq) equipment.set(eq, (equipment.get(eq) ?? 0) + 1);
    }
    return {
      weightUnit: prefs?.weightUnit ?? 'KG',
      defaultRestSeconds: prefs?.defaultRestSeconds ?? 90,
      weeklyGoalSessions: prefs?.weeklyGoalSessions ?? 4,
      savedWorkouts: templates.map((t) => ({ name: t.name, exercises: t._count.exercises })),
      equipmentUsedLast90Days: [...equipment.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([type, uses]) => ({ type, uses })),
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async summarize(userId: string, weeks: number): Promise<HistorySummary> {
    const allSessions = await this.sessions.listSessions(userId, {
      status: SessionStatus.COMPLETED,
      from: new Date(Date.now() - 26 * 7 * DAY_MS).toISOString(),
    });
    const cutoff = Date.now() - weeks * 7 * DAY_MS;
    const sessions = allSessions.filter((s) => Date.parse(s.startedAt) >= cutoff);

    const muscleSets = new Map<MuscleGroup, number>();
    const exercises = new Map<string, { name: string; muscle: MuscleGroup; sessions: number; last: string }>();
    for (const session of sessions) {
      for (const ex of session.exercises) {
        if (ex.exerciseTypeSnapshot === ExerciseType.STRETCHING) continue;
        const working = ex.sets.filter(
          (s) => s.completed && s.setType !== SetType.WARMUP && s.setType !== SetType.STRETCH,
        ).length;
        if (working === 0) continue;
        muscleSets.set(ex.primaryMuscleSnapshot, (muscleSets.get(ex.primaryMuscleSnapshot) ?? 0) + working);
        if (!ex.exerciseId) continue;
        const current = exercises.get(ex.exerciseId);
        exercises.set(ex.exerciseId, {
          name: ex.exerciseNameSnapshot,
          muscle: ex.primaryMuscleSnapshot,
          sessions: (current?.sessions ?? 0) + 1,
          last: current && current.last > session.startedAt ? current.last : session.startedAt,
        });
      }
    }
    return { weeks, sessions, allSessions, muscleSets, exercises };
  }

  private trendFor(exerciseId: string, name: string, sessions: WorkoutSessionDto[]) {
    const history = extractGlobalExerciseHistory(exerciseId, name, sessions);
    if (history.length < 3) return { status: 'NOT_ENOUGH_DATA' as const, changePct: 0 };
    const trend = analyzeExerciseTrend(history);
    return { status: classifyExerciseStall(trend) ?? ('PROGRESSING' as const), changePct: trend.changePct };
  }
}
