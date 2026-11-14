import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RAID_BOSSES } from '@luki-fitti/common/raid';
import { readFileSync } from 'node:fs';

const vectors = JSON.parse(
  readFileSync(
    new URL(
      '../../../../packages/common/src/raid/__fixtures__/raid-boss-vectors.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
import { buildBossParts } from './boss-geometry';

// Tessellated vertex bounds sit inside the analytic AABB by the segment chord
// error (worst ≈ 0.005 for the coarsest primitives), so 0.01 still catches
// flipped axes, wrong sizes, misplaced parts and euler-order mismatches.
const TOLERANCE = 0.01;

type PartBounds = Record<string, Record<string, { min: number[]; max: number[] }>>;
const partBounds = (vectors as unknown as { partBounds: PartBounds }).partBounds;

const materials = {
  basic: new THREE.MeshBasicMaterial(),
  outline: new THREE.MeshBasicMaterial(),
  flash: new THREE.MeshBasicMaterial(),
};

describe('boss geometry parity', () => {
  for (const boss of RAID_BOSSES) {
    it(`${boss.slug}: every part's world Box3 matches the exported vectors`, () => {
      const { group, partMeshes } = buildBossParts(
        THREE,
        RoundedBoxGeometry,
        boss,
        () => materials.basic,
        materials.outline,
        materials.flash,
        1.045,
      );
      group.updateMatrixWorld(true);
      const expected = partBounds[boss.slug];
      assert.ok(expected, `missing vectors for ${boss.slug}`);
      for (const part of boss.parts) {
        const mesh = partMeshes.get(part.id)!;
        assert.ok(mesh, `no mesh for ${part.id}`);
        mesh.geometry.computeBoundingBox();
        const bb = mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld);
        const exp = expected[part.id];
        assert.ok(exp, `no vector for ${part.id}`);
        const got = [bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z];
        const want = [exp.min[0]!, exp.min[1]!, exp.min[2]!, exp.max[0]!, exp.max[1]!, exp.max[2]!];
        for (let i = 0; i < 6; i++) {
          assert.ok(
            Math.abs(got[i]! - want[i]!) <= TOLERANCE,
            `${boss.slug}/${part.id} axis ${i}: got ${got[i]!.toFixed(4)} want ${want[i]!.toFixed(4)}`,
          );
        }
      }
    });

    it(`${boss.slug}: children are nested under their parent meshes`, () => {
      const { partMeshes } = buildBossParts(
        THREE,
        RoundedBoxGeometry,
        boss,
        () => materials.basic,
        materials.outline,
        materials.flash,
        1.045,
      );
      for (const part of boss.parts) {
        if (!part.parent) continue;
        const mesh = partMeshes.get(part.id)!;
        const parent = partMeshes.get(part.parent)!;
        assert.equal(mesh.parent, parent, `${part.id} should be a child of ${part.parent}`);
      }
    });
  }
});
