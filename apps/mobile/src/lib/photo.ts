import { PHOTO_MAX_DIMENSION, PHOTO_MAX_STORED_BYTES } from '@sinaliza/shared';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { DraftPhoto } from '../store/draft';

/** JPEG qualities tried in order until the file fits the limit. */
const QUALITIES = [0.8, 0.65, 0.5, 0.35] as const;

export function fitWithin(width: number, height: number, max = PHOTO_MAX_DIMENSION) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

async function sizeOf(uri: string): Promise<number> {
  return (await (await fetch(uri)).blob()).size;
}

/**
 * Resizes to at most 1600 px on the longest side and re-encodes as JPEG until the file is at most
 * 2 MB (RNF20), so slow mobile connections send small files. The server checks again.
 */
export async function compressPhoto(
  uri: string,
  width: number,
  height: number,
): Promise<DraftPhoto> {
  const target = fitWithin(width, height);
  const context = ImageManipulator.manipulate(uri);
  if (target.width !== width || target.height !== height) context.resize(target);
  const image = await context.renderAsync();
  let result: DraftPhoto | null = null;
  for (const compress of QUALITIES) {
    const saved = await image.saveAsync({ compress, format: SaveFormat.JPEG });
    result = {
      uri: saved.uri,
      width: saved.width,
      height: saved.height,
      sizeBytes: await sizeOf(saved.uri),
    };
    if (result.sizeBytes <= PHOTO_MAX_STORED_BYTES) break;
  }
  if (!result) throw new Error('photo not saved');
  return result;
}

/** 1 234 567 bytes → «1,2» (MB, one decimal, PT-PT). */
export function formatMegabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toLocaleString('pt-PT', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}
