'use client';

import { api } from '@/lib/api';
import { useLocale } from '@/providers/i18n/locale-context';
import { AdminState } from './admin-shell';
import { useAdminResource } from './use-admin-resource';

export function AdminDashboard() {
  const { t, bcp47 } = useLocale();
  const { data, error, loading, reload } = useAdminResource(() => api.admin.dashboard());
  const number = new Intl.NumberFormat(bcp47);

  if (loading || error || !data) return <AdminState error={error} onRetry={reload} />;

  const groups: Array<Array<[string, number]>> = [
    [
      [t.admin.totalUsers, data.totalUsers],
      [t.admin.newUsers, data.newUsersLast30Days],
      [t.admin.activeUsers, data.activeUsersLast7Days],
    ],
    [
      [t.admin.completedSessions, data.completedSessionsLast30Days],
      [t.admin.mealEntries, data.mealEntriesLast30Days],
    ],
    [
      [t.admin.usersWithAi, data.usersWithAiAccess],
      [t.admin.aiRuns, data.aiRunsLast30Days],
    ],
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-[2.125rem] leading-tight font-bold">{t.admin.navDashboard}</h1>
      <div className="grid gap-4 lg:grid-cols-3">
        {groups.map((rows, i) => (
          <dl key={i} className="bg-card divide-border/60 divide-y rounded-[1.25rem] px-5">
            {rows.map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-4 py-3.5">
                <dt className="text-muted-foreground text-[0.9375rem]">{label}</dt>
                <dd className="font-rounded text-[1.375rem] font-semibold tabular-nums">
                  {number.format(value)}
                </dd>
              </div>
            ))}
          </dl>
        ))}
      </div>
    </div>
  );
}
