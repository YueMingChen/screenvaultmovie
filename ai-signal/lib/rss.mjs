const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
};

export function decodeEntities(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&([a-z][a-z0-9]+);/gi, (match, name) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

export function stripHtml(value) {
  let text = String(value || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  text = decodeEntities(text);
  text = text
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  text = decodeEntities(text);
  return text.replace(/\s+/g, ' ').trim();
}

function tag(block, names) {
  for (const name of names) {
    const expression = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i');
    const match = block.match(expression);
    if (match) {
      const value = stripHtml(match[1]);
      if (value) return value;
    }
  }
  return '';
}

function atomLink(block) {
  const alternate = block.match(
    /<link\b[^>]*\brel=["']alternate["'][^>]*\bhref=["']([^"']+)["'][^>]*\/?>/i,
  );
  if (alternate) return decodeEntities(alternate[1]);
  const withHref = block.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\/?>/i);
  if (withHref) return decodeEntities(withHref[1]);
  return '';
}

function rssLink(block) {
  const textLink = block.match(/<link(?:\s[^>]*)?>([\s\S]*?)<\/link>/i);
  if (textLink) {
    const value = stripHtml(textLink[1]);
    if (value) return value;
  }
  return atomLink(block);
}

function canonicalUrl(value, base) {
  if (!value) return '';
  try {
    const url = new URL(value, base);
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|ref$|source$|mc_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    }
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Small dependency-free RSS/Atom reader for the feeds used by SIGNAL.
 * It intentionally returns only the fields needed for a link-out aggregator.
 */
export function parseFeed(xml, source) {
  const items = [];
  const blocks = [
    ...String(xml).matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi),
    ...String(xml).matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi),
  ];

  for (const match of blocks) {
    const block = match[1];
    const title = tag(block, ['title']);
    if (!title) continue;

    const url = canonicalUrl(rssLink(block) || tag(block, ['guid', 'id']), source.site);
    if (!url) continue;

    const summaryRaw = tag(block, [
      'content:encoded',
      'content',
      'description',
      'summary',
      'media:description',
    ]);
    const summary = summaryRaw.slice(0, 500).trim();
    const publishedAt =
      parseDate(tag(block, ['pubDate', 'published', 'updated', 'dc:date', 'date'])) ||
      new Date().toISOString();
    const author = tag(block, ['dc:creator', 'author', 'name']);
    const categories = [...block.matchAll(/<category(?:\s[^>]*)?>([\s\S]*?)<\/category>/gi)]
      .map((entry) => stripHtml(entry[1]))
      .filter(Boolean)
      .slice(0, 6);

    items.push({
      title,
      summary,
      url,
      publishedAt,
      author,
      categories,
      sourceId: source.id,
    });
  }

  return items;
}
