export interface ResolvedUrl {
  pdfUrl: string;
  sourceType: "PDF_URL" | "PAGE_URL";
}

export async function resolveUrl(url: string): Promise<ResolvedUrl> {
  // Try arXiv pattern first (no network request needed)
  const arxivResult = resolveArxiv(url);
  if (arxivResult) return arxivResult;

  // Try bioRxiv/medRxiv pattern
  const biorxivResult = resolveBiorxiv(url);
  if (biorxivResult) return biorxivResult;

  // Check if URL directly points to a PDF
  const directPdf = await checkDirectPdf(url);
  if (directPdf) return { pdfUrl: url, sourceType: "PDF_URL" };

  // Try DOI resolution
  const doiResult = resolveDoi(url);
  if (doiResult) {
    const resolved = await followDoiRedirect(doiResult);
    if (resolved) return resolved;
  }

  // Generic page: scan HTML for PDF links
  const htmlResult = await scanPageForPdf(url);
  if (htmlResult) return htmlResult;

  throw new Error(
    "Could not resolve a PDF from the provided URL. Please provide a direct link to a PDF file."
  );
}

function resolveArxiv(url: string): ResolvedUrl | null {
  // Match arxiv.org/abs/XXXX.XXXXX or arxiv.org/abs/hep-ph/XXXXXXX
  const absMatch = url.match(
    /arxiv\.org\/abs\/([\w.-]+\/?\d+(?:\.\d+)?(?:v\d+)?)/
  );
  if (absMatch) {
    return {
      pdfUrl: `https://arxiv.org/pdf/${absMatch[1]}.pdf`,
      sourceType: "PAGE_URL",
    };
  }

  // Already a PDF URL
  if (url.match(/arxiv\.org\/pdf\//)) {
    const pdfUrl = url.endsWith(".pdf") ? url : `${url}.pdf`;
    return { pdfUrl, sourceType: "PDF_URL" };
  }

  return null;
}

function resolveBiorxiv(url: string): ResolvedUrl | null {
  // bioRxiv/medRxiv content URLs
  const match = url.match(
    /(biorxiv\.org|medrxiv\.org)\/content\/([\d.]+\/[\d.]+)(v\d+)?/
  );
  if (match) {
    const base = url.replace(/\.full(\.pdf)?$/, "").replace(/\/$/, "");
    return {
      pdfUrl: `${base}.full.pdf`,
      sourceType: "PAGE_URL",
    };
  }
  return null;
}

function resolveDoi(url: string): string | null {
  // Match doi.org/10.XXXX/XXXXX or just 10.XXXX/XXXXX
  const doiMatch = url.match(/(?:doi\.org\/|^)(10\.\d{4,}\/\S+)/i);
  if (doiMatch) return doiMatch[1];
  return null;
}

async function checkDirectPdf(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });
    const contentType = response.headers.get("content-type") ?? "";
    return contentType.includes("application/pdf");
  } catch {
    return false;
  }
}

async function followDoiRedirect(doi: string): Promise<ResolvedUrl | null> {
  try {
    const response = await fetch(`https://doi.org/${doi}`, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
      headers: { Accept: "text/html" },
    });

    if (!response.ok) return null;

    const finalUrl = response.url;

    // Check if the DOI resolved to an arXiv page
    const arxivResult = resolveArxiv(finalUrl);
    if (arxivResult) return arxivResult;

    // Check if the DOI resolved to a biorxiv/medrxiv page
    const biorxivResult = resolveBiorxiv(finalUrl);
    if (biorxivResult) return biorxivResult;

    // Try scanning the publisher page
    const html = await response.text();
    return scanHtmlForPdfLink(html, finalUrl);
  } catch {
    return null;
  }
}

async function scanPageForPdf(url: string): Promise<ResolvedUrl | null> {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
      headers: { Accept: "text/html" },
    });

    if (!response.ok) return null;

    const html = await response.text();
    return scanHtmlForPdfLink(html, response.url);
  } catch {
    return null;
  }
}

function scanHtmlForPdfLink(
  html: string,
  baseUrl: string
): ResolvedUrl | null {
  // Check meta tags for citation PDF URL
  const metaMatch = html.match(
    /<meta\s+name="citation_pdf_url"\s+content="([^"]+)"/i
  );
  if (metaMatch) {
    return {
      pdfUrl: new URL(metaMatch[1], baseUrl).href,
      sourceType: "PAGE_URL",
    };
  }

  // Check for og:url with PDF
  const ogMatch = html.match(
    /<meta\s+property="og:url"\s+content="([^"]+\.pdf[^"]*)"/i
  );
  if (ogMatch) {
    return {
      pdfUrl: new URL(ogMatch[1], baseUrl).href,
      sourceType: "PAGE_URL",
    };
  }

  // Scan for prominent PDF links
  const linkMatch = html.match(
    /<a[^>]+href="([^"]+\.pdf(?:\?[^"]*)?)"/i
  );
  if (linkMatch) {
    return {
      pdfUrl: new URL(linkMatch[1], baseUrl).href,
      sourceType: "PAGE_URL",
    };
  }

  return null;
}

export async function downloadPdf(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    throw new Error(`Failed to download PDF (${response.status}): ${url}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
