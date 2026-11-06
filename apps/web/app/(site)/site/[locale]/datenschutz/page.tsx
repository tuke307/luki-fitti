// TODO(legal): draft only — needs legal review before going public.
import { SITE_LOCALES, type SiteLocale } from '@/lib/site/config';
import { notFound } from 'next/navigation';
import { LegalPage } from '@/components/site/LegalPage';
import { getSiteCopy } from '@/lib/site/content';

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!SITE_LOCALES.includes(locale as SiteLocale)) notFound();
  const t = getSiteCopy(locale as SiteLocale);
  return (
    <LegalPage t={t} locale={locale as SiteLocale} title={t.legal.datenschutzTitle}>
      {locale === 'de' ? (
        <>
          <section>
            <h2>Verantwortlicher</h2>
            <p>
              Tony Meißner, E-Mail:{' '}
              <a href="mailto:tonymeissner70@gmail.com" className="text-primary underline">
                tonymeissner70@gmail.com
              </a>
            </p>
          </section>
          <section>
            <h2>Welche Daten wir verarbeiten</h2>
            <ul>
              <li>Kontodaten: E-Mail-Adresse und optional dein Name.</li>
              <li>Trainings- und Ernährungsdaten, die du selbst einträgst.</li>
              <li>
                Apple-Health-Daten, die du in der App synchronisierst (Herzfrequenz, aktive Energie,
                Körpergewicht).
              </li>
              <li>
                Mahlzeiten-Fotos, die du hochlädst — in einem privaten S3-kompatiblen Speicher.
              </li>
              <li>
                Dein OpenRouter-Schlüssel, falls du KI-Funktionen nutzt — verschlüsselt gespeichert.
              </li>
            </ul>
          </section>
          <section>
            <h2>KI-Funktionen</h2>
            <p>
              Anfragen an OpenRouter (Workout-Vorschläge, Essensanalyse) werden nur gesendet, wenn
              du eine KI-Funktion mit deinem eigenen Schlüssel nutzt. Es gilt die
              OpenRouter-Datenschutzerklärung.
            </p>
          </section>
          <section>
            <h2>Hosting</h2>
            <p>Deine Daten liegen auf einem Server in Deutschland.</p>
          </section>
          <section>
            <h2>Analyse</h2>
            <p>
              Wir verwenden Umami für aggregierte Seitenaufrufe — cookielos und ohne
              personenbezogene Profile. Keine Werbung, kein Verkauf von Daten.
            </p>
          </section>
          <section>
            <h2>Speicherdauer und Löschung</h2>
            <p>
              Deine Daten bleiben gespeichert, solange dein Konto besteht. Das Löschen deines Kontos
              in der App entfernt deine Daten.
            </p>
          </section>
          <section>
            <h2>Deine Rechte</h2>
            <p>
              Du hast die Rechte nach Art. 15–21 DSGVO (Auskunft, Berichtigung, Löschung,
              Einschränkung, Datenübertragbarkeit, Widerspruch) sowie das Recht, dich bei einer
              Aufsichtsbehörde zu beschweren.
            </p>
          </section>
        </>
      ) : (
        <>
          <section>
            <h2>Controller</h2>
            <p>
              Tony Meißner, email:{' '}
              <a href="mailto:tonymeissner70@gmail.com" className="text-primary underline">
                tonymeissner70@gmail.com
              </a>
            </p>
          </section>
          <section>
            <h2>Data we process</h2>
            <ul>
              <li>Account data: your email address and optionally your name.</li>
              <li>Workout and nutrition data you enter yourself.</li>
              <li>
                Apple Health data you sync in the app (heart rate, active energy, body weight).
              </li>
              <li>Meal photos you upload — stored in private S3-compatible storage.</li>
              <li>Your OpenRouter key if you use AI features — stored encrypted.</li>
            </ul>
          </section>
          <section>
            <h2>AI features</h2>
            <p>
              Requests to OpenRouter (workout suggestions, meal analysis) are only sent when you use
              an AI feature with your own key. OpenRouter&rsquo;s privacy policy applies.
            </p>
          </section>
          <section>
            <h2>Hosting</h2>
            <p>Your data is stored on a server in Germany.</p>
          </section>
          <section>
            <h2>Analytics</h2>
            <p>
              We use Umami for aggregated page views — cookieless and without personal profiles. No
              advertising, no sale of data.
            </p>
          </section>
          <section>
            <h2>Retention and deletion</h2>
            <p>
              Your data is kept as long as your account exists. Deleting your account in the app
              removes your data.
            </p>
          </section>
          <section>
            <h2>Your rights</h2>
            <p>
              You have the rights under Art. 15–21 GDPR (access, rectification, erasure,
              restriction, portability, objection) and the right to lodge a complaint with a
              supervisory authority.
            </p>
          </section>
        </>
      )}
    </LegalPage>
  );
}
