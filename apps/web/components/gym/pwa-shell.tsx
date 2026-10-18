'use client';

import React, { useEffect, useState } from 'react';
import {
  Home,
  FolderKanban,
  PlayCircle,
  CalendarDays,
  Dumbbell,
  UserCircle,
  Wifi,
  WifiOff,
  RefreshCw,
  AlertTriangle,
  Timer,
} from 'lucide-react';
import { Badge } from '@luki-fitti/ui/components/ui/badge';
import { Button } from '@luki-fitti/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@luki-fitti/ui/components/ui/dialog';
import { useGym } from '@/providers/gym/gym-context';
import { useAuth } from '@/providers/auth/auth-context';
import { useLocale } from '@/providers/i18n/locale-context';
import { computeRemainingRestSeconds } from '@/lib/offline/offline-store';
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
  const { isAuthenticated } = useAuth();
  const { t, format } = useLocale();
  const {
    activeSession,
    isOnline,
    syncState,
    pendingSyncCount,
    conflictServerSession,
    flushSyncQueue,
    resolveConflict,
  } = useGym();

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const restInfo = computeRemainingRestSeconds(activeSession, nowMs);

  const navItems: Array<{
    id: NavTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'home', label: t.nav.home, icon: Home },
    { id: 'workouts', label: t.nav.workouts, icon: FolderKanban },
    ...(activeSession
      ? [{ id: 'session' as const, label: t.nav.liveGym, icon: PlayCircle }]
      : []),
    { id: 'diary', label: t.nav.diary, icon: CalendarDays },
    { id: 'exercises', label: t.nav.exercises, icon: Dumbbell },
    { id: 'profile', label: t.nav.profile, icon: UserCircle },
  ];

  return (
    <div className="bg-background text-foreground flex min-h-dvh w-full max-w-full flex-col overflow-x-hidden">
      {/* Top Safe-Area Header */}
      <header className="bg-card/85 pt-safe sticky top-0 z-40 border-b backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-2.5 sm:px-4 sm:py-3">
          {/* Brand Logo */}
          <Button
            type="button"
            variant="ghost"
            onClick={() => setActiveTab('home')}
            aria-label="LukiFitti Home"
            className="h-auto shrink-0 gap-2 p-0 text-left hover:bg-transparent sm:gap-2.5"
          >
            <div className="bg-primary text-primary-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-xl font-extrabold shadow-sm sm:h-9 sm:w-9">
              <Dumbbell className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className={restInfo.isRunning || restInfo.isPaused ? 'hidden sm:block' : 'block'}>
              <span className="font-display text-foreground text-sm font-extrabold tracking-tight sm:text-base">
                LUKI<span className="text-primary">FITTI</span>
              </span>
              <span className="text-muted-foreground hidden text-[10px] leading-none font-normal sm:block">
                {t.nav.tagline}
              </span>
            </div>
          </Button>

          {/* Desktop Horizontal Navigation */}
          <nav aria-label={t.nav.primaryNavAria} className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isCurrent = activeTab === item.id;
              return (
                <Button
                  key={item.id}
                  type="button"
                  variant={isCurrent ? 'default' : 'ghost'}
                  size="default"
                  onClick={() => setActiveTab(item.id)}
                  className={
                    isCurrent
                      ? 'shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60 font-bold'
                  }
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                  {item.id === 'session' && activeSession && (
                    <span className="bg-accent h-2 w-2 rounded-full" />
                  )}
                </Button>
              );
            })}
          </nav>

          {/* Right Status Indicators: Rest Timer Pill, Offline/Sync Badge */}
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
            {(restInfo.isRunning || restInfo.isPaused) && (
              <Badge
                asChild
                variant="accent"
                className="font-mono-tabular shrink-0 cursor-pointer rounded-full px-2.5 py-1 text-xs font-extrabold sm:px-3"
              >
                <button type="button" onClick={() => setActiveTab('session')}>
                  <Timer className="h-3.5 w-3.5" />
                  {Math.floor(restInfo.remainingSeconds / 60)}:
                  {String(restInfo.remainingSeconds % 60).padStart(2, '0')}
                </button>
              </Badge>
            )}

            {/* Connection & Sync State Indicator */}
            <Badge
              asChild
              variant={
                !isOnline || syncState === 'OFFLINE'
                  ? 'warning'
                  : !isAuthenticated
                    ? 'accent'
                    : syncState === 'CONFLICT'
                      ? 'destructive'
                      : syncState === 'SAVED_LOCALLY'
                        ? 'accent'
                        : 'success'
              }
              className="shrink-0 cursor-pointer rounded-full px-2 py-1 text-[11px] font-semibold sm:px-2.5"
            >
              <button
                type="button"
                onClick={() => {
                  if (isAuthenticated) {
                    void flushSyncQueue();
                  } else {
                    setActiveTab('profile');
                  }
                }}
                title={isAuthenticated ? t.shell.syncTitleAuth : t.shell.syncTitleGuest}
              >
                {!isOnline || syncState === 'OFFLINE' ? (
                  <>
                    <WifiOff className="h-3.5 w-3.5" />
                    <span>
                      {t.shell.offline}
                      {isAuthenticated && pendingSyncCount > 0 ? (
                        ` (${pendingSyncCount})`
                      ) : (
                        <span className="hidden sm:inline"> {t.shell.offlineReady}</span>
                      )}
                    </span>
                  </>
                ) : !isAuthenticated ? (
                  <>
                    <UserCircle className="h-3.5 w-3.5" />
                    <span>
                      {t.shell.guest}
                      <span className="hidden sm:inline"> {t.shell.guestLocalOnly}</span>
                    </span>
                  </>
                ) : syncState === 'SYNCING' ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>{t.shell.syncing}</span>
                  </>
                ) : syncState === 'SAVED_LOCALLY' ? (
                  <>
                    <Wifi className="h-3.5 w-3.5" />
                    <span>
                      <span className="sm:hidden">{t.shell.localShort}</span>
                      <span className="hidden sm:inline">{t.shell.savedLocally}</span>
                      {pendingSyncCount > 0 ? ` (${pendingSyncCount})` : ''}
                    </span>
                  </>
                ) : syncState === 'AUTH_EXPIRED' ? (
                  <>
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>
                      {t.shell.localSafe}
                      <span className="hidden sm:inline"> {t.shell.signInToSync}</span>
                    </span>
                  </>
                ) : (
                  <>
                    <Wifi className="h-3.5 w-3.5" />
                    <span>{t.shell.synced}</span>
                  </>
                )}
              </button>
            </Badge>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto w-full max-w-6xl min-w-0 flex-1 overflow-x-hidden px-3 pt-4 pb-24 sm:px-4 sm:pt-5 md:pb-10">
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

      {/* Mobile Bottom Tab Bar (iPhone Safari & Home Screen Standalone Optimized) */}
      <nav
        aria-label={t.nav.mobileNavAria}
        className="bg-card/95 pb-safe fixed right-0 bottom-0 left-0 z-40 border-t backdrop-blur-lg md:hidden"
      >
        <div
          className={`grid gap-1 px-2 py-1.5 ${
            activeSession ? 'grid-cols-6' : 'grid-cols-5'
          }`}
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const isCurrent = activeTab === item.id;
            return (
              <Button
                key={item.id}
                type="button"
                variant="ghost"
                onClick={() => setActiveTab(item.id)}
                className={`flex h-auto flex-col items-center justify-center gap-0.5 rounded-xl py-2 text-[10px] font-bold hover:bg-transparent ${
                  isCurrent ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <div className="relative">
                  <Icon className="h-5 w-5" />
                  {item.id === 'session' && activeSession && (
                    <span className="bg-primary absolute -top-0.5 -right-1 h-2 w-2 rounded-full" />
                  )}
                </div>
                <span>{item.label}</span>
              </Button>
            );
          })}
        </div>
      </nav>

      {/* Explicit Sync Conflict Resolution Modal */}
      <Dialog open={Boolean(conflictServerSession)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive font-display flex items-center gap-2 text-lg font-bold">
              <AlertTriangle className="h-5 w-5" />
              {t.shell.conflictTitle}
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              {format(t.shell.conflictDescPrefix, {
                version: conflictServerSession?.version ?? 1,
              })}{' '}
              <strong>{conflictServerSession?.workoutNameSnapshot}</strong>{' '}
              {t.shell.conflictDescSuffix}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2">
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
