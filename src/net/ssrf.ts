import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from "node:dns";
import { BlockList, isIP } from "node:net";

export class UnsafeTargetError extends Error {
  readonly code = "UNSAFE_TARGET";
  constructor(message: string) {
    super(message);
    this.name = "UnsafeTargetError";
  }
}

// Every range that is not globally routable unicast, plus ranges that tunnel to or embed
// other addresses. Anything here is refused before and during connection. The families use
// separate lists: Node matches IPv4 addresses against IPv4-mapped IPv6 rules in a shared list.
const blockedV4 = new BlockList();
const blockedV6 = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, includes 169.254.169.254 cloud metadata
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.88.99.0", 24], // 6to4 relay anycast
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, includes broadcast
] as const) {
  blockedV4.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128], // unspecified
  ["::1", 128], // loopback
  ["64:ff9b::", 96], // NAT64
  ["64:ff9b:1::", 48], // local-use NAT64
  ["100::", 64], // discard
  ["2001::", 23], // IETF protocol assignments, includes Teredo
  ["2001:db8::", 32], // documentation
  ["2002::", 16], // 6to4
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["fec0::", 10], // deprecated site-local
  ["ff00::", 8], // multicast
] as const) {
  blockedV6.addSubnet(net, prefix, "ipv6");
}

function mappedIpv4(address: string): string | null {
  const lower = address.toLowerCase();
  const dotted = /^(?:0{0,4}:){0,5}:?ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(lower) ?? /^::(\d{1,3}(?:\.\d{1,3}){3})$/.exec(lower);
  if (dotted) return dotted[1]!;
  const hex = /^(?:0{0,4}:){0,5}:?ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
  if (hex) {
    const hi = Number.parseInt(hex[1]!, 16);
    const lo = Number.parseInt(hex[2]!, 16);
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  return null;
}

/** True only for globally routable unicast addresses. */
export function isPublicAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, "").split("%")[0]!;
  const family = isIP(ip);
  if (family === 4) return !blockedV4.check(ip, "ipv4");
  if (family === 6) {
    // IPv4-mapped/compatible forms are never needed for crawling and are a classic filter bypass.
    if (mappedIpv4(ip)) return false;
    return !blockedV6.check(ip, "ipv6");
  }
  return false;
}

const BLOCKED_SUFFIXES = [
  "localhost",
  "local",
  "internal",
  "intranet",
  "lan",
  "home",
  "home.arpa",
  "corp",
  "private",
  "localdomain",
  "test",
  "example",
  "invalid",
  "onion",
  "arpa",
];

export interface UrlPolicy {
  /** Allowed ports per scheme. Defaults to the scheme's standard port only. */
  allowedPorts?: { http: string[]; https: string[] };
  /** Address check for IP-literal hosts. Defaults to isPublicAddress; tests may widen it. */
  addressPolicy?: AddressPolicy;
}

/**
 * Validates a URL before any network activity: scheme, credentials, port, hostname shape and
 * literal IPs. Hostnames are resolved and re-checked at connect time by `createSafeLookup`.
 */
export function validatePublicUrl(raw: string | URL, policy: UrlPolicy = {}): URL {
  let url: URL;
  try {
    url = typeof raw === "string" ? new URL(raw.trim()) : new URL(raw.href);
  } catch {
    throw new UnsafeTargetError(`Not a valid absolute URL: ${String(raw).slice(0, 200)}`);
  }
  if (url.href.length > 2048) throw new UnsafeTargetError("URL is longer than 2048 characters.");
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeTargetError(`Only http and https URLs can be analyzed (got ${url.protocol}).`);
  }
  if (url.username || url.password) {
    throw new UnsafeTargetError("URLs with embedded credentials are refused.");
  }
  const ports = policy.allowedPorts ?? { http: [""], https: [""] };
  const allowed = url.protocol === "http:" ? ports.http : ports.https;
  if (!allowed.includes(url.port)) {
    throw new UnsafeTargetError(`Port ${url.port} is not allowed; only the default ${url.protocol.slice(0, -1)} port is.`);
  }
  const host = url.hostname.replace(/\.$/, "").toLowerCase();
  if (!host) throw new UnsafeTargetError("URL has no hostname.");
  const literal = host.replace(/^\[|\]$/g, "");
  if (isIP(literal)) {
    if (!(policy.addressPolicy ?? isPublicAddress)(literal)) {
      throw new UnsafeTargetError(`Refusing to connect to non-public address ${literal}.`);
    }
    return url;
  }
  if (!host.includes(".")) {
    throw new UnsafeTargetError(`Single-label hostname "${host}" may resolve to an internal service and is refused.`);
  }
  for (const suffix of BLOCKED_SUFFIXES) {
    if (host === suffix || host.endsWith(`.${suffix}`)) {
      throw new UnsafeTargetError(`Hostname "${host}" uses a reserved or internal suffix (.${suffix}).`);
    }
  }
  // Numeric-looking hostnames that the URL parser did not normalise (e.g. "0x7f.1") are refused.
  if (/^[0-9.x]+$/i.test(host)) throw new UnsafeTargetError(`Ambiguous numeric hostname "${host}".`);
  return url;
}

export type AddressPolicy = (address: string) => boolean;

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

export type Resolver = (
  hostname: string,
  options: LookupOptions & { all: true },
  callback: (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void,
) => void;

const systemResolver: Resolver = (hostname, options, callback) =>
  dnsLookup(hostname, options, (err, addresses) => callback(err, addresses as LookupAddress[]));

/**
 * A `lookup` for net/tls connect options. Resolution and validation happen in the same call
 * that picks the address the socket connects to, so DNS rebinding between a check and the
 * connection is impossible. If any resolved address is non-public the whole host is refused.
 */
export function createSafeLookup(policy: AddressPolicy = isPublicAddress, resolver: Resolver = systemResolver) {
  return function safeLookup(hostname: string, options: LookupOptions | number | LookupCallback, callback?: LookupCallback) {
    const cb = (typeof options === "function" ? options : callback) as LookupCallback;
    const opts: LookupOptions = typeof options === "object" && options !== null ? options : {};
    resolver(hostname, { ...opts, all: true, verbatim: true }, (err, list) => {
      if (err) return cb(err, "", 0);
      if (list.length === 0) return cb(Object.assign(new Error(`No addresses for ${hostname}`), { code: "ENOTFOUND" }), "", 0);
      const bad = list.find((a) => !policy(a.address));
      if (bad) {
        return cb(new UnsafeTargetError(`${hostname} resolves to non-public address ${bad.address}; refusing to connect.`), "", 0);
      }
      if (opts.all) return cb(null, list);
      const first = list[0]!;
      return cb(null, first.address, first.family);
    });
  };
}

/** Pre-flight resolution used when a proxy (which resolves DNS itself) is configured. */
export async function assertHostResolvesPublic(
  hostname: string,
  policy: AddressPolicy = isPublicAddress,
  resolver: Resolver = systemResolver,
): Promise<"ok" | "unresolved"> {
  const literal = hostname.replace(/^\[|\]$/g, "");
  if (isIP(literal)) {
    if (!policy(literal)) throw new UnsafeTargetError(`Refusing non-public address ${literal}.`);
    return "ok";
  }
  const addresses = await new Promise<LookupAddress[] | null>((resolve) => {
    resolver(hostname, { all: true, verbatim: true }, (err, list) => resolve(err ? null : list));
  });
  if (!addresses) return "unresolved";
  const bad = addresses.find((a) => !policy(a.address));
  if (bad) throw new UnsafeTargetError(`${hostname} resolves to non-public address ${bad.address}; refusing to connect.`);
  return "ok";
}
