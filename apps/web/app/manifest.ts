import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'LukiFitti',
    short_name: 'LukiFitti',
    description:
      'Plan your workouts, log every set, and see your progress — even offline.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F2F2F7',
    theme_color: '#F2F2F7',
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
