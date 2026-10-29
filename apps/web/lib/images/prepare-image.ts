const MAX_EDGE_PX = 2048;

/**
 * Re-encodes a picked photo as a bounded JPEG in the browser before upload: smaller uploads,
 * HEIC → JPEG where the browser can decode it, and EXIF (incl. GPS) is dropped by the canvas.
 * Falls back to the original file if decoding fails; the server re-validates either way.
 */
export async function prepareImageForUpload(file: File): Promise<Blob> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85),
    );
    return blob ?? file;
  } catch {
    return file;
  }
}
