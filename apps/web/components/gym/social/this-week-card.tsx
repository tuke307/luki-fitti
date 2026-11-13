'use client';

import React, { useEffect, useState } from 'react';
import type { PointsWeekDto } from '@luki-fitti/common/schemas';
import { pointsApi } from '@/lib/social/social-api';
import { useLocale } from '@/providers/i18n/locale-context';

const DAY_MS = 24 * 60 * 60 * 1000;
const BAR_AREA_PX = 80;

/** "This week" card: weekly EP total, Mon–Sun bars with the daily-cap marker, goal progress. */
export function ThisWeekCard() {
  const { t, locale } = useLocale();
  const [week, setWeek] = useState<PointsWeekDto | null>(null);

  useEffect(() => {
    let cancelled = false;
    void pointsApi.week().then((res) => {
      if (!cancelled && res.data) setWeek(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!week) return null;

  const bcp47 = locale === 'de' ? 'de-DE' : 'en-GB';
  const monday = new Date(`${week.weekKey}T12:00:00Z`);
  const byDay = new Map(week.days.map((d) => [d.dayKey, d]));
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday.getTime() + i * DAY_MS);
    const dayKey = date.toISOString().slice(0, 10);
    return {
      dayKey,
      label: date.toLocaleDateString(bcp47, { weekday: 'narrow', timeZone: 'UTC' }),
      capped: byDay.get(dayKey)?.capped ?? 0,
    };
  });
  const chartMax = Math.max(week.dailyCap, ...days.map((d) => d.capped), 1);
  const capY = BAR_AREA_PX - (week.dailyCap / chartMax) * BAR_AREA_PX;
  const goalReached = week.goal.target > 0 && week.goal.done >= week.goal.target;

  return (
    <section className="bg-card rounded-[1.25rem] p-4" data-testid="this-week-card">
      <div className="flex items-baseline justify-between">
        <h2 className="text-muted-foreground text-[0.8125rem] font-medium tracking-wide uppercase">
          {t.league.thisWeek}
        </h2>
        <p className="font-rounded text-[1.75rem] leading-none font-semibold tabular-nums">
          {week.points.toLocaleString(bcp47)}
          <span className="text-muted-foreground ml-1 text-[0.8125rem] font-medium">
            {t.league.epUnit}
          </span>
        </p>
      </div>

      <div aria-hidden="true">
        <div className="relative mt-4 flex items-end gap-1.5" style={{ height: BAR_AREA_PX }}>
          {days.map((d) => (
            <div key={d.dayKey} className="flex min-w-0 flex-1 items-end">
              <div
                className="bg-primary/80 w-full max-w-10 rounded-md"
                style={{ height: `${Math.max(3, (d.capped / chartMax) * BAR_AREA_PX)}px` }}
              />
            </div>
          ))}
          {week.dailyCap > 0 && (
            <div
              className="border-muted-foreground/60 absolute right-0 left-0 border-t border-dashed"
              style={{ top: capY }}
            />
          )}
        </div>
        <div className="mt-1 flex gap-1.5">
          {days.map((d) => (
            <span
              key={d.dayKey}
              className="text-muted-foreground min-w-0 flex-1 text-center text-[0.625rem]"
            >
              {d.label}
            </span>
          ))}
        </div>
      </div>

      <p className="text-muted-foreground mt-2 text-[0.8125rem]" data-testid="this-week-goal">
        {goalReached
          ? t.league.goalDone.replace('{bonus}', String(week.goal.bonus))
          : t.league.goalProgress
              .replace('{done}', String(week.goal.done))
              .replaceAll('{target}', String(week.goal.target))
              .replace('{bonus}', String(week.goal.bonus))}
      </p>
    </section>
  );
}
