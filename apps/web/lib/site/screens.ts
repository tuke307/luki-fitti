import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

import type { SiteLocale } from './config';

// Server-only: reads the generated screenshots from disk for fallback + cache-bust.
export function shotFile(locale: SiteLocale, file: string) {
  let lang = locale;
  if (!existsSync(`public/screens/${locale}/${file}`)) {
    const other = locale === 'de' ? 'en' : 'de';
    if (existsSync(`public/screens/${other}/${file}`)) lang = other;
  }
  const hash = createHash('md5')
    .update(readFileSync(`public/screens/${lang}/${file}`))
    .digest('hex')
    .slice(0, 8);
  return `/screens/${lang}/${file}?v=${hash}`;
}
