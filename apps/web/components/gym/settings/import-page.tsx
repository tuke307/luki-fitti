'use client';

import { Card } from '@luki-fitti/ui/components/ui/card';
import { useLocale } from '@/providers/i18n/locale-context';

export function ImportPage() {
  const { t } = useLocale();
  return (
    <Card className="rounded-[1.25rem] p-5">
      <p className="text-muted-foreground text-sm">{t.profile.comingSoon}</p>
    </Card>
  );
}
