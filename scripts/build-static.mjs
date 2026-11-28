/**
 * Zero-dependency static build script for GitHub Pages (_site).
 * Copies client/ -> _site/, adds 8-char SHA-256 content hashes to CSS & JS files
 * so 1-year immutable caching is safe, and rewrites HTML + ES module references.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'client');
const OUT = path.join(ROOT, '_site');

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(SRC, OUT, { recursive: true });

function hashBuffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);
}

// 1. Hash CSS files
const cssDir = path.join(OUT, 'css');
const cssMap = new Map();
if (fs.existsSync(cssDir)) {
  for (const file of fs.readdirSync(cssDir)) {
    if (!file.endsWith('.css')) continue;
    const full = path.join(cssDir, file);
    const h = hashBuffer(fs.readFileSync(full));
    const hashed = file.replace(/\.css$/, `.${h}.css`);
    fs.renameSync(full, path.join(cssDir, hashed));
    cssMap.set(file, hashed);
  }
}

// 2. Hash JS files in topological order (leaf modules first, then app.js so app.js hash reflects updated import specifiers)
const jsDir = path.join(OUT, 'js');
const jsMap = new Map();
if (fs.existsSync(jsDir)) {
  const allJs = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'));
  const leaves = allJs.filter(f => f !== 'app.js' && f !== 'firebaseAuth.js');
  const ordered = [
    ...leaves,
    ...(allJs.includes('firebaseAuth.js') ? ['firebaseAuth.js'] : []),
    ...(allJs.includes('app.js') ? ['app.js'] : [])
  ];

  for (const file of ordered) {
    const full = path.join(jsDir, file);
    let code = fs.readFileSync(full, 'utf8');
    // Rewrite relative imports to already-hashed sibling modules
    for (const [origName, hashedName] of jsMap.entries()) {
      code = code.replaceAll(`./${origName}`, `./${hashedName}`);
    }
    fs.writeFileSync(full, code, 'utf8');
    const h = hashBuffer(Buffer.from(code, 'utf8'));
    const hashed = file.replace(/\.js$/, `.${h}.js`);
    fs.renameSync(full, path.join(jsDir, hashed));
    jsMap.set(file, hashed);
  }
}

// 3. Rewrite CSS/JS references in _site/index.html
const indexHtmlPath = path.join(OUT, 'index.html');
if (fs.existsSync(indexHtmlPath)) {
  let html = fs.readFileSync(indexHtmlPath, 'utf8');
  for (const [origName, hashedName] of cssMap.entries()) {
    html = html.replaceAll(`/css/${origName}`, `/css/${hashedName}`);
  }
  for (const [origName, hashedName] of jsMap.entries()) {
    html = html.replaceAll(`/js/${origName}`, `/js/${hashedName}`);
  }
  fs.writeFileSync(indexHtmlPath, html, 'utf8');
}

// 4. Generate static route entrypoints so GitHub Pages serves HTTP 200 for routed pages
const staticRoutes = [
  'about', 'services', 'projects', 'contact', 'team', 'privacy', 'terms',
  'login', 'portal', 'admin',
  'ar', 'ar/about', 'ar/services', 'ar/projects', 'ar/contact', 'ar/team', 'ar/privacy', 'ar/terms'
];
if (fs.existsSync(indexHtmlPath)) {
  for (const route of staticRoutes) {
    const routeDir = path.join(OUT, route);
    fs.mkdirSync(routeDir, { recursive: true });
    fs.copyFileSync(indexHtmlPath, path.join(routeDir, 'index.html'));
    fs.copyFileSync(indexHtmlPath, `${routeDir}.html`);
  }
}

// 5. Keep lightweight custom 404.html if present in client/, otherwise fallback to index.html
const custom404 = path.join(SRC, '404.html');
if (!fs.existsSync(custom404) && fs.existsSync(indexHtmlPath)) {
  fs.copyFileSync(indexHtmlPath, path.join(OUT, '404.html'));
}

// 6. Write CNAME & .nojekyll
fs.writeFileSync(path.join(OUT, 'CNAME'), 'aurora-eg.ziadbahgat.me\n', 'utf8');
fs.writeFileSync(path.join(OUT, '.nojekyll'), '', 'utf8');

console.log('Built _site with content-hashed assets:', {
  css: Object.fromEntries(cssMap),
  js: Object.fromEntries(jsMap)
});
