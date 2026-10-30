'use client';

import { useMemo, useState } from 'react';
import { Plus, Scale } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer, YAxis } from 'recharts';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { WeightUnit } from '@luki-fitti/common/enums';
import { weightTrend } from '@luki-fitti/common/utils/client';
import { useAuth } from '@/providers/auth/auth-context';
import { useLocale } from '@/providers/i18n/locale-context';
import { unitLabel } from '@/lib/format/weight';
import { useBodyWeight } from '@/lib/body-weight/use-body-weight';
import { sparklinePoints, toDisplayWeight } from '@/lib/body-weight/body-weight';
import { formatWeight, formatWeightDelta } from '@/lib/body-weight/weight-format';

interface WeightHomeCardProps {
  /** Opens the weight section (profile tab) with the weight input focused. */
  onLogWeight: () => void;
}

/** Compact body weight summary for the home tab (signed-in users only). */
export function WeightHomeCard({ onLogWeight }: WeightHomeCardProps) {
  const { user } = useAuth();
  const { t, format, bcp47 } = useLocale();
  const { enabled, entries, latest } = useBodyWeight();
  const [nowMs] = useState(() => Date.now());
  const unit = user?.preferences?.weightUnit ?? WeightUnit.KG;
  const unitText = unitLabel(unit);

  const points = useMemo(
    () => sparklinePoints(entries, unit, new Date(nowMs)),
    [entries, unit, nowMs],
  );
  const change30d = useMemo(
    () => weightTrend(entries, new Date(nowMs)).change30dKg,
    [entries, nowMs],
  );

  if (!enabled) return null;

  return (
    <section
      aria-labelledby="home-weight"
      data-testid="home-weight-card"
      className="bg-card space-y-3 rounded-[1.25rem] p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-0.5">
          <h2 id="home-weight" className="flex items-center gap-2 text-[1.0625rem] font-semibold">
            <Scale className="text-primary h-4 w-4" aria-hidden="true" /> {t.weight.title}
          </h2>
          {latest ? (
            <>
              <p className="font-rounded text-[1.75rem] leading-tight font-semibold tabular-nums">
                {formatWeight(toDisplayWeight(latest.weightKg, unit), bcp47)}
                <span className="text-muted-foreground text-[1.0625rem] font-medium">
                  {' '}
                  {unitText}
                </span>
              </p>
              {change30d !== null && (
                <p className="text-muted-foreground text-[0.9375rem] tabular-nums">
                  {format(t.weight.homeChange, {
                    change: formatWeightDelta(toDisplayWeight(change30d, unit), bcp47),
                    unit: unitText,
                  })}
                </p>
              )}
            </>
          ) : (
            <p className="text-muted-foreground text-[0.9375rem]">{t.weight.homeEmpty}</p>
          )}
        </div>
        {points.length >= 2 && (
          <div className="h-14 w-28 shrink-0 sm:w-40" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={points}
                margin={{ top: 4, right: 4, left: 4, bottom: 4 }}
                accessibilityLayer={false}
              >
                <YAxis hide domain={['dataMin - 0.5', 'dataMax + 0.5']} />
                <Line
                  type="monotone"
                  dataKey="avg"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={onLogWeight}>
        <Plus className="h-4 w-4" aria-hidden="true" /> {t.weight.homeCta}
      </Button>
    </section>
  );
}
