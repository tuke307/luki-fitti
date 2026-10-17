import * as React from 'react';
import { ChevronDownIcon } from 'lucide-react';

import { cn } from '@luki-fitti/ui/lib/utils';

function NativeSelect({ className, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <div className="relative inline-flex items-center">
      <select
        data-slot="native-select"
        className={cn(
          'border-input bg-background text-foreground focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full appearance-none rounded-xl border py-1.5 pr-8 pl-3 text-xs font-medium shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon className="text-muted-foreground pointer-events-none absolute right-2.5 size-3.5 opacity-70" />
    </div>
  );
}

export { NativeSelect };
