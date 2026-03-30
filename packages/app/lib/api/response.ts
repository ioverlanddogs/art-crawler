export function ok<T>(data: T, meta?: { page: number; pageSize: number; total: number }) {
  return Response.json({ data, ...(meta ? { meta } : {}) });
}

export function err(message: string, code: string, status = 400) {
  return Response.json({ error: message, code }, { status });
}

export function unauthorized() {
  return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
}

export function forbidden() {
  return Response.json({ error: 'Forbidden', code: 'INSUFFICIENT_ROLE' }, { status: 403 });
}

export function notFound(entity = 'Resource') {
  return Response.json({ error: `${entity} not found`, code: 'NOT_FOUND' }, { status: 404 });
}

export function authFailure(error: unknown) {
  if (error instanceof Response && error.status === 401) return unauthorized();
  return forbidden();
}
