'use client';

import React from 'react';
import type { SocialCardDto } from '@luki-fitti/common/schemas';
import { MobileSheet } from '../mobile-sheet';
import { UserAvatar } from './user-avatar';
import { TrophyShelf } from './trophy-shelf';

/** Read-only view of a friend's card plus their trophy shelf. */
export function FriendSheet({
  user,
  onOpenChange,
}: {
  user: SocialCardDto | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <MobileSheet
      open={user !== null}
      onOpenChange={onOpenChange}
      title={user ? `@${user.handle}` : '…'}
      hideCancel
      data-testid="friend-sheet"
    >
      {user && (
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <UserAvatar
              avatarUrl={user.avatarUrl}
              name={user.name}
              handle={user.handle}
              className="size-16"
            />
            <div className="min-w-0">
              <p className="truncate text-[1.0625rem] font-semibold">@{user.handle}</p>
              {user.name && (
                <p className="text-muted-foreground truncate text-[0.8125rem]">{user.name}</p>
              )}
            </div>
          </div>
          <TrophyShelf userId={user.userId} />
        </div>
      )}
    </MobileSheet>
  );
}
