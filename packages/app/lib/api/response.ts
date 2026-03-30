export function ok<T>(data: T, meta?: { page: number; pageSize: number; total: number }) {
  return Response.json({ data, ...(meta ? { meta } : {}) });
}

export function err(message: string, code: string, status = 400) {
  return Response.json({ error: message, code }, { status });
}

export function forbidden() {
  return Response.json({ error: 'Forbidden', code: 'INSUFFICIENT_ROLE' }, { status: 403 });
}

export function notFound(entity = 'Resource') {
  return Response.json({ error: `${entity} not found`, code: 'NOT_FOUND' }, { status: 404 });
}
