import { isIP } from 'node:net';

const PRIVATE_IPV4_RANGES: Array<[number, number]> = [
  [toIpv4Int('10.0.0.0'), toIpv4Int('10.255.255.255')],
  [toIpv4Int('127.0.0.0'), toIpv4Int('127.255.255.255')],
  [toIpv4Int('169.254.0.0'), toIpv4Int('169.254.255.255')],
  [toIpv4Int('172.16.0.0'), toIpv4Int('172.31.255.255')],
  [toIpv4Int('192.168.0.0'), toIpv4Int('192.168.255.255')]
];

export interface SourcePolicy {
  domain: string;
  allowedPathPatterns: string[];
  blockedPathPatterns: string[];
}

function toIpv4Int(ip: string) {
  return ip
    .split('.')
    .map((part) => Number(part))
    .reduce((acc, octet) => (acc << 8) + octet, 0) >>> 0;
}

function isPrivateIpv4(hostname: string) {
  if (isIP(hostname) !== 4) return false;
  const value = toIpv4Int(hostname);
  return PRIVATE_IPV4_RANGES.some(([min, max]) => value >= min && value <= max);
}

function isPrivateIpv6(hostname: string) {
  if (isIP(hostname) !== 6) return false;
  const normalized = hostname.toLowerCase();
  return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80');
}

export function normalizeUrlForComparison(input: string) {
  const url = new URL(input);

  // Matching rules:
  // 1) Scheme + host are lowercased.
  // 2) Default ports (:80 for http, :443 for https) are removed.
  // 3) Query string ordering and values are preserved; hash fragments are removed.
  // 4) Trailing slash is removed except for root path ('/').
  // 5) Path matching remains case-sensitive.
  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();
  if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
    url.port = '';
  }

  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1);
  }

  url.hash = '';
  return url.toString();
}

export function matchesPathRules(pathname: string, allowed: string[], blocked: string[]) {
  const allowMatch = allowed.length === 0 || allowed.some((pattern) => pathname.includes(pattern));
  const blockedMatch = blocked.some((pattern) => pathname.includes(pattern));
  return allowMatch && !blockedMatch;
}

export function isHostWithinDomain(hostname: string, domain: string) {
  const host = hostname.toLowerCase();
  const normalizedDomain = domain.toLowerCase();
  return host === normalizedDomain || host.endsWith(`.${normalizedDomain}`);
}

export function isPrivateNetworkHostname(hostname: string) {
  const host = hostname.toLowerCase();
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === '0.0.0.0' ||
    isPrivateIpv4(host) ||
    isPrivateIpv6(host)
  );
}

export function isApprovedBySourcePolicy(input: string | URL, source: SourcePolicy) {
  const url = typeof input === 'string' ? new URL(input) : input;
  if (!['http:', 'https:'].includes(url.protocol)) {
    return false;
  }
  if (isPrivateNetworkHostname(url.hostname)) {
    return false;
  }
  if (!isHostWithinDomain(url.hostname, source.domain)) {
    return false;
  }
  return matchesPathRules(url.pathname, source.allowedPathPatterns, source.blockedPathPatterns);
}
