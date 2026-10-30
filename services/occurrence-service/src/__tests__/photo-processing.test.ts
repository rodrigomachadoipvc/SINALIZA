import { PHOTO_MAX_DIMENSION, PHOTO_MAX_STORED_BYTES } from '@sinaliza/shared';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { processPhoto, UnsupportedImageError } from '../photos/photo-processing.js';

/** Random pixels compress badly, which makes the size limit meaningful. */
async function noisyImage(width: number, height: number, format: 'png' | 'webp'): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < pixels.length; i++) pixels[i] = Math.floor(Math.random() * 256);
  const img = sharp(pixels, { raw: { width, height, channels: 3 } });
  return format === 'png' ? img.png().toBuffer() : img.webp().toBuffer();
}

describe('processPhoto', () => {
  it('fits large photos within 1600 px and 2 MB as JPEG', async () => {
    const input = await noisyImage(3000, 2000, 'png');
    const output = await processPhoto(input);
    const meta = await sharp(output).metadata();
    expect(meta.format).toBe('jpeg');
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(PHOTO_MAX_DIMENSION);
    expect(output.length).toBeLessThanOrEqual(PHOTO_MAX_STORED_BYTES);
  });

  it('does not enlarge small photos and accepts WebP', async () => {
    const output = await processPhoto(await noisyImage(400, 300, 'webp'));
    const meta = await sharp(output).metadata();
    expect([meta.width, meta.height]).toEqual([400, 300]);
  });

  it('strips EXIF metadata (e.g. GPS)', async () => {
    const input = await sharp({
      create: { width: 50, height: 50, channels: 3, background: '#ff0000' },
    })
      .jpeg()
      .withExif({ IFD0: { Make: 'Test', Model: 'Phone' } })
      .toBuffer();
    expect((await sharp(input).metadata()).exif).toBeDefined();
    expect((await sharp(await processPhoto(input)).metadata()).exif).toBeUndefined();
  });

  it('rejects files that are not JPEG, PNG or WebP', async () => {
    const gif = await sharp({
      create: { width: 10, height: 10, channels: 3, background: '#000' },
    })
      .gif()
      .toBuffer();
    await expect(processPhoto(gif)).rejects.toBeInstanceOf(UnsupportedImageError);
    await expect(processPhoto(Buffer.from('not an image'))).rejects.toBeInstanceOf(
      UnsupportedImageError,
    );
  });
});
