'use client';

import React, { useState } from 'react';
import { RaidDifficulty, SquadRole } from '@luki-fitti/common/enums';
import type {
  FriendListsDto,
  RaidBossDto,
  SquadDto,
  SquadListDto,
} from '@luki-fitti/common/schemas';
import { RAID_BOSSES } from '@luki-fitti/common/raid';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { Input } from '@luki-fitti/ui/components/ui/input';
import { useLocale } from '@/providers/i18n/locale-context';
import { squadsApi, raidsApi } from '@/lib/social/social-api';
import { UserAvatar } from '../social/user-avatar';
import { MobileSheet } from '../mobile-sheet';

type Action = (fn: () => Promise<unknown>) => void;

/** Squads block on the Social tab: my squads, invites and the create/start-raid flows. */
export function SquadsCard({
  data,
  friends,
  onAction,
}: {
  data: SquadListDto;
  friends: FriendListsDto | null;
  onAction: Action;
}) {
  const { t, locale } = useLocale();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [manage, setManage] = useState<SquadDto | null>(null);
  const [bosses, setBosses] = useState<RaidBossDto[] | null>(null);
  const [raidSquad, setRaidSquad] = useState<SquadDto | null>(null);
  const [bossSlug, setBossSlug] = useState('');
  const [difficulty, setDifficulty] = useState<RaidDifficulty>(RaidDifficulty.NORMAL);

  const openRaidPicker = async (squad: SquadDto) => {
    setRaidSquad(squad);
    if (!bosses) {
      const res = await raidsApi.bosses().catch(() => null);
      if (res?.data) setBosses(res.data);
    }
  };

  return (
    <div className="bg-card rounded-[1.25rem] p-4" data-testid="squads-card">
      <div className="flex items-center justify-between">
        <h3 className="text-[0.9375rem] font-semibold">{t.raid.squadsTitle}</h3>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setCreateOpen(true)}
          data-testid="squad-create-open"
        >
          {t.raid.createSquad}
        </Button>
      </div>

      {data.invites.length > 0 && (
        <ul className="divide-border/60 divide-y">
          {data.invites.map((inv) => (
            <li
              key={inv.id}
              className="flex items-center gap-3 py-2"
              data-testid={`squad-invite-${inv.squadId}`}
            >
              <UserAvatar
                avatarUrl={inv.invitedBy.avatarUrl}
                name={inv.invitedBy.name}
                handle={inv.invitedBy.handle}
                className="size-7"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.875rem] font-medium">{inv.squadName}</p>
                <p className="text-muted-foreground text-[0.75rem]">
                  {t.raid.invitedBy.replace('{handle}', `@${inv.invitedBy.handle}`)}
                </p>
              </div>
              <Button
                size="sm"
                data-testid={`squad-accept-${inv.squadId}`}
                onClick={() => void onAction(() => squadsApi.acceptInvite(inv.squadId))}
              >
                {t.raid.accept}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void onAction(() => squadsApi.declineInvite(inv.squadId))}
              >
                {t.raid.decline}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {data.squads.length === 0 && data.invites.length === 0 && (
        <p className="text-muted-foreground pt-2 text-[0.875rem]">{t.raid.squadsEmpty}</p>
      )}

      <ul className="divide-border/60 divide-y">
        {data.squads.map((squad) => (
          <li
            key={squad.id}
            className="flex items-center gap-3 py-2"
            data-testid={`squad-${squad.id}`}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.875rem] font-medium">
                {squad.name}
                {squad.role === SquadRole.OWNER && (
                  <span className="text-muted-foreground ml-2 text-[0.6875rem] font-normal uppercase">
                    {t.raid.ownerBadge}
                  </span>
                )}
              </p>
              <p className="text-muted-foreground text-[0.75rem]">
                {t.raid.members.replace('{count}', String(squad.members.length))}
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setManage(squad)}
              data-testid={`squad-manage-${squad.id}`}
            >
              {t.raid.rename}
            </Button>
            <Button
              size="sm"
              onClick={() => void openRaidPicker(squad)}
              disabled={squad.members.length < 2}
              data-testid={`squad-startraid-${squad.id}`}
            >
              {t.raid.startRaid}
            </Button>
          </li>
        ))}
      </ul>

      {/* create squad */}
      <MobileSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        title={t.raid.createSquad}
        confirm={{
          label: t.raid.createSquad,
          testId: 'squad-create-submit',
          disabled: name.trim().length === 0,
          onConfirm: () =>
            void onAction(async () => {
              await squadsApi.create(name.trim());
              setCreateOpen(false);
              setName('');
            }),
        }}
      >
        <div className="p-1 pb-4">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.raid.squadNamePlaceholder}
            maxLength={30}
            data-testid="squad-name-input"
          />
        </div>
      </MobileSheet>

      {/* manage: rename, invite friends, kick, leave */}
      <MobileSheet
        open={manage !== null}
        onOpenChange={() => setManage(null)}
        title={manage?.name ?? ''}
      >
        {manage && (
          <div className="space-y-4 p-1 pb-4">
            {manage.role === SquadRole.OWNER && (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const input = e.currentTarget.elements.namedItem('squadName') as HTMLInputElement;
                  void onAction(async () => {
                    await squadsApi.rename(manage.id, input.value.trim());
                    setManage(null);
                  });
                }}
              >
                <Input name="squadName" defaultValue={manage.name} maxLength={30} />
                <Button type="submit" size="sm">
                  {t.raid.rename}
                </Button>
              </form>
            )}
            <ul className="divide-border/60 divide-y">
              {manage.members.map((m) => (
                <li key={m.card.userId} className="flex items-center gap-3 py-2">
                  <UserAvatar
                    avatarUrl={m.card.avatarUrl}
                    name={m.card.name}
                    handle={m.card.handle}
                    className="size-7"
                  />
                  <span className="flex-1 truncate text-[0.875rem]">@{m.card.handle}</span>
                  {m.role === SquadRole.OWNER ? (
                    <span className="text-muted-foreground text-[0.6875rem] uppercase">
                      {t.raid.ownerBadge}
                    </span>
                  ) : (
                    manage.role === SquadRole.OWNER && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          void onAction(async () => {
                            await squadsApi.kick(manage.id, m.card.userId);
                            setManage(null);
                          })
                        }
                      >
                        {t.raid.kick}
                      </Button>
                    )
                  )}
                </li>
              ))}
            </ul>
            {friends && friends.friends.length > 0 && manage.role === SquadRole.OWNER && (
              <div>
                <p className="text-muted-foreground px-1 pb-1 text-[0.75rem] uppercase">
                  {t.raid.inviteAction}
                </p>
                <ul className="divide-border/60 divide-y">
                  {friends.friends
                    .filter((f) => !manage.members.some((m) => m.card.userId === f.userId))
                    .map((f) => (
                      <li key={f.userId} className="flex items-center gap-3 py-2">
                        <UserAvatar
                          avatarUrl={f.avatarUrl}
                          name={f.name}
                          handle={f.handle}
                          className="size-7"
                        />
                        <span className="flex-1 truncate text-[0.875rem]">@{f.handle}</span>
                        <Button
                          size="sm"
                          variant="secondary"
                          data-testid={`squad-invite-${f.userId}`}
                          onClick={() => void onAction(() => squadsApi.invite(manage.id, f.userId))}
                        >
                          {t.raid.inviteAction}
                        </Button>
                      </li>
                    ))}
                </ul>
              </div>
            )}
            <Button
              variant="secondary"
              className="w-full"
              onClick={() =>
                void onAction(async () => {
                  await squadsApi.leave(manage.id);
                  setManage(null);
                })
              }
            >
              {t.raid.leave}
            </Button>
          </div>
        )}
      </MobileSheet>

      {/* boss picker + difficulty */}
      <MobileSheet
        open={raidSquad !== null}
        onOpenChange={() => setRaidSquad(null)}
        title={t.raid.pickBoss}
        confirm={{
          label: t.raid.startRaid,
          testId: 'squad-startraid-submit',
          disabled: !bossSlug,
          onConfirm: () =>
            void onAction(async () => {
              if (!raidSquad || !bossSlug) return;
              await squadsApi.startRaid(raidSquad.id, bossSlug, difficulty);
              setRaidSquad(null);
              setBossSlug('');
            }),
        }}
      >
        <div className="space-y-3 p-1 pb-4">
          <ul className="grid grid-cols-2 gap-2">
            {(bosses ?? RAID_BOSSES).map((b) => (
              <li key={b.slug}>
                <button
                  type="button"
                  onClick={() => setBossSlug(b.slug)}
                  className={`w-full rounded-xl border px-3 py-2 text-left text-[0.875rem] font-medium ${
                    bossSlug === b.slug ? 'border-primary bg-secondary' : 'border-border'
                  }`}
                  data-testid={`boss-pick-${b.slug}`}
                >
                  {locale === 'de' ? b.name.de : b.name.en}
                </button>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground px-1 text-[0.75rem] uppercase">
            {t.raid.difficultyLabel}
          </p>
          <div className="flex gap-2">
            {([RaidDifficulty.NORMAL, RaidDifficulty.HARD, RaidDifficulty.HEROIC] as const).map(
              (d) => (
                <Button
                  key={d}
                  size="sm"
                  variant={difficulty === d ? 'default' : 'secondary'}
                  onClick={() => setDifficulty(d)}
                  data-testid={`difficulty-${d}`}
                >
                  {t.raid[`diff${d}` as keyof typeof t.raid]}
                </Button>
              ),
            )}
          </div>
        </div>
      </MobileSheet>
    </div>
  );
}
