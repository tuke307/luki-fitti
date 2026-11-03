// TODO(legal): draft only — needs legal review before going public.
import { LegalPage } from '@/components/site/LegalPage';
import { getCopy } from '@/lib/site/copy';

export const dynamic = 'force-static';
export const metadata = { title: 'Privacy Policy — LukiFitti' };

export default function Privacy() {
  const t = getCopy('en');
  return (
    <LegalPage t={t} locale="en" title={t.legal.datenschutzTitle}>
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
          <li>Apple Health data you sync in the app (heart rate, active energy, body weight).</li>
          <li>Meal photos you upload — stored in private S3-compatible storage.</li>
          <li>Your OpenRouter key if you use AI features — stored encrypted.</li>
        </ul>
      </section>
      <section>
        <h2>AI features</h2>
        <p>
          Requests to OpenRouter (workout suggestions, meal analysis) are only sent when you use
          an AI feature with your own key. OpenRouter's privacy policy applies.
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
          You have the rights under Art. 15–21 GDPR (access, rectification, erasure, restriction,
          portability, objection) and the right to lodge a complaint with a supervisory authority.
        </p>
      </section>
    </LegalPage>
  );
}
