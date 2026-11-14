import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ApiRequestError } from '../lukifitti-api.client';
import { DateInputError } from './mcp-date-utils';
import { nutritionByDay } from './nutrition.tool';
import {
  keyIdOf,
  okResult,
  runTool,
  scopesOf,
  toToolError,
  ToolRateLimiter,
  truncateRows,
} from './tool-utils';

describe('ToolRateLimiter', () => {
  it('allows 30 calls per minute per key, then reports the wait', () => {
    const limiter = new ToolRateLimiter();
    let now = 1_000_000;
    limiter.now = () => now;
    for (let i = 0; i < 30; i++) assert.equal(limiter.check('k1'), 0);
    const wait = limiter.check('k1');
    assert.ok(wait > 0 && wait <= 60);
    assert.equal(limiter.check('k2'), 0, 'limits are per key');
    now += 61_000;
    assert.equal(limiter.check('k1'), 0);
  });
});

describe('runTool / toToolError', () => {
  const limiter = () => new ToolRateLimiter();
  const req = { user: { keyId: 'lf_pat_abc12345', scope: 'mcp read:body' } };

  it('returns the rate-limit error result instead of throwing', async () => {
    const l = limiter();
    for (let i = 0; i < 30; i++) l.check('lf_pat_abc12345');
    const res = await runTool(l, req, async () => okResult('never', {}));
    assert.equal(res.isError, true);
    assert.match(res.content[0]!.text, /Rate limit reached, try again in \d+ s/);
  });

  it('maps API errors to safe messages', () => {
    assert.match(
      toToolError(
        new ApiRequestError(
          403,
          'insufficient_scope',
          'Missing required scope',
          undefined,
          'read:sessions',
        ),
      ).content[0]!.text,
      /missing the required scope: read:sessions/,
    );
    assert.equal(
      toToolError(new ApiRequestError(404, 'not_found', 'Session not found')).content[0]!.text,
      'Not found',
    );
    assert.match(
      toToolError(new ApiRequestError(429, 'rate_limited', 'x', 30)).content[0]!.text,
      /try again in 30 s/,
    );
    assert.equal(
      toToolError(new ApiRequestError(503, 'api_unavailable', 'x')).content[0]!.text,
      'LukiFitti API unavailable',
    );
    assert.match(toToolError(new DateInputError('bogus')).content[0]!.text, /Invalid date/);
    const generic = toToolError(new Error('stack internals'));
    assert.equal(generic.content[0]!.text, 'Tool failed');
    assert.ok(!JSON.stringify(generic).includes('stack internals'));
  });

  it('reads the key id and scopes off req.user', () => {
    assert.equal(keyIdOf(req), 'lf_pat_abc12345');
    assert.deepEqual(scopesOf(req), ['mcp', 'read:body']);
    assert.equal(keyIdOf({}), 'unknown');
  });
});

describe('truncateRows / results', () => {
  it('caps rows and flags truncation', () => {
    const { rows, truncated } = truncateRows([1, 2, 3], 2);
    assert.deepEqual(rows, [1, 2]);
    assert.equal(truncated, true);
    assert.equal(truncateRows([1], 2).truncated, false);
  });
});

describe('nutritionByDay', () => {
  const goals = { dailyKcalGoal: 2000, proteinGoalG: 150 };

  it('sums macros per Berlin day and reports goal progress', () => {
    const days = nutritionByDay(
      [
        {
          eatenAt: '2026-11-10T08:00:00Z',
          items: [{ kcal: 500, proteinG: 30, carbsG: 50, fatG: 20 }],
        },
        {
          eatenAt: '2026-11-10T18:00:00Z',
          items: [
            { kcal: 700, proteinG: 40, carbsG: 60, fatG: 30 },
            { kcal: 100, proteinG: 10, carbsG: 5, fatG: 5 },
          ],
        },
        {
          // 23:30 UTC is already the next day in Berlin (UTC+1).
          eatenAt: '2026-11-10T23:30:00Z',
          items: [{ kcal: 300, proteinG: 20, carbsG: 10, fatG: 10 }],
        },
      ],
      goals,
      'Europe/Berlin',
    );
    assert.deepEqual(
      days.map((d) => d.day),
      ['2026-11-10', '2026-11-11'],
    );
    assert.equal(days[0]!.kcal, 1300);
    assert.equal(days[0]!.proteinG, 80);
    assert.equal(days[0]!.kcalProgress, 0.65);
    assert.equal(days[1]!.kcal, 300);
  });

  it('omits progress when no goals are set', () => {
    const days = nutritionByDay(
      [
        {
          eatenAt: '2026-11-10T08:00:00Z',
          items: [{ kcal: 100, proteinG: 5, carbsG: 5, fatG: 5 }],
        },
      ],
      { dailyKcalGoal: null, proteinGoalG: null },
    );
    assert.equal(days[0]!.kcalProgress, null);
    assert.equal(days[0]!.proteinProgress, null);
  });
});
