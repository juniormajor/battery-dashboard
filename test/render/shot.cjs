// Render test: npm run build, then node test/render/shot.cjs [<output dir> <name>=<query>@<width> ...]
// Starts a static server on test/render (the card from dist/), renders each variant in Chromium (Playwright)
// and reports console errors and horizontal overflow of the card. Exits with code 1 if any variant has errors,
// overflow or a page wider than the viewport. Without arguments it renders the default variants into
// render-out/ (used by npm test and the CI).
// Query: view=speicher|pack|zellen, dark=1, unit=kWh, pack=<n>, bal=<n>, err=<n>, em=<n>, off=<n>, admin=0 (mock.js)
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const DEFAULT_JOBS = [
  'speicher=view=speicher@1500',
  'speicher-handy=view=speicher&unit=kWh@390',
  'speicher-dunkel=view=speicher&dark=1&err=2&em=3&off=4@1500',
  'pack=view=pack&bal=1@1500',
  'pack-dunkel=view=pack&dark=1&pack=5@390',
  'pack-offline=view=pack&pack=4&off=4&admin=0@1500',
  'zellen=view=zellen@1500',
  'zellen-handy=view=zellen@390',
];
const out = process.argv[2] || path.join(root, '..', '..', 'render-out');
const jobs = process.argv.length > 3 ? process.argv.slice(3) : DEFAULT_JOBS;
let failed = 0;
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
    if (overflow.res.length || errors.length || overflow.docW > overflow.vw) failed++;
    await page.close();
  }
  await browser.close();
  server.close();
  if (failed) {
    console.log(`FAILED: ${failed} of ${jobs.length} variants`);
    process.exitCode = 1;
  } else {
    console.log(`OK: ${jobs.length} variants`);
  }
});
