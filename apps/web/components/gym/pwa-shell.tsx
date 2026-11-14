'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  CloudAlert,
  CloudOff,
  CloudUpload,
  History as HistoryIcon,
  RefreshCw,
  Sun,
  Timer,
  UserRound,
  Users,
  Utensils,
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
import { Drawer, DrawerContent, DrawerDescription } from '@luki-fitti/ui/components/ui/drawer';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useGym } from '@/providers/gym/gym-context';
import { useAuth } from '@/providers/auth/auth-context';
import { useLocale } from '@/providers/i18n/locale-context';
import { computeRemainingRestSeconds } from '@/lib/offline/offline-store';
import { triggerWorkoutNotification } from '@/lib/notifications/notification-manager';
import { SessionStatus } from '@luki-fitti/common/enums';
import { resolveFocusedExerciseIndex } from '@luki-fitti/common/utils/client';
import { HomeView } from './home-view';
import { WorkoutsView, type WorkoutsSegment } from './workouts-view';
import { ActiveSessionView } from './active-session-view';
import { DiaryAnalyticsView } from './diary-analytics-view';
import { SocialView, type SocialSection } from './social/social-view';
import { ProfileImportView } from './profile-import-view';
import { NutritionView } from './nutrition/nutrition-view';
import { GlassIconButton } from './settings/settings-row';
import { AI_KEY_NAVIGATE_EVENT } from '@/lib/ai/ai-key-required';
import { migrateToAppOrigin, shouldMigrateToAppOrigin } from '@/lib/site/app-origin-migration';
import { APP_ORIGIN, SITE_HOSTNAMES } from '@/lib/site/config';
import { parseOpenParam } from '@/lib/social/deep-link';

export type NavTab =
  'home' | 'workouts' | 'session' | 'nutrition' | 'diary' | 'social' | 'exercises' | 'profile';

// 'exercises' stays a valid NavTab for old deep links; it maps to workouts+library.
type TabId = Exclude<NavTab, 'session' | 'profile' | 'exercises'>;

const MD_UP_QUERY = '(min-width: 48rem)';
const SESSION_TRANSITION_MS = 300;

/** SF Symbols' horizontal `dumbbell`, drawn in the lucide grid. */
function DumbbellHorizontal({
  className,
  strokeWidth = 2,
}: {
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="5" y="6" width="3" height="12" rx="1" />
      <rect x="16" y="6" width="3" height="12" rx="1" />
      <path d="M2.5 9.5v5M2.5 12H5M21.5 9.5v5M19 12h2.5M8 12h8" />
    </svg>
  );
}

export function PwaShell() {
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [workoutsSegment, setWorkoutsSegment] = useState<WorkoutsSegment>('workouts');
  const [socialSection, setSocialSection] = useState<SocialSection>(null);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [sessionClosing, setSessionClosing] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [tabBarCompact, setTabBarCompact] = useState(false);
  const [inlineTitle, setInlineTitle] = useState<string | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const topBarRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const savedScrollRef = useRef<number | null>(null);
  const [sessionCovering, setSessionCovering] = useState(false);
  const isDesktop = useMediaQuery(MD_UP_QUERY);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const { isAuthenticated, user, loading: authLoading } = useAuth();
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

  const [migrating, setMigrating] = useState(false);

  const restartSessionTimer = (fn: () => void) => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(fn, SESSION_TRANSITION_MS);
  };

  const openSession = () => {
    if (!sessionOpen) savedScrollRef.current = window.scrollY;
    setSessionClosing(false);
    setProfileOpen(false);
    setSessionOpen(true);
    // Once the cover has slid up, the tab behind it unmounts like any other hidden tab.
    restartSessionTimer(() => setSessionCovering(true));
  };

  /** Minimizes the live workout (slide down), optionally landing on another tab. */
  const closeSession = (tab?: TabId) => {
    if (tab) {
      setActiveTab(tab);
      savedScrollRef.current = 0;
    }
    setSessionCovering(false);
    setSessionOpen(false);
    setSessionClosing(true);
    restartSessionTimer(() => setSessionClosing(false));
  };

  useEffect(() => {
    if (sessionCovering || savedScrollRef.current === null) return;
    const y = savedScrollRef.current;
    savedScrollRef.current = null;
    requestAnimationFrame(() => window.scrollTo({ top: y }));
  }, [sessionCovering]);

  const navigate = (tab: NavTab) => {
    if (tab === 'session') return openSession();
    if (tab === 'profile') return setProfileOpen(true);
    setProfileOpen(false);
    if (tab === 'exercises') {
      // Deep link to the exercise library (now a segment of the Workouts tab).
      setWorkoutsSegment('library');
      setActiveTab('workouts');
    } else {
      setActiveTab(tab);
    }
    setTabBarCompact(false);
  };

  // `?open=` deep link: the service worker rewrites notification taps to it.
  useEffect(() => {
    if (authLoading) return; // wait for /auth/me so social gating is known
    const target = parseOpenParam(window.location.search);
    if (!target) return;
    if (target.tab === 'social' && user?.social?.enabled) {
      queueMicrotask(() => {
        setActiveTab('social');
        setSocialSection(target.section);
      });
    }
    // Strip the param so refreshes and shares land on the plain shell.
    const url = new URL(window.location.href);
    url.searchParams.delete('open');
    window.history.replaceState(null, '', url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    },
    [],
  );

  // iOS tab bar: shrink to an icon-only pill while scrolling down, grow back on the way up.
  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - lastY) < 6) return;
      setTabBarCompact(y > lastY && y > 64);
      lastY = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Inline title: watch the first large title in <main> and show its text once it scrolls
  // under the top bar. Views render their title whenever they like, so re-resolve on changes.
  useEffect(() => {
    const main = mainRef.current;
    if (!main || isDesktop) {
      setInlineTitle(null);
      return;
    }
    let observed: Element | null = null;
    let hidden = false;
    let io: IntersectionObserver | null = null;
    const update = () =>
      setInlineTitle(hidden && observed ? observed.textContent?.trim() || null : null);
    const attach = () => {
      const heading = main.querySelector('[data-page-title]') ?? main.querySelector('h1');
      if (heading !== observed) {
        io?.disconnect();
        observed = heading;
        hidden = false;
        if (heading) {
          const barHeight = topBarRef.current?.offsetHeight ?? 56;
          io = new IntersectionObserver(
            ([entry]) => {
              hidden = Boolean(
                entry && !entry.isIntersecting && entry.boundingClientRect.top < barHeight,
              );
              update();
            },
            { rootMargin: `-${barHeight}px 0px 0px 0px` },
          );
          io.observe(heading);
        }
      }
      update();
    };
    const mo = new MutationObserver(attach);
    mo.observe(main, { childList: true, subtree: true, characterData: true });
    attach();
    return () => {
      mo.disconnect();
      io?.disconnect();
    };
  }, [isDesktop]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  // Old-origin cutover: an installed PWA still served on the site host moves to the app
  // origin once the outbox is flushed. Retries on `online` when offline.
  useEffect(() => {
    if (!shouldMigrateToAppOrigin(window.location.hostname, SITE_HOSTNAMES)) return;
    let cancelled = false;
    const go = async () => {
      if (!navigator.onLine) return;
      if (!cancelled) setMigrating(true);
      await migrateToAppOrigin({
        appOrigin: APP_ORIGIN,
        flush: () => flushSyncQueue(true),
        navigate: (url) => window.location.replace(url),
        path: window.location.pathname + window.location.search,
      });
    };
    void go();
    window.addEventListener('online', go);
    return () => {
      cancelled = true;
      window.removeEventListener('online', go);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Add key" on the AI-key-required warning: the profile tab owns the settings page.
  useEffect(() => {
    const onOpenAiKey = () => setProfileOpen(true);
    window.addEventListener(AI_KEY_NAVIGATE_EVENT, onOpenAiKey);
    return () => window.removeEventListener(AI_KEY_NAVIGATE_EVENT, onOpenAiKey);
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
      const nextEx = activeSession?.exercises[resolveFocusedExerciseIndex(activeSession.exercises)];

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
    id: TabId;
    label: string;
    icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  }> = [
    { id: 'home', label: t.nav.home, icon: Sun },
    { id: 'workouts', label: t.nav.workouts, icon: DumbbellHorizontal },
    { id: 'nutrition', label: t.nutrition.navLabel, icon: Utensils },
    { id: 'diary', label: t.nav.diary, icon: HistoryIcon },
    // The social tab only exists for users the rollout covers; guests keep 4 tabs.
    ...(user?.social?.enabled ? [{ id: 'social' as TabId, label: t.nav.social, icon: Users }] : []),
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

  const sessionOverlayVisible = sessionOpen || sessionClosing;
  const showSessionAccessory = Boolean(activeSession) && !sessionOverlayVisible;
  const showProfilePage = profileOpen && isDesktop;

  const restPill = isRestVisible && (
    <button
      type="button"
      data-testid="header-rest-timer-pill"
      onClick={openSession}
      aria-label={`${t.session.restTimerActive} ${formatClock(restInfo.remainingSeconds)}`}
      className="pointer-events-auto flex h-11 items-center"
    >
      <span
        className={`text-primary font-rounded flex h-8 items-center gap-1.5 rounded-full px-3 text-[0.9375rem] font-semibold ${
          isDesktop ? 'bg-primary/12' : 'material-bar border-border/60 border shadow-sm'
        }`}
      >
        <Timer className="h-4 w-4" />
        {formatClock(restInfo.remainingSeconds)}
      </span>
    </button>
  );

  const syncBadge = showSyncIndicator && (
    <button
      type="button"
      data-testid="header-sync-badge"
      onClick={() => (isAuthenticated ? void flushSyncQueue() : setProfileOpen(true))}
      title={syncStatusText}
      aria-label={syncStatusText}
      className={`pointer-events-auto flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-2.5 text-[0.8125rem] font-medium ${
        syncState === 'AUTH_EXPIRED' ? 'text-warning' : 'text-muted-foreground'
      } ${isDesktop ? '' : 'material-bar border-border/60 border shadow-sm'}`}
    >
      {isOffline ? (
        <>
          <CloudOff className="h-4 w-4" />
          <span className="hidden md:inline">{t.shell.offline}</span>
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
          <span className="hidden md:inline">{t.shell.localShort}</span>
        </>
      )}
    </button>
  );

  const profileButton = (
    <button
      type="button"
      data-testid="nav-profile"
      aria-label={t.nav.profileAria}
      aria-current={showProfilePage ? 'page' : undefined}
      aria-haspopup={isDesktop ? undefined : 'dialog'}
      onClick={() => setProfileOpen(true)}
      className={`pointer-events-auto flex size-11 shrink-0 items-center justify-center rounded-full ${
        isDesktop
          ? ''
          : 'material-bar border-border/60 border shadow-[0_2px_12px_rgb(0_0_0/0.1)] transition-transform active:scale-95'
      }`}
    >
      <span
        className={`flex size-9 items-center justify-center rounded-full text-[0.8125rem] font-semibold transition-shadow ${
          isAuthenticated && initials
            ? 'bg-primary/12 text-primary'
            : isDesktop
              ? 'bg-secondary text-muted-foreground'
              : 'text-foreground'
        } ${showProfilePage ? 'ring-primary ring-offset-background ring-2 ring-offset-2' : ''}`}
      >
        {isAuthenticated && initials ? (
          initials
        ) : (
          <UserRound className="h-[20px] w-[20px]" strokeWidth={2.25} />
        )}
      </span>
    </button>
  );

  return (
    <div className="bg-background text-foreground flex min-h-dvh w-full max-w-full flex-col overflow-x-hidden">
      <span role="status" data-testid="header-sync-status" className="sr-only">
        {syncStatusText}
      </span>

      {/* While the live workout covers the screen, everything behind it is inert. */}
      <div
        inert={sessionOverlayVisible}
        aria-hidden={sessionOverlayVisible || undefined}
        className={sessionCovering ? 'hidden' : 'flex min-h-dvh flex-col'}
      >
        <header className="material-bar pt-safe sticky top-0 z-40 hidden border-b border-border/60 md:block">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => navigate('home')}
              aria-label={t.a11y.homeButton}
              className="h-auto shrink-0 rounded-md px-0 text-[1.0625rem] font-semibold tracking-tight hover:bg-transparent"
            >
              LukiFitti
            </Button>

            <nav aria-label={t.nav.primaryNavAria} className="flex items-center gap-1">
              {navItems.map((item) => {
                const isCurrent = activeTab === item.id && !showProfilePage;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-testid={`desktop-nav-${item.id}`}
                    aria-current={isCurrent ? 'page' : undefined}
                    onClick={() => navigate(item.id)}
                    className={`h-9 rounded-full px-4 text-[0.9375rem] transition-colors duration-150 ${
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
              {isDesktop && (
                <>
                  {restPill}
                  {syncBadge}
                  {profileButton}
                </>
              )}
            </div>
          </div>
        </header>

        {/* Phones: no app bar. A compact title fades in once the page's large title scrolls away. */}
        <div
          ref={topBarRef}
          aria-hidden="true"
          className="pt-safe pointer-events-none fixed inset-x-0 top-0 z-30 md:hidden"
        >
          <div
            className={`material-bar border-border/60 absolute inset-0 border-b transition-opacity duration-200 ${
              inlineTitle ? 'opacity-100' : 'opacity-0'
            }`}
          />
          <p
            data-testid="shell-inline-title"
            className={`relative flex h-14 items-center justify-center truncate px-[4.25rem] text-[1.0625rem] font-semibold transition-opacity duration-200 ${
              inlineTitle ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {inlineTitle}
          </p>
        </div>
        {!isDesktop && (
          <div className="pointer-events-none fixed top-[calc(env(safe-area-inset-top,0px)+0.375rem)] right-4 z-40 flex flex-col items-end gap-1 md:hidden">
            {profileButton}
            {restPill}
            {syncBadge}
          </div>
        )}

        <main
          ref={mainRef}
          className={`mx-auto w-full max-w-5xl min-w-0 flex-1 overflow-x-hidden px-4 pt-[calc(env(safe-area-inset-top,0px)+0.375rem)] md:pt-8 ${
            showSessionAccessory ? 'pb-44 md:pb-28' : 'pb-28 md:pb-12'
          }`}
        >
          {sessionCovering ? null : showProfilePage ? (
            <ProfileImportView />
          ) : (
            <>
              {activeTab === 'home' && <HomeView onNavigate={navigate} />}
              {activeTab === 'workouts' && (
                <WorkoutsView
                  onStartSessionNavigation={openSession}
                  segment={workoutsSegment}
                  onSegmentChange={setWorkoutsSegment}
                />
              )}
              {activeTab === 'nutrition' && <NutritionView onNavigate={navigate} />}
              {activeTab === 'diary' && <DiaryAnalyticsView />}
              {activeTab === 'social' && user?.social?.enabled && (
                <SocialView section={socialSection} />
              )}
            </>
          )}
          {migrating && (
            <div className="bg-card/90 text-muted-foreground absolute top-3 left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-xs font-medium shadow-lg">
              {t.shell.movingToNewApp}
            </div>
          )}
        </main>

        {/* Floating bottom stack: live workout accessory above the tab bar (iOS 26 pattern). */}
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-center gap-2 px-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] md:pb-6">
          {showSessionAccessory && activeSession && (
            <button
              type="button"
              data-testid="nav-session"
              aria-label={`${t.nav.resumeWorkoutAria}: ${activeSession.workoutNameSnapshot}`}
              onClick={openSession}
              className="material-bar animate-in fade-in slide-in-from-bottom-2 pointer-events-auto flex h-14 w-full max-w-md items-center gap-3 rounded-full border border-border/60 pr-3 pl-4 text-left shadow-[0_8px_30px_rgb(0_0_0/0.12)] duration-300"
            >
              <span className="relative flex size-2.5 shrink-0">
                {activeSession.status !== SessionStatus.PAUSED && (
                  <span className="bg-primary absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 motion-reduce:hidden" />
                )}
                <span className="bg-primary relative inline-flex size-2.5 rounded-full" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.9375rem] font-semibold">
                  {activeSession.workoutNameSnapshot}
                </span>
                <span className="text-muted-foreground font-rounded block text-[0.8125rem]">
                  {formatClock(sessionElapsedSeconds)}
                  {isRestVisible &&
                    ` · ${t.session.restTimerActive} ${formatClock(restInfo.remainingSeconds)}`}
                </span>
              </span>
              <ChevronUp
                aria-hidden="true"
                className="text-muted-foreground h-5 w-5 shrink-0"
                strokeWidth={2.5}
              />
            </button>
          )}

          <nav
            aria-label={t.nav.mobileNavAria}
            data-compact={tabBarCompact || undefined}
            className={`material-bar pointer-events-auto w-full rounded-full border border-border/60 p-1 shadow-[0_8px_30px_rgb(0_0_0/0.12)] transition-[max-width] duration-300 ease-out md:hidden ${
              tabBarCompact ? 'max-w-[17.5rem]' : 'max-w-md'
            }`}
          >
            <div className={`grid ${navItems.length >= 5 ? 'grid-cols-5' : 'grid-cols-4'}`}>
              {navItems.map((item) => {
                const Icon = item.icon;
                const isCurrent = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-testid={`mobile-nav-${item.id}`}
                    aria-current={isCurrent ? 'page' : undefined}
                    onClick={() => navigate(item.id)}
                    className={`flex flex-col items-center justify-center gap-0.5 rounded-full text-[0.6875rem] font-medium transition-[height,color] duration-300 ${
                      tabBarCompact ? 'h-11' : 'h-14'
                    } ${isCurrent ? 'bg-secondary text-primary' : 'text-muted-foreground'}`}
                  >
                    <Icon className="h-[22px] w-[22px]" strokeWidth={isCurrent ? 2.5 : 2.25} />
                    <span className={tabBarCompact ? 'sr-only' : undefined}>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>
        </div>
      </div>

      {/* Live workout: a full-screen cover that slides up; Minimize returns to the tab. */}
      {sessionOverlayVisible && (
        <section
          aria-label={activeSession?.workoutNameSnapshot ?? t.nav.liveGym}
          data-testid="session-overlay"
          className={`bg-background fixed inset-0 z-50 duration-300 ease-out motion-reduce:animate-none ${
            sessionClosing
              ? 'animate-out slide-out-to-bottom fill-mode-forwards'
              : 'animate-in slide-in-from-bottom'
          }`}
        >
          <div className="h-full overflow-y-auto overscroll-contain">
            <div className="pt-safe pointer-events-none sticky top-0 z-40">
              <div className="mx-auto flex h-14 max-w-5xl items-center px-4">
                <GlassIconButton
                  autoFocus
                  onClick={() => closeSession()}
                  aria-label={t.shell.minimizeWorkout}
                  title={t.shell.minimizeWorkout}
                  data-testid="session-minimize-btn"
                  className="pointer-events-auto"
                >
                  <ChevronDown className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
                </GlassIconButton>
              </div>
            </div>
            <div className="mx-auto w-full max-w-5xl px-4">
              <ActiveSessionView
                onNavigateToDiary={() => closeSession('diary')}
                onNavigateToWorkouts={() => sessionOpen && closeSession('workouts')}
              />
            </div>
          </div>
        </section>
      )}

      {/* Phones: Profile is a near-full-height sheet; sub-pages push inside it. */}
      <Drawer open={profileOpen && !isDesktop} onOpenChange={setProfileOpen}>
        <DrawerContent
          data-testid="profile-sheet"
          className="rounded-t-[1.25rem] data-[vaul-drawer-direction=bottom]:top-[calc(env(safe-area-inset-top,0px)+0.75rem)] data-[vaul-drawer-direction=bottom]:mt-0 data-[vaul-drawer-direction=bottom]:max-h-none"
        >
          <DrawerDescription className="sr-only">{t.nav.profileAria}</DrawerDescription>
          <div
            data-settings-scroll
            className="flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]"
          >
            <ProfileImportView variant="sheet" onClose={() => setProfileOpen(false)} />
          </div>
        </DrawerContent>
      </Drawer>

      {/* Forced choice: no close button, no outside dismiss — one version has to win. */}
      <AlertDialog open={Boolean(conflictServerSession)}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader className="text-left">
            <AlertDialogTitle>{t.shell.conflictTitle}</AlertDialogTitle>
            <AlertDialogDescription className="text-[0.9375rem]">
              {t.shell.conflictDescPrefix}{' '}
              <strong className="text-foreground">
                {conflictServerSession?.workoutNameSnapshot}
              </strong>{' '}
              {t.shell.conflictDescSuffix}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {conflictServerSession && (
            <dl className="grid grid-cols-2 gap-2 text-[0.8125rem]">
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
