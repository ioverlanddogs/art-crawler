import { createHash } from 'node:crypto';

export function fingerprintUrl(url: string): string {
  const parsed = new URL(url);

  const protocol = parsed.protocol.toLowerCase();
  parsed.protocol = protocol;
  parsed.hostname = parsed.hostname.toLowerCase();

  const isDefaultHttpPort = protocol === 'http:' && parsed.port === '80';
  const isDefaultHttpsPort = protocol === 'https:' && parsed.port === '443';
  if (isDefaultHttpPort || isDefaultHttpsPort) {
    parsed.port = '';
  }

  parsed.hash = '';

  return createHash('sha256').update(parsed.toString()).digest('hex').slice(0, 32);
}
