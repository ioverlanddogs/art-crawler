import { createHash } from 'node:crypto';

export function fingerprint(title: string, sourceUrl: string) {
  return createHash('sha256').update(`${title.trim().toLowerCase()}|${sourceUrl.trim().toLowerCase()}`).digest('hex').slice(0, 32);
}

export function clusterId(fp: string) {
  return fp.slice(0, 8);
}
