// Fenton 2025: gränssnittstest av prematurkurvan i tillväxtvyn, för en server som har kurvdatan (FENTON_DATA) och,
// om knappen ska prövas, nyckeln och FENTON_MELLANHAND=demo. Kontrollerar att vyn visar barnets z-värden, källan och
// länken, att inga LMS-värden eller percentillinjer ur kurvdatan når webbläsaren, och att knappen "Rita på
// fentongrowth.ca" visar tjänstens bild utan att vyn väntar. Skärmbilderna sparas utanför repot, eftersom bilden från
// fentongrowth.ca visar Fentons kurvor.
//
// Användning: NODE_PATH=$(npm root -g) node test/fenton-vy.cjs <bas-url> <katalog för skärmbilder> [--knapp]

const { chromium } = require('@playwright/test');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');

const BAS = process.argv[2] || 'http://127.0.0.1:18305';
const UT = process.argv[3];
const KNAPP = process.argv.includes('--knapp');
if (!UT) { console.error('Ange en katalog för skärmbilderna utanför repot.'); process.exit(2); }
mkdirSync(UT, { recursive: true });

(async () => {
  const fel = [];
  const svar = [];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', e => fel.push(`sidfel: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') fel.push(`konsolfel: ${m.text()}`); });
  page.on('response', async r => {
    const u = new URL(r.url());
    if (u.origin !== new URL(BAS).origin) fel.push(`webbläsaren hämtade från en annan adress: ${u.origin}`);
    if (u.pathname.startsWith('/api/patient/p62/tillvaxt')) { try { svar.push(await r.text()); } catch { /* bilden */ } }
  });
  const steg = async (namn, fn) => { try { await fn(); console.log(`ok  ${namn}`); } catch (e) { fel.push(`${namn}: ${e.message.split('\n')[0]}`); console.log(`FEL ${namn}`); } };

  await steg('Per Holm loggar in och öppnar Elias tillväxt', async () => {
    await page.goto(`${BAS}/#/`);
    await page.waitForSelector('[data-roll="lak-vc"]');
    await page.click('[data-roll="lak-vc"]');
    await page.waitForSelector('[data-a="loggaut"]');
    await page.goto(`${BAS}/#/patient/p62/tillvaxt`);
    await page.waitForSelector('.tv-fenton svg.tv-zkurva', { timeout: 10000 });
  });
  await steg('prematurkurvan visar gestationsåldern, storleken vid födelsen, källan och länken', async () => {
    const t = await page.locator('.tv-fenton').innerText();
    for (const s of ['Fenton 2025 Preterm Growth Chart', 'vecka 26+2', 'för gestationsåldern', '10.1111/ppe.70035', 'CC BY-NC-ND 4.0', 'fentongrowth.ca']) if (!t.includes(s)) throw new Error(`saknar "${s}"`);
    if (await page.locator('.tv-fenton svg polyline.tv-ref').count()) throw new Error('referenslinjer ur kurvdatan');
    if ((await page.locator('.tv-fenton a[href="https://fentongrowth.ca"]').count()) < 1) throw new Error('länken saknas');
    await page.locator('.tv-fenton details summary').first().click();
    await page.screenshot({ path: join(UT, 'fenton-vy.png'), fullPage: true });
  });
  await steg('svaret till webbläsaren har inga LMS-värden eller percentillinjer', async () => {
    const j = JSON.parse(svar.find(x => x.includes('"fenton"')));
    const text = JSON.stringify(j.fenton);
    if (/"(lms|L|M|S|linjer|percentiler)"/.test(text)) throw new Error('fält med kurvdata i svaret');
    for (const k of j.fenton.kurvor) for (const q of k.punkter) {
      const nycklar = Object.keys(q).sort().join(',');
      if (nycklar !== 'dag,kalla,percentil,tid,utanfor,varde,vecka,z') throw new Error(`oväntade fält ${nycklar}`);
    }
  });
  if (KNAPP) {
    await steg('knappen "Rita på fentongrowth.ca" visar tjänstens bild, och vyn går att använda under tiden', async () => {
      await page.click('[data-tv-fenton]');
      await page.locator('#tv-period [name="fran"]').fill('2025-05-01');
      await page.waitForSelector('#tv-fenton-resultat img[src^="data:image/jpeg"]', { timeout: 30000 });
      await page.locator('#tv-fenton-resultat').screenshot({ path: join(UT, 'fenton-bild.png') });
    });
  }
  await browser.close();
  if (fel.length) { console.error(fel.join('\n')); process.exit(1); }
  console.log('Prematurkurvan är prövad.');
})();
