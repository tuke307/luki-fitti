import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MAX_BOSS_PARTS,
  RAID_BOSSES,
  bossBounds,
  bossForWeek,
  raidPhaseFor,
  validateBossRecipe,
  type RaidBoss,
} from './raid-bosses';

describe('RAID_BOSSES recipes', () => {
  it('all 8 roster entries are structurally valid', () => {
    assert.equal(RAID_BOSSES.length, 8);
    for (const boss of RAID_BOSSES) {
      assert.deepEqual(validateBossRecipe(boss), [], boss.slug);
    }
  });

  it('every boss has cracks or armour gated behind phases', () => {
    for (const boss of RAID_BOSSES) {
      const gated = boss.parts.filter((p) => (p.minPhase ?? 0) > 0);
      assert.ok(gated.length >= 2, `${boss.slug} should reveal parts per phase`);
    }
  });

  it('every boss has at least one eye and one pupil part', () => {
    for (const boss of RAID_BOSSES) {
      assert.ok(
        boss.parts.some((p) => p.role === 'eye'),
        boss.slug,
      );
      assert.ok(
        boss.parts.some((p) => p.role === 'pupil'),
        boss.slug,
      );
    }
  });
});

describe('validateBossRecipe', () => {
  const base: RaidBoss = JSON.parse(JSON.stringify(RAID_BOSSES[0]!)) as RaidBoss;

  it('flags duplicate part ids', () => {
    const boss = { ...base, parts: [...base.parts, { ...base.parts[0]! }] };
    assert.ok(validateBossRecipe(boss).some((p) => p.includes('duplicate part id')));
  });

  it('flags a dangling parent', () => {
    const parts = base.parts.map((p, i) => (i === 1 ? { ...p, parent: 'missing' } : p));
    assert.ok(validateBossRecipe({ ...base, parts }).some((p) => p.includes('parent missing')));
  });

  it('flags the part budget', () => {
    const parts = Array.from({ length: MAX_BOSS_PARTS + 1 }, (_, i) => ({
      ...base.parts[0]!,
      id: `p${i}`,
    }));
    assert.ok(validateBossRecipe({ ...base, parts }).some((p) => p.includes('budget')));
  });

  it('flags a slot missing from the palette', () => {
    const palette = { ...base.palette, pupil: undefined } as unknown as RaidBoss['palette'];
    assert.ok(validateBossRecipe({ ...base, palette }).some((p) => p.includes('slot pupil')));
  });
});

describe('bossForWeek', () => {
  it('rotates weekly and wraps', () => {
    assert.equal(bossForWeek('2026-01-05').slug, RAID_BOSSES[0]!.slug);
    assert.equal(bossForWeek('2026-03-02').slug, RAID_BOSSES[0]!.slug); // +8 weeks
    assert.equal(bossForWeek('2025-12-29').slug, RAID_BOSSES[7]!.slug); // -1 week wraps
  });
});

describe('bossBounds', () => {
  it('encloses every part of every boss with padding', () => {
    for (const boss of RAID_BOSSES) {
      const { center, radius } = bossBounds(boss);
      assert.ok(radius > 0, boss.slug);
      for (const part of boss.parts) {
        const partR = 0.5 * Math.hypot(part.size[0], part.size[1], part.size[2]);
        const d =
          Math.hypot(
            part.position[0] - center[0],
            part.position[1] - center[1],
            part.position[2] - center[2],
          ) + partR;
        // must still fit after the 1.15 hit squash
        assert.ok(d * 1.15 <= radius + 1e-9, `${boss.slug}/${part.id} clipped`);
      }
    }
  });
});

describe('raidPhaseFor', () => {
  it('maps HP-left fractions onto phases', () => {
    assert.equal(raidPhaseFor(0, 2000), 0);
    assert.equal(raidPhaseFor(500, 2000), 1); // exactly 75 % left
    assert.equal(raidPhaseFor(1100, 2000), 2);
    assert.equal(raidPhaseFor(1600, 2000), 3);
    assert.equal(raidPhaseFor(2000, 2000), 3);
    assert.equal(raidPhaseFor(0, 0), 0); // degenerate input
  });
});
