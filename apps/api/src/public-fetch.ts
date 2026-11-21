// Fetching a page of the public web from the api Worker without reaching anything private (docs/specs/033-information-security,
// docs/specs/029-sheets/imports.md "The api's guards", docs/specs/009-elements/link-cards.md): the host checks the
// link cards' unfurl uses, and the guarded fetch the spreadsheet imports use.

// True for a hostname we must NOT fetch: loopback / private / link-local /
// cloud-metadata / *.local. Defence-in-depth — Cloudflare Workers don't sit on
// a private network, but we still refuse to fetch (or return data from) these.
// True for a private / loopback / link-local / metadata / multicast / reserved IPv4
// (from its first three octets). Shared by the dotted-quad and IPv4-mapped-IPv6 paths.
function isBlockedIpv4(a: number, b: number, c: number): boolean {
  if (a === 0 || a === 10 || a === 127) return true; // this-host / 10·8 / loopback
  if (a === 169 && b === 254) return true; // link-local + cloud metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16·12
  if (a === 192 && b === 168) return true; // 192.168·16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64·10
  if (a >= 224) return true; // multicast 224·4, reserved 240·4 (broadcast included)
  if (a === 192 && b === 0 && c === 0) return true; // IETF protocol assignments 192.0.0·24
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking 198.18·15
  return false;
}

export function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, ''); // strip ipv6 brackets
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true;
  if (h === '::1' || h === '::' || h === '0.0.0.0') return true; // loopback / unspecified
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (m && isBlockedIpv4(Number(m[1]), Number(m[2]), Number(m[3]))) return true;
  // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1, which WHATWG URL normalises to the
  // hex form ::ffff:7f00:1): unwrap the embedded IPv4 and re-run the checks,
  // else a mapped loopback / metadata address slips past the IPv6 prefixes.
  if (h.startsWith('::ffff:')) {
    const mapped = h.slice('::ffff:'.length);
    const dotted = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(mapped);
    if (dotted && isBlockedIpv4(Number(dotted[1]), Number(dotted[2]), Number(dotted[3])))
      return true;
    const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(mapped);
    if (hex) {
      const hi = parseInt(hex[1]!, 16);
      const lo = parseInt(hex[2]!, 16);
      if (isBlockedIpv4((hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff)) return true;
    }
  }
  // IPv6 ULA (fc00::/7), link-local (fe80::/10), multicast (ff00::/8) and NAT64 (64:ff9b::/96), on an IPv6
  // literal only: a domain such as fdic.gov or fcbarcelona.com starts with the same letters and is public.
  if (h.includes(':') && /^(f[cd]|fe[89ab]|ff|64:ff9b:)/.test(h)) return true;
  return false;
}

// Parse + validate a target for SSRF safety. Returns the URL only when it's a
// public http(s) target; null for a bad/non-http/blocked-host URL.
export function parsePublicHttpUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (isBlockedHost(u.hostname)) return null;
  return u;
}

// ---- Fetching a public page (docs/specs/029-sheets/imports.md "The api's guards") ------------------------------

/** What fetching a public page gives: its text, type and final address, or why it was not fetched. */
export type PublicPage =
  { ok: true; text: string; type: string; url: string } | { ok: false; reason: string };
/** What fetching a public address gives as it came: its bytes, the type its server names, its final address. */
export type PublicBytes =
  { ok: true; bytes: Uint8Array; type: string; url: string } | { ok: false; reason: string };

export type PublicFetchOptions = {
  // The fetch to reach the web with (tests stub it); the Worker's own by default.
  fetcher?: typeof fetch;
  timeoutMs: number;
  maxBytes: number;
  maxRedirects: number;
  userAgent: string;
  accept: string;
};

// Where a host name is resolved before it is fetched: DNS over HTTPS, JSON form.
const DOH_URL = 'https://cloudflare-dns.com/dns-query';
const DNS_A = 1;
const DNS_AAAA = 28;

/** Whether a host name resolves only to public addresses (an IP literal is checked as it stands). */
export async function resolvesPublic(host: string, fetcher: typeof fetch): Promise<boolean> {
  const h = host.replace(/^\[/, '').replace(/\]$/, '');
  if (/^[\d.]+$/.test(h) || h.includes(':')) return !isBlockedHost(h);
  const answers: string[] = [];
  for (const type of ['A', 'AAAA']) {
    const res = await fetcher(`${DOH_URL}?name=${encodeURIComponent(h)}&type=${type}`, {
      headers: { accept: 'application/dns-json' },
    });
    if (!res.ok) return false;
    const body = await res.json<{ Answer?: { type: number; data: string }[] }>();
    for (const a of body.Answer ?? [])
      if (a.type === DNS_A || a.type === DNS_AAAA) answers.push(a.data);
  }
  return answers.length > 0 && answers.every((ip) => !isBlockedHost(ip));
}

// An address fit to fetch: http or https, its own port, a public host.
function fetchable(url: URL): boolean {
  return (
    (url.protocol === 'http:' || url.protocol === 'https:') &&
    url.port === '' &&
    !isBlockedHost(url.hostname)
  );
}

async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array | null> {
  const reader: ReadableStreamDefaultReader<Uint8Array> | undefined = res.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader)
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

function decode(bytes: Uint8Array, type: string): string {
  const charset = /charset=["']?([\w-]+)/i.exec(type)?.[1] ?? 'utf-8';
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

/** A public page fetched with the guards (fetchPublicBytes), its text decoded in the charset its type names. */
export async function fetchPublicPage(raw: string, opts: PublicFetchOptions): Promise<PublicPage> {
  const got = await fetchPublicBytes(raw, opts);
  return got.ok
    ? { ok: true, text: decode(got.bytes, got.type), type: got.type, url: got.url }
    : got;
}

/**
 * A public address fetched with the guards: each address (the first and every redirect, followed by hand) checked and
 * its host resolved to public addresses only; no cookie or credential sent; bounded in time and size.
 */
export async function fetchPublicBytes(
  raw: string,
  opts: PublicFetchOptions,
): Promise<PublicBytes> {
  const fetcher = opts.fetcher ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    let url = new URL(raw);
    for (let hop = 0; ; hop++) {
      if (!fetchable(url)) return { ok: false, reason: 'address_refused' };
      if (!(await resolvesPublic(url.hostname, fetcher)))
        return { ok: false, reason: 'host_refused' };
      const res = await fetcher(url.href, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': opts.userAgent, Accept: opts.accept },
      });
      const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
      if (location) {
        if (hop >= opts.maxRedirects) return { ok: false, reason: 'too_many_redirects' };
        url = new URL(location, url);
        continue;
      }
      if (!res.ok) return { ok: false, reason: `status_${res.status}` };
      const type = res.headers.get('content-type') ?? '';
      const bytes = await readCapped(res, opts.maxBytes);
      if (!bytes) return { ok: false, reason: 'too_large' };
      return { ok: true, bytes, type, url: url.href };
    }
  } catch (e) {
    return {
      ok: false,
      reason: controller.signal.aborted ? 'timeout' : `network:${(e as Error).name}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
