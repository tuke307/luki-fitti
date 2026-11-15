import { buildFeatureRequestMailto } from '@luki-fitti/common/utils';

import pkg from '../../package.json';

import { de } from '@/lib/i18n/locales/de';
import { en } from '@/lib/i18n/locales/en';
import type { SiteLocale } from './config';

export interface ScreenShot {
  id: string;
  file: string;
  alt: { de: string; en: string };
}

export const SCREENSHOTS: ScreenShot[] = [
  {
    id: 'active-workout',
    file: '01-active-workout.png',
    alt: { de: 'Aktives Training: Sätze abhaken', en: 'Active workout: checking off sets' },
  },
  {
    id: 'meal',
    file: '02-meal.png',
    alt: { de: 'Mahlzeiten-Foto mit KI-Analyse', en: 'Meal photo with AI analysis' },
  },
  {
    id: 'suggestion',
    file: '03-suggestion.png',
    alt: { de: 'Satzvorschlag mit Gewichtsempfehlung', en: 'Set suggestion with weight hint' },
  },
  {
    id: 'watch',
    file: '04-watch.png',
    alt: { de: 'Training auf der Apple Watch', en: 'Workout on Apple Watch' },
  },
  {
    id: 'exercises',
    file: '05-exercises.png',
    alt: { de: 'Übungsbibliothek mit Fotos', en: 'Exercise library with photos' },
  },
  {
    id: 'history',
    file: '06-history.png',
    alt: { de: 'Trainingsverlauf und Fortschritt', en: 'Workout history and progress' },
  },
];

/** Hero device switcher: same moment on iPhone, iPad and Apple Watch. */
export const HERO_DEVICES = [
  {
    id: 'iphone',
    label: 'iPhone',
    file: '01-active-workout.png',
    width: 360,
    alt: { de: 'Aktives Training auf dem iPhone', en: 'Active workout on iPhone' },
  },
  {
    id: 'ipad',
    label: 'iPad',
    file: 'ipad/01-active-workout.png',
    width: 440,
    alt: { de: 'Aktives Training auf dem iPad', en: 'Active workout on iPad' },
  },
  {
    id: 'watch',
    label: 'Apple Watch',
    file: '04-watch.png',
    width: 260,
    alt: { de: 'Aktives Training auf der Apple Watch', en: 'Active workout on Apple Watch' },
  },
] as const;

/** Apps people switch from; add new ones here. App names stay untranslated. */
export const SWITCH_APPS = ['GymLife', 'Alpha Progression', 'MCI', 'YAZIO'] as const;

/** Server-side site copy straight from the app dictionaries (no client locale context). */
export function getSiteCopy(locale: SiteLocale) {
  return (locale === 'de' ? de : en).site;
}

export function featureRequestHref(locale: SiteLocale): string {
  return buildFeatureRequestMailto({ locale, appVersion: pkg.version, platform: 'Web' });
}
