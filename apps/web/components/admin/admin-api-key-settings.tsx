'use client';

import { useState } from 'react';
import { Switch } from '@luki-fitti/ui/components/ui/switch';
import { toast } from '@luki-fitti/ui/components/ui/sonner';
import type { UpdateApiKeysSettingsDto } from '@luki-fitti/common/schemas';
import { api } from '@/lib/api';
import { useLocale } from '@/providers/i18n/locale-context';
import { AdminState } from './admin-shell';
import { useAdminResource } from './use-admin-resource';

export function AdminApiKeySettings() {
  const { t } = useLocale();
  const settings = useAdminResource(() => api.admin.getApiKeySettings());
  const [busy, setBusy] = useState(false);

  const save = async (patch: UpdateApiKeysSettingsDto) => {
    setBusy(true);
    try {
      const res = await api.admin.updateApiKeySettings(patch);
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

  if (settings.loading) return <AdminState />;
  if (settings.error || !settings.data)
    return <AdminState error={settings.error} onRetry={settings.reload} />;

  return (
    <div className="space-y-6" data-testid="admin-api-key-settings">
      <div className="bg-card flex items-center justify-between gap-4 rounded-[1.25rem] p-4">
        <div>
          <p className="text-[0.9375rem] font-medium">{t.admin.apiKeysEnabledLabel}</p>
          <p className="text-muted-foreground text-[0.8125rem]">{t.admin.apiKeysSub}</p>
        </div>
        <Switch
          checked={settings.data.apiKeysEnabled}
          disabled={busy}
          onCheckedChange={(enabled) => void save({ apiKeysEnabled: enabled })}
          data-testid="api-keys-enabled-switch"
        />
      </div>
      <div className="bg-card flex items-center justify-between gap-4 rounded-[1.25rem] p-4">
        <div>
          <p className="text-[0.9375rem] font-medium">{t.admin.mcpEnabledLabel}</p>
          <p className="text-muted-foreground text-[0.8125rem]">{t.admin.mcpSub}</p>
        </div>
        <Switch
          checked={settings.data.mcpEnabled}
          disabled={busy}
          onCheckedChange={(enabled) => void save({ mcpEnabled: enabled })}
          data-testid="mcp-enabled-switch"
        />
      </div>
    </div>
  );
}
