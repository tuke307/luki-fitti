import * as React from 'react';
import { Slot, Slottable } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@luki-fitti/ui/lib/utils';

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-hidden focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 font-bold',
        accent: 'bg-accent text-accent-foreground shadow-xs hover:bg-accent/90 font-bold',
        destructive:
          'bg-destructive/80 text-destructive-foreground shadow-xs hover:bg-destructive/70 focus-visible:ring-destructive/30 font-bold',
        outline:
          'border bg-input/30 border-input shadow-xs hover:bg-input/50 hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80',
        ghost: 'hover:bg-accent/50 hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      effect: {
        expandIcon: 'group gap-0 relative',
        ringHover:
          'transition-all duration-300 hover:ring-2 hover:ring-muted/90 hover:ring-offset-2',
        shine:
          'before:animate-shine relative overflow-hidden before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.5)_50%,transparent_75%,transparent_100%)] before:bg-size-[250%_250%,100%_100%] before:bg-no-repeat background-position_0s_ease',
        shineHover:
          'relative overflow-hidden before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.5)_50%,transparent_75%,transparent_100%)] before:bg-size-[250%_250%,100%_100%] before:bg-position-[200%_0,0_0] before:bg-no-repeat before:transition-[background-position_0s_ease] hover:before:bg-position-[-100%_0,0_0] before:duration-1000',
        gooeyRight:
          'relative z-0 overflow-hidden transition-all duration-500 before:absolute before:inset-0 before:-z-10 before:translate-x-[150%] before:translate-y-[150%] before:scale-[2.5] before:rounded-[100%] before:bg-linear-to-r from-white/40 before:transition-transform before:duration-1000  hover:before:translate-x-[0%] hover:before:translate-y-[0%]',
        gooeyLeft:
          'relative z-0 overflow-hidden transition-all duration-500 after:absolute after:inset-0 after:-z-10 after:translate-x-[-150%] after:translate-y-[150%] after:scale-[2.5] after:rounded-[100%] after:bg-linear-to-l from-white/40 after:transition-transform after:duration-1000  hover:after:translate-x-[0%] hover:after:translate-y-[0%]',
        underline:
          'relative no-underline! after:absolute after:bg-muted after:bottom-1 after:h-px after:w-2/3 after:origin-bottom-left after:scale-x-100 hover:after:origin-bottom-right hover:after:scale-x-0 after:transition-transform after:ease-in-out after:duration-300',
        hoverUnderline:
          'relative no-underline! after:absolute after:bg-muted after:bottom-1 after:h-px after:w-2/3 after:origin-bottom-right after:scale-x-0 hover:after:origin-bottom-left hover:after:scale-x-100 after:transition-transform after:ease-in-out after:duration-300',
        gradientSlideShow:
          'bg-size-[400%] bg-[linear-gradient(-45deg,var(--gradient-lime),var(--gradient-ocean),var(--gradient-wine),var(--gradient-rust))] animate-gradient-flow',
      },
      size: {
        default: 'h-9 rounded-xl px-4 py-2 has-[>svg]:px-3 text-xs',
        xs: 'h-7 rounded-lg gap-1 px-2.5 text-[11px]',
        sm: 'h-8 rounded-xl gap-1.5 px-3 has-[>svg]:px-2.5 text-xs',
        lg: 'h-11 rounded-2xl px-6 has-[>svg]:px-4 text-xs font-extrabold',
        icon: 'size-9 rounded-xl',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    icon?: React.ElementType;
    iconPlacement?: 'left' | 'right';
  };

function Button({
  className,
  variant,
  effect,
  size,
  asChild = false,
  icon: Icon,
  iconPlacement,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, effect, size, className }))}
      {...props}
    >
      {Icon &&
        iconPlacement === 'left' &&
        (effect === 'expandIcon' ? (
          <div className="w-0 translate-x-[0%] pr-0 opacity-0 transition-all duration-200 group-hover:w-5 group-hover:translate-x-100 group-hover:pr-2 group-hover:opacity-100">
            <Icon />
          </div>
        ) : (
          <Icon />
        ))}
      <Slottable>{props.children}</Slottable>
      {Icon &&
        iconPlacement === 'right' &&
        (effect === 'expandIcon' ? (
          <div className="w-0 translate-x-full pl-0 opacity-0 transition-all duration-200 group-hover:w-5 group-hover:translate-x-0 group-hover:pl-2 group-hover:opacity-100">
            <Icon />
          </div>
        ) : (
          <Icon />
        ))}
    </Comp>
  );
}

export { Button, buttonVariants };
