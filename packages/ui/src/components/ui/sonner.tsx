'use client';

import { useTheme } from 'next-themes';
import { Toaster as Sonner, ToasterProps, toast } from 'sonner';

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      style={
        {
          // Sonner consumes these raw for `background:` / `color:` (no hsl()
          // wrap), so values must be complete colors. The theme stores bare
          // HSL triples, hence the hsl(...) wrapper — without it the browser
          // discards the value and the toast renders transparent with inherited
          // text, making it invisible on the page.
          '--normal-bg': 'hsl(var(--popover))',
          '--normal-text': 'hsl(var(--popover-foreground))',
          '--normal-border': 'hsl(var(--border))',
          '--error-bg': 'hsl(var(--destructive))',
          '--error-text': 'hsl(var(--destructive-foreground))',
          '--error-border': 'hsl(var(--destructive))',
          '--success-bg': 'hsl(var(--success))',
          '--success-text': 'hsl(var(--success-foreground))',
          '--success-border': 'hsl(var(--success))',
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster, toast };
