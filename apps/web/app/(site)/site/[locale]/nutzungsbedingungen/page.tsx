// TODO(legal): draft only — needs legal review before going public.
import { notFound } from 'next/navigation';
import { LegalPage } from '@/components/site/LegalPage';
import { getSiteCopy, SITE_LOCALES, type SiteLocale } from '@/lib/site/config';


export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!SITE_LOCALES.includes(locale as SiteLocale)) notFound();
  const t = getSiteCopy(locale as SiteLocale);
  return (
    <LegalPage t={t} locale={locale as SiteLocale} title={t.legal.nutzungsbedingungenTitle}>
      {locale === 'de' ? (
        <>
<section>
        <h2>Der Dienst</h2>
        <p>
          LukiFitti ist ein Workout-Tracker für iPhone, Apple Watch und das Web: Workouts planen
          und protokollieren, Ernährung und Körpergewicht verfolgen sowie Stretching-Einheiten.
        </p>
      </section>
      <section>
        <h2>Kosten und Gewährleistung</h2>
        <p>
          Der Dienst ist kostenlos und wird ohne Gewährleistung bereitgestellt. Wir bemühen uns um
          Verfügbarkeit, garantieren sie aber nicht.
        </p>
      </section>
      <section>
        <h2>Gesundheit</h2>
        <p>
          Sprich vor dem Training mit einem Arzt, besonders bei Vorerkrankungen. Inhalte der App
          sind keine medizinische Beratung. Beende das Training bei Schmerzen.
        </p>
      </section>
      <section>
        <h2>Deine Pflichten</h2>
        <p>
          Halte deine Zugangsdaten geheim und nutze den Dienst nur rechtmäßig. Trainings- und
          KI-Schätzwerte können falsch sein — prüfe sie nach eigenem Ermessen.
        </p>
      </section>
      <section>
        <h2>KI-Funktionen</h2>
        <p>
          KI-Funktionen laufen über deinen eigenen OpenRouter-Schlüssel. Kosten und
          OpenRouter-Nutzungsbedingungen liegen in deiner Verantwortung.
        </p>
      </section>
      <section>
        <h2>Kündigung</h2>
        <p>
          Du kannst dein Konto jederzeit in der App löschen. Wir können Konten bei Missbrauch
          sperren.
        </p>
      </section>
      <section>
        <h2>Änderungen und Recht</h2>
        <p>
          Wir können diese Bedingungen anpassen; wesentliche Änderungen teilen wir mit. Es gilt
          deutsches Recht.
        </p>
      </section>
        </>
      ) : (
        <>
<section>
        <h2>The service</h2>
        <p>
          LukiFitti is a workout tracker for iPhone, Apple Watch and the web: plan and log
          workouts, track nutrition and body weight, and follow stretching sessions.
        </p>
      </section>
      <section>
        <h2>Cost and warranty</h2>
        <p>
          The service is free and provided without warranty. We aim for availability but do not
          guarantee it.
        </p>
      </section>
      <section>
        <h2>Health</h2>
        <p>
          Consult a doctor before training, especially with pre-existing conditions. Content in
          the app is not medical advice. Stop exercising if you feel pain.
        </p>
      </section>
      <section>
        <h2>Your responsibilities</h2>
        <p>
          Keep your credentials safe and use the service lawfully. Training and AI estimates may
          be wrong — review them at your own discretion.
        </p>
      </section>
      <section>
        <h2>AI features</h2>
        <p>
          AI features run on your own OpenRouter key. Costs and OpenRouter's terms are your
          responsibility.
        </p>
      </section>
      <section>
        <h2>Termination</h2>
        <p>
          You can delete your account at any time in the app. We may suspend abusive accounts.
        </p>
      </section>
      <section>
        <h2>Changes and law</h2>
        <p>
          We may update these terms; material changes will be communicated. German law applies.
        </p>
      </section>
        </>
      )}
    </LegalPage>
  );
}
