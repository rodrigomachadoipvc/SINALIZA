import { PHOTO_MAX_DIMENSION, PHOTO_MAX_STORED_BYTES } from '@sinaliza/shared';
import sharp from 'sharp';

/** Formats accepted on upload, as detected by sharp from the file content (not the MIME header). */
const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp']);
const QUALITY_STEPS = [82, 74, 66, 58, 50, 42];

/** Key prefix for photos uploaded by a user; occurrences only accept keys with this prefix. */
export const uploadPrefix = (userId: string): string => `uploads/${userId}/`;

export class UnsupportedImageError extends Error {}
export class ImageTooLargeError extends Error {}

/**
 * Normalises an uploaded photo (RNF11, RNF16): rotates it upright from the EXIF orientation,
 * strips metadata (GPS included), fits it within 1600×1600 px and re-encodes it as JPEG,
 * lowering the quality until it is at most 2 MB.
 */
export async function processPhoto(input: Buffer): Promise<Buffer> {
  let format: string | undefined;
  try {
    format = (await sharp(input).metadata()).format;
  } catch {
    throw new UnsupportedImageError('not an image');
  }
  if (!format || !ACCEPTED_FORMATS.has(format)) throw new UnsupportedImageError(String(format));

  const resized = sharp(input)
    .rotate()
    .resize(PHOTO_MAX_DIMENSION, PHOTO_MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' });

  for (const quality of QUALITY_STEPS) {
    const output = await resized.clone().jpeg({ quality, mozjpeg: true }).toBuffer();
    if (output.length <= PHOTO_MAX_STORED_BYTES) return output;
  }
  throw new ImageTooLargeError('could not compress below the limit');
}
