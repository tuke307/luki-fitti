'use client';

import { useCallback, useMemo, useState } from 'react';
import { Flame, Plus, Target } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { toast } from '@luki-fitti/ui/components/ui/sonner';
import {
  FeatureGrant,
  FoodItemSource,
  MealAmountUnit,
  type MealType,
} from '@luki-fitti/common/enums';
import type { MealEntryDto, UpsertMealEntryDto } from '@luki-fitti/common/schemas';
import { formatMealAmount, goalProgress } from '@luki-fitti/common/utils/client';
import { useAuth } from '@/providers/auth/auth-context';
import { useGym } from '@/providers/gym/gym-context';
import { useLocale } from '@/providers/i18n/locale-context';
import { buildDay, dayKey, kcalByDay, lastDays, shiftDay } from '@/lib/nutrition/nutrition-day';
import { useNutrition } from '@/lib/nutrition/use-nutrition';
import { useBodyWeight } from '@/lib/body-weight/use-body-weight';
import type { NavTab } from '../pwa-shell';
import { DayWeekStrip } from './day-week-strip';
import { MealEditorDialog } from './meal-editor-dialog';
import { NutritionGoalsDialog } from './nutrition-goals-form';

const toPayload = (e: MealEntryDto): UpsertMealEntryDto => ({
  clientEntryId: e.clientEntryId,
  eatenAt: e.eatenAt,
  mealType: e.mealType,
  label: e.label,
  notes: e.notes,
  items: e.items.map((i) => ({
    name: i.name,
    grams: i.grams,
    amountUnit: i.amountUnit ?? MealAmountUnit.G,
    kcal: i.kcal,
    proteinG: i.proteinG,
    carbsG: i.carbsG,
    fatG: i.fatG,
    fiberG: i.fiberG,
    sugarG: i.sugarG,
    source: i.source,
    confidence: i.confidence,
  })),
});

/** Row subtitle: item names (when a label is the title) with amounts, e.g. "Iced tea 500 ml". */
const itemAmounts = (e: MealEntryDto, locale: string) =>
  e.items
    .map((i) =>
      [e.label ? i.name : '', formatMealAmount(i.grams, i.amountUnit, locale)]
        .filter(Boolean)
        .join(' '),
    )
    .filter(Boolean)
    .join(', ');

export function NutritionView({ onNavigate }: { onNavigate: (tab: NavTab) => void }) {
  const { user, authMode } = useAuth();
  const isAuthenticated = authMode === 'AUTHENTICATED';
  const { historySessions, isOnline } = useGym();
  const { t, format, bcp47 } = useLocale();
  const { entries, pending, save, remove, upsertLocal, loadFrom } = useNutrition();
  const { entries: weighIns } = useBodyWeight();

  const todayKey = dayKey(new Date());
  const [selected, setSelected] = useState(todayKey);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<MealEntryDto | null>(null);
  const [defaultMealType, setDefaultMealType] = useState<MealType | undefined>();

  const prefs = user?.preferences;
  const kcalGoal = prefs?.dailyKcalGoal ?? null;
  const canUsePhotos = user?.features?.includes(FeatureGrant.AI_MEAL_PHOTO) ?? false;

  const day = useMemo(
    () => buildDay(selected, entries, historySessions, weighIns, prefs?.bodyWeightKg),
    [selected, entries, historySessions, weighIns, prefs?.bodyWeightKg],
  );
  const kcalPerDay = useMemo(() => kcalByDay(entries), [entries]);
  const loadWeek = useCallback((weekStart: string) => void loadFrom(weekStart), [loadFrom]);
  const week = useMemo(
    () =>
      lastDays(selected, 7).map((key) => {
        const d = buildDay(key, entries, historySessions, weighIns, prefs?.bodyWeightKg);
        return {
          key,
          label: new Date(`${key}T12:00:00`).toLocaleDateString(bcp47, { weekday: 'short' }),
          eaten: d.totals.kcal,
          burned: d.burnedKcal,
        };
      }),
    [selected, entries, historySessions, weighIns, prefs?.bodyWeightKg, bcp47],
  );

  const dayLabel =
    selected === todayKey
      ? t.nutrition.today
      : selected === shiftDay(todayKey, -1)
        ? t.nutrition.yesterday
        : new Date(`${selected}T12:00:00`).toLocaleDateString(bcp47, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          });

  const net = day.totals.kcal - day.burnedKcal;
  const remaining = kcalGoal !== null ? kcalGoal - net : null;
  const timeFormat = (iso: string) =>
    new Date(iso).toLocaleTimeString(bcp47, { hour: '2-digit', minute: '2-digit' });

  const openEditor = (entry: MealEntryDto | null, mealType?: MealType) => {
    setEditing(entry);
    setDefaultMealType(mealType);
    setEditorOpen(true);
  };

  const handleSave = async (payload: UpsertMealEntryDto) => {
    const reachedServer = await save(payload);
    if (!reachedServer) toast.info(t.nutrition.savedOffline);
  };

  const handleDelete = async (entry: MealEntryDto) => {
    setEditorOpen(false);
    await remove(entry);
    // Undo re-saves the items under the same client id. If the delete is still queued offline the
    // upsert supersedes it; once deleted on the server, the photos can't come back.
    toast(t.nutrition.mealDeleted, {
      action: { label: t.nutrition.undo, onClick: () => void save(toPayload(entry)) },
    });
  };

  const macros = [
    { label: t.nutrition.protein, value: day.totals.proteinG, goal: prefs?.proteinGoalG ?? null },
    { label: t.nutrition.carbs, value: day.totals.carbsG, goal: prefs?.carbsGoalG ?? null },
    { label: t.nutrition.fat, value: day.totals.fatG, goal: prefs?.fatGoalG ?? null },
  ];

  return (
    <div className="mx-auto max-w-2xl min-w-0 space-y-6 pb-10">
      <header className="space-y-3">
        <div className="min-w-0 space-y-1">
          <p
            className="text-muted-foreground text-[0.9375rem] font-medium first-letter:uppercase"
            aria-live="polite"
          >
            {dayLabel}
          </p>
          <h1 className="text-[2.125rem] leading-tight font-bold">{t.nutrition.title}</h1>
        </div>
        <DayWeekStrip
          selected={selected}
          todayKey={todayKey}
          kcalByDay={kcalPerDay}
          goal={kcalGoal}
          onSelect={setSelected}
          onVisibleWeekChange={loadWeek}
        />
      </header>

      <section aria-label={t.nutrition.eaten} className="bg-card space-y-5 rounded-[1.25rem] p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[1.0625rem] font-semibold tabular-nums">
            {kcalGoal !== null
              ? `${t.nutrition.goal}: ${kcalGoal} ${t.nutrition.kcal}`
              : t.profileBody.goalsTitle}
          </h2>
          {isAuthenticated ? (
            <NutritionGoalsDialog>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                aria-label={t.profileBody.goalsAria}
                data-testid="nutrition-goals-btn"
              >
                <Target className="h-4 w-4" aria-hidden="true" /> {t.profileBody.goalsButton}
              </Button>
            </NutritionGoalsDialog>
          ) : null}
        </div>
        <div className="flex items-center gap-5">
          {isAuthenticated ? (
            <NutritionGoalsDialog>
              <button
                type="button"
                aria-label={t.profileBody.goalsAria}
                className="focus-visible:ring-ring/50 shrink-0 rounded-full outline-none focus-visible:ring-[3px]"
              >
                <IntakeRing
                  progress={goalProgress(net, kcalGoal) ?? (day.totals.kcal > 0 ? 1 : 0)}
                  over={remaining !== null && remaining < 0}
                />
              </button>
            </NutritionGoalsDialog>
          ) : (
            <IntakeRing
              progress={goalProgress(net, kcalGoal) ?? (day.totals.kcal > 0 ? 1 : 0)}
              over={remaining !== null && remaining < 0}
            />
          )}
          <dl className="grid min-w-0 flex-1 grid-cols-3 gap-2">
            {[
              [t.nutrition.eaten, day.totals.kcal],
              [t.nutrition.burned, day.burnedKcal],
              [
                remaining !== null && remaining < 0 ? t.nutrition.over : t.nutrition.remaining,
                remaining === null ? '–' : Math.abs(Math.round(remaining)),
              ],
            ].map(([label, value]) => (
              <div key={String(label)} className="min-w-0">
                <dt className="text-muted-foreground truncate text-[0.8125rem]">{label}</dt>
                <dd className="font-rounded text-[1.5rem] leading-tight font-semibold tabular-nums">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        {kcalGoal === null &&
          (isAuthenticated ? (
            <NutritionGoalsDialog>
              <Button type="button" variant="link" size="sm" className="px-0">
                <Plus className="h-4 w-4" aria-hidden="true" /> {t.profileBody.setGoalHint}
              </Button>
            </NutritionGoalsDialog>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-muted-foreground text-[0.875rem]">{t.nutrition.noGoal}</p>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="px-0"
                onClick={() => onNavigate('profile')}
              >
                {t.nutrition.setGoal}
              </Button>
            </div>
          ))}
        <ul className="grid grid-cols-3 gap-3">
          {macros.map((m) => {
            const p = goalProgress(m.value, m.goal);
            return (
              <li key={m.label} className="min-w-0 space-y-1.5">
                <div className="min-w-0 text-[0.8125rem] leading-tight">
                  <span className="block truncate">{m.label}</span>
                  <span className="text-muted-foreground block truncate tabular-nums">
                    {Math.round(m.value)}
                    {m.goal ? ` / ${m.goal}` : ''} {t.nutrition.grams}
                  </span>
                </div>
                <div className="bg-secondary h-1.5 overflow-hidden rounded-full" aria-hidden="true">
                  <div
                    className="bg-primary h-full rounded-full transition-[width] duration-500 ease-(--ease-out-quart)"
                    style={{ width: `${(p ?? (m.value > 0 ? 1 : 0)) * 100}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <Button type="button" size="lg" className="w-full" onClick={() => openEditor(null)}>
        <Plus className="h-4 w-4" /> {t.nutrition.addMeal}
      </Button>

      {pending > 0 && (
        <p className="text-muted-foreground text-[0.8125rem]" role="status">
          {t.nutrition.savedOffline}
        </p>
      )}

      {day.entries.length === 0 ? (
        <section className="bg-card space-y-1 rounded-[1.25rem] p-5 text-center">
          <p className="text-[1.0625rem] font-semibold">{t.nutrition.emptyDay}</p>
          <p className="text-muted-foreground text-[0.9375rem]">{t.nutrition.emptyDayHint}</p>
        </section>
      ) : (
        day.byMealType.map((group) => (
          <section
            key={group.mealType}
            aria-labelledby={`meal-${group.mealType}`}
            className="bg-card rounded-[1.25rem]"
          >
            <div className="flex items-baseline justify-between gap-3 px-5 pt-4 pb-1">
              <h2 id={`meal-${group.mealType}`} className="text-[1.0625rem] font-semibold">
                {t.nutrition.mealTypes[group.mealType]}
              </h2>
              <span className="text-muted-foreground text-[0.9375rem] tabular-nums">
                {group.kcal} {t.nutrition.kcal}
              </span>
            </div>
            <ul className="divide-border/60 divide-y">
              {group.entries.map((entry) => (
                <li key={entry.clientEntryId}>
                  <button
                    type="button"
                    onClick={() => openEditor(entry)}
                    className="hover:bg-secondary/40 flex min-h-14 w-full items-center gap-3 px-5 py-3 text-left transition-colors"
                  >
                    {entry.photos[0]?.url && (
                      // eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin API image
                      <img
                        src={entry.photos[0].url}
                        alt=""
                        className="size-11 shrink-0 rounded-lg object-cover"
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.9375rem] font-medium">
                        {entry.label ||
                          entry.items.map((i) => i.name).join(', ') ||
                          t.nutrition.mealTypes[entry.mealType]}
                      </span>
                      <span className="text-muted-foreground block truncate text-[0.8125rem]">
                        {timeFormat(entry.eatenAt)}
                        {itemAmounts(entry, bcp47) && ` · ${itemAmounts(entry, bcp47)}`}
                        {entry.items.some((i) => i.source === FoodItemSource.AI) &&
                          ` · ${t.nutrition.estimatedByAi}`}
                      </span>
                    </span>
                    <span className="font-rounded shrink-0 text-[1.0625rem] font-semibold tabular-nums">
                      {entry.totals.kcal}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {day.workouts.length > 0 && (
        <section aria-labelledby="burn-title" className="bg-card space-y-3 rounded-[1.25rem] p-5">
          <h2 id="burn-title" className="flex items-center gap-2 text-[1.0625rem] font-semibold">
            <Flame className="text-primary h-4 w-4" aria-hidden="true" /> {t.nutrition.burned}
          </h2>
          <ul className="space-y-1.5 text-[0.9375rem]">
            {day.workouts.map(({ session, kcal }) => (
              <li key={session.clientSessionId} className="flex justify-between gap-3">
                <span className="truncate">{session.workoutNameSnapshot}</span>
                <span className="text-muted-foreground shrink-0 tabular-nums">
                  {kcal} {t.nutrition.kcal}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-[0.8125rem]">
            {t.nutrition.burnEstimateNote}{' '}
            {day.usedDefaultBodyWeight && t.nutrition.burnDefaultWeightNote}
          </p>
        </section>
      )}

      <section
        aria-labelledby="week-title"
        className="bg-card min-w-0 space-y-4 rounded-[1.25rem] p-5"
      >
        <div>
          <h2 id="week-title" className="text-[1.0625rem] font-semibold">
            {t.nutrition.weekTitle}
          </h2>
          <p className="text-muted-foreground text-[0.8125rem]">{t.nutrition.weekSub}</p>
        </div>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={week} margin={{ top: 4, right: 0, left: -6, bottom: 0 }} barGap={2}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                axisLine={false}
                tickLine={false}
                width={48}
                allowDecimals={false}
              />
              {kcalGoal && (
                <ReferenceLine
                  y={kcalGoal}
                  stroke="var(--muted-foreground)"
                  strokeDasharray="4 4"
                />
              )}
              <Tooltip
                cursor={{ fill: 'color-mix(in oklch, var(--muted) 60%, transparent)' }}
                wrapperStyle={{ outline: 'none' }}
                content={({ active, payload, label }) => {
                  const row = active
                    ? (payload?.[0]?.payload as (typeof week)[number] | undefined)
                    : undefined;
                  if (!row) return null;
                  return (
                    <div className="bg-popover text-popover-foreground pointer-events-none rounded-xl px-3 py-2 text-[0.8125rem]">
                      <p className="font-semibold">{String(label ?? '')}</p>
                      <p className="text-muted-foreground tabular-nums">
                        {t.nutrition.eaten} {row.eaten} · {t.nutrition.burned} {row.burned}{' '}
                        {t.nutrition.kcal}
                      </p>
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="eaten"
                name={t.nutrition.eaten}
                fill="var(--chart-1)"
                radius={[6, 6, 6, 6]}
                maxBarSize={18}
              />
              <Bar
                dataKey="burned"
                name={t.nutrition.burned}
                fill="var(--chart-2)"
                radius={[6, 6, 6, 6]}
                maxBarSize={18}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-muted-foreground text-[0.8125rem]">
          {(() => {
            const logged = week.filter((d) => d.eaten > 0);
            const avg = logged.length
              ? Math.round(logged.reduce((a, d) => a + d.eaten, 0) / logged.length)
              : 0;
            return `${format(t.nutrition.loggedDays, { count: logged.length, total: week.length })}${logged.length ? ` · ${format(t.nutrition.avgPerDay, { kcal: avg })}` : ''}`;
          })()}
        </p>
      </section>

      <MealEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        entry={editing}
        dayKey={selected}
        defaultMealType={defaultMealType}
        isOnline={isOnline}
        onSave={handleSave}
        onDelete={(entry) => void handleDelete(entry)}
        canUsePhotos={canUsePhotos}
        onEntryChanged={upsertLocal}
        onDiscardEntry={remove}
      />
    </div>
  );
}

function IntakeRing({ progress, over }: { progress: number; over: boolean }) {
  const size = 84;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const color = over ? 'var(--warning)' : 'var(--primary)';
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0 -rotate-90"
      aria-hidden="true"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="color-mix(in oklch, var(--primary) 18%, transparent)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - Math.min(1, progress))}
        className="transition-[stroke-dashoffset] duration-700 ease-(--ease-out-quart)"
      />
    </svg>
  );
}
