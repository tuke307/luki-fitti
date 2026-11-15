'use client';

import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { useLocale } from '@/providers/i18n/locale-context';

/** Back header for the social detail pages — returns to the hub. */
export function SocialPageHeader({ title, onBack }: { title: string; onBack: () => void }) {
  const { t } = useLocale();
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onBack}
        data-testid="social-page-back"
        aria-label={t.common.back}
        className="text-muted-foreground hover:text-foreground -ml-1 flex size-9 items-center justify-center rounded-full transition-colors"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <h1 className="font-rounded text-[1.375rem] font-bold">{title}</h1>
    </div>
  );
}
