import { isValidPassword, PASSWORD_RULE_MESSAGE } from '@sinaliza/shared';
import { Transform } from 'class-transformer';
import { ValidateBy, type ValidationOptions } from 'class-validator';

/** Password rule shared with the apps: at least 8 characters with letters and digits. */
export function IsSinalizaPassword(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isSinalizaPassword',
      validator: {
        validate: (value: unknown) => typeof value === 'string' && isValidPassword(value),
        defaultMessage: () => `A palavra-passe não cumpre as regras: ${PASSWORD_RULE_MESSAGE}`,
      },
    },
    options,
  );
}

export const Trim = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

export const NormalizeEmail = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );

/** Empty strings clear optional text fields. */
export const EmptyToNull = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  });

export const PHONE_PATTERN = /^\+?[0-9 ]{9,20}$/;
