#!/usr/bin/env node
/**
 * Regenerates paintings.js from the under1000.com search page.
 *
 * Usage:
 *   node update-paintings.mjs             # fetch live from under1000.com
 *   node update-paintings.mjs page.html   # parse a saved HTML file (debug)
 */
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SEARCH_URL =
  'https://www.under1000.com/he-IL/products?search=%D7%A6%D7%91%D7%99%D7%94+%D7%9B%D7%A4%D7%A8%D7%99';
const SITE_ORIGIN = 'https://www.under1000.com';
const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = join(ROOT, 'paintings.js');
const IMAGES_DIR = join(ROOT, 'images');

async function fileExists(path) {
  try { await access(path); return true; } catch { return false; }
}

/** Download url to images/<name> unless already present. Returns the relative
 *  path on success, or null (CDN-only) on failure. */
async function downloadImage(url, name) {
  if (!url) return null;
  const rel = `images/${name}`;
  const dest = join(IMAGES_DIR, name);
  if (await fileExists(dest)) return rel;
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (gallery-updater)' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await writeFile(dest, Buffer.from(await res.arrayBuffer()));
    console.log(`  downloaded ${rel}`);
    return rel;
  } catch (e) {
    console.warn(`  ! could not download ${url}: ${e.message}`);
    return null;
  }
}

async function getHtml(page) {
  const localFile = process.argv[2];
  if (localFile) {
    if (page > 1) return null; // local file = single page
    return readFile(localFile, 'utf8');
  }
  const url = page > 1 ? `${SEARCH_URL}&page=${page}` : SEARCH_URL;
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (gallery-updater)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function parseCards(html) {
  const cards = [];
  const anchorRe = /<a class="block group" href="\/he-IL\/products\/([^"]+)"/g;
  const matches = [...html.matchAll(anchorRe)];
  for (let i = 0; i < matches.length; i++) {
    const slug = matches[i][1];
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : start + 6000;
    const chunk = html.slice(start, end);

    const title = chunk.match(/alt="([^"]*)"/)?.[1] ?? slug;
    const encodedImg = chunk.match(/\/_next\/image\?url=([^&"]+)/)?.[1];
    const thumb = encodedImg ? decodeURIComponent(encodedImg) : null;
    // Rendered as "1,950 ‏₪" — number first, optional RTL marks before the sign.
    const price =
      chunk.match(/([\d,]+)\s*[‎‏]*\s*₪/)?.[1]?.replace(/,/g, '') ?? null;

    cards.push({ slug, title, thumb, price: price ? Number(price) : null });
  }
  return cards;
}

function parseDescriptions(html) {
  // The page ships an sr-only block of <h3>title</h3><p>hebrew description</p> pairs.
  const map = new Map();
  for (const m of html.matchAll(/<h3>([^<]+)<\/h3><p>([^<]*)<\/p>/g)) {
    map.set(m[1].trim(), m[2].trim());
  }
  return map;
}

// Older records duplicate the Hebrew text into the *_en fields. English for
// those is maintained here by hand (translations of the artist's own text) —
// edit freely; re-runs keep these.
const OVERRIDES = {
  '--6ce3zw': {
    titleEn: 'On the Bank of the Canal',
    descriptionEn: 'A soldier in the Yom Kippur War on the bank of the Suez Canal.',
  },
  '--r178tb': { titleEn: 'Passions', descriptionEn: 'An eruption of passions.' },
  '--lw688v': { titleEn: 'Sheep', descriptionEn: 'Three colorful sheep.' },
  '--7zvqkt': { titleEn: 'Goldfish', descriptionEn: 'A goldfish in fairytale waters.' },
};

const hasHebrew = (s) => /[֐-׿]/.test(s || '');

// Some source titles arrive all-lowercase ("family past") — title-case those.
const SMALL_WORDS = new Set(['a', 'an', 'the', 'of', 'in', 'on', 'at', 'and', 'or']);
function polishTitle(s) {
  if (!s || s !== s.toLowerCase()) return s;
  return s
    .split(/\s+/)
    .map((w, i) =>
      i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)
    )
    .join(' ');
}

function parseEnMap(un) {
  // Product records carry "title_en","title_he","description_en" adjacently —
  // map he-title → English fields. Hebrew-duplicated *_en values are dropped.
  const map = new Map();
  const re = /"title_en":"(.*?)","title_he":"(.*?)","description_en":"(.*?)","description_he":/g;
  for (const m of un.matchAll(re)) {
    map.set(m[2], {
      titleEn: hasHebrew(m[1]) ? null : m[1].trim() || null,
      descriptionEn: hasHebrew(m[3]) ? null : m[3].trim() || null,
    });
  }
  return map;
}

function parseFlightExtras(un, slug) {
  // The Next.js flight payload carries escaped JSON records. Field order within
  // a record: ..."images":[...] ... "slug":"..." ... "width":N,"height":N ...
  // So: images = LAST match before the slug; width/height = FIRST match after.
  // A symmetric first-match window here once attributed a neighbor's image.
  const at = un.indexOf(`"slug":"${slug}"`);
  if (at === -1) return {};
  const before = un.slice(Math.max(0, at - 3000), at);
  const after = un.slice(at, at + 1500);
  const imgMatches = [...before.matchAll(/"images":\["(https:[^"]+?)"/g)];
  const widthCm = after.match(/"width":(\d+)/)?.[1] ?? null;
  const heightCm = after.match(/"height":(\d+)/)?.[1] ?? null;
  return {
    widthCm: widthCm ? Number(widthCm) : null,
    heightCm: heightCm ? Number(heightCm) : null,
    image: imgMatches.at(-1)?.[1] ?? null,
  };
}

await mkdir(IMAGES_DIR, { recursive: true });
const paintings = [];
const seen = new Set();
for (let page = 1; page <= 10; page++) {
  const html = await getHtml(page);
  if (!html) break;
  const cards = parseCards(html);
  const descriptions = parseDescriptions(html);
  const un = html.replace(/\\"/g, '"');
  const enMap = parseEnMap(un);
  const fresh = cards.filter((c) => !seen.has(c.slug));
  if (fresh.length === 0) break;
  for (const card of fresh) {
    seen.add(card.slug);
    const extras = parseFlightExtras(un, card.slug);
    const image = extras.image || card.thumb;
    const thumb = card.thumb || image;
    const ext = (u) => (u?.match(/\.(webp|jpe?g|png|avif)(?:\?|$)/i)?.[1] || 'webp');
    paintings.push({
      slug: card.slug,
      title: card.title,
      titleEn: polishTitle(
        OVERRIDES[card.slug]?.titleEn ?? enMap.get(card.title)?.titleEn ?? null
      ),
      description: descriptions.get(card.title) || null,
      descriptionEn:
        OVERRIDES[card.slug]?.descriptionEn ?? enMap.get(card.title)?.descriptionEn ?? null,
      price: card.price,
      currency: 'ILS',
      widthCm: extras.widthCm,
      heightCm: extras.heightCm,
      thumb,
      image,
      localImage: await downloadImage(image, `${card.slug}.${ext(image)}`),
      localThumb:
        thumb === image
          ? await downloadImage(image, `${card.slug}.${ext(image)}`)
          : await downloadImage(thumb, `${card.slug}-thumb.${ext(thumb)}`),
      url: `${SITE_ORIGIN}/he-IL/products/${card.slug}`,
    });
  }
  if (cards.length === fresh.length && cards.length < 12) break; // last page
}

if (paintings.length === 0) {
  console.error('No paintings found — the gallery page structure may have changed.');
  process.exit(1);
}

const banner =
  '// Auto-generated by update-paintings.mjs — do not edit by hand.\n' +
  '// To refresh after new paintings are added, run: node update-paintings.mjs\n';
await writeFile(
  OUT_FILE,
  `${banner}window.GALLERY_URL = ${JSON.stringify(SEARCH_URL)};\n` +
    `window.PAINTINGS = ${JSON.stringify(paintings, null, 2)};\n`,
  'utf8'
);
console.log(`Wrote ${paintings.length} paintings to paintings.js`);
for (const p of paintings) console.log(`  - ${p.title} (₪${p.price ?? '?'})`);
