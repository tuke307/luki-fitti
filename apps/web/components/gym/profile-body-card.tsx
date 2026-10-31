'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { HeartPulse, Salad, ShieldCheck } from 'lucide-react';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { Card } from '@luki-fitti/ui/components/ui/card';
import { Input } from '@luki-fitti/ui/components/ui/input';
import { Label } from '@luki-fitti/ui/components/ui/label';
import { NativeSelect } from '@luki-fitti/ui/components/ui/native-select';
import { WeightUnit, type BiologicalSex } from '@luki-fitti/common/enums';
import { UpdatePreferencesSchema, type UpdatePreferencesDto } from '@luki-fitti/common/schemas';
import { useAuth } from '@/providers/auth/auth-context';
import { useLocale } from '@/providers/i18n/locale-context';
import { useBodyWeight } from '@/lib/body-weight/use-body-weight';
import { toDisplayWeight } from '@/lib/body-weight/body-weight';
import { formatWeight } from '@/lib/body-weight/weight-format';
import { unitLabel } from '@/lib/format/weight';
import { NutritionGoalsForm } from './nutrition/nutrition-goals-form';
import { focusWeightInput, WEIGHT_SECTION_ID } from './weight/weight-focus';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const toNumber = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));

/**
 * Profile → Health details: current weight (from the weigh-in history) and the body metrics
 * used for calorie estimates. Each change saves on its own.
 */
export function ProfileHealthCard() {
  const { user, authMode, updatePreferences } = useAuth();
  const { t, bcp47 } = useLocale();
  const { latest } = useBodyWeight();
  const prefs = user?.preferences;
  const unit = prefs?.weightUnit ?? WeightUnit.KG;
  const signedIn = authMode === 'AUTHENTICATED';
  const bodyWeightKg = latest?.weightKg ?? prefs?.bodyWeightKg ?? null;
  const [height, setHeight] = useState(prefs?.heightCm == null ? '' : String(prefs.heightCm));
  const [birthYear, setBirthYear] = useState(
    prefs?.birthYear == null ? '' : String(prefs.birthYear),
  );
  const [sex, setSex] = useState<BiologicalSex | ''>(prefs?.sex ?? '');
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const saveCount = useRef(0);

  const persist = async (patch: UpdatePreferencesDto, label?: string) => {
    const parsed = UpdatePreferencesSchema.safeParse(patch);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError(
        issue ? `${label ?? String(issue.path[0])}: ${issue.message}` : t.profileBody.saveError,
      );
      setStatus('error');
      return;
    }
    setError(null);
    setStatus('saving');
    const ticket = ++saveCount.current;
    try {
      await updatePreferences(parsed.data);
      if (ticket === saveCount.current) setStatus('saved');
    } catch {
      if (ticket === saveCount.current) {
        setError(t.profileBody.saveError);
        setStatus('error');
      }
    }
  };

  const numberField = (
    id: string,
    label: string,
    value: string,
    setValue: (v: string) => void,
    saved: number | null | undefined,
    toPatch: (n: number | null) => UpdatePreferencesDto,
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-[0.8125rem] font-semibold">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          const next = toNumber(value);
          if (next !== (saved ?? null)) void persist(toPatch(next), label);
        }}
        className="tabular-nums"
      />
    </div>
  );

  return (
    <Card
      className="space-y-4 rounded-[1.25rem] p-5"
      aria-labelledby="health-details-title"
      role="region"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <HeartPulse className="text-primary h-5 w-5" aria-hidden="true" />
          <div>
            <h2 id="health-details-title" className="font-display text-lg font-bold">
              {t.profileBody.healthTitle}
            </h2>
            <p className="text-muted-foreground text-xs">{t.profileBody.healthSub}</p>
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {signedIn && (
          <div className="space-y-1.5">
            <p className="text-[0.8125rem] font-semibold">{t.profileBody.currentWeight}</p>
            <div className="flex min-h-11 flex-wrap items-center gap-x-2">
              <span
                data-testid="body-current-weight"
                className="font-rounded text-[1.0625rem] font-semibold tabular-nums"
              >
                {bodyWeightKg === null
                  ? t.profileBody.noWeightYet
                  : `${formatWeight(toDisplayWeight(bodyWeightKg, unit), bcp47)} ${unitLabel(unit)}`}
              </span>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto px-0"
                onClick={focusWeightInput}
                aria-controls={WEIGHT_SECTION_ID}
              >
                {t.profileBody.manageWeight}
              </Button>
            </div>
          </div>
        )}
        {signedIn && (
          <>
            {numberField(
              'body-heightCm',
              t.profileBody.height,
              height,
              setHeight,
              prefs?.heightCm,
              (n) => ({
                heightCm: n,
              }),
            )}
            {numberField(
              'body-birthYear',
              t.profileBody.birthYear,
              birthYear,
              setBirthYear,
              prefs?.birthYear,
              (n) => ({ birthYear: n }),
            )}
            <div className="space-y-1.5">
              <Label htmlFor="body-sex" className="text-[0.8125rem] font-semibold">
                {t.profileBody.sex}
              </Label>
              <NativeSelect
                id="body-sex"
                value={sex}
                onChange={(e) => {
                  const next = e.target.value as BiologicalSex | '';
                  setSex(next);
                  void persist({ sex: next || null }, t.profileBody.sex);
                }}
              >
                <option value="">{t.profileBody.sexUnset}</option>
                <option value="female">{t.profileBody.sexFemale}</option>
                <option value="male">{t.profileBody.sexMale}</option>
              </NativeSelect>
            </div>
          </>
        )}
      </div>

      <p
        role="status"
        className={
          status === 'error'
            ? 'text-destructive text-[0.8125rem]'
            : 'text-muted-foreground text-[0.8125rem]'
        }
      >
        {status === 'saving'
          ? t.profileBody.saving
          : status === 'saved'
            ? t.profileBody.autoSaved
            : status === 'error'
              ? error
              : ''}
      </p>
    </Card>
  );
}

/** Profile → Nutrition goals (signed-in users; goals are stored on the account). */
export function ProfileNutritionGoalsCard() {
  const { user, authMode } = useAuth();
  const { t } = useLocale();
  if (authMode !== 'AUTHENTICATED') return null;
  const prefs = user?.preferences;
  // Remount the form when the saved values change (e.g. after saving or on another device).
  const key = JSON.stringify([
    prefs?.dailyKcalGoal ?? null,
    prefs?.proteinGoalG ?? null,
    prefs?.carbsGoalG ?? null,
    prefs?.fatGoalG ?? null,
  ]);
  return (
    <Card
      className="space-y-4 rounded-[1.25rem] p-5"
      aria-labelledby="nutrition-goals-title"
      role="region"
    >
      <div className="flex items-center gap-2.5">
        <Salad className="text-primary h-5 w-5" aria-hidden="true" />
        <div>
          <h2 id="nutrition-goals-title" className="font-display text-lg font-bold">
            {t.profileBody.goalsTitle}
          </h2>
          <p className="text-muted-foreground text-xs">{t.profileBody.goalsSub}</p>
        </div>
      </div>
      <NutritionGoalsForm key={key} idPrefix="body" />
    </Card>
  );
}
