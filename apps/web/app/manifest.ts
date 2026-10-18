import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'LukiFitti — Personal Gym & Workout Tracker',
    short_name: 'LukiFitti',
    description:
      'Offline-first personal gym workout tracker, routine builder, stretching flows, and progress analytics.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0B0D10',
    theme_color: '#0B0D10',
    categories: ['fitness', 'health', 'sports', 'lifestyle'],
    icons: [
      {
        src: '/icon-192.svg',
        sizes: '192x192',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icon-512.svg',
        sizes: '512x512',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}
