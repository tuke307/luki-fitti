'use client';

import React from 'react';
import { cn } from '@luki-fitti/ui/lib/utils';

export interface ChipStripOption<T extends string> {
  value: T;
  label: string;
}

export interface ChipStripProps<T extends string> {
  options: ReadonlyArray<ChipStripOption<T>>;
  value: T;
  onValueChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  'data-testid'?: string;
}

/** iOS-style single-select filter chips in a horizontally scrolling strip (History, Library). */
export function ChipStrip<T extends string>({
  options,
  value,
  onValueChange,
  ariaLabel,
  className,
  ...rest
}: ChipStripProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      data-testid={rest['data-testid']}
      className={cn(
        'scrollbar-hide -mx-1 flex min-w-0 items-center gap-2 overflow-x-auto px-1 py-0.5',
        className,
      )}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onValueChange(opt.value)}
            className={cn(
              'focus-visible:ring-ring/50 h-10 shrink-0 rounded-full px-4 text-[0.9375rem] font-medium whitespace-nowrap outline-hidden transition-colors focus-visible:ring-[3px] active:scale-[0.97]',
              selected
                ? 'bg-primary text-primary-foreground font-semibold'
                : 'bg-card text-foreground hover:bg-secondary',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
