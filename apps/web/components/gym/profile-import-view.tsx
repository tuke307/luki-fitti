'use client';

import React, { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import {
  User,
  LogOut,
  LogIn,
  UserPlus,
  Download,
  FileJson,
  FileSpreadsheet,
  CheckCircle2,
  MailCheck,
  KeyRound,
  Trash2,
  AlertTriangle,
  Globe,
  Bell,
  Volume2,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { Badge } from '@luki-fitti/ui/components/ui/badge';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { Card } from '@luki-fitti/ui/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@luki-fitti/ui/components/ui/dialog';
import { Input } from '@luki-fitti/ui/components/ui/input';
import { Label } from '@luki-fitti/ui/components/ui/label';
import { NativeSelect } from '@luki-fitti/ui/components/ui/native-select';
import { Tabs, TabsList, TabsTrigger } from '@luki-fitti/ui/components/ui/tabs';
import { useAuth } from '@/providers/auth/auth-context';
import { trackEvent } from '@/lib/analytics/track';
import { useGym } from '@/providers/gym/gym-context';
import { useLocale } from '@/providers/i18n/locale-context';
import {
  requestWorkoutNotificationPermission,
  triggerWorkoutNotification,
} from '@/lib/notifications/notification-manager';
import {
  isAnalyticsOptedOut,
  setAnalyticsOptOut,
  subscribeAnalyticsOptOut,
} from '@/lib/analytics/opt-out';
import { type LanguagePreference } from '@luki-fitti/common/enums';
import { ProfileHealthCard, ProfileNutritionGoalsCard } from './profile-body-card';
import { WeightView } from './weight/weight-view';

function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function ProfileImportView() {
  const {
    user,
    authMode,
    login,
    register,
    resendConfirmation,
    requestAccountDeletion,
    logout,
    updatePreferences,
    error: authError,
    infoMessage: authInfoMessage,
    loading: authLoading,
  } = useAuth();
  const { folders, unfiledTemplates, stretchingRoutines, historySessions, catalog } = useGym();
  const { theme, setTheme } = useTheme();
  const { t, format, languagePreference, setLanguagePreference } = useLocale();

  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const analyticsOptedOut = useSyncExternalStore(
    subscribeAnalyticsOptOut,
    isAnalyticsOptedOut,
    () => false,
  );

  const allTemplatesCount =
    folders.reduce((acc, f) => acc + f.templates.length, 0) + unfiledTemplates.length;
  const totalLoggedSets = historySessions.reduce((acc, s) => acc + s.totalSetsCompleted, 0);

  const triggerDownload = (content: string, fileName: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportJson = () => {
    const dateStamp = new Date().toISOString().slice(0, 10);
    const folderByTplId = new Map<string, string>();
    for (const f of folders) {
      for (const tItem of f.templates) {
        folderByTplId.set(tItem.id, f.name);
      }
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      app: 'LukiFitti',
      version: '1.0',
      user: {
        email: user?.email ?? null,
        name: user?.name ?? null,
        preferences: user?.preferences ?? null,
      },
      folders,
      unfiledTemplates,
      stretchingRoutines,
      customExercises: catalog.filter((e) => !e.isSystem),
      sessions: historySessions,
      workouts: historySessions.map((s) => ({
        date: s.startedAt,
        workoutName: s.workoutNameSnapshot,
        folder: (s.templateId && folderByTplId.get(s.templateId)) || null,
        durationSeconds: s.activeDurationSeconds,
        totalVolumeKg: s.totalVolumeKg,
        exercises: s.exercises.map((ex) => ({
          name: ex.exerciseNameSnapshot,
          primaryMuscle: ex.primaryMuscleSnapshot,
          sets: ex.sets
            .filter((st) => st.completed)
            .map((st) => ({
              setNumber: st.setNumber,
              setType: st.setType,
              weight: st.weight,
              unit: st.weightUnit,
              reps: st.reps,
              durationSeconds: st.durationSeconds,
              rpe: st.rpe,
              notes: st.notes,
            })),
        })),
      })),
    };

    const fileName = `luki-fitti-backup-${dateStamp}.json`;
    triggerDownload(JSON.stringify(payload, null, 2), fileName, 'application/json;charset=utf-8');
    trackEvent('data_export', { format: 'json' });
    setExportStatus(format(t.profile.exportedStatus, { fileName }));
  };

  const handleExportCsv = () => {
    const dateStamp = new Date().toISOString().slice(0, 10);
    const folderByTplId = new Map<string, string>();
    for (const f of folders) {
      for (const tItem of f.templates) {
        folderByTplId.set(tItem.id, f.name);
      }
    }

    const headers = [
      'Date',
      'Workout',
      'Folder',
      'SessionType',
      'DurationSeconds',
      'Exercise',
      'PrimaryMuscle',
      'SetNumber',
      'SetType',
      'Weight',
      'Unit',
      'Reps',
      'DurationSec',
      'RPE',
      'Notes',
    ];
    const rows: string[] = [headers.join(',')];

    for (const s of historySessions) {
      const folderName = (s.templateId && folderByTplId.get(s.templateId)) || '';
      for (const ex of s.exercises) {
        for (const st of ex.sets) {
          if (!st.completed) continue;
          rows.push(
            [
              escapeCsvCell(s.startedAt),
              escapeCsvCell(s.workoutNameSnapshot),
              escapeCsvCell(folderName),
              escapeCsvCell(s.sessionType),
              escapeCsvCell(s.activeDurationSeconds),
              escapeCsvCell(ex.exerciseNameSnapshot),
              escapeCsvCell(ex.primaryMuscleSnapshot),
              escapeCsvCell(st.setNumber),
              escapeCsvCell(st.setType),
              escapeCsvCell(st.weight),
              escapeCsvCell(st.weightUnit),
              escapeCsvCell(st.reps),
              escapeCsvCell(st.durationSeconds),
              escapeCsvCell(st.rpe),
              escapeCsvCell(st.notes ?? s.notes),
            ].join(','),
          );
        }
      }
    }

    const fileName = `luki-fitti-workouts-${dateStamp}.csv`;
    triggerDownload(rows.join('\n'), fileName, 'text/csv;charset=utf-8');
    trackEvent('data_export', { format: 'csv' });
    setExportStatus(format(t.profile.exportedStatus, { fileName }));
  };

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          {t.profile.title}
        </h1>
        <p className="text-muted-foreground text-sm">{t.profile.subtitle}</p>
      </div>

      {/* Account & Preferences Grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Account & Session Security Card */}
        <Card className="space-y-4 rounded-[1.25rem] p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <User className="text-primary h-5 w-5" />
              <h2 className="font-display text-lg font-bold">{t.profile.accountSectionTitle}</h2>
            </div>
            <Badge
              variant={authMode === 'AUTHENTICATED' ? 'success' : 'warning'}
              className="rounded-full px-3 py-1 text-xs"
            >
              {authMode === 'AUTHENTICATED'
                ? t.profile.authenticatedBadge
                : t.profile.offlineLocalBadge}
            </Badge>
          </div>

          {user && (
            <div className="bg-secondary/40 rounded-2xl p-3.5 text-xs">
              <p className="text-sm font-bold">{user.name || 'GymBuddy'}</p>
              <p className="text-muted-foreground">{user.email}</p>
              <p className="text-muted-foreground mt-1 text-xs">
                {authMode === 'AUTHENTICATED' ? t.profile.authenticatedDesc : t.profile.guestDesc}
              </p>
            </div>
          )}

          {authMode === 'AUTHENTICATED' ? (
            <div className="space-y-3">
              {authInfoMessage && (
                <div className="border-primary/40 bg-primary/12 text-primary flex items-start gap-2 rounded-2xl border p-3 text-xs">
                  <MailCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{authInfoMessage}</span>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="secondary" asChild>
                  <Link href="/change-password">
                    <KeyRound className="h-4 w-4" /> {t.profile.changePasswordBtn}
                  </Link>
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void logout()}
                  className="hover:bg-destructive/20 hover:text-destructive w-fit"
                >
                  <LogOut className="h-4 w-4" /> {t.profile.signOutBtn}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    setDeletePassword('');
                    setDeleteError(null);
                    setDeleteDialogOpen(true);
                  }}
                  className="w-fit"
                >
                  <Trash2 className="h-4 w-4" /> {t.profile.deleteAccountBtn}
                </Button>
              </div>
            </div>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (authTab === 'login') {
                  await login(email, password);
                } else {
                  await register({ email, password, name: name || undefined });
                }
              }}
              className="space-y-3 border-t pt-3"
            >
              <Tabs
                value={authTab}
                onValueChange={(val) => setAuthTab(val as 'login' | 'register')}
              >
                <TabsList className="w-full">
                  <TabsTrigger value="login">{t.profile.signInTab}</TabsTrigger>
                  <TabsTrigger value="register">{t.profile.registerTab}</TabsTrigger>
                </TabsList>
              </Tabs>

              {authTab === 'register' && (
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t.profile.yourNamePlaceholder}
                  className="text-xs"
                />
              )}
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t.profile.emailPlaceholder}
                className="text-xs"
              />
              <Input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t.profile.passwordPlaceholder}
                className="text-xs"
              />

              {authTab === 'login' && (
                <div className="flex justify-end">
                  <Link
                    href="/forgot-password"
                    className="text-primary text-xs font-semibold hover:underline"
                  >
                    {t.profile.forgotPasswordLink}
                  </Link>
                </div>
              )}

              {authInfoMessage && (
                <div className="border-primary/40 bg-primary/12 text-primary space-y-2 rounded-2xl border p-3 text-xs">
                  <div className="flex items-start gap-2">
                    <MailCheck className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{authInfoMessage}</span>
                  </div>
                  {email.trim() && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="xs"
                      disabled={authLoading}
                      onClick={() => void resendConfirmation(email.trim())}
                    >
                      {t.profile.resendConfirmationBtn}
                    </Button>
                  )}
                </div>
              )}

              {authError && (
                <div className="space-y-2">
                  <p className="text-destructive text-xs">{authError}</p>
                  {authError.toLowerCase().includes('confirm your email') && email.trim() && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="xs"
                      disabled={authLoading}
                      onClick={() => void resendConfirmation(email.trim())}
                    >
                      <MailCheck className="h-3.5 w-3.5" /> {t.profile.resendConfirmationBtn}
                    </Button>
                  )}
                </div>
              )}

              <Button type="submit" disabled={authLoading} className="w-full">
                {authTab === 'login' ? (
                  <>
                    <LogIn className="h-4 w-4" /> {t.profile.signInSyncBtn}
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4" /> {t.profile.createAccountBtn}
                  </>
                )}
              </Button>
            </form>
          )}
        </Card>

        {/* Units & Training Preferences Card */}
        <Card className="space-y-4 rounded-[1.25rem] p-5">
          <h2 className="font-display text-lg font-bold">{t.profile.preferencesTitle}</h2>

          <div className="space-y-3 text-xs">
            {/* Language Switcher */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="flex items-center gap-1.5 font-semibold">
                  <Globe className="text-primary h-3.5 w-3.5" />
                  {t.profile.languageLabel}
                </p>
                <p className="text-muted-foreground text-xs">{t.profile.languageSub}</p>
              </div>
              <Tabs
                value={languagePreference}
                onValueChange={(val) => {
                  if (val === 'system' || val === 'en' || val === 'de') {
                    void setLanguagePreference(val as LanguagePreference);
                  }
                }}
              >
                <TabsList>
                  <TabsTrigger value="system">{t.profile.langSystem}</TabsTrigger>
                  <TabsTrigger value="en">{t.profile.langEn}</TabsTrigger>
                  <TabsTrigger value="de">{t.profile.langDe}</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold">{t.profile.themeLabel}</p>
                <p className="text-muted-foreground text-xs">{t.profile.themeSub}</p>
              </div>
              <Tabs
                value={theme ?? 'system'}
                onValueChange={(val) => {
                  setTheme(val);
                  if (val === 'dark' || val === 'light' || val === 'system') {
                    void updatePreferences({ theme: val });
                  }
                }}
              >
                <TabsList>
                  <TabsTrigger value="system">{t.profile.themeSystem}</TabsTrigger>
                  <TabsTrigger value="light">{t.profile.themeLight}</TabsTrigger>
                  <TabsTrigger value="dark">{t.profile.themeDark}</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{t.profile.defaultRestLabel}</p>
                <p className="text-muted-foreground text-xs">{t.profile.defaultRestSub}</p>
              </div>
              <NativeSelect
                aria-label={t.a11y.defaultRestSeconds}
                value={user?.preferences?.defaultRestSeconds ?? 90}
                onChange={(e) =>
                  void updatePreferences({ defaultRestSeconds: Number(e.target.value) })
                }
                className="tabular-nums w-auto"
              >
                {[60, 75, 90, 120, 150, 180].map((sec) => (
                  <option key={sec} value={sec}>
                    {sec} {t.common.sec}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{t.profile.weeklyGoalLabel}</p>
                <p className="text-muted-foreground text-xs">{t.profile.weeklyGoalSub}</p>
              </div>
              <NativeSelect
                aria-label={t.a11y.weeklyGoalSessions}
                value={user?.preferences?.weeklyGoalSessions ?? 4}
                onChange={(e) =>
                  void updatePreferences({ weeklyGoalSessions: Number(e.target.value) })
                }
                className="tabular-nums w-auto"
              >
                {[2, 3, 4, 5, 6].map((g) => (
                  <option key={g} value={g}>
                    {format(t.profile.sessionsPerWeek, { count: g })}
                  </option>
                ))}
              </NativeSelect>
            </div>

            {/* Smart Rainbow Exercise Suggestions Toggle (Default: On) */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <div>
                <p className="flex items-center gap-1.5 font-semibold">
                  <Sparkles className="h-3.5 w-3.5 text-warning" />
                  {t.profile.exerciseSuggestionsLabel}
                </p>
                <p className="text-muted-foreground text-xs">{t.profile.exerciseSuggestionsSub}</p>
              </div>
              <Tabs
                data-testid="profile-exercise-suggestions-tabs"
                value={(user?.preferences?.exerciseSuggestionsEnabled ?? true) ? 'on' : 'off'}
                onValueChange={(val) =>
                  void updatePreferences({ exerciseSuggestionsEnabled: val === 'on' })
                }
              >
                <TabsList>
                  <TabsTrigger value="on" data-testid="exercise-suggestions-on">
                    {t.profile.enabledOption}
                  </TabsTrigger>
                  <TabsTrigger value="off" data-testid="exercise-suggestions-off">
                    {t.profile.disabledOption}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Workout & Rest Timer Notifications Toggle + Test Notification */}
            <div className="space-y-2.5 border-t pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="flex items-center gap-1.5 font-semibold">
                    <Bell className="text-primary h-3.5 w-3.5" />
                    {t.profile.notificationsLabel}
                  </p>
                  <p className="text-muted-foreground text-xs">{t.profile.notificationsSub}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    data-testid="profile-test-notification-btn"
                    onClick={async () => {
                      await requestWorkoutNotificationPermission();
                      await triggerWorkoutNotification({
                        title: t.profile.testNotificationTitle,
                        body: t.profile.testNotificationBody,
                        tag: 'luki-fitti-test',
                        playSound: user?.preferences?.restTimerSound ?? true,
                        showToast: true,
                      });
                    }}
                    className="font-bold"
                  >
                    <Bell className="h-3 w-3" />
                    {t.profile.testNotificationBtn}
                  </Button>
                  <Tabs
                    data-testid="profile-notifications-tabs"
                    value={(user?.preferences?.notificationsEnabled ?? true) ? 'on' : 'off'}
                    onValueChange={async (val) => {
                      const enabled = val === 'on';
                      if (enabled) {
                        await requestWorkoutNotificationPermission();
                      }
                      await updatePreferences({ notificationsEnabled: enabled });
                    }}
                  >
                    <TabsList>
                      <TabsTrigger value="on" data-testid="notifications-on">
                        {t.profile.enabledOption}
                      </TabsTrigger>
                      <TabsTrigger value="off" data-testid="notifications-off">
                        {t.profile.disabledOption}
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="flex items-center gap-1.5 font-semibold">
                    <Volume2 className="text-accent h-3.5 w-3.5" />
                    {t.profile.restSoundLabel}
                  </p>
                  <p className="text-muted-foreground text-xs">{t.profile.restSoundSub}</p>
                </div>
                <Tabs
                  value={(user?.preferences?.restTimerSound ?? true) ? 'on' : 'off'}
                  onValueChange={(val) => void updatePreferences({ restTimerSound: val === 'on' })}
                >
                  <TabsList>
                    <TabsTrigger value="on">{t.profile.enabledOption}</TabsTrigger>
                    <TabsTrigger value="off">{t.profile.disabledOption}</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>

            {/* Anonymous usage statistics opt-out (device-local, stored in localStorage) */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <div>
                <p className="flex items-center gap-1.5 font-semibold">
                  <ShieldCheck className="text-primary h-3.5 w-3.5" />
                  {t.profile.usageStatsLabel}
                </p>
                <p className="text-muted-foreground text-xs">{t.profile.usageStatsSub}</p>
              </div>
              <Tabs
                data-testid="profile-usage-stats-tabs"
                value={analyticsOptedOut ? 'off' : 'on'}
                onValueChange={(val) => setAnalyticsOptOut(val === 'off')}
              >
                <TabsList>
                  <TabsTrigger value="on" data-testid="usage-stats-on">
                    {t.profile.enabledOption}
                  </TabsTrigger>
                  <TabsTrigger value="off" data-testid="usage-stats-off">
                    {t.profile.disabledOption}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </Card>
      </div>

      <ProfileHealthCard />

      {authMode === 'AUTHENTICATED' && <WeightView />}

      <ProfileNutritionGoalsCard />

      {/* Further feature cards (e.g. AI usage) slot in here. */}

      {/* Export Gym Data Card (Only when logged in) */}
      {authMode === 'AUTHENTICATED' && (
        <Card className="space-y-4 rounded-[1.25rem] p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <Download className="text-primary h-5 w-5" />
              <div>
                <h2 className="font-display text-lg font-bold">{t.profile.exportTitle}</h2>
                <p className="text-muted-foreground text-xs">{t.profile.exportSub}</p>
              </div>
            </div>
            {exportStatus && (
              <Badge variant="success" className="rounded-full px-3 py-1 text-xs">
                <CheckCircle2 className="h-3.5 w-3.5" /> {exportStatus}
              </Badge>
            )}
          </div>

          <div className="bg-secondary/40 grid grid-cols-2 gap-3 rounded-2xl border p-3.5 text-xs sm:grid-cols-4">
            <div>
              <span className="text-muted-foreground block text-xs">
                {t.profile.splitFoldersStat}
              </span>
              <strong className="tabular-nums text-base">{folders.length}</strong>
            </div>
            <div>
              <span className="text-muted-foreground block text-xs">
                {t.profile.workoutTemplatesStat}
              </span>
              <strong className="tabular-nums text-base">{allTemplatesCount}</strong>
            </div>
            <div>
              <span className="text-muted-foreground block text-xs">
                {t.profile.completedSessionsStat}
              </span>
              <strong className="tabular-nums text-primary text-base">
                {historySessions.length}
              </strong>
            </div>
            <div>
              <span className="text-muted-foreground block text-xs">
                {t.profile.completedSetsStat}
              </span>
              <strong className="tabular-nums text-base">{totalLoggedSets.toLocaleString()}</strong>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button type="button" data-testid="export-json-btn" onClick={handleExportJson}>
              <FileJson className="h-4 w-4" />
              {t.profile.exportJsonBtn}
            </Button>
            <Button
              type="button"
              data-testid="export-csv-btn"
              variant="secondary"
              onClick={handleExportCsv}
            >
              <FileSpreadsheet className="h-4 w-4" />
              {t.profile.exportCsvBtn}
            </Button>
          </div>
        </Card>
      )}

      {/* Attribution for the imported exercise database (CC-BY-SA requires it for wger content) */}
      <Card data-testid="exercise-data-sources" className="space-y-2 rounded-[1.25rem] p-5">
        <h2 className="text-[0.9375rem] font-semibold">{t.profile.dataSourcesTitle}</h2>
        <p className="text-muted-foreground text-[0.8125rem]">{t.profile.dataSourcesDesc}</p>
        <ul className="space-y-1 text-[0.8125rem]">
          <li>
            <a
              href="https://github.com/yuhonas/free-exercise-db"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary font-medium"
            >
              free-exercise-db
            </a>{' '}
            <span className="text-muted-foreground">· Unlicense (public domain)</span>
          </li>
          <li>
            <a
              href="https://wger.de"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary font-medium"
            >
              wger Workout Manager
            </a>{' '}
            <span className="text-muted-foreground">
              ·{' '}
              <a
                href="https://creativecommons.org/licenses/by-sa/4.0/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                CC-BY-SA 4.0
              </a>
            </span>
          </li>
        </ul>
      </Card>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              {t.profile.deleteDialogTitle}
            </DialogTitle>
            <DialogDescription>{t.profile.deleteDialogDesc}</DialogDescription>
          </DialogHeader>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setDeleteError(null);
              if (!deletePassword.trim()) {
                setDeleteError(t.profile.currentPasswordPlaceholder);
                return;
              }
              const ok = await requestAccountDeletion(deletePassword);
              if (ok) {
                setDeletePassword('');
                setDeleteDialogOpen(false);
              }
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="delete-account-password" className="text-xs font-semibold">
                {t.profile.currentPasswordLabel}
              </Label>
              <Input
                id="delete-account-password"
                type="password"
                required
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder={t.profile.currentPasswordPlaceholder}
                className="h-10 text-xs"
              />
            </div>

            {(deleteError || authError) && (
              <p className="text-destructive text-xs">{deleteError || authError}</p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeleteDialogOpen(false)}
                disabled={authLoading}
              >
                {t.common.cancel}
              </Button>
              <Button type="submit" variant="destructive" disabled={authLoading}>
                <MailCheck className="h-4 w-4" />
                {authLoading ? t.profile.sendingBtn : t.profile.sendDeletionLinkBtn}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
