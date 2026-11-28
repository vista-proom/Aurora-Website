# Cloudflare Security, Caching & Compression Guide (`aurora-eg.ziadbahgat.me`)

GitHub Pages (`actions/deploy-pages`) serves static files with a fixed `Cache-Control: max-age=600` header and does not allow custom HTTP security headers. Putting Cloudflare (Free tier, Orange-Cloud proxied DNS) in front of `aurora-eg.ziadbahgat.me` adds full security headers, 1-year immutable asset caching, and Brotli compression.

---

## 0. GitHub Pages Prerequisite
1. Go to **GitHub Repository → Settings → Pages**.
2. Check **Enforce HTTPS** so GitHub redirects `http://` requests at the edge (an inline JS fallback redirect is also active in `<head>`).

---

## 1. Enable Brotli & HTTPS in Cloudflare
- **SSL/TLS → Overview**: Set encryption mode to **Full (strict)**.
- **SSL/TLS → Edge Certificates**:
  - Enable **Always Use HTTPS**.
  - Enable **HTTP Strict Transport Security (HSTS)**: `max-age=31536000` (12 months), `includeSubDomains: on`, `nosniff: on`.
- **Speed → Optimization → Content Optimization**: Ensure **Brotli** is **On**.

---

## 2. Security Response Headers (Cloudflare Transform Rule)
Go to **Rules → Transform Rules → Modify Response Header → Create rule**:
- **Rule name**: `Aurora Security Headers`
- **When incoming requests match**: `All incoming requests` (or `Hostname equals aurora-eg.ziadbahgat.me`)
- **Then** (`Set static` for each header):

| Header Name | Value |
|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.gstatic.com https://apis.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://res.cloudinary.com https://*.ytimg.com https://*.googleusercontent.com; font-src 'self' data:; connect-src 'self' https://aurora-website-five.vercel.app https://*.googleapis.com https://*.firebaseio.com https://*.firebasedatabase.app https://www.google-analytics.com https://region1.google-analytics.com https://www.gstatic.com; frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://aurora-group-ae765.firebaseapp.com https://accounts.google.com; frame-ancestors 'none'; object-src 'none'; base-uri 'self';` |

---

## 3. 1-Year Immutable Cache Rule (`/assets/*`, `/css/*`, `/js/*`)
Because `npm run build:static` (`scripts/build-static.mjs`) fingerprints every CSS and JS file with an 8-character SHA-256 content hash (e.g. `/css/screens.a1b2c3d4.css`, `/js/app.9f8e7d6c.js`) and `/assets/fonts/*.woff2` are immutable self-hosted font binaries, long-term caching is safe.

Go to **Caching → Cache Rules → Create rule**:
- **Rule name**: `Immutable Static Assets (1 Year)`
- **When incoming requests match** (URI Path):
  ```
  (starts_with(http.request.uri.path, "/assets/")) or
  (starts_with(http.request.uri.path, "/css/")) or
  (starts_with(http.request.uri.path, "/js/"))
  ```
- **Cache eligibility**: `Eligible for cache`
- **Edge TTL**: `Ignore cache-control header and use this TTL` → **1 year**
- **Browser TTL**: `Override origin and use this TTL` → **1 year**

*(Also add a Transform Rule setting `Cache-Control: public, max-age=31536000, immutable` on those three path prefixes so browsers treat hashed files as immutable.)*

---

## 4. Build Step Reference
The static asset fingerprinting script lives at `scripts/build-static.mjs` and runs automatically in `.github/workflows/deploy-pages.yml`:
```bash
npm run build:static
```
It outputs `_site/` with hashed CSS/JS filenames and updated HTML + ES module import specifiers while keeping `client/` source filenames clean for local development.
