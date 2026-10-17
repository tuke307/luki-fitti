'use client';

import * as React from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      enableSystem={false}
      defaultTheme="light"
      // Single-theme site: force light even over a stale
      // localStorage preference from an older site version.
      forcedTheme="light"
      disableTransitionOnChange
      enableColorScheme
    >
      {children}
    </NextThemesProvider>
  );
}
