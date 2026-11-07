import Image from 'next/image';
import { SiGithub } from '@icons-pack/react-simple-icons';
import {
  ChevronDown,
  HeartHandshake,
  KeyRound,
  TrendingUp,
  Users,
  Watch,
  WifiOff,
} from 'lucide-react';

import { SiteHeader } from './SiteHeader';
import { SiteFooter } from './SiteFooter';
import { AppStoreBadge } from './AppStoreBadge';
import { HeroDeviceSwitcher } from './HeroDeviceSwitcher';
import { APP_ORIGIN, GITHUB_URL, TESTFLIGHT_URL, type SiteLocale } from '@/lib/site/config';
import { featureRequestHref, getSiteCopy, HERO_DEVICES, SCREENSHOTS } from '@/lib/site/content';
import { shotFile, shotInfo } from '@/lib/site/screens';

const GLANCE_ICONS = [WifiOff, TrendingUp, Watch] as const;
const OPEN_SOURCE_ICONS = [HeartHandshake, Users, KeyRound] as const;

/** Responsive display widths for the hero device images. */
const HERO_DEVICE_WIDTHS: Record<string, string> = {
  iphone: 'w-[300px]',
  ipad: 'w-[340px] lg:w-[400px]',
  watch: 'w-[240px] lg:w-[260px]',
};

function OpenAppCta({ label, className }: { label: string; className: string }) {
  return (
    <a
      href={APP_ORIGIN}
      className={`bg-primary text-primary-foreground inline-flex items-center justify-center rounded-full font-medium transition-[filter] hover:brightness-110 ${className}`}
      data-testid="hero-open-app"
    >
      {label}
    </a>
  );
}

function DownloadNote({ label }: { label: string }) {
  if (!TESTFLIGHT_URL) {
    return null;
  }
  return (
    <a
      href={TESTFLIGHT_URL}
      className="bg-secondary text-foreground inline-flex h-12 items-center justify-center rounded-full px-7 text-base font-medium transition-[filter] hover:brightness-110"
    >
      {label}
    </a>
  );
}

function ShotImage({
  src,
  alt,
  width,
  className,
  priority = false,
}: {
  src: string;
  alt: string;
  width: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={src}
      alt={alt}
      width={width * 2}
      height={Math.round(width * 2 * 2.17)}
      priority={priority}
      className={`drop-shadow-[0_30px_60px_rgba(0,0,0,0.55)] ${className ?? ''}`}
      unoptimized
    />
  );
}

export function LandingPage({ locale }: { locale: SiteLocale }) {
  const t = getSiteCopy(locale);
  const shots = Object.fromEntries(
    SCREENSHOTS.map((s) => [s.id, { ...s, src: shotFile(locale, s.file) }]),
  );
  const hero = shots['active-workout']!;
  const heroDevices = HERO_DEVICES.flatMap((d) => {
    const info = shotInfo(locale, d.file);
    return info
      ? [
          {
            id: d.id,
            label: d.label,
            src: info.src,
            alt: d.alt[locale],
            width: info.width,
            height: info.height,
            displayWidth: HERO_DEVICE_WIDTHS[d.id] ?? 'w-[300px]',
          },
        ]
      : [];
  });

  return (
    <>
      <SiteHeader t={t} />
      <main>
        {/* ---- hero ---------------------------------------------------- */}
        <section className="relative mx-auto grid min-h-[calc(100dvh-3.5rem)] max-w-[920px] items-center gap-12 px-4 pt-10 pb-16 sm:pt-12 lg:grid-cols-2 lg:gap-8 lg:py-12">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center lg:justify-end"
          >
            <div className="h-[640px] w-[640px] rounded-full bg-[radial-gradient(closest-side,oklch(0.72_0.16_50/0.22),transparent)]" />
          </div>
          <div className="site-hero-in space-y-6">
            <h1 className="text-5xl leading-[1.02] font-semibold tracking-[-0.03em] text-balance sm:text-6xl lg:text-7xl">
              {t.hero.headline}
            </h1>
            <p className="text-muted-foreground max-w-[34ch] text-lg text-pretty sm:text-xl">
              {t.hero.sub}
            </p>
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <OpenAppCta label={t.hero.openApp} className="h-12 px-7 text-base" />
              <DownloadNote label={t.hero.download} />
              <AppStoreBadge small={t.appStore.small} big={t.appStore.big} soon={t.appStore.soon} />
            </div>
          </div>
          <div className="site-hero-device mx-auto">
            <HeroDeviceSwitcher devices={heroDevices} tablistLabel={t.hero.deviceLabel} />
          </div>
        </section>

        {/* ---- highlights --------------------------------------------- */}
        <section className="mx-auto max-w-5xl px-4">
          <h2 className="sr-only">{t.glance.title}</h2>
          <div className="border-white/10 grid gap-8 border-t py-12 sm:grid-cols-3">
            {t.glance.items.map((item, i) => {
              const Icon = GLANCE_ICONS[i] ?? WifiOff;
              return (
                <div key={item.title} className="space-y-2">
                  <Icon size={20} className="text-primary" aria-hidden />
                  <h3 className="text-base font-semibold">{item.title}</h3>
                  <p className="text-muted-foreground text-sm">{item.body}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ---- features ----------------------------------------------- */}
        <section id="features" className="scroll-mt-16">
          <div className="mx-auto max-w-6xl px-4">
            {t.features.map((feature, i) => {
              if (!feature.shotId) {
                return (
                  <div
                    key={feature.title}
                    className="border-white/10 mx-auto max-w-2xl border-y py-14 text-center lg:py-20"
                  >
                    <h3 className="text-3xl font-semibold tracking-[-0.02em] text-balance sm:text-4xl">
                      {feature.title}
                    </h3>
                    <p className="text-muted-foreground mx-auto mt-4 max-w-[42ch] text-lg">
                      {feature.body}
                    </p>
                  </div>
                );
              }
              const shot = shots[feature.shotId] ?? hero;
              const extra =
                'extraShotId' in feature && feature.extraShotId ? shots[feature.extraShotId] : null;
              const flipped = i % 2 === 1;
              const isWatch = feature.shotId === 'watch';
              return (
                <div
                  key={feature.title}
                  className={`grid items-center gap-12 py-14 lg:grid-cols-[1fr_1.1fr] lg:gap-8 lg:py-20 ${
                    flipped ? 'lg:[&>*:first-child]:order-2' : ''
                  }`}
                >
                  <div className="space-y-4">
                    <h3 className="text-3xl font-semibold tracking-[-0.02em] text-balance sm:text-4xl">
                      {feature.title}
                    </h3>
                    <p className="text-muted-foreground max-w-[42ch] text-lg">{feature.body}</p>
                  </div>
                  <div className="relative mx-auto">
                    {extra && (
                      <ShotImage
                        src={extra.src}
                        alt=""
                        width={280}
                        className="absolute top-[6%] -translate-x-[42%] w-[280px] scale-90 opacity-90 hidden lg:block"
                      />
                    )}
                    <ShotImage
                      src={shot.src}
                      alt={shot.alt[locale]}
                      width={isWatch ? 300 : 280}
                      className={isWatch ? 'w-[300px]' : 'w-[280px]'}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ---- open source ---------------------------------------------- */}
        <section id="open-source" className="mx-auto max-w-5xl scroll-mt-16 px-4 py-20">
          <h2 className="text-center text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
            {t.openSource.title}
          </h2>
          <p className="text-muted-foreground mx-auto mt-4 max-w-[52ch] text-center text-lg">
            {t.openSource.lead}
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {t.openSource.items.map((item, i) => {
              const Icon = OPEN_SOURCE_ICONS[i] ?? HeartHandshake;
              return (
                <div key={item.title} className="bg-card space-y-2 rounded-2xl p-6">
                  <Icon size={20} className="text-primary" aria-hidden />
                  <h3 className="text-base font-semibold">{item.title}</h3>
                  <p className="text-muted-foreground text-sm">{item.body}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-10 flex justify-center">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-secondary text-foreground inline-flex h-12 items-center gap-2 rounded-full px-7 font-medium transition-[filter] hover:brightness-110"
              data-testid="open-source-github"
            >
              <SiGithub size={18} aria-hidden />
              {t.openSource.cta}
            </a>
          </div>
        </section>

        {/* ---- faq ------------------------------------------------------ */}
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-16 px-4 py-20">
          <h2 className="text-3xl font-semibold tracking-[-0.02em]">{t.faq.title}</h2>
          <div className="bg-card divide-white/10 mt-8 divide-y rounded-2xl">
            {t.faq.items.slice(0, 4).map((item) => (
              <details key={item.q} className="group">
                <summary className="flex min-h-14 cursor-pointer items-center justify-between px-5 font-medium marker:content-none">
                  {item.q}
                  <ChevronDown
                    size={18}
                    className="text-muted-foreground shrink-0 transition-transform group-open:rotate-180"
                    aria-hidden
                  />
                </summary>
                <p className="text-muted-foreground px-5 pb-5">{item.a}</p>
              </details>
            ))}
            <details className="group">
              <summary className="flex min-h-14 cursor-pointer items-center justify-between px-5 font-medium marker:content-none">
                {t.faq.items[4]!.q}
                <ChevronDown
                  size={18}
                  className="text-muted-foreground shrink-0 transition-transform group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <p className="text-muted-foreground px-5 pb-5">
                {t.faq.items[4]!.a}{' '}
                <a
                  href={featureRequestHref(locale)}
                  className="text-primary font-medium underline underline-offset-4"
                >
                  {t.faq.requestLink}
                </a>
              </p>
            </details>
          </div>
        </section>

        {/* ---- final cta ------------------------------------------------ */}
        <section className="mx-auto max-w-5xl px-4 py-28 text-center">
          <h2 className="text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">{t.cta.title}</h2>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <OpenAppCta label={t.cta.openApp} className="h-12 px-7 text-base" />
            <DownloadNote label={t.hero.download} />
            <AppStoreBadge small={t.appStore.small} big={t.appStore.big} soon={t.appStore.soon} />
          </div>
        </section>
      </main>
      <SiteFooter t={t} locale={locale} />

      {/* Installed PWAs on the old origin open the app on its new subdomain. */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            "if(window.matchMedia('(display-mode: standalone)').matches){location.replace('https://app.luki-fitti.tony-luke.de'+location.pathname+location.search)}",
        }}
      />
    </>
  );
}
