// TODO(legal): draft only — needs legal review before going public.
import { LegalPage } from '@/components/site/LegalPage';
import { getCopy } from '@/lib/site/copy';

export const dynamic = 'force-static';
export const metadata = { title: 'Datenschutzerklärung — LukiFitti' };

export default function Datenschutz() {
  const t = getCopy('de');
  return (
    <LegalPage t={t} locale="de" title={t.legal.datenschutzTitle}>
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
          <li>Mahlzeiten-Fotos, die du hochlädst — in einem privaten S3-kompatiblen Speicher.</li>
          <li>
            Dein OpenRouter-Schlüssel, falls du KI-Funktionen nutzt — verschlüsselt gespeichert.
          </li>
        </ul>
      </section>
      <section>
        <h2>KI-Funktionen</h2>
        <p>
          Anfragen an OpenRouter (Workout-Vorschläge, Essensanalyse) werden nur gesendet, wenn du
          eine KI-Funktion mit deinem eigenen Schlüssel nutzt. Es gilt die
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
          Wir verwenden Umami für aggregierte Seitenaufrufe — cookielos und ohne personenbezogene
          Profile. Keine Werbung, kein Verkauf von Daten.
        </p>
      </section>
      <section>
        <h2>Speicherdauer und Löschung</h2>
        <p>
          Deine Daten bleiben gespeichert, solange dein Konto besteht. Das Löschen deines Kontos in
          der App entfernt deine Daten.
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
    </LegalPage>
  );
}
