'use client';

import React, { useState } from 'react';
import { Flame, MoreHorizontal, Snowflake, Swords } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@luki-fitti/ui/components/ui/dropdown-menu';
import { useLocale } from '@/providers/i18n/locale-context';
import { FriendStreakStatus } from '@luki-fitti/common/enums';
import type { FriendStreakDto, SocialCardDto } from '@luki-fitti/common/schemas';
import { UserAvatar } from './user-avatar';
import { ConfirmDestructiveDialog } from '../confirm-destructive-dialog';

interface FriendRowProps {
  user: SocialCardDto;
  actions?: React.ReactNode;
  /** Active streak with this friend → flame chip + freezes + weekly progress. */
  streak?: FriendStreakDto | null;
  /** Streak invite state with this friend. */
  streakPending?: 'incoming' | 'outgoing' | null;
  /** Open duel with this friend, or reason a challenge is not possible. */
  duelBlockedReason?: string | null;
  onChallenge?: (userId: string) => void;
  onStreakInvite?: (userId: string) => void;
  onStreakAccept?: (streakId: string) => void;
  /** Active streak the row can end (with confirmation). */
  onStreakEnd?: (streakId: string) => void;
  onView?: (user: SocialCardDto) => void;
  onRemove?: (userId: string) => void;
  onBlock?: (userId: string) => void;
  onReport?: (user: SocialCardDto) => void;
  'data-testid'?: string;
}

/**
 * One user row: avatar + @handle (+ streak chip and weekly progress) + inline
 * actions + a ⋯ menu. The menu carries duel/streak actions first, then
 * Remove friend / Block / Report (both confirm destructively).
 */
export function FriendRow({
  user,
  actions,
  streak = null,
  streakPending = null,
  duelBlockedReason = null,
  onChallenge,
  onStreakInvite,
  onStreakAccept,
  onStreakEnd,
  onView,
  onRemove,
  onBlock,
  onReport,
  'data-testid': testId,
}: FriendRowProps) {
  const { t, format } = useLocale();
  const [blockOpen, setBlockOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [streakEndOpen, setStreakEndOpen] = useState(false);
  const hasMenu = Boolean(
    onChallenge ||
    onStreakInvite ||
    onStreakAccept ||
    onStreakEnd ||
    onRemove ||
    onBlock ||
    onReport,
  );

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
        <UserAvatar avatarUrl={user.avatarUrl} name={user.name} handle={user.handle} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[0.9375rem] font-medium">@{user.handle}</p>
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
            <p className="text-muted-foreground truncate text-[0.8125rem]">{user.name}</p>
          )}
          {streak?.status === FriendStreakStatus.ACTIVE && (
            <p
              className="text-muted-foreground truncate text-[0.75rem]"
              data-testid={`streak-week-${user.userId}`}
            >
              {format(t.battle.streakWeek, {
                you: `${streak.thisWeek.you.done}/${streak.thisWeek.you.target}`,
                them: `${streak.thisWeek.them.done}/${streak.thisWeek.them.target}`,
              })}
            </p>
          )}
        </div>
      </button>
      {actions}
      {hasMenu && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-testid={`friend-menu-${user.userId}`}
              aria-label={format(t.social.menuAria, { handle: `@${user.handle}` })}
              className="text-muted-foreground hover:text-foreground flex size-9 items-center justify-center rounded-full transition-colors"
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onChallenge && (
              <DropdownMenuItem
                data-testid={`friend-challenge-${user.userId}`}
                disabled={Boolean(duelBlockedReason)}
                onClick={() => onChallenge(user.userId)}
              >
                <Swords className="h-4 w-4" aria-hidden="true" />
                {duelBlockedReason ?? t.battle.challenge}
              </DropdownMenuItem>
            )}
            {onStreakInvite && !streak && !streakPending && (
              <DropdownMenuItem
                data-testid={`friend-streak-invite-${user.userId}`}
                onClick={() => onStreakInvite(user.userId)}
              >
                <Flame className="h-4 w-4" aria-hidden="true" />
                {t.battle.startStreak}
              </DropdownMenuItem>
            )}
            {onStreakAccept && streakPending === 'incoming' && streak && (
              <DropdownMenuItem
                data-testid={`friend-streak-accept-${user.userId}`}
                onClick={() => onStreakAccept(streak.id)}
              >
                <Flame className="h-4 w-4" aria-hidden="true" />
                {t.battle.acceptStreak}
              </DropdownMenuItem>
            )}
            {onStreakEnd && streak && streakPending === null && (
              <DropdownMenuItem
                data-testid={`friend-streak-end-${user.userId}`}
                onClick={() => setStreakEndOpen(true)}
              >
                <Flame className="h-4 w-4" aria-hidden="true" />
                {t.battle.endStreak}
              </DropdownMenuItem>
            )}
            {onRemove && (
              <DropdownMenuItem
                data-testid={`friend-remove-${user.userId}`}
                onClick={() => setRemoveOpen(true)}
              >
                {t.social.removeFriend}
              </DropdownMenuItem>
            )}
            {onReport && (
              <DropdownMenuItem
                data-testid={`friend-report-${user.userId}`}
                onClick={() => onReport(user)}
              >
                {t.social.report}
              </DropdownMenuItem>
            )}
            {onBlock && (
              <DropdownMenuItem
                data-testid={`friend-block-${user.userId}`}
                onClick={() => setBlockOpen(true)}
                className="text-destructive"
              >
                {t.social.block}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {onRemove && (
        <ConfirmDestructiveDialog
          open={removeOpen}
          onOpenChange={setRemoveOpen}
          title={format(t.social.removeFriendTitle, { handle: `@${user.handle}` })}
          description={t.social.removeFriendBody}
          confirmLabel={t.common.remove}
          onConfirm={() => onRemove(user.userId)}
          testId="remove-friend-confirm"
        />
      )}
      {onBlock && (
        <ConfirmDestructiveDialog
          open={blockOpen}
          onOpenChange={setBlockOpen}
          title={format(t.social.blockTitle, { handle: `@${user.handle}` })}
          description={t.social.blockBody}
          confirmLabel={t.social.block}
          onConfirm={() => onBlock(user.userId)}
          testId="block-user-confirm"
        />
      )}
      {onStreakEnd && streak && (
        <ConfirmDestructiveDialog
          open={streakEndOpen}
          onOpenChange={setStreakEndOpen}
          title={format(t.battle.endStreakTitle, { handle: `@${user.handle}` })}
          description={t.battle.endStreakBody}
          confirmLabel={t.battle.endStreak}
          onConfirm={() => onStreakEnd(streak.id)}
          testId="end-streak-confirm"
        />
      )}
    </li>
  );
}
