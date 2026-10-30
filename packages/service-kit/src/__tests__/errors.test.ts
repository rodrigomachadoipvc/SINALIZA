import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { toApiError } from '../http/all-exceptions.filter.js';
import { conflict } from '../http/errors.js';
import { createValidationPipe } from '../http/validation.js';

describe('toApiError', () => {
  it('keeps the PT-PT message and details of localized exceptions', () => {
    expect(
      toApiError(conflict('Já existe uma conta com este email.', { field: 'email' }), 'r1'),
    ).toEqual({
      statusCode: 409,
      error: 'Conflict',
      message: 'Já existe uma conta com este email.',
      details: { field: 'email' },
      requestId: 'r1',
    });
  });

  it('replaces English framework messages with the PT-PT default', () => {
    expect(toApiError(new NotFoundException('Cannot GET /x'), 'r2')).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'O recurso pedido não existe.',
      requestId: 'r2',
    });
    expect(toApiError(new BadRequestException('Unexpected token'), 'r3').message).toBe(
      'O pedido não é válido.',
    );
  });

  it('hides unexpected errors behind a generic 500', () => {
    expect(toApiError(new Error('db password leaked'), 'r4')).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Ocorreu um erro inesperado. Tente novamente mais tarde.',
      requestId: 'r4',
    });
  });
});

describe('createValidationPipe', () => {
  it('uses the whitelist options required by the spec', () => {
    const pipe = createValidationPipe() as unknown as {
      validatorOptions: { whitelist?: boolean; forbidNonWhitelisted?: boolean };
    };
    expect(pipe.validatorOptions.whitelist).toBe(true);
    expect(pipe.validatorOptions.forbidNonWhitelisted).toBe(true);
  });
});
