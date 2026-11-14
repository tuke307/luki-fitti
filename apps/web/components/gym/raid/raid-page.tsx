'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { RaidDetailDto } from '@luki-fitti/common/schemas';
import { useLocale } from '@/providers/i18n/locale-context';
import { raidsApi } from '@/lib/social/social-api';
import { MobileSheet } from '../mobile-sheet';
import { UserAvatar } from '../social/user-avatar';
import { BossCanvas, type BossHit } from './boss-canvas';
import { RaidHpBar, bossBySlug } from './raid-card';

const FEED_POLL_MS = 20_000;

/** Full raid sheet: big boss, HP bar, weak spots, top dealers, your rank, live feed. */
export function RaidPage({
  raidId,
  onOpenChange,
}: {
  raidId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, locale, format } = useLocale();
  const [detailFor, setDetailFor] = useState<{ id: string; data: RaidDetailDto } | null>(null);
  const [hit, setHit] = useState<BossHit | null>(null);
  const hitSeq = useRef(0);
  const seenHits = useRef<Set<string>>(new Set());
  const detail = raidId !== null && detailFor?.id === raidId ? detailFor.data : null;

  useEffect(() => {
    if (!raidId) {
      setDetailFor(null);
      seenHits.current.clear();
      return;
    }
    const id = raidId;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await raidsApi.detail(id);
        if (cancelled || !res.data) return;
        setDetailFor({ id, data: res.data });
      } catch {
        /* keep last state */
      }
    };
    const poll = async () => {
      try {
        const res = await raidsApi.feed(id);
        if (cancelled || !res.data) return;
        for (const item of res.data.items) {
          const key = `${item.card.userId}:${item.at}`;
          if (!seenHits.current.has(key)) {
            seenHits.current.add(key);
            if (seenHits.current.size > res.data.items.length) {
              // only animate hits that arrive after the first poll
              setHit({ id: (hitSeq.current += 1), damage: item.damage });
            }
          }
        }
      } catch {
        /* ignore */
      }
    };
    void load();
    void poll();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void load();
        void poll();
      }
    }, FEED_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [raidId]);

  // feed items for display (re-fetched whenever a new hit animates)
  const [hits, setHits] = useState<Awaited<ReturnType<typeof raidsApi.feed>>['data']>(null);
  useEffect(() => {
    if (!raidId) return;
    const id = raidId;
    void raidsApi.feed(id).then((res) => {
      if (res.data) setHits(res.data);
    });
  }, [raidId, hit]);

  const boss = detail ? bossBySlug(detail.bossSlug) : null;
  const name = boss ? (locale === 'de' ? boss.name.de : boss.name.en) : '…';

  return (
    <MobileSheet
      open={raidId !== null}
      onOpenChange={onOpenChange}
      title={name}
      hideCancel={false}
      data-testid="raid-page"
    >
      {detail && boss ? (
        <div className="space-y-4 pb-4">
          <BossCanvas
            boss={boss}
            state={
              detail.status === 'DEFEATED'
                ? 'defeated'
                : detail.status === 'ESCAPED'
                  ? 'escaped'
                  : 'idle'
            }
            phase={detail.phase}
            hit={hit}
            label={name}
            className="mx-auto aspect-square w-full max-w-[320px]"
          />
          <div>
            <RaidHpBar damage={detail.damage} maxHp={detail.maxHp} />
            <div className="text-muted-foreground mt-1 flex justify-between text-[0.75rem]">
              <span>
                {Math.max(0, detail.maxHp - detail.damage).toLocaleString()} /{' '}
                {detail.maxHp.toLocaleString()} HP
              </span>
              {detail.phase > 0 && (
                <span>{t.raid.phaseLabel.replace('{phase}', String(detail.phase))}</span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {boss.weakTo.map((spot) => (
              <span
                key={spot}
                className="bg-secondary text-muted-foreground rounded-full px-2 py-0.5 text-[0.6875rem] font-medium"
              >
                {spot.replace(/_/g, ' ').toLowerCase()}
              </span>
            ))}
          </div>

          <div className="bg-secondary/50 rounded-xl p-3 text-center">
            <p className="text-[0.9375rem] font-semibold">
              {t.raid.yourDamage.replace('{points}', detail.you.damage.toLocaleString())}
              {detail.you.rank !== null && (
                <span className="text-muted-foreground">
                  {' '}
                  · {t.raid.yourRank.replace('{rank}', String(detail.you.rank))}
                </span>
              )}
            </p>
          </div>

          {detail.top.length > 0 && (
            <div>
              <h3 className="text-muted-foreground px-1 pb-1 text-[0.8125rem] font-medium tracking-wide uppercase">
                {t.raid.topDealers}
              </h3>
              <ul className="bg-card divide-border/60 divide-y rounded-xl">
                {detail.top.slice(0, 5).map((row) => (
                  <li key={row.card.userId} className="flex items-center gap-3 px-3 py-2">
                    <span className="text-muted-foreground w-6 text-[0.8125rem]">#{row.rank}</span>
                    <UserAvatar
                      avatarUrl={row.card.avatarUrl}
                      name={row.card.name}
                      handle={row.card.handle}
                      className="size-7"
                    />
                    <span className="flex-1 truncate text-[0.875rem] font-medium">
                      @{row.card.handle}
                    </span>
                    <span className="text-[0.875rem] font-semibold">
                      {row.damage.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h3 className="text-muted-foreground px-1 pb-1 text-[0.8125rem] font-medium tracking-wide uppercase">
              {t.raid.feedTitle}
            </h3>
            {hits && hits.items.length > 0 ? (
              <ul className="bg-card divide-border/60 divide-y rounded-xl">
                {hits.items.map((item) => (
                  <li
                    key={`${item.card.userId}:${item.at}`}
                    className="flex items-center gap-3 px-3 py-2"
                  >
                    <UserAvatar
                      avatarUrl={item.card.avatarUrl}
                      name={item.card.name}
                      handle={item.card.handle}
                      className="size-7"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.875rem] font-medium">@{item.card.handle}</p>
                      {item.topExercise && (
                        <p className="text-muted-foreground truncate text-[0.75rem]">
                          {item.topExercise}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-[0.875rem] font-semibold">
                        -{item.damage.toLocaleString()}
                      </p>
                      {item.weakSpotDamage > 0 && (
                        <p className="text-primary text-[0.6875rem]">
                          {format(t.raid.feedWeak, { points: item.weakSpotDamage })}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground px-1 text-[0.875rem]">{t.raid.feedEmpty}</p>
            )}
          </div>
        </div>
      ) : null}
    </MobileSheet>
  );
}
