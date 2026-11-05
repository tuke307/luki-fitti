import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  main,
  parseAlphaProgressionCsv,
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
});
