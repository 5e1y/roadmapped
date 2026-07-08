# site/ — the roadmapped.work landing

Self-contained static landing page. No build step for the page itself: `index.html`
inlines its CSS, embeds the favicon as a data URI, and references two local assets
(`dashboard.png`, `og-image.png`). Deploy the folder as-is.

## Files

| File | What |
|---|---|
| `index.html` | The landing. Mobile-first, light/dark, full SEO (title, description, canonical, Open Graph, Twitter card, JSON-LD `SoftwareApplication`). |
| `dashboard.png` | Hero screenshot (copied from `docs/assets/`). |
| `og-image.png` | 1200×630 social share card. Referenced by `og:image` / `twitter:image`. |
| `og-image.html` | Reproducible source for `og-image.png` (regenerate below). |
| `robots.txt` | Allows all, disallows `/demo/`, points to the sitemap. |
| `sitemap.xml` | The home URL. Bump `<lastmod>` on meaningful changes. |
| `llms.txt` | Structured summary for AI crawlers (agent-first positioning). |

## Deploy (Cloudflare Pages)

The domain **roadmapped.work** is on Cloudflare. Point a Pages project at this `site/`
folder (build command: none; output directory: `site`), or push it to a `site` repo
wired to Pages.

## Wiring the live demo (`/demo/`)

The landing links to `/demo/` ("Try the live demo"). That path is the standalone demo
build, produced from this repo:

```bash
npm run build:demo          # → dist-demo/ (static, no server, embedded demo backlog)
cp -r dist-demo <deploy>/demo   # place it under /demo/ at deploy time
```

`dist-demo/` is a build artifact (gitignored) — build it in CI/deploy, don't commit it.
`vite.demo.config.ts` already sets `base: './'` so the bundle resolves correctly under
`/demo/`.

## Before publish (open items)

- **GitHub URL**: every link uses the placeholder `github.com/remicourtillon/Roadmapped`.
  Find-and-replace across `index.html`, `llms.txt` (and repo-wide) once the real
  org/repo is known.
- Regenerate the OG image after any copy change to it:
  ```bash
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
    --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size=1200,630 --screenshot=og-image.png "file://$PWD/og-image.html"
  ```
