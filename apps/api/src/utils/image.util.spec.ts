import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { BadRequestException } from '@nestjs/common';
import { detectImageType, normalizeImage } from './image.util';

const makeJpeg = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#c86432' } })
    .jpeg()
    .withExif({ IFD0: { Make: 'TestCam', Model: 'Secret Model' } })
    .toBuffer();

describe('image.util', () => {
  it('detects real types by magic bytes, not names', async () => {
    assert.equal(detectImageType(await makeJpeg(8, 8)), 'image/jpeg');
    assert.equal(detectImageType(await sharp({ create: { width: 4, height: 4, channels: 3, background: '#000' } }).png().toBuffer()), 'image/png');
    assert.equal(detectImageType(Buffer.from('<svg onload="alert(1)"></svg>')), null);
  });

  it('rejects non-images', async () => {
    await assert.rejects(normalizeImage(Buffer.from('<html><script>x</script></html>')), BadRequestException);
  });

  it('bounds the size and strips EXIF metadata', async () => {
    const input = await makeJpeg(3200, 1600);
    assert.ok((await sharp(input).metadata()).exif);

    const out = await normalizeImage(input);
    assert.equal(out.mimeType, 'image/jpeg');
    assert.equal(out.width, 1600);
    assert.equal(out.height, 800);
    const meta = await sharp(out.buffer).metadata();
    assert.equal(meta.exif, undefined);
  });
});
