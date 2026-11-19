// Runda 18, r4: textgranskningen inför en ny version. Skriptet renderar de fyra publika sidorna (#/testa, #/om, #/krav
// och #/moduler) mot en bas-url, med alla ihopfällda delar öppnade, och skriver texten som en besökare ser den till en
// Markdown-fil per sida. Överst i varje fil står det som ska granskas i den nya versionen, som servern räknar fram
// (GET /api/textgranskning, src/textgranskning.js), så att den som sätter en version läser allt på ett ställe.
// Uppdragens texter, som en testare ser först efter inloggningen, står sist i filen för #/testa. På modulsidan öppnas
// varje moduls länk Visa kraven, och antalet poster på kravsidan jämförs med modulens text.
//
// Granskningen är klar när testet app/test/textgranskning.test.js är grönt: varje källa och varje känd begränsning är
// granskad i versionen, och inget handskrivet tal skiljer sig från det som koden räknar fram.
//
// Körs med Node och Playwright mot en lokal container:
//   NODE_PATH=$(npm root -g) node app/scripts/textgranskning.js http://127.0.0.1:8080 [utkatalog]
// Utan utkatalog skrivs filerna till en ny katalog under $TMPDIR.
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const BAS = (process.argv[2] || '').replace(/\/$/, '');
if (!/^https?:\/\//.test(BAS)) {
  console.error('Ange bas-url: node app/scripts/textgranskning.js http://127.0.0.1:8080 [utkatalog]');
  process.exit(2);
}
const UT = process.argv[3] || mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'textgranskning-'));
mkdirSync(UT, { recursive: true });

// Väntar tills vyn har hämtat det den visar: ingen rad i huvudytan säger längre att något hämtas.
const klar = (page) => page.waitForFunction(() => document.querySelector('main h1') && ![...document.querySelectorAll('main .tom, main p')].some(e => /^Hämtar /.test(e.textContent.trim())), null, { timeout: 60_000 });

// Varje vy laddas från början, så att ingen text från förra vyn ligger kvar.
async function ga(page, hash) {
  await page.goto('about:blank');
  await page.goto(`${BAS}/${hash}`);
  await page.waitForLoadState('networkidle');
  await klar(page);
}

// Öppnar alla ihopfällda delar och väntar tills innehåll som ritas när en del öppnas har kommit.
async function oppnaAllt(page) {
  for (let varv = 0; varv < 5; varv++) {
    const n = await page.evaluate(() => {
      const stangda = [...document.querySelectorAll('main details:not([open])')];
      for (const d of stangda) d.open = true;
      return stangda.length;
    });
    await page.waitForLoadState('networkidle');
    await klar(page);
    if (!n) break;
  }
}

async function text(page, hash) {
  await ga(page, hash);
  await oppnaAllt(page);
  return page.evaluate(() => document.querySelector('main').innerText.replace(/\n{3,}/g, '\n\n').trim());
}

const lista = (rader) => rader.map(r => `- ${r}`).join('\n');

const { chromium } = require('@playwright/test');
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const filer = [];
let g;
try {
  await ga(page, '#/om');
  g = await page.evaluate(() => fetch('/api/textgranskning').then(r => r.json()));
  for (const s of g.sidor) {
    const delar = [];
    for (const v of s.vyer) delar.push(`## ${v.namn} (${v.hash})\n\n${await text(page, v.hash)}`);
    if (s.id === 'testa') {
      delar.push(`## Uppdragen per testroll\n\n${g.uppdrag.map(r => `### ${r.knapp}\n\n${r.om}\n\n${lista(r.uppdrag.map(u => [u.titel, ...u.text, u.fraga ? `Fråga: ${u.fraga}` : '', u.slut ? `Klart när: ${u.slut}` : ''].filter(Boolean).join(' ')))}`).join('\n\n')}`);
    }
    if (s.id === 'moduler') {
      await ga(page, '#/moduler');
      const lankar = await page.$$eval('.modul .modul-krav a', (a) => a.map(x => ({ modul: x.closest('.modul').dataset.modul, href: x.getAttribute('href'), text: x.closest('.modul-krav').innerText })));
      const rader = [];
      for (const l of lankar) {
        await ga(page, l.href);
        const antal = await page.locator('#sf-antal').innerText().catch(() => '');
        const total = /av (\d+) post/.exec(l.text)?.[1];
        const visar = /Visar (\d+)/.exec(antal)?.[1];
        rader.push(`${l.modul}: ${l.text.replace(/\s*Visa kraven$/, '')} Kravsidan: ${antal}${total && visar && total !== visar ? ' STÄMMER INTE.' : ''}`);
      }
      delar.push(`## Visa kraven för varje modul\n\n${lista(rader)}`);
    }
    const att = g.attGranska.filter(x => x.sidor.includes(s.id));
    const huvud = `# Textgranskning ${g.version}: ${s.namn}\n\nRenderad från ${BAS} ${new Date().toISOString()}.\n\n`
      + `## Att granska i version ${g.version}\n\n${att.length ? lista(att.map(x => `${x.kalla}: ${x.vad}${x.granskad ? ` (senast granskad i ${x.granskad})` : ''}`)) : '- Inget. Alla texter på sidan är granskade i den här versionen.'}\n\n`;
    const fil = join(UT, `${s.id}.md`);
    writeFileSync(fil, `${huvud}${delar.join('\n\n')}\n`);
    filer.push(fil);
  }
} finally {
  await browser.close();
}
console.log(`Textgranskning ${g?.version}: ${g?.attGranska.length ?? 0} texter att granska.`);
for (const f of filer) console.log(f);
