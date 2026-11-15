'use client';

import React from 'react';
import { Flame, Snowflake } from 'lucide-react';
import { useLocale } from '@/providers/i18n/locale-context';
import { FriendStreakStatus } from '@luki-fitti/common/enums';
import type { FriendStreakDto, SocialCardDto } from '@luki-fitti/common/schemas';
import { UserAvatar } from './user-avatar';

interface FriendRowProps {
  user: SocialCardDto;
  /** Inline buttons — only request rows (accept/decline, withdraw) keep them. */
  actions?: React.ReactNode;
  /** Active streak with this friend → flame chip + freezes. */
  streak?: FriendStreakDto | null;
  /** Workouts this week → "{n}× this week" under the name. */
  weekCount?: number | null;
  onView?: (user: SocialCardDto) => void;
  'data-testid'?: string;
}

/**
 * One user row: avatar + name/@username (+ streak chip and this week's workout
 * count) + optional inline actions. A tap opens the friend sheet, which owns
 * duel/streak/remove/block/report.
 */
export function FriendRow({
  user,
  actions,
  streak = null,
  weekCount = null,
  onView,
  'data-testid': testId,
}: FriendRowProps) {
  const { t, format } = useLocale();

  return (
    <li
      className="flex items-center gap-3 px-4 py-2.5"
      data-testid={testId ?? `friend-row-${user.userId}`}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        onClick={() => onView?.(user)}
        disabled={!onView}
      >
        <UserAvatar avatarUrl={user.avatarUrl} name={user.name} username={user.username} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[0.9375rem] font-medium">
              {user.name ?? `@${user.username}`}
            </p>
            {streak?.status === FriendStreakStatus.ACTIVE && (
              <span
                className="flex items-center gap-0.5 rounded-full bg-orange-500/15 px-1.5 py-0.5 text-[0.75rem] font-semibold text-orange-500"
                data-testid={`streak-chip-${user.userId}`}
              >
                <Flame className="h-3.5 w-3.5" aria-hidden="true" />
                {streak.count}
                {Array.from({ length: streak.freezes }).map((_, i) => (
                  <Snowflake key={i} className="h-3 w-3 text-sky-400" aria-hidden="true" />
                ))}
              </span>
            )}
          </div>
          {user.name && (
            <p className="text-muted-foreground truncate text-[0.8125rem]">@{user.username}</p>
          )}
          {weekCount !== null && (
            <p
              className="text-muted-foreground truncate text-[0.75rem]"
              data-testid={`friend-week-${user.userId}`}
            >
              {format(t.social.timesThisWeek, { n: weekCount })}
            </p>
          )}
        </div>
      </button>
      {actions}
    </li>
  );
}
