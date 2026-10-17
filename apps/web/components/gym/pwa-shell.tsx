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
  Sun,
  Moon,
  Timer,
} from 'lucide-react';
import { useTheme } from 'next-themes';
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
  const { theme, setTheme } = useTheme();
  const { isAuthenticated } = useAuth();
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
    { id: 'home', label: 'Home', icon: Home },
    { id: 'workouts', label: 'Workouts', icon: FolderKanban },
    { id: 'session', label: activeSession ? 'Live Gym' : 'Start', icon: PlayCircle },
    { id: 'diary', label: 'Diary', icon: CalendarDays },
    { id: 'exercises', label: 'Exercises', icon: Dumbbell },
    { id: 'profile', label: 'Profile', icon: UserCircle },
  ];

  return (
    <div className="bg-background text-foreground flex min-h-dvh flex-col">
      {/* Top Safe-Area Header */}
      <header className="bg-card/85 pt-safe sticky top-0 z-40 border-b backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3">
          {/* Brand Logo */}
          <Button
            type="button"
            variant="ghost"
            onClick={() => setActiveTab('home')}
            className="h-auto gap-2.5 p-0 text-left hover:bg-transparent"
          >
            <div className="bg-primary text-primary-foreground flex h-9 w-9 items-center justify-center rounded-xl font-extrabold shadow-sm">
              <Dumbbell className="h-5 w-5" />
            </div>
            <div>
              <span className="font-display text-foreground text-base font-extrabold tracking-tight">
                LUKI<span className="text-primary">FITTI</span>
              </span>
              <span className="text-muted-foreground block text-[10px] leading-none font-normal">
                Personal Gym & Workout PWA
              </span>
            </div>
          </Button>

          {/* Desktop Horizontal Navigation */}
          <nav aria-label="Primary Navigation" className="hidden items-center gap-1 md:flex">
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

          {/* Right Status Indicators: Rest Timer Pill, Offline/Sync Badge, Theme Toggle */}
          <div className="flex items-center gap-2">
            {(restInfo.isRunning || restInfo.isPaused) && (
              <Badge
                asChild
                variant="accent"
                className="font-mono-tabular cursor-pointer rounded-full px-3 py-1 text-xs font-extrabold"
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
              className="cursor-pointer rounded-full px-2.5 py-1 text-[11px] font-semibold"
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
                title={
                  isAuthenticated
                    ? 'Click to synchronize queued changes with database'
                    : 'Guest mode: data stays on this device only. Sign in to save to database.'
                }
              >
                {!isOnline || syncState === 'OFFLINE' ? (
                  <>
                    <WifiOff className="h-3.5 w-3.5" />
                    <span>
                      Offline
                      {isAuthenticated && pendingSyncCount > 0
                        ? ` (${pendingSyncCount} queued)`
                        : ' Ready'}
                    </span>
                  </>
                ) : !isAuthenticated ? (
                  <>
                    <UserCircle className="h-3.5 w-3.5" />
                    <span>Guest (Local Only)</span>
                  </>
                ) : syncState === 'SYNCING' ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Syncing...</span>
                  </>
                ) : syncState === 'SAVED_LOCALLY' ? (
                  <>
                    <Wifi className="h-3.5 w-3.5" />
                    <span>Saved Locally{pendingSyncCount > 0 ? ` (${pendingSyncCount})` : ''}</span>
                  </>
                ) : syncState === 'AUTH_EXPIRED' ? (
                  <>
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>Local Safe (Sign In to Sync)</span>
                  </>
                ) : (
                  <>
                    <Wifi className="h-3.5 w-3.5" />
                    <span>Synced</span>
                  </>
                )}
              </button>
            </Badge>

            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label="Toggle color theme"
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            >
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-5 pb-24 md:pb-10">
        {activeTab === 'home' && <HomeView onNavigate={setActiveTab} />}
        {activeTab === 'workouts' && (
          <WorkoutsView onStartSessionNavigation={() => setActiveTab('session')} />
        )}
        {activeTab === 'session' && (
          <ActiveSessionView onNavigateToDiary={() => setActiveTab('diary')} />
        )}
        {activeTab === 'diary' && <DiaryAnalyticsView />}
        {activeTab === 'exercises' && (
          <ExercisesView onStartSessionNavigation={() => setActiveTab('session')} />
        )}
        {activeTab === 'profile' && <ProfileImportView />}
      </main>

      {/* Mobile Bottom Tab Bar (iPhone Safari & Home Screen Standalone Optimized) */}
      <nav
        aria-label="Mobile Bottom Navigation"
        className="bg-card/95 pb-safe fixed right-0 bottom-0 left-0 z-40 border-t backdrop-blur-lg md:hidden"
      >
        <div className="grid grid-cols-6 gap-1 px-2 py-1.5">
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
              Workout Sync Conflict Detected
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              The server has a newer version (v{conflictServerSession?.version}) of{' '}
              <strong>{conflictServerSession?.workoutNameSnapshot}</strong> than your queued local
              session. Choose which version to keep so no workout data is silently overwritten:
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => void resolveConflict('USE_SERVER')}
            >
              Use Server Version
            </Button>
            <Button
              type="button"
              variant="default"
              onClick={() => void resolveConflict('KEEP_LOCAL')}
            >
              Keep Local Workout Data
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
