'use client';

import React, { useEffect, useRef, useState } from 'react';
import type {
  FriendListsDto,
  FriendWeekDto,
  SocialCardDto,
  SocialUserDto,
  StreakListDto,
} from '@luki-fitti/common/schemas';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { useLocale } from '@/providers/i18n/locale-context';
import { socialApi } from '@/lib/social/social-api';
import { FriendRow } from './friend-row';
import { AddFriendsSection } from './add-friends-section';

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-muted-foreground px-1 pb-1 text-[0.8125rem] font-medium tracking-wide uppercase">
      {children}
    </h2>
  );
}

/**
 * Friends detail page: incoming requests (accept/decline inline), friends
 * sorted by this week's workouts (friends missing from the weekly list, e.g.
 * paused, go last), sent requests (withdraw inline), Add friends, Blocked.
 */
export function FriendsPage({
  lists,
  friendsWeek,
  streaks,
  focusRequests,
  onAction,
  onOpenFriend,
}: {
  lists: FriendListsDto;
  friendsWeek: FriendWeekDto[];
  streaks: StreakListDto | null;
  focusRequests: boolean;
  onAction: (fn: () => Promise<unknown>) => void;
  onOpenFriend: (card: SocialCardDto) => void;
}) {
  const { t } = useLocale();
  const requestsAnchor = useRef<HTMLDivElement>(null);
  const [blocked, setBlocked] = useState<SocialUserDto[] | null>(null);

  useEffect(() => {
    if (focusRequests) requestsAnchor.current?.scrollIntoView({ block: 'start' });
  }, [focusRequests]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await socialApi.blocks();
        if (!cancelled && res.data) setBlocked(res.data.blocked);
      } catch {
        /* blocked list stays hidden */
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const weekByUser = new Map(friendsWeek.map((f) => [f.card.userId, f.workouts]));
  const orderByUser = new Map(friendsWeek.map((f, i) => [f.card.userId, i]));
  const sortedFriends = [...lists.friends].sort((a, b) => {
    const ai = orderByUser.get(a.userId);
    const bi = orderByUser.get(b.userId);
    if (ai !== undefined && bi !== undefined) return ai - bi;
    if (ai !== undefined) return -1;
    if (bi !== undefined) return 1;
    return a.username.localeCompare(b.username);
  });

  const unblock = async (userId: string) => {
    try {
      await socialApi.unblock(userId);
      const res = await socialApi.blocks();
      if (res.data) setBlocked(res.data.blocked);
      onAction(() => Promise.resolve());
    } catch {
      /* retry keeps the list honest */
    }
  };

  return (
    <div className="mt-4 space-y-6">
      {lists.incoming.length > 0 && (
        <div ref={requestsAnchor} className="scroll-mt-20">
          <SectionTitle>{t.social.sectionRequests}</SectionTitle>
          <ul
            className="bg-card divide-border/60 divide-y rounded-[1.25rem]"
            data-testid="friends-incoming"
          >
            {lists.incoming.map((u) => (
              <FriendRow
                key={u.userId}
                user={u}
                actions={
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      data-testid={`friend-accept-${u.userId}`}
                      onClick={() => onAction(() => socialApi.acceptRequest(u.userId))}
                    >
                      {t.social.accept}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      data-testid={`friend-decline-${u.userId}`}
                      onClick={() => onAction(() => socialApi.declineRequest(u.userId))}
                    >
                      {t.social.decline}
                    </Button>
                  </div>
                }
              />
            ))}
          </ul>
        </div>
      )}

      <div>
        <SectionTitle>{t.social.sectionFriends}</SectionTitle>
        <ul
          className="bg-card divide-border/60 divide-y rounded-[1.25rem]"
          data-testid="friends-list"
        >
          {sortedFriends.length ? (
            sortedFriends.map((u) => (
              <FriendRow
                key={u.userId}
                user={u}
                weekCount={weekByUser.get(u.userId) ?? null}
                streak={streaks?.active.find((s) => s.friend.userId === u.userId) ?? null}
                onView={onOpenFriend}
              />
            ))
          ) : (
            <li className="text-muted-foreground px-4 py-6 text-center text-[0.9375rem]">
              {t.social.friendsEmpty}
            </li>
          )}
        </ul>
      </div>

      {lists.outgoing.length > 0 && (
        <div>
          <SectionTitle>{t.social.sectionSent}</SectionTitle>
          <ul
            className="bg-card divide-border/60 divide-y rounded-[1.25rem]"
            data-testid="friends-outgoing"
          >
            {lists.outgoing.map((u) => (
              <FriendRow
                key={u.userId}
                user={u}
                actions={
                  <Button
                    size="sm"
                    variant="secondary"
                    data-testid={`friend-withdraw-${u.userId}`}
                    onClick={() => onAction(() => socialApi.removeFriend(u.userId))}
                  >
                    {t.social.withdraw}
                  </Button>
                }
              />
            ))}
          </ul>
        </div>
      )}

      <AddFriendsSection
        onChanged={() => onAction(() => Promise.resolve())}
        onOpenSheet={onOpenFriend}
      />

      {blocked && blocked.length > 0 && (
        <div>
          <SectionTitle>{t.social.blockedSection}</SectionTitle>
          <ul
            className="bg-card divide-border/60 divide-y rounded-[1.25rem]"
            data-testid="blocked-list"
          >
            {blocked.map((u) => (
              <FriendRow
                key={u.userId}
                user={u}
                actions={
                  <Button
                    size="sm"
                    variant="secondary"
                    data-testid={`friend-unblock-${u.userId}`}
                    onClick={() => void unblock(u.userId)}
                  >
                    {t.social.unblock}
                  </Button>
                }
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
