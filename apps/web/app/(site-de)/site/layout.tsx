import type { Metadata, Viewport } from 'next';
import '@luki-fitti/ui/globals.css';

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export const metadata: Metadata = {
  metadataBase: new URL('https://luki-fitti.tony-luke.de'),
  title: 'LukiFitti — Workout-Tracker',
  description:
    'Plane deine Workouts, protokolliere jeden Satz und sieh deinen Fortschritt. Funktioniert offline auf iPhone, Apple Watch und im Web.',
  openGraph: {
    title: 'LukiFitti — Workout-Tracker',
    description:
      'Plane deine Workouts, protokolliere jeden Satz und sieh deinen Fortschritt — auf iPhone, Apple Watch und im Web.',
    images: ['/screens/de/01-active-workout.png'],
    type: 'website',
  },
};

/** Marketing site (German) — no app providers, no service worker, statically rendered. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="bg-background text-foreground min-h-dvh antialiased">{children}</body>
    </html>
  );
}
