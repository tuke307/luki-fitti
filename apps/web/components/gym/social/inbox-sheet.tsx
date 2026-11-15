'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { Flame, Shield, Swords, TrendingUp, Trophy, Users } from 'lucide-react';
import type { NotificationDto } from '@luki-fitti/common/schemas';
import {
  notificationCategoryOf,
  type NotificationCategoryId,
} from '@luki-fitti/common/notification-categories';
import { notificationsApi } from '@/lib/social/social-api';
import { parseOpenParam, type OpenTarget } from '@/lib/social/deep-link';
import { useLocale } from '@/providers/i18n/locale-context';
import { MobileSheet } from '../mobile-sheet';
import { UserAvatar } from './user-avatar';
import type { SocialSection } from './social-view';

const CATEGORY_ICONS: Record<NotificationCategoryId, typeof Users> = {
  friends: Users,
  nudges: TrendingUp,
  leagues: Trophy,
  duels: Swords,
  streaks: Flame,
  raids: Shield,
};

function CategoryIcon({ kind }: { kind: NotificationDto['kind'] }) {
  const Icon = CATEGORY_ICONS[notificationCategoryOf(kind).id];
  return (
    <span className="bg-secondary text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-full">
      <Icon className="size-4" aria-hidden="true" />
    </span>
  );
}

/**
 * Inbox sheet: cursor-paged `/notifications`; everything is marked read when
 * the sheet opens (the badge clears when it closes). Title/body come rendered
 * from the API in the UI locale; the client only picks the icon. Rows with a
 * `payload.url` deep-link into the matching social section.
 */
export function InboxSheet({
  open,
  onOpenChange,
  onNavigate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** In-tab navigation to a social section (`friends`, `duels`, …). */
  onNavigate?: (section: SocialSection) => void;
}) {
  const { t, bcp47, locale } = useLocale();
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
      .list(null, 20, locale)
      .then((res) => {
        if (cancelled || !res.data) return;
        setList({ seq, items: res.data.items, nextCursor: res.data.nextCursor });
      })
      .catch(() => undefined);
    void notificationsApi.markRead(true).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, openKey, locale]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const res = await notificationsApi.list(nextCursor, 20, locale);
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

  const openTarget = (n: NotificationDto) => {
    if (typeof n.payload.url !== 'string' || !onNavigate) return;
    const target: OpenTarget | null = parseOpenParam(`?open=${encodeURIComponent(n.payload.url)}`);
    if (target?.tab !== 'social') return;
    onOpenChange(false);
    onNavigate(target.section);
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
        {items.map((n) => {
          const tappable = typeof n.payload.url === 'string' && onNavigate;
          const row = (
            <>
              {n.actor ? (
                <UserAvatar
                  avatarUrl={n.actor.avatarUrl}
                  name={n.actor.name}
                  username={n.actor.username}
                />
              ) : (
                <CategoryIcon kind={n.kind} />
              )}
              <div className="min-w-0 flex-1">
                <p
                  className={`text-[0.9375rem] font-semibold ${n.readAt ? 'text-muted-foreground' : ''}`}
                >
                  {n.title}
                </p>
                <p className={`text-[0.8125rem] ${n.readAt ? 'text-muted-foreground' : ''}`}>
                  {n.body}
                </p>
                <p className="text-muted-foreground text-[0.75rem]">
                  {new Date(n.createdAt).toLocaleString(bcp47, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </p>
              </div>
              {!n.readAt && <span className="bg-primary size-2 shrink-0 rounded-full" />}
            </>
          );
          return (
            <li key={n.id} data-testid={`inbox-item-${n.id}`}>
              {tappable ? (
                <button
                  type="button"
                  className="hover:bg-secondary/50 -mx-4 flex w-[calc(100%+2rem)] items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors"
                  onClick={() => openTarget(n)}
                  data-testid={`inbox-open-${n.id}`}
                >
                  {row}
                </button>
              ) : (
                <div className="flex items-center gap-3 py-3">{row}</div>
              )}
            </li>
          );
        })}
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
