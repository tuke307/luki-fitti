'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { Input } from '@luki-fitti/ui/components/ui/input';
import { Label } from '@luki-fitti/ui/components/ui/label';
import { Switch } from '@luki-fitti/ui/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@luki-fitti/ui/components/ui/tabs';
import { toast } from '@luki-fitti/ui/components/ui/sonner';
import { FEATURE_GRANT_LABELS, FeatureGrant } from '@luki-fitti/common/enums';
import { UpdateAiSettingsSchema, type AiSettingsDto } from '@luki-fitti/common/schemas';
import { api } from '@/lib/api';
import { useLocale } from '@/providers/i18n/locale-context';
import { AdminState } from './admin-shell';
import { useAdminResource } from './use-admin-resource';
import { AdminUserAiUsageDialog } from './admin-user-ai-usage-dialog';

const splitList = (value: string) =>
  value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

interface FormState {
  aiWorkoutBuilderEnabled: boolean;
  aiMealPhotoEnabled: boolean;
  workoutBuilderModel: string;
  workoutBuilderFallbacks: string;
  mealPhotoModel: string;
  mealPhotoFallbacks: string;
  aiDailyRunLimit: string;
  mealPhotoRetentionDays: string;
}

const toForm = (s: AiSettingsDto): FormState => ({
  aiWorkoutBuilderEnabled: s.aiWorkoutBuilderEnabled,
  aiMealPhotoEnabled: s.aiMealPhotoEnabled,
  workoutBuilderModel: s.workoutBuilderModel,
  workoutBuilderFallbacks: s.workoutBuilderFallbacks.join(', '),
  mealPhotoModel: s.mealPhotoModel,
  mealPhotoFallbacks: s.mealPhotoFallbacks.join(', '),
  aiDailyRunLimit: String(s.aiDailyRunLimit),
  mealPhotoRetentionDays: s.mealPhotoRetentionDays === null ? '' : String(s.mealPhotoRetentionDays),
});

export function AdminAiSettings() {
  const { t } = useLocale();
  const settings = useAdminResource(() => api.admin.getAiSettings());

  if (!settings.data) return <AdminState error={settings.error} onRetry={settings.reload} />;

  return (
    <div className="space-y-6">
      <h1 className="text-[2.125rem] leading-tight font-bold">{t.admin.navAi}</h1>
      {/* Remount the form whenever the saved settings change, so it always starts from them. */}
      <AiSettingsForm
        key={settings.data.updatedAt}
        initial={settings.data}
        onSaved={settings.setData}
      />
      <AiUsage />
    </div>
  );
}

function AiSettingsForm({
  initial,
  onSaved,
}: {
  initial: AiSettingsDto;
  onSaved: (s: AiSettingsDto) => void;
}) {
  const { t, format, locale } = useLocale();
  const [form, setForm] = useState<FormState>(() => toForm(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = UpdateAiSettingsSchema.safeParse({
      aiWorkoutBuilderEnabled: form.aiWorkoutBuilderEnabled,
      aiMealPhotoEnabled: form.aiMealPhotoEnabled,
      workoutBuilderModel: form.workoutBuilderModel.trim(),
      workoutBuilderFallbacks: splitList(form.workoutBuilderFallbacks),
      mealPhotoModel: form.mealPhotoModel.trim(),
      mealPhotoFallbacks: splitList(form.mealPhotoFallbacks),
      aiDailyRunLimit: Number(form.aiDailyRunLimit),
      mealPhotoRetentionDays: form.mealPhotoRetentionDays.trim()
        ? Number(form.mealPhotoRetentionDays)
        : null,
    });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const res = await api.admin.updateAiSettings(parsed.data);
      if (res.data) onSaved(res.data);
      toast.success(t.admin.settingsSaved);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.admin.error);
    } finally {
      setSaving(false);
    }
  };

  const field = (
    key: keyof FormState,
    label: string,
    props: React.ComponentProps<typeof Input> = {},
    hint?: string,
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={`ai-${key}`} className="text-[0.8125rem] font-semibold">
        {label}
      </Label>
      <Input
        id={`ai-${key}`}
        value={form[key] as string}
        onChange={(e) => set(key, e.target.value as never)}
        aria-invalid={Boolean(errors[key])}
        aria-describedby={errors[key] || hint ? `ai-${key}-hint` : undefined}
        {...props}
      />
      {(errors[key] || hint) && (
        <p
          id={`ai-${key}-hint`}
          className={`text-[0.8125rem] ${errors[key] ? 'text-destructive' : 'text-muted-foreground'}`}
        >
          {errors[key] ?? hint}
        </p>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {!initial.encryptionConfigured && (
        <p
          className="bg-warning/15 text-warning flex items-start gap-2 rounded-2xl p-4 text-[0.9375rem]"
          role="status"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {t.admin.encryptionMissing}
        </p>
      )}
      <p
        className="bg-secondary text-muted-foreground rounded-2xl p-4 text-[0.9375rem]"
        role="status"
      >
        {format(t.admin.keysSummary, {
          own: initial.usersWithOwnKey,
          admin: initial.usersWithAdminKey,
        })}
      </p>
      {!initial.storageConfigured && (
        <p
          className="bg-secondary text-muted-foreground rounded-2xl p-4 text-[0.9375rem]"
          role="status"
        >
          {t.admin.storageMissing}
        </p>
      )}

      <form onSubmit={save} className="space-y-4">
        <section className="bg-card space-y-2 rounded-[1.25rem] p-5" aria-labelledby="ai-features">
          <h2 id="ai-features" className="text-[1.0625rem] font-semibold">
            {t.admin.aiFeaturesTitle}
          </h2>
          <p className="text-muted-foreground text-[0.8125rem]">{t.admin.aiFeaturesSub}</p>
          {(
            [
              [FeatureGrant.AI_WORKOUT_BUILDER, 'aiWorkoutBuilderEnabled'],
              [FeatureGrant.AI_MEAL_PHOTO, 'aiMealPhotoEnabled'],
            ] as const
          ).map(([grant, key]) => (
            <label
              key={key}
              htmlFor={`ai-${key}`}
              className="flex min-h-11 items-center justify-between gap-3 text-[0.9375rem]"
            >
              {FEATURE_GRANT_LABELS[grant][locale]}
              <Switch id={`ai-${key}`} checked={form[key]} onCheckedChange={(on) => set(key, on)} />
            </label>
          ))}
        </section>

        <section className="bg-card space-y-4 rounded-[1.25rem] p-5" aria-labelledby="ai-models">
          <div>
            <h2 id="ai-models" className="text-[1.0625rem] font-semibold">
              {t.admin.modelsTitle}
            </h2>
            <p className="text-muted-foreground text-[0.8125rem]">{t.admin.modelsSub}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <p className="text-[0.9375rem] font-semibold">
                {FEATURE_GRANT_LABELS[FeatureGrant.AI_WORKOUT_BUILDER][locale]}
              </p>
              {field('workoutBuilderModel', t.admin.primaryModel, {
                spellCheck: false,
                autoCapitalize: 'off',
              })}
              {field('workoutBuilderFallbacks', t.admin.fallbackModels, {
                spellCheck: false,
                autoCapitalize: 'off',
              })}
            </div>
            <div className="space-y-3">
              <p className="text-[0.9375rem] font-semibold">
                {FEATURE_GRANT_LABELS[FeatureGrant.AI_MEAL_PHOTO][locale]}
              </p>
              {field('mealPhotoModel', t.admin.primaryModel, {
                spellCheck: false,
                autoCapitalize: 'off',
              })}
              {field('mealPhotoFallbacks', t.admin.fallbackModels, {
                spellCheck: false,
                autoCapitalize: 'off',
              })}
            </div>
          </div>
        </section>

        <section className="bg-card space-y-4 rounded-[1.25rem] p-5" aria-labelledby="ai-limits">
          <h2 id="ai-limits" className="text-[1.0625rem] font-semibold">
            {t.admin.limitsTitle}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {field('aiDailyRunLimit', t.admin.dailyLimit, {
              type: 'number',
              inputMode: 'numeric',
              min: 0,
              max: 1000,
            })}
            {field(
              'mealPhotoRetentionDays',
              t.admin.retention,
              { type: 'number', inputMode: 'numeric', min: 1 },
              t.admin.retentionHint,
            )}
          </div>
        </section>

        <Button type="submit" disabled={saving}>
          {t.admin.saveSettings}
        </Button>
      </form>
    </div>
  );
}

function AiUsage() {
  const { t, format, bcp47 } = useLocale();
  const [days, setDays] = useState(30);
  const [detailUser, setDetailUser] = useState<{ id: string; email: string } | null>(null);
  const { data, error, loading, reload } = useAdminResource(
    () => api.admin.aiUsage(days),
    String(days),
  );
  const number = new Intl.NumberFormat(bcp47);
  const usd = new Intl.NumberFormat(bcp47, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 4,
  });

  return (
    <section className="bg-card space-y-4 rounded-[1.25rem] p-5" aria-labelledby="ai-usage">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="ai-usage" className="text-[1.0625rem] font-semibold">
            {t.admin.usageTitle}
          </h2>
          <p className="text-muted-foreground text-[0.8125rem]">
            {format(t.admin.usageRange, { days })}
          </p>
        </div>
        <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <TabsList>
            <TabsTrigger value="7">7d</TabsTrigger>
            <TabsTrigger value="30">30d</TabsTrigger>
            <TabsTrigger value="90">90d</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {loading || error || !data ? (
        <AdminState error={error} onRetry={reload} />
      ) : data.totalRuns === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-[0.9375rem]">{t.admin.noUsage}</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                [t.admin.runs, number.format(data.totalRuns)],
                [t.admin.failed, number.format(data.failedRuns)],
                [t.admin.cost, usd.format(data.costUsd)],
                [t.admin.avgDuration, `${(data.avgDurationMs / 1000).toFixed(1)} s`],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="bg-secondary/60 rounded-2xl px-3.5 py-3">
                <dt className="text-muted-foreground text-[0.8125rem]">{label}</dt>
                <dd className="font-rounded text-[1.25rem] font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.byDay} margin={{ top: 4, right: 0, left: -24, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) => d.slice(5)}
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
                <Tooltip
                  cursor={{ fill: 'color-mix(in oklch, var(--muted) 60%, transparent)' }}
                  wrapperStyle={{ outline: 'none' }}
                  formatter={(v) => [v, t.admin.runs]}
                />
                <Bar dataKey="runs" fill="var(--chart-1)" radius={[6, 6, 6, 6]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <ul className="divide-border/60 divide-y text-[0.9375rem]">
              {data.bySkill.map((s) => (
                <li key={s.skill} className="flex justify-between gap-3 py-2.5">
                  <span>{s.skill}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {number.format(s.runs)} · {usd.format(s.costUsd)}
                  </span>
                </li>
              ))}
            </ul>
            <div>
              <h3 className="text-muted-foreground mb-1 text-[0.8125rem] font-semibold">
                {t.admin.topUsers}
              </h3>
              <ul className="divide-border/60 divide-y text-[0.9375rem]">
                {data.topUsers.map((u) => (
                  <li key={u.userId}>
                    <button
                      type="button"
                      onClick={() => setDetailUser({ id: u.userId, email: u.email })}
                      aria-label={format(t.aiUsage.adminShowDetail, { email: u.email })}
                      className="hover:bg-secondary/60 flex min-h-11 w-full items-center justify-between gap-3 rounded-lg py-2.5 text-left"
                    >
                      <span className="truncate">{u.email}</span>
                      <span className="text-muted-foreground shrink-0 tabular-nums">
                        {number.format(u.runs)} · {usd.format(u.costUsd)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="text-muted-foreground text-[0.8125rem] tabular-nums">
            {t.admin.tokens}: {number.format(data.promptTokens)} /{' '}
            {number.format(data.completionTokens)}
          </p>
        </>
      )}
      <AdminUserAiUsageDialog user={detailUser} onClose={() => setDetailUser(null)} />
    </section>
  );
}
