'use client';

import { useState, type ReactElement } from 'react';
import { Button } from '@luki-fitti/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@luki-fitti/ui/components/ui/dialog';
import { Input } from '@luki-fitti/ui/components/ui/input';
import { Label } from '@luki-fitti/ui/components/ui/label';
import { toast } from '@luki-fitti/ui/components/ui/sonner';
import { UpdatePreferencesSchema } from '@luki-fitti/common/schemas';
import { suggestDailyKcal, suggestProteinGoalG } from '@luki-fitti/common/utils/client';
import { useAuth } from '@/providers/auth/auth-context';
import { useLocale } from '@/providers/i18n/locale-context';
import { useBodyWeight } from '@/lib/body-weight/use-body-weight';

const GOAL_FIELDS = ['dailyKcalGoal', 'proteinGoalG', 'carbsGoalG', 'fatGoalG'] as const;
type GoalField = (typeof GOAL_FIELDS)[number];

const toNumber = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));

interface NutritionGoalsFormProps {
  /** Called after a successful save (e.g. to close a dialog). */
  onSaved?: () => void;
  onCancel?: () => void;
  idPrefix?: string;
}

/** Daily calorie and macro goals with a suggestion from the health details. */
export function NutritionGoalsForm({
  onSaved,
  onCancel,
  idPrefix = 'goals',
}: NutritionGoalsFormProps) {
  const { user, updatePreferences } = useAuth();
  const { t } = useLocale();
  const { latest } = useBodyWeight();
  const prefs = user?.preferences;
  const bodyWeightKg = latest?.weightKg ?? prefs?.bodyWeightKg ?? null;
  const [values, setValues] = useState<Record<GoalField, string>>(
    () =>
      Object.fromEntries(
        GOAL_FIELDS.map((f) => [f, prefs?.[f] == null ? '' : String(prefs[f])]),
      ) as Record<GoalField, string>,
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const labels: Record<GoalField, string> = {
    dailyKcalGoal: t.profileBody.kcalGoal,
    proteinGoalG: t.profileBody.proteinGoal,
    carbsGoalG: t.profileBody.carbsGoal,
    fatGoalG: t.profileBody.fatGoal,
  };

  const suggestion = suggestDailyKcal({
    bodyWeightKg,
    heightCm: prefs?.heightCm ?? null,
    birthYear: prefs?.birthYear ?? null,
    sex: prefs?.sex ?? null,
  });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = UpdatePreferencesSchema.safeParse(
      Object.fromEntries(GOAL_FIELDS.map((f) => [f, toNumber(values[f])])),
    );
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path[0] as GoalField | undefined;
      setError(issue ? `${field ? labels[field] : ''}: ${issue.message}` : null);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await updatePreferences(parsed.data);
      toast.success(t.profileBody.goalsSaved);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-4" data-testid="nutrition-goals-form">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {GOAL_FIELDS.map((field) => (
          <div key={field} className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-${field}`} className="text-[0.8125rem] font-semibold">
              {labels[field]}
            </Label>
            <Input
              id={`${idPrefix}-${field}`}
              type="number"
              inputMode="numeric"
              step="1"
              value={values[field]}
              aria-invalid={error?.startsWith(labels[field]) || undefined}
              onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))}
              className="tabular-nums"
            />
          </div>
        ))}
      </div>

      {error && (
        <p className="text-destructive text-[0.8125rem]" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={saving}>
          {t.profileBody.save}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={!suggestion}
          onClick={() => {
            if (!suggestion) return;
            const protein = suggestProteinGoalG(bodyWeightKg);
            setValues((v) => ({
              ...v,
              dailyKcalGoal: String(suggestion),
              proteinGoalG: protein ? String(protein) : v.proteinGoalG,
            }));
          }}
        >
          {t.profileBody.suggest}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t.profileBody.cancel}
          </Button>
        )}
      </div>
      {!suggestion && (
        <p className="text-muted-foreground text-[0.8125rem]">{t.profileBody.suggestHint}</p>
      )}
    </form>
  );
}

/** Wraps any trigger (button, ring) so it opens the nutrition goals in a dialog. */
export function NutritionGoalsDialog({ children }: { children: ReactElement }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent data-testid="nutrition-goals-dialog">
        <DialogHeader>
          <DialogTitle>{t.profileBody.goalsTitle}</DialogTitle>
          <DialogDescription>{t.profileBody.goalsSub}</DialogDescription>
        </DialogHeader>
        {open && (
          <NutritionGoalsForm
            idPrefix="goals-dialog"
            onSaved={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
