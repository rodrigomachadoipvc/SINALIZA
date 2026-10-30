import { HttpStatus, ValidationPipe, type ValidationError } from '@nestjs/common';

import { LocalizedHttpException } from './all-exceptions.filter.js';

export interface FieldError {
  field: string;
  messages: string[];
}

export function flattenValidationErrors(errors: ValidationError[], parent = ''): FieldError[] {
  return errors.flatMap((e) => {
    const field = parent ? `${parent}.${e.property}` : e.property;
    const own: FieldError[] = e.constraints
      ? [{ field, messages: Object.values(e.constraints).map(localizeConstraint(field)) }]
      : [];
    return [...own, ...flattenValidationErrors(e.children ?? [], field)];
  });
}

// `forbidNonWhitelisted` produces an English message we cannot customise per field.
const localizeConstraint =
  (field: string) =>
  (message: string): string =>
    message === `property ${field.split('.').pop() ?? field} should not exist`
      ? `O campo «${field}» não é permitido.`
      : message;

/** ValidationPipe with the security options required by the spec and PT-PT error details. */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) =>
      new LocalizedHttpException(
        HttpStatus.BAD_REQUEST,
        'Corrija os campos assinalados e tente novamente.',
        flattenValidationErrors(errors),
      ),
  });
}
