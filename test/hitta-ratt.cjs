// Runda 18, r2: att hitta rätt. Prövar sökrutan Vad vill du göra? som en ny användare i varje demoroll, ordlistan Jag
// letar efter och att varje tom lista och varje fel som visas säger vad man kan göra i stället.
//
// Användning (servern måste vara igång, efter de andra gränssnittstesterna):
//   NODE_PATH=$(npm root -g) node test/hitta-ratt.cjs [bas-url]
// Resultatet skrivs till app/klienttest-resultat.json med prefixet Gränssnitt > Hitta rätt > .
//
// Ett tomt läge eller ett fel räknas som förklarat när det har en länk eller knapp, när en knapp, länk eller ett
// formulär står direkt intill eller i samma sektions rubrikrad, eller när texten säger vad användaren kan göra (en
// uppmaning som Välj, Skriv eller Registrera) eller när listan fylls (visas här när, kommer när). Det som just hämtas
// räknas inte.

const { chromium } = require('@playwright/test');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { foljServernsKlocka, stallKlockan } = require('./testklocka.cjs');
const { skrivKlienttester } = require('./klienttester.cjs');
const { SOKRUTAN } = require('./flodessteg.cjs');

const BAS = process.argv[2] || 'http://127.0.0.1:18282';
const APP = join(__dirname, '..', 'app');
const UT = join(__dirname, 'skarmbilder');
mkdirSync(UT, { recursive: true });
const PREFIX = 'Gränssnitt > Hitta rätt > ';

const tester = [];
const sidfel = [];
let aktuellt = '';

// HITTA_RATT_BARA=<ord> kör bara testerna vars namn innehåller ordet, och skriver då inget resultat.
const BARA = process.env.HITTA_RATT_BARA ?? '';
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
// Utloggning genom API:t och en ny sida, så att ingen pågående omritning kommer i vägen.
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
async function oppnaRutan(page, viaTangent = false) {
  if (viaTangent) await page.keyboard.press('Control+k'); else await page.click(SOKRUTAN.knapp);
  await page.waitForSelector(`${SOKRUTAN.dialog}[open]`);
  await page.waitForFunction((s) => document.activeElement?.matches(s), SOKRUTAN.falt);
}
async function sok(page, text) {
  await page.fill(SOKRUTAN.falt, text);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(250);
}

// Hittar tomma lägen och fel utan förklaring i huvudinnehållet. Körs i sidan.
function oforklarade() {
  const UPPMANING = /(^|[.!?:]\s+)(Välj|Skriv|Sök|Registrera|Lägg|Öppna|Gå|Klicka|Boka|Använd|Pröva|Skicka|Beställ|Ordinera|Fyll|Ange|Kontakta|Be|Logga|Starta|Skapa|Markera|Vänta|Läs|Byt|Ändra|Ta|Gör|Kryssa|Ladda|Hämta|Tryck|Kontrollera|Ring|Sätt|Bekräfta|Signera|Kvittera|Planera|Dokumentera|Utse|Godkänn|Ladda upp|Koppla|Fråga|Spara|Inkludera|Lämna|Följ|Visa|Avsluta|Förläng|Hoppa|Svara|Rapportera|Mät|Ge|Lägg till)\b/;
  const NAR = /\b(visas|hamnar|kommer|syns|dyker upp|läggs till|läggs|blir|fylls|räknas|står)\b[^.]*\b(när|så snart|efter)\b|\b(när|så snart)\b[^.]*\b(visas|hamnar|kommer|syns|läggs|registreras|registrerar|skickar|skickas|bokas|signeras|ordineras|beställs|finns)\b|\b(görs|registreras|finns|sköts|bokas|skrivs|väljs|beställs|ordineras|nås|ändras|läggs in)\b[^.]*\b(under|från|i menyn|i journalen|på fliken|i översikten|av)\b|\bkan du\b|\bgår att\b/i;
  const synlig = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const harAtgard = (e) => Boolean(e?.matches?.('a[href], button, form, input, select, textarea, .knapprad, details') || e?.querySelector?.('a[href], button:not([disabled]), form, input, select'));
  const ut = [];
  const kandidater = [...document.querySelectorAll('main .tom, main .form-fel, main .ruta-larm, main .ruta-nekad, #notiser .notis-fel')];
  for (const e of kandidater) {
    if (!synlig(e)) continue;
    const text = e.textContent.replace(/\s+/g, ' ').trim();
    if (!text || /^(Hämtar|Öppnar|Laddar|Söker)/.test(text)) continue;
    if (e.querySelector('a[href], button')) continue;
    if (UPPMANING.test(text) || NAR.test(text)) continue;
    if (harAtgard(e.nextElementSibling) || harAtgard(e.previousElementSibling)) continue;
    const sektion = e.closest('section, article, .ov-sektion, .ruta, fieldset, li, td, dd');
    const huvud = sektion?.querySelector(':scope > .sektion-huvud, :scope > header, :scope > .flikhuvud, :scope > h2, :scope > h3');
    if (huvud && harAtgard(huvud)) continue;
    if (sektion && sektion !== e && [...sektion.children].some(c => c !== e && !c.contains(e) && harAtgard(c))) continue;
    ut.push(text.slice(0, 160));
  }
  return ut;
}

(async () => {
  const { gransnittHash } = await import(pathToFileURL(join(APP, 'src', 'klientresultat.js')).href);
  await foljServernsKlocka(BAS);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'sv-SE', timezoneId: 'Europe/Stockholm' });
  await stallKlockan(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', e => sidfel.push(`sidfel i "${aktuellt}": ${e.message}`));
  page.on('response', r => { if (r.status() >= 500) sidfel.push(`HTTP ${r.status()} ${new URL(r.url()).pathname} i "${aktuellt}"`); });
  // 401 kommer från anrop i bakgrunden när testet loggar ut genom API:t, och 403 och 404 där demon visar nekad åtkomst.
  page.on('console', m => { if (m.type() === 'error' && !/status of 40[1347]/.test(m.text())) sidfel.push(`konsolfel i "${aktuellt}": ${m.text()}`); });

  // Rollerna på inloggningssidan.
  await page.goto(`${BAS}/#/`);
  await page.waitForSelector('[data-roll]');
  const roller = await page.locator('[data-roll]').evaluateAll(l => l.map(b => b.dataset.roll));

  await test('sökrutan nås från sidhuvudet och med Ctrl K i varje roll, och varje förslag öppnar en vy som rollen får', async () => {
    const fel = [];
    for (const id of roller) {
      await loggaIn(page, id);
      if (!await page.locator(SOKRUTAN.knapp).count()) { fel.push(`${id}: ingen knapp i sidhuvudet`); continue; }
      await oppnaRutan(page, id === roller[0]);
      await page.waitForSelector(`${SOKRUTAN.dialog} ${SOKRUTAN.traff}`, { timeout: 8000 }).catch(() => fel.push(`${id}: inga förslag utan fråga`));
      const forslag = await page.locator(`${SOKRUTAN.dialog} ${SOKRUTAN.traff}`).evaluateAll(l => l.map(a => ({ id: a.dataset.hsId, href: a.getAttribute('href'), patient: a.dataset.hsPatient === '1' })));
      await page.keyboard.press('Escape');
      for (const f of forslag) {
        if (f.patient || !f.href || f.href === '#/' || f.id === 'reservkod') continue;
        await page.goto(`${BAS}/${f.href}`);
        await vantaVy(page);
        if (await page.locator('.notis', { hasText: 'hör inte till din yrkesroll' }).count()) fel.push(`${id}: ${f.id} öppnar en vy som rollen inte får`);
        if (await page.locator('main h1', { hasText: 'Det gick inte att visa sidan' }).count()) fel.push(`${id}: ${f.id} ger en felsida`);
        await page.evaluate(() => document.getElementById('notiser')?.replaceChildren());
      }
    }
    if (fel.length) throw new Error(fel.join('; '));
  });

  await test('med en öppen patient öppnar sökrutan formuläret i patientens journal, och utan patient väntar handlingen tills patienten öppnas', async () => {
    await loggaIn(page, 'lak-vc');
    await page.goto(`${BAS}/#/patient/p14`); await page.waitForSelector('.patientband h1'); await page.waitForLoadState('networkidle');
    await oppnaRutan(page);
    await sok(page, 'skriv remiss');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#remissform', { timeout: 8000 });
    if (!page.url().endsWith('#/patient/p14/remisser/ny')) throw new Error(`remissen öppnades på ${page.url()}`);
    await page.goto(`${BAS}/#/arbetslista`); await vantaVy(page);
    await oppnaRutan(page);
    await sok(page, 'sjukskrivning');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.notis', { hasText: 'Öppna patienten' });
    await page.click('#lista a[href="#/patient/p14"]');
    await page.waitForSelector('.intyg-nytt', { timeout: 8000 });
    if (!page.url().endsWith('#/patient/p14/intyg')) throw new Error(`sjukskrivningen öppnades på ${page.url()}`);
    await loggaIn(page, 'ssk-kard');
    await page.goto(`${BAS}/#/patient/p01`); await page.waitForSelector('.patientband h1'); await page.waitForLoadState('networkidle');
    await oppnaRutan(page);
    await sok(page, 'blodtrycket');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#mv-varde', { timeout: 8000 });
    if (!await page.evaluate(() => document.activeElement?.id === 'mv-varde')) throw new Error('värdefältet har inte fokus');
    if (await page.locator('#mv-typ').inputValue() !== 'blodtryck') throw new Error('blodtryck är inte förvalt');
  });

  await test('en handling som rollen saknar säger vilken roll som gör den, och ett ord från ett annat system förklaras', async () => {
    await loggaIn(page, 'ssk-kard');
    await oppnaRutan(page);
    await sok(page, 'sjukskriv');
    const saknas = await page.locator(`${SOKRUTAN.dialog} .hs-saknas`).textContent();
    if (!/läkare/.test(saknas)) throw new Error(`saknas säger ${saknas}`);
    await sok(page, 'läkemedelskurvan');
    const via = await page.locator(`${SOKRUTAN.dialog} .hs-via`).first().textContent();
    if (!/Läkemedel att ge/.test(via)) throw new Error(`ordet förklaras med ${via}`);
    await sok(page, 'remmis');
    await page.keyboard.press('Escape');
  });

  await test('mätningen av sökningar anropas genom r1:s funktion när den finns, utan söktext med siffror', async () => {
    await loggaIn(page, 'lak-vc');
    await page.evaluate(() => { window.__matt = []; window.vkMatning = { sokning: (h) => window.__matt.push(h) }; });
    await oppnaRutan(page);
    await sok(page, '19121212-1212');
    await page.keyboard.press('Escape');
    await oppnaRutan(page);
    await sok(page, 'inkorg');
    await page.keyboard.press('Enter');
    await page.waitForURL(/#\/inkorg/);
    const m = await page.evaluate(() => window.__matt);
    if (m.length !== 2) throw new Error(`${m.length} mätningar`);
    if (m[0].fraga !== null || m[0].handling !== null || !m[0].avbruten) throw new Error(`första mätningen ${JSON.stringify(m[0])}`);
    if (m[1].handling !== 'inkorg' || m[1].fraga !== 'inkorg') throw new Error(`andra mätningen ${JSON.stringify(m[1])}`);
    // Utan r1:s funktion fungerar rutan som vanligt.
    await page.evaluate(() => { delete window.vkMatning; });
    await oppnaRutan(page);
    await sok(page, 'arbetslista');
    await page.keyboard.press('Enter');
    await page.waitForURL(/#\/arbetslista/);
  });

  await test('ordlistan Jag letar efter går att filtrera, länkar bara till det rollen får och är öppen utan inloggning', async () => {
    await loggaIn(page, 'ssk-kard');
    await page.goto(`${BAS}/#/ordlista`); await vantaVy(page);
    await page.fill('#ol-filter', 'kurva');
    const synliga = await page.locator('.ol-post:visible').count();
    if (!synliga) throw new Error('filtret visar inget för kurva');
    await page.locator('.ol-post:visible a[href="#/administrering"]').first().click();
    await page.waitForURL(/#\/administrering/);
    await page.goto(`${BAS}/#/ordlista`); await vantaVy(page);
    if (await page.locator('.ol-post a[href="#/idag"]').count()) throw new Error('sjuksköterskan får en länk till vårdadministratörens dagens arbete');
    await page.fill('#ol-filter', 'zzqq');
    await page.waitForSelector('#ol-inget:visible');
    await loggaUt(page);
    await page.goto(`${BAS}/#/ordlista`); await vantaVy(page);
    await page.waitForSelector('.ol-post');
    if (!await page.locator('.ol-post').count() || await page.locator('.ol-post a').count()) throw new Error('ordlistan utan inloggning ska ha orden men inga länkar');
  });

  await test('varje tom lista och varje fel i rollernas vyer och i journalens flikar säger vad man kan göra i stället', async () => {
    const fel = new Map();
    const notera = (var_, lista) => { for (const t of lista) { const k = `${t}`; if (!fel.has(k)) fel.set(k, var_); } };
    for (const id of roller) {
      await loggaIn(page, id);
      notera(`${id} startsidan`, await page.evaluate(oforklarade));
      const lankar = await page.locator('#meny-lista a').evaluateAll(a => a.map(x => [x.getAttribute('href'), x.querySelector('.menytext').textContent]));
      for (const [href, text] of lankar) {
        await page.goto(`${BAS}/${href}`);
        await vantaVy(page);
        notera(`${id} ${text}`, await page.evaluate(oforklarade));
      }
      // Journalens flikar för den första patienten i arbetslistan.
      if (lankar.some(l => l[0] === '#/arbetslista')) {
        await page.goto(`${BAS}/#/arbetslista`); await vantaVy(page);
        const p = await page.locator('#lista a[href^="#/patient/"]').first().getAttribute('href').catch(() => null);
        if (p) {
          await page.goto(`${BAS}/${p}`); await vantaVy(page);
          const flikar = await page.locator('.flikar a').evaluateAll(a => a.map(x => [x.getAttribute('href'), x.textContent.trim()]));
          for (const [href, text] of flikar) {
            await page.goto(`${BAS}/${href}`);
            await vantaVy(page);
            notera(`${id} journalen ${text}`, await page.evaluate(oforklarade));
          }
        }
      }
    }
    if (fel.size) throw new Error(`${fel.size} tomma lägen eller fel utan förklaring:\n${[...fel].map(([t, v]) => `${v}: ${t}`).join('\n')}`);
  });

  const version = browser.version();
  await browser.close();
  if (!BARA) skrivKlienttester({ app: APP, prefix: PREFIX, tester: tester.map(({ namn, status }) => ({ namn, status })), bas: BAS, webblasare: `Chromium ${version}`, gransnittHash: gransnittHash(join(APP, 'public')) });
  const roda = tester.filter(t => t.status !== 'grön');
  console.log(`\n${tester.length - roda.length} av ${tester.length} gröna. Resultatet finns i app/klienttest-resultat.json`);
  if (roda.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
