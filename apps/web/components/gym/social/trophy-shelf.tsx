'use client';

import React, { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { TrophyKind } from '@luki-fitti/common/enums';
import type { TrophyListDto } from '@luki-fitti/common/schemas';
import { trophiesApi } from '@/lib/social/social-api';
import { useLocale } from '@/providers/i18n/locale-context';

function trophyKindLabel(t: ReturnType<typeof useLocale>['t'], kind: TrophyKind): string {
  switch (kind) {
    case TrophyKind.DUEL_WIN:
      return t.battle.trophyDuelWin;
    default:
      return kind;
  }
}

/** Grid of small trophy tiles (a count per kind) for profile sheets. */
export function TrophyShelf({ userId }: { userId: string | null }) {
  const { t } = useLocale();
  const [list, setList] = useState<TrophyListDto | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void trophiesApi
      .list(userId)
      .then((res) => {
        if (!cancelled && res.data) setList(res.data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!userId) return null;

  const kinds = (Object.keys(list?.counts ?? {}) as TrophyKind[]).filter(
    (k) => (list?.counts[k] ?? 0) > 0,
  );

  return (
    <div data-testid="trophy-shelf">
      <p className="text-muted-foreground mb-2 text-[0.8125rem] font-medium tracking-wide uppercase">
        {t.battle.trophiesTitle}
      </p>
      {list === null ? null : kinds.length === 0 ? (
        <p className="text-muted-foreground text-[0.8125rem]">{t.battle.trophiesEmpty}</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {kinds.map((kind) => (
            <div
              key={kind}
              className="bg-secondary/60 flex flex-col items-center gap-1 rounded-xl px-2 py-3 text-center"
              data-testid={`trophy-tile-${kind}`}
            >
              <span className="relative">
                <Trophy className="h-6 w-6 text-amber-500" aria-hidden="true" />
                <span className="bg-primary text-primary-foreground absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[0.625rem] font-bold">
                  {list!.counts[kind]}
                </span>
              </span>
              <span className="text-[0.75rem] leading-tight font-medium">
                {trophyKindLabel(t, kind)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
