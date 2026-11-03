import Image from 'next/image';
import { SiteHeader } from './SiteHeader';
import { SiteFooter } from './SiteFooter';
import { APP_ORIGIN, TESTFLIGHT_URL, type SiteLocale } from '@/lib/site/config';
import { SCREENSHOTS, featureRequestHref, getSiteCopy } from '@/lib/site/content';

import { shotFile } from '@/lib/site/screens';

function DownloadCta({ label, soonLabel }: { label: string; soonLabel: string }) {
  if (TESTFLIGHT_URL) {
    return (
      <a
        href={TESTFLIGHT_URL}
        className="bg-primary text-primary-foreground inline-block rounded-full px-6 py-2.5 font-medium"
      >
        {label}
      </a>
    );
  }
  return (
    <span
      aria-disabled="true"
      className="bg-secondary text-muted-foreground inline-block cursor-default rounded-full px-6 py-2.5"
    >
      {soonLabel}
    </span>
  );
}

export function LandingPage({ locale }: { locale: SiteLocale }) {
  const t = getSiteCopy(locale);
  const shots = SCREENSHOTS.map((s) => ({ ...s, src: shotFile(locale, s.file) }));
  const hero = shots[0]!;

  return (
    <>
      <SiteHeader t={t} />
      <main>
        <section className="mx-auto grid max-w-5xl items-center gap-10 px-4 py-16 sm:grid-cols-2">
          <div className="space-y-5">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{t.hero.headline}</h1>
            <p className="text-muted-foreground text-lg">{t.hero.sub}</p>
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <a
                href={APP_ORIGIN}
                className="border-border hover:bg-secondary inline-block rounded-full border px-6 py-2.5 font-medium"
                data-testid="hero-open-app"
              >
                {t.hero.openApp}
              </a>
              <DownloadCta label={t.hero.download} soonLabel={t.hero.downloadSoon} />
            </div>
          </div>
          <div className="mx-auto w-full max-w-xs sm:max-w-sm">
            <Image
              src={hero.src}
              alt={t.hero.heroAlt}
              width={660}
              height={1434}
              priority
              className="h-auto w-full rounded-[2rem] shadow-2xl"
            />
          </div>
        </section>

        <section className="bg-secondary/40 border-y">
          <div className="mx-auto max-w-5xl px-4 py-14">
            <h2 className="text-2xl font-semibold">{t.glance.title}</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {t.glance.items.map((item) => (
                <div key={item.title} className="bg-card rounded-2xl p-6">
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="text-muted-foreground mt-2 text-sm">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="screenshots" className="mx-auto max-w-5xl scroll-mt-16 px-4 py-14">
          <h2 className="text-2xl font-semibold">{t.shots.title}</h2>
          <div className="mt-8 flex snap-x snap-mandatory gap-5 overflow-x-auto pb-4">
            {shots.map((shot) => (
              <figure
                key={shot.id}
                className="bg-card w-56 shrink-0 snap-start overflow-hidden rounded-2xl"
              >
                <Image
                  src={shot.src}
                  alt={shot.alt[locale]}
                  width={448}
                  height={972}
                  className="h-auto w-full object-cover"
                />
                <figcaption className="text-muted-foreground p-3 text-center text-sm">
                  {shot.alt[locale]}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section id="features" className="bg-secondary/40 scroll-mt-16 border-y">
          <div className="mx-auto max-w-5xl space-y-16 px-4 py-16">
            {t.features.map((feature, i) => {
              const shot = (shots.find((s) => s.id === feature.shotId) ?? shots[0])!;
              const flipped = i % 2 === 1;
              return (
                <div
                  key={feature.title}
                  className={`grid items-center gap-8 sm:grid-cols-2 ${flipped ? 'sm:[&>*:first-child]:order-2' : ''}`}
                >
                  <div className="space-y-3">
                    <h3 className="text-xl font-semibold">{feature.title}</h3>
                    <p className="text-muted-foreground">{feature.body}</p>
                  </div>
                  <div className="mx-auto w-full max-w-[16rem]">
                    <Image
                      src={shot.src}
                      alt={shot.alt[locale]}
                      width={528}
                      height={1148}
                      className="h-auto w-full rounded-[1.75rem] shadow-xl"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section id="faq" className="mx-auto max-w-3xl scroll-mt-16 px-4 py-16">
          <h2 className="text-2xl font-semibold">{t.faq.title}</h2>
          <div className="mt-8 space-y-3">
            {t.faq.items.slice(0, 4).map((item) => (
              <details key={item.q} className="bg-card group rounded-2xl px-5 py-4">
                <summary className="cursor-pointer font-medium marker:content-none">
                  {item.q}
                </summary>
                <p className="text-muted-foreground mt-3 text-sm">{item.a}</p>
              </details>
            ))}
            <details className="bg-card group rounded-2xl px-5 py-4">
              <summary className="cursor-pointer font-medium marker:content-none">
                {t.faq.items[4]!.q}
              </summary>
              <p className="text-muted-foreground mt-3 text-sm">
                {t.faq.items[4]!.a}{' '}
                <a href={featureRequestHref(locale)} className="text-primary font-medium underline">
                  {t.faq.requestLink}
                </a>
              </p>
            </details>
          </div>
        </section>

        <section className="bg-secondary/40 border-t">
          <div className="mx-auto max-w-5xl px-4 py-16 text-center">
            <h2 className="text-3xl font-bold">{t.cta.title}</h2>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
              <a
                href={APP_ORIGIN}
                className="bg-primary text-primary-foreground inline-block rounded-full px-8 py-3 font-medium"
              >
                {t.cta.openApp}
              </a>
              <DownloadCta label={t.hero.download} soonLabel={t.hero.downloadSoon} />
            </div>
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
