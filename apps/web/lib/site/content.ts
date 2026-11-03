import { buildFeatureRequestMailto } from '@luki-fitti/common/utils';

import { de } from '@/lib/i18n/locales/de';
import { en } from '@/lib/i18n/locales/en';
import type { SiteLocale } from './config';

export interface ScreenShot {
  id: string;
  file: string;
  alt: { de: string; en: string };
}

export const SCREENSHOTS: ScreenShot[] = [
  { id: 'active-workout', file: '01-active-workout.png', alt: { de: 'Aktives Training: Sätze abhaken', en: 'Active workout: checking off sets' } },
  { id: 'suggestion', file: '02-suggestion.png', alt: { de: 'Satzvorschlag mit Gewichtsempfehlung', en: 'Set suggestion with weight hint' } },
  { id: 'watch', file: '03-watch.png', alt: { de: 'Training auf der Apple Watch', en: 'Workout on Apple Watch' } },
  { id: 'exercises', file: '04-exercises.png', alt: { de: 'Übungsbibliothek mit Fotos', en: 'Exercise library with photos' } },
  { id: 'history', file: '05-history.png', alt: { de: 'Trainingsverlauf und Fortschritt', en: 'Workout history and progress' } },
  { id: 'meal', file: '06-meal.png', alt: { de: 'Mahlzeiten-Foto mit KI-Analyse', en: 'Meal photo with AI analysis' } },
];

/** Server-side site copy straight from the app dictionaries (no client locale context). */
export function getSiteCopy(locale: SiteLocale) {
  return (locale === 'de' ? de : en).site;
}


export function featureRequestHref(locale: SiteLocale): string {
  return buildFeatureRequestMailto({ locale, appVersion: '1.0.0', platform: 'Web' });
}
