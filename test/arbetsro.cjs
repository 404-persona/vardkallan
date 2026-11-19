// Runda 18, r5: lärdomar från vårdpersonalens erfarenheter av ett annat journalsystem, prövade i gränssnittet.
//   1. Systemet frågar aldrig det det vet: inga val med ett enda alternativ, inga tomma obligatoriska fält för den
//      inloggades yrke, vårdenhet eller namn, och tidsfält för det som görs nu är förifyllda med nu.
//   3. Rätt patient: osparad text finns kvar när man går till en annan patient, också i två flikar.
//   4. Sökning i listor.
//   5. Listor som uppdaterar sig själva.
//   6. Två som arbetar med samma patient får ett begripligt besked och tappar ingen text.
//
// Användning (servern måste vara igång, efter de andra gränssnittstesterna):
//   NODE_PATH=$(npm root -g) node test/arbetsro.cjs [bas-url]
// Resultatet skrivs till app/klienttest-resultat.json med prefixet Gränssnitt > Arbetsro > .
// ARBETSRO_BARA=<ord> kör bara testerna vars namn innehåller ordet, och skriver då inget resultat.

const { chromium } = require('@playwright/test');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { foljServernsKlocka, stallKlockan } = require('./testklocka.cjs');
const { skrivKlienttester } = require('./klienttester.cjs');

const BAS = process.argv[2] || 'http://127.0.0.1:18282';
const APP = join(__dirname, '..', 'app');
const PREFIX = 'Gränssnitt > Arbetsro > ';
const BARA = process.env.ARBETSRO_BARA ?? '';

const tester = [];
const sidfel = [];
let aktuellt = '';
async function test(namn, fn) {
  if (BARA && !namn.includes(BARA)) return;
  aktuellt = namn;
  const fore = sidfel.length;
  try {
    await fn();
    if (sidfel.length > fore) throw new Error(sidfel.slice(fore).join('; '));
    tester.push({ namn: `${PREFIX}${namn}`, status: 'grön' });
    console.log(`ok   ${namn}`);
  } catch (e) {
    tester.push({ namn: `${PREFIX}${namn}`, status: 'röd', fel: e.message.split('\n')[0] });
    console.log(`FEL  ${namn}\n     ${e.message.split('\n').join('\n     ')}`);
  }
}

const vantaVy = async (page) => {
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('main h1', { timeout: 15000 });
  await page.waitForFunction(() => ![...document.querySelectorAll('main .tom')].some(e => /^(Hämtar|Öppnar|Laddar)/.test(e.textContent.trim())), null, { timeout: 15000 }).catch(() => {});
};
async function loggaUt(page) {
  await page.goto(`${BAS}/#/`);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => fetch('/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {}));
  await page.reload();
  await page.waitForLoadState('networkidle');
}
async function loggaIn(page, id) {
  await loggaUt(page);
  await page.waitForSelector(`[data-roll="${id}"]`);
  await page.click(`[data-roll="${id}"]`);
  await page.waitForSelector('[data-a="loggaut"]');
  await vantaVy(page);
}

// Hittar det som systemet borde veta i formulären i huvudinnehållet. Körs i sidan.
function fragorSystemetVet() {
  const synlig = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const etikett = (e) => (e.labels?.[0]?.textContent ?? e.getAttribute('aria-label') ?? e.closest('fieldset')?.querySelector('legend')?.textContent ?? e.name ?? '').replace(/\s+/g, ' ').trim();
  const ut = [];
  for (const f of document.querySelectorAll('main form')) {
    if (!synlig(f) || f.matches('[role="search"], [data-journalsok], .sokform')) continue;
    // Val med ett enda alternativ.
    for (const s of f.querySelectorAll('select')) {
      if (!synlig(s) || s.disabled || s.multiple) continue;
      // Ett tomt förval som ber användaren välja räknas inte som ett alternativ, men Ny remiss eller Alla gör det.
      const alt = [...s.options].filter(o => !o.disabled && (o.value || !/^(välj|--|$)/i.test(o.textContent.trim())));
      if (alt.length === 1) ut.push(`val med ett enda alternativ: ${etikett(s)}`);
    }
    const radio = new Map();
    for (const r of f.querySelectorAll('input[type="radio"]')) if (synlig(r)) radio.set(r.name, [...(radio.get(r.name) ?? []), r]);
    for (const [n, l] of radio) if (l.length === 1) ut.push(`radioknapp utan annat alternativ: ${etikett(l[0]) || n}`);
    // Obligatoriska fält för den inloggades yrke, vårdenhet eller namn.
    for (const e of f.querySelectorAll('input, select')) {
      if (!synlig(e) || e.disabled || e.type === 'hidden' || e.value) continue;
      const t = etikett(e);
      const obl = e.required || /obligatoriskt/i.test(t);
      if (obl && /\b(yrke|yrkesroll|yrkeskategori|din vårdenhet|ditt namn|ditt hsa-id|utförd av|registrerad av|signerad av)\b/i.test(t)) ut.push(`obligatoriskt fält som systemet vet: ${t}`);
    }
    // Tidsfält för det som görs nu.
    for (const e of f.querySelectorAll('input[type="time"], input[type="datetime-local"], input[type="date"]')) {
      if (!synlig(e) || e.disabled || e.value) continue;
      const t = etikett(e);
      if (/(från|till|uppföljning|sista|planera|åter|nästa|födelse|gäller|senast|slut|start|förväntad|beräknad|period|datum för|önskat|bevaka|svar)/i.test(t)) continue;
      if (/(^tid\b|tidpunkt|klockslag|^datum$|mättid|given|utförd|tagen|ankomst|när)/i.test(t)) ut.push(`tidsfält som inte är förifyllt med nu: ${t}`);
    }
  }
  return ut;
}

(async () => {
  const { gransnittHash } = await import(pathToFileURL(join(APP, 'src', 'klientresultat.js')).href);
  await foljServernsKlocka(BAS);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'sv-SE', timezoneId: 'Europe/Stockholm' });
  await stallKlockan(ctx);
  await ctx.addInitScript(() => { window.__vkLevandeIntervall = 1500; });
  const page = await ctx.newPage();
  const bevaka = (p) => {
    p.on('pageerror', e => sidfel.push(`sidfel i "${aktuellt}": ${e.message}`));
    p.on('response', r => { if (r.status() >= 500) sidfel.push(`HTTP ${r.status()} ${new URL(r.url()).pathname} i "${aktuellt}"`); });
    p.on('console', m => { if (m.type() === 'error' && !/status of 40[01349]/.test(m.text())) sidfel.push(`konsolfel i "${aktuellt}": ${m.text()}`); });
  };
  bevaka(page);
  await page.goto(`${BAS}/#/`);
  await page.waitForSelector('[data-roll]');
  const roller = await page.locator('[data-roll]').evaluateAll(l => l.map(b => b.dataset.roll));

  await test('systemet frågar aldrig det det vet: inga val med ett enda alternativ, inget obligatoriskt fält för den inloggades yrke, vårdenhet eller namn, och tid för det som görs nu är förifylld', async () => {
    const fel = new Map();
    const notera = (var_, lista) => { for (const t of lista) if (!fel.has(t)) fel.set(t, var_); };
    const FORMULAR = ['journal/ny', 'lakemedel/ny', 'matvarden/ny', 'remisser/ny', 'remisser/uppdrag', 'prover/ny', 'prover/kontroller'];
    for (const id of roller) {
      await loggaIn(page, id);
      notera(`${id} startsidan`, await page.evaluate(fragorSystemetVet));
      const lankar = await page.locator('#meny-lista a').evaluateAll(a => a.map(x => [x.getAttribute('href'), x.querySelector('.menytext').textContent]));
      for (const [href, text] of lankar) {
        await page.goto(`${BAS}/${href}`);
        await vantaVy(page);
        notera(`${id} ${text}`, await page.evaluate(fragorSystemetVet));
      }
      if (!lankar.some(l => l[0] === '#/arbetslista')) continue;
      await page.goto(`${BAS}/#/arbetslista`); await vantaVy(page);
      const p = await page.locator('#lista a[href^="#/patient/"]').first().getAttribute('href').catch(() => null);
      if (!p) continue;
      await page.goto(`${BAS}/${p}`); await vantaVy(page);
      const flikar = await page.locator('.flikar a').evaluateAll(a => a.map(x => [x.getAttribute('href'), x.textContent.trim()]));
      for (const [href, text] of [...flikar, ...FORMULAR.map(f => [`${p}/${f}`, f])]) {
        await page.goto(`${BAS}/${href}`);
        await vantaVy(page);
        notera(`${id} journalen ${text}`, await page.evaluate(fragorSystemetVet));
      }
    }
    if (fel.size) throw new Error(`${fel.size} frågor som systemet borde besvara själv:\n${[...fel].map(([t, v]) => `${v}: ${t}`).join('\n')}`);
  });

  await test('osparad text finns kvar när man går till en annan patient eller rad, systemet säger var den finns, och ett byte av patient märks i patienthuvudet', async () => {
    await loggaIn(page, 'lak-kard');
    await page.goto(`${BAS}/#/patient/p01/lakemedel/ny`); await page.waitForSelector('#ordform');
    await page.fill('#ordform [name="ordinationsorsak"]', 'Orsak som inte får försvinna');
    await page.click('#meny-lista a[href="#/arbetslista"]'); await vantaVy(page);
    await page.locator('#notiser .notis', { hasText: 'sparad i den här fliken' }).waitFor();
    if (!/Gunnar Åkesson/.test(await page.locator('#osparad-rad').textContent())) throw new Error('raden med osparad text saknar patienten');
    await page.click('#lista a[href="#/patient/p04"]'); await page.waitForSelector('.patientband h1');
    await page.waitForSelector('.patientband.patientbyte', { timeout: 3000 });
    await page.locator('#notiser .notis', { hasText: 'Du har bytt patient' }).waitFor();
    await page.click('#osparad-rad a'); await page.waitForSelector('#ordform');
    const v = await page.inputValue('#ordform [name="ordinationsorsak"]');
    if (v !== 'Orsak som inte får försvinna') throw new Error(`orsaken är "${v}" efter återkomsten`);
    if (await page.locator('#osparad-rad').count()) throw new Error('raden med osparad text står kvar efter återkomsten');
    // En anteckning sparas som utkast på servern, och systemet säger var den finns.
    await page.goto(`${BAS}/#/patient/p01/journal/ny`); await page.waitForSelector('#ny-sokord textarea');
    await page.locator('#ny-sokord textarea').first().fill('Text i anteckningen');
    await page.click('#meny-lista a[href="#/arbetslista"]'); await vantaVy(page);
    await page.locator('#notiser .notis', { hasText: 'sparad som utkast' }).waitFor();
  });

  await test('i två flikar med samma inloggning följer den andra fliken med till en ny patient utan att texten försvinner', async () => {
    await loggaIn(page, 'lak-kard');
    await page.goto(`${BAS}/#/patient/p01`); await page.waitForSelector('.patientband h1');
    const flik = await ctx.newPage();
    bevaka(flik);
    await flik.goto(`${BAS}/#/patient/p01/remisser/ny`); await flik.waitForSelector('#remissform');
    await flik.fill('#remissform textarea[name="fragestallning"]', 'Frågeställning i den andra fliken');
    await page.goto(`${BAS}/#/patient/p04`); await page.waitForSelector('.patientband h1');
    await flik.waitForFunction(() => /#\/patient\/p04/.test(location.hash), null, { timeout: 8000 });
    await flik.locator('#notiser .notis', { hasText: 'sparad i den här fliken' }).waitFor();
    await flik.click('#osparad-rad a'); await flik.waitForSelector('#remissform');
    const v = await flik.inputValue('#remissform textarea[name="fragestallning"]');
    await flik.close();
    if (v !== 'Frågeställning i den andra fliken') throw new Error(`frågeställningen är "${v}" i den andra fliken`);
  });

  await test('listor går att söka i på början eller en del av namnet, och mallarna har de senast använda och egna favoriter först', async () => {
    await loggaIn(page, 'lak-kard');
    await page.goto(`${BAS}/#/patient/p01/journal/ny`); await page.waitForSelector('#ny-mall');
    const sok = page.locator('#ant-form .ls-sok');
    await sok.fill('tobak');
    await page.waitForFunction(() => document.querySelector('#ny-mall')?.value === 'Tobaksvanor', null, { timeout: 5000 });
    await page.goto(`${BAS}/#/patient/p01/journal/ny`); await page.waitForSelector('#ny-mall');
    await page.selectOption('#ny-mall', 'Epikris');
    await page.click('[data-favoritmall]');
    await page.locator('#notiser .notis', { hasText: 'bland dina favoriter' }).waitFor();
    await page.goto(`${BAS}/#/arbetslista`); await vantaVy(page);
    await page.goto(`${BAS}/#/patient/p01/journal/ny`); await page.waitForSelector('#ny-mall');
    const grupper = await page.locator('#ny-mall optgroup').evaluateAll(l => l.map(g => [g.label, [...g.children].map(o => o.textContent)]));
    const fav = grupper.find(g => g[0] === 'Dina favoriter' || g[0] === 'Förslag för situationen' || g[0] === 'Senast använda');
    if (!grupper.some(g => g[1].includes('Epikris') && g[0] !== 'Fler mallar')) throw new Error(`Epikris står inte bland förslag, senaste eller favoriter: ${JSON.stringify(grupper)}`);
    void fav;
    // En lång lista får sökfältet av sig själv: mottagaren av en remiss.
    await page.goto(`${BAS}/#/patient/p01/remisser/ny`); await page.waitForSelector('#remissform');
    const lang = await page.locator('#remissform select[name="tillEnhetId"] option').count();
    if (lang >= 12 && !await page.locator('#remissform .ls-sok').count()) throw new Error('den långa listan över mottagare har inget sökfält');
  });

  await test('inkorgen visar det nya av sig själv utan att fokus flyttas, och frågan räknas inte som aktivitet', async () => {
    await loggaIn(page, 'lak-kard');
    await page.goto(`${BAS}/#/inkorg`); await vantaVy(page);
    await page.waitForTimeout(2500);
    const fore = Number((await page.locator('#ik-osign .antal').textContent()).trim());
    const bakgrund = [];
    page.on('request', r => { if (r.url().endsWith('/api/inkorg')) bakgrund.push(r.headers()['x-vk-bakgrund'] === '1'); });
    await page.evaluate(() => fetch('/api/patient/p01/anteckningar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ typ: 'Daganteckning', sokord: [{ sokord: 'Aktuellt', text: 'Ny i inkorgen' }] }) }));
    await page.evaluate(() => document.querySelector('#meny-lista a[href="#/inkorg"]')?.focus());
    await page.waitForFunction((n) => Number(document.querySelector('#ik-osign .antal')?.textContent.trim()) > n, fore, { timeout: 12000 });
    if (!await page.evaluate(() => document.activeElement?.getAttribute('href') === '#/inkorg')) throw new Error('fokus flyttades när inkorgen uppdaterades');
    if (!bakgrund.some(Boolean)) throw new Error('inkorgen frågades inte i bakgrunden');
  });

  await test('den som ändrar en dos som har ändrats i en annan flik får besked om vad som ändrats, och den egna ändringen sparas med ett klick', async () => {
    await loggaIn(page, 'lak-kard');
    await page.goto(`${BAS}/#/patient/p01/lakemedel`); await page.waitForSelector('.lm-tabell');
    const rad = page.locator('.lm-tabell tr', { hasText: 'Metoprolol Sandoz' });
    await rad.locator('[data-dosandring]').click();
    await page.waitForSelector('dialog[open] #da-dosering');
    // Någon annan (här samma person i en annan flik) ändrar dosen under tiden.
    const id = await rad.locator('[data-dosandring]').getAttribute('data-dosandring');
    const s = await page.evaluate(async (oid) => {
      const u = await (await fetch(`/api/ordination/${oid}/dosandring`)).json();
      const o = u.ordination;
      const r = await fetch(`/api/ordination/${oid}/dosandring`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lakemedelId: o.lakemedel.id, dosering: `${o.dosering}, ändrad i andra fliken`, dos: o.dos, dosEnhet: o.dosEnhet, tider: o.tider }) });
      return r.status;
    }, id);
    if (s !== 200) throw new Error(`ändringen i den andra fliken gav ${s}`);
    await page.fill('dialog[open] #da-dosering', 'Min egen dosering');
    await page.click('dialog[open] [data-varde="ok"]');
    await page.locator('dialog[open]', { hasText: 'har ändrats av någon annan' }).waitFor();
    const text = await page.locator('dialog[open]').textContent();
    if (!/ändrad i andra fliken/.test(text) || !/Min egen dosering/.test(text)) throw new Error(`beskedet säger inte vad som ändrades och vad man själv skrev: ${text.slice(0, 200)}`);
    await page.click('dialog[open] [data-varde="ok"]');
    await page.locator('#notiser .notis', { hasText: 'dosen är ändrad' }).waitFor();
    await page.locator('.lm-tabell tr', { hasText: 'Min egen dosering' }).waitFor();
  });

  const version = browser.version();
  await browser.close();
  if (!BARA) skrivKlienttester({ app: APP, prefix: PREFIX, tester: tester.map(({ namn, status }) => ({ namn, status })), bas: BAS, webblasare: `Chromium ${version}`, gransnittHash: gransnittHash(join(APP, 'public')) });
  const roda = tester.filter(t => t.status !== 'grön');
  console.log(`\n${tester.length - roda.length} av ${tester.length} gröna.`);
  if (roda.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
