import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { htmlToText } from './html-to-text.util';

describe('htmlToText', () => {
  it('keeps link targets and drops markup and styles', () => {
    const text = htmlToText(
      '<html><head><style>.a{color:red}</style></head><body><p>Hey <strong>Ann</strong>,</p>' +
        '<a href="https://app.example/verify?token=a%20b&amp;x=1">Confirm</a></body></html>',
    );
    assert.equal(text, 'Hey Ann,\nConfirm (https://app.example/verify?token=a%20b&x=1)');
  });

  it('prints a bare url once when label equals the url', () => {
    const text = htmlToText('<a href="https://x.test/a">https://x.test/a</a>');
    assert.equal(text, 'https://x.test/a');
  });

  it('decodes entities and collapses blank lines', () => {
    const text = htmlToText('<p>Fish &amp; Chips</p><br><br><br><p>Done</p>');
    assert.equal(text, 'Fish & Chips\n\nDone');
  });
});
