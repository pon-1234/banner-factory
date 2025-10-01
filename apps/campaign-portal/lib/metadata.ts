interface MetadataResult {
  title?: string;
  description?: string;
  ogImage?: string;
}

export async function fetchPageMetadata(url: string): Promise<MetadataResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: "text/html" } });
    if (!res.ok) {
      throw new Error(`Failed to fetch metadata: ${res.status}`);
    }
    const html = await res.text();
    return parseMetadata(html);
  } finally {
    clearTimeout(timeout);
  }
}

function parseMetadata(html: string): MetadataResult {
  const result: MetadataResult = {};
  const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
  if (titleMatch) {
    result.title = decodeHtml(titleMatch[1]);
  }
  const descriptionMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i);
  if (descriptionMatch) {
    result.description = decodeHtml(descriptionMatch[1]);
  }
  const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']*)["'][^>]*>/i);
  if (ogImageMatch) {
    result.ogImage = decodeHtml(ogImageMatch[1]);
  }
  return result;
}

function decodeHtml(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">" ).replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
