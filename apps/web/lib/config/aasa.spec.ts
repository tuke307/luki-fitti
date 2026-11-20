import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildAppleAppSiteAssociation } from './aasa';

describe('buildAppleAppSiteAssociation', () => {
  it('returns null when no app ids are configured', () => {
    assert.equal(buildAppleAppSiteAssociation(undefined), null);
    assert.equal(buildAppleAppSiteAssociation(' , '), null);
  });

  it('maps comma-separated app ids to the invite path and web credentials', () => {
    assert.deepEqual(buildAppleAppSiteAssociation('ABCDE12345.app.one, ABCDE12345.app.two'), {
      applinks: {
        details: [
          {
            appIDs: ['ABCDE12345.app.one', 'ABCDE12345.app.two'],
            components: [{ '/': '/invite/*' }],
          },
        ],
      },
      webcredentials: { apps: ['ABCDE12345.app.one', 'ABCDE12345.app.two'] },
    });
  });
});
