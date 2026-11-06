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

/**
 * Like {@link shotFile} but also reads the intrinsic PNG size from the IHDR
 * (bytes 16–23). Returns null when the file is missing in both locales.
 */
export function shotInfo(
  locale: SiteLocale,
  file: string,
): { src: string; width: number; height: number } | null {
  let lang = locale;
  if (!existsSync(`public/screens/${locale}/${file}`)) {
    const other = locale === 'de' ? 'en' : 'de';
    if (existsSync(`public/screens/${other}/${file}`)) lang = other;
    else return null;
  }
  const buf = readFileSync(`public/screens/${lang}/${file}`);
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const hash = createHash('md5').update(buf).digest('hex').slice(0, 8);
  return { src: `/screens/${lang}/${file}?v=${hash}`, width, height };
}
