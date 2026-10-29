'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Salad, ShieldCheck } from 'lucide-react';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { Card } from '@luki-fitti/ui/components/ui/card';
import { Input } from '@luki-fitti/ui/components/ui/input';
import { Label } from '@luki-fitti/ui/components/ui/label';
import { NativeSelect } from '@luki-fitti/ui/components/ui/native-select';
import { toast } from '@luki-fitti/ui/components/ui/sonner';
import type { BiologicalSex } from '@luki-fitti/common/enums';
import { UpdatePreferencesSchema } from '@luki-fitti/common/schemas';
import { suggestDailyKcal, suggestProteinGoalG } from '@luki-fitti/common/utils/client';
import { useAuth } from '@/providers/auth/auth-context';
import { useLocale } from '@/providers/i18n/locale-context';

const FIELDS = [
  'bodyWeightKg',
  'heightCm',
  'birthYear',
  'dailyKcalGoal',
  'proteinGoalG',
  'carbsGoalG',
  'fatGoalG',
] as const;
type NumericField = (typeof FIELDS)[number];

/** Body metrics (for burn estimates) and daily nutrition goals. */
export function ProfileBodyCard() {
  const { user, authMode } = useAuth();
  if (authMode !== 'AUTHENTICATED') return null;
  const prefs = user?.preferences;
  // Remount the form when the saved values change (e.g. after saving or on another device).
  const key = JSON.stringify([...FIELDS.map((f) => prefs?.[f] ?? null), prefs?.sex ?? null]);
  return <ProfileBodyForm key={key} />;
}

function ProfileBodyForm() {
  const { user, updatePreferences } = useAuth();
  const { t } = useLocale();
  const prefs = user?.preferences;
  const [values, setValues] = useState<Record<NumericField, string>>(
    () =>
      Object.fromEntries(
        FIELDS.map((f) => [
          f,
          prefs?.[f] === null || prefs?.[f] === undefined ? '' : String(prefs[f]),
        ]),
      ) as Record<NumericField, string>,
  );
  const [sex, setSex] = useState<BiologicalSex | ''>(prefs?.sex ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const toNumber = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));

  const suggestion = suggestDailyKcal({
    bodyWeightKg: toNumber(values.bodyWeightKg),
    heightCm: toNumber(values.heightCm),
    birthYear: toNumber(values.birthYear),
    sex: sex || null,
  });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...Object.fromEntries(FIELDS.map((f) => [f, toNumber(values[f])])),
      sex: sex || null,
    };
    const parsed = UpdatePreferencesSchema.safeParse(payload);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError(issue ? `${String(issue.path[0])}: ${issue.message}` : null);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await updatePreferences(parsed.data);
      toast.success(t.profileBody.saved);
    } finally {
      setSaving(false);
    }
  };

  const numberField = (field: NumericField, label: string, step = '1') => (
    <div className="space-y-1.5">
      <Label htmlFor={`body-${field}`} className="text-[0.8125rem] font-semibold">
        {label}
      </Label>
      <Input
        id={`body-${field}`}
        type="number"
        inputMode="decimal"
        step={step}
        value={values[field]}
        onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))}
        className="tabular-nums"
      />
    </div>
  );

  return (
    <Card className="space-y-4 rounded-[1.25rem] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Salad className="text-primary h-5 w-5" aria-hidden="true" />
          <div>
            <h2 className="font-display text-lg font-bold">{t.profileBody.title}</h2>
            <p className="text-muted-foreground text-xs">{t.profileBody.sub}</p>
          </div>
        </div>
        {(user?.permissions?.length ?? 0) > 0 && (
          <Button asChild variant="secondary" size="sm">
            <Link href="/admin">
              <ShieldCheck className="h-4 w-4" /> {t.profileBody.adminPortal}
            </Link>
          </Button>
        )}
      </div>

      <form onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {numberField('bodyWeightKg', t.profileBody.bodyWeight, '0.1')}
          {numberField('heightCm', t.profileBody.height)}
          {numberField('birthYear', t.profileBody.birthYear)}
          <div className="space-y-1.5">
            <Label htmlFor="body-sex" className="text-[0.8125rem] font-semibold">
              {t.profileBody.sex}
            </Label>
            <NativeSelect
              id="body-sex"
              value={sex}
              onChange={(e) => setSex(e.target.value as BiologicalSex | '')}
            >
              <option value="">{t.profileBody.sexUnset}</option>
              <option value="female">{t.profileBody.sexFemale}</option>
              <option value="male">{t.profileBody.sexMale}</option>
            </NativeSelect>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {numberField('dailyKcalGoal', t.profileBody.kcalGoal)}
          {numberField('proteinGoalG', t.profileBody.proteinGoal)}
          {numberField('carbsGoalG', t.profileBody.carbsGoal)}
          {numberField('fatGoalG', t.profileBody.fatGoal)}
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
              const protein = suggestProteinGoalG(toNumber(values.bodyWeightKg));
              setValues((v) => ({
                ...v,
                dailyKcalGoal: String(suggestion),
                proteinGoalG: protein ? String(protein) : v.proteinGoalG,
              }));
            }}
          >
            {t.profileBody.suggest}
          </Button>
          {!suggestion && (
            <span className="text-muted-foreground text-[0.8125rem]">
              {t.profileBody.suggestHint}
            </span>
          )}
        </div>
      </form>
    </Card>
  );
}
