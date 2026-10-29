'use client';

import { useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@luki-fitti/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@luki-fitti/ui/components/ui/dialog';
import { Label } from '@luki-fitti/ui/components/ui/label';
import { NativeSelect } from '@luki-fitti/ui/components/ui/native-select';
import { Spinner } from '@luki-fitti/ui/components/ui/spinner';
import { Textarea } from '@luki-fitti/ui/components/ui/textarea';
import { toast } from '@luki-fitti/ui/components/ui/sonner';
import { SetType, WeightUnit } from '@luki-fitti/common/enums';
import {
  AI_PROMPT_MAX_LENGTH,
  type CreateTemplateDto,
  type WorkoutBuilderResponseDto,
} from '@luki-fitti/common/schemas';
import { api } from '@/lib/api';
import { aiErrorMessage } from '@/lib/ai/ai-errors';
import { useGym } from '@/providers/gym/gym-context';
import { useLocale } from '@/providers/i18n/locale-context';

const DURATIONS = [30, 45, 60, 75, 90] as const;

/** Turns an AI proposal into a regular template (warm-ups + working sets, no weights yet). */
export function proposalToTemplate(
  p: WorkoutBuilderResponseDto,
  folderId: string | null,
): CreateTemplateDto {
  return {
    name: p.name.slice(0, 100),
    description: p.summary.slice(0, 500) || null,
    folderId,
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
  const [busy, setBusy] = useState(false);
  // The prompt survives closing (handy for tweaking it); the result does not.
  const [prompt, setPrompt] = useState('');
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      {open && (
        <AiWorkoutBuilderBody
          prompt={prompt}
          setPrompt={setPrompt}
          onBusyChange={setBusy}
          onClose={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  );
}

function AiWorkoutBuilderBody({
  prompt,
  setPrompt,
  onBusyChange,
  onClose,
}: {
  prompt: string;
  setPrompt: (value: string) => void;
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
}) {
  const { t, format, muscleLabel } = useLocale();
  const { createTemplate, isOnline } = useGym();
  const [duration, setDuration] = useState<string>('');
  const [result, setResult] = useState<WorkoutBuilderResponseDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusyState] = useState(false);
  const [saving, setSaving] = useState(false);

  const setBusy = (value: boolean) => {
    setBusyState(value);
    onBusyChange(value);
  };

  const generate = async () => {
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
      });
      setResult(res.data);
    } catch (err) {
      setError(aiErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  const saveTemplate = async () => {
    if (!result) return;
    setSaving(true);
    try {
      await createTemplate(proposalToTemplate(result, null));
      toast.success(t.aiBuilder.saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.aiErrors.unavailable);
    } finally {
      setSaving(false);
    }
  };

  const examples = [t.aiBuilder.example1, t.aiBuilder.example2, t.aiBuilder.example3];

  return (
    <DialogContent className="flex max-h-[92dvh] flex-col gap-0 p-0 sm:max-w-xl">
      <DialogHeader className="px-5 pt-5 pb-3 text-left">
        <DialogTitle>{result ? t.aiBuilder.preview : t.aiBuilder.title}</DialogTitle>
        <DialogDescription>{result ? result.summary : t.aiBuilder.sub}</DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-4">
        {!result ? (
          <form
            id="ai-builder-form"
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (prompt.trim().length >= 3) void generate();
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

      <DialogFooter className="border-border/60 gap-2 border-t px-5 py-4">
        {result ? (
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={busy || saving}
              onClick={() => setResult(null)}
            >
              <RefreshCw className="h-4 w-4" /> {t.aiBuilder.regenerate}
            </Button>
            <Button type="button" disabled={saving} onClick={() => void saveTemplate()}>
              {t.aiBuilder.saveTemplate}
            </Button>
          </>
        ) : (
          <Button
            type="submit"
            form="ai-builder-form"
            disabled={busy || prompt.trim().length < 3}
            className="w-full sm:w-auto"
          >
            {busy ? (
              <>
                <Spinner /> {t.aiBuilder.generating}
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> {t.aiBuilder.generate}
              </>
            )}
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  );
}
