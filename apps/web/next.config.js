import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageVersion = createRequire(import.meta.url)('./package.json').version;

function gitSha() {
  if (process.env.GIT_SHA) return process.env.GIT_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: packageVersion,
    NEXT_PUBLIC_GIT_SHA: gitSha(),
  },
  async rewrites() {
    if (process.env.NODE_ENV === 'production') return [];
    return [
      {
        source: '/api/:path*',
        destination: `http://localhost:${process.env.API_PORT || 3001}/api/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              `script-src 'self' 'unsafe-inline'${
                process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'"
              }`,
              "style-src 'self' 'unsafe-inline'",
              // blob: = local previews of meal photos before upload (object URLs created in-page)
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self'",
              "frame-ancestors 'self'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
  reactStrictMode: true,
  transpilePackages: ['@luki-fitti/common', '@luki-fitti/ui', '@luki-fitti/logger'],
  output: 'standalone',
  outputFileTracingRoot: join(__dirname, '../../'),
};

export default nextConfig;
