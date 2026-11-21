// Tester av testläget för användartest (D6) i en riktig webbläsare med Playwright. Skriptet gör ett användartest från
// start till slut: deltagarkod, fem uppgifter (fyra görs, en hoppas över efter att hjälp har registrerats), enkäten
// och resultatet. Uppgifterna görs med samma flöden och samma räkning som test/klickbudget.cjs (test/flodessteg.cjs),
// och testlägets egen räkning ska ge samma klick, fältbyten och tangenter. Allt nätverk avlyssnas, och inget anrop
// får innehålla testresultatet. Resultatet skrivs till app/klienttest-resultat.json, där testerna från
// test/avbrott.cjs behålls (test/klienttester.cjs).
//
// Användning (servern måste vara igång):
//   NODE_PATH=$(npm root -g) node test/anvandartest.cjs [bas-url]
// Standard för bas-url är http://127.0.0.1:18797.

const { chromium } = require('@playwright/test');
const { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { pathToFileURL } = require('node:url');
const { Matare, skapa, raknaISidan } = require('./flodessteg.cjs');
const { skrivKlienttester } = require('./klienttester.cjs');

const BAS = process.argv[2] || 'http://127.0.0.1:18797';
// Runda 11: testet och webbläsaren följer testcontainerns falska klocka, om den har en.
const { foljServernsKlocka, stallKlockan } = require('./testklocka.cjs');
const APP = join(__dirname, '..', 'app');
const UT = join(__dirname, 'skarmbilder');
mkdirSync(UT, { recursive: true });
for (const f of readdirSync(UT)) if (f.startsWith('00-fel-anvandartest')) rmSync(join(UT, f));
const PREFIX = 'Gränssnitt > Användartest > ';

// Uppgifterna i testet. kvittera-svar hoppas över efter att hjälp har registrerats.
const VALDA = ['daganteckning', 'blodtryck', 'remiss', 'kvittera-svar', 'nodatkomst'];
const HOPPAS = 'kvittera-svar';
// En deltagarkod och en text i en öppen fråga som inte finns någon annanstans, så att de kan sökas i nätverket.
const KOD = 'PW-Q7X';
const MARKOR = 'Zebrafinkens fältbyte';
const SUS_SVAR = [4, 1, 5, 2, 4, 1, 5, 1, 4, 2];
const SUS_VANTAD = 87.5;

const tester = [];
const sidfel = [];
let felSida = null;
let felNr = 0;
async function test(namn, fn) {
  const fore = sidfel.length;
  try {
    await fn();
    if (sidfel.length > fore) throw new Error(sidfel.slice(fore).join('; '));
    tester.push({ namn: PREFIX + namn, status: 'grön' });
    console.log(`ok  ${namn}`);
  } catch (e) {
    tester.push({ namn: PREFIX + namn, status: 'röd', fel: e.message.split('\n')[0] });
    console.log(`FEL ${namn}: ${e.message.split('\n')[0]}`);
    await felSida?.screenshot({ path: join(UT, `00-fel-anvandartest-${++felNr}.png`), fullPage: true }).catch(() => {});
  }
}
const anta = (villkor, text) => { if (!villkor) throw new Error(text); };

(async () => {
  const { UPPGIFTER } = await import(pathToFileURL(join(APP, 'public', 'js', 'anvandartest-uppgifter.js')).href);
  const { gransnittHash } = await import(pathToFileURL(join(APP, 'src', 'klientresultat.js')).href);
  const hash = gransnittHash(join(APP, 'public'));
  const appversion = JSON.parse(readFileSync(join(APP, 'package.json'), 'utf8')).version;
  let skript = null;
  try { skript = JSON.parse(readFileSync(join(APP, 'klickbudget.json'), 'utf8')); } catch { skript = null; }
  const { GOR } = skapa(BAS);

  await foljServernsKlocka(BAS);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'sv-SE', timezoneId: 'Europe/Stockholm', acceptDownloads: true });
  await stallKlockan(ctx);
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BAS });
  await raknaISidan(ctx);
  const page = await ctx.newPage();
  felSida = page;
  page.on('pageerror', e => sidfel.push(`sidfel: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/status of 403/.test(m.text())) sidfel.push(`konsolfel: ${m.text()}`); });
  // Allt som går över nätet, med kropp.
  const anrop = [];
  let fas = 'uppgifter';
  page.on('request', r => anrop.push({ fas, metod: r.method(), url: r.url(), kropp: r.postData() ?? '' }));

  const matt = {};
  let fil = null;
  let tillstandFore = null;

  await test('testläget räknar klick, fältbyten och tangenter som klickbudgetskriptet för samma flöden', async () => {
    await page.goto(`${BAS}/#/anvandartest`);
    await page.waitForSelector('#at-start');
    tillstandFore = await page.evaluate(() => ({ lagrat: sessionStorage.getItem('vk_anvandartest'), list: Boolean(document.getElementById('testlage')) }));
    anta(tillstandFore.lagrat === null && !tillstandFore.list, 'testläget är på innan testet har startats');
    await page.fill('#at-kod', KOD);
    for (const u of UPPGIFTER) if (!VALDA.includes(u.id)) await page.uncheck(`input[name="uppgift"][value="${u.id}"]`);
    await page.click('#at-start [type="submit"]');
    await page.waitForSelector('#testlage [data-t="borja"]');
    for (const [i, id] of VALDA.entries()) {
      const u = UPPGIFTER.find(x => x.id === id);
      const text = (await page.locator('#testlage-text').textContent()).trim();
      anta(text === u.text, `uppgift ${i + 1} visar fel text: ${text}`);
      anta((await page.locator('.testlage-nr').textContent()).includes(`Uppgift ${i + 1} av ${VALDA.length}`), 'fel uppgiftsnummer i listen');
      await page.click('#testlage [data-t="borja"]');
      await page.waitForSelector('#testlage [data-t="klar"]', { timeout: 20000 });
      if (id === HOPPAS) {
        await page.click('#testlage [data-t="hjalp"]');
        await page.waitForSelector('#testlage [data-t="hjalp"]:has-text("(1)")');
        await page.click('#testlage [data-t="hoppa"]');
        continue;
      }
      const m = new Matare(page);
      await m.borja();
      await GOR[id](m, page);
      await m.kontrollera();
      matt[id] = { klick: m.klick, faltbyten: m.faltbyten, tangenter: m.tangenter, uppmatt: m.uppmatt };
      const iSidan = await page.evaluate(() => {
        const t = JSON.parse(sessionStorage.getItem('vk_anvandartest'));
        const r = t.pagar.rakning;
        return { klick: r.klick, faltbyten: r.faltbyten, tangenter: r.tangenter, uppmatt: r.klick + r.faltbyten + r.tangenter, steg: r.steg };
      });
      const { steg, ...siffror } = iSidan;
      anta(JSON.stringify(siffror) === JSON.stringify(matt[id]), `${id}: testläget räknade ${JSON.stringify(siffror)}, skriptet ${JSON.stringify(matt[id])}. Testläget: ${steg.join('; ')}. Skriptet: ${m.steg.join('; ')}`);
      // Samma siffror som klickbudget.cjs mätte, om den mätningen gjordes på samma gränssnitt.
      const kb = skript?.gransnittHash === hash ? skript.floden.find(f => f.id === id) : null;
      if (kb) anta(kb.uppmatt === matt[id].uppmatt, `${id}: klickbudget.json har ${kb.uppmatt} steg, testläget ${matt[id].uppmatt}`);
      const n = (v, en, fl) => `${v} ${v === 1 ? en : fl}`;
      console.log(`    ${u.namn}: ${matt[id].uppmatt} steg (${n(matt[id].klick, 'klick', 'klick')}, ${n(matt[id].faltbyten, 'fältbyte', 'fältbyten')}, ${n(matt[id].tangenter, 'tangent', 'tangenter')})${kb ? ', samma som klickbudget.json' : ''}`);
      await page.click('#testlage [data-t="klar"]');
    }
    fas = 'enkat';
    await page.waitForSelector('#at-enkat', { timeout: 20000 });
    anta(!(await page.locator('#testlage').count()), 'listen syns kvar under enkäten');
  });

  await test('enkäten ger SUS-poäng enligt standardformeln', async () => {
    await page.check('input[name="yrkesroll"][value="lakare"]');
    await page.check('input[name="erfarenhet"][value="2-5"]');
    // Utan svar på alla påståenden går enkäten inte att spara.
    await page.click('#at-enkat [type="submit"]');
    await page.locator('#at-enkat .form-fel:not([hidden])').waitFor();
    anta((await page.locator('#at-enkat .form-fel').textContent()).includes('påstående 1, 2, 3'), 'saknade svar visas inte');
    for (const [i, v] of SUS_SVAR.entries()) await page.check(`input[name="sus${i + 1}"][value="${v}"]`);
    await page.fill('#at-svarast', `${MARKOR}, att hitta remissen.`);
    await page.fill('#at-saknades', 'Inget.');
    await page.click('#at-enkat [type="submit"]');
    fas = 'resultat';
    await page.waitForSelector('.at-tabell');
    const poang = (await page.locator('[data-sus]').textContent()).trim();
    anta(poang === '87,5', `SUS-poängen är ${poang}, väntat 87,5`);
    await page.waitForTimeout(250);
    await page.screenshot({ path: join(UT, '44-anvandartest-resultat.png') });
  });

  await test('resultatfilen laddas ner med datum, version, deltagarkod, uppgifter och SUS-poäng', async () => {
    const [nedladdning] = await Promise.all([page.waitForEvent('download'), page.click('[data-r="ladda"]')]);
    const katalog = mkdtempSync(join(tmpdir(), 'vk-anvandartest-'));
    try {
      const vag = join(katalog, nedladdning.suggestedFilename());
      await nedladdning.saveAs(vag);
      anta(/^anvandartest-PW-Q7X-\d{4}-\d{2}-\d{2}\.json$/.test(nedladdning.suggestedFilename()), `filnamnet är ${nedladdning.suggestedFilename()}`);
      fil = JSON.parse(readFileSync(vag, 'utf8'));
    } finally { rmSync(katalog, { recursive: true, force: true }); }
    anta(fil.format === 'vardkallan-anvandartest' && fil.formatversion === 1, 'fel format');
    anta(fil.deltagarkod === KOD, 'fel deltagarkod');
    anta(!Number.isNaN(Date.parse(fil.datum)) && !Number.isNaN(Date.parse(fil.avslutad)), 'datum saknas');
    anta(fil.version.app === appversion, `appens version är ${fil.version.app}`);
    anta(fil.version.gransnitt === hash, 'gränssnittets hash stämmer inte med app/public');
    anta(fil.version.uppgifter === 1, 'uppgifternas version saknas');
    anta(JSON.stringify(fil.deltagare) === JSON.stringify({ yrkesroll: 'lakare', erfarenhet: '2-5' }), `deltagaren är ${JSON.stringify(fil.deltagare)}`);
    anta(JSON.stringify(Object.keys(fil.deltagare).sort()) === '["erfarenhet","yrkesroll"]', 'resultatet har fler uppgifter om deltagaren än roll och erfarenhet');
    anta(JSON.stringify(fil.uppgifter.map(u => u.id)) === JSON.stringify(VALDA), `uppgifterna är ${fil.uppgifter.map(u => u.id)}`);
    anta(JSON.stringify(fil.ejGjorda) === JSON.stringify(UPPGIFTER.map(u => u.id).filter(id => !VALDA.includes(id))), 'ej gjorda uppgifter saknas');
    for (const u of fil.uppgifter) {
      anta(u.tidMs > 0, `${u.id}: ingen tid`);
      if (u.id === HOPPAS) continue;
      anta(u.status === 'klar' && u.malUppnatt === true && u.hjalp === 0, `${u.id}: status ${u.status}, målet ${u.malUppnatt}, hjälp ${u.hjalp}`);
      anta(u.tidTillMalMs > 0 && u.tidTillMalMs <= u.tidMs, `${u.id}: tid till målet ${u.tidTillMalMs}`);
      const { klick, faltbyten, tangenter, uppmatt } = u;
      anta(JSON.stringify({ klick, faltbyten, tangenter, uppmatt }) === JSON.stringify(matt[u.id]), `${u.id}: filen har ${JSON.stringify({ klick, faltbyten, tangenter, uppmatt })}`);
    }
    anta(fil.sus.poang === SUS_VANTAD && JSON.stringify(fil.sus.svar) === JSON.stringify(SUS_SVAR), `SUS i filen: ${JSON.stringify(fil.sus)}`);
    anta(fil.oppnaSvar.svarast.startsWith(MARKOR) && fil.oppnaSvar.jamfort === '' && fil.oppnaSvar.saknades === 'Inget.', 'de öppna svaren stämmer inte');
    // Det som skrevs i fälten under uppgifterna finns inte i resultatet.
    anta(!JSON.stringify(fil).includes('Pigg, äter bra') && !JSON.stringify(fil).includes('elkonvertering'), 'inskriven text finns i resultatet');
    // Texten som kopieras har samma resultat som filen.
    await page.click('[data-r="kopiera"]');
    await page.waitForSelector('.notis:has-text("Resultatet är kopierat")');
    const text = await page.evaluate(() => navigator.clipboard.readText());
    anta(text.includes(`Deltagarkod: ${KOD}`) && text.includes('SUS: 87,5'), 'den kopierade texten saknar deltagarkod eller SUS');
    const json = JSON.parse(text.slice(text.indexOf('Resultatfil (JSON):') + 'Resultatfil (JSON):'.length));
    anta(JSON.stringify(json) === JSON.stringify(fil), 'den kopierade texten har inte samma resultat som filen');
  });

  await test('hoppa över och hjälp registreras per uppgift', async () => {
    const u = fil.uppgifter.find(x => x.id === HOPPAS);
    anta(u.status === 'hoppade_over' && u.hjalp === 1 && u.hjalpVidMs.length === 1 && u.malUppnatt === false, `den överhoppade uppgiften: ${JSON.stringify(u)}`);
    anta((await page.locator(`.at-tabell tr[data-uppgift="${HOPPAS}"]`).textContent()).includes('Hoppade över'), 'tabellen visar inte att uppgiften hoppades över');
  });

  await test('inget anrop skickar testresultat till servern', async () => {
    const egen = new URL(BAS).origin;
    const andraVardar = anrop.filter(a => !a.url.startsWith('blob:') && new URL(a.url).origin !== egen);
    anta(andraVardar.length === 0, `anrop till andra värdar: ${andraVardar.map(a => a.url)}`);
    const markorer = [KOD, MARKOR, 'vardkallan-anvandartest', '"sus"', 'malUppnatt', 'uppmatt'];
    const lacker = anrop.filter(a => markorer.some(x => a.url.includes(encodeURIComponent(x)) || a.url.includes(x) || a.kropp.includes(x)));
    anta(lacker.length === 0, `anrop med testresultat: ${lacker.map(a => `${a.metod} ${a.url}`)}`);
    // Efter uppgifterna skrivs inget till servern: enkäten, resultatet, nedladdningen och kopieringen görs i webbläsaren.
    // Utloggningen när uppgifterna är klara kan hinna komma efter fasbytet, eftersom den först skickar väntande loggar
    // från läsläget. Den har inga testresultat, vilket kontrollen ovan visar.
    const skrivningar = anrop.filter(a => a.fas !== 'uppgifter' && a.metod !== 'GET' && new URL(a.url).pathname !== '/api/logout');
    anta(skrivningar.length === 0, `skrivande anrop efter uppgifterna: ${skrivningar.map(a => `${a.metod} ${a.url}`)}`);
    const api = anrop.filter(a => a.fas === 'resultat' && new URL(a.url).pathname.startsWith('/api/'));
    anta(api.length === 0, `anrop till API:t under resultatet: ${api.map(a => a.url)}`);
    console.log(`    ${anrop.length} anrop avlyssnade, inga med testresultat`);
  });

  await test('testläget rensas när testet avslutas', async () => {
    await page.click('[data-r="avsluta"]');
    await page.click('dialog[open] [data-varde="ok"]');
    await page.waitForSelector('#at-start');
    await page.waitForSelector('.notis:has-text("Testet är avslutat")');
    const efter = await page.evaluate(() => ({ lagrat: sessionStorage.getItem('vk_anvandartest'), list: Boolean(document.getElementById('testlage')), nycklar: Object.keys(sessionStorage) }));
    anta(efter.lagrat === null && !efter.list, 'testläget finns kvar efter att testet avslutats');
    anta(!efter.nycklar.some(k => k.includes('anvandartest')), `kvar i sessionStorage: ${efter.nycklar}`);
    await page.reload();
    await page.waitForSelector('#at-start');
    anta(!(await page.locator('#testlage').count()), 'listen kommer tillbaka efter omladdning');
  });

  // ---- Runda 18, r1: första passet i testinbjudan. -----------------------------------------------------------------
  // Varje yrkesroll gör sitt pass genom att följa vägledningen: testet läser steget i panelen, kontrollerar att ramen
  // ligger runt elementet utan att skymma det och gör det steget säger, med samma räkning som klickbudgeten. Passet ska
  // klaras inom klickbudgeten för uppgiften, och passets egen räkning ska ge samma steg som skriptets.
  const { G18R1, PASSROLLER } = await import(pathToFileURL(join(APP, 'src', 'sussa', 'runda18-r1.js')).href);
  const bild = async (p, namn) => { await p.waitForTimeout(250); await p.screenshot({ path: join(UT, `${namn}.png`) }); };
  const tP = (namn, fn) => test(namn.replace(PREFIX, ''), fn);
  const passAnrop = [];
  async function nyPassSida({ bredd = 1440, hojd = 900 } = {}) {
    const c = await browser.newContext({ viewport: { width: bredd, height: hojd }, locale: 'sv-SE', timezoneId: 'Europe/Stockholm' });
    await stallKlockan(c);
    await raknaISidan(c);
    const p = await c.newPage();
    felSida = p;
    p.on('pageerror', e => sidfel.push(`sidfel: ${e.message}`));
    p.on('console', m => { if (m.type() === 'error' && !/status of 40[34]/.test(m.text())) sidfel.push(`konsolfel: ${m.text()}`); });
    p.on('request', r => { if (/\/api\/testare\//.test(r.url())) passAnrop.push({ url: r.url(), kropp: r.postData() ?? '' }); });
    return { c, p };
  }
  async function startaPass(p, roll, matning) {
    await p.goto(`${BAS}/#/testa`);
    await p.waitForSelector('.testa-rollknapp');
    await p.click(`[data-testroll="${roll}"]`);
    if (matning) {
      await p.waitForSelector('#testare-panel .tp-samtycke');
      await p.click(`#testare-panel [data-tp="matning"][data-varde="${matning}"]`);
    }
    await p.waitForSelector('#tp-steg:not([data-steg=""])', { timeout: 15000 });
    await p.waitForLoadState('networkidle');
  }
  // Märker elementet som vägledningen pekar på, så att testet kan använda det, och kontrollerar ramen.
  async function markera(p) {
    return p.evaluate(async () => {
      const m = await import('/js/forsta-pass.js');
      document.querySelectorAll('[data-fp-test]').forEach(e => e.removeAttribute('data-fp-test'));
      const n = m.stegNu();
      if (!n) return null;
      n.el.setAttribute('data-fp-test', '1');
      const r = n.el.getBoundingClientRect();
      const ram = document.querySelector('.fp-ram')?.getBoundingClientRect();
      return { id: n.id, ram: ram ? { runt: ram.left <= r.left && ram.top <= r.top && ram.right >= r.right && ram.bottom >= r.bottom } : null };
    });
  }
  // Kontrollerar att elementet syns och inte är skymt av ramen, meningen eller panelen.
  async function oskymt(p) {
    return p.evaluate(() => {
      const el = document.querySelector('[data-fp-test="1"]');
      const r = el.getBoundingClientRect();
      const mitt = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 12));
      return Boolean(mitt) && (el === mitt || el.contains(mitt) || [...(el.labels ?? [])].some(l => l === mitt || l.contains(mitt)));
    });
  }
  async function foljPass(p, roll, { tangentbord = false } = {}) {
    const steg = await p.evaluate(async (r) => (await import('/js/forsta-pass-steg.js')).PASS_STEG[r], roll);
    const m = new Matare(p);
    await m.borja();
    const sedda = [];
    for (let i = 0; i < 30; i++) {
      await p.waitForTimeout(300);
      if (await p.locator('#testare-panel .tp-aterkoppling').count()) break;
      const visat = await p.locator('#tp-steg').getAttribute('data-steg');
      const mark = await markera(p);
      anta(mark && mark.id === visat, `panelen visar steget ${visat} men vägledningen pekar på ${mark?.id}`);
      anta(mark.ram?.runt, `ramen ligger inte runt elementet i steget ${visat}`);
      anta(await oskymt(p), `elementet i steget ${visat} är skymt`);
      sedda.push(visat);
      const s = steg.find(x => x.id === visat);
      const loc = p.locator('[data-fp-test="1"]');
      if (tangentbord) {
        // Visa var flyttar fokus till elementet, och resten görs med tangentbordet.
        await p.focus('#testare-panel [data-tp="visa-steg"]');
        await p.keyboard.press('Enter');
        anta(await loc.evaluate(el => el === document.activeElement || el.contains(document.activeElement)), `Visa var gav inte fokus i steget ${visat}`);
        if (s.gor?.skriv) await p.keyboard.type(s.gor.skriv); else await p.keyboard.press(await loc.evaluate(el => (el.matches('input[type="radio"], input[type="checkbox"]') ? ' ' : 'Enter')));
        if (s.gor?.tangent) await p.keyboard.press(s.gor.tangent);
        continue;
      }
      if (s.gor?.skriv) await m.skriv(loc, s.gor.skriv, visat); else await m.klicka(loc, visat);
      if (s.gor?.tangent) await m.tangent(s.gor.tangent, visat);
    }
    await p.waitForSelector('#testare-panel .tp-aterkoppling h3', { timeout: 15000 });
    await p.waitForLoadState('networkidle');
    return { m, sedda, steg };
  }
  const tillstand = (p) => p.evaluate(async () => (await (await fetch('/api/testare')).json()));

  for (const roll of PASSROLLER) {
    await tP(G18R1.roll(roll), async () => {
      const { c, p } = await nyPassSida();
      try {
        await startaPass(p, roll, 'ja');
        const { m, sedda, steg } = await foljPass(p, roll);
        await m.kontrollera();
        const t = await tillstand(p);
        anta(t.pass.resultat?.status === 'klar', `passet är inte klart: ${JSON.stringify(t.pass.resultat)}`);
        anta(m.uppmatt <= t.pass.budget, `passet tog ${m.uppmatt} steg, budgeten är ${t.pass.budget} (${m.steg.join(', ')})`);
        anta(t.pass.resultat.steg === m.uppmatt, `passets räkning gav ${t.pass.resultat.steg} steg, skriptet räknade ${m.uppmatt}`);
        const saknas = steg.map(x => x.id).filter(id => id !== 'meny' && !sedda.includes(id));
        anta(!saknas.length, `stegen ${saknas.join(', ')} visades aldrig`);
        // Runda 21: efter passet pekar ramen på det som ska göras i panelen (jämförelsefrågan, påståendena eller knappen
        // till nästa uppdrag), aldrig på något i journalen.
        const efter = await p.evaluate(async () => { const m = await import('/js/forsta-pass.js'); const n = m.stegNu(); return n ? { id: n.id, iPanel: Boolean(n.el.closest('#testare')) } : null; });
        anta(efter && efter.iPanel && ['jamforelse', 'sus-erbjudande', 'vidare'].includes(efter.id), `efter passet pekar ramen inte på panelen: ${JSON.stringify(efter)}`);
        console.log(`    ${roll}: ${m.uppmatt} av ${t.pass.budget} steg, ${t.pass.resultat.tidS} s`);
        if (roll === 'sjukskoterska') await bild(p, '18r1-aterkoppling');
      } finally { await c.close(); }
    });
  }

  await tP(G18R1.samtycke, async () => {
    const { c, p } = await nyPassSida();
    try {
      const fore = passAnrop.length;
      await startaPass(p, 'lakare-sjukhus', 'nej');
      anta(await p.evaluate(() => localStorage.getItem('vk_testare_matning')) === 'nej', 'svaret sparades inte');
      await foljPass(p, 'lakare-sjukhus');
      await p.waitForSelector('.tp-aterkoppling', { timeout: 10000 });
      const text = await p.locator('.tp-aterkoppling').innerText();
      anta(text.includes('Du valde att passet inte mäts') && !text.includes('Du behövde'), `återkopplingen utan mätning: ${text}`);
      const matningar = passAnrop.slice(fore).filter(a => a.url.includes('/api/testare/pass/matning'));
      anta(!matningar.length, `${matningar.length} mätningar skickades fast testaren sade nej`);
      // Frågan ställs inte igen för nästa yrkesroll.
      await p.goto(`${BAS}/#/testa`);
      await p.waitForSelector('.testa-rollknapp');
      await p.click('[data-testroll="sjukskoterska"]');
      await p.waitForSelector('#tp-steg:not([data-steg=""])', { timeout: 15000 });
      anta(!(await p.locator('.tp-samtycke').count()), 'frågan om mätning ställdes igen');
      const t = await tillstand(p);
      anta(t.pass.matning === 'nej', `nästa pass fick ${t.pass.matning}`);
    } finally { await c.close(); }
  });

  await tP(G18R1.annanVag, async () => {
    const { c, p } = await nyPassSida();
    try {
      const fore = passAnrop.length;
      await startaPass(p, 'lakare-sjukhus', 'ja');
      anta(await p.locator('#tp-steg').getAttribute('aria-live') === 'polite', 'steget läses inte upp för skärmläsare');
      anta((await p.locator('#tp-steg').getAttribute('data-steg')) === 'patient', 'första steget är inte patienten i arbetslistan');
      // En annan väg till patienten: sökningen i stället för arbetslistan.
      await p.goto(`${BAS}/#/sok`);
      await p.waitForSelector('#sokfalt');
      await p.fill('#sokfalt', 'Hamid Burvall');
      await p.keyboard.press('Enter');
      await p.click('#traffar a:has-text("Hamid Burvall")');
      await p.waitForSelector('.tidslinje');
      await p.waitForFunction(() => document.querySelector('#tp-steg')?.dataset.steg === 'bestall', null, { timeout: 8000 });
      // Tillbaka till arbetslistan utan framsteg: vägledningen följer med tillbaka och räknar en återvända.
      await p.click('#meny-lista a[href="#/arbetslista"]');
      await p.waitForFunction(() => document.querySelector('#tp-steg')?.dataset.steg === 'patient', null, { timeout: 8000 });
      // Av och på.
      await p.click('#testare-panel [data-tp="vagledning"]');
      await p.waitForTimeout(300);
      anta(!(await p.locator('.fp-ram').count()), 'ramen syns när vägledningen är avstängd');
      anta(await p.locator('#tp-steg').isHidden(), 'steget syns när vägledningen är avstängd');
      anta((await p.locator('#testare-meddelande').textContent()).includes('avstängd'), 'avstängningen lästes inte upp');
      await p.click('#testare-panel [data-tp="vagledning"]');
      await p.waitForSelector('.fp-ram');
      anta(await p.evaluate(() => localStorage.getItem('vk_forsta_pass_av')) === null, 'valet att slå på sparades inte');
      await foljPass(p, 'lakare-sjukhus');
      const kropp = JSON.parse(passAnrop.slice(fore).filter(a => a.url.includes('/api/testare/pass/matning')).at(-1).kropp);
      anta(kropp.aterkomster >= 1 && kropp.steg.find(x => x.id === 'patient')?.aterkomster >= 1, `återvändan räknades inte: ${JSON.stringify(kropp)}`);
      anta(kropp.avstangd === 1 && kropp.vagledning === false, `avstängningen räknades inte: ${JSON.stringify(kropp)}`);
      anta(kropp.tidForstaS != null, 'tiden till första handlingen saknas');
    } finally { await c.close(); }
  });

  await tP(G18R1.aterkoppling, async () => {
    const { c, p } = await nyPassSida();
    try {
      await startaPass(p, 'sjukskoterska', 'ja');
      await foljPass(p, 'sjukskoterska');
      const text = await p.locator('.tp-aterkoppling').innerText();
      for (const t of ['Klart!', 'Sussa räknade med högst 6 minuter för uppgiften', 'Klickbudgeten, som Vårdkällan ska klara uppgiften inom, är 7 steg', 'Du behövde 7 steg']) anta(text.includes(t), `återkopplingen saknar "${t}": ${text}`);
      await p.check('.tp-jamforelse input[value="lattare"]');
      await p.click('.tp-jamforelse [type="submit"]');
      await p.waitForSelector('.tp-sus-erbjudande');
      await p.click('[data-tp="sus"]');
      await p.waitForSelector('dialog[open].fp-sus-dialog');
      for (const [i, v] of SUS_SVAR.entries()) await p.check(`dialog[open] input[name="sus${i + 1}"][value="${v}"]`);
      await p.click('dialog[open] [type="submit"]');
      await p.waitForSelector('.notis:has-text("Poängen blev 87,5 av 100")');
      await p.waitForSelector('.tp-vidare');
      await p.click('[data-tp="vidare"]');
      await p.waitForSelector('#tp-aktuellt, #testare-panel .tp-jamforelse');
      // Runda 19, r1: nästa uppdrag har sin egen vägledning. Ett uppdrag som blev gjort på vägen får sin fråga först.
      while (await p.locator('#testare-panel .tp-jamforelse').count()) {
        await p.click('#testare-panel [data-tp="hoppa-fraga"]');
        await p.waitForTimeout(300);
      }
      await p.waitForSelector('#tp-aktuellt');
      await p.waitForSelector('#testare-panel #tp-steg', { timeout: 10000 }).catch(() => { throw new Error('vägledningen följde inte med till nästa uppdrag'); });
      anta((await p.locator('[data-tp="vaxla"]').innerText()).includes('Uppdrag 2 av'), 'panelen gick inte vidare till uppdragen');
    } finally { await c.close(); }
  });

  await tP(G18R1.mobil, async () => {
    const { c, p } = await nyPassSida({ bredd: 390, hojd: 844 });
    try {
      // Runda 21 (synpunkt på Facebook): krysset stänger panelen också medan frågan om mätning väntar, och den förblir
      // stängd tills testaren öppnar den eller läget ändras.
      await startaPass(p, 'underskoterska', null);
      await p.waitForSelector('#testare-panel .tp-samtycke');
      await p.click('#testare [data-tp="stang"]');
      await p.waitForTimeout(1500);
      anta(await p.locator('#testare-panel').isHidden(), 'krysset stängde inte panelen');
      await p.click('#testare [data-tp="vaxla"]');
      await p.waitForSelector('#testare-panel .tp-samtycke');
      await p.click('#testare-panel [data-tp="matning"][data-varde="ja"]');
      await p.waitForLoadState('networkidle');
      await bild(p, '18r1-vagledning-mobil');
      const { sedda } = await foljPass(p, 'underskoterska', { tangentbord: true });
      anta(sedda.includes('registrera'), `alla steg nåddes inte: ${sedda.join(', ')}`);
      const bred = await p.evaluate(() => document.documentElement.scrollWidth);
      anta(bred <= 390, `sidan är ${bred} px bred`);
      const t = await tillstand(p);
      anta(t.pass.resultat?.status === 'klar', 'passet blev inte klart med tangentbordet');
    } finally { await c.close(); }
  });

  // Tillägg 2026-11-19 (Jonas): bjud in en kollega och dela. Länkarna till tjänsterna öppnas, men varje anrop utanför
  // demon stoppas innan det lämnar webbläsaren, så att inget laddas från tjänsterna och inget publiceras.
  await tP(G18R1.bjudIn, async () => {
    const c = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'sv-SE', timezoneId: 'Europe/Stockholm' });
    const externa = [];
    await c.route((u) => !u.href.startsWith(BAS), (r) => { externa.push(r.request().url()); return r.abort(); });
    await c.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BAS });
    const p = await c.newPage();
    felSida = p;
    p.on('pageerror', e => sidfel.push(`sidfel: ${e.message}`));
    try {
      await p.goto(`${BAS}/#/testa`);
      const skrivningar = [];
      p.on('request', r => { if (r.method() !== 'GET' && r.url().startsWith(BAS)) skrivningar.push(r.url()); });
      await p.click('[data-testa="bjud-in"]');
      await p.waitForSelector('dialog[open].bj-dialog');
      anta(!skrivningar.length, `att bjuda in skickade ${skrivningar.join(', ')}`);
      anta(await p.locator('dialog[open]').getAttribute('aria-labelledby') === 'bj-rubrik', 'dialogen saknar rubrik för skärmläsare');
      anta(await p.locator('label[for="bj-text"]').count() === 1, 'texten saknar etikett');
      const text = await p.locator('#bj-text').inputValue();
      anta(text.includes(`${BAS}/#/testa?via=lank`), `texten saknar länken: ${text}`);
      anta(text.includes('påhittade patienter') && text.includes('fem minuter'), 'texten säger inte att patienterna är påhittade och att passet tar fem minuter');
      await p.click('[data-bj="kopiera"]');
      await p.waitForSelector('.notis:has-text("Inbjudan är kopierad")');
      anta(await p.evaluate(() => navigator.clipboard.readText()) === text, 'urklippet har inte texten');
      const epost = await p.locator('[data-bj-kanal="epost"]').getAttribute('href');
      anta(epost.startsWith('mailto:?subject=') && decodeURIComponent(epost).includes(`${BAS}/#/testa?via=epost`), `e-postlänken: ${epost}`);
      for (const [kanal, vard] of [['linkedin', 'www.linkedin.com'], ['facebook', 'www.facebook.com'], ['x', 'x.com']]) {
        const l = p.locator(`[data-bj-kanal="${kanal}"]`);
        anta(await l.getAttribute('target') === '_blank' && (await l.getAttribute('rel')).includes('noopener'), `länken till ${kanal} öppnas inte i en ny flik utan opener`);
        const fore = externa.length;
        const [ny] = await Promise.all([c.waitForEvent('page'), l.click()]);
        await ny.waitForTimeout(500);
        const adress = externa.slice(fore).find(u => new URL(u).hostname === vard);
        anta(adress && decodeURIComponent(adress).includes(`${BAS}/#/testa?via=${kanal}`), `${kanal} öppnade ${externa.slice(fore).join(', ')}`);
        await ny.close();
      }
      const inlasta = await p.evaluate(() => performance.getEntriesByType('resource').map(r => r.name).filter(n => !n.startsWith(location.origin)));
      anta(!inlasta.length, `sidan laddade något utanför demon: ${inlasta.join(', ')}`);
      await p.keyboard.press('Escape');
      // En besökare via länken räknas per kanal, och besöket följer med när passet startar.
      const c2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const p2 = await c2.newPage();
      const starta = [];
      p2.on('request', r => { if (r.url().endsWith('/api/testare/starta')) starta.push(r.postData() ?? ''); });
      const [svar] = await Promise.all([p2.waitForRequest(r => r.url().endsWith('/api/inbjudan/besok')), p2.goto(`${BAS}/#/testa?via=linkedin`)]);
      anta(JSON.parse(svar.postData()).kanal === 'linkedin', 'besöket räknades inte på kanalen');
      await p2.waitForSelector('.testa-rollknapp');
      await p2.click('[data-testroll="underskoterska"]');
      await p2.waitForSelector('#testare-panel .tp-samtycke');
      anta(starta.some(k => JSON.parse(k).via === 'linkedin'), 'kanalen följde inte med när passet startade');
      await c2.close();
    } finally { await c.close(); }
  });

  await tP(G18R1.inga, async () => {
    // Allt som skickades till /api/testare under passen ovan.
    const POSTER = ['sus19', 'sus05', 'sus06', 'obs3', 'p01', 'Hamid', 'Burvall', 'Berit', 'Strandhall', 'Sara', 'Sandmark', 'Helene', 'Lund', 'Amanda', 'Lindholm', 'Gunnar', 'Åkesson'];
    anta(passAnrop.some(a => a.url.includes('/api/testare/pass/matning')), 'inga mätningar skickades');
    for (const a of passAnrop) {
      const traff = POSTER.find(x => a.kropp.includes(x) || decodeURIComponent(a.url).includes(x));
      anta(!traff, `${a.url} innehåller ${traff}`);
      anta(!/\d{6,8}[-+]?\d{4}/.test(a.kropp), `${a.url} innehåller något som liknar ett personnummer`);
    }
  });
  // ---------------------------------------------------------------------------------------------------------------------

  const version = browser.version();
  await browser.close();
  skrivKlienttester({ app: APP, prefix: PREFIX, tester, bas: BAS, webblasare: `Chromium ${version}`, gransnittHash: hash });
  const roda = tester.filter(t => t.status !== 'grön');
  console.log(`\nAnvändartest: ${tester.length - roda.length} av ${tester.length} gröna. Resultatet finns i app/klienttest-resultat.json`);
  if (sidfel.length) console.log(`Sidfel och konsolfel:\n  ${sidfel.join('\n  ')}`);
  process.exit(roda.length || sidfel.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
