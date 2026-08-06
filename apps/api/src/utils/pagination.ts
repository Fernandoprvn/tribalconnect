import type { Request } from 'express';

export type Pagination = { page: number; limit: number; skip: number };

export const getPagination = (request: Request): Pagination => {
  const requestedPage = Number(request.query.page ?? 1);
  const requestedLimit = Number(request.query.limit ?? 20);
  const page = Number.isFinite(requestedPage) ? Math.max(1, Math.floor(requestedPage)) : 1;
  const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, Math.floor(requestedLimit))) : 20;
  return { page, limit, skip: (page - 1) * limit };
};

export const pageMeta = (page: number, limit: number, total: number) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});
