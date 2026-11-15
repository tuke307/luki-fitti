'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Bell, Users } from 'lucide-react';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { useAuth } from '@/providers/auth/auth-context';
import { useLocale } from '@/providers/i18n/locale-context';
import type {
  DuelItemDto,
  DuelListDto,
  FriendListsDto,
  LeagueCurrentDto,
  LeagueFriendRowDto,
  LeaguePendingResultDto,
  RaidListDto,
  RaidResultDto,
  SocialCardDto,
  SocialProfileDto,
  SocialSummaryDto,
  SquadListDto,
  StreakListDto,
} from '@luki-fitti/common/schemas';
import {
  notificationsApi,
  socialApi,
  duelsApi,
  streaksApi,
  raidsApi,
  squadsApi,
  leagueApi,
} from '@/lib/social/social-api';
import { PageTitle } from '../page-title';
import { SocialWeekCard } from './social-week-card';
import { FriendsWeekStrip } from './friends-week-strip';
import {
  DuelsCompactCard,
  LeagueCompactCard,
  RaidsCompactCard,
  StreaksCompactCard,
  TrophyRow,
} from './hub-cards';
import { SocialPageHeader } from './social-page-header';
import { FriendsPage } from './friends-page';
import { LeagueCard } from './league-card';
import { LeagueCelebration, dismissLeagueResult, useLeagueResult } from './league-celebration';
import { DuelCelebration, dismissDuelResult, useDuelResult } from './duel-celebration';
import { DuelsCard } from './duels-card';
import { RaidCard } from '../raid/raid-card';
import { RaidPage } from '../raid/raid-page';
import { SquadsCard } from '../raid/squads-card';
import { RaidCelebration, useRaidResult } from '../raid/raid-celebration';
import { FriendSheet, type FriendActions } from './friend-sheet';
import { InboxSheet } from './inbox-sheet';
import { SocialOnboardingSheet } from './social-onboarding-sheet';
import { TrophyShelf } from './trophy-shelf';
import { ReportSheet } from './report-sheet';

export type SocialPage = 'hub' | 'league' | 'duels' | 'raids' | 'friends' | 'trophies';
export type SocialSection = 'friends' | 'requests' | 'inbox' | 'duels' | 'raids' | 'league' | null;

const ONBOARDING_DISMISSED_KEY = 'luki.social.onboardingDismissed';
const UNREAD_POLL_MS = 60_000;

const PAGE_FOR_SECTION: Record<NonNullable<SocialSection>, SocialPage> = {
  friends: 'friends',
  requests: 'friends',
  inbox: 'hub',
  duels: 'duels',
  raids: 'raids',
  league: 'league',
};

/**
 * The Social tab. The hub carries the weekly summary, the friends strip and
 * compact cards; every card opens a detail page. Browser back returns to the
 * hub via pushState/popstate.
 */
export function SocialView({ section = null }: { section?: SocialSection }) {
  const { t, format } = useLocale();
  const { isAuthenticated, user } = useAuth();
  const [page, setPage] = useState<SocialPage>(section ? PAGE_FOR_SECTION[section] : 'hub');
  const [requestsFocus, setRequestsFocus] = useState(section === 'requests');
  const [inboxOpen, setInboxOpen] = useState(section === 'inbox');
  const [prevSection, setPrevSection] = useState(section);
  if (section !== prevSection) {
    setPrevSection(section);
    if (section) setPage(PAGE_FOR_SECTION[section]);
    setRequestsFocus(section === 'requests');
    if (section === 'inbox') setInboxOpen(true);
  }
  const [profile, setProfile] = useState<SocialProfileDto | null>(null);
  const [lists, setLists] = useState<FriendListsDto | null>(null);
  const [summary, setSummary] = useState<SocialSummaryDto | null>(null);
  const [league, setLeague] = useState<LeagueCurrentDto | null>(null);
  const [leagueFriends, setLeagueFriends] = useState<LeagueFriendRowDto[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<SocialCardDto | null>(null);
  const [pendingResult, setPendingResult] = useState<LeaguePendingResultDto | null>(null);
  const [resultOverlay, setResultOverlay] = useState<LeaguePendingResultDto | null>(null);
  const [duels, setDuels] = useState<DuelListDto | null>(null);
  const [streaks, setStreaks] = useState<StreakListDto | null>(null);
  const [duelPending, setDuelPending] = useState<DuelItemDto | null>(null);
  const [duelOverlay, setDuelOverlay] = useState<DuelItemDto | null>(null);
  const [raids, setRaids] = useState<RaidListDto | null>(null);
  const [squads, setSquads] = useState<SquadListDto | null>(null);
  const [raidPending, setRaidPending] = useState<RaidResultDto | null>(null);
  const [raidOverlay, setRaidOverlay] = useState<RaidResultDto | null>(null);
  const [raidPage, setRaidPage] = useState<string | null>(null);
  const [friendSheet, setFriendSheet] = useState<SocialCardDto | null>(null);
  const onboardingPrompted = React.useRef(false);
  // History entries this view pushed — the back chevron must not leave the app
  // when it deep-linked straight into a page.
  const pushedPages = React.useRef(0);

  useLeagueResult(pendingResult, setResultOverlay);
  useDuelResult(duelPending, setDuelOverlay);
  useRaidResult(raidPending, setRaidOverlay);

  const refresh = useCallback(async () => {
    const [
      meRes,
      friendsRes,
      summaryRes,
      leagueRes,
      leagueFrRes,
      duelsRes,
      streaksRes,
      raidsRes,
      squadsRes,
    ] = await Promise.all([
      socialApi.me(),
      socialApi.friends(),
      socialApi.summary().catch(() => null),
      // League/duels/streaks/raids 403 while their feature switch is off — the cards hide.
      leagueApi.current().catch(() => null),
      leagueApi.friends().catch(() => null),
      duelsApi.list().catch(() => null),
      streaksApi.list().catch(() => null),
      raidsApi.current().catch(() => null),
      squadsApi.list().catch(() => null),
    ]);
    if (meRes.data) setProfile(meRes.data);
    if (friendsRes.data) setLists(friendsRes.data);
    if (summaryRes?.data) setSummary(summaryRes.data);
    setLeague(leagueRes?.data ?? null);
    setLeagueFriends(leagueFrRes?.data?.entries ?? null);
    if (leagueRes?.data) setPendingResult(leagueRes.data.pendingResult);
    setDuels(duelsRes?.data ?? null);
    setStreaks(streaksRes?.data ?? null);
    setDuelPending(duelsRes?.data?.pendingResult ?? null);
    setRaids(raidsRes?.data ?? null);
    setSquads(squadsRes?.data ?? null);
    setRaidPending(raidsRes?.data?.pendingResults[0] ?? null);
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      queueMicrotask(() => void refresh().catch(() => undefined));
    }
  }, [isAuthenticated, refresh]);

  // Browser back from a detail page returns to the hub.
  useEffect(() => {
    const onPop = () => {
      pushedPages.current = Math.max(0, pushedPages.current - 1);
      setPage('hub');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const openPage = useCallback(
    (target: SocialPage) => {
      if (target === page) return;
      if (target !== 'hub') {
        window.history.pushState({ lukiSocialPage: target }, '');
        pushedPages.current += 1;
      }
      setPage(target);
      window.scrollTo({ top: 0 });
    },
    [page],
  );

  // Unread badge: poll on visibility/focus and every 60 s while visible.
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await notificationsApi.list(null, 1);
        if (!cancelled && res.data) setUnread(res.data.unreadCount);
      } catch {
        /* keep last count */
      }
    };
    void poll();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void poll();
    }, UNREAD_POLL_MS);
    const onVis = () => {
      if (document.visibilityState === 'visible') void poll();
    };
    window.addEventListener('focus', onVis);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener('focus', onVis);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [isAuthenticated]);

  // Onboarding: once per browser session when social is on and no username yet.
  useEffect(() => {
    if (!profile || profile.username !== null || onboardingPrompted.current) return;
    if (sessionStorage.getItem(ONBOARDING_DISMISSED_KEY)) return;
    onboardingPrompted.current = true;
    queueMicrotask(() => setOnboardingOpen(true));
  }, [profile]);

  const navigateToSection = useCallback(
    (target: SocialSection) => {
      if (target === 'inbox') {
        setInboxOpen(true);
        return;
      }
      if (target) openPage(PAGE_FOR_SECTION[target]);
      setRequestsFocus(target === 'requests');
    },
    [openPage],
  );

  if (!isAuthenticated) {
    return (
      <div className="pt-4">
        <PageTitle title={t.social.title} />
        <div className="bg-card mt-6 rounded-[1.25rem] p-6 text-center">
          <p className="text-muted-foreground text-[0.9375rem]">{t.social.signUpCta}</p>
          <Button asChild className="mt-4">
            <a href="/login">{t.invite.signUp}</a>
          </Button>
        </div>
      </div>
    );
  }

  const username = user?.social?.username ?? profile?.username ?? null;
  const me = {
    username,
    name: profile?.name ?? null,
    avatarUrl: profile?.avatarUrl ?? null,
  };

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await refresh();
    } catch {
      /* row-level actions are idempotent; a retry keeps the list honest */
    }
  };

  const friendActions = (card: SocialCardDto): FriendActions => {
    // Non-friends (search/contact results) only get Report in the sheet.
    if (!lists?.friends.some((f) => f.userId === card.userId)) {
      return { onReport: setReportTarget };
    }
    const streak = streaks?.active.find((s) => s.friend.userId === card.userId) ?? null;
    const streakIncoming = streaks?.incoming.find((s) => s.friend.userId === card.userId) ?? null;
    const streakOutgoing = streaks?.outgoing.find((s) => s.friend.userId === card.userId) ?? null;
    const openDuel = duels
      ? [...duels.active, ...duels.incoming, ...duels.outgoing].find(
          (d) => d.opponent.userId === card.userId,
        )
      : null;
    const openCount = duels
      ? duels.active.length + duels.incoming.length + duels.outgoing.length
      : 0;
    const duelBlockedReason = openDuel
      ? format(t.battle.challengeExists, { username: `@${card.username}` })
      : openCount >= 3
        ? t.battle.challengeLimit
        : null;
    return {
      streak: streak ?? streakIncoming ?? streakOutgoing,
      streakPending: streakIncoming ? 'incoming' : streakOutgoing ? 'outgoing' : null,
      duelBlockedReason: duels ? duelBlockedReason : null,
      onChallenge: duels ? (id) => void run(() => duelsApi.challenge(id)) : undefined,
      onStreakInvite: streaks ? (id) => void run(() => streaksApi.invite(id)) : undefined,
      onStreakAccept: streaks ? (id) => void run(() => streaksApi.accept(id)) : undefined,
      onStreakEnd: streaks ? (id) => void run(() => streaksApi.end(id)) : undefined,
      onRemove: (id) => void run(() => socialApi.removeFriend(id)),
      onBlock: (id) => void run(() => socialApi.block({ userId: id })),
      onReport: setReportTarget,
    };
  };

  const goBack = () => {
    if (pushedPages.current > 0) {
      pushedPages.current -= 1;
      window.history.back();
    } else {
      setPage('hub');
    }
  };

  const pageTitle: Record<SocialPage, string> = {
    hub: t.social.title,
    league: t.league.leagueTitle,
    duels: t.battle.duelsTitle,
    raids: t.social.raidsTitle,
    friends: t.social.sectionFriends,
    trophies: t.battle.trophiesTitle,
  };

  return (
    <div className="pt-4" data-testid="social-view">
      {page === 'hub' ? (
        <PageTitle
          title={t.social.title}
          actions={
            <>
              <button
                type="button"
                onClick={() => openPage('friends')}
                data-testid="social-friends-btn"
                aria-label={t.social.sectionFriends}
                className="relative flex size-9 items-center justify-center rounded-full"
              >
                <Users className="h-5 w-5" />
                {(lists?.incoming.length ?? 0) > 0 && (
                  <span
                    data-testid="social-friends-badge"
                    className="bg-destructive text-destructive-foreground absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[0.625rem] font-bold"
                  >
                    {lists!.incoming.length > 99 ? '99+' : lists!.incoming.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setInboxOpen(true)}
                data-testid="social-inbox-btn"
                aria-label={t.social.inboxAria}
                className="relative flex size-9 items-center justify-center rounded-full"
              >
                <Bell className="h-5 w-5" />
                {unread > 0 && (
                  <span
                    data-testid="social-unread-badge"
                    className="bg-destructive text-destructive-foreground absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[0.625rem] font-bold"
                  >
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </button>
            </>
          }
        />
      ) : (
        <SocialPageHeader title={pageTitle[page]} onBack={goBack} />
      )}

      {page === 'hub' && profile && !username && (
        <div className="bg-card mt-4 flex items-center gap-3 rounded-[1.25rem] p-4">
          <p className="text-muted-foreground min-w-0 flex-1 text-[0.9375rem]">
            {t.social.onboardingBody}
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            data-testid="social-finish-setup"
            onClick={() => setOnboardingOpen(true)}
          >
            {t.social.chooseUsername}
          </Button>
        </div>
      )}

      {page === 'hub' && (
        <div className="mt-4 space-y-4">
          <SocialWeekCard
            week={summary?.week}
            nextMove={summary?.nextMove}
            onNextMove={(target) => openPage(target)}
          />
          {summary && lists && (
            <FriendsWeekStrip
              friendsWeek={summary.friendsWeek}
              hasFriends={lists.friends.length > 0}
              onOpenFriend={setFriendSheet}
              onSeeAll={() => openPage('friends')}
            />
          )}
          {league && (
            <LeagueCompactCard
              current={league}
              friendsEntries={leagueFriends}
              onOpen={() => openPage('league')}
            />
          )}
          {duels && (
            <DuelsCompactCard
              data={duels}
              onOpen={() => openPage('duels')}
              onChallenge={() => openPage('friends')}
            />
          )}
          {raids && raids.community && (
            <RaidsCompactCard raids={raids} onOpen={() => openPage('raids')} />
          )}
          {streaks && <StreaksCompactCard streaks={streaks} onOpen={() => openPage('friends')} />}
          {user?.id && <TrophyRow userId={user.id} onOpen={() => openPage('trophies')} />}
        </div>
      )}

      {page === 'league' && (
        <div className="mt-4">
          <LeagueCard onPendingResult={setPendingResult} />
        </div>
      )}

      {page === 'duels' && duels && (
        <div className="mt-4">
          <DuelsCard
            data={duels}
            me={me}
            friends={lists?.friends}
            onAction={(fn) => void run(fn)}
          />
        </div>
      )}

      {page === 'raids' && (
        <div className="mt-4 space-y-4">
          {raids?.community && (
            <RaidCard
              raid={raids.community}
              yourDamage={raids.community.yourDamage}
              onOpen={() => setRaidPage(raids.community!.id)}
            />
          )}
          {raids?.squads.map((r) => (
            <RaidCard
              key={r.id}
              raid={r}
              yourDamage={r.yourDamage}
              onOpen={() => setRaidPage(r.id)}
            />
          ))}
          {raids && !raids.community && raids.squads.length === 0 && (
            <p className="text-muted-foreground bg-card rounded-[1.25rem] px-4 py-6 text-center text-[0.9375rem]">
              {t.raid.notStarted}
            </p>
          )}
          {squads && <SquadsCard data={squads} friends={lists} onAction={(fn) => void run(fn)} />}
        </div>
      )}

      {page === 'friends' && lists && (
        <FriendsPage
          lists={lists}
          friendsWeek={summary?.friendsWeek ?? []}
          streaks={streaks}
          focusRequests={requestsFocus}
          onAction={(fn) => void run(fn)}
          onOpenFriend={setFriendSheet}
        />
      )}

      {page === 'trophies' && (
        <div className="mt-4">
          <TrophyShelf userId={user?.id ?? null} />
        </div>
      )}

      <InboxSheet
        open={inboxOpen}
        onOpenChange={(open) => {
          setInboxOpen(open);
          if (!open) setUnread(0);
        }}
        onNavigate={navigateToSection}
      />
      <SocialOnboardingSheet
        open={onboardingOpen}
        onOpenChange={(open) => {
          setOnboardingOpen(open);
          if (!open) {
            onboardingPrompted.current = true;
            sessionStorage.setItem(ONBOARDING_DISMISSED_KEY, '1');
            void refresh();
          }
        }}
        profile={profile}
      />
      <ReportSheet user={reportTarget} onOpenChange={(open) => !open && setReportTarget(null)} />
      <FriendSheet
        user={friendSheet}
        onOpenChange={(open) => !open && setFriendSheet(null)}
        actions={friendSheet ? friendActions(friendSheet) : undefined}
      />
      {resultOverlay && (
        <LeagueCelebration
          result={resultOverlay}
          onDone={() =>
            dismissLeagueResult(resultOverlay, () => {
              setResultOverlay(null);
              setPendingResult(null);
            })
          }
        />
      )}
      <RaidPage raidId={raidPage} onOpenChange={(open) => !open && setRaidPage(null)} />
      {raidOverlay && (
        <RaidCelebration
          result={raidOverlay}
          onDone={() => {
            setRaidOverlay(null);
            setRaidPending(null);
            void refresh();
          }}
        />
      )}
      {duelOverlay && (
        <DuelCelebration
          result={duelOverlay}
          onDone={() =>
            dismissDuelResult(duelOverlay, () => {
              setDuelOverlay(null);
              setDuelPending(null);
            })
          }
          onRematch={(opponentId) => {
            void duelsApi.challenge(opponentId).catch(() => undefined);
            dismissDuelResult(duelOverlay, () => {
              setDuelOverlay(null);
              setDuelPending(null);
              void refresh();
            });
          }}
        />
      )}
    </div>
  );
}
