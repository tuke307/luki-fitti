// TODO(legal): draft only — needs legal review before going public.
// TODO(legal): postal address required by §5 DDG before going public.
import { LegalPage } from '@/components/site/LegalPage';
import { getCopy } from '@/lib/site/copy';

export const dynamic = 'force-static';
export const metadata = { title: 'Imprint — LukiFitti' };

export default function Imprint() {
  const t = getCopy('en');
  return (
    <LegalPage t={t} locale="en" title={t.legal.impressumTitle}>
      <section>
        <h2>Information pursuant to § 5 DDG</h2>
        <p>
          Tony Meißner
          <br />
          [Address to follow]
          <br />
          Email:{' '}
          <a href="mailto:tonymeissner70@gmail.com" className="text-primary underline">
            tonymeissner70@gmail.com
          </a>
        </p>
      </section>
    </LegalPage>
  );
}
