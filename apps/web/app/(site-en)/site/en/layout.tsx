import type { Metadata, Viewport } from 'next';
import '@luki-fitti/ui/globals.css';

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export const metadata: Metadata = {
  metadataBase: new URL('https://luki-fitti.tony-luke.de'),
  title: 'LukiFitti — Workout Tracker',
  description:
    'Plan your workouts, log every set, and see your progress. Works offline on iPhone, Apple Watch and the web.',
  openGraph: {
    title: 'LukiFitti — Workout Tracker',
    description:
      'Plan your workouts, log every set, and see your progress — on iPhone, Apple Watch and the web.',
    images: ['/screens/en/01-active-workout.png'],
    type: 'website',
  },
};

/** Marketing site (English) — no app providers, no service worker, statically rendered. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground min-h-dvh antialiased">{children}</body>
    </html>
  );
}
