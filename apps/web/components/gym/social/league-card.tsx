'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, History } from 'lucide-react';
import { Arena, LeagueOutcome, LeagueStage } from '@luki-fitti/common/enums';
import type {
  LeagueCurrentDto,
  LeagueFriendRowDto,
  LeagueHistoryEntryDto,
  LeagueMemberDto,
  LeaguePendingResultDto,
} from '@luki-fitti/common/schemas';
import { cn } from '@luki-fitti/ui/lib/utils';
import { leagueApi } from '@/lib/social/social-api';
import { useLocale } from '@/providers/i18n/locale-context';
import { UserAvatar } from './user-avatar';
import { ArenaBadge } from './arena-badge';
import type { TranslationDictionary } from '@/lib/i18n';

export function arenaName(t: TranslationDictionary, arena: Arena): string {
  const names: Record<Arena, string> = {
    [Arena.BRONZE]: t.league.arenaBronze,
    [Arena.SILVER]: t.league.arenaSilver,
    [Arena.GOLD]: t.league.arenaGold,
    [Arena.PLATINUM]: t.league.arenaPlatinum,
    [Arena.DIAMOND]: t.league.arenaDiamond,
    [Arena.OBSIDIAN]: t.league.arenaObsidian,
    [Arena.TITAN]: t.league.arenaTitan,
  };
  return names[arena] ?? arena;
}

function useCountdown(endsAt: string | undefined): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  if (!endsAt) return '';
  const ms = Math.max(0, Date.parse(endsAt) - now);
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (days > 0) return `${days} d ${hours} h`;
  if (hours > 0) return `${hours} h ${minutes} m`;
  return `${minutes} m`;
}

function LeaderboardRow({
  rank,
  card,
  points,
  isSelf,
  zone,
  showZoneEdge,
  bcp47,
}: {
  rank: number;
  card: { userId: string; handle: string; avatarUrl: string | null; name?: string | null };
  points: number;
  isSelf: boolean;
  zone?: 'PROMOTE' | 'SAFE' | 'DEMOTE';
  /** Draw the promote/demote boundary line above this row. */
  showZoneEdge?: boolean;
  bcp47: string;
}) {
  return (
    <li
      data-testid={`league-row-${card.userId}`}
      className={cn(
        'flex items-center gap-3 px-4 py-2.5',
        showZoneEdge && 'border-border border-t',
        zone === 'PROMOTE' && 'bg-emerald-500/10',
        zone === 'DEMOTE' && 'bg-red-500/10',
        isSelf && 'bg-secondary/60',
      )}
    >
      <span className="text-muted-foreground w-6 text-right text-[0.8125rem] tabular-nums">
        {rank}
      </span>
      <UserAvatar
        avatarUrl={card.avatarUrl}
        name={card.name}
        handle={card.handle}
        className="size-8"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.9375rem] font-medium">
          @{card.handle}
          {isSelf && <span className="text-muted-foreground ml-1.5 font-normal">·</span>}
        </p>
      </div>
      {zone === 'PROMOTE' && (
        <ChevronUp aria-label="promotion" className="h-4 w-4 text-emerald-500" />
      )}
      {zone === 'DEMOTE' && <ChevronDown aria-label="demotion" className="h-4 w-4 text-red-500" />}
      <span className="text-[0.9375rem] font-semibold tabular-nums">
        {points.toLocaleString(bcp47)}
      </span>
    </li>
  );
}

/**
 * League card on the Social tab. FRIENDS weeks show the friends leaderboard and
 * a note that arenas unlock with more active users; GLOBAL/ARENAS weeks show the
 * cohort with promotion/demote zones plus a League · Friends segment switch.
 */
export function LeagueCard({
  onPendingResult,
}: {
  onPendingResult: (result: LeaguePendingResultDto | null) => void;
}) {
  const { t, locale } = useLocale();
  const bcp47 = locale === 'de' ? 'de-DE' : 'en-GB';
  const [current, setCurrent] = useState<LeagueCurrentDto | null>(null);
  const [friends, setFriends] = useState<LeagueFriendRowDto[] | null>(null);
  const [board, setBoard] = useState<'league' | 'friends'>('league');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<LeagueHistoryEntryDto[] | null>(null);
  const countdown = useCountdown(current?.endsAt);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([leagueApi.current(), leagueApi.friends()]).then(([cur, fr]) => {
      if (cancelled) return;
      if (cur.data) {
        setCurrent(cur.data);
        onPendingResult(cur.data.pendingResult);
      }
      if (fr.data) setFriends(fr.data.entries);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!historyOpen || history !== null) return;
    let cancelled = false;
    void leagueApi.history().then((res) => {
      if (!cancelled && res.data) setHistory(res.data.entries);
    });
    return () => {
      cancelled = true;
    };
  }, [historyOpen, history]);

  const arena = current?.arena ?? Arena.BRONZE;
  const stage = current?.stage ?? LeagueStage.FRIENDS;
  const cohort = current?.cohort ?? null;

  const zoneEdges = useMemo(() => {
    if (!cohort) return { afterPromote: 0, beforeDemote: 0 };
    const promoteEnd = cohort.promoteCount;
    const demoteStart = cohort.members.length - cohort.demoteCount + 1;
    return { afterPromote: promoteEnd, beforeDemote: demoteStart };
  }, [cohort]);

  if (!current) return null;

  const showSegmented = stage !== LeagueStage.FRIENDS;

  return (
    <section className="bg-card rounded-[1.25rem]" data-testid="league-card">
      <div className="flex items-center gap-3 p-4 pb-3">
        <ArenaBadge arena={arena} size={36} />
        <div className="min-w-0 flex-1">
          <p className="text-[1.0625rem] font-semibold">{arenaName(t, arena)}</p>
          {countdown && (
            <p className="text-muted-foreground text-[0.8125rem]">
              {t.league.endsIn.replace('{time}', countdown)}
            </p>
          )}
        </div>
        {showSegmented && (
          <div
            role="tablist"
            aria-label={t.league.leagueTitle}
            className="bg-secondary flex rounded-full p-0.5"
          >
            {(['league', 'friends'] as const).map((option) => (
              <button
                key={option}
                role="tab"
                aria-selected={board === option}
                data-testid={`league-tab-${option}`}
                onClick={() => setBoard(option)}
                className={cn(
                  'h-7 rounded-full px-3 text-[0.8125rem] font-medium transition-colors',
                  board === option
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground',
                )}
              >
                {option === 'league' ? t.league.tabLeague : t.league.tabFriendsBoard}
              </button>
            ))}
          </div>
        )}
      </div>

      {stage === LeagueStage.FRIENDS || board === 'friends' ? (
        <>
          {stage === LeagueStage.FRIENDS && (
            <p className="text-muted-foreground px-4 pb-2 text-[0.8125rem]" data-testid="league-friends-note">
              {t.league.friendsNote.replace('{arena}', arenaName(t, arena))}
            </p>
          )}
          <ul className="divide-border/60 divide-y" data-testid="league-friends-board">
            {(friends ?? []).map((row) => (
              <LeaderboardRow
                key={row.card.userId}
                rank={row.rank}
                card={row.card}
                points={row.points}
                isSelf={row.isSelf}
                bcp47={bcp47}
              />
            ))}
            {friends !== null && friends.length === 0 && (
              <li className="text-muted-foreground px-4 py-6 text-center text-[0.9375rem]">
                {t.social.friendsEmpty}
              </li>
            )}
          </ul>
        </>
      ) : (
        <ul className="divide-border/60 divide-y" data-testid="league-cohort">
          {(cohort?.members ?? []).map((member: LeagueMemberDto) => (
            <LeaderboardRow
              key={member.card.userId}
              rank={member.rank}
              card={member.card}
              points={member.points}
              isSelf={member.isSelf}
              zone={member.zone}
              showZoneEdge={
                (zoneEdges.afterPromote > 0 && member.rank === zoneEdges.afterPromote + 1) ||
                member.rank === zoneEdges.beforeDemote
              }
              bcp47={bcp47}
            />
          ))}
          {cohort === null && (
            <li className="text-muted-foreground px-4 py-6 text-center text-[0.9375rem]">
              {t.league.notPlaced}
            </li>
          )}
        </ul>
      )}

      <button
        type="button"
        data-testid="league-history-toggle"
        onClick={() => setHistoryOpen((v) => !v)}
        className="text-muted-foreground hover:text-foreground flex w-full items-center gap-2 px-4 py-3 text-[0.8125rem] font-medium transition-colors"
      >
        <History className="h-4 w-4" aria-hidden="true" />
        {t.league.history}
      </button>
      {historyOpen && (
        <ul className="border-border divide-border/60 border-t divide-y" data-testid="league-history">
          {(history ?? []).map((entry) => (
            <li key={entry.weekKey} className="flex items-center gap-3 px-4 py-2.5">
              <ArenaBadge arena={entry.arena} size={22} />
              <span className="min-w-0 flex-1 text-[0.8125rem]">
                {t.league.historyWeek.replace(
                  '{date}',
                  new Date(`${entry.weekKey}T12:00:00Z`).toLocaleDateString(bcp47, {
                    day: 'numeric',
                    month: 'short',
                    timeZone: 'UTC',
                  }),
                )}
              </span>
              <span className="text-muted-foreground text-[0.8125rem]">
                {entry.outcome === LeagueOutcome.PROMOTED && t.league.outcomePromoted}
                {entry.outcome === LeagueOutcome.DEMOTED && t.league.outcomeDemoted}
                {(entry.outcome === LeagueOutcome.STAYED || entry.outcome === null) &&
                  t.league.outcomeStayed}
              </span>
              <span className="text-[0.8125rem] font-medium tabular-nums">
                #{entry.rank} · {entry.points.toLocaleString(bcp47)}
              </span>
            </li>
          ))}
          {history !== null && history.length === 0 && (
            <li className="text-muted-foreground px-4 py-4 text-center text-[0.8125rem]">
              {t.league.historyEmpty}
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
