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
import { UserAvatar } from '@/components/gym/social/user-avatar';

const PENDING_INVITE_KEY = 'luki.social.pendingInvite';

type PageState =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'preview'; inviter: { handle: string; avatarUrl: string | null } }
  | { kind: 'accepted' };

/**
 * `/invite/:token` — signed-in users see the inviter card + Accept; signed-out
 * users get a sign-in/up page (the token is kept in sessionStorage and the
 * login redirect comes back here to finish the accept).
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

  // Signed out: stash the token so a sign-in elsewhere can still accept it.
  useEffect(() => {
    if (!loading && !isAuthenticated && tokenValid) {
      sessionStorage.setItem(PENDING_INVITE_KEY, token);
    }
  }, [loading, isAuthenticated, token, tokenValid]);

  useEffect(() => {
    if (loading || !isAuthenticated || !tokenValid) return;
    let cancelled = false;
    socialApi
      .invitePreview(token)
      .then((res) => {
        if (cancelled) return;
        setState(res.data?.handle ? { kind: 'preview', inviter: res.data } : { kind: 'invalid' });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'invalid' });
      });
    return () => {
      cancelled = true;
    };
  }, [token, isAuthenticated, loading, tokenValid]);

  const accept = async () => {
    setAccepting(true);
    try {
      const res = await socialApi.acceptInvite(token);
      if (res.success) {
        sessionStorage.removeItem(PENDING_INVITE_KEY);
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
    if (sessionStorage.getItem(PENDING_INVITE_KEY) === token) {
      autoAccepted.current = true;
      queueMicrotask(() => void acceptStable());
    }
  }, [isAuthenticated, loading, token, tokenValid]);

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
              <Link href={`/login?redirect=${encodeURIComponent(`/invite/${token}`)}`}>
                {t.invite.signUp}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (tokenValid && state.kind === 'preview') {
    return (
      <div className="bg-background flex min-h-dvh items-center justify-center p-4">
        <div className="bg-card w-full max-w-sm space-y-4 rounded-[1.25rem] p-6 text-center">
          <UserAvatar
            avatarUrl={state.inviter.avatarUrl}
            handle={state.inviter.handle}
            className="mx-auto size-16"
          />
          <p className="text-[0.9375rem]" data-testid="invite-preview-text">
            {format(t.invite.invitedBy, { handle: `@${state.inviter.handle}` })}
          </p>
          <Button
            className="w-full"
            onClick={() => void accept()}
            disabled={accepting}
            data-testid="invite-accept-btn"
          >
            {accepting ? t.invite.accepting : t.invite.accept}
          </Button>
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
