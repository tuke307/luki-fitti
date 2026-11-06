import React from 'react';
import { cn } from '@luki-fitti/ui/lib/utils';

/**
 * Below `md` the shell overlays a 44px profile button at the viewport's top-right; rows keep
 * clear of it with this trailing inset.
 */
export const SHELL_TRAILING_INSET_CLASS = 'pe-[3.75rem] md:pe-0';

export interface PageTitleProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  id?: string;
}

/** iOS-style large title with optional subtitle and trailing actions. */
export function PageTitle({ title, subtitle, actions, id }: PageTitleProps) {
  return (
    <div className={cn('flex items-start justify-between gap-3', SHELL_TRAILING_INSET_CLASS)}>
      <div className="min-w-0">
        <h1
          id={id}
          data-page-title
          className="text-[2.125rem] leading-tight font-bold tracking-tight"
        >
          {title}
        </h1>
        {subtitle && <p className="text-muted-foreground text-sm">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2 pt-1.5">{actions}</div>}
    </div>
  );
}
