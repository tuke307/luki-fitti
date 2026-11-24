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

  it('decodes hexadecimal numeric entities', () => {
    const text = htmlToText('<a href="https://x.test/verify?token&#x3D;abc">Go</a>');
    assert.equal(text, 'Go (https://x.test/verify?token=abc)');
  });

  it('leaves no markup after nested script fragments', () => {
    const text = htmlToText('<scr<script>ipt>alert(1)</script>');
    assert.ok(!text.includes('<'));
    assert.ok(!text.includes('>'));
    assert.ok(!text.includes('alert'));
  });

  it('drops the remainder on an unclosed style block', () => {
    const text = htmlToText('<p>Hi</p><style>.a{color:red}<p>hidden</p>');
    assert.equal(text, 'Hi');
  });

  it('scans many <head repetitions in linear time', () => {
    const input = '<head'.repeat(50_000);
    const start = performance.now();
    htmlToText(input);
    assert.ok(performance.now() - start < 200);
  });

  it('keeps out-of-range numeric entities instead of throwing', () => {
    assert.equal(htmlToText('<p>a&#x110000;b &#65;</p>'), 'a&#x110000;b A');
  });

  it('scans many unclosed <br and </p tags in linear time', () => {
    const input = '<br'.repeat(50_000) + '</p'.repeat(50_000);
    const start = performance.now();
    htmlToText(input);
    assert.ok(performance.now() - start < 200);
  });
});
