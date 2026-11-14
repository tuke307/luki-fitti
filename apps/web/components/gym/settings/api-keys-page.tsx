'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, Copy, ExternalLink, KeyRound, Loader2, Trash2 } from 'lucide-react';
import { Badge } from '@luki-fitti/ui/components/ui/badge';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { Card } from '@luki-fitti/ui/components/ui/card';
import { Checkbox } from '@luki-fitti/ui/components/ui/checkbox';
import { Input } from '@luki-fitti/ui/components/ui/input';
import { Label } from '@luki-fitti/ui/components/ui/label';
import { toast } from '@luki-fitti/ui/components/ui/sonner';
import { API_KEY_READ_SCOPES, API_KEY_SCOPES, ApiKeyScope } from '@luki-fitti/common/enums';
import type { ApiKeyDto, ApiKeyListDto, CreatedApiKeyDto } from '@luki-fitti/common/schemas';
import { api, ApiClientError } from '@/lib/api';
import { useLocale } from '@/providers/i18n/locale-context';
import { MobileSheet } from '../mobile-sheet';
import { ConfirmDestructiveDialog } from '../confirm-destructive-dialog';
import { SettingsSection } from './settings-row';

const EXPIRY_OPTIONS = [30, 90, 365, null] as const;

/** Default preselection: everything except `mcp`, which only the MCP preset ticks. */
const DEFAULT_SCOPES = API_KEY_SCOPES.filter((s) => s !== ApiKeyScope.MCP);
/** "AI assistant (MCP)" preset: the mcp scope plus all read scopes (no `export`). */
const MCP_PRESET_SCOPES = [ApiKeyScope.MCP, ...API_KEY_READ_SCOPES];

/** Relative "x ago" via Intl.RelativeTimeFormat; under an hour it says minutes, etc. */
function relativeAgo(iso: string, bcp47: string): string {
  const diffSec = Math.round((Date.parse(iso) - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(bcp47, { numeric: 'auto' });
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(diffSec, 'second');
  if (abs < 3600) return rtf.format(Math.trunc(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.trunc(diffSec / 3600), 'hour');
  return rtf.format(Math.trunc(diffSec / 86400), 'day');
}

interface CreateSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

/** Two phases: the form, then the full key shown exactly once. */
function CreateApiKeySheet({ open, onOpenChange, onCreated }: CreateSheetProps) {
  const d = useLocale().t.apiKeys;

  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<Set<ApiKeyScope>>(new Set(DEFAULT_SCOPES));
  const [expiresInDays, setExpiresInDays] = useState<30 | 90 | 365 | null>(90);
  const [currentPassword, setCurrentPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedApiKeyDto | null>(null);
  const [copiedConfirmed, setCopiedConfirmed] = useState(false);

  const reset = () => {
    setName('');
    setScopes(new Set(DEFAULT_SCOPES));
    setExpiresInDays(90);
    setCurrentPassword('');
    setPasswordError(null);
    setFormError(null);
    setBusy(false);
    setCreated(null);
    setCopiedConfirmed(false);
  };

  // While the key is shown, closing is only allowed after the checkbox.
  const handleOpenChange = (next: boolean) => {
    if (!next && created && !copiedConfirmed) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const toggleScope = (scope: ApiKeyScope) => {
    setScopes((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });
  };

  const submit = async () => {
    setPasswordError(null);
    setFormError(null);
    setBusy(true);
    try {
      const res = await api.apiKeys.create({
        name: name.trim(),
        scopes: [...scopes],
        expiresInDays,
        currentPassword,
      });
      if (res.data) {
        setCreated(res.data);
        onCreated();
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.status === 401) {
          setPasswordError(d.errorWrongPassword);
        } else if (err.code === 'API_KEY_LIMIT') {
          setFormError(d.errorLimit);
        } else if (err.code === 'API_KEYS_DISABLED') {
          setFormError(d.disabledNotice);
        } else {
          toast.error(d.errorGeneric);
        }
      } else {
        toast.error(d.errorGeneric);
      }
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.key);
      toast.success(d.copiedToast);
    } catch {
      toast.error(d.errorGeneric);
    }
  };

  const canSubmit =
    name.trim().length >= 1 &&
    name.trim().length <= 40 &&
    scopes.size > 0 &&
    currentPassword.length > 0;

  const scopeLabel = (scope: ApiKeyScope): string => d.scopes[scope];

  return (
    <MobileSheet
      open={open}
      onOpenChange={handleOpenChange}
      title={created ? d.createdTitle : d.createTitle}
      confirm={
        created
          ? {
              label: d.doneBtn,
              onConfirm: () => handleOpenChange(false),
              disabled: !copiedConfirmed,
              testId: 'api-key-created-done',
            }
          : {
              label: d.createSubmit,
              onConfirm: () => void submit(),
              disabled: !canSubmit,
              loading: busy,
              testId: 'api-key-create-submit',
            }
      }
      description={created ? d.createdTitle : d.createTitle}
      data-testid="api-key-create-sheet"
    >
      {created ? (
        <div className="space-y-4" data-testid="api-key-created-view">
          <p className="text-muted-foreground text-[0.9375rem]">{d.createdDesc}</p>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={created.key}
              className="font-mono text-xs"
              onFocus={(e) => e.target.select()}
              data-testid="api-key-secret-field"
              aria-label={d.keyFieldAria}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => void copy()}
              data-testid="api-key-copy-btn"
            >
              <Copy className="h-4 w-4" />
              {d.copyBtn}
            </Button>
          </div>
          <p className="text-warning flex items-start gap-2 text-[0.8125rem]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {d.createdWarning}
          </p>
          <label
            className="flex items-center gap-2.5 text-[0.9375rem]"
            data-testid="api-key-copied-check-label"
          >
            <Checkbox
              checked={copiedConfirmed}
              onCheckedChange={(v) => setCopiedConfirmed(v === true)}
              data-testid="api-key-copied-check"
            />
            {d.copiedConfirmLabel}
          </label>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="api-key-name">{d.nameLabel}</Label>
            <Input
              id="api-key-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={d.namePlaceholder}
              maxLength={40}
              data-testid="api-key-name-input"
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold">{d.scopesLabel}</legend>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setScopes(new Set(MCP_PRESET_SCOPES))}
                data-testid="api-key-scope-preset-mcp"
              >
                {d.presetMcp}
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {API_KEY_SCOPES.map((scope) => (
                <label key={scope} className="flex items-center gap-2.5 text-[0.9375rem]">
                  <Checkbox
                    checked={scopes.has(scope)}
                    onCheckedChange={() => toggleScope(scope)}
                    data-testid={`api-key-scope-${scope.replace(':', '-')}`}
                  />
                  {scopeLabel(scope)}
                </label>
              ))}
            </div>
            {scopes.size === 0 && <p className="text-destructive text-xs">{d.errorNoScope}</p>}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold">{d.expiryLabel}</legend>
            <div className="flex flex-wrap gap-2">
              {EXPIRY_OPTIONS.map((days) => {
                const label =
                  days === 30
                    ? d.expiry30
                    : days === 90
                      ? d.expiry90
                      : days === 365
                        ? d.expiry365
                        : d.expiryNever;
                const selected = expiresInDays === days;
                return (
                  <Button
                    key={String(days)}
                    type="button"
                    variant={selected ? 'default' : 'secondary'}
                    size="sm"
                    onClick={() => setExpiresInDays(days)}
                    data-testid={`api-key-expiry-${days ?? 'never'}`}
                  >
                    {selected && <Check className="h-3.5 w-3.5" />}
                    {label}
                  </Button>
                );
              })}
            </div>
            {expiresInDays === null && (
              <p
                className="text-warning flex items-start gap-2 text-[0.8125rem]"
                data-testid="api-key-no-expiry-warning"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {d.expiryNeverWarning}
              </p>
            )}
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="api-key-password">{d.passwordLabel}</Label>
            <Input
              id="api-key-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              data-testid="api-key-password-input"
            />
            <p className="text-muted-foreground text-xs">{d.passwordHint}</p>
            {passwordError && (
              <p className="text-destructive text-xs" data-testid="api-key-password-error">
                {passwordError}
              </p>
            )}
          </div>

          {formError && (
            <p className="text-destructive text-[0.8125rem]" data-testid="api-key-form-error">
              {formError}
            </p>
          )}
        </div>
      )}
    </MobileSheet>
  );
}

function KeyRow({ apiKey, onRevoke }: { apiKey: ApiKeyDto; onRevoke: (k: ApiKeyDto) => void }) {
  const { t, format, bcp47 } = useLocale();
  const d = t.apiKeys;
  const expired = apiKey.status === 'expired';
  const createdDate = new Date(apiKey.createdAt).toLocaleDateString(bcp47, {
    dateStyle: 'medium',
  });
  const expiryText = expired
    ? null
    : apiKey.expiresAt === null
      ? d.expiryNone
      : format(d.expiresAt, {
          date: new Date(apiKey.expiresAt).toLocaleDateString(bcp47, { dateStyle: 'medium' }),
        });

  return (
    <li
      className={`space-y-2 py-3 ${expired ? 'opacity-50' : ''}`}
      data-testid={`api-key-item-${apiKey.id}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[0.9375rem] font-medium">{apiKey.name}</p>
          <p className="text-muted-foreground font-mono text-xs">{apiKey.prefix}…</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {expired && <Badge variant="secondary">{d.expiredBadge}</Badge>}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onRevoke(apiKey)}
            className="text-destructive"
            data-testid={`api-key-revoke-${apiKey.id}`}
          >
            <Trash2 className="h-4 w-4" />
            {d.revokeBtn}
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {apiKey.scopes.map((scope) => (
          <Badge key={scope} variant="outline" className="font-normal">
            {d.scopes[scope]}
          </Badge>
        ))}
      </div>
      <p className="text-muted-foreground text-xs">
        {format(d.createdOn, { date: createdDate })}
        {' · '}
        {apiKey.lastUsedAt
          ? format(d.lastUsed, { time: relativeAgo(apiKey.lastUsedAt, bcp47) })
          : d.neverUsed}
        {expiryText ? ` · ${expiryText}` : ''}
      </p>
    </li>
  );
}

export function ApiKeysPage() {
  const { t, format, locale } = useLocale();
  const d = t.apiKeys;
  const [list, setList] = useState<ApiKeyListDto | null>(null);
  const [error, setError] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyDto | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);

  const load = useCallback(() => {
    api.apiKeys
      .list()
      .then((res) => {
        setList(res.data ?? { enabled: false, keys: [] });
        setError(false);
      })
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const revoke = async () => {
    if (!revokeTarget) return;
    setRevokeBusy(true);
    try {
      await api.apiKeys.revoke(revokeTarget.id);
      setList((prev) =>
        prev ? { ...prev, keys: prev.keys.filter((k) => k.id !== revokeTarget.id) } : prev,
      );
      toast.success(d.revokedToast);
    } catch {
      toast.error(d.errorGeneric);
    } finally {
      setRevokeBusy(false);
    }
  };

  // The docs page arrives with PR B; locale path mirrors the legal links.
  const docsHref = locale === 'de' ? '/developers' : `/${locale}/developers`;

  return (
    <>
      <div className="space-y-4" data-testid="api-keys-page">
        <Card className="space-y-3 rounded-[1.25rem] p-5">
          <div className="flex items-center gap-2.5">
            <KeyRound className="text-primary h-5 w-5" />
            <h2 className="font-display text-lg font-bold">{d.title}</h2>
          </div>
          <p className="text-muted-foreground text-[0.9375rem]">
            {d.emptyDesc}{' '}
            <Link
              href={docsHref}
              className="text-primary inline-flex items-center gap-1"
              data-testid="api-keys-docs-link"
            >
              {d.docsLink} <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </p>
        </Card>

        {error && (
          <Card className="rounded-[1.25rem] p-5">
            <p className="text-muted-foreground text-[0.9375rem]">{d.loadError}</p>
            <Button type="button" variant="secondary" size="sm" onClick={load}>
              {d.retry}
            </Button>
          </Card>
        )}

        {list && !error && (
          <>
            {!list.enabled && (
              <Card
                className="border-warning/40 text-warning flex items-start gap-2 rounded-[1.25rem] p-4 text-[0.9375rem]"
                data-testid="api-keys-disabled-notice"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {d.disabledNotice}
              </Card>
            )}

            {list.enabled && (
              <Button
                type="button"
                onClick={() => setCreateOpen(true)}
                data-testid="api-key-create-open"
              >
                <KeyRound className="h-4 w-4" /> {d.createBtn}
              </Button>
            )}

            {list.keys.length > 0 && (
              <SettingsSection data-testid="api-key-list">
                {list.keys.map((k) => (
                  <KeyRow key={k.id} apiKey={k} onRevoke={setRevokeTarget} />
                ))}
              </SettingsSection>
            )}
          </>
        )}

        {!list && !error && (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> {d.loading}
          </div>
        )}
      </div>

      <CreateApiKeySheet open={createOpen} onOpenChange={setCreateOpen} onCreated={load} />

      <ConfirmDestructiveDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
        title={d.revokeTitle}
        description={format(d.revokeDesc, { name: revokeTarget?.name ?? '' })}
        confirmLabel={revokeBusy ? d.revokingBtn : d.revokeBtn}
        onConfirm={revoke}
        testId="api-key-revoke-dialog"
      />
    </>
  );
}
