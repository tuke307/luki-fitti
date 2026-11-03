// TODO(legal): draft only — needs legal review before going public.
import { LegalPage } from '@/components/site/LegalPage';
import { getCopy } from '@/lib/site/copy';

export const dynamic = 'force-static';
export const metadata = { title: 'Nutzungsbedingungen — LukiFitti' };

export default function Nutzungsbedingungen() {
  const t = getCopy('de');
  return (
    <LegalPage t={t} locale="de" title={t.legal.nutzungsbedingungenTitle}>
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
    </LegalPage>
  );
}
