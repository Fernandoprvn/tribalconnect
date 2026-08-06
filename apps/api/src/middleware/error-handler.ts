import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import { ZodError } from 'zod';
import { env } from '../config/env';
import { ApiError } from '../utils/api-error';

export const notFound: RequestHandler = (request, _response, next) =>
  next(new ApiError(404, `Route ${request.method} ${request.originalUrl} was not found.`));

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  if (error instanceof ZodError) {
    return response.status(422).json({
      error: { code: 'VALIDATION_ERROR', message: 'Some fields need attention.', details: error.flatten() },
    });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return response.status(409).json({ error: { code: 'CONFLICT', message: 'A record with that value already exists.' } });
    }
    if (error.code === 'P2025') {
      return response.status(404).json({ error: { code: 'NOT_FOUND', message: 'The requested record was not found.' } });
    }
  }
  if (error instanceof multer.MulterError) {
    return response.status(422).json({ error: { code: 'UPLOAD_ERROR', message: error.message } });
  }
  if (error instanceof SyntaxError && 'body' in error) {
    return response.status(400).json({ error: { code: 'INVALID_JSON', message: 'The request body is not valid JSON.' } });
  }
  if (error instanceof ApiError) {
    return response.status(error.statusCode).json({
      error: { code: error.name.toUpperCase(), message: error.message, details: error.details },
    });
  }

  if (env.NODE_ENV !== 'test') console.error({ err: error, path: request.path }, 'Unhandled API error');
  return response.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
      ...(env.NODE_ENV === 'development' && error instanceof Error ? { details: error.message } : {}),
    },
  });
};
