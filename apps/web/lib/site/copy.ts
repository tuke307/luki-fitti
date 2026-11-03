import { buildFeatureRequestMailto } from '@luki-fitti/common/utils';

export type SiteLocale = 'de' | 'en';

export const APP_URL =
  process.env.NEXT_PUBLIC_APP_ORIGIN ?? 'https://app.luki-fitti.tony-luke.de';
export const TESTFLIGHT_URL = process.env.NEXT_PUBLIC_TESTFLIGHT_URL ?? '';

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
    id: 'suggestion',
    file: '02-suggestion.png',
    alt: { de: 'Satzvorschlag mit Gewichtsempfehlung', en: 'Set suggestion with weight hint' },
  },
  {
    id: 'watch',
    file: '03-watch.png',
    alt: { de: 'Training auf der Apple Watch', en: 'Workout on Apple Watch' },
  },
  {
    id: 'exercises',
    file: '04-exercises.png',
    alt: { de: 'Übungsbibliothek mit Fotos', en: 'Exercise library with photos' },
  },
  {
    id: 'history',
    file: '05-history.png',
    alt: { de: 'Trainingsverlauf und Fortschritt', en: 'Workout history and progress' },
  },
  {
    id: 'meal',
    file: '06-meal.png',
    alt: { de: 'Mahlzeiten-Foto mit KI-Analyse', en: 'Meal photo with AI analysis' },
  },
];

const de = {
  nav: { features: 'Funktionen', screenshots: 'Screenshots', faq: 'FAQ', openApp: 'App öffnen', download: 'Download', switchTo: 'English', switchHref: '/en' },
  hero: {
    headline: 'Trainiere. Protokolliere. Werde stärker.',
    sub: 'Der Workout-Tracker für iPhone, Apple Watch und Web — offline nutzbar, ohne Schnickschnack.',
    openApp: 'App öffnen',
    download: 'Im App Store laden',
    downloadSoon: 'Bald im App Store',
    heroAlt: 'LukiFitti aktives Training auf dem iPhone',
  },
  glance: {
    title: 'Auf einen Blick',
    items: [
      { title: 'Funktioniert offline', body: 'Workout starten, Sätze loggen, weiter synchronisieren sobald du wieder online bist.' },
      { title: 'Weiß, wann mehr drin ist', body: 'Vorschläge für Gewicht und Wiederholungen, abgeleitet aus deinem letzten Training.' },
      { title: 'iPhone & Watch im Takt', body: 'Auf der Watch anfangen, am iPhone weiter — Puls und Pausen bleiben synchron.' },
    ],
  },
  shots: { title: 'So sieht es aus' },
  features: [
    { title: 'Workouts & Progression', body: 'Plane Vorlagen, logge jeden Satz mit einem Tipp und sieh, wann du Gewicht oder Wiederholungen steigern solltest. Dein Verlauf zeigt dir Woche für Woche, was sich tut.', shotId: 'suggestion' },
    { title: 'Apple Watch', body: 'Trainiere komplett vom Handgelenk: Sätze abhaken, Puls live sehen, Rest-Timer mit Vibration und Live Activity auf dem Sperrbildschirm.', shotId: 'watch' },
    { title: 'Stretching-Studio', body: 'Dehnübungen mit Anleitung und Timer — direkt aus dem Workout oder als eigene Einheit.', shotId: 'exercises' },
    { title: 'Kalorien & Mahlzeiten-Foto', body: 'Fotografiere dein Essen und lass dir Kalorien und Makros schätzen. Optional, mit deinem eigenen OpenRouter-Schlüssel.', shotId: 'meal' },
    { title: 'KI — nur wenn du willst', body: 'Workout-Vorschläge und Essensanalyse laufen über deinen eigenen OpenRouter-Key. Kein Abo, keine Credits, deine Kosten.', shotId: 'history' },
  ],
  faq: {
    title: 'Häufige Fragen',
    items: [
      { q: 'Was ist LukiFitti?', a: 'Ein Workout-Tracker für Krafttraining und Stretching — auf iPhone, Apple Watch und im Web. Du planst Workouts, loggst Sätze und siehst deinen Fortschritt.' },
      { q: 'Funktioniert LukiFitti offline?', a: 'Ja. Ein Workout läuft komplett offline; sobald du wieder online bist, synchronisiert die App auf allen Geräten.' },
      { q: 'Was kostet LukiFitti?', a: 'Die App ist kostenlos. KI-Funktionen (Workout-Planung, Essensanalyse) nutzen deinen eigenen OpenRouter-Schlüssel — du zahlst OpenRouter direkt und nur für deine Nutzung.' },
      { q: 'Was passiert mit meinen Daten?', a: 'Deine Daten liegen auf unserem Server in Deutschland. OpenRouter-Schlüssel werden verschlüsselt gespeichert. Es gibt keine Werbung und kein Tracking — nur datenschutzfreundliche, aggregierte Seitenaufrufe über Umami.' },
      { q: 'Wie kann ich ein Feature wünschen?', a: 'Schreib uns einfach — wir freuen uns über Ideen.' },
    ],
    requestLink: 'Feature wünschen',
  },
  cta: { title: 'Starte dein nächstes Workout.', openApp: 'App öffnen' },
  footer: { impressum: 'Impressum', datenschutz: 'Datenschutz', nutzungsbedingungen: 'Nutzungsbedingungen', copyright: '© 2026 Tony Meißner' },
  legal: { impressumTitle: 'Impressum', datenschutzTitle: 'Datenschutzerklärung', nutzungsbedingungenTitle: 'Nutzungsbedingungen' },
} as const;

const en = {
  nav: { features: 'Features', screenshots: 'Screenshots', faq: 'FAQ', openApp: 'Open app', download: 'Download', switchTo: 'Deutsch', switchHref: '/' },
  hero: {
    headline: 'Train. Log. Get stronger.',
    sub: 'The workout tracker for iPhone, Apple Watch and the web — fully usable offline, no fluff.',
    openApp: 'Open app',
    download: 'Download on the App Store',
    downloadSoon: 'Coming soon to the App Store',
    heroAlt: 'LukiFitti active workout on iPhone',
  },
  glance: {
    title: 'At a glance',
    items: [
      { title: 'Works offline', body: 'Start a workout, log your sets, everything syncs once you are back online.' },
      { title: 'Knows when to push', body: 'Weight and rep suggestions derived from your last session, right where you log.' },
      { title: 'iPhone & Watch in sync', body: 'Start on the wrist, finish on the phone — heart rate and rest timers stay aligned.' },
    ],
  },
  shots: { title: 'See it in action' },
  features: [
    { title: 'Workouts & progression', body: 'Plan templates, log each set with one tap, and see when it is time to add weight or reps. Your history shows progress week by week.', shotId: 'suggestion' },
    { title: 'Apple Watch', body: 'Train entirely from your wrist: check off sets, see live heart rate, rest timers with haptics and Live Activity on the lock screen.', shotId: 'watch' },
    { title: 'Stretching studio', body: 'Guided stretches with timers — right inside your workout or as a session of its own.', shotId: 'exercises' },
    { title: 'Calories & meal photos', body: 'Snap a photo of your meal and get calories and macros estimated. Optional, with your own OpenRouter key.', shotId: 'meal' },
    { title: 'AI — only if you want it', body: 'Workout plans and meal analysis run on your own OpenRouter key. No subscription, no credits — your key, your costs.', shotId: 'history' },
  ],
  faq: {
    title: 'FAQ',
    items: [
      { q: 'What is LukiFitti?', a: 'A workout tracker for strength training and stretching — on iPhone, Apple Watch and the web. Plan workouts, log sets, watch your progress.' },
      { q: 'Does it work offline?', a: 'Yes. A workout runs completely offline; everything syncs across your devices once you are back online.' },
      { q: 'What does it cost?', a: 'The app is free. AI features (workout planning, meal analysis) use your own OpenRouter key — you pay OpenRouter directly and only for what you use.' },
      { q: 'What happens to my data?', a: 'Your data is stored on our server in Germany. OpenRouter keys are stored encrypted. No ads, no tracking — only privacy-friendly, aggregated page views via Umami.' },
      { q: 'How do I request a feature?', a: 'Just write to us — we are happy to hear your ideas.' },
    ],
    requestLink: 'Request a feature',
  },
  cta: { title: 'Start your next workout.', openApp: 'Open app' },
  footer: { impressum: 'Imprint', datenschutz: 'Privacy', nutzungsbedingungen: 'Terms', copyright: '© 2026 Tony Meißner' },
  legal: { impressumTitle: 'Imprint', datenschutzTitle: 'Privacy Policy', nutzungsbedingungenTitle: 'Terms of Use' },
} as const;

export function getCopy(locale: SiteLocale) {
  return locale === 'de' ? de : en;
}

export function shotFile(locale: SiteLocale, file: string) {
  return `/screens/${locale}/${file}`;
}

export function featureRequestHref(locale: SiteLocale): string {
  return buildFeatureRequestMailto({ locale, appVersion: '1.0.0', platform: 'Web' });
}
