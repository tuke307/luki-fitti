'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { Input } from '@luki-fitti/ui/components/ui/input';
import { cn } from '@luki-fitti/ui/lib/utils';
import { useLocale } from '@/providers/i18n/locale-context';
import { ringProgress, shiftDay, weekDays, weekStartKey } from '@/lib/nutrition/nutrition-day';

interface DayWeekStripProps {
  selected: string;
  todayKey: string;
  kcalByDay: ReadonlyMap<string, number>;
  goal: number | null;
  onSelect: (key: string) => void;
  /** Called with the Monday of the week on screen (e.g. to load older entries). */
  onVisibleWeekChange?: (weekStart: string) => void;
}

const toDate = (key: string) => new Date(`${key}T12:00:00`);

/** Food tab day navigation: a Monday-first week of days with kcal rings, week paging and a date jump. */
export function DayWeekStrip({
  selected,
  todayKey,
  kcalByDay,
  goal,
  onSelect,
  onVisibleWeekChange,
}: DayWeekStripProps) {
  const { t, format, bcp47 } = useLocale();
  const [visibleWeek, setVisibleWeek] = useState(() => weekStartKey(selected));
  const [syncedSelection, setSyncedSelection] = useState(selected);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const focusSelected = useRef(false);

  if (syncedSelection !== selected) {
    setSyncedSelection(selected);
    setVisibleWeek(weekStartKey(selected));
  }

  useEffect(() => {
    onVisibleWeekChange?.(visibleWeek);
  }, [visibleWeek, onVisibleWeekChange]);

  useEffect(() => {
    if (!focusSelected.current) return;
    focusSelected.current = false;
    buttons.current.get(selected)?.focus();
  }, [selected, visibleWeek]);

  const days = weekDays(visibleWeek);
  const currentWeek = weekStartKey(todayKey);
  const focusable = days.includes(selected) ? selected : days[0];
  const clamp = (key: string) => (key > todayKey ? todayKey : key);
  const longDate = (key: string) =>
    toDate(key).toLocaleDateString(bcp47, { weekday: 'long', day: 'numeric', month: 'long' });
  const shortDate = (key: string) =>
    toDate(key).toLocaleDateString(bcp47, { day: 'numeric', month: 'short' });

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, key: string) => {
    const target = {
      ArrowLeft: shiftDay(key, -1),
      ArrowRight: shiftDay(key, 1),
      PageUp: shiftDay(key, -7),
      PageDown: shiftDay(key, 7),
      Home: days[0],
      End: days[6],
    }[event.key];
    if (!target) return;
    event.preventDefault();
    focusSelected.current = true;
    onSelect(clamp(target));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t.nutrition.previousWeek}
          onClick={() => setVisibleWeek((w) => shiftDay(w, -7))}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <p className="text-muted-foreground min-w-0 flex-1 truncate text-center text-[0.8125rem] font-medium tabular-nums">
          {shortDate(days[0]!)} – {shortDate(days[6]!)}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t.nutrition.nextWeek}
          disabled={visibleWeek >= currentWeek}
          onClick={() => setVisibleWeek((w) => shiftDay(w, 7))}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
      <div
        role="group"
        aria-label={format(t.nutrition.weekStrip, { date: longDate(visibleWeek) })}
        className="flex gap-1"
      >
        {days.map((key) => {
          const isFuture = key > todayKey;
          const isSelected = key === selected;
          const isToday = key === todayKey;
          const eaten = isFuture ? 0 : Math.round(kcalByDay.get(key) ?? 0);
          const label =
            goal !== null
              ? format(t.nutrition.dayKcalOfGoal, { day: longDate(key), kcal: eaten, goal })
              : format(t.nutrition.dayKcal, { day: longDate(key), kcal: eaten });
          return (
            <button
              key={key}
              ref={(el) => {
                if (el) buttons.current.set(key, el);
                else buttons.current.delete(key);
              }}
              type="button"
              tabIndex={key === focusable ? 0 : -1}
              disabled={isFuture}
              aria-pressed={isSelected}
              aria-current={isToday ? 'date' : undefined}
              aria-label={label}
              data-day={key}
              onClick={() => onSelect(key)}
              onKeyDown={(e) => onKeyDown(e, key)}
              className={cn(
                'focus-visible:ring-ring flex min-h-14 min-w-11 flex-1 flex-col items-center gap-1 rounded-xl py-1.5 outline-none focus-visible:ring-2 disabled:opacity-35 motion-safe:transition-colors',
                isSelected ? 'bg-primary/15' : 'hover:bg-secondary/60',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'text-[0.6875rem] font-semibold uppercase',
                  isToday ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                {toDate(key).toLocaleDateString(bcp47, { weekday: 'narrow' })}
              </span>
              <DayRing
                progress={ringProgress(eaten, goal)}
                over={goal !== null && eaten > goal}
                emphasized={isSelected || isToday}
                today={isToday}
                label={String(toDate(key).getDate())}
              />
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-end gap-2">
        <Input
          type="date"
          aria-label={t.nutrition.jumpToDate}
          max={todayKey}
          value={selected}
          onChange={(e) => {
            const key = e.target.value;
            if (/^\d{4}-\d{2}-\d{2}$/.test(key)) onSelect(clamp(key));
          }}
          className="h-9 w-auto tabular-nums"
        />
        {selected !== todayKey && (
          <Button type="button" variant="secondary" size="sm" onClick={() => onSelect(todayKey)}>
            {t.nutrition.today}
          </Button>
        )}
      </div>
    </div>
  );
}

function DayRing({
  progress,
  over,
  emphasized,
  today,
  label,
}: {
  progress: number;
  over: boolean;
  emphasized: boolean;
  today: boolean;
  label: string;
}) {
  const size = 36;
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <span aria-hidden="true" className="relative grid size-9 place-items-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="absolute -rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--secondary)"
          strokeWidth={stroke}
        />
        {progress > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={over ? 'var(--warning)' : 'var(--primary)'}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
            className="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-500"
          />
        )}
      </svg>
      <span
        className={cn(
          'text-[0.875rem] tabular-nums',
          emphasized ? 'font-bold' : 'font-medium',
          today && 'text-primary',
        )}
      >
        {label}
      </span>
    </span>
  );
}
