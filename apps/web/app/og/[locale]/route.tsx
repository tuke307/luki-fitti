import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { notFound } from 'next/navigation';
import { SITE_LOCALES, type SiteLocale } from '@/lib/site/config';
import { getSiteCopy } from '@/lib/site/content';

export const dynamic = 'force-static';

const TAGLINE: Record<SiteLocale, string> = {
  de: 'Kostenlos · Open Source · iPhone, Apple Watch & Web',
  en: 'Free · Open source · iPhone, Apple Watch & Web',
};

export function generateStaticParams() {
  return SITE_LOCALES.map((locale) => ({ locale }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!SITE_LOCALES.includes(locale as SiteLocale)) notFound();
  const lang = locale as SiteLocale;
  const t = getSiteCopy(lang);

  const shot = await readFile(
    path.join(process.cwd(), 'public', 'screens', lang, '01-active-workout.png'),
  );
  const shotUrl = `data:image/png;base64,${shot.toString('base64')}`;

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#000000',
        backgroundImage:
          'radial-gradient(circle at 85% 50%, rgba(223,139,34,0.28), transparent 55%)',
        padding: '64px 80px',
        color: '#ffffff',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 700 }}>
        <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: -2 }}>LukiFitti</div>
        <div
          style={{
            fontSize: 44,
            fontWeight: 600,
            letterSpacing: -1,
            marginTop: 24,
            lineHeight: 1.15,
            color: '#F07A1A',
          }}
        >
          {t.hero.headline}
        </div>
        <div style={{ fontSize: 24, color: 'rgba(255,255,255,0.65)', marginTop: 32 }}>
          {TAGLINE[lang]}
        </div>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={shotUrl} width={240} height={495} style={{ borderRadius: 32 }} alt="" />
    </div>,
    { width: 1200, height: 630 },
  );
}
