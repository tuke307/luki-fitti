import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

export type SupportedImageType = 'image/jpeg' | 'image/png' | 'image/webp';

/**
 * Detects the real image type from magic bytes. The client-supplied MIME type and file name
 * are never trusted (a "photo.jpg" could be HTML or an SVG with script).
 */
export function detectImageType(buffer: Buffer): SupportedImageType | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

export interface ProcessedImage {
  buffer: Buffer;
  mimeType: 'image/jpeg';
  width: number;
  height: number;
}

const MAX_EDGE_PX = 1600;
const MAX_INPUT_PIXELS = 50_000_000; // guards against decompression bombs

/**
 * Re-encodes an upload as a bounded JPEG: auto-rotates from EXIF, then drops all metadata
 * (GPS location, device info) because sharp strips metadata unless asked to keep it.
 */
export async function normalizeImage(input: Buffer): Promise<ProcessedImage> {
  if (!detectImageType(input)) {
    throw new BadRequestException('Unsupported image type. Use JPEG, PNG or WebP.');
  }
  try {
    const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
      .rotate()
      .resize({ width: MAX_EDGE_PX, height: MAX_EDGE_PX, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { buffer: data, mimeType: 'image/jpeg', width: info.width, height: info.height };
  } catch {
    throw new BadRequestException('The image could not be read');
  }
}
