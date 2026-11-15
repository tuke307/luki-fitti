'use client';

import React, { useEffect, useState } from 'react';
import { ChevronRight, Flame, Shield, Swords, Trophy } from 'lucide-react';
import { LeagueStage } from '@luki-fitti/common/enums';
import { raidBossName } from '@luki-fitti/common/push-messages';
import type {
  DuelListDto,
  LeagueCurrentDto,
  LeagueFriendRowDto,
  RaidListDto,
  StreakListDto,
  TrophyListDto,
} from '@luki-fitti/common/schemas';
import { useLocale } from '@/providers/i18n/locale-context';
import { trophiesApi } from '@/lib/social/social-api';
import { arenaName } from '@/lib/social/arena-name';
import { ArenaBadge } from './arena-badge';

function CompactRow({
  icon,
  title,
  sub,
  onOpen,
  testId,
}: {
  icon: React.ReactNode;
  title: string;
  sub?: React.ReactNode;
  onOpen: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid={testId}
      className="bg-card hover:bg-secondary/30 flex w-full items-center gap-3 rounded-[1.25rem] p-4 text-left transition-colors"
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.9375rem] font-medium">{title}</span>
        {sub ? (
          <span className="text-muted-foreground mt-0.5 block text-[0.8125rem]">{sub}</span>
        ) : null}
      </span>
      <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" aria-hidden="true" />
    </button>
  );
}

/** "{arena} · #{rank} · {n} to promotion" — or the friends board in FRIENDS weeks. */
export function LeagueCompactCard({
  current,
  friendsEntries,
  onOpen,
}: {
  current: LeagueCurrentDto;
  friendsEntries: LeagueFriendRowDto[] | null;
  onOpen: () => void;
}) {
  const { t, format } = useLocale();

  if (current.stage === LeagueStage.FRIENDS || !current.cohort) {
    const rank = friendsEntries?.find((e) => e.isSelf)?.rank ?? null;
    return (
      <CompactRow
        testId="hub-league-card"
        icon={<ArenaBadge arena={current.arena} size={32} />}
        title={
          rank !== null ? `${t.social.friendsLeaderboard} · #${rank}` : t.social.friendsLeaderboard
        }
        onOpen={onOpen}
      />
    );
  }

  const self = current.cohort.members.find((m) => m.isSelf);
  const toPromote = self ? self.rank - current.cohort.promoteCount : 0;
  const title = self
    ? `${arenaName(t, current.arena)} · #${self.rank}`
    : arenaName(t, current.arena);
  return (
    <CompactRow
      testId="hub-league-card"
      icon={<ArenaBadge arena={current.arena} size={32} />}
      title={title}
      sub={toPromote > 0 ? format(t.social.toPromotion, { n: toPromote }) : undefined}
      onOpen={onOpen}
    />
  );
}

/**
 * Best active duel, else the waiting-challenges count, else the "challenge a
 * friend" call to action.
 */
export function DuelsCompactCard({
  data,
  onOpen,
  onChallenge,
}: {
  data: DuelListDto;
  onOpen: () => void;
  onChallenge: () => void;
}) {
  const { t, format } = useLocale();
  const icon = <Swords className="text-muted-foreground h-5 w-5" aria-hidden="true" />;

  const best = data.active[0];
  if (best) {
    const days =
      best.daysLeft !== null ? ` · ${format(t.battle.daysLeft, { days: best.daysLeft })}` : '';
    return (
      <CompactRow
        testId="hub-duels-card"
        icon={icon}
        title={`vs @${best.opponent.username} · ${best.you}–${best.them}${days}`}
        onOpen={onOpen}
      />
    );
  }
  const waiting = data.incoming.length + data.outgoing.length;
  if (waiting > 0) {
    return (
      <CompactRow
        testId="hub-duels-card"
        icon={icon}
        title={format(t.social.challengesWaiting, { n: waiting })}
        onOpen={onOpen}
      />
    );
  }
  return (
    <CompactRow
      testId="hub-duels-card"
      icon={icon}
      title={t.social.challengeAFriend}
      onOpen={onChallenge}
    />
  );
}

/** Community boss name + HP bar + own damage; squad raid count appended. */
export function RaidsCompactCard({ raids, onOpen }: { raids: RaidListDto; onOpen: () => void }) {
  const { t, format, locale } = useLocale();
  const community = raids.community;
  if (!community) return null;

  const hpPct =
    community.maxHp > 0 ? Math.max(0, Math.min(1, 1 - community.damage / community.maxHp)) : 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="hub-raids-card"
      className="bg-card hover:bg-secondary/30 w-full rounded-[1.25rem] p-4 text-left transition-colors"
    >
      <div className="flex items-center gap-3">
        <Shield className="text-muted-foreground h-5 w-5 shrink-0" aria-hidden="true" />
        <p className="min-w-0 flex-1 truncate text-[0.9375rem] font-medium">
          {raidBossName(community.bossSlug, locale)}
          {raids.squads.length > 0 &&
            ` · ${format(t.social.squadRaids, { k: raids.squads.length })}`}
        </p>
        <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" aria-hidden="true" />
      </div>
      <div
        className="bg-secondary mt-2.5 h-1.5 w-full overflow-hidden rounded-full"
        role="img"
        aria-label={`${community.damage}/${community.maxHp}`}
      >
        <div className="bg-destructive h-full" style={{ width: `${hpPct * 100}%` }} />
      </div>
      <p className="text-muted-foreground mt-1.5 text-[0.8125rem]">
        {format(t.social.damageLine, { n: community.yourDamage })}
      </p>
    </button>
  );
}

/** "{n} active · longest {m} weeks" or the start-a-streak call to action. */
export function StreaksCompactCard({
  streaks,
  onOpen,
}: {
  streaks: StreakListDto;
  onOpen: () => void;
}) {
  const { t, format } = useLocale();
  const icon = <Flame className="text-muted-foreground h-5 w-5" aria-hidden="true" />;
  const longest = streaks.active.reduce((m, s) => Math.max(m, s.longest), 0);
  return (
    <CompactRow
      testId="hub-streaks-card"
      icon={icon}
      title={
        streaks.active.length > 0
          ? format(t.social.streaksLine, { n: streaks.active.length, m: longest })
          : t.social.startStreakCta
      }
      onOpen={onOpen}
    />
  );
}

/** Trophy count plus the latest three kinds; opens the Trophies page. */
export function TrophyRow({ userId, onOpen }: { userId: string; onOpen: () => void }) {
  const { t } = useLocale();
  const [list, setList] = useState<TrophyListDto | null>(null);

  useEffect(() => {
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

  const total = Object.values(list?.counts ?? {}).reduce((sum, n) => sum + (n ?? 0), 0);
  const latestKinds = (list?.items ?? [])
    .slice(0, 3)
    .map((i) => i.kind)
    .filter((k, i, all) => all.indexOf(k) === i);

  return (
    <CompactRow
      testId="hub-trophies-card"
      icon={<Trophy className="h-5 w-5 text-amber-500" aria-hidden="true" />}
      title={`${t.battle.trophiesTitle}${total > 0 ? ` · ${total}` : ''}`}
      sub={
        latestKinds.length > 0 ? (
          <span className="flex gap-1 pt-0.5">
            {latestKinds.map((kind) => (
              <Trophy key={kind} className="h-3.5 w-3.5 text-amber-500" aria-label={kind} />
            ))}
          </span>
        ) : undefined
      }
      onOpen={onOpen}
    />
  );
}
