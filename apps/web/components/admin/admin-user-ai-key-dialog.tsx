'use client';

import { useState } from 'react';
import { Button } from '@luki-fitti/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@luki-fitti/ui/components/ui/dialog';
import { Input } from '@luki-fitti/ui/components/ui/input';
import { Label } from '@luki-fitti/ui/components/ui/label';
import { toast } from '@luki-fitti/ui/components/ui/sonner';
import {
  OPENROUTER_API_KEY_PATTERN,
  type AdminUserAiKeyDto,
  type AdminUserDto,
} from '@luki-fitti/common/schemas';
import { api } from '@/lib/api';
import { aiKeyErrorMessage } from '@/lib/ai/ai-key-errors';
import { useLocale } from '@/providers/i18n/locale-context';

/**
 * Assign / remove the ADMIN-slot OpenRouter key of one user. The key is write-only: admins see
 * only `…last4` of the key they assigned, and only whether the user has an own key.
 */
export function AdminUserAiKeyDialog({
  user,
  onClose,
  onChanged,
}: {
  user: Pick<AdminUserDto, 'id' | 'email' | 'aiKey'> | null;
  onClose: () => void;
  onChanged: (userId: string, aiKey: AdminUserAiKeyDto) => void;
}) {
  const { t, format, bcp47 } = useLocale();
  const [value, setValue] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setValue('');
    setInvalid(false);
    onClose();
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    const apiKey = value.trim();
    if (!OPENROUTER_API_KEY_PATTERN.test(apiKey)) {
      setInvalid(true);
      return;
    }
    setBusy(true);
    try {
      const res = await api.admin.setUserAiKey(user.id, apiKey);
      if (res.data) onChanged(user.id, res.data);
      setValue('');
      toast.success(t.admin.aiKeySaved);
    } catch (err) {
      toast.error(aiKeyErrorMessage(err, t.aiKey));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const res = await api.admin.removeUserAiKey(user.id);
      if (res.data) onChanged(user.id, res.data);
      toast.success(t.admin.aiKeyRemoved);
    } catch (err) {
      toast.error(aiKeyErrorMessage(err, t.aiKey));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && close()}>
      {user && (
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-left">
            <DialogTitle className="truncate">
              {format(t.admin.aiKeyDialogTitle, { email: user.email })}
            </DialogTitle>
            <DialogDescription className="text-[0.8125rem]">
              {t.admin.aiKeyDialogSub}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1 text-[0.9375rem]" role="status">
            <p>{user.aiKey.hasOwnKey ? t.admin.aiKeyOwnStatus : t.admin.aiKeyNoOwnStatus}</p>
            <p>
              {user.aiKey.admin
                ? format(t.admin.aiKeyAssignedStatus, {
                    last4: user.aiKey.admin.last4,
                    date: new Date(user.aiKey.admin.updatedAt).toLocaleDateString(bcp47),
                  })
                : t.admin.aiKeyNotAssigned}
            </p>
          </div>
          <form onSubmit={save} className="space-y-2" autoComplete="off">
            <Label htmlFor="admin-ai-key-input" className="text-[0.8125rem] font-semibold">
              {t.admin.aiKeyInput}
            </Label>
            <Input
              id="admin-ai-key-input"
              type="password"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={220}
              placeholder={t.aiKey.placeholder}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (invalid) setInvalid(false);
              }}
              aria-invalid={invalid}
              aria-describedby="admin-ai-key-hint"
              disabled={busy}
            />
            <p
              id="admin-ai-key-hint"
              className={`text-[0.8125rem] ${invalid ? 'text-destructive' : 'text-muted-foreground'}`}
            >
              {invalid ? t.aiKey.invalid : t.aiKey.hint}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={busy || value.trim().length === 0}>
                {t.admin.aiKeySave}
              </Button>
              {user.aiKey.admin && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void remove()}
                >
                  {t.admin.aiKeyRemove}
                </Button>
              )}
            </div>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}
