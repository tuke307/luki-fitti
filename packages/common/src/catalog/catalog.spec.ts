import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SUPPORTED_LOCALES } from '../enums';
import type { ExerciseDto } from '../schemas';
import {
  DEFAULT_STARTER_FOLDERS,
  DEFAULT_STARTER_TEMPLATES,
  DEFAULT_STRETCHING_ROUTINES,
  INITIAL_EXERCISE_CATALOG,
} from './data';
import {
  getCatalogTranslation,
  localizeExercise,
  localizeTemplate,
  resolveSupportedLocale,
  SOURCE_LOCALE,
} from './localize';
import { buildStarterStretchingRoutines, buildStarterWorkouts } from './starter';

const translatedLocales = SUPPORTED_LOCALES.filter((l) => l !== SOURCE_LOCALE);

for (const locale of translatedLocales) {
  describe(`catalog translation completeness (${locale})`, () => {
    const tr = getCatalogTranslation(locale)!;

    it('translates every system exercise with the same number of steps', () => {
      for (const ex of INITIAL_EXERCISE_CATALOG) {
        const text = tr.exercises[ex.id];
        assert.ok(text, `missing translation for ${ex.id}`);
        assert.ok(text.name.trim() && text.description.trim(), `empty text for ${ex.id}`);
        assert.equal(text.instructions.length, ex.instructions.length, `step count for ${ex.id}`);
        for (const step of text.instructions) assert.ok(step.trim(), `empty step for ${ex.id}`);
      }
    });

    it('translates every starter folder, template, routine and note', () => {
      for (const f of DEFAULT_STARTER_FOLDERS) assert.ok(tr.folders[f.id], f.id);
      for (const t of DEFAULT_STARTER_TEMPLATES) assert.ok(tr.templates[t.id], t.id);
      for (const r of DEFAULT_STRETCHING_ROUTINES) assert.ok(tr.routines[r.id], r.id);
      const withNotes = [
        ...DEFAULT_STARTER_TEMPLATES.flatMap((t) => t.exercises),
        ...DEFAULT_STRETCHING_ROUTINES.flatMap((r) => r.exercises),
      ].filter((e) => e.notes);
      for (const e of withNotes) assert.ok(tr.notes[e.id], `note ${e.id}`);
    });

    it('has no stale keys', () => {
      const ids = (items: Array<{ id: string }>) => new Set(items.map((i) => i.id));
      const sections: Array<[Record<string, unknown>, Set<string>]> = [
        [tr.exercises, ids(INITIAL_EXERCISE_CATALOG)],
        [tr.folders, ids(DEFAULT_STARTER_FOLDERS)],
        [tr.templates, ids(DEFAULT_STARTER_TEMPLATES)],
        [tr.routines, ids(DEFAULT_STRETCHING_ROUTINES)],
        [
          tr.notes,
          ids([
            ...DEFAULT_STARTER_TEMPLATES.flatMap((t) => t.exercises),
            ...DEFAULT_STRETCHING_ROUTINES.flatMap((r) => r.exercises),
          ]),
        ],
      ];
      for (const [section, known] of sections) {
        for (const key of Object.keys(section)) assert.ok(known.has(key), `stale key ${key}`);
      }
    });
  });
}

describe('resolveSupportedLocale', () => {
  it('picks the first supported language of an Accept-Language header', () => {
    assert.equal(resolveSupportedLocale('de-DE,de;q=0.9,en;q=0.8'), 'de');
    assert.equal(resolveSupportedLocale('fr-FR, de;q=0.5'), 'de');
    assert.equal(resolveSupportedLocale('fr-FR'), 'en');
    assert.equal(resolveSupportedLocale(undefined), 'en');
  });
});

describe('catalog localization', () => {
  const bench = INITIAL_EXERCISE_CATALOG.find((e) => e.id === 'ex-barbell-bench-press')!;

  it('resolves system exercise text from the catalog and keeps the source name searchable', () => {
    const de = localizeExercise({ ...bench, name: 'stale db text' }, 'de');
    assert.equal(de.name, 'Bankdrücken (Langhantel)');
    assert.equal(de.instructions.length, bench.instructions.length);
    assert.ok(de.tags.includes('barbell bench press'));
    assert.equal(localizeExercise({ ...bench, name: 'stale db text' }, 'en').name, bench.name);
  });

  it('leaves custom exercises untouched', () => {
    const custom: ExerciseDto = { ...bench, id: 'custom-1', name: 'My Press', isSystem: false };
    assert.equal(localizeExercise(custom, 'de'), custom);
  });

  it('builds starter content linked by systemKey in the requested locale', () => {
    const { folders } = buildStarterWorkouts({ locale: 'de' });
    const tpl = folders[0]!.templates[0]!;
    assert.equal(folders[0]!.systemKey, 'folder-4er-split');
    assert.equal(folders[0]!.name, '4er-Split (Muskelaufbau)');
    assert.equal(tpl.name, 'Tag 1 — Brust & Trizeps');
    assert.equal(tpl.exercises[0]!.exercise?.name, 'Bankdrücken (Langhantel)');
    assert.equal(tpl.exercises[0]!.notes, 'Arbeitssätze mit 1 RIR. 1 s Pause auf der Brust.');

    const routine = buildStarterStretchingRoutines({ locale: 'de' })[0]!;
    assert.equal(routine.targetArea, 'Unterkörper & Hüfte');
  });

  it('switches language of untouched starter copies and keeps edited ones', () => {
    const tpl = buildStarterWorkouts({ locale: 'de' }).folders[0]!.templates[0]!;
    assert.equal(localizeTemplate(tpl, 'en').name, 'Day 1 — Chest & Triceps');

    const edited = { ...tpl, systemKey: null, name: 'Mein Push-Tag' };
    const localized = localizeTemplate(edited, 'en');
    assert.equal(localized.name, 'Mein Push-Tag');
    assert.equal(localized.exercises[0]!.notes, tpl.exercises[0]!.notes);
    assert.equal(localized.exercises[0]!.exercise?.name, bench.name);
  });

  it('does not apply a starter note once the exercise at that position changed', () => {
    const tpl = buildStarterWorkouts().folders[0]!.templates[0]!;
    const swapped = {
      ...tpl,
      exercises: [{ ...tpl.exercises[0]!, exerciseId: 'ex-push-up', notes: 'own note' }],
    };
    assert.equal(localizeTemplate(swapped, 'de').exercises[0]!.notes, 'own note');
  });
});
