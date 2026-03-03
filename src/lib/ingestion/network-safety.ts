import dns from "node:dns/promises";
import net from "node:net";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const DEFAULT_MAX_REDIRECTS = 5;

const BLOCKED_IPV4_CIDRS = [
  { base: "0.0.0.0", prefix: 8 },
  { base: "10.0.0.0", prefix: 8 },
  { base: "100.64.0.0", prefix: 10 },
  { base: "127.0.0.0", prefix: 8 },
  { base: "169.254.0.0", prefix: 16 },
  { base: "172.16.0.0", prefix: 12 },
  { base: "192.0.0.0", prefix: 24 },
  { base: "192.0.2.0", prefix: 24 },
  { base: "192.168.0.0", prefix: 16 },
  { base: "198.18.0.0", prefix: 15 },
  { base: "198.51.100.0", prefix: 24 },
  { base: "203.0.113.0", prefix: 24 },
  { base: "224.0.0.0", prefix: 4 },
  { base: "240.0.0.0", prefix: 4 },
] as const;

const BLOCKED_IPV6_CIDRS = [
  { base: "::", prefix: 128 },
  { base: "::1", prefix: 128 },
  { base: "fc00::", prefix: 7 },
  { base: "fe80::", prefix: 10 },
  { base: "ff00::", prefix: 8 },
  { base: "2001:db8::", prefix: 32 },
] as const;

export interface SafeFetchResult {
  response: Response;
  finalUrl: string;
}

export function isSupportedHttpProtocol(protocol: string): boolean {
  return protocol === "http:" || protocol === "https:";
}

export function normalizeHttpUrl(url: string): URL {
  const parsed = new URL(url);
  if (!isSupportedHttpProtocol(parsed.protocol)) {
    throw new Error(`Unsupported URL protocol: ${parsed.protocol}`);
  }
  if (parsed.username || parsed.password) {
    throw new Error("URLs with embedded credentials are not allowed");
  }
  return parsed;
}

export async function assertSafeRemoteUrl(url: string): Promise<URL> {
  const parsed = normalizeHttpUrl(url);
  const hostname = parsed.hostname.toLowerCase();

  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    throw new Error(`Blocked local hostname: ${hostname}`);
  }

  if (net.isIP(hostname)) {
    if (isDisallowedIpAddress(hostname)) {
      throw new Error(`Blocked private or reserved IP address: ${hostname}`);
    }
    return parsed;
  }

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error(`Unable to resolve host: ${hostname}`);
  }

  if (addresses.length === 0) {
    throw new Error(`Unable to resolve host: ${hostname}`);
  }

  for (const { address } of addresses) {
    if (isDisallowedIpAddress(address)) {
      throw new Error(
        `Blocked private or reserved IP address for host ${hostname}: ${address}`
      );
    }
  }

  return parsed;
}

export async function safeFetch(
  inputUrl: string,
  init: RequestInit = {},
  maxRedirects = DEFAULT_MAX_REDIRECTS
): Promise<SafeFetchResult> {
  let currentUrl = normalizeHttpUrl(inputUrl).toString();

  for (let redirects = 0; redirects <= maxRedirects; redirects++) {
    await assertSafeRemoteUrl(currentUrl);

    const response = await fetch(currentUrl, {
      ...init,
      redirect: "manual",
    });

    if (!isRedirectStatus(response.status)) {
      return { response, finalUrl: currentUrl };
    }

    const location = response.headers.get("location");
    if (!location) {
      throw new Error("Redirect response missing Location header");
    }

    currentUrl = new URL(location, currentUrl).toString();
  }

  throw new Error(`Too many redirects while fetching URL: ${inputUrl}`);
}

function isRedirectStatus(status: number): boolean {
  return REDIRECT_STATUSES.has(status);
}

function isDisallowedIpAddress(ip: string): boolean {
  if (net.isIP(ip) === 4) return isDisallowedIPv4(ip);
  if (net.isIP(ip) === 6) return isDisallowedIPv6(ip);
  return true;
}

function isDisallowedIPv4(ip: string): boolean {
  return BLOCKED_IPV4_CIDRS.some((cidr) =>
    isIpv4InCidr(ip, cidr.base, cidr.prefix)
  );
}

function isDisallowedIPv6(ip: string): boolean {
  const hextets = parseIpv6ToHextets(ip);
  if (!hextets) {
    return true;
  }

  // Handle IPv4-mapped IPv6 addresses (e.g. ::ffff:127.0.0.1).
  const isMappedIpv4 =
    hextets[0] === 0 &&
    hextets[1] === 0 &&
    hextets[2] === 0 &&
    hextets[3] === 0 &&
    hextets[4] === 0 &&
    hextets[5] === 0xffff;

  if (isMappedIpv4) {
    const mappedIpv4 = `${hextets[6] >> 8}.${hextets[6] & 0xff}.${hextets[7] >> 8}.${hextets[7] & 0xff}`;
    return isDisallowedIPv4(mappedIpv4);
  }

  return BLOCKED_IPV6_CIDRS.some((cidr) =>
    isIpv6InCidr(ip, cidr.base, cidr.prefix)
  );
}

function isIpv4InCidr(ip: string, base: string, prefix: number): boolean {
  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(base);
  if (ipInt === null || baseInt === null) return false;
  if (prefix === 0) return true;
  const mask = (~((1 << (32 - prefix)) - 1)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

function ipv4ToInt(ip: string): number | null {
  const octets = parseIpv4(ip);
  if (!octets) return null;

  return (
    ((octets[0] << 24) >>> 0) |
    (octets[1] << 16) |
    (octets[2] << 8) |
    octets[3]
  ) >>> 0;
}

function parseIpv4(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;

  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (!Number.isInteger(value) || value < 0 || value > 255) return null;
    octets.push(value);
  }
  return octets;
}

function isIpv6InCidr(ip: string, base: string, prefix: number): boolean {
  const ipHextets = parseIpv6ToHextets(ip);
  const baseHextets = parseIpv6ToHextets(base);
  if (!ipHextets || !baseHextets) return false;
  if (prefix === 0) return true;

  let remainingBits = prefix;
  for (let i = 0; i < 8; i++) {
    if (remainingBits <= 0) return true;

    const bitsInThisHextet = Math.min(remainingBits, 16);
    const mask =
      bitsInThisHextet === 16
        ? 0xffff
        : ((0xffff << (16 - bitsInThisHextet)) & 0xffff);

    if ((ipHextets[i] & mask) !== (baseHextets[i] & mask)) {
      return false;
    }

    remainingBits -= bitsInThisHextet;
  }

  return true;
}

function parseIpv6ToHextets(ip: string): number[] | null {
  let normalized = stripIpv6Zone(ip).toLowerCase();

  if (normalized.includes(".")) {
    const lastColon = normalized.lastIndexOf(":");
    if (lastColon < 0) return null;

    const ipv4Part = normalized.slice(lastColon + 1);
    const ipv4 = parseIpv4(ipv4Part);
    if (!ipv4) return null;

    const high = ((ipv4[0] << 8) | ipv4[1]).toString(16);
    const low = ((ipv4[2] << 8) | ipv4[3]).toString(16);
    normalized = `${normalized.slice(0, lastColon)}:${high}:${low}`;
  }

  const split = normalized.split("::");
  if (split.length > 2) return null;

  const left = split[0] ? split[0].split(":") : [];
  const right = split.length === 2 && split[1] ? split[1].split(":") : [];

  let parts: string[];
  if (split.length === 2) {
    const missing = 8 - (left.length + right.length);
    if (missing < 0) return null;
    parts = [...left, ...new Array(missing).fill("0"), ...right];
  } else {
    parts = normalized.split(":");
    if (parts.length !== 8) return null;
  }

  if (parts.length !== 8) return null;

  const hextets: number[] = [];
  for (const part of parts) {
    if (!/^[0-9a-f]{1,4}$/i.test(part)) return null;
    hextets.push(parseInt(part, 16));
  }

  return hextets;
}

function stripIpv6Zone(ip: string): string {
  const zoneIndex = ip.indexOf("%");
  if (zoneIndex === -1) return ip;
  return ip.slice(0, zoneIndex);
}
