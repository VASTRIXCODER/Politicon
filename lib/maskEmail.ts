/**
 * An email address with everything but a few characters removed, for showing
 * on public pages. Only these pieces ever leave the server: the hidden parts
 * are drawn as a fixed-length placeholder, so neither the page source nor the
 * placeholder's length gives the real address away.
 */
export interface MaskedEmail {
  /** First character of the part before the @. */
  head: string;
  /** First character of the domain name. */
  domainHead: string;
  /** Top-level domain with its dot, e.g. ".com". Empty if there isn't one. */
  tld: string;
}

/** Returns null for anything that isn't a plausible address. */
export function maskEmail(email: string): MaskedEmail | null {
  const at = email.lastIndexOf('@');
  if (at < 1 || at === email.length - 1) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1).toLowerCase();
  const dot = domain.lastIndexOf('.');
  const name = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 && dot < domain.length - 1 ? domain.slice(dot) : '';
  return { head: local[0].toLowerCase(), domainHead: name[0], tld };
}
