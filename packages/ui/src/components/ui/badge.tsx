import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@luki-fitti/ui/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/15 text-primary font-bold [a&]:hover:bg-primary/25',
        solid: 'border-transparent bg-primary text-primary-foreground font-extrabold [a&]:hover:bg-primary/90',
        accent: 'border-transparent bg-accent/15 text-accent font-bold [a&]:hover:bg-accent/25',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90',
        success:
          'border-emerald-500/40 bg-emerald-500/15 text-emerald-300 font-bold',
        warning:
          'border-amber-500/40 bg-amber-500/15 text-amber-300 font-bold',
        destructive:
          'border-destructive/40 bg-destructive/20 text-destructive font-bold [a&]:hover:bg-destructive/30 focus-visible:ring-destructive/30',
        outline: 'text-card-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span';

  return (
    <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
