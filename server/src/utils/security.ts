import { URL } from 'url';

// Private and reserved IP prefixes for SSRF blocking
const PRIVATE_IP_PATTERNS = [
  /^127\./,                          // 127.0.0.0/8 loopback
  /^10\./,                           // 10.0.0.0/8 private
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,  // 172.16.0.0/12 private
  /^192\.168\./,                     // 192.168.0.0/16 private
  /^169\.254\./,                     // 169.254.0.0/16 link-local (cloud metadata)
  /^0\./,                            // 0.0.0.0/8
  /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./, // 100.64.0.0/10 Carrier NAT
  /^::1$/,                           // IPv6 loopback
  /^fc00:/i,                         // IPv6 unique local
  /^fe80:/i,                         // IPv6 link-local
];

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  'instance-data',
  'metadata.google.internal',
  '169.254.169.254',
]);

/**
 * Validates a target URL against SSRF attacks and illegal protocols.
 */
export function validateTargetUrl(rawUrl: string): { isValid: boolean; error?: string; url?: URL } {
  try {
    const trimmed = rawUrl.trim();
    if (!trimmed) {
      return { isValid: false, error: 'URL cannot be empty' };
    }

    const parsed = new URL(trimmed);

    // Only allow HTTP and HTTPS
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { isValid: false, error: `Disallowed protocol: ${parsed.protocol}. Only http and https are allowed.` };
    }

    const hostname = parsed.hostname.toLowerCase();

    // Check against blocked hostnames
    if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
      return { isValid: false, error: `Access to restricted or private host '${hostname}' is prohibited.` };
    }

    // Check against private IP regexes
    for (const pattern of PRIVATE_IP_PATTERNS) {
      if (pattern.test(hostname)) {
        return { isValid: false, error: `Access to private or loopback IP range '${hostname}' is prohibited.` };
      }
    }

    return { isValid: true, url: parsed };
  } catch (err: any) {
    return { isValid: false, error: `Invalid URL format: ${err?.message || 'Failed to parse'}` };
  }
}

/**
 * Normalizes a URL: removes trailing fragments, hashes, UTM tracking params, and cleans slashes.
 */
export function normalizeUrl(rawUrl: string, baseUrl?: string): string | null {
  try {
    const parsed = baseUrl ? new URL(rawUrl, baseUrl) : new URL(rawUrl);

    // Only allow http and https
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    // Strip hash fragment
    parsed.hash = '';

    // Strip tracking query params
    const searchParams = new URLSearchParams(parsed.search);
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'fbclid', 'gclid'];
    for (const param of trackingParams) {
      searchParams.delete(param);
    }
    parsed.search = searchParams.toString() ? `?${searchParams.toString()}` : '';

    // Normalize pathname
    let pathname = parsed.pathname;
    // Remove duplicate slashes
    pathname = pathname.replace(/\/+/g, '/');
    // Remove trailing slash if not root
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    parsed.pathname = pathname;

    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Checks if candidate URL belongs to the approved target domain / path scope.
 */
export function isUrlInScope(candidateUrl: string, rootDomain: string, initialPathPrefix?: string): boolean {
  try {
    const parsed = new URL(candidateUrl);
    const candidateHost = parsed.hostname.toLowerCase();
    const approvedHost = rootDomain.toLowerCase();

    // Exact match or subdomain
    const isDomainMatch = candidateHost === approvedHost || candidateHost.endsWith(`.${approvedHost}`);
    if (!isDomainMatch) return false;

    // Disallow binary or non-doc file extensions
    const disallowedExtensions = [
      '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico',
      '.zip', '.tar', '.gz', '.exe', '.dmg', '.pkg', '.deb', '.rpm',
      '.mp4', '.mp3', '.mov', '.pdf', '.docx', '.xlsx',
      '.wasm', '.map', '.css'
    ];
    const pathLower = parsed.pathname.toLowerCase();
    for (const ext of disallowedExtensions) {
      if (pathLower.endsWith(ext)) return false;
    }

    // Skip logout, signin, auth paths
    if (/\/(login|signin|logout|signup|cart|checkout|admin)\b/i.test(pathLower)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitize documentation text to prevent prompt injection attacks when included in AI prompt.
 */
export function sanitizeDocContent(text: string): string {
  // Strip null bytes and control chars
  let cleaned = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  // Neutralize prompt injection tokens if user injected them
  cleaned = cleaned.replace(/<\/?(?:system|instruction|prompt|context|evidence)[^>]*>/gi, (match) => {
    return match.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  });
  return cleaned;
}
