import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@luki-fitti/ui/lib/utils';
import { SetType } from '@luki-fitti/common/enums';

const TYPE_LETTER: Partial<Record<SetType, string>> = {
  [SetType.WARMUP]: 'W',
  [SetType.DROPSET]: 'D',
  [SetType.STRETCH]: 'S',
};

/** Text colour per set type; working sets use the regular foreground. */
export const SET_TYPE_TEXT_CLASS: Record<SetType, string> = {
  [SetType.WARMUP]: 'text-set-warmup',
  [SetType.WORKING]: 'text-foreground',
  [SetType.DROPSET]: 'text-set-dropset',
  [SetType.STRETCH]: 'text-set-stretch',
};

const PENDING_CLASS: Record<SetType, string> = {
  [SetType.WARMUP]: 'bg-set-warmup/15 text-set-warmup',
  [SetType.WORKING]: 'bg-secondary text-foreground',
  [SetType.DROPSET]: 'bg-set-dropset/15 text-set-dropset',
  [SetType.STRETCH]: 'bg-set-stretch/15 text-set-stretch',
};

const DONE_CLASS: Record<SetType, string> = {
  [SetType.WARMUP]: 'bg-set-warmup text-background',
  [SetType.WORKING]: 'bg-success text-success-foreground',
  [SetType.DROPSET]: 'bg-set-dropset text-background',
  [SetType.STRETCH]: 'bg-set-stretch text-background',
};

/**
 * Badge labels in the usual gym notation: warm-ups are "W", drop sets "D", stretches "S" and only
 * working sets are numbered (W, 1, 2, 3, D).
 */
export function getSetBadgeLabels(sets: ReadonlyArray<{ setType: SetType }>): string[] {
  let working = 0;
  return sets.map((s) => TYPE_LETTER[s.setType] ?? String(++working));
}

interface SetTypeBadgeProps {
  setType: SetType;
  label: string;
  completed: boolean;
  size?: 'md' | 'sm';
  className?: string;
}

/** Set badge that keeps its type colour and label after the set is logged. */
export function SetTypeBadge({
  setType,
  label,
  completed,
  size = 'md',
  className,
}: SetTypeBadgeProps) {
  return (
    <span
      aria-hidden="true"
      data-set-type={setType}
      className={cn(
        'tabular-nums relative flex shrink-0 items-center justify-center rounded-full font-semibold',
        size === 'md' ? 'size-9 text-[15px]' : 'size-6 text-[12px]',
        completed ? DONE_CLASS[setType] : PENDING_CLASS[setType],
        className,
      )}
    >
      {label}
      {completed && size === 'md' && (
        <span className="bg-card text-success absolute -right-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full">
          <Check className="size-3 stroke-[3.5]" />
        </span>
      )}
    </span>
  );
}
