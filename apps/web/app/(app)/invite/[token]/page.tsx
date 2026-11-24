'use client';

import React, { useEffect, useEffectEvent, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { UserPlus } from 'lucide-react';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { Spinner } from '@luki-fitti/ui/components/ui/spinner';
import { useAuth } from '@/providers/auth/auth-context';
import { useLocale } from '@/providers/i18n/locale-context';
import { socialApi } from '@/lib/social/social-api';
import { isValidInviteToken } from '@/lib/social/invite-token';
import {
  clearPendingInvite,
  getPendingInvite,
  setPendingInvite,
} from '@/lib/social/pending-invite';
import { APP_STORE_URL } from '@/lib/site/config';
import { UserAvatar } from '@/components/gym/social/user-avatar';
import { SocialOnboardingSheet } from '@/components/gym/social/social-onboarding-sheet';
import type { SocialProfileDto } from '@luki-fitti/common/schemas';

/** Fallback for visitors whose phone did not open the app via the universal link. */
function OpenInApp({ token }: { token: string }) {
  const { t } = useLocale();
  if (!isValidInviteToken(token)) return null;
  return (
    <div className="border-border/60 space-y-2 border-t pt-4" data-testid="invite-open-in-app">
      <p className="text-muted-foreground text-[0.8125rem]">{t.invite.appHint}</p>
      <div className="flex flex-col gap-2">
        <Button asChild variant="outline" size="sm">
          <a href={`lukifitti://invite/${token}`} data-testid="invite-open-app-link">
            {t.invite.openInApp}
          </a>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
            {t.invite.getTheApp}
          </a>
        </Button>
      </div>
    </div>
  );
}

type PageState =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'username' }
  | { kind: 'preview'; inviter: { username: string; avatarUrl: string | null } }
  | { kind: 'accepted' };

/**
 * `/invite/:token` — signed-in users see the inviter card + Accept; signed-out
 * users get a sign-in/up page (the token is kept in localStorage and the
 * login redirect comes back here to finish the accept). New accounts without
 * a username pick one first, then the invite is accepted.
 */
export default function InvitePage() {
  const { t, format } = useLocale();
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = typeof params?.token === 'string' ? params.token : '';
  const tokenValid = isValidInviteToken(token);
  const [state, setState] = useState<PageState>({ kind: 'loading' });
  const [accepting, setAccepting] = useState(false);
  const autoAccepted = useRef(false);
  const onboardingPrompted = useRef(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingProfile, setOnboardingProfile] = useState<SocialProfileDto | null>(null);

  // Signed out: stash the token so a sign-in elsewhere can still accept it.
  useEffect(() => {
    if (!loading && !isAuthenticated && tokenValid) {
      setPendingInvite(token);
    }
  }, [loading, isAuthenticated, token, tokenValid]);

  // Accepting needs a username of your own; a freshly registered user has none yet.
  useEffect(() => {
    if (loading || !isAuthenticated || !tokenValid) return;
    let cancelled = false;
    void (async () => {
      try {
        const me = await socialApi.me();
        if (cancelled) return;
        if (me.data && me.data.username === null) {
          setState({ kind: 'username' });
          if (!onboardingPrompted.current) {
            onboardingPrompted.current = true;
            setOnboardingProfile(me.data);
            setOnboardingOpen(true);
          }
          return;
        }
        const res = await socialApi.invitePreview(token);
        if (cancelled) return;
        setState(res.data?.username ? { kind: 'preview', inviter: res.data } : { kind: 'invalid' });
      } catch {
        if (!cancelled) setState({ kind: 'invalid' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, isAuthenticated, loading, tokenValid, reloadKey]);

  const onOnboardingOpenChange = async (open: boolean) => {
    setOnboardingOpen(open);
    if (open) return;
    const me = await socialApi.me().catch(() => null);
    if (me?.data?.username) {
      setState({ kind: 'loading' });
      setReloadKey((k) => k + 1);
    }
  };

  const accept = async () => {
    setAccepting(true);
    try {
      const res = await socialApi.acceptInvite(token);
      if (res.success) {
        clearPendingInvite();
        setState({ kind: 'accepted' });
        router.replace('/?open=/social');
      } else {
        setState({ kind: 'invalid' });
      }
    } catch {
      setState({ kind: 'invalid' });
    } finally {
      setAccepting(false);
    }
  };
  const acceptStable = useEffectEvent(accept);

  // A stored pending invite + a fresh sign-in: accept without another tap.
  useEffect(() => {
    if (!isAuthenticated || loading || autoAccepted.current || !tokenValid) return;
    if (state.kind !== 'preview') return;
    if (getPendingInvite() === token) {
      autoAccepted.current = true;
      queueMicrotask(() => void acceptStable());
    }
  }, [isAuthenticated, loading, token, tokenValid, state.kind]);

  if (loading || (isAuthenticated && tokenValid && state.kind === 'loading')) {
    return (
      <div className="flex min-h-dvh items-center justify-center" role="status">
        <Spinner />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="bg-background flex min-h-dvh items-center justify-center p-4">
        <div className="bg-card w-full max-w-sm space-y-4 rounded-[1.25rem] p-6 text-center">
          <UserPlus className="text-primary mx-auto h-8 w-8" />
          <h1 className="text-[1.375rem] font-bold">{t.invite.signedOutTitle}</h1>
          <p className="text-muted-foreground text-[0.9375rem]">{t.invite.signedOutBody}</p>
          <div className="flex flex-col gap-2">
            <Button asChild>
              <Link href={`/login?redirect=${encodeURIComponent(`/invite/${token}`)}`}>
                {t.invite.signIn}
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link
                href={`/login?mode=register&redirect=${encodeURIComponent(`/invite/${token}`)}`}
                data-testid="invite-sign-up"
              >
                {t.invite.signUp}
              </Link>
            </Button>
          </div>
          <OpenInApp token={token} />
        </div>
      </div>
    );
  }

  if (tokenValid && state.kind === 'username') {
    return (
      <div className="bg-background flex min-h-dvh items-center justify-center p-4">
        <div className="bg-card w-full max-w-sm space-y-4 rounded-[1.25rem] p-6 text-center">
          <UserPlus className="text-primary mx-auto h-8 w-8" />
          <p className="text-[0.9375rem]" data-testid="invite-needs-username">
            {t.invite.usernameNeeded}
          </p>
          <Button
            className="w-full"
            onClick={() => void onOnboardingOpenChange(true)}
            data-testid="invite-choose-username"
          >
            {t.invite.chooseUsername}
          </Button>
        </div>
        <SocialOnboardingSheet
          open={onboardingOpen}
          onOpenChange={(open) => void onOnboardingOpenChange(open)}
          profile={onboardingProfile}
        />
      </div>
    );
  }

  if (tokenValid && state.kind === 'preview') {
    return (
      <div className="bg-background flex min-h-dvh items-center justify-center p-4">
        <div className="bg-card w-full max-w-sm space-y-4 rounded-[1.25rem] p-6 text-center">
          <UserAvatar
            avatarUrl={state.inviter.avatarUrl}
            username={state.inviter.username}
            className="mx-auto size-16"
          />
          <p className="text-[0.9375rem]" data-testid="invite-preview-text">
            {format(t.invite.invitedBy, { username: `@${state.inviter.username}` })}
          </p>
          <Button
            className="w-full"
            onClick={() => void accept()}
            disabled={accepting}
            data-testid="invite-accept-btn"
          >
            {accepting ? t.invite.accepting : t.invite.accept}
          </Button>
          <OpenInApp token={token} />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background flex min-h-dvh items-center justify-center p-4">
      <div className="bg-card w-full max-w-sm space-y-4 rounded-[1.25rem] p-6 text-center">
        <p className="text-[0.9375rem]" data-testid="invite-invalid">
          {state.kind === 'accepted' ? t.invite.accepted : t.invite.expired}
        </p>
        <Button asChild variant="secondary">
          <Link href="/?open=/social">{t.invite.goToFriends}</Link>
        </Button>
      </div>
    </div>
  );
}
