'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  CalendarCheck,
  ChevronUp,
  CloudAlert,
  CloudOff,
  CloudUpload,
  Dumbbell,
  History as HistoryIcon,
  LibraryBig,
  RefreshCw,
  Timer,
  UserRound,
} from 'lucide-react';
import { Button } from '@luki-fitti/ui/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@luki-fitti/ui/components/ui/alert-dialog';
import { useGym } from '@/providers/gym/gym-context';
import { useAuth } from '@/providers/auth/auth-context';
import { useLocale } from '@/providers/i18n/locale-context';
import { computeRemainingRestSeconds } from '@/lib/offline/offline-store';
import { triggerWorkoutNotification } from '@/lib/notifications/notification-manager';
import { SessionExerciseStatus, SessionStatus } from '@luki-fitti/common/enums';
import { HomeView } from './home-view';
import { WorkoutsView } from './workouts-view';
import { ActiveSessionView } from './active-session-view';
import { DiaryAnalyticsView } from './diary-analytics-view';
import { ExercisesView } from './exercises-view';
import { ProfileImportView } from './profile-import-view';

export type NavTab = 'home' | 'workouts' | 'session' | 'diary' | 'exercises' | 'profile';

export function PwaShell() {
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const { isAuthenticated, user } = useAuth();
  const { t, format, bcp47 } = useLocale();
  const {
    activeSession,
    historySessions,
    isOnline,
    syncState,
    pendingSyncCount,
    conflictServerSession,
    flushSyncQueue,
    resolveConflict,
    skipRestTimer,
  } = useGym();

  const notifiedEndsAtRef = useRef<string | null>(null);
  const conflictLocalSession = conflictServerSession
    ? activeSession?.clientSessionId === conflictServerSession.clientSessionId
      ? activeSession
      : (historySessions.find((s) => s.clientSessionId === conflictServerSession.clientSessionId) ??
        null)
    : null;

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const endsAt = activeSession?.restTimerEndsAt;
    if (!endsAt) {
      notifiedEndsAtRef.current = null;
      return;
    }

    const endMs = Date.parse(endsAt);
    if (!Number.isNaN(endMs) && nowMs >= endMs && notifiedEndsAtRef.current !== endsAt) {
      notifiedEndsAtRef.current = endsAt;
      const notificationsOn = user?.preferences?.notificationsEnabled ?? true;
      const soundOn = user?.preferences?.restTimerSound ?? true;
      const nextEx =
        activeSession?.exercises.find(
          (e) =>
            e.status !== SessionExerciseStatus.COMPLETED &&
            e.status !== SessionExerciseStatus.SKIPPED,
        ) ?? activeSession?.exercises[0];

      if (notificationsOn || soundOn) {
        void triggerWorkoutNotification({
          title: t.session.restCompleteTitle,
          body: format(t.session.restCompleteBody, {
            exercise:
              nextEx?.exerciseNameSnapshot ?? activeSession?.workoutNameSnapshot ?? 'Workout',
          }),
          tag: 'luki-fitti-rest-done',
          playSound: soundOn,
          showToast: notificationsOn,
        });
      }
      void skipRestTimer();
    }
  }, [
    activeSession,
    format,
    nowMs,
    skipRestTimer,
    t.session.restCompleteBody,
    t.session.restCompleteTitle,
    user?.preferences?.notificationsEnabled,
    user?.preferences?.restTimerSound,
  ]);

  const restInfo = computeRemainingRestSeconds(activeSession, nowMs);
  const isRestVisible = restInfo.isRunning || restInfo.isPaused;
  const isOffline = !isOnline || syncState === 'OFFLINE';

  const sessionElapsedSeconds = activeSession
    ? activeSession.status === SessionStatus.PAUSED
      ? activeSession.activeDurationSeconds
      : Math.max(0, Math.floor((nowMs - Date.parse(activeSession.startedAt)) / 1000))
    : 0;

  const navItems: Array<{
    id: NavTab;
    label: string;
    icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  }> = [
    { id: 'home', label: t.nav.home, icon: CalendarCheck },
    { id: 'workouts', label: t.nav.workouts, icon: Dumbbell },
    { id: 'diary', label: t.nav.diary, icon: HistoryIcon },
    { id: 'exercises', label: t.nav.exercises, icon: LibraryBig },
  ];

  // Plain-language status, always available to assistive tech. Visually, the indicator only
  // appears when the user can act on it (offline, unsynced changes, sign-in needed, syncing).
  const syncStatusText = isOffline
    ? `${t.shell.offline}. ${t.shell.offlineReady}`
    : !isAuthenticated
      ? `${t.shell.guest}. ${t.shell.guestLocalOnly}`
      : syncState === 'SYNCING'
        ? t.shell.syncing
        : syncState === 'SAVED_LOCALLY'
          ? pendingSyncCount > 0
            ? `${t.shell.savedLocally}. ${format(t.shell.pendingChanges, { count: pendingSyncCount })}`
            : t.shell.savedLocally
          : syncState === 'AUTH_EXPIRED'
            ? `${t.shell.localSafe}. ${t.shell.signInToSync}`
            : t.shell.synced;

  const showSyncIndicator =
    isOffline ||
    (isAuthenticated &&
      (syncState === 'SYNCING' ||
        syncState === 'AUTH_EXPIRED' ||
        (syncState === 'SAVED_LOCALLY' && pendingSyncCount > 0)));

  const initials = (user?.name ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  const showSessionAccessory = Boolean(activeSession) && activeTab !== 'session';

  return (
    <div className="bg-background text-foreground flex min-h-dvh w-full max-w-full flex-col overflow-x-hidden">
      <header className="material-bar pt-safe sticky top-0 z-40 border-b border-border/60">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setActiveTab('home')}
            aria-label="LukiFitti Home"
            className="h-auto shrink-0 rounded-md px-0 text-[17px] font-semibold tracking-tight hover:bg-transparent"
          >
            LukiFitti
          </Button>

          <nav aria-label={t.nav.primaryNavAria} className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => {
              const isCurrent = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`desktop-nav-${item.id}`}
                  aria-current={isCurrent ? 'page' : undefined}
                  onClick={() => setActiveTab(item.id)}
                  className={`h-9 rounded-full px-4 text-[15px] transition-colors duration-150 ${
                    isCurrent
                      ? 'bg-secondary text-foreground font-semibold'
                      : 'text-muted-foreground hover:text-foreground font-medium'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="flex min-w-0 items-center gap-2">
            <span role="status" data-testid="header-sync-status" className="sr-only">
              {syncStatusText}
            </span>

            {isRestVisible && (
              <button
                type="button"
                data-testid="header-rest-timer-pill"
                onClick={() => setActiveTab('session')}
                aria-label={`${t.session.restTimerActive} ${formatClock(restInfo.remainingSeconds)}`}
                className="bg-primary/12 text-primary font-rounded flex h-8 items-center gap-1.5 rounded-full px-3 text-[15px] font-semibold"
              >
                <Timer className="h-4 w-4" />
                {formatClock(restInfo.remainingSeconds)}
              </button>
            )}

            {showSyncIndicator && (
              <button
                type="button"
                data-testid="header-sync-badge"
                onClick={() => (isAuthenticated ? void flushSyncQueue() : setActiveTab('profile'))}
                title={syncStatusText}
                aria-label={syncStatusText}
                className={`flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium ${
                  syncState === 'AUTH_EXPIRED'
                    ? 'bg-warning/15 text-warning'
                    : 'text-muted-foreground'
                }`}
              >
                {isOffline ? (
                  <>
                    <CloudOff className="h-4 w-4" />
                    <span className="hidden sm:inline">{t.shell.offline}</span>
                  </>
                ) : syncState === 'SYNCING' ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : syncState === 'AUTH_EXPIRED' ? (
                  <>
                    <CloudAlert className="h-4 w-4" />
                    <span>{t.shell.signInToSync}</span>
                  </>
                ) : (
                  <>
                    <CloudUpload className="h-4 w-4" />
                    <span className="hidden sm:inline">{t.shell.localShort}</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              data-testid="nav-profile"
              aria-label={t.nav.profileAria}
              aria-current={activeTab === 'profile' ? 'page' : undefined}
              onClick={() => setActiveTab('profile')}
              className={`flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold transition-shadow ${
                isAuthenticated && initials
                  ? 'bg-primary/12 text-primary'
                  : 'bg-secondary text-muted-foreground'
              } ${activeTab === 'profile' ? 'ring-primary ring-2 ring-offset-2 ring-offset-background' : ''}`}
            >
              {isAuthenticated && initials ? initials : <UserRound className="h-[18px] w-[18px]" />}
            </button>
          </div>
        </div>
      </header>

      <main
        className={`mx-auto w-full max-w-5xl min-w-0 flex-1 overflow-x-hidden px-4 pt-5 sm:pt-8 ${
          showSessionAccessory ? 'pb-44 md:pb-28' : 'pb-28 md:pb-12'
        }`}
      >
        {activeTab === 'home' && <HomeView onNavigate={setActiveTab} />}
        {activeTab === 'workouts' && (
          <WorkoutsView onStartSessionNavigation={() => setActiveTab('session')} />
        )}
        {activeTab === 'session' && (
          <ActiveSessionView
            onNavigateToDiary={() => setActiveTab('diary')}
            onNavigateToWorkouts={() => setActiveTab('workouts')}
          />
        )}
        {activeTab === 'diary' && <DiaryAnalyticsView />}
        {activeTab === 'exercises' && (
          <ExercisesView onStartSessionNavigation={() => setActiveTab('session')} />
        )}
        {activeTab === 'profile' && <ProfileImportView />}
      </main>

      {/* Floating bottom stack: live workout accessory above the tab bar (iOS 26 pattern). */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-center gap-2 px-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] md:pb-6">
        {showSessionAccessory && activeSession && (
          <button
            type="button"
            data-testid="nav-session"
            aria-label={`${t.nav.resumeWorkoutAria}: ${activeSession.workoutNameSnapshot}`}
            onClick={() => setActiveTab('session')}
            className="material-bar animate-in fade-in slide-in-from-bottom-2 pointer-events-auto flex h-14 w-full max-w-md items-center gap-3 rounded-full border border-border/60 pr-2 pl-4 text-left shadow-[0_8px_30px_rgb(0_0_0/0.12)] duration-300"
          >
            <span className="relative flex size-2.5 shrink-0">
              {activeSession.status !== SessionStatus.PAUSED && (
                <span className="bg-primary absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 motion-reduce:hidden" />
              )}
              <span className="bg-primary relative inline-flex size-2.5 rounded-full" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold">
                {activeSession.workoutNameSnapshot}
              </span>
              <span className="text-muted-foreground font-rounded block text-[13px]">
                {formatClock(sessionElapsedSeconds)}
                {isRestVisible &&
                  ` · ${t.session.restTimerActive} ${formatClock(restInfo.remainingSeconds)}`}
              </span>
            </span>
            <span className="bg-primary text-primary-foreground flex size-10 shrink-0 items-center justify-center rounded-full">
              <ChevronUp className="h-5 w-5" />
            </span>
          </button>
        )}

        <nav
          aria-label={t.nav.mobileNavAria}
          className="material-bar pointer-events-auto w-full max-w-md rounded-full border border-border/60 p-1 shadow-[0_8px_30px_rgb(0_0_0/0.12)] md:hidden"
        >
          <div className="grid grid-cols-4">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isCurrent =
                activeTab === item.id || (item.id === 'workouts' && activeTab === 'session');
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`mobile-nav-${item.id}`}
                  aria-current={activeTab === item.id ? 'page' : undefined}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex h-14 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-medium transition-colors duration-150 ${
                    isCurrent ? 'bg-secondary text-primary' : 'text-muted-foreground'
                  }`}
                >
                  <Icon className="h-[22px] w-[22px]" strokeWidth={isCurrent ? 2.2 : 1.8} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      {/* Forced choice: no close button, no outside dismiss — one version has to win. */}
      <AlertDialog open={Boolean(conflictServerSession)}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader className="text-left">
            <AlertDialogTitle>{t.shell.conflictTitle}</AlertDialogTitle>
            <AlertDialogDescription className="text-[15px]">
              {t.shell.conflictDescPrefix}{' '}
              <strong className="text-foreground">
                {conflictServerSession?.workoutNameSnapshot}
              </strong>{' '}
              {t.shell.conflictDescSuffix}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {conflictServerSession && (
            <dl className="grid grid-cols-2 gap-2 text-[13px]">
              {[
                { label: t.shell.conflictThisDevice, session: conflictLocalSession },
                { label: t.shell.conflictServer, session: conflictServerSession },
              ].map(({ label, session }) => (
                <div key={label} className="bg-secondary rounded-xl px-3 py-2">
                  <dt className="font-semibold">{label}</dt>
                  <dd className="text-muted-foreground tabular-nums">
                    {session
                      ? format(t.shell.conflictVersionSummary, {
                          sets: session.totalSetsCompleted,
                          time: formatConflictTime(session.lastSyncedAt, bcp47),
                        })
                      : '–'}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <AlertDialogFooter className="pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => void resolveConflict('USE_SERVER')}
            >
              {t.shell.useServerVersion}
            </Button>
            <Button
              type="button"
              variant="default"
              onClick={() => void resolveConflict('KEEP_LOCAL')}
            >
              {t.shell.keepLocalData}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function formatConflictTime(iso: string | null | undefined, bcp47: string): string {
  const ms = iso ? Date.parse(iso) : Number.NaN;
  if (Number.isNaN(ms)) return '–';
  return new Date(ms).toLocaleTimeString(bcp47, { hour: '2-digit', minute: '2-digit' });
}

function formatClock(totalSeconds: number): string {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return hrs > 0
    ? `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${mins}:${String(secs).padStart(2, '0')}`;
}
