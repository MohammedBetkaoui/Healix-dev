type QueryValue = boolean | number | string | null | undefined;

export function cleanAdminQuery<T extends object>(query: T) {
  return Object.fromEntries(
    Object.entries(query as Record<string, QueryValue>).filter(([, value]) => {
      if (value === undefined || value === null) {
        return false;
      }

      return typeof value !== "string" || value.trim().length > 0;
    }),
  );
}
