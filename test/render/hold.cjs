const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
// Haltetest: node test/render/hold.cjs - haelt Emergency und ESP reboot und misst die Fuellung, bei haeufigen hass-Updates.
const resolve = (url) => { const u = decodeURIComponent(url.split('?')[0]); return u === '/battery-dashboard.js' ? path.join(__dirname, '..', '..', 'dist', 'battery-dashboard.js') : path.join(__dirname, u); };
const server = http.createServer((req, res) => { const p = resolve(req.url); fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'text/javascript' : 'text/html' }); res.end(d); }); });
server.listen(8768, async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1300, height: 900 } });
  await page.goto('http://localhost:8768/index.html?view=speicher'); await page.waitForFunction(() => window.__ready); await page.waitForTimeout(300);
  // HA setzt hass bei jeder Zustandsaenderung neu: alle 100 ms ein neues Objekt
  await page.evaluate(() => { const el = document.querySelector('pack-card'); setInterval(() => { el.hass = { ...window.mockHass, states: { ...window.mockHass.states } }; }, 100); });
  for (const [name, sel] of [['emergency', 'pack-card pack-card-bank pack-card-emergency pack-card-hold button'], ['esp', 'pack-card pack-card-stack-head pack-card-hold button']]) {
    const btn = page.locator(sel).first(); const bb = await btn.boundingBox();
    await page.mouse.move(bb.x + 10, bb.y + 10); await page.mouse.down();
    const samples = [];
    for (let t = 0; t < 5; t++) { await page.waitForTimeout(150); samples.push(await btn.evaluate((el) => `${el.className}|${getComputedStyle(el.querySelector('.fill')).transform}`)); }
    await page.mouse.up();
    console.log(name, samples.join(' ; '));
  }
  await b.close(); server.close();
});
