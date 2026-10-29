'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Badge } from '@luki-fitti/ui/components/ui/badge';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { Input } from '@luki-fitti/ui/components/ui/input';
import { Switch } from '@luki-fitti/ui/components/ui/switch';
import { toast } from '@luki-fitti/ui/components/ui/sonner';
import {
  ADMIN_PERMISSIONS,
  ADMIN_PERMISSION_LABELS,
  AdminPermission,
  FEATURE_GRANTS,
  FEATURE_GRANT_LABELS,
  type FeatureGrant,
} from '@luki-fitti/common/enums';
import type { AdminUserDto } from '@luki-fitti/common/schemas';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/auth/auth-context';
import { useLocale } from '@/providers/i18n/locale-context';
import { AdminState } from './admin-shell';
import { useAdminResource } from './use-admin-resource';

const PAGE_SIZE = 25;

export function AdminUsers() {
  const { t, format, locale, bcp47 } = useLocale();
  const { user: me, refreshUser } = useAuth();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  const { data, setData, error, loading, reload } = useAdminResource(
    () => api.admin.listUsers({ search: search || undefined, page, limit: PAGE_SIZE }),
    `${search}|${page}`,
  );

  const date = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(bcp47, { day: 'numeric', month: 'short', year: 'numeric' })
      : t.admin.never;

  const update = async (
    target: AdminUserDto,
    patch: { permissions?: AdminPermission[]; featureGrants?: FeatureGrant[] },
  ) => {
    const key = `${target.id}`;
    setPending(key);
    const previous = data;
    // Optimistic update; reverted if the server rejects it.
    setData((d) =>
      d ? { ...d, items: d.items.map((u) => (u.id === target.id ? { ...u, ...patch } : u)) } : d,
    );
    try {
      await api.admin.updateUserAccess(target.id, patch);
      toast.success(t.admin.accessSaved);
      if (target.id === me?.id) void refreshUser();
    } catch (err) {
      setData(previous);
      toast.error(err instanceof Error ? err.message : t.admin.error);
    } finally {
      setPending(null);
    }
  };

  const toggle = <T extends string>(list: readonly T[], value: T, on: boolean): T[] =>
    on ? [...new Set([...list, value])] : list.filter((v) => v !== value);

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-6">
      <h1 className="text-[2.125rem] leading-tight font-bold">{t.admin.navUsers}</h1>

      <div className="relative max-w-md">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={t.admin.searchUsers}
          aria-label={t.admin.searchUsers}
          className="pl-10"
        />
      </div>

      {loading && !data ? (
        <AdminState />
      ) : error ? (
        <AdminState error={error} onRetry={reload} />
      ) : !data || data.items.length === 0 ? (
        <p className="text-muted-foreground py-10 text-center text-[0.9375rem]">
          {t.admin.noUsers}
        </p>
      ) : (
        <ul className="space-y-3" aria-busy={loading}>
          {data.items.map((u) => {
            const isMe = u.id === me?.id;
            return (
              <li key={u.id} className="bg-card space-y-4 rounded-[1.25rem] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-[1.0625rem] font-semibold">
                      <span className="truncate">{u.name || u.email}</span>
                      {isMe && <Badge variant="secondary">{t.admin.you}</Badge>}
                      {!u.emailVerified && <Badge variant="warning">{t.admin.unverified}</Badge>}
                    </p>
                    <p className="text-muted-foreground truncate text-[0.9375rem]">{u.email}</p>
                  </div>
                  <dl className="text-muted-foreground grid grid-cols-[auto_auto] gap-x-3 text-[0.8125rem]">
                    <dt>{t.admin.joined}</dt>
                    <dd className="text-foreground text-right">{date(u.createdAt)}</dd>
                    <dt>{t.admin.lastLogin}</dt>
                    <dd className="text-foreground text-right">{date(u.lastLoginAt)}</dd>
                  </dl>
                </div>
                <p className="text-muted-foreground text-[0.8125rem] tabular-nums">
                  {format(t.admin.activitySummary, {
                    sessions: u.completedSessions,
                    meals: u.mealEntries,
                    runs: u.aiRunsLast30Days,
                  })}
                </p>

                <div className="grid gap-4 sm:grid-cols-2">
                  <fieldset className="space-y-1">
                    <legend className="text-muted-foreground mb-1 text-[0.8125rem] font-semibold">
                      {t.admin.features}
                    </legend>
                    {FEATURE_GRANTS.map((grant) => {
                      const id = `grant-${u.id}-${grant}`;
                      return (
                        <label
                          key={grant}
                          htmlFor={id}
                          className="flex min-h-11 items-center justify-between gap-3 text-[0.9375rem]"
                        >
                          {FEATURE_GRANT_LABELS[grant][locale]}
                          <Switch
                            id={id}
                            checked={u.featureGrants.includes(grant)}
                            disabled={pending === u.id}
                            onCheckedChange={(on) =>
                              void update(u, { featureGrants: toggle(u.featureGrants, grant, on) })
                            }
                          />
                        </label>
                      );
                    })}
                  </fieldset>
                  <fieldset className="space-y-1">
                    <legend className="text-muted-foreground mb-1 text-[0.8125rem] font-semibold">
                      {t.admin.permissions}
                    </legend>
                    {ADMIN_PERMISSIONS.map((permission) => {
                      const id = `perm-${u.id}-${permission}`;
                      // The API refuses removing your own user management; reflect that here.
                      const locked = isMe && permission === AdminPermission.USERS_MANAGE;
                      return (
                        <label
                          key={permission}
                          htmlFor={id}
                          className="flex min-h-11 items-center justify-between gap-3 text-[0.9375rem]"
                        >
                          {ADMIN_PERMISSION_LABELS[permission][locale]}
                          <Switch
                            id={id}
                            checked={u.permissions.includes(permission)}
                            disabled={pending === u.id || locked}
                            onCheckedChange={(on) =>
                              void update(u, { permissions: toggle(u.permissions, permission, on) })
                            }
                          />
                        </label>
                      );
                    })}
                  </fieldset>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {data && pages > 1 && (
        <nav
          className="flex items-center justify-between gap-3"
          aria-label={format(t.admin.page, { page, pages })}
        >
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            {t.admin.previous}
          </Button>
          <span className="text-muted-foreground text-[0.8125rem]">
            {format(t.admin.page, { page, pages })}
          </span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            {t.admin.next}
          </Button>
        </nav>
      )}
    </div>
  );
}
