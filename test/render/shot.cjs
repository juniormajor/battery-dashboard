// Rendertest: npm run build, dann node test/render/shot.cjs <ausgabeordner> <name>=<query>@<breite> ...
// Startet einen statischen Server auf test/render (die Karte aus dist/), rendert jede Variante in Chromium
// (Playwright) und meldet Konsolenfehler sowie waagrechtes Ueberlaufen der Karte.
// Query: view=speicher|pack|zellen, dark=1, unit=kWh, pack=<n>, bal=<n>, err=<n>, em=<n>, off=<n>, admin=0 (mock.js)
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const out = process.argv[2];
const jobs = process.argv.slice(3);
fs.mkdirSync(out, { recursive: true });

const resolve = (url) => {
  const u = decodeURIComponent(url.split('?')[0]);
  return u === '/battery-dashboard.js' ? path.join(root, '..', '..', 'dist', 'battery-dashboard.js') : path.join(root, u);
};


const server = http.createServer((req, res) => {
  const p = resolve(req.url);
  fs.readFile(p, (e, d) => {
    if (e) {
      res.writeHead(404);
      res.end();
      return;
    }
    const ext = path.extname(p);
    res.writeHead(200, { 'Content-Type': ext === '.js' ? 'text/javascript' : 'text/html' });
    res.end(d);
  });
});

server.listen(8765, async () => {
  const browser = await chromium.launch();
  for (const job of jobs) {
    const i = job.indexOf('='); const name = job.slice(0, i); const rest = job.slice(i + 1);
    const [query, width] = rest.split('@');
    const page = await browser.newPage({ viewport: { width: Number(width), height: 900 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
    });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    await page.goto(`http://localhost:8765/index.html?${query}`);
    await page.waitForFunction(() => window.__ready === true);
    await page.waitForTimeout(700);
    const overflow = await page.evaluate(() => {
      const res = [];
      const walk = (node, depth) => {
        if (!node || depth > 12) return;
        const kids = node.shadowRoot ? [...node.shadowRoot.querySelectorAll('*')] : [];
        for (const k of kids) {
          if (k.scrollWidth > k.clientWidth + 1 && getComputedStyle(k).overflowX !== 'visible' && k.clientWidth > 0)
            res.push(`${k.tagName.toLowerCase()}.${k.className} ${k.scrollWidth}>${k.clientWidth}`);
          if (k.shadowRoot) walk(k, depth + 1);
        }
      };
      walk(document.querySelector('pack-card'), 0);
      const card = document.querySelector('pack-card').getBoundingClientRect();
      return { res, cardW: Math.round(card.width), docW: document.documentElement.scrollWidth, vw: innerWidth };
    });
    await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
    console.log(`${name}: card ${overflow.cardW}px, doc ${overflow.docW}/${overflow.vw}`);
    if (overflow.res.length) console.log(`  overflow: ${overflow.res.slice(0, 8).join(' | ')}`);
    if (errors.length) console.log(`  console: ${errors.slice(0, 6).join(' | ')}`);
    await page.close();
  }
  await browser.close();
  server.close();
});
