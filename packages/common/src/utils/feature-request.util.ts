/** Where feature request emails go. */
export const FEEDBACK_EMAIL = 'tonymeissner70@gmail.com';

const SUBJECTS = { en: 'LukiFitti – Feature request', de: 'LukiFitti – Feature-Wunsch' } as const;
const BODIES = {
  en: 'What would you like?\n\n\nWhy would it help you?\n\n\n—',
  de: 'Was wünschst du dir?\n\n\nWobei würde dir das helfen?\n\n\n—',
} as const;

/**
 * Prefilled feature-request mailto link. `encodeURIComponent` keeps spaces as `%20` and
 * newlines as `%0A` — required for the body's paragraphs to survive in mail apps.
 */
export function buildFeatureRequestMailto(args: {
  locale: 'en' | 'de';
  appVersion: string;
  platform: string;
  os?: string;
}): string {
  const lang = args.locale === 'de' ? 'de' : 'en';
  const meta = [`App: LukiFitti ${args.appVersion} (${args.platform})`];
  if (args.os) meta.push(`System: ${args.os}`);
  const body = `${BODIES[lang]}\n${meta.join('\n')}`;
  return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(SUBJECTS[lang])}&body=${encodeURIComponent(body)}`;
}
