import { HttpStatus } from '@nestjs/common';

import { LocalizedHttpException } from './all-exceptions.filter.js';

// Small helpers so services throw consistent, user-facing PT-PT errors.

export const badRequest = (message: string, details?: unknown): LocalizedHttpException =>
  new LocalizedHttpException(HttpStatus.BAD_REQUEST, message, details);

export const unauthorized = (message: string): LocalizedHttpException =>
  new LocalizedHttpException(HttpStatus.UNAUTHORIZED, message);

export const forbidden = (message: string): LocalizedHttpException =>
  new LocalizedHttpException(HttpStatus.FORBIDDEN, message);

export const notFound = (message: string): LocalizedHttpException =>
  new LocalizedHttpException(HttpStatus.NOT_FOUND, message);

export const conflict = (message: string, details?: unknown): LocalizedHttpException =>
  new LocalizedHttpException(HttpStatus.CONFLICT, message, details);

export const unprocessable = (message: string, details?: unknown): LocalizedHttpException =>
  new LocalizedHttpException(HttpStatus.UNPROCESSABLE_ENTITY, message, details);

export const tooManyRequests = (message: string): LocalizedHttpException =>
  new LocalizedHttpException(HttpStatus.TOO_MANY_REQUESTS, message);

export const badGateway = (message: string): LocalizedHttpException =>
  new LocalizedHttpException(HttpStatus.BAD_GATEWAY, message);
