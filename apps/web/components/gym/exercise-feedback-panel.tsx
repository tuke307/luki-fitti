'use client';

import { useEffect, useState } from 'react';
import { ExerciseFeedbackVerdict } from '@luki-fitti/common/enums';
import type { ExerciseFeedbackDto } from '@luki-fitti/common/schemas';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { toast } from '@luki-fitti/ui/components/ui/sonner';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/auth/auth-context';
import { useLocale } from '@/providers/i18n/locale-context';

const VERDICTS = Object.values(ExerciseFeedbackVerdict);
let cache: Map<string, ExerciseFeedbackDto> | null = null;

/** "Doesn't work for me" marks that steer the AI planner toward alternatives. */
export function ExerciseFeedbackPanel({ exerciseId }: { exerciseId: string }) {
  const { authMode } = useAuth();
  const { t } = useLocale();
  const [current, setCurrent] = useState<ExerciseFeedbackDto | null>(
    cache?.get(exerciseId) ?? null,
  );
  const [busy, setBusy] = useState(false);

  // Remounted per exercise (keyed by the caller); only the first panel needs to load the list.
  useEffect(() => {
    if (authMode !== 'AUTHENTICATED' || cache) return;
    api.exerciseFeedback
      .list()
      .then((res) => {
        cache = new Map((res.data ?? []).map((f) => [f.exerciseId, f]));
        setCurrent(cache.get(exerciseId) ?? null);
      })
      .catch(() => undefined);
  }, [authMode, exerciseId]);

  if (authMode !== 'AUTHENTICATED') return null;

  const choose = async (verdict: ExerciseFeedbackVerdict | null) => {
    setBusy(true);
    try {
      if (verdict) {
        const res = await api.exerciseFeedback.set(exerciseId, { verdict });
        if (res.data) {
          cache?.set(exerciseId, res.data);
          setCurrent(res.data);
        }
      } else {
        await api.exerciseFeedback.remove(exerciseId);
        cache?.delete(exerciseId);
        setCurrent(null);
      }
      toast.success(t.feedback.saved);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.aiErrors.unavailable);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby={`feedback-${exerciseId}`} className="space-y-2 border-t pt-4">
      <div>
        <h3 id={`feedback-${exerciseId}`} className="font-display text-sm font-bold">
          {t.feedback.menuLabel}
        </h3>
        <p className="text-muted-foreground text-xs">{t.feedback.sub}</p>
      </div>
      <div
        className="flex flex-wrap gap-2"
        role="radiogroup"
        aria-labelledby={`feedback-${exerciseId}`}
      >
        {VERDICTS.map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={current?.verdict === v}
            disabled={busy}
            onClick={() => void choose(current?.verdict === v ? null : v)}
            className={`h-11 rounded-full px-4 text-[0.875rem] transition-colors duration-150 ${
              current?.verdict === v
                ? 'bg-primary text-primary-foreground font-semibold'
                : 'bg-secondary text-foreground'
            }`}
          >
            {t.feedback.verdicts[v]}
          </button>
        ))}
        {current && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => void choose(null)}
          >
            {t.feedback.clear}
          </Button>
        )}
      </div>
    </section>
  );
}
