'use client';

import { ArrowLeftRight, ArrowRight } from 'lucide-react';
import { Badge } from '@luki-fitti/ui/components/ui/badge';
import { cn } from '@luki-fitti/ui/lib/utils';
import { Laterality } from '@luki-fitti/common/enums';
import { useLocale } from '@/providers/i18n/locale-context';

interface LateralityBadgeProps {
  laterality: Laterality | null | undefined;
  className?: string;
}

/** "One side" / "Both sides" chip; renders nothing when the side is unknown. */
export function LateralityBadge({ laterality, className }: LateralityBadgeProps) {
  const { t } = useLocale();
  if (!laterality) return null;
  const oneSide = laterality === Laterality.UNILATERAL;
  const Icon = oneSide ? ArrowRight : ArrowLeftRight;
  return (
    <Badge
      variant="secondary"
      data-testid="laterality-badge"
      data-laterality={laterality}
      className={cn('text-muted-foreground font-medium', className)}
    >
      <Icon aria-hidden="true" />
      {oneSide ? t.laterality.oneSide : t.laterality.bothSides}
    </Badge>
  );
}
