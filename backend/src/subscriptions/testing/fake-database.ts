// A small in-memory database for the unit specs of the subscription services:
// tables of plain rows, and the subset of the Prisma API the services use.
// It applies the filters it knows (equality, in, lt, gt, notIn, and relations
// left out) and fails loudly on anything else, so that a new filter cannot
// pass unnoticed. Specs only.

export type Row = Record<string, unknown>;

type Filter = {
  gt?: Date;
  in?: unknown[];
  lt?: Date;
  lte?: Date;
  not?: unknown;
  notIn?: unknown[];
};

export function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, condition]) => {
    const value = row[key];

    if (
      condition !== null &&
      typeof condition === 'object' &&
      !(condition instanceof Date)
    ) {
      const filter = condition as Filter;
      const known = ['gt', 'in', 'lt', 'lte', 'not', 'notIn'];

      if (!Object.keys(filter).every((name) => known.includes(name))) {
        throw new Error(
          `Unsupported filter on ${key}: ${JSON.stringify(condition)}`,
        );
      }
      if (filter.in !== undefined && !filter.in.includes(value)) return false;
      if (filter.notIn !== undefined && filter.notIn.includes(value)) {
        return false;
      }
      if (filter.not !== undefined && value === filter.not) return false;
      if (filter.lt !== undefined) {
        if (!(value instanceof Date) || !(value < filter.lt)) return false;
      }
      if (filter.lte !== undefined) {
        if (!(value instanceof Date) || !(value <= filter.lte)) return false;
      }
      if (filter.gt !== undefined) {
        if (!(value instanceof Date) || !(value > filter.gt)) return false;
      }
      return true;
    }

    return value === condition;
  });
}

type OrderBy =
  | Record<string, 'asc' | 'desc'>
  | Record<string, 'asc' | 'desc'>[];

function sortRows(rows: Row[], orderBy?: OrderBy): Row[] {
  if (!orderBy) {
    return rows;
  }
  const keys = (Array.isArray(orderBy) ? orderBy : [orderBy]).flatMap((entry) =>
    Object.entries(entry),
  );

  return [...rows].sort((a, b) => {
    for (const [key, direction] of keys) {
      const left = a[key] as Date | string | number | undefined;
      const right = b[key] as Date | string | number | undefined;
      if (left === right) continue;
      if (left === undefined || right === undefined) continue;
      const order = left < right ? -1 : 1;
      return direction === 'desc' ? -order : order;
    }
    return 0;
  });
}

export function fakeTable(rows: Row[], prefix = 'row') {
  const project = (row: Row, select?: Record<string, unknown>) =>
    select
      ? Object.fromEntries(Object.keys(select).map((key) => [key, row[key]]))
      : { ...row };

  return {
    count: jest.fn(({ where }: { where?: Row } = {}) =>
      Promise.resolve(rows.filter((row) => matches(row, where)).length),
    ),
    create: jest.fn(({ data }: { data: Row }) => {
      const row = { id: `${prefix}-${rows.length + 1}`, ...data };
      rows.push(row);
      return Promise.resolve(row);
    }),
    findFirst: jest.fn(
      ({
        orderBy,
        select,
        where,
      }: {
        orderBy?: OrderBy;
        select?: Record<string, unknown>;
        where?: Row;
      } = {}) => {
        const [row] = sortRows(
          rows.filter((candidate) => matches(candidate, where)),
          orderBy,
        );
        return Promise.resolve(row ? project(row, select) : null);
      },
    ),
    findMany: jest.fn(
      ({
        select,
        where,
      }: { select?: Record<string, unknown>; where?: Row } = {}) =>
        Promise.resolve(
          rows
            .filter((row) => matches(row, where))
            .map((row) => project(row, select)),
        ),
    ),
    update: jest.fn(({ data, where }: { data: Row; where: Row }) => {
      const row = rows.find((candidate) => matches(candidate, where));
      if (!row) {
        throw new Error(`No row to update for ${JSON.stringify(where)}`);
      }
      // Prisma skips undefined fields.
      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined) row[key] = value;
      }
      return Promise.resolve({ ...row });
    }),
    updateMany: jest.fn(({ data, where }: { data: Row; where: Row }) => {
      const hits = rows.filter((row) => matches(row, where));
      hits.forEach((row) => Object.assign(row, data));
      return Promise.resolve({ count: hits.length });
    }),
  };
}
