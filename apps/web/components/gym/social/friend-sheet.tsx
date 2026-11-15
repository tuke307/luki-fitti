'use client';

import React, { useState } from 'react';
import { Flame, Swords } from 'lucide-react';
import type { FriendStreakDto, SocialCardDto } from '@luki-fitti/common/schemas';
import { useLocale } from '@/providers/i18n/locale-context';
import { cn } from '@luki-fitti/ui/lib/utils';
import { MobileSheet } from '../mobile-sheet';
import { UserAvatar } from './user-avatar';
import { TrophyShelf } from './trophy-shelf';
import { ConfirmDestructiveDialog } from '../confirm-destructive-dialog';

export interface FriendActions {
  /** Open duel with this friend, or the reason a challenge is not possible. */
  duelBlockedReason?: string | null;
  streak?: FriendStreakDto | null;
  streakPending?: 'incoming' | 'outgoing' | null;
  onChallenge?: (userId: string) => void;
  onStreakInvite?: (userId: string) => void;
  onStreakAccept?: (streakId: string) => void;
  onStreakEnd?: (streakId: string) => void;
  onRemove?: (userId: string) => void;
  onBlock?: (userId: string) => void;
  onReport?: (user: SocialCardDto) => void;
}

function SheetAction({
  icon,
  label,
  disabled,
  destructive,
  onClick,
  testId,
}: {
  icon?: React.ReactNode;
  label: string;
  disabled?: boolean;
  destructive?: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      data-testid={testId}
      onClick={onClick}
      className={cn(
        'hover:bg-secondary/40 flex w-full items-center gap-3 px-1 py-2.5 text-left text-[0.9375rem] transition-colors disabled:opacity-50',
        destructive && 'text-destructive',
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

/**
 * Friend sheet: profile card, the actions that used to live in the row menu
 * (challenge, streak invite/accept/end, remove, block, report — destructive
 * ones confirm) and the friend's trophy shelf.
 */
export function FriendSheet({
  user,
  onOpenChange,
  actions,
}: {
  user: SocialCardDto | null;
  onOpenChange: (open: boolean) => void;
  actions?: FriendActions;
}) {
  const { t, format } = useLocale();
  const [blockOpen, setBlockOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [streakEndOpen, setStreakEndOpen] = useState(false);

  const a = actions ?? {};
  const streak = a.streak ?? null;
  const act = (fn?: () => void) => () => {
    fn?.();
    onOpenChange(false);
  };

  return (
    <MobileSheet
      open={user !== null}
      onOpenChange={onOpenChange}
      title={user ? `@${user.username}` : '…'}
      hideCancel
      data-testid="friend-sheet"
    >
      {user && (
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <UserAvatar
              avatarUrl={user.avatarUrl}
              name={user.name}
              username={user.username}
              className="size-16"
            />
            <div className="min-w-0">
              <p className="truncate text-[1.0625rem] font-semibold">@{user.username}</p>
              {user.name && (
                <p className="text-muted-foreground truncate text-[0.8125rem]">{user.name}</p>
              )}
            </div>
          </div>

          <div className="divide-border/60 divide-y">
            {a.onChallenge && (
              <SheetAction
                testId={`friend-challenge-${user.userId}`}
                icon={<Swords className="h-4 w-4" aria-hidden="true" />}
                label={a.duelBlockedReason ?? t.battle.challenge}
                disabled={Boolean(a.duelBlockedReason)}
                onClick={act(() => a.onChallenge?.(user.userId))}
              />
            )}
            {a.onStreakInvite && !streak && !a.streakPending && (
              <SheetAction
                testId={`friend-streak-invite-${user.userId}`}
                icon={<Flame className="h-4 w-4" aria-hidden="true" />}
                label={t.battle.startStreak}
                onClick={act(() => a.onStreakInvite?.(user.userId))}
              />
            )}
            {a.onStreakAccept && a.streakPending === 'incoming' && streak && (
              <SheetAction
                testId={`friend-streak-accept-${user.userId}`}
                icon={<Flame className="h-4 w-4" aria-hidden="true" />}
                label={t.battle.acceptStreak}
                onClick={act(() => a.onStreakAccept?.(streak.id))}
              />
            )}
            {a.onStreakEnd && streak && !a.streakPending && (
              <SheetAction
                testId={`friend-streak-end-${user.userId}`}
                icon={<Flame className="h-4 w-4" aria-hidden="true" />}
                label={t.battle.endStreak}
                onClick={() => setStreakEndOpen(true)}
              />
            )}
            {a.onRemove && (
              <SheetAction
                testId={`friend-remove-${user.userId}`}
                label={t.social.removeFriend}
                onClick={() => setRemoveOpen(true)}
              />
            )}
            {a.onReport && (
              <SheetAction
                testId={`friend-report-${user.userId}`}
                label={t.social.report}
                onClick={act(() => a.onReport?.(user))}
              />
            )}
            {a.onBlock && (
              <SheetAction
                testId={`friend-block-${user.userId}`}
                label={t.social.block}
                destructive
                onClick={() => setBlockOpen(true)}
              />
            )}
          </div>

          <TrophyShelf userId={user.userId} />
        </div>
      )}

      {user && a.onRemove && (
        <ConfirmDestructiveDialog
          open={removeOpen}
          onOpenChange={setRemoveOpen}
          title={format(t.social.removeFriendTitle, { username: `@${user.username}` })}
          description={t.social.removeFriendBody}
          confirmLabel={t.common.remove}
          onConfirm={act(() => a.onRemove?.(user.userId))}
          testId="remove-friend-confirm"
        />
      )}
      {user && a.onBlock && (
        <ConfirmDestructiveDialog
          open={blockOpen}
          onOpenChange={setBlockOpen}
          title={format(t.social.blockTitle, { username: `@${user.username}` })}
          description={t.social.blockBody}
          confirmLabel={t.social.block}
          onConfirm={act(() => a.onBlock?.(user.userId))}
          testId="block-user-confirm"
        />
      )}
      {user && a.onStreakEnd && streak && (
        <ConfirmDestructiveDialog
          open={streakEndOpen}
          onOpenChange={setStreakEndOpen}
          title={format(t.battle.endStreakTitle, { username: `@${user.username}` })}
          description={t.battle.endStreakBody}
          confirmLabel={t.battle.endStreak}
          onConfirm={act(() => a.onStreakEnd?.(streak.id))}
          testId="end-streak-confirm"
        />
      )}
    </MobileSheet>
  );
}
