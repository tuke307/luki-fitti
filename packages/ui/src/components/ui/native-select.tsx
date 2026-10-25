import * as React from 'react';
import { ChevronDownIcon } from 'lucide-react';

import { cn } from '@luki-fitti/ui/lib/utils';

function NativeSelect({ className, children, ...props }: React.ComponentProps<'select'>) {
  const isFullWidth = className?.includes('w-full');
  const isSmAuto = className?.includes('sm:w-auto');
  const isFlex1 = className?.includes('flex-1');

  return (
    <div
      className={cn(
        'relative inline-flex max-w-full min-w-0 items-center',
        isFullWidth && 'w-full',
        isSmAuto && 'sm:w-auto',
        isFlex1 && 'flex-1',
      )}
    >
      <select
        data-slot="native-select"
        className={cn(
          'bg-secondary text-foreground focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-full max-w-full min-w-0 truncate appearance-none rounded-xl border border-transparent py-1.5 pr-8 pl-3.5 text-base transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 sm:text-sm',
          className,
          'max-sm:text-base',
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon className="text-muted-foreground pointer-events-none absolute right-2.5 size-3.5 shrink-0 opacity-70" />
    </div>
  );
}

export { NativeSelect };
