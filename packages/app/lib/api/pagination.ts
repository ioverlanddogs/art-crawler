export function parsePagination(searchParams: URLSearchParams) {
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') ?? '50', 10)));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
