'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Pencil } from 'lucide-react';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { useAuth } from '@/providers/auth/auth-context';
import { useLocale } from '@/providers/i18n/locale-context';
import type {
  DuelItemDto,
  DuelListDto,
  FriendListsDto,
  LeaguePendingResultDto,
  RaidListDto,
  RaidResultDto,
  SocialCardDto,
  SocialProfileDto,
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
} from '@/lib/social/social-api';
import { PageTitle } from '../page-title';
import { UserAvatar } from './user-avatar';
import { FriendRow } from './friend-row';
import { AddFriendsSection } from './add-friends-section';
import { ThisWeekCard } from './this-week-card';
import { LeagueCard } from './league-card';
import { LeagueCelebration, dismissLeagueResult, useLeagueResult } from './league-celebration';
import { DuelCelebration, dismissDuelResult, useDuelResult } from './duel-celebration';
import { DuelsCard } from './duels-card';
import { RaidCard } from '../raid/raid-card';
import { RaidPage } from '../raid/raid-page';
import { SquadsCard } from '../raid/squads-card';
import { RaidCelebration, useRaidResult } from '../raid/raid-celebration';
import { FriendSheet } from './friend-sheet';
import { InboxSheet } from './inbox-sheet';
import { SocialProfileSheet } from './social-profile-sheet';
import { SocialOnboardingSheet } from './social-onboarding-sheet';
import { ReportSheet } from './report-sheet';

export type SocialSection = 'friends' | 'requests' | 'inbox' | 'duels' | 'raids' | null;

const ONBOARDING_DISMISSED_KEY = 'luki.social.onboardingDismissed';
const UNREAD_POLL_MS = 60_000;

/**
 * The Social tab. Sections are stacked so league/points cards (PR 2) can slot
 * in above Friends without restructuring.
 */
export function SocialView({ section = null }: { section?: SocialSection }) {
  const { t, format } = useLocale();
  const { isAuthenticated, user } = useAuth();
  const [profile, setProfile] = useState<SocialProfileDto | null>(null);
  const [lists, setLists] = useState<FriendListsDto | null>(null);
  const [unread, setUnread] = useState(0);
  const [inboxOpen, setInboxOpen] = useState(section === 'inbox');
  const [profileOpen, setProfileOpen] = useState(false);
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
  const friendsAnchor = useRef<HTMLDivElement>(null);
  const duelsAnchor = useRef<HTMLDivElement>(null);
  const raidsAnchor = useRef<HTMLDivElement>(null);
  const onboardingPrompted = useRef(false);

  useLeagueResult(pendingResult, setResultOverlay);
  useDuelResult(duelPending, setDuelOverlay);
  useRaidResult(raidPending, setRaidOverlay);

  const refresh = useCallback(async () => {
    const [meRes, friendsRes, duelsRes, streaksRes, raidsRes, squadsRes] = await Promise.all([
      socialApi.me(),
      socialApi.friends(),
      // Duels/streaks/raids 403 while their feature switch is off — the sections hide.
      duelsApi.list().catch(() => null),
      streaksApi.list().catch(() => null),
      raidsApi.current().catch(() => null),
      squadsApi.list().catch(() => null),
    ]);
    if (meRes.data) setProfile(meRes.data);
    if (friendsRes.data) setLists(friendsRes.data);
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

  // Onboarding: once per browser session when social is on and no handle yet.
  useEffect(() => {
    if (!profile || profile.handle !== null || onboardingPrompted.current) return;
    if (sessionStorage.getItem(ONBOARDING_DISMISSED_KEY)) return;
    onboardingPrompted.current = true;
    queueMicrotask(() => setOnboardingOpen(true));
  }, [profile]);

  useEffect(() => {
    if (section === 'friends' || section === 'requests') {
      friendsAnchor.current?.scrollIntoView({ block: 'start' });
    } else if (section === 'duels') {
      duelsAnchor.current?.scrollIntoView({ block: 'start' });
    } else if (section === 'raids') {
      raidsAnchor.current?.scrollIntoView({ block: 'start' });
    }
  }, [section]);

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

  const handle = user?.social?.handle ?? profile?.handle ?? null;

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await refresh();
    } catch {
      /* row-level actions are idempotent; a retry keeps the list honest */
    }
  };

  return (
    <div className="pt-4" data-testid="social-view">
      <PageTitle
        title={t.social.title}
        actions={
          <>
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

      {/* Own card: @handle + profile editor entry. */}
      <div className="bg-card mt-4 flex items-center gap-3 rounded-[1.25rem] p-4">
        <UserAvatar avatarUrl={profile?.avatarUrl} name={profile?.name} handle={handle} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[1.0625rem] font-semibold">
            {handle ? `@${handle}` : t.social.onboardingTitle}
          </p>
          {profile?.name && (
            <p className="text-muted-foreground truncate text-[0.8125rem]">{profile.name}</p>
          )}
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          data-testid={handle ? 'social-edit-profile-2' : 'social-finish-setup'}
          onClick={() => (handle ? setProfileOpen(true) : setOnboardingOpen(true))}
        >
          <Pencil className="h-4 w-4" />
          {handle ? t.social.editProfile : t.social.onboardingDone}
        </Button>
      </div>

      {/* PR 2: weekly EP + league cards. PR 3: Duels. PR 4: Raids above Duels. */}
      <div className="mt-4 space-y-4">
        <ThisWeekCard />
        <LeagueCard onPendingResult={setPendingResult} />
        <div ref={raidsAnchor} className="scroll-mt-20">
          {raids?.community && (
            <RaidCard
              raid={raids.community}
              yourDamage={raids.community!.yourDamage}
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
          {squads && <SquadsCard data={squads} friends={lists} onAction={(fn) => void run(fn)} />}
        </div>
        <div ref={duelsAnchor} className="scroll-mt-20">
          {duels && (
            <DuelsCard
              data={duels}
              me={{
                handle,
                name: profile?.name ?? null,
                avatarUrl: profile?.avatarUrl ?? null,
              }}
              onAction={(fn) => void run(fn)}
            />
          )}
        </div>
      </div>

      <div ref={friendsAnchor} className="mt-6 scroll-mt-20">
        <h2 className="text-muted-foreground px-1 pb-1 text-[0.8125rem] font-medium tracking-wide uppercase">
          {t.social.sectionFriends}
        </h2>
        <ul
          className="bg-card divide-border/60 divide-y rounded-[1.25rem]"
          data-testid="friends-list"
        >
          {lists?.incoming.length ? (
            <>
              <li className="text-muted-foreground px-4 pt-3 pb-1 text-[0.75rem] font-medium uppercase">
                {t.social.sectionRequests}
              </li>
              {lists.incoming.map((u) => (
                <FriendRow
                  key={u.userId}
                  user={u}
                  actions={
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        data-testid={`friend-accept-${u.userId}`}
                        onClick={() => void run(() => socialApi.acceptRequest(u.userId))}
                      >
                        {t.social.accept}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        data-testid={`friend-decline-${u.userId}`}
                        onClick={() => void run(() => socialApi.declineRequest(u.userId))}
                      >
                        {t.social.decline}
                      </Button>
                    </div>
                  }
                  onBlock={(id) => void run(() => socialApi.block({ userId: id }))}
                  onReport={setReportTarget}
                />
              ))}
            </>
          ) : null}
          {lists?.outgoing.length ? (
            <>
              <li className="text-muted-foreground px-4 pt-3 pb-1 text-[0.75rem] font-medium uppercase">
                {t.social.sectionSent}
              </li>
              {lists.outgoing.map((u) => (
                <FriendRow
                  key={u.userId}
                  user={u}
                  actions={
                    <Button
                      size="sm"
                      variant="secondary"
                      data-testid={`friend-withdraw-${u.userId}`}
                      onClick={() => void run(() => socialApi.removeFriend(u.userId))}
                    >
                      {t.social.withdraw}
                    </Button>
                  }
                  onBlock={(id) => void run(() => socialApi.block({ userId: id }))}
                  onReport={setReportTarget}
                />
              ))}
            </>
          ) : null}
          {lists?.friends.length ? (
            lists.friends.map((u) => {
              const streak = streaks?.active.find((s) => s.friend.userId === u.userId) ?? null;
              const streakIncoming =
                streaks?.incoming.find((s) => s.friend.userId === u.userId) ?? null;
              const streakOutgoing =
                streaks?.outgoing.find((s) => s.friend.userId === u.userId) ?? null;
              const openDuel = duels
                ? [...duels.active, ...duels.incoming, ...duels.outgoing].find(
                    (d) => d.opponent.userId === u.userId,
                  )
                : null;
              const openCount = duels
                ? duels.active.length + duels.incoming.length + duels.outgoing.length
                : 0;
              const duelBlockedReason = openDuel
                ? format(t.battle.challengeExists, { handle: `@${u.handle}` })
                : openCount >= 3
                  ? t.battle.challengeLimit
                  : null;
              return (
                <FriendRow
                  key={u.userId}
                  user={u}
                  streak={streak ?? streakIncoming ?? streakOutgoing}
                  streakPending={streakIncoming ? 'incoming' : streakOutgoing ? 'outgoing' : null}
                  duelBlockedReason={duels ? duelBlockedReason : null}
                  onChallenge={duels ? (id) => void run(() => duelsApi.challenge(id)) : undefined}
                  onStreakInvite={
                    streaks ? (id) => void run(() => streaksApi.invite(id)) : undefined
                  }
                  onStreakAccept={
                    streaks ? (id) => void run(() => streaksApi.accept(id)) : undefined
                  }
                  onStreakEnd={streaks ? (id) => void run(() => streaksApi.end(id)) : undefined}
                  onView={setFriendSheet}
                  onRemove={(id) => void run(() => socialApi.removeFriend(id))}
                  onBlock={(id) => void run(() => socialApi.block({ userId: id }))}
                  onReport={setReportTarget}
                />
              );
            })
          ) : lists && !lists.incoming.length && !lists.outgoing.length ? (
            <li className="text-muted-foreground px-4 py-6 text-center text-[0.9375rem]">
              {t.social.friendsEmpty}
            </li>
          ) : null}
        </ul>
      </div>

      <AddFriendsSection onChanged={() => void refresh()} onReport={setReportTarget} />

      <InboxSheet
        open={inboxOpen}
        onOpenChange={(open) => {
          setInboxOpen(open);
          if (!open) setUnread(0);
        }}
      />
      <SocialProfileSheet
        open={profileOpen}
        onOpenChange={setProfileOpen}
        profile={profile}
        onSaved={() => void refresh()}
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
      <FriendSheet user={friendSheet} onOpenChange={(open) => !open && setFriendSheet(null)} />
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
