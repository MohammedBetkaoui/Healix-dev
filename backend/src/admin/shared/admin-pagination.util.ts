export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type PaginationOptions = {
  defaultLimit?: number;
  maxLimit?: number;
};

export function getPagination(
  page?: number,
  limit?: number,
  options: PaginationOptions = {},
) {
  const maxLimit = options.maxLimit ?? 100;
  const defaultLimit = options.defaultLimit ?? 10;
  const safePage = Number.isInteger(page) && page && page > 0 ? page : 1;
  const requestedLimit =
    Number.isInteger(limit) && limit && limit > 0 ? limit : defaultLimit;
  const safeLimit = Math.min(requestedLimit, maxLimit);

  return {
    limit: safeLimit,
    page: safePage,
    skip: (safePage - 1) * safeLimit,
  };
}

export function createPaginationMeta(
  page: number,
  limit: number,
  total: number,
): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}
