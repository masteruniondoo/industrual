/**
 * The DotNS name a page is served under.
 *
 * Product accounts are scoped to a DotNS identifier, so the host derives a
 * different account for `industrial.dot` than for anything else. Deriving the
 * identifier from `location.hostname` rather than hardcoding it keeps the
 * signing account bound to the name the user actually loaded: a copy of the
 * bundle served under another name gets its own account instead of silently
 * reusing this one's.
 */

/** Gateways that serve a `<label>.dot` product under their own domain. */
const GATEWAY_SUFFIXES = [".dev-dot.li", ".dot.li"];

/**
 * Map a hostname to the DotNS identifier whose product account signs for it,
 * or null when the page is not served under a DotNS name at all (localhost
 * during `next dev`, an IP address, a preview domain). A null identifier is not
 * an error - it means the caller must fall back to a configured name.
 */
export function selfDotNsIdentifier(hostname: string): string | null {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host) return null;

  for (const suffix of GATEWAY_SUFFIXES) {
    if (!host.endsWith(suffix)) continue;
    const label = host.slice(0, -suffix.length);
    return label ? `${label}.dot` : null;
  }

  return host.endsWith(".dot") ? host : null;
}
