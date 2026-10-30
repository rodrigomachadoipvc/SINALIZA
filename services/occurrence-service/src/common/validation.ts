import { ParseUUIDPipe } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { notFound } from '@sinaliza/service-kit';
import { Transform, Type } from 'class-transformer';
import { IsLatitude, IsLongitude, ValidateBy, type ValidationOptions } from 'class-validator';

export const Trim = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

/** Empty strings become undefined, so optional text fields can be sent blank. */
export const EmptyToUndefined = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  });

/** `?status=A,B` and `?status=A&status=B` both become `['A', 'B']`. */
export const CommaList = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) => {
    const parts = (Array.isArray(value) ? value : [value])
      .filter((v): v is string => typeof v === 'string')
      .flatMap((v) => v.split(','))
      .map((v) => v.trim())
      .filter(Boolean);
    return parts.length > 0 ? parts : undefined;
  });

export const occurrenceIdPipe = new ParseUUIDPipe({
  exceptionFactory: () => notFound('A ocorrência não existe.'),
});

export class CoordinatesDto {
  @ApiProperty({ example: 41.5317, minimum: -90, maximum: 90 })
  @Type(() => Number)
  @IsLatitude({ message: 'A latitude não é válida.' })
  lat: number;

  @ApiProperty({ example: -8.6194, minimum: -180, maximum: 180 })
  @Type(() => Number)
  @IsLongitude({ message: 'A longitude não é válida.' })
  lng: number;
}

export interface BBox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

const BBOX_MESSAGE =
  'A área do mapa (bbox) deve ter o formato «oeste,sul,este,norte» em graus decimais.';

/** Parses `west,south,east,north` (Leaflet's `toBBoxString()` order). */
export function parseBBox(value: string): BBox | null {
  const parts = value.split(',').map((p) => Number(p.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [minLng, minLat, maxLng, maxLat] = parts as [number, number, number, number];
  const lngOk = (n: number) => n >= -180 && n <= 180;
  const latOk = (n: number) => n >= -90 && n <= 90;
  if (![minLng, maxLng].every(lngOk) || ![minLat, maxLat].every(latOk)) return null;
  if (minLng > maxLng || minLat > maxLat) return null;
  return { minLng, minLat, maxLng, maxLat };
}

export function IsBBox(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isBBox',
      validator: {
        validate: (value: unknown) => typeof value === 'string' && parseBBox(value) !== null,
        defaultMessage: () => BBOX_MESSAGE,
      },
    },
    options,
  );
}
