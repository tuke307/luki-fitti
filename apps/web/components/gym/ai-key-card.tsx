'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, KeyRound } from 'lucide-react';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { Card } from '@luki-fitti/ui/components/ui/card';
import { Input } from '@luki-fitti/ui/components/ui/input';
import { Label } from '@luki-fitti/ui/components/ui/label';
import { toast } from '@luki-fitti/ui/components/ui/sonner';
import { AiKeySlot } from '@luki-fitti/common/enums';
import { OPENROUTER_API_KEY_PATTERN, type AiKeyStatusDto } from '@luki-fitti/common/schemas';
import { api } from '@/lib/api';
import { aiKeyErrorMessage } from '@/lib/ai/ai-key-errors';
import { useAuth } from '@/providers/auth/auth-context';
import { useLocale } from '@/providers/i18n/locale-context';
import { ConfirmDestructiveDialog } from './confirm-destructive-dialog';

/**
 * The user's own OpenRouter key (bring-your-own-key). The key is write-only: it is sent once over
 * HTTPS, stored encrypted by the API, and never returned — only `…last4` is shown. The input is
 * cleared after saving and never persisted in the browser.
 */
export function AiKeyCard() {
  const { t, format } = useLocale();
  const { refreshUser } = useAuth();
  const [status, setStatus] = useState<AiKeyStatusDto | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [value, setValue] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.ai
      .keyStatus()
      .then((res) => !cancelled && setStatus(res.data))
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const apiKey = value.trim();
    if (!OPENROUTER_API_KEY_PATTERN.test(apiKey)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setBusy(true);
    try {
      const res = await api.ai.setKey(apiKey);
      setStatus(res.data);
      setValue('');
      toast.success(t.aiKey.saved);
      void refreshUser();
    } catch (err) {
      toast.error(aiKeyErrorMessage(err, t.aiKey));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const res = await api.ai.removeKey();
      setStatus(res.data);
      toast.success(t.aiKey.removed);
      void refreshUser();
    } catch (err) {
      toast.error(aiKeyErrorMessage(err, t.aiKey));
    } finally {
      setBusy(false);
    }
  };

  const statusText = !status
    ? null
    : status.own
      ? format(t.aiKey.ownStatus, { last4: status.own.last4 })
      : status.source === AiKeySlot.ADMIN
        ? t.aiKey.adminStatus
        : t.aiKey.noKey;

  return (
    <Card className="space-y-3 rounded-[1.25rem] p-5" data-testid="ai-key-card">
      <div className="flex items-center gap-2.5">
        <KeyRound className="text-primary h-5 w-5" aria-hidden="true" />
        <h2 className="font-display text-lg font-bold">{t.aiKey.title}</h2>
      </div>
      <p className="text-muted-foreground text-xs">{t.aiKey.sub}</p>
      <a
        href="https://openrouter.ai/settings/keys"
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary inline-flex items-center gap-1 text-xs font-semibold underline-offset-2 hover:underline"
      >
        {t.aiKey.createLink} <ExternalLink className="h-3 w-3" aria-hidden="true" />
      </a>

      {loadError ? (
        <p className="text-destructive text-[0.8125rem]" role="alert">
          {t.aiKey.loadError}
        </p>
      ) : status && !status.available ? (
        <p
          className="bg-secondary text-muted-foreground rounded-2xl p-3 text-[0.8125rem]"
          role="status"
        >
          {t.aiKey.unavailable}
        </p>
      ) : (
        <>
          {statusText && (
            <p className="text-[0.9375rem] font-medium" role="status" data-testid="ai-key-status">
              {statusText}
            </p>
          )}
          <form onSubmit={save} className="space-y-2" autoComplete="off">
            <Label htmlFor="ai-key-input" className="text-[0.8125rem] font-semibold">
              {t.aiKey.label}
            </Label>
            <Input
              id="ai-key-input"
              type="password"
              inputMode="text"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={220}
              value={value}
              placeholder={t.aiKey.placeholder}
              onChange={(e) => {
                setValue(e.target.value);
                if (invalid) setInvalid(false);
              }}
              aria-invalid={invalid}
              aria-describedby="ai-key-hint"
              disabled={busy || !status}
            />
            <p
              id="ai-key-hint"
              className={`text-[0.8125rem] ${invalid ? 'text-destructive' : 'text-muted-foreground'}`}
            >
              {invalid ? t.aiKey.invalid : t.aiKey.hint}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                size="sm"
                disabled={busy || !status || value.trim().length === 0}
              >
                {busy && value ? t.aiKey.saving : status?.own ? t.aiKey.replace : t.aiKey.save}
              </Button>
              {status?.own && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setConfirmOpen(true)}
                >
                  {t.aiKey.remove}
                </Button>
              )}
            </div>
          </form>
        </>
      )}

      <ConfirmDestructiveDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t.aiKey.remove}
        description={t.aiKey.confirmRemove}
        confirmLabel={t.aiKey.remove}
        onConfirm={remove}
      />
    </Card>
  );
}
