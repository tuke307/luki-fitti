import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  main,
  parseAlphaProgressionCsv,
  parseAlphaProgressionPlans,
  parseDuration,
  parseNumber,
  splitCsvLine,
} from './alpha-progression-to-luki.mjs';
import { zonedTimeToUtc } from './lib.mjs';

const fixture = (name) => fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url));

function capture() {
  let text = '';
  return { write: (chunk) => (text += chunk), text: () => text };
}

async function run(args) {
  const stdout = capture();
  const stderr = capture();
  const code = await main(args, { stdout, stderr });
  return { code, stdout: stdout.text(), stderr: stderr.text() };
}

describe('alpha-progression-to-luki', () => {
  it('parses cells, decimal commas and markers', () => {
    assert.deepEqual(splitCsvLine('"a;b";"c ""q""";3'), ['a;b', 'c "q"', '3']);
    assert.deepEqual(splitCsvLine('1\t2,5\t8'), ['1', '2,5', '8']);
    assert.equal(parseNumber('102,5'), 102.5);
    assert.equal(parseNumber('+35'), 35);
    assert.equal(parseNumber('8+'), 8);
    assert.equal(parseNumber(''), undefined);
  });

  it('reads sessions, warm-ups and sets', () => {
    const [push, legs] = parseAlphaProgressionCsv(
      readFileSync(fixture('alpha-progression-history.csv'), 'utf8'),
    );
    assert.equal(push.name, 'Push Day A');
    assert.equal(push.durationSeconds, 3720);
    assert.deepEqual(
      push.exercises.map((e) => [e.name, e.equipment, e.warmups.length, e.sets.length]),
      [
        ['Bench Press', 'Barbell', 2, 3],
        ['Dips', 'Bodyweight', 0, 1],
      ],
    );
    assert.equal(legs.exercises[0].sets[1].rir, 2);
  });

  it('interprets naive times in the given time zone, across DST', () => {
    const at = (month, day, hour) =>
      zonedTimeToUtc({ year: 2026, month, day, hour, minute: 5 }, 'Europe/Berlin').toISOString();
    assert.equal(at(2, 19, 4), '2026-02-19T03:05:00.000Z');
    assert.equal(at(3, 29, 18), '2026-03-29T16:05:00.000Z');
  });

  it('writes a valid luki-fitti-import@1 file', async () => {
    const { code, stdout, stderr } = await run([
      fixture('alpha-progression-history.csv'),
      '--map',
      fixture('alpha-progression-mapping.json'),
      '--tz',
      'Europe/Berlin',
    ]);
    assert.equal(code, 0, stderr);
    const file = JSON.parse(stdout);
    assert.equal(file.format, 'luki-fitti-import@1');
    assert.equal(file.sessions.length, 2);
    const [push] = file.sessions;
    assert.equal(push.startedAt, '2026-02-19T03:54:00.000Z');
    assert.equal(push.completedAt, '2026-02-19T04:56:00.000Z');
    assert.deepEqual(push.exercises[0].exercise, { slug: 'barbell-bench-press-medium-grip' });
    assert.deepEqual(
      push.exercises[0].sets.map((s) => [s.setNumber, s.setType, s.weight, s.reps, s.rpe]),
      [
        [1, 'WARMUP', 40, 10, undefined],
        [2, 'WARMUP', 60, 5, undefined],
        [3, 'WORKING', 80, 8, 8],
        [4, 'WORKING', 82.5, 8, 9],
        [5, 'WORKING', 82.5, 6, undefined],
      ],
    );
    assert.equal(push.exercises[1].sets[0].weight, 10);
  });

  it('fails and lists exercise names missing from the mapping', async () => {
    const { code, stdout, stderr } = await run([
      fixture('alpha-progression-history.csv'),
      '--map',
      fixture('alpha-progression-mapping-partial.json'),
      '--tz',
      'UTC',
    ]);
    assert.equal(code, 1);
    assert.equal(stdout, '');
    assert.match(stderr, /- Back Squat · Barbell\n {2}- Dips · Bodyweight\n/);
  });

  it('rejects unknown time zones', async () => {
    const { code, stderr } = await run([
      fixture('alpha-progression-history.csv'),
      '--map',
      fixture('alpha-progression-mapping.json'),
      '--tz',
      'Mars/Olympus',
    ]);
    assert.equal(code, 1);
    assert.match(stderr, /Unknown time zone/);
  });

  describe('German export', () => {
    const history = readFileSync(fixture('alpha-progression-history-de.csv'), 'utf8');
    const deArgs = (...extra) => [
      fixture('alpha-progression-history-de.csv'),
      '--map',
      fixture('alpha-progression-mapping-de.json'),
      '--tz',
      'Europe/Berlin',
      ...extra,
    ];

    it('parses hour and minute durations', () => {
      assert.equal(parseDuration('1:05 Std.'), 3900);
      assert.equal(parseDuration('45 Min.'), 2700);
      assert.equal(parseDuration('1:02 hr'), 3720);
      assert.equal(parseDuration('Langhantel'), undefined);
    });

    it('reads sessions, reps targets, decimal commas and skips empty sets and cardio', () => {
      const warnings = [];
      const [upper, legs] = parseAlphaProgressionCsv(history, { warn: (m) => warnings.push(m) });
      assert.equal(upper.name, 'Oberkörper A');
      assert.deepEqual(upper.wallClock, { year: 2026, month: 1, day: 12, hour: 18, minute: 0 });
      assert.equal(upper.durationSeconds, 3900);
      assert.equal(legs.durationSeconds, 2700);
      assert.deepEqual(
        upper.exercises.map((e) => [e.name, e.equipment, e.repsTarget, e.sets.length]),
        [
          ['Bankdrücken', 'Langhantel', '10 Wdh', 2],
          ['Seitheben', 'Maschine', '12 Wdh', 1],
        ],
        'the -;- set is dropped and the cardio block is left out',
      );
      assert.equal(upper.exercises[0].sets[1].weight, 62.5);
      assert.equal(warnings.length, 1);
      assert.match(warnings[0], /Laufband.*no distance field/);
    });

    it('stops on a partly filled set with the line and exercise', () => {
      assert.throws(
        () => parseAlphaProgressionCsv(history.replace('2;62,5;8', '2;62,5;-')),
        /Line 5: set 2 of "Bankdrücken" in "Oberkörper A" is only partly filled in \(62,5;-\)/,
      );
    });

    it('rejects unknown column headers', () => {
      assert.throws(
        () => parseAlphaProgressionCsv(history.replace('#;KG;WDH', '#;SEK')),
        /Line 3: unknown column header "#;SEK"/,
      );
    });

    it('reads plans with days, set counts and rep targets', () => {
      const [full, upper] = parseAlphaProgressionPlans(
        readFileSync(fixture('alpha-progression-plans-de.csv'), 'utf8'),
      );
      assert.equal(full.name, 'Ganzkörper');
      assert.deepEqual(
        full.days.map((d) => [
          d.name,
          d.exercises.map((e) => [e.name, e.equipment, e.sets, e.reps]),
        ]),
        [
          [
            'Tag 1',
            [
              ['Bankdrücken', 'Langhantel', 3, 10],
              ['Seitheben', 'Maschine', 2, 12],
            ],
          ],
          ['Tag 2', [['Kniebeugen', 'Langhantel', 5, 5]]],
        ],
      );
      assert.equal(upper.days.length, 1);
      assert.throws(() => parseAlphaProgressionPlans('"Tag 1"\n'), /Plans line 1: a day row needs/);
    });

    it('writes sessions, warns about cardio, and turns plans into folders and workouts', async () => {
      const { code, stdout, stderr } = await run(
        deArgs('--plans', fixture('alpha-progression-plans-de.csv')),
      );
      assert.equal(code, 0, stderr);
      assert.match(stderr, /Warning: Skipped cardio exercise "Laufband"/);
      const file = JSON.parse(stdout);
      assert.equal(file.sessions.length, 2);
      const [upper, legs] = file.sessions;
      assert.equal(upper.startedAt, '2026-01-12T17:00:00.000Z');
      assert.equal(upper.completedAt, '2026-01-12T18:05:00.000Z');
      assert.equal(legs.startedAt, '2026-03-29T05:30:00.000Z', 'after the DST switch');
      assert.deepEqual(
        upper.exercises.map((e) => [e.exercise.slug, e.sets.map((s) => [s.weight, s.reps])]),
        [
          [
            'barbell-bench-press-medium-grip',
            [
              [60, 10],
              [62.5, 8],
            ],
          ],
          ['side-lateral-raise', [[12.5, 12]]],
        ],
      );
      assert.deepEqual(file.folders, [
        { key: 'alpha-progression:plan:Ganzkörper', name: 'Ganzkörper', sortOrder: 0 },
        { key: 'alpha-progression:plan:Oberkörper', name: 'Oberkörper', sortOrder: 1 },
      ]);
      assert.deepEqual(
        file.templates.map((t) => [t.folderKey, t.name, t.exercises.map((e) => e.sets.length)]),
        [
          ['alpha-progression:plan:Ganzkörper', 'Tag 1', [3, 2]],
          ['alpha-progression:plan:Ganzkörper', 'Tag 2', [5]],
          ['alpha-progression:plan:Oberkörper', 'Tag 1', [4]],
        ],
      );
      assert.deepEqual(file.templates[0].exercises[0], {
        exercise: { slug: 'barbell-bench-press-medium-grip' },
        orderIndex: 0,
        restSeconds: 90,
        sets: Array.from({ length: 3 }, () => ({
          setType: 'WORKING',
          weight: null,
          reps: 10,
          durationSeconds: null,
        })),
      });
    });

    it('converts a plans export on its own', async () => {
      const { code, stdout, stderr } = await run([
        '--plans',
        fixture('alpha-progression-plans-de.csv'),
        '--map',
        fixture('alpha-progression-mapping-de.json'),
      ]);
      assert.equal(code, 0, stderr);
      const file = JSON.parse(stdout);
      assert.equal(file.sessions.length, 0);
      assert.equal(file.templates.length, 3);
    });

    it('rejects duplicate plan names', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'alpha-plans-'));
      try {
        const plans = join(dir, 'Plans.csv');
        writeFileSync(plans, '"A";"2026-01-01"\n"Tag 1"\n"A";"2026-02-01"\n');
        const { code, stderr } = await run(deArgs('--plans', plans));
        assert.equal(code, 1);
        assert.match(stderr, /Two plans are named "A"/);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
