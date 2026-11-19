// Runda 18, r5: snabbt också på en långsam dator. Gör klickbudgetens flöden i Playwright och mäter för varje klick och
// tangent tiden från att användaren trycker till synlig återkoppling (första ändringen i sidan, fokus eller ett ändrat
// värde) och till färdigt resultat (inga anrop pågår och sidan har inte ändrats på 200 ms). Flödena görs två gånger:
// vanligt och med processorn strypt fyra gånger (Chrome DevTools Protocol, Emulation.setCPUThrottlingRate), som en
// äldre dator i vården.
//
// Målen: synlig återkoppling inom 100 ms, och resultat inom 500 ms vanligt och inom 1 sekund strypt, för 95 procent av
// stegen. Resultatet skrivs till app/svarstider-klient.json med gränssnittets hash, och testerna till
// app/klienttest-resultat.json med prefixet Gränssnitt > Svarstider i webbläsaren > .
//
// Användning (servern måste vara igång):
//   NODE_PATH=$(npm root -g) node test/svarstider-klient.cjs [bas-url]
// SVARSTIDER_FLODEN=id1,id2 mäter bara de flödena och skriver inget resultat.

const { chromium } = require('@playwright/test');
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { Matare, skapa, raknaISidan } = require('./flodessteg.cjs');
const { foljServernsKlocka, stallKlockan, resultatfil } = require('./testklocka.cjs');
const { skrivKlienttester } = require('./klienttester.cjs');

const BAS = process.argv[2] || 'http://127.0.0.1:18282';
const APP = join(__dirname, '..', 'app');
const PREFIX = 'Gränssnitt > Svarstider i webbläsaren > ';
const BARA = (process.env.SVARSTIDER_FLODEN ?? '').split(',').filter(Boolean);
const { synlig, loggaIn, startI, GOR } = skapa(BAS);

const MAL = { aterkopplingMs: 100, resultatMs: 500, resultatStryptMs: 1000, andel: 0.95, strypning: 4 };

// Sidan registrerar när ett steg börjar (ett riktigt tryck), första ändringen och den senaste ändringen eller anropet.
async function matISidan(ctx) {
  await ctx.addInitScript(() => {
    const nu = () => performance.now();
    window.__steg = null;
    window.__pagaende = 0;
    const markera = () => { const s = window.__steg; if (!s) return; const t = nu(); if (s.aterkoppling == null) s.aterkoppling = t; s.sista = t; };
    new MutationObserver(markera).observe(document, { childList: true, subtree: true, attributes: true, characterData: true });
    const borja = (e) => { if (!e.isTrusted || (e.type === 'keydown' && e.key.length === 1)) return; window.__steg = { t0: e.timeStamp, aterkoppling: null, sista: null }; };
    document.addEventListener('pointerdown', borja, true);
    document.addEventListener('keydown', borja, true);
    for (const t of ['focusin', 'change', 'input']) document.addEventListener(t, markera, true);
    const f = window.fetch;
    window.fetch = async (...a) => {
      window.__pagaende++;
      try { return await f(...a); } finally { window.__pagaende--; markera(); }
    };
  });
}

class MatandeMatare extends Matare {
  constructor(page) { super(page); this.prov = []; this.flode = ''; }
  async vantaKlart(text) {
    const r = await this.page.evaluate(async () => {
      const slut = performance.now() + 15000;
      while (performance.now() < slut) {
        const s = window.__steg;
        if (s && window.__pagaende === 0 && performance.now() - (s.sista ?? s.t0) > 200) return s;
        await new Promise(x => setTimeout(x, 25));
      }
      return window.__steg;
    }).catch(() => null);
    if (!r) return;
    const aterkoppling = r.aterkoppling == null ? null : Math.round(r.aterkoppling - r.t0);
    const resultat = Math.round((r.sista ?? r.aterkoppling ?? r.t0) - r.t0);
    this.prov.push({ flode: this.flode, steg: text, aterkoppling, resultat });
  }
  async klicka(loc, text) {
    await this.page.evaluate(() => { window.__steg = null; });
    await super.klicka(loc, text);
    await this.vantaKlart(text);
  }
  async tangent(namn, text) {
    await this.page.evaluate(() => { window.__steg = null; });
    await super.tangent(namn, text);
    await this.vantaKlart(text);
  }
}

const kvantil = (l, q) => { if (!l.length) return null; const s = [...l].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)]; };
function sammanstall(prov, resultatMal) {
  const ater = prov.map(p => p.aterkoppling ?? 0);
  const res = prov.map(p => p.resultat);
  return {
    antal: prov.length,
    p50Aterkoppling: kvantil(ater, 0.5), p95Aterkoppling: kvantil(ater, 0.95),
    p50Resultat: kvantil(res, 0.5), p95Resultat: kvantil(res, 0.95),
    andelAterkoppling: prov.length ? ater.filter(x => x <= MAL.aterkopplingMs).length / prov.length : 0,
    andelResultat: prov.length ? res.filter(x => x <= resultatMal).length / prov.length : 0,
    langsammaste: [...prov].sort((a, b) => b.resultat - a.resultat).slice(0, 8),
  };
}

(async () => {
  const { FLODEN } = await import(pathToFileURL(join(APP, 'src', 'klickbudget.js')).href);
  const { gransnittHash } = await import(pathToFileURL(join(APP, 'src', 'klientresultat.js')).href);
  await foljServernsKlocka(BAS);
  const browser = await chromium.launch();
  const lagen = {};
  const fel = [];
  for (const [lage, rate] of [['vanlig', 1], ['strypt', MAL.strypning]]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'sv-SE', timezoneId: 'Europe/Stockholm' });
    await stallKlockan(ctx);
    await raknaISidan(ctx);
    await matISidan(ctx);
    const page = await ctx.newPage();
    page.on('pageerror', e => fel.push(`${lage}: sidfel ${e.message}`));
    const m = new MatandeMatare(page);
    let roll = null;
    for (const f of FLODEN.filter(x => !BARA.length || BARA.includes(x.id))) {
      try {
        if (roll !== f.roll) {
          await page.goto('about:blank');
          await loggaIn(page, f.roll);
          await page.click('[data-a="aterstall"]');
          await synlig(page, '.notis', 'Demon är återställd');
          roll = f.roll;
        }
        await startI[f.start](page);
        const cdp = await ctx.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate });
        m.flode = f.namn;
        await m.borja();
        await GOR[f.id](m, page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        await cdp.detach();
      } catch (e) {
        console.log(`${lage}: ${f.namn} gick inte att mäta: ${e.message.split('\n')[0]}`);
        roll = null;
      }
    }
    lagen[lage] = sammanstall(m.prov, lage === 'vanlig' ? MAL.resultatMs : MAL.resultatStryptMs);
    const s = lagen[lage];
    console.log(`${lage}: ${s.antal} steg. Återkoppling p95 ${s.p95Aterkoppling} ms (${Math.round(s.andelAterkoppling * 100)} % inom ${MAL.aterkopplingMs} ms). Resultat p95 ${s.p95Resultat} ms (${Math.round(s.andelResultat * 100)} % inom målet).`);
    for (const p of s.langsammaste) console.log(`   ${p.resultat} ms (återkoppling ${p.aterkoppling} ms): ${p.flode}, ${p.steg}`);
    await ctx.close();
  }
  const version = browser.version();
  await browser.close();
  if (BARA.length) return;
  const hash = gransnittHash(join(APP, 'public'));
  writeFileSync(join(APP, resultatfil('svarstider-klient.json')), `${JSON.stringify({ tid: new Date().toISOString(), bas: BAS, webblasare: `Chromium ${version}`, gransnittHash: hash, mal: MAL, lagen }, null, 2)}\n`);
  const t = (namn, ok) => ({ namn: `${PREFIX}${namn}`, status: ok ? 'grön' : 'röd' });
  const v = lagen.vanlig;
  const s = lagen.strypt;
  const tester = [
    t('95 procent av stegen ger synlig återkoppling inom 100 ms, också med processorn strypt fyra gånger', v.antal > 50 && v.andelAterkoppling >= MAL.andel && s.andelAterkoppling >= MAL.andel),
    t('95 procent av stegen har sitt resultat inom 500 ms på en vanlig dator', v.antal > 50 && v.andelResultat >= MAL.andel),
    t('95 procent av stegen har sitt resultat inom 1 sekund med processorn strypt fyra gånger', s.antal > 50 && s.andelResultat >= MAL.andel),
  ];
  skrivKlienttester({ app: APP, prefix: PREFIX, tester, bas: BAS, webblasare: `Chromium ${version}`, gransnittHash: hash });
  for (const x of tester) console.log(`${x.status === 'grön' ? 'ok  ' : 'FEL '} ${x.namn}`);
  if (fel.length) console.log(fel.slice(0, 10).join('\n'));
  if (tester.some(x => x.status !== 'grön')) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
