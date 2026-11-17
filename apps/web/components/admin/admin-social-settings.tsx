'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { Input } from '@luki-fitti/ui/components/ui/input';
import { Switch } from '@luki-fitti/ui/components/ui/switch';
import { toast } from '@luki-fitti/ui/components/ui/sonner';
import type { AdminUserDto } from '@luki-fitti/common/schemas';
import { api } from '@/lib/api';
import { adminSocialApi } from '@/lib/social/social-api';
import { useLocale } from '@/providers/i18n/locale-context';
import { AdminState } from './admin-shell';
import { useAdminResource } from './use-admin-resource';

export function AdminSocialSettings() {
  const { t } = useLocale();
  const settings = useAdminResource(() => adminSocialApi.settings());
  const [searchInput, setSearchInput] = useState('');
  const [result, setResult] = useState<{ query: string; items: AdminUserDto[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const betaIds = settings.data?.socialBetaUserIds ?? [];
  const candidates =
    result && result.query === searchInput.trim() && result.query.length >= 2 ? result.items : [];

  // Debounced user search for adding beta users.
  useEffect(() => {
    const q = searchInput.trim();
    if (q.length < 2) return;
    const timer = setTimeout(() => {
      void api.admin
        .listUsers({ search: q, page: 1, limit: 8 })
        .then((res) => setResult({ query: q, items: res.data?.items ?? [] }))
        .catch(() => setResult({ query: q, items: [] }));
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const save = async (patch: { socialEnabled?: boolean; socialBetaUserIds?: string[] }) => {
    setBusy(true);
    try {
      const res = await adminSocialApi.updateSettings(patch);
      if (res.data) {
        settings.setData(res.data);
        toast.success(t.admin.accessSaved);
      }
    } catch {
      toast.error(t.admin.error);
    } finally {
      setBusy(false);
    }
  };

  const addBetaUser = (user: AdminUserDto) => {
    if (betaIds.includes(user.id)) return;
    setSearchInput('');
    void save({ socialBetaUserIds: [...betaIds, user.id] });
  };

  const removeBetaUser = (id: string) => {
    void save({ socialBetaUserIds: betaIds.filter((b) => b !== id) });
  };

  if (settings.loading) return <AdminState />;
  if (settings.error || !settings.data)
    return <AdminState error={settings.error} onRetry={settings.reload} />;

  return (
    <div className="space-y-6" data-testid="admin-social-settings">
      <div className="bg-card flex items-center justify-between gap-4 rounded-[1.25rem] p-4">
        <div>
          <p className="text-[0.9375rem] font-medium">{t.admin.socialEnabledLabel}</p>
          <p className="text-muted-foreground text-[0.8125rem]">{t.admin.socialSub}</p>
        </div>
        <Switch
          checked={settings.data.socialEnabled}
          disabled={busy}
          onCheckedChange={(enabled) => void save({ socialEnabled: enabled })}
          data-testid="social-enabled-switch"
        />
      </div>

      <div className="bg-card space-y-3 rounded-[1.25rem] p-4">
        <p className="text-[0.9375rem] font-medium">{t.admin.betaListTitle}</p>
        <p className="text-muted-foreground text-[0.8125rem]">{t.admin.betaListHint}</p>
        <Input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={t.admin.searchUsers}
          aria-label={t.admin.searchUsers}
          data-testid="beta-user-search"
        />
        {candidates.length > 0 && (
          <ul className="divide-border divide-y">
            {candidates.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 py-2">
                <span className="truncate text-[0.9375rem]">
                  {u.name ? `${u.name} · ` : ''}
                  {u.email}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => addBetaUser(u)}
                  disabled={betaIds.includes(u.id)}
                >
                  {t.admin.betaAdd}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {betaIds.length > 0 ? (
          <ul className="divide-border divide-y" data-testid="beta-user-list">
            {betaIds.map((id) => (
              <li key={id} className="flex items-center justify-between gap-3 py-2">
                <span className="truncate font-mono text-[0.8125rem]">{id}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeBetaUser(id)}
                  aria-label={t.admin.betaRemoveAria}
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-[0.8125rem]">{t.admin.betaEmpty}</p>
        )}
      </div>
    </div>
  );
}
