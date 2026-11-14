'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Pencil } from 'lucide-react';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { useAuth } from '@/providers/auth/auth-context';
import { useLocale } from '@/providers/i18n/locale-context';
import type {
  FriendListsDto,
  LeaguePendingResultDto,
  SocialCardDto,
  SocialProfileDto,
} from '@luki-fitti/common/schemas';
import { notificationsApi, socialApi } from '@/lib/social/social-api';
import { PageTitle } from '../page-title';
import { UserAvatar } from './user-avatar';
import { FriendRow } from './friend-row';
import { AddFriendsSection } from './add-friends-section';
import { ThisWeekCard } from './this-week-card';
import { LeagueCard } from './league-card';
import { LeagueCelebration, dismissLeagueResult, useLeagueResult } from './league-celebration';
import { InboxSheet } from './inbox-sheet';
import { SocialProfileSheet } from './social-profile-sheet';
import { SocialOnboardingSheet } from './social-onboarding-sheet';
import { ReportSheet } from './report-sheet';

export type SocialSection = 'friends' | 'requests' | 'inbox' | null;

const ONBOARDING_DISMISSED_KEY = 'luki.social.onboardingDismissed';
const UNREAD_POLL_MS = 60_000;

/**
 * The Social tab. Sections are stacked so league/points cards (PR 2) can slot
 * in above Friends without restructuring.
 */
export function SocialView({ section = null }: { section?: SocialSection }) {
  const { t } = useLocale();
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
  const friendsAnchor = useRef<HTMLDivElement>(null);
  const onboardingPrompted = useRef(false);

  useLeagueResult(pendingResult, setResultOverlay);

  const refresh = useCallback(async () => {
    const [meRes, friendsRes] = await Promise.all([socialApi.me(), socialApi.friends()]);
    if (meRes.data) setProfile(meRes.data);
    if (friendsRes.data) setLists(friendsRes.data);
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

      {/* PR 2: weekly EP + league cards. PR 3/4 add Duels and Raid above Friends. */}
      <div className="mt-4 space-y-4">
        <ThisWeekCard />
        <LeagueCard onPendingResult={setPendingResult} />
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
            lists.friends.map((u) => (
              <FriendRow
                key={u.userId}
                user={u}
                onRemove={(id) => void run(() => socialApi.removeFriend(id))}
                onBlock={(id) => void run(() => socialApi.block({ userId: id }))}
                onReport={setReportTarget}
              />
            ))
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
    </div>
  );
}
