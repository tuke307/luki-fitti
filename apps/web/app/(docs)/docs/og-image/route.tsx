import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';
import { source } from '@/lib/docs/source';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'LukiFitti Docs';

/** `/og-image?path=/public-api` — per-page OpenGraph card for the docs host. */
export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get('path') ?? '/';
  const slugs = path.split('/').filter(Boolean);
  const page = source.getPage(slugs);
  const title = (page?.data.title as string | undefined) ?? 'LukiFitti Docs';
  const description = (page?.data.description as string | undefined) ?? '';

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        padding: 72,
        background: '#000000',
        color: '#F5F5F7',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          marginBottom: 28,
          fontSize: 28,
          color: '#A1A1A6',
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: '#E85D3D',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: 26,
            fontWeight: 700,
          }}
        >
          L
        </div>
        LukiFitti Docs
      </div>
      <div
        style={{
          fontSize: title.length > 40 ? 60 : 72,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          lineHeight: 1.1,
          marginBottom: description ? 20 : 0,
        }}
      >
        {title}
      </div>
      {description ? (
        <div style={{ fontSize: 30, color: '#A1A1A6', lineHeight: 1.4 }}>
          {description.slice(0, 120)}
        </div>
      ) : null}
    </div>,
    size,
  );
}
