'use client';

import { useState } from 'react';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { Input } from '@luki-fitti/ui/components/ui/input';
import { Label } from '@luki-fitti/ui/components/ui/label';
import { Switch } from '@luki-fitti/ui/components/ui/switch';
import { toast } from '@luki-fitti/ui/components/ui/sonner';
import { LeagueStageMode } from '@luki-fitti/common/enums';
import type { UpdateLeagueSettingsDto } from '@luki-fitti/common/schemas';
import { adminLeagueApi } from '@/lib/social/social-api';
import { useLocale } from '@/providers/i18n/locale-context';
import { AdminState } from './admin-shell';
import { useAdminResource } from './use-admin-resource';

const STAGE_MODES = [
  LeagueStageMode.AUTO,
  LeagueStageMode.FRIENDS,
  LeagueStageMode.GLOBAL,
  LeagueStageMode.ARENAS,
] as const;

export function AdminLeagueSettings() {
  const { t } = useLocale();
  const settings = useAdminResource(() => adminLeagueApi.settings());
  const preview = useAdminResource(() => adminLeagueApi.preview());
  const [busy, setBusy] = useState(false);

  const save = async (patch: UpdateLeagueSettingsDto) => {
    setBusy(true);
    try {
      const res = await adminLeagueApi.updateSettings(patch);
      if (res.data) {
        settings.setData(res.data);
        toast.success(t.admin.settingsSaved);
      }
    } catch {
      toast.error(t.admin.error);
    } finally {
      setBusy(false);
    }
  };

  const numberField = (
    label: string,
    value: number,
    key: keyof UpdateLeagueSettingsDto,
    testId: string,
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={testId}>{label}</Label>
      <Input
        id={testId}
        type="number"
        min={0}
        defaultValue={value}
        disabled={busy}
        data-testid={testId}
        onBlur={(e) => {
          const next = Number.parseInt(e.target.value, 10);
          if (Number.isFinite(next) && next !== value) void save({ [key]: next });
        }}
      />
    </div>
  );

  if (settings.loading) return <AdminState />;
  if (settings.error || !settings.data)
    return <AdminState error={settings.error} onRetry={settings.reload} />;

  const s = settings.data;

  return (
    <div className="space-y-6" data-testid="admin-league-settings">
      <div className="bg-card flex items-center justify-between gap-4 rounded-[1.25rem] p-4">
        <div>
          <p className="text-[0.9375rem] font-medium">{t.admin.leaguesEnabledLabel}</p>
          <p className="text-muted-foreground text-[0.8125rem]">{t.admin.leaguesSub}</p>
        </div>
        <Switch
          checked={s.leaguesEnabled}
          disabled={busy}
          onCheckedChange={(enabled) => void save({ leaguesEnabled: enabled })}
          data-testid="leagues-enabled-switch"
        />
      </div>

      <div className="bg-card space-y-4 rounded-[1.25rem] p-4">
        <p className="text-[0.9375rem] font-medium">{t.admin.leaguesTitle}</p>
        <div className="space-y-1.5">
          <Label htmlFor="league-stage-mode">{t.admin.leagueStageModeLabel}</Label>
          <select
            id="league-stage-mode"
            data-testid="league-stage-mode"
            disabled={busy}
            value={s.leagueStageMode}
            onChange={(e) => void save({ leagueStageMode: e.target.value as LeagueStageMode })}
            className="border-border bg-background h-10 w-full rounded-lg border px-3 text-[0.9375rem]"
          >
            {STAGE_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {t.admin[`leagueStage${mode}` as const]}
              </option>
            ))}
          </select>
          <p className="text-muted-foreground text-[0.8125rem]">{t.admin.leagueStageModeHint}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {numberField(
            t.admin.leagueStage2MinLabel,
            s.leagueStage2MinUsers,
            'leagueStage2MinUsers',
            'league-stage2-min',
          )}
          {numberField(
            t.admin.leagueStage3MinLabel,
            s.leagueStage3MinUsers,
            'leagueStage3MinUsers',
            'league-stage3-min',
          )}
          {numberField(
            t.admin.leagueCohortSizeLabel,
            s.leagueCohortSize,
            'leagueCohortSize',
            'league-cohort-size',
          )}
          {numberField(t.admin.epDailyCapLabel, s.epDailyCap, 'epDailyCap', 'ep-daily-cap')}
          {numberField(
            t.admin.epWeeklyGoalBonusLabel,
            s.epWeeklyGoalBonus,
            'epWeeklyGoalBonus',
            'ep-goal-bonus',
          )}
        </div>
      </div>

      <div className="bg-card space-y-3 rounded-[1.25rem] p-4" data-testid="league-preview">
        <div className="flex items-center justify-between">
          <p className="text-[0.9375rem] font-medium">{t.admin.leaguePreviewTitle}</p>
          <Button
            size="sm"
            variant="secondary"
            onClick={preview.reload}
            data-testid="league-preview-reload"
          >
            {t.admin.retry}
          </Button>
        </div>
        {preview.loading && <AdminState />}
        {preview.error && <AdminState error={preview.error} onRetry={preview.reload} />}
        {preview.data && (
          <dl className="divide-border/60 divide-y text-[0.9375rem]">
            <div className="flex justify-between py-2">
              <dt className="text-muted-foreground">{t.admin.previewNextWeek}</dt>
              <dd className="font-medium">{preview.data.nextWeekKey}</dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-muted-foreground">{t.admin.previewStage}</dt>
              <dd className="font-medium">{preview.data.stage}</dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-muted-foreground">{t.admin.previewActiveUsers}</dt>
              <dd className="font-medium">{preview.data.activeUsers}</dd>
            </div>
            {preview.data.buckets && (
              <div className="flex justify-between py-2">
                <dt className="text-muted-foreground">{t.admin.previewBuckets}</dt>
                <dd className="font-medium">
                  {Object.entries(preview.data.buckets)
                    .map(([arena, bucket]) => `${arena}:${bucket}`)
                    .join(' · ')}
                </dd>
              </div>
            )}
            {preview.data.openWeekOutcomes && (
              <div className="flex justify-between py-2">
                <dt className="text-muted-foreground">{t.admin.previewOutcomes}</dt>
                <dd className="font-medium">
                  {preview.data.openWeekOutcomes.cohorts
                    .map((c) => `${c.size} (↑${c.promoteCount} ↓${c.demoteCount})`)
                    .join(' · ')}
                </dd>
              </div>
            )}
          </dl>
        )}
      </div>
    </div>
  );
}
