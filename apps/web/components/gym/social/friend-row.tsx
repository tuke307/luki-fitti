'use client';

import React, { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@luki-fitti/ui/components/ui/dropdown-menu';
import { useLocale } from '@/providers/i18n/locale-context';
import type { SocialCardDto } from '@luki-fitti/common/schemas';
import { UserAvatar } from './user-avatar';
import { ConfirmDestructiveDialog } from '../confirm-destructive-dialog';

interface FriendRowProps {
  user: SocialCardDto;
  actions?: React.ReactNode;
  onRemove?: (userId: string) => void;
  onBlock?: (userId: string) => void;
  onReport?: (user: SocialCardDto) => void;
  'data-testid'?: string;
}

/**
 * One user row: avatar + @handle + inline actions + a ⋯ menu with
 * Remove friend / Block / Report (Block confirms destructively).
 */
export function FriendRow({
  user,
  actions,
  onRemove,
  onBlock,
  onReport,
  'data-testid': testId,
}: FriendRowProps) {
  const { t, format } = useLocale();
  const [blockOpen, setBlockOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const hasMenu = Boolean(onRemove || onBlock || onReport);

  return (
    <li
      className="flex items-center gap-3 px-4 py-2.5"
      data-testid={testId ?? `friend-row-${user.userId}`}
    >
      <UserAvatar avatarUrl={user.avatarUrl} name={user.name} handle={user.handle} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.9375rem] font-medium">@{user.handle}</p>
        {user.name && (
          <p className="text-muted-foreground truncate text-[0.8125rem]">{user.name}</p>
        )}
      </div>
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
    </li>
  );
}
