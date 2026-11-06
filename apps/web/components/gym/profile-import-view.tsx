'use client';

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  FileText,
  Dumbbell,
  HeartPulse,
  Salad,
  User,
  LogOut,
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
  Sparkles,
  ShieldCheck,
  Lightbulb,
  Cpu,
  Upload,
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
import { toast } from '@luki-fitti/ui/components/ui/sonner';
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
import { type LanguagePreference, WeightUnit } from '@luki-fitti/common/enums';
import { ProfileHealthCard, ProfileNutritionGoalsCard } from './profile-body-card';
import { AiUsageView } from './ai-usage/ai-usage-view';
import { AiKeyCard } from './ai-key-card';
import { AiModelsPage } from './settings/ai-models-page';
import { ImportPage } from './settings/import-page';
import { buildFeatureRequestMailto, buildImportFile } from '@luki-fitti/common/utils';
import { AI_KEY_NAVIGATE_EVENT } from '@/lib/ai/ai-key-required';
import {
  SettingsBar,
  SettingsButtonRow,
  SettingsRow,
  SettingsSection,
  SettingsSelectRow,
  SettingsSheetContext,
  SettingsStepperRow,
  SettingsSubpage,
  SettingsSwitchRow,
} from './settings/settings-row';
import { PageTitle } from './page-title';
import { unitLabel } from '@/lib/format/weight';
import { WeightView } from './weight/weight-view';
import { hasPendingWeightFocusRequest } from './weight/weight-focus';

function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const SETTINGS_PAGES = [
  'root',
  'account',
  'training',
  'nutrition',
  'health',
  'notifications',
  'language',
  'aiKey',
  'aiModels',
  'aiUsage',
  'export',
  'import',
  'usage',
  'sources',
] as const;

type SettingsPage = (typeof SETTINGS_PAGES)[number];

const AUTH_ONLY_PAGES: ReadonlySet<SettingsPage> = new Set([
  'account',
  'aiKey',
  'aiModels',
  'aiUsage',
  'import',
]);

const REST_OPTIONS = [60, 75, 90, 120, 150, 180] as const;

interface ProfileImportViewProps {
  /** `sheet`: the phone Profile drawer with an inline title bar and a Done button. */
  variant?: 'page' | 'sheet';
  onClose?: () => void;
}

const HISTORY_KEY = 'profilePage';

/** Step-by-step migration guides in the public repo. App names stay untranslated. */
const IMPORT_GUIDES = [
  {
    name: 'GymLife',
    url: 'https://github.com/tuke307/luki-fitti/blob/main/docs/gymlife-import.md',
    testId: 'import-guide-gymlife',
  },
  {
    name: 'Alpha Progression',
    url: 'https://github.com/tuke307/luki-fitti/blob/main/docs/alpha-progression-import.md',
    testId: 'import-guide-alpha-progression',
  },
] as const;

function isSettingsPage(value: unknown): value is SettingsPage {
  return typeof value === 'string' && (SETTINGS_PAGES as readonly string[]).includes(value);
}

function readHistoryPage(): SettingsPage | null {
  const value = (window.history.state as Record<string, unknown> | null)?.[HISTORY_KEY];
  return isSettingsPage(value) ? value : null;
}

export function ProfileImportView({ variant = 'page', onClose }: ProfileImportViewProps = {}) {
  const {
    user,
    authMode,
    login,
    register,
    resendConfirmation,
    requestAccountDeletion,
    logout,
    logoutAll,
    updatePreferences,
    error: authError,
    infoMessage: authInfoMessage,
    loading: authLoading,
  } = useAuth();
  const { folders, unfiledTemplates, historySessions, catalog } = useGym();
  const { theme, setTheme } = useTheme();
  const { t, format, languagePreference, setLanguagePreference, locale } = useLocale();

  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [logoutAllDialogOpen, setLogoutAllDialogOpen] = useState(false);
  const navigatorOs =
    typeof navigator !== 'undefined'
      ? ((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
          ?.platform ?? undefined)
      : undefined;
  const [page, setPage] = useState<SettingsPage>(() =>
    hasPendingWeightFocusRequest() ? 'health' : 'root',
  );
  const initialPage = useRef(page);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const lastOpened = useRef<SettingsPage | null>(null);
  const focusAfterChange = useRef(false);
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
    // Same `luki-fitti-import@1` format the import accepts, so a backup restores into any account.
    const payload = buildImportFile({
      folders,
      unfiledTemplates,
      historySessions,
      catalog,
      customExercises: catalog.filter((e) => !e.isSystem),
      sourceApp: 'LukiFitti Web',
    });

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

  const isAuthenticated = authMode === 'AUTHENTICATED';
  const visiblePage: SettingsPage = AUTH_ONLY_PAGES.has(page) && !isAuthenticated ? 'root' : page;
  const weightUnit = user?.preferences?.weightUnit ?? WeightUnit.KG;
  const weeklyGoal = user?.preferences?.weeklyGoalSessions ?? 4;
  const weeklyGoalText = format(
    weeklyGoal === 1 ? t.profile.weeklyGoalValueOne : t.profile.weeklyGoalValue,
    { count: weeklyGoal },
  );
  const kcalGoal = user?.preferences?.dailyKcalGoal ?? null;
  const languageName =
    languagePreference === 'en'
      ? t.profile.langEn
      : languagePreference === 'de'
        ? t.profile.langDe
        : t.profile.langSystem;

  const pageTitles: Record<Exclude<SettingsPage, 'root'>, string> = {
    account: t.profile.rowProfileAccount,
    training: t.profile.rowTraining,
    nutrition: t.profile.rowNutritionGoals,
    health: t.profile.rowHealthDetails,
    notifications: t.profile.rowNotifications,
    language: t.profile.rowLanguageUnits,
    aiKey: t.profile.rowAiKey,
    aiModels: t.profile.rowAiModels,
    aiUsage: t.profile.rowAiUsage,
    export: t.profile.rowExportBackup,
    import: t.profile.rowImportFile,
    usage: t.profile.rowUsageStats,
    sources: t.profile.rowDataSources,
  };

  useEffect(() => {
    const initial = initialPage.current;
    if (initial !== 'root' && readHistoryPage() !== initial) {
      window.history.pushState({ [HISTORY_KEY]: initial }, '');
    }
    const onPopState = (event: PopStateEvent) => {
      const next = (event.state as Record<string, unknown> | null)?.[HISTORY_KEY];
      focusAfterChange.current = true;
      setPage(isSettingsPage(next) ? next : 'root');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (!focusAfterChange.current) return;
    focusAfterChange.current = false;
    if (visiblePage !== 'root') {
      window.scrollTo({ top: 0 });
      headingRef.current?.closest('[data-settings-scroll]')?.scrollTo({ top: 0 });
      headingRef.current?.focus();
    } else if (lastOpened.current) {
      document
        .querySelector<HTMLButtonElement>(`[data-testid="settings-row-${lastOpened.current}"]`)
        ?.focus();
    }
  }, [visiblePage]);

  const openPage = (next: Exclude<SettingsPage, 'root'>) => {
    lastOpened.current = next;
    focusAfterChange.current = true;
    window.history.pushState({ [HISTORY_KEY]: next }, '');
    setPage(next);
  };

  // Deep link: the AI-key-required warning asks to land on the AI key page.
  useEffect(() => {
    const onOpenAiKey = () => openPage('aiKey');
    window.addEventListener(AI_KEY_NAVIGATE_EVENT, onOpenAiKey);
    return () => window.removeEventListener(AI_KEY_NAVIGATE_EVENT, onOpenAiKey);
  }, []);

  const goBack = () => {
    if (readHistoryPage() !== null) {
      window.history.back();
      return;
    }
    focusAfterChange.current = true;
    setPage('root');
  };

  const accountCard = (
    <Card className="space-y-4 rounded-[1.25rem] p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <User className="text-primary h-5 w-5" />
          <h2 className="font-display text-lg font-bold">{t.profile.accountSectionTitle}</h2>
        </div>
        <Badge variant="success" className="rounded-full px-3 py-1 text-xs">
          {t.profile.authenticatedBadge}
        </Badge>
      </div>

      {user && (
        <div className="bg-secondary/40 rounded-2xl p-3.5 text-xs">
          {user.name && <p className="text-sm font-bold">{user.name}</p>}
          <p className="text-muted-foreground">{user.email}</p>
          <p className="text-muted-foreground mt-1 text-xs">{t.profile.authenticatedDesc}</p>
        </div>
      )}

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
            variant="secondary"
            onClick={() => setLogoutAllDialogOpen(true)}
            className="hover:bg-destructive/20 hover:text-destructive w-fit"
          >
            <LogOut className="h-4 w-4" /> {t.profile.signOutAllBtn}
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
    </Card>
  );

  const fieldClass =
    'h-11 rounded-none border-0 bg-transparent px-4 text-[1.0625rem] shadow-none focus-visible:ring-0 dark:bg-transparent';
  const fieldItemClass =
    'focus-within:ring-ring relative focus-within:ring-2 focus-within:ring-inset not-first:before:bg-border not-first:before:absolute not-first:before:top-0 not-first:before:right-0 not-first:before:left-4 not-first:before:h-px';

  /** Guest sign-in / register, laid out like the iOS Account section. */
  const guestAccountBlock = (
    <section
      aria-labelledby="guest-account-heading"
      className="space-y-1.5"
      data-testid="guest-account-block"
    >
      <h2 id="guest-account-heading" className="text-muted-foreground px-4 text-[0.8125rem]">
        {t.profile.accountSectionTitle}
      </h2>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (authTab === 'login') {
            await login(email, password);
          } else {
            await register({ email, password, name: name || undefined });
          }
        }}
        className="space-y-3"
      >
        <Tabs value={authTab} onValueChange={(val) => setAuthTab(val as 'login' | 'register')}>
          <TabsList className="w-full">
            <TabsTrigger value="login">{t.profile.signInTab}</TabsTrigger>
            <TabsTrigger value="register">{t.profile.registerAccountTab}</TabsTrigger>
          </TabsList>
        </Tabs>

        <ul className="bg-card overflow-hidden rounded-[1.25rem]">
          {authTab === 'register' && (
            <li className={fieldItemClass}>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t.profile.yourNamePlaceholder}
                aria-label={t.profile.yourNamePlaceholder}
                autoComplete="name"
                className={fieldClass}
              />
            </li>
          )}
          <li className={fieldItemClass}>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t.profile.emailAddressPlaceholder}
              aria-label={t.profile.emailAddressPlaceholder}
              autoComplete="email"
              className={fieldClass}
            />
          </li>
          <li className={fieldItemClass}>
            <Input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t.profile.passwordPlaceholder}
              aria-label={t.profile.passwordPlaceholder}
              autoComplete={authTab === 'login' ? 'current-password' : 'new-password'}
              className={fieldClass}
            />
          </li>
        </ul>

        {authInfoMessage && (
          <div className="border-primary/40 bg-primary/12 text-primary space-y-2 rounded-2xl border p-3 text-[0.8125rem]">
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
          <div className="space-y-2 px-4">
            <p className="text-destructive text-[0.8125rem]">{authError}</p>
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

        <Button type="submit" disabled={authLoading} className="h-12 w-full text-[1.0625rem]">
          {authTab === 'login' ? t.profile.signInSyncBtn : t.profile.createAccountBtn}
        </Button>

        {authTab === 'login' && (
          <div className="flex justify-center">
            <Link
              href="/forgot-password"
              className="text-primary flex min-h-11 items-center px-2 text-[0.9375rem] hover:underline"
            >
              {t.profile.forgotPasswordLink}
            </Link>
          </div>
        )}
      </form>
      <p className="text-muted-foreground px-4 text-[0.8125rem]">{t.profile.guestDesc}</p>
    </section>
  );

  const subpageContent = (): React.ReactNode => {
    switch (visiblePage) {
      case 'account':
        return accountCard;
      case 'training':
        return (
          <SettingsSection footer={t.profile.exerciseSuggestionsSub}>
            <SettingsSelectRow
              title={t.profile.defaultRestLabel}
              value={String(user?.preferences?.defaultRestSeconds ?? 90)}
              options={REST_OPTIONS.map((sec) => ({
                value: String(sec),
                label: `${sec} ${t.common.sec}`,
              }))}
              onValueChange={(val) => void updatePreferences({ defaultRestSeconds: Number(val) })}
              data-testid="profile-default-rest-select"
            />
            <SettingsStepperRow
              title={t.profile.weeklyGoalLabel}
              value={weeklyGoal}
              valueText={weeklyGoalText}
              min={1}
              max={14}
              onChange={(next) => void updatePreferences({ weeklyGoalSessions: next })}
              decrementLabel={t.profile.stepperDecrement}
              incrementLabel={t.profile.stepperIncrement}
              data-testid="profile-weekly-goal-stepper"
            />
            <SettingsSwitchRow
              title={t.profile.exerciseSuggestionsLabel}
              checked={user?.preferences?.exerciseSuggestionsEnabled ?? true}
              onCheckedChange={(checked) =>
                void updatePreferences({ exerciseSuggestionsEnabled: checked })
              }
              data-testid="exercise-suggestions-switch"
            />
          </SettingsSection>
        );
      case 'nutrition':
        return <ProfileNutritionGoalsCard />;
      case 'health':
        return (
          <div className="space-y-4">
            <ProfileHealthCard />
            {isAuthenticated && <WeightView />}
          </div>
        );
      case 'notifications':
        return (
          <SettingsSection>
            <SettingsSwitchRow
              title={t.profile.notificationsLabel}
              subtitle={t.profile.notificationsSub}
              checked={user?.preferences?.notificationsEnabled ?? true}
              onCheckedChange={async (enabled) => {
                if (enabled) {
                  await requestWorkoutNotificationPermission();
                }
                await updatePreferences({ notificationsEnabled: enabled });
              }}
              data-testid="notifications-switch"
            />
            <SettingsSwitchRow
              title={t.profile.restSoundLabel}
              subtitle={t.profile.restSoundSub}
              checked={user?.preferences?.restTimerSound ?? true}
              onCheckedChange={(checked) => void updatePreferences({ restTimerSound: checked })}
              data-testid="rest-sound-switch"
            />
            <SettingsButtonRow
              title={t.profile.sendTestNotificationBtn}
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
            />
          </SettingsSection>
        );
      case 'language':
        return (
          <SettingsSection>
            <SettingsSelectRow<LanguagePreference>
              title={t.profile.languageLabel}
              value={languagePreference}
              options={[
                { value: 'system', label: t.profile.langSystem },
                { value: 'en', label: t.profile.langEn },
                { value: 'de', label: t.profile.langDe },
              ]}
              onValueChange={(val) => void setLanguagePreference(val)}
              data-testid="profile-language-select"
            />
            <SettingsSelectRow<'system' | 'light' | 'dark'>
              title={t.profile.themeLabel}
              value={theme === 'light' || theme === 'dark' ? theme : 'system'}
              options={[
                { value: 'system', label: t.profile.themeSystem },
                { value: 'light', label: t.profile.themeLight },
                { value: 'dark', label: t.profile.themeDark },
              ]}
              onValueChange={(val) => {
                setTheme(val);
                void updatePreferences({ theme: val });
              }}
              data-testid="profile-theme-select"
            />
            <SettingsSelectRow<WeightUnit>
              title={t.profile.weightUnitLabel}
              value={weightUnit}
              options={[
                { value: WeightUnit.KG, label: unitLabel(WeightUnit.KG) },
                { value: WeightUnit.LBS, label: unitLabel(WeightUnit.LBS) },
              ]}
              onValueChange={(val) => void updatePreferences({ weightUnit: val })}
              data-testid="profile-weight-unit-select"
            />
          </SettingsSection>
        );
      case 'aiKey':
        return <AiKeyCard />;
      case 'aiModels':
        return <AiModelsPage />;
      case 'aiUsage':
        return (
          <Card className="space-y-3 rounded-[1.25rem] p-5">
            <p className="text-muted-foreground text-xs">{t.aiUsage.sub}</p>
            <AiUsageView />
          </Card>
        );
      case 'import':
        return <ImportPage />;
      case 'export':
        return (
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
                <strong className="tabular-nums text-base">
                  {totalLoggedSets.toLocaleString()}
                </strong>
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
        );
      case 'usage':
        return (
          <SettingsSection footer={t.profile.usageStatsSub}>
            {/* Anonymous usage statistics opt-out (device-local, stored in localStorage) */}
            <SettingsSwitchRow
              title={t.profile.usageStatsLabel}
              checked={!analyticsOptedOut}
              onCheckedChange={(checked) => setAnalyticsOptOut(!checked)}
              data-testid="usage-stats-switch"
            />
          </SettingsSection>
        );
      case 'sources':
        return (
          <div data-testid="exercise-data-sources" className="space-y-4">
            <SettingsSection footer={t.profile.dataSourcesDesc}>
              <SettingsRow
                href="https://github.com/yuhonas/free-exercise-db"
                external
                title="free-exercise-db"
                subtitle="Unlicense (public domain)"
              />
              <SettingsRow
                href="https://wger.de"
                external
                title="wger Workout Manager"
                subtitle="CC-BY-SA 4.0"
              />
            </SettingsSection>
            <SettingsSection>
              <SettingsRow
                href="https://creativecommons.org/licenses/by-sa/4.0/"
                external
                title={t.profile.licenseRow}
              />
            </SettingsSection>
          </div>
        );
      default:
        return null;
    }
  };

  const featureRequestMailto = buildFeatureRequestMailto({
    locale,
    appVersion: `1.0.0${process.env.NEXT_PUBLIC_GIT_SHA ? ` (${process.env.NEXT_PUBLIC_GIT_SHA})` : ''}`,
    platform: 'Web',
    os: navigatorOs,
  });

  return (
    <SettingsSheetContext.Provider value={variant === 'sheet'}>
      <div className={variant === 'page' ? 'mx-auto max-w-2xl' : undefined}>
        {visiblePage === 'root' ? (
          <div className="space-y-6 pb-12">
            {variant === 'sheet' ? (
              <SettingsBar
                title={t.nav.profile}
                headingRef={headingRef}
                trailing={
                  <button
                    type="button"
                    onClick={onClose}
                    data-testid="profile-sheet-done"
                    className="text-primary min-h-11 px-2 text-[1.0625rem] font-semibold"
                  >
                    {t.common.done}
                  </button>
                }
              />
            ) : (
              <PageTitle title={t.nav.profile} />
            )}

            {isAuthenticated ? (
              <SettingsSection title={t.profile.accountSectionTitle}>
                <SettingsRow
                  onClick={() => openPage('account')}
                  data-testid="settings-row-account"
                  icon={User}
                  tone="primary"
                  title={t.profile.rowProfileAccount}
                  subtitle={user?.email}
                />
              </SettingsSection>
            ) : (
              guestAccountBlock
            )}

            <SettingsSection title={t.profile.personalizationTitle}>
              <SettingsRow
                onClick={() => openPage('training')}
                data-testid="settings-row-training"
                icon={Dumbbell}
                tone="primary"
                title={t.profile.rowTraining}
                value={weeklyGoalText}
              />
              <SettingsRow
                onClick={() => openPage('nutrition')}
                data-testid="settings-row-nutrition"
                icon={Salad}
                tone="success"
                title={t.profile.rowNutritionGoals}
                value={
                  kcalGoal == null
                    ? t.profile.notSet
                    : format(t.profile.kcalValue, { count: kcalGoal })
                }
              />
              <SettingsRow
                onClick={() => openPage('health')}
                data-testid="settings-row-health"
                icon={HeartPulse}
                tone="destructive"
                title={t.profile.rowHealthDetails}
              />
              <SettingsRow
                onClick={() => openPage('notifications')}
                data-testid="settings-row-notifications"
                icon={Bell}
                tone="warning"
                title={t.profile.rowNotifications}
              />
              <SettingsRow
                onClick={() => openPage('language')}
                data-testid="settings-row-language"
                icon={Globe}
                tone="warmup"
                title={t.profile.rowLanguageUnits}
                value={`${languageName} · ${unitLabel(weightUnit)}`}
              />
            </SettingsSection>

            {isAuthenticated && (
              <SettingsSection title={t.profile.aiSectionTitle}>
                <SettingsRow
                  onClick={() => openPage('aiKey')}
                  data-testid="settings-row-ai-key"
                  icon={KeyRound}
                  tone="dropset"
                  title={t.profile.rowAiKey}
                />
                <SettingsRow
                  onClick={() => openPage('aiModels')}
                  data-testid="settings-row-ai-models"
                  icon={Cpu}
                  tone="dropset"
                  title={t.profile.rowAiModels}
                />
                <SettingsRow
                  onClick={() => openPage('aiUsage')}
                  data-testid="settings-row-ai-usage"
                  icon={Sparkles}
                  tone="dropset"
                  title={t.profile.rowAiUsage}
                />
              </SettingsSection>
            )}

            <SettingsSection title={t.profile.dataSectionTitle} footer={t.profile.dataGuidesFooter}>
              <SettingsRow
                onClick={() => openPage('export')}
                data-testid="settings-row-export"
                icon={Download}
                tone="stretch"
                title={t.profile.rowExportBackup}
              />
              {isAuthenticated && (
                <SettingsRow
                  onClick={() => openPage('import')}
                  data-testid="settings-row-import"
                  icon={Upload}
                  tone="stretch"
                  title={t.profile.rowImportFile}
                />
              )}
              {IMPORT_GUIDES.map((guide) => (
                <SettingsRow
                  key={guide.testId}
                  onClick={() => window.open(guide.url, '_blank', 'noopener,noreferrer')}
                  data-testid={guide.testId}
                  icon={BookOpen}
                  tone="muted"
                  title={guide.name}
                />
              ))}
            </SettingsSection>

            <SettingsSection title={t.profile.aboutSectionTitle}>
              <SettingsRow
                onClick={() => openPage('usage')}
                data-testid="settings-row-usage"
                icon={ShieldCheck}
                tone="muted"
                title={t.profile.rowUsageStats}
                value={analyticsOptedOut ? t.profile.disabledOption : t.profile.enabledOption}
              />
              <SettingsRow
                onClick={() => openPage('sources')}
                data-testid="settings-row-sources"
                icon={BookOpen}
                tone="muted"
                title={t.profile.rowDataSources}
              />
            </SettingsSection>

            <SettingsSection title={t.profile.feedbackSectionTitle}>
              <SettingsRow
                href={featureRequestMailto}
                data-testid="settings-row-feature-request"
                icon={Lightbulb}
                tone="warmup"
                title={t.profile.rowFeatureRequest}
              />
            </SettingsSection>

            <SettingsSection title={t.profile.legalSectionTitle}>
              <SettingsRow
                href={`${locale === 'de' ? '/impressum' : '/en/imprint'}`}
                data-testid="settings-row-imprint"
                icon={FileText}
                tone="muted"
                title={t.profile.rowImprint}
              />
              <SettingsRow
                href={`${locale === 'de' ? '/datenschutz' : '/en/privacy'}`}
                data-testid="settings-row-privacy"
                icon={ShieldCheck}
                tone="muted"
                title={t.profile.rowPrivacy}
              />
              <SettingsRow
                href={`${locale === 'de' ? '/nutzungsbedingungen' : '/en/terms'}`}
                data-testid="settings-row-terms"
                icon={BookOpen}
                tone="muted"
                title={t.profile.rowTerms}
              />
            </SettingsSection>

            <p className="text-muted-foreground pt-2 text-center text-xs">
              {t.profile.version} {process.env.NEXT_PUBLIC_APP_VERSION}
              {process.env.NEXT_PUBLIC_GIT_SHA ? ` (${process.env.NEXT_PUBLIC_GIT_SHA})` : ''}
            </p>
          </div>
        ) : (
          <SettingsSubpage
            title={pageTitles[visiblePage]}
            backLabel={t.profile.backToSettings}
            onBack={goBack}
            headingRef={headingRef}
          >
            {subpageContent()}
          </SettingsSubpage>
        )}
      </div>

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

      <Dialog open={logoutAllDialogOpen} onOpenChange={setLogoutAllDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              {t.profile.signOutAllDialogTitle}
            </DialogTitle>
            <DialogDescription>{t.profile.signOutAllDialogDesc}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setLogoutAllDialogOpen(false)}
              disabled={authLoading}
            >
              {t.common.cancel}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={authLoading}
              onClick={async () => {
                const ok = await logoutAll();
                if (ok) {
                  setLogoutAllDialogOpen(false);
                } else {
                  toast.error(t.profile.signOutAllError);
                }
              }}
            >
              <LogOut className="h-4 w-4" /> {t.profile.signOutAllBtn}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsSheetContext.Provider>
  );
}
