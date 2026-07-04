# צביה כפרי — Gallery Site

A free, ad-free, single-page gallery for Zivia Kafri's paintings. Data is pulled
from her [under1000.com gallery page](https://www.under1000.com/he-IL/products?search=%D7%A6%D7%91%D7%99%D7%94+%D7%9B%D7%A4%D7%A8%D7%99).

## Files

| File                  | Purpose                                                            |
| --------------------- | ------------------------------------------------------------------ |
| `index.html`          | The whole site — layout, styles, lightbox, sharing. No build step. |
| `paintings.js`        | Painting data (auto-generated — don't edit by hand).               |
| `update-paintings.mjs`| Re-scrapes under1000.com, regenerates `paintings.js`, downloads images. |
| `images/`             | Local copies of all painting images (primary source; CDN is fallback). |

## When she adds new paintings

```bash
node update-paintings.mjs
```

That's it — the script fetches her search page on under1000.com, extracts every
painting (Hebrew title + description, English title, dimensions, price, images,
product link) and rewrites `paintings.js`. Then redeploy (see below — for
GitHub Pages it's just a `git push`).

Preview locally: `npx serve .` then open http://localhost:3000.

## Languages

The site is bilingual — Hebrew (default, RTL) and English (LTR). The toggle in
the top corner switches everything: UI text, painting titles and descriptions,
layout direction, and units. The visitor's choice is remembered, and shared
links carry the language (`?lang=en`).

English titles/descriptions come from under1000's data. The four older
paintings have no English there, so their translations are hand-maintained in
the `OVERRIDES` map at the top of `update-paintings.mjs` — edit them there.

## Sharing

- The **share button** on each painting copies (or natively shares) a deep link
  like `https://<site>/#autumn-09c565ae` — opening it lands straight on that
  painting in the lightbox.
- Every painting links to its **under1000.com product page** for purchase.

## Hosting

**Live at: https://udikafri.github.io/zivia-gallery/**
(GitHub Pages, repo `udikafri/zivia-gallery`, deploys automatically from `master`.)

After updating paintings:

```bash
git add paintings.js images && git commit -m "new paintings" && git push
```

The repo is hardened: issues/projects/wiki disabled, GitHub Actions disabled,
no collaborators — only the owner's account can change anything. A custom
domain (e.g. `zivia-art.com`, ~₪40/year) can be attached later in the repo's
Pages settings.

## Notes

- Images are served from the local `images/` folder (downloaded by the update
  script, ~13 MB for 15 paintings). If a local file is missing, the page
  automatically falls back to under1000's CDN — and vice versa: the site keeps
  working even if the CDN is down. The script skips images it already has, so
  re-runs only download new paintings.
- The scraper depends on under1000's page structure. If it ever prints
  "No paintings found", the site changed their markup — the parse logic to fix
  is in `parseCards()` / `parseFlightExtras()`.
