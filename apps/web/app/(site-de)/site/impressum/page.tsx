// TODO(legal): draft only — needs legal review before going public.
// TODO(legal): postal address required by §5 DDG before going public.
import { LegalPage } from '@/components/site/LegalPage';
import { getCopy } from '@/lib/site/copy';

export const dynamic = 'force-static';
export const metadata = { title: 'Impressum — LukiFitti' };

export default function Impressum() {
  const t = getCopy('de');
  return (
    <LegalPage t={t} locale="de" title={t.legal.impressumTitle}>
      <section>
        <h2>Angaben gemäß § 5 DDG</h2>
        <p>
          Tony Meißner
          <br />
          [Anschrift folgt]
          <br />
          E-Mail:{' '}
          <a href="mailto:tonymeissner70@gmail.com" className="text-primary underline">
            tonymeissner70@gmail.com
          </a>
        </p>
      </section>
    </LegalPage>
  );
}
