# Product

## Register

product

## Users

People who lift and stretch on their own schedule: recreational gym-goers who follow a split,
want to see steady progress, and train with their phone (and often an Apple Watch) on the bench
next to them. The core moment is between sets: sweaty hands, 60–180 seconds of rest, attention
measured in seconds. Outside the gym they occasionally plan workouts and look back at history on
a phone or laptop.

## Product Purpose

LukiFitti is an offline-first workout tracker for Web (PWA), iPhone and Apple Watch. It plans
splits, runs a workout set by set with a rest timer, suggests when to add weight or reps, guides
stretching routines, and keeps a diary. Success means a user opens the app, starts a workout,
logs every set with one tap and never thinks about sync, storage or the math behind suggestions.

## Brand Personality

Calm, confident, encouraging. The voice is a good training partner: short sentences, plain words,
no jargon, no shouting. Numbers carry the emotion (a new best, a full week), not exclamation marks
or neon. The app should feel like it belongs on an iPhone next to Apple Fitness and Gentler Streak.

## Anti-references

- Hacker / terminal dashboards: monospace everywhere, neon on near-black, ALL-CAPS labels.
- "Bro" gym apps: aggressive gradients, flames, lightning bolts, achievement spam.
- SaaS analytics dashboards: KPI tile grids, jargon titles ("Avg. Session Load"), dense charts
  on the home screen.
- Exposing implementation: sync badges that are always visible, version numbers, formula names
  (Epley, Brzycki, EWMA, OLS) in primary UI.

## Design Principles

1. **One thing at a time.** Every screen has one obvious next action; during a workout it is the
   current set.
2. **Familiar over clever.** Use platform patterns (tab bar, large titles, grouped lists, sheets)
   so nothing has to be learned.
3. **Plain language.** Say "This week · 2 of 4", not "7-Day Frequency". Hide the engine, show the
   outcome.
4. **Quiet until it matters.** System state (offline, syncing) only appears when the user needs to
   act on it.
5. **Forgiving.** Undo instead of confirm where possible; confirm only destructive actions.

## Accessibility & Inclusion

WCAG 2.2 AA. Body text ≥ 4.5:1 contrast in light and dark. Respect Dynamic Type on iOS/watchOS and
browser zoom on web (never disable pinch-zoom). Touch targets ≥ 44 pt. Honour reduced motion and
reduced transparency. Never rely on color alone for state. Full English and German parity.
