'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth/auth-context';
import { useLocale } from '@/providers/i18n/locale-context';
import { getAdminMenu } from '@/lib/config/admin-menu';

/** Lands on the first admin page the user may open. */
export default function AdminIndexPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useLocale();
  const first = getAdminMenu(t, user?.permissions ?? [])[0]?.href;

  useEffect(() => {
    if (first) router.replace(first);
  }, [first, router]);

  return null;
}
