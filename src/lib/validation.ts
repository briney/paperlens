const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// CUID v1 format: starts with 'c', 25 alphanumeric chars
const CUID_RE = /^c[a-z0-9]{24,}$/;

const ALLOWED_DOMAINS = [
  "arxiv.org",
  "biorxiv.org",
  "medrxiv.org",
  "doi.org",
  "nature.com",
  "science.org",
  "sciencemag.org",
  "cell.com",
  "springer.com",
  "springerlink.com",
  "link.springer.com",
  "wiley.com",
  "onlinelibrary.wiley.com",
  "plos.org",
  "journals.plos.org",
  "pnas.org",
  "sciencedirect.com",
  "pubmed.ncbi.nlm.nih.gov",
  "ncbi.nlm.nih.gov",
  "academic.oup.com",
  "tandfonline.com",
  "frontiersin.org",
  "mdpi.com",
  "biomedcentral.com",
  "jbc.org",
  "acs.org",
  "rsc.org",
  "ieeexplore.ieee.org",
  "dl.acm.org",
];

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}

export function isValidCuid(id: string): boolean {
  return CUID_RE.test(id);
}

export function isValidPassword(password: string): boolean {
  return typeof password === "string" && password.length >= 8 && password.length <= 128;
}

export function isAllowedPaperUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();
    if (hostname === "localhost" || hostname.endsWith(".localhost")) {
      return false;
    }

    // Allow direct PDF URL submissions after protocol/host checks.
    if (parsed.pathname.toLowerCase().endsWith(".pdf")) return true;

    return ALLOWED_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith("." + domain)
    );
  } catch {
    return false;
  }
}
