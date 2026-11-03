// TODO(legal): draft only — needs legal review before going public.
import { LegalPage } from '@/components/site/LegalPage';
import { getCopy } from '@/lib/site/copy';

export const dynamic = 'force-static';
export const metadata = { title: 'Terms of Use — LukiFitti' };

export default function Terms() {
  const t = getCopy('en');
  return (
    <LegalPage t={t} locale="en" title={t.legal.nutzungsbedingungenTitle}>
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
    </LegalPage>
  );
}
