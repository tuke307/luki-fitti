'use client';

import React from 'react';
import type { FriendWeekDto, SocialCardDto } from '@luki-fitti/common/schemas';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { useLocale } from '@/providers/i18n/locale-context';
import { UserAvatar } from './user-avatar';

/**
 * "Friends this week": horizontal avatar strip ordered by this week's workout
 * count. A tap opens the friend sheet; the trailing control opens the Friends
 * page. With no friends at all it collapses to one "Add friends" button.
 */
export function FriendsWeekStrip({
  friendsWeek,
  hasFriends,
  onOpenFriend,
  onSeeAll,
}: {
  friendsWeek: FriendWeekDto[];
  hasFriends: boolean;
  onOpenFriend: (card: SocialCardDto) => void;
  onSeeAll: () => void;
}) {
  const { t, format } = useLocale();

  if (!hasFriends) {
    return (
      <div className="bg-card rounded-[1.25rem] p-4" data-testid="friends-week-strip">
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          data-testid="friends-week-add"
          onClick={onSeeAll}
        >
          {t.social.addFriends}
        </Button>
      </div>
    );
  }

  return (
    <section className="bg-card rounded-[1.25rem] py-3" data-testid="friends-week-strip">
      <p className="text-muted-foreground px-4 pb-1 text-[0.8125rem] font-medium tracking-wide uppercase">
        {t.social.friendsThisWeek}
      </p>
      <div className="flex gap-4 overflow-x-auto px-4 pb-1">
        {friendsWeek.map(({ card, workouts }) => (
          <button
            key={card.userId}
            type="button"
            onClick={() => onOpenFriend(card)}
            data-testid={`friends-week-${card.userId}`}
            className="flex w-14 shrink-0 flex-col items-center gap-1"
          >
            <UserAvatar
              avatarUrl={card.avatarUrl}
              name={card.name}
              username={card.username}
              className="size-12"
            />
            <p className="w-full truncate text-center text-[0.75rem] font-medium">
              @{card.username}
            </p>
            <p className="text-muted-foreground text-[0.6875rem]">
              {format(t.social.timesWeek, { n: workouts })}
            </p>
          </button>
        ))}
        <button
          type="button"
          onClick={onSeeAll}
          data-testid="friends-week-see-all"
          className="text-muted-foreground flex w-14 shrink-0 flex-col items-center justify-center gap-1 self-stretch text-[0.75rem] font-medium"
        >
          {t.social.seeAll}
        </button>
      </div>
    </section>
  );
}
