'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { Label } from '@luki-fitti/ui/components/ui/label';
import { NativeSelect } from '@luki-fitti/ui/components/ui/native-select';
import { Spinner } from '@luki-fitti/ui/components/ui/spinner';
import { Textarea } from '@luki-fitti/ui/components/ui/textarea';
import { toast } from '@luki-fitti/ui/components/ui/sonner';
import {
  AiSkillName,
  SetType,
  TRAINING_GOALS,
  type TrainingGoal,
  WeightUnit,
} from '@luki-fitti/common/enums';
import {
  AI_PROMPT_MAX_LENGTH,
  type CreateTemplateDto,
  type WorkoutBuilderResponseDto,
} from '@luki-fitti/common/schemas';
import { api } from '@/lib/api';
import { aiErrorMessage } from '@/lib/ai/ai-errors';
import { isAiKeyRequiredError } from '@/lib/ai/ai-key-required';
import { AiKeyRequiredDialog } from './ai-key-required-dialog';
import { useAuth } from '@/providers/auth/auth-context';
import { useGym } from '@/providers/gym/gym-context';
import { useLocale } from '@/providers/i18n/locale-context';
import { AiCostLabel } from './ai-usage/ai-cost-label';
import { AiInfoButton } from './ai-usage/ai-info-button';
import { MobileSheet } from './mobile-sheet';

const DURATIONS = [30, 45, 60, 75, 90] as const;

/** Turns an AI proposal into a regular template (warm-ups + working sets, no weights yet). */
export function proposalToTemplate(
  p: WorkoutBuilderResponseDto,
  folderId: string | null,
  trainingGoal?: TrainingGoal | null,
): CreateTemplateDto {
  return {
    name: p.name.slice(0, 100),
    description: p.summary.slice(0, 500) || null,
    folderId,
    trainingGoal: trainingGoal ?? null,
    estimatedDurationMinutes: Math.min(360, Math.max(5, p.estimatedDurationMinutes)),
    exercises: p.exercises.map((ex, index) => ({
      exerciseId: ex.exerciseId,
      orderIndex: index,
      sets: [
        ...Array.from({ length: ex.warmupSets }, () => ({
          setType: SetType.WARMUP,
          weight: null,
          reps: ex.repsMax,
          durationSeconds: null,
        })),
        ...Array.from({ length: ex.workingSets }, () => ({
          setType: SetType.WORKING,
          weight: null,
          reps: ex.repsMax,
          durationSeconds: null,
        })),
      ],
      plannedSets: ex.workingSets,
      warmupSets: ex.warmupSets,
      targetRepsMin: ex.repsMin,
      targetRepsMax: ex.repsMax,
      weightUnit: WeightUnit.KG,
      restSeconds: Math.min(900, ex.restSeconds),
      notes: ex.rationale.slice(0, 500) || null,
      alternativeExerciseIds: ex.alternatives.map((a) => a.exerciseId),
    })),
  };
}

export function AiWorkoutBuilderDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, format, muscleLabel } = useLocale();
  const { isAuthenticated, user } = useAuth();
  const { createTemplate, isOnline } = useGym();
  // The prompt survives closing (handy for tweaking it); the result does not.
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState<string>('');
  const [goal, setGoal] = useState<TrainingGoal | ''>(user?.preferences?.trainingGoal ?? '');
  const [result, setResult] = useState<WorkoutBuilderResponseDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keyRequiredOpen, setKeyRequiredOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const close = (next: boolean) => {
    if (busy) return;
    if (!next) {
      setResult(null);
      setError(null);
      setDuration('');
    }
    onOpenChange(next);
  };

  const generate = async () => {
    if (!isAuthenticated || !user?.aiKeyConfigured) {
      setKeyRequiredOpen(true);
      return;
    }
    if (!isOnline) {
      setError(t.aiBuilder.offline);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.ai.buildWorkout({
        prompt: prompt.trim(),
        ...(duration ? { durationMinutes: Number(duration) } : {}),
        ...(goal ? { trainingGoal: goal } : {}),
      });
      setResult(res.data);
    } catch (err) {
      if (isAiKeyRequiredError(err)) setKeyRequiredOpen(true);
      else setError(aiErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  const saveTemplate = async () => {
    if (!result) return;
    setSaving(true);
    try {
      await createTemplate(proposalToTemplate(result, null, goal || null));
      toast.success(t.aiBuilder.saved);
      close(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.aiErrors.unavailable);
    } finally {
      setSaving(false);
    }
  };

  const canGenerate = prompt.trim().length >= 3;
  const examples = [t.aiBuilder.example1, t.aiBuilder.example2, t.aiBuilder.example3];

  return (
    <>
      <AiKeyRequiredDialog open={keyRequiredOpen} onOpenChange={setKeyRequiredOpen} />
      <MobileSheet
        open={open}
        onOpenChange={close}
        title={result ? t.aiBuilder.preview : t.aiBuilder.title}
        description={result ? result.summary : t.aiBuilder.sub}
        confirm={
          result
            ? {
                label: t.aiBuilder.saveTemplate,
                onConfirm: () => void saveTemplate(),
                disabled: busy,
                loading: saving,
                testId: 'ai-builder-save',
              }
            : {
                label: busy ? t.aiBuilder.generating : t.aiBuilder.generate,
                onConfirm: () => {
                  if (canGenerate) void generate();
                },
                disabled: !canGenerate,
                loading: busy,
                testId: 'ai-builder-generate',
              }
        }
        className="sm:max-w-xl"
        data-testid="ai-builder-sheet"
      >
        <div className="min-w-0 space-y-4">
          <div className="flex items-start gap-1">
            <p className="text-muted-foreground min-w-0 flex-1 text-[0.875rem]">
              {result ? result.summary : t.aiBuilder.sub}
            </p>
            <AiInfoButton skill={AiSkillName.WORKOUT_BUILDER} />
          </div>
          {!result ? (
            <form
              id="ai-builder-form"
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (canGenerate) void generate();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="ai-prompt" className="text-[0.8125rem] font-semibold">
                  {t.aiBuilder.promptLabel}
                </Label>
                <Textarea
                  id="ai-prompt"
                  value={prompt}
                  rows={3}
                  maxLength={AI_PROMPT_MAX_LENGTH}
                  disabled={busy}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={t.aiBuilder.promptPlaceholder}
                />
              </div>
              <div className="space-y-2">
                <p className="text-muted-foreground text-[0.8125rem] font-semibold">
                  {t.aiBuilder.examples}
                </p>
                <div className="flex flex-wrap gap-2">
                  {examples.map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      disabled={busy}
                      onClick={() => setPrompt(ex)}
                      className="bg-secondary hover:bg-secondary/70 min-h-11 rounded-full px-4 py-2 text-left text-[0.875rem]"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="ai-duration" className="text-[0.9375rem]">
                  {t.aiBuilder.durationLabel}
                </Label>
                <NativeSelect
                  id="ai-duration"
                  value={duration}
                  disabled={busy}
                  onChange={(e) => setDuration(e.target.value)}
                  className="w-auto tabular-nums"
                >
                  <option value="">{t.aiBuilder.durationAny}</option>
                  {DURATIONS.map((d) => (
                    <option key={d} value={d}>
                      {d} {t.common.min}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="ai-goal" className="text-[0.9375rem]">
                  {t.profile.trainingGoalLabel}
                </Label>
                <NativeSelect
                  id="ai-goal"
                  value={goal}
                  disabled={busy}
                  onChange={(e) => setGoal(e.target.value as TrainingGoal | '')}
                  className="w-auto"
                  data-testid="ai-builder-goal-select"
                >
                  <option value="">{t.profile.trainingGoalUnset}</option>
                  {TRAINING_GOALS.map((g) => (
                    <option key={g} value={g}>
                      {t.profile.trainingGoals[g]}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              {busy && (
                <p className="text-muted-foreground flex items-center gap-2 text-[0.875rem]">
                  <Spinner /> {t.aiBuilder.generating}
                </p>
              )}
            </form>
          ) : (
            <>
              <p className="text-[1.375rem] leading-snug font-bold">{result.name}</p>
              <p className="text-muted-foreground text-[0.875rem]">
                {result.focusMuscleGroups.map(muscleLabel).join(' · ')}
                {result.focusMuscleGroups.length > 0 && ' · '}
                {result.estimatedDurationMinutes} {t.common.min}
              </p>
              <ol className="space-y-2.5">
                {result.exercises.map((ex, i) => (
                  <li key={ex.exerciseId} className="bg-secondary/50 space-y-1 rounded-2xl p-3.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-[0.9375rem] font-semibold">
                        <span className="text-muted-foreground tabular-nums">{i + 1}. </span>
                        {ex.name}
                      </p>
                      <p className="text-muted-foreground shrink-0 text-[0.8125rem] tabular-nums">
                        {format(t.aiBuilder.setsReps, {
                          sets: ex.workingSets,
                          min: ex.repsMin,
                          max: ex.repsMax,
                        })}
                        {ex.warmupSets > 0 &&
                          ` ${format(t.aiBuilder.warmups, { count: ex.warmupSets })}`}
                      </p>
                    </div>
                    <p className="text-muted-foreground text-[0.8125rem]">
                      {format(t.aiBuilder.rest, { sec: ex.restSeconds })}
                      {ex.replaces &&
                        ` · ${format(t.aiBuilder.replaces, { name: ex.replaces.name })}`}
                    </p>
                    {ex.rationale && <p className="text-[0.875rem]">{ex.rationale}</p>}
                    {ex.alternatives.length > 0 && (
                      <p className="text-muted-foreground text-[0.8125rem]">
                        {format(t.aiBuilder.alternatives, {
                          names: ex.alternatives.map((a) => a.name).join(', '),
                        })}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
              {result.notes.length > 0 && (
                <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-[0.875rem]">
                  {result.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}
              {result.droppedExerciseIds.length > 0 && (
                <p className="text-muted-foreground text-[0.8125rem]">{t.aiBuilder.droppedNote}</p>
              )}
              <AiCostLabel usage={result.usage} model={result.model} />
              <Button
                type="button"
                variant="secondary"
                disabled={busy || saving}
                onClick={() => setResult(null)}
              >
                <RefreshCw className="h-4 w-4" /> {t.aiBuilder.regenerate}
              </Button>
            </>
          )}

          {error && (
            <p className="text-destructive text-[0.875rem]" role="alert">
              {error}
            </p>
          )}
          <span className="sr-only" role="status" aria-live="polite">
            {busy ? t.aiBuilder.generating : ''}
          </span>
        </div>
      </MobileSheet>
    </>
  );
}
