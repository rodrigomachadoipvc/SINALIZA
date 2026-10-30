import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ApiError } from '@sinaliza/shared';
import type { Request, Response } from 'express';

import './request-context.js';

/** Default PT-PT messages, used when an exception does not carry a user-facing message. */
const DEFAULT_MESSAGES: Record<number, string> = {
  400: 'O pedido não é válido.',
  401: 'Sessão inválida ou expirada. Inicie sessão novamente.',
  403: 'Não tem permissão para realizar esta ação.',
  404: 'O recurso pedido não existe.',
  409: 'O pedido entra em conflito com o estado atual.',
  413: 'O ficheiro é demasiado grande.',
  415: 'O tipo de ficheiro não é suportado.',
  422: 'Não foi possível processar o pedido.',
  429: 'Demasiados pedidos. Aguarde um momento e tente novamente.',
  500: 'Ocorreu um erro inesperado. Tente novamente mais tarde.',
  502: 'Um serviço interno não respondeu corretamente. Tente novamente mais tarde.',
  503: 'O serviço está temporariamente indisponível. Tente novamente mais tarde.',
};

const ERROR_NAMES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  413: 'Payload Too Large',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
};

/**
 * Exceptions thrown on purpose carry a PT-PT message, either as a string or as
 * `{ message, details? }`. Framework exceptions (e.g. unknown routes, Express body parser
 * errors) carry English messages, so those are replaced by the default for their status.
 */
export function toApiError(exception: unknown, requestId: string): ApiError {
  if (!(exception instanceof HttpException)) {
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: ERROR_NAMES[500] ?? 'Internal Server Error',
      message: DEFAULT_MESSAGES[500] ?? '',
      requestId,
    };
  }

  const statusCode = exception.getStatus();
  const body = exception.getResponse();
  const fallback = DEFAULT_MESSAGES[statusCode] ?? DEFAULT_MESSAGES[500] ?? '';
  const error = ERROR_NAMES[statusCode] ?? exception.name;

  if (exception instanceof LocalizedHttpException) {
    return {
      statusCode,
      error,
      message: exception.userMessage,
      ...(exception.details === undefined ? {} : { details: exception.details }),
      requestId,
    };
  }

  if (typeof body === 'object' && body !== null && 'localized' in body) {
    const b = body as { message?: unknown; details?: unknown };
    return {
      statusCode,
      error,
      message: typeof b.message === 'string' ? b.message : fallback,
      ...(b.details === undefined ? {} : { details: b.details }),
      requestId,
    };
  }

  return { statusCode, error, message: fallback, requestId };
}

/** An HttpException whose message is already a user-facing PT-PT sentence. */
export class LocalizedHttpException extends HttpException {
  constructor(
    status: number,
    readonly userMessage: string,
    readonly details?: unknown,
  ) {
    super({ localized: true, message: userMessage, details }, status);
  }
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const body = toApiError(exception, req.requestId ?? 'unknown');

    if (body.statusCode >= 500) {
      this.logger.error(
        `${req.method} ${req.originalUrl} → ${body.statusCode} [${body.requestId}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res.status(body.statusCode).json(body);
  }
}
