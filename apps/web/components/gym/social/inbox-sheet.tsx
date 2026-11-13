'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { NotificationKind } from '@luki-fitti/common/enums';
import type { NotificationDto } from '@luki-fitti/common/schemas';
import { notificationsApi } from '@/lib/social/social-api';
import { useLocale } from '@/providers/i18n/locale-context';
import { MobileSheet } from '../mobile-sheet';
import { UserAvatar } from './user-avatar';

function textFor(
  n: NotificationDto,
  t: ReturnType<typeof useLocale>['t'],
  format: (tpl: string, p: Record<string, string | number>) => string,
): string {
  const actor = n.actor ? `@${n.actor.handle}` : '';
  switch (n.kind) {
    case NotificationKind.FRIEND_REQUEST:
      return format(t.social.kindFriendRequest, { actor });
    case NotificationKind.FRIEND_ACCEPTED:
      return format(t.social.kindFriendAccepted, { actor });
    default:
      return '';
  }
}

/**
 * Inbox sheet: cursor-paged `/notifications`; everything is marked read when
 * the sheet opens (the badge clears when it closes).
 */
export function InboxSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, format, bcp47 } = useLocale();
  // Loaded pages are keyed by the open they belong to so reopening the sheet
  // never shows the previous session's rows while refetching.
  const [openKey, setOpenKey] = useState(0);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setOpenKey((k) => k + 1);
  }
  const [list, setList] = useState<{
    seq: number;
    items: NotificationDto[];
    nextCursor: string | null;
  } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const items = list && list.seq === openKey ? list.items : [];
  const nextCursor = list && list.seq === openKey ? list.nextCursor : null;

  useEffect(() => {
    if (!open) return;
    const seq = openKey;
    let cancelled = false;
    notificationsApi
      .list(null, 20)
      .then((res) => {
        if (cancelled || !res.data) return;
        setList({ seq, items: res.data.items, nextCursor: res.data.nextCursor });
      })
      .catch(() => undefined);
    void notificationsApi.markRead(true).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, openKey]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const res = await notificationsApi.list(nextCursor, 20);
      if (res.data) {
        const cursor = res.data.nextCursor;
        setList((current) =>
          current
            ? { ...current, items: [...current.items, ...res.data!.items], nextCursor: cursor }
            : current,
        );
      }
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <MobileSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t.social.inboxTitle}
      hideCancel
      confirm={{ label: t.common.done, onConfirm: () => onOpenChange(false) }}
      data-testid="inbox-sheet"
    >
      <ul className="divide-border/60 divide-y" data-testid="inbox-list">
        {items.length === 0 && (
          <li className="text-muted-foreground py-8 text-center text-[0.9375rem]">
            {t.social.inboxEmpty}
          </li>
        )}
        {items.map((n) => (
          <li
            key={n.id}
            className="flex items-center gap-3 py-3"
            data-testid={`inbox-item-${n.id}`}
          >
            <UserAvatar
              avatarUrl={n.actor?.avatarUrl}
              name={n.actor?.name}
              handle={n.actor?.handle}
            />
            <div className="min-w-0 flex-1">
              <p className={`text-[0.9375rem] ${n.readAt ? 'text-muted-foreground' : ''}`}>
                {textFor(n, t, format)}
              </p>
              <p className="text-muted-foreground text-[0.75rem]">
                {new Date(n.createdAt).toLocaleString(bcp47, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </p>
            </div>
            {!n.readAt && <span className="bg-primary size-2 shrink-0 rounded-full" />}
          </li>
        ))}
      </ul>
      {nextCursor && (
        <Button
          type="button"
          variant="secondary"
          className="mt-3 w-full"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          data-testid="inbox-load-more"
        >
          {t.social.inboxLoadMore}
        </Button>
      )}
    </MobileSheet>
  );
}
