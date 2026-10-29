'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, ShieldOff } from 'lucide-react';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { Spinner } from '@luki-fitti/ui/components/ui/spinner';
import { useAuth } from '@/providers/auth/auth-context';
import { useLocale } from '@/providers/i18n/locale-context';
import { getAdminMenu } from '@/lib/config/admin-menu';

/**
 * Client gate + chrome for /admin. The proxy only checks for a valid session token; the API
 * enforces every permission server-side, so this gate is purely UX.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const { user, authMode, loading } = useAuth();
  const { t } = useLocale();
  const pathname = usePathname();
  const menu = getAdminMenu(t, user?.permissions ?? []);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center" role="status">
        <Spinner />
        <span className="sr-only">{t.admin.loading}</span>
      </div>
    );
  }

  if (authMode !== 'AUTHENTICATED' || menu.length === 0) {
    const signedIn = authMode === 'AUTHENTICATED';
    return (
      <div className="bg-background flex min-h-dvh items-center justify-center p-4">
        <div className="bg-card w-full max-w-sm space-y-4 rounded-[1.25rem] p-6 text-center">
          <ShieldOff className="text-muted-foreground mx-auto h-8 w-8" aria-hidden="true" />
          <h1 className="text-[1.375rem] font-bold">{t.admin.noAccessTitle}</h1>
          <p className="text-muted-foreground text-[0.9375rem]">
            {signedIn ? t.admin.noAccessBody : t.admin.signInRequired}
          </p>
          <div className="flex flex-col gap-2">
            {!signedIn && (
              <Button asChild>
                <Link href={`/login?redirect=${encodeURIComponent(pathname || '/admin')}`}>
                  {t.auth.signInBtn}
                </Link>
              </Button>
            )}
            <Button asChild variant="secondary">
              <Link href="/">{t.admin.backToApp}</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background text-foreground flex min-h-dvh flex-col md:flex-row">
      <aside className="border-border/60 md:bg-card/40 border-b md:sticky md:top-0 md:h-dvh md:w-60 md:shrink-0 md:border-r md:border-b-0">
        <div className="flex items-center justify-between gap-3 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3 md:block md:space-y-4 md:px-5 md:pt-6">
          <div>
            <p className="text-[1.0625rem] font-semibold tracking-tight">LukiFitti</p>
            <p className="text-muted-foreground text-[0.8125rem]">{t.admin.title}</p>
          </div>
          <Button asChild variant="ghost" size="sm" className="md:-ml-3">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" /> {t.admin.backToApp}
            </Link>
          </Button>
        </div>
        <nav aria-label={t.admin.title} className="overflow-x-auto px-2 pb-2 md:px-3">
          <ul className="flex gap-1 md:flex-col">
            {menu.map((item) => {
              const Icon = item.icon;
              const current = pathname?.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={current ? 'page' : undefined}
                    className={`flex h-11 items-center gap-2.5 rounded-full px-4 text-[0.9375rem] whitespace-nowrap transition-colors duration-150 md:rounded-xl ${
                      current
                        ? 'bg-secondary text-foreground font-semibold'
                        : 'text-muted-foreground hover:text-foreground font-medium'
                    }`}
                  >
                    <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
      <main className="mx-auto w-full max-w-5xl min-w-0 flex-1 px-4 pt-6 pb-16 md:px-8 md:pt-10">
        {children}
      </main>
    </div>
  );
}

/** Shared loading / error states for admin pages. */
export function AdminState({ error, onRetry }: { error?: string | null; onRetry?: () => void }) {
  const { t } = useLocale();
  if (!error) {
    return (
      <div className="flex justify-center py-16" role="status">
        <Spinner />
        <span className="sr-only">{t.admin.loading}</span>
      </div>
    );
  }
  return (
    <div className="bg-card space-y-3 rounded-[1.25rem] p-5" role="alert">
      <p className="text-[0.9375rem]">{t.admin.error}</p>
      {onRetry && (
        <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
          {t.admin.retry}
        </Button>
      )}
    </div>
  );
}
