// Runda 19, r1: vägledningen i alla uppdrag i testinbjudan, i en riktig webbläsare med Playwright. För varje testroll
// startar testet rollen genom #/testa som en testare, går igenom första passet och sedan varje uppdrag i tur och ordning
// genom att bara följa vägledningen: ramen ska synas runt elementet, meningen ska vara stegets text, och testet klickar
// eller skriver i det som ramen pekar på (med stegets gor när det finns). Efter varje uppdrag kontrollerar testet att
// servern har bockat av det, eller att svaret på frågan godtogs, och svarar på jämförelsefrågan.
//
// Testet fallerar med uppdragets och stegets id när ett mål inte syns inom rimlig tid, när ett uppdrag saknar steg och
// när ett uppdrag inte blir klart. Resultatet skrivs till app/vagledning.json med en hash av public/, per testroll, så
// att en körning för några roller behåller resultatet för de andra.
//
// Användning (servern måste vara igång, med -e NYA_PER_TIMME=100000 -e MAX_PER_ADRESS=100000):
//   NODE_PATH=$(npm root -g) node test/vagledning.cjs <bas-url> [testroll ...]
// Utan testroller körs alla. Ordningen bland gränssnittstesterna: efter test/anvandartest.cjs.

const { chromium } = require('@playwright/test');
const { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { foljServernsKlocka, stallKlockan, resultatfil } = require('./testklocka.cjs');

const BAS = process.argv[2] || 'http://127.0.0.1:18291';
const VALDA = process.argv.slice(3);
const APP = join(__dirname, '..', 'app');
const UT = join(__dirname, 'skarmbilder');
mkdirSync(UT, { recursive: true });
for (const f of readdirSync(UT)) if (f.startsWith('00-fel-vagledning')) rmSync(join(UT, f));
const PREFIX = 'Gränssnitt > Vägledning > ';
// Så länge får det dröja innan ett mål syns, och så många gånger får samma steg komma tillbaka direkt efter att testet
// har gjort det som steget säger.
const VANTA_MS = 12000;
const MAX_UPPREPNING = 4;
const MAX_HANDLINGAR = 90;

const sidfel = [];
let felNr = 0;
const anta = (villkor, text) => { if (!villkor) throw new Error(text); };

// Märker elementet som vägledningen pekar på och läser ramen, meningen och panelens text.
async function lasLaget(p) {
  return p.evaluate(async () => {
    const m = await import('/js/forsta-pass.js');
    document.querySelectorAll('[data-fp-test]').forEach(e => e.removeAttribute('data-fp-test'));
    const panel = document.querySelector('#tp-steg');
    const n = m.stegNu();
    if (!n) return { id: null, panel: panel?.dataset.steg ?? null, panelText: panel?.textContent ?? '' };
    n.el.setAttribute('data-fp-test', '1');
    const r = n.el.getBoundingClientRect();
    const ram = document.querySelector('.fp-ram')?.getBoundingClientRect();
    const etikett = document.querySelector('.fp-etikett');
    return {
      id: n.id, text: n.text, panel: panel?.dataset.steg ?? null, panelText: panel?.textContent ?? '',
      ram: ram ? ram.left <= r.left + 1 && ram.top <= r.top + 1 && ram.right >= r.right - 1 && ram.bottom >= r.bottom - 1 : false,
      etikett: etikett && getComputedStyle(etikett).display !== 'none' ? etikett.textContent : null,
      tagg: n.el.tagName.toLowerCase(), typ: n.el.getAttribute('type') ?? '',
    };
  });
}

// Följer vägledningen tills klart() säger att uppdraget eller passet är gjort. steg är stegen, namn uppdragets id.
async function folj(p, namn, steg, klart) {
  const sedda = [];
  let senast = null;
  let upprepning = 0;
  let utanMal = Date.now();
  for (let i = 0; i < MAX_HANDLINGAR * 3; i++) {
    await p.waitForTimeout(250);
    if (await klart()) return sedda;
    const l = await lasLaget(p);
    if (!l.id || l.panel !== l.id) {
      if (Date.now() - utanMal > VANTA_MS) throw new Error(`${namn}, efter steget ${senast ?? '(inget)'}: inget mål syns. Panelen säger: ${l.panelText.trim()}`);
      continue;
    }
    utanMal = Date.now();
    anta(l.ram, `${namn}, steget ${l.id}: ramen ligger inte runt elementet`);
    anta(l.panelText.includes(l.text), `${namn}, steget ${l.id}: panelen visar inte stegets text`);
    if (l.etikett != null) anta(l.etikett === l.text, `${namn}, steget ${l.id}: meningen bredvid ramen är "${l.etikett}"`);
    upprepning = l.id === senast ? upprepning + 1 : 0;
    anta(upprepning <= MAX_UPPREPNING, `${namn}, steget ${l.id}: steget leder inte vidare`);
    senast = l.id;
    sedda.push(l.id);
    anta(sedda.length <= MAX_HANDLINGAR, `${namn}: blev inte klart efter ${MAX_HANDLINGAR} steg (${sedda.slice(-6).join(', ')})`);
    const s = steg.find(x => x.id === l.id);
    const loc = p.locator('[data-fp-test="1"]');
    if (s.gor?.skriv) {
      // En lista får alternativet med texten, ett fält får texten.
      if (l.tagg === 'select') await loc.selectOption({ label: s.gor.skriv }).catch(() => loc.selectOption(s.gor.skriv));
      else { await loc.click(); await loc.fill(s.gor.skriv); }
    } else await loc.click();
    if (s.gor?.tangent) await loc.press(s.gor.tangent).catch(() => p.keyboard.press(s.gor.tangent));
    await p.waitForLoadState('networkidle').catch(() => {});
  }
  throw new Error(`${namn}: blev inte klart (${sedda.slice(-6).join(', ')})`);
}

const tillstand = (p) => p.evaluate(async () => (await (await fetch('/api/testare')).json()));

// Jämförelsefrågan efter ett uppdrag. Svaret ska säga om vägledningen var på.
async function jamfor(p, id, jamforelser) {
  const form = p.locator(`#testare-panel .tp-jamforelse[data-id="${id}"]`);
  await form.waitFor({ timeout: 10000 });
  await form.locator('input[value="lika"]').check();
  const [req] = await Promise.all([p.waitForRequest(r => r.url().includes(`/api/testare/uppdrag/${encodeURIComponent(id)}/jamforelse`)), form.locator('[type="submit"]').click()]);
  jamforelser.push(JSON.parse(req.postData() ?? '{}'));
  await p.waitForFunction((x) => !document.querySelector(`#testare-panel .tp-jamforelse[data-id="${x}"]`), id, { timeout: 10000 });
  await p.waitForLoadState('networkidle').catch(() => {});
}

async function kor(browser, roll) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'sv-SE', timezoneId: 'Europe/Stockholm' });
  await stallKlockan(ctx);
  const p = await ctx.newPage();
  p.on('pageerror', e => sidfel.push(`${roll}: sidfel: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error' && !/status of 40[349]/.test(m.text())) sidfel.push(`${roll}: konsolfel: ${m.text()}`); });
  const tester = [];
  const jamforelser = [];
  async function test(namn, fn) {
    try {
      await fn();
      tester.push({ namn: `${PREFIX}${roll} > ${namn}`, status: 'grön' });
      console.log(`ok  ${roll} ${namn}`);
    } catch (e) {
      const fel = e.message.split('\n')[0];
      tester.push({ namn: `${PREFIX}${roll} > ${namn}`, status: 'röd', fel });
      console.log(`FEL ${roll} ${namn}: ${fel}`);
      await p.screenshot({ path: join(UT, `00-fel-vagledning-${++felNr}.png`), fullPage: true }).catch(() => {});
      return false;
    }
    return true;
  }
  try {
    const startat = await test('passet: vägledningen syns direkt och leder fram', async () => {
      await p.goto(`${BAS}/#/testa`);
      await p.waitForSelector('.testa-rollknapp');
      await p.click(`[data-testroll="${roll}"]`);
      // Ramen och meningen syns innan testaren har svarat på frågan om mätning.
      await p.waitForSelector('#testare-panel .tp-samtycke', { timeout: 20000 });
      await p.waitForSelector('#tp-steg:not([data-steg=""])', { timeout: 15000 });
      await p.waitForSelector('.fp-ram', { timeout: 5000 });
      await p.click('#testare-panel [data-tp="matning"][data-varde="nej"]');
      await p.waitForLoadState('networkidle');
      const steg = await p.evaluate(async (r) => (await import('/js/forsta-pass-steg.js')).PASS_STEG[r], roll);
      const t = await tillstand(p);
      await folj(p, `passet (${t.pass.uppdrag})`, steg, async () => (await p.locator('#testare-panel .tp-aterkoppling').count()) > 0);
      await jamfor(p, t.pass.uppdrag, jamforelser);
      await p.click('#testare-panel [data-tp="sus-hoppa"]');
      await p.click('#testare-panel [data-tp="vidare"]');
      await p.waitForSelector('#tp-aktuellt');
    });
    if (!startat) return tester;
    const alla = await p.evaluate(async (r) => (await import(`/js/uppdrag-steg/${r}.js`).catch(() => ({ default: {} }))).default, roll);
    for (let n = 0; n < 40; n++) {
      const t = await tillstand(p);
      const id = t.aktuellt;
      if (!id) break;
      const u = t.uppdrag.find(x => x.id === id);
      const ok = await test(`${id}: ${u.titel}`, async () => {
        const steg = alla[id];
        anta(Array.isArray(steg) && steg.length, `${id}: uppdraget saknar steg`);
        await p.waitForFunction(() => document.querySelector('#tp-steg')?.dataset.steg, null, { timeout: VANTA_MS }).catch(() => {});
        await folj(p, id, steg, async () => (await p.locator(`#testare-panel .tp-jamforelse[data-id="${id}"]`).count()) > 0);
        const efter = await tillstand(p);
        const s = efter.uppdrag.find(x => x.id === id);
        anta(s.status === 'klar', `${id}: servern har inte bockat av uppdraget (${s.status})`);
        await jamfor(p, id, jamforelser);
        const sist = jamforelser.at(-1);
        anta(sist.vagledning === true, `${id}: jämförelsen sade inte att vägledningen var på (${JSON.stringify(sist.vagledning)})`);
      });
      if (!ok) {
        // Uppdraget hoppas över, så att resten av rollens uppdrag prövas.
        await p.evaluate(async (x) => { await fetch(`/api/testare/uppdrag/${encodeURIComponent(x)}/hoppa`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); await fetch(`/api/testare/uppdrag/${encodeURIComponent(x)}/jamforelse`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"hoppa":true}' }); }, id);
        await p.goto(`${BAS}/#/`);
        await p.waitForLoadState('networkidle');
      }
    }
    await test('alla uppdrag är gjorda och ramen är borta', async () => {
      const t = await tillstand(p);
      anta(!t.aktuellt, `uppdraget ${t.aktuellt} är kvar`);
      await p.waitForTimeout(500);
      anta(!(await p.locator('.fp-ram').count()), 'ramen finns kvar när alla uppdrag är gjorda');
    });
  } finally { await ctx.close(); }
  return tester;
}

(async () => {
  const { gransnittHash } = await import(pathToFileURL(join(APP, 'src', 'klientresultat.js')).href);
  const hash = gransnittHash(join(APP, 'public'));
  await foljServernsKlocka(BAS);
  const roller = (await (await fetch(`${BAS}/api/testare/roller`)).json()).roller.map(r => r.id);
  const okanda = VALDA.filter(r => !roller.includes(r));
  if (okanda.length) { console.error(`Okända testroller: ${okanda.join(', ')}. Rollerna är ${roller.join(', ')}.`); process.exit(2); }
  const kora = VALDA.length ? VALDA : roller;
  const browser = await chromium.launch();
  const resultat = {};
  for (const roll of kora) resultat[roll] = await kor(browser, roll);
  const version = browser.version();
  await browser.close();

  // Resultatet per testroll. En körning för några roller behåller de andras resultat.
  const fil = join(APP, resultatfil('vagledning.json'));
  let forra = {};
  try { forra = existsSync(fil) ? JSON.parse(readFileSync(fil, 'utf8')) : {}; } catch { forra = {}; }
  const tid = new Date().toISOString();
  const ut = { roller: { ...(forra.roller ?? {}) } };
  for (const [roll, tester] of Object.entries(resultat)) ut.roller[roll] = { tid, gransnittHash: hash, webblasare: `Chromium ${version}`, bas: BAS, tester };
  ut.tester = Object.values(ut.roller).flatMap(r => r.tester.map(t => ({ ...t, aktuell: r.gransnittHash === hash })));
  ut.gransnittHash = hash;
  ut.tid = tid;
  writeFileSync(fil, `${JSON.stringify(ut, null, 2)}\n`);

  const alla = Object.values(resultat).flat();
  const roda = alla.filter(t => t.status !== 'grön');
  console.log(`\nVägledning: ${alla.length - roda.length} av ${alla.length} gröna för ${kora.join(', ')}. Resultatet finns i app/${resultatfil('vagledning.json')}`);
  if (sidfel.length) console.log(`Sidfel och konsolfel:\n  ${sidfel.join('\n  ')}`);
  process.exit(roda.length || sidfel.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
