'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, Link2, QrCode, Share2, UserPlus } from 'lucide-react';
import { toast } from '@luki-fitti/ui/components/ui/sonner';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { Input } from '@luki-fitti/ui/components/ui/input';
import { useLocale } from '@/providers/i18n/locale-context';
import type { SocialCardDto, SocialUserDto } from '@luki-fitti/common/schemas';
import { socialApi } from '@/lib/social/social-api';
import { emailsToHashes } from '@/lib/social/contact-hash';
import { FriendRow } from './friend-row';
import { MobileSheet } from '../mobile-sheet';

const SEARCH_DEBOUNCE_MS = 300;
const MIN_QUERY = 2;

interface ContactsPickerResult {
  address?: { type?: string[] | string; value?: string }[] | string[];
  email?: { type?: string[] | string; value?: string }[] | string[];
}
interface ContactsManagerLike {
  select(properties: string[], options?: { multiple?: boolean }): Promise<ContactsPickerResult[]>;
}

export function contactsSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'contacts' in navigator &&
    typeof window !== 'undefined' &&
    'ContactsManager' in window
  );
}

/**
 * "Add friends": debounced handle search, invite link (share/copy) + QR, and
 * contact sync where the Contact Picker API exists.
 */
export function AddFriendsSection({
  onChanged,
  onReport,
}: {
  onChanged: () => void;
  onReport: (user: SocialCardDto) => void;
}) {
  const { t } = useLocale();
  const [query, setQuery] = useState('');
  const [searchResult, setSearchResult] = useState<{
    query: string;
    items: SocialUserDto[];
  } | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [contactMatches, setContactMatches] = useState<SocialUserDto[] | null>(null);
  const debounceRef = useRef<number | null>(null);

  const normalizedQuery = query.trim().replace(/^@/, '');
  const results =
    searchResult && searchResult.query === normalizedQuery && normalizedQuery.length >= MIN_QUERY
      ? searchResult.items
      : null;

  useEffect(() => {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    const q = query.trim().replace(/^@/, '');
    if (q.length < MIN_QUERY) return;
    debounceRef.current = window.setTimeout(() => {
      socialApi
        .search(q)
        .then((res) => setSearchResult({ query: q, items: res.data ?? [] }))
        .catch(() => setSearchResult({ query: q, items: [] }));
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    };
  }, [query]);

  const ensureInvite = async (): Promise<string | null> => {
    if (inviteUrl) return inviteUrl;
    setInviteBusy(true);
    try {
      const res = await socialApi.createInvite();
      const url = res.data?.url ?? null;
      setInviteUrl(url);
      return url;
    } catch {
      return null;
    } finally {
      setInviteBusy(false);
    }
  };

  const copyInvite = async () => {
    const url = await ensureInvite();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.info(url);
    }
  };

  const shareInvite = async () => {
    const url = await ensureInvite();
    if (!url) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'LukiFitti', url });
        return;
      } catch {
        return; // user dismissed the sheet
      }
    }
    await copyInvite();
  };

  const showQr = async () => {
    const url = await ensureInvite();
    if (!url) return;
    const QRCode = (await import('qrcode')).default;
    const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 220 });
    setQrUrl(dataUrl);
  };

  const sendRequest = async (userId: string) => {
    try {
      await socialApi.sendRequest(userId);
      setSentIds((s) => new Set(s).add(userId));
      onChanged();
    } catch {
      /* request may already exist — treat as sent */
      setSentIds((s) => new Set(s).add(userId));
    }
  };

  const runContactSync = async () => {
    setContactsOpen(false);
    const contacts = (navigator as Navigator & { contacts?: ContactsManagerLike }).contacts;
    if (!contacts) return;
    try {
      const picked = await contacts.select(['email'], { multiple: true });
      const emails = picked.flatMap((c) =>
        (c.email ?? []).map((e) => (typeof e === 'string' ? e : (e.value ?? ''))),
      );
      const hashes = await emailsToHashes(emails);
      if (hashes.length === 0) {
        setContactMatches([]);
        return;
      }
      const res = await socialApi.matchContacts(hashes);
      setContactMatches(res.data ?? []);
    } catch {
      setContactMatches(null);
      toast.error(t.social.contactsError);
    }
  };

  const actionFor = (u: SocialUserDto) =>
    u.relation === 'FRIEND' || u.relation === 'OUTGOING' || sentIds.has(u.userId) ? (
      <span className="text-muted-foreground px-2 text-[0.8125rem]">{t.social.requested}</span>
    ) : (
      <Button
        size="sm"
        data-testid={`search-add-${u.userId}`}
        onClick={() => void sendRequest(u.userId)}
      >
        <UserPlus className="h-4 w-4" /> {t.social.add}
      </Button>
    );

  return (
    <div className="mt-6" data-testid="add-friends-section">
      <h2 className="text-muted-foreground px-1 pb-1 text-[0.8125rem] font-medium tracking-wide uppercase">
        {t.social.addFriends}
      </h2>
      <div className="bg-card space-y-4 rounded-[1.25rem] p-4">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.social.searchPlaceholder}
          data-testid="social-search-input"
          aria-label={t.social.searchPlaceholder}
        />
        {normalizedQuery.length >= MIN_QUERY && results !== null && (
          <ul className="divide-border/60 -mx-4 divide-y" data-testid="social-search-results">
            {results.length === 0 ? (
              <li className="text-muted-foreground px-4 py-3 text-[0.9375rem]">
                {t.social.searchEmpty}
              </li>
            ) : (
              results.map((u) => (
                <FriendRow key={u.userId} user={u} actions={actionFor(u)} onReport={onReport} />
              ))
            )}
          </ul>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void shareInvite()}
            disabled={inviteBusy}
            data-testid="invite-share-btn"
          >
            <Share2 className="h-4 w-4" /> {t.social.inviteShare}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void copyInvite()}
            disabled={inviteBusy}
            data-testid="invite-copy-btn"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? t.social.inviteCopied : t.social.inviteCopy}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void showQr()}
            disabled={inviteBusy}
            data-testid="invite-qr-btn"
          >
            <QrCode className="h-4 w-4" /> QR
          </Button>
          {contactsSupported() && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setContactsOpen(true)}
              data-testid="contacts-sync-btn"
            >
              <Link2 className="h-4 w-4" /> {t.social.contactsTitle}
            </Button>
          )}
        </div>
        {inviteUrl && (
          <p className="text-muted-foreground truncate text-[0.8125rem]" data-testid="invite-url">
            {inviteUrl}
          </p>
        )}
        {qrUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qrUrl}
            alt={t.social.inviteQrAlt}
            className="mx-auto rounded-xl"
            width={220}
            height={220}
            data-testid="invite-qr"
          />
        )}

        {contactMatches !== null && (
          <ul className="divide-border/60 -mx-4 divide-y" data-testid="contact-matches">
            {contactMatches.length === 0 ? (
              <li className="text-muted-foreground px-4 py-3 text-[0.9375rem]">
                {t.social.contactsEmpty}
              </li>
            ) : (
              contactMatches.map((u) => (
                <FriendRow key={u.userId} user={u} actions={actionFor(u)} onReport={onReport} />
              ))
            )}
          </ul>
        )}
      </div>

      <MobileSheet
        open={contactsOpen}
        onOpenChange={setContactsOpen}
        title={t.social.contactsConsentTitle}
        confirm={{ label: t.social.contactsConsentAgree, onConfirm: () => void runContactSync() }}
        data-testid="contacts-consent-sheet"
      >
        <p className="text-muted-foreground text-[0.9375rem]">{t.social.contactsConsentBody}</p>
      </MobileSheet>
    </div>
  );
}
