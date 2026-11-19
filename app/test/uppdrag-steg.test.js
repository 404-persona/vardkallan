// Runda 19, r1: vägledningen i alla uppdrag i testinbjudan. Stegen för varje testroll ligger i
// public/js/uppdrag-steg/<testroll>.js med samma form som stegen i första passet (forsta-pass-steg.js). Testet
// kontrollerar att varje uppdrag i TESTROLLER har steg i rätt fil, att varje steg har giltig form och följer
// skrivreglerna, och att svaret som testet av vägledningen skriver i en fråga godtas av servern.
import { describe, test, expect } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { TESTROLLER } from '../src/testinbjudan.js';
import { PASS_STEG } from '../public/js/forsta-pass-steg.js';

const KATALOG = fileURLToPath(new URL('../public/js/uppdrag-steg/', import.meta.url));
// Rollerna vars steg skrivs i en annan del av runda 19 (r2 och r3). Deras filer kommer in vid sammanslagningen, och då
// ska listan vara tom: testet fallerar för en roll som står här men redan har en fil.
const I_ANNAN_DEL = new Set(['sjukskoterska', 'underskoterska', 'barnmorska', 'vardadministrator', 'fysioterapeut', 'systemforvaltare', 'patient']);
// Runda 19, r2: stegen för sjuksköterskan, undersköterskan och barnmorskan finns.
for (const r of ['sjukskoterska', 'underskoterska', 'barnmorska']) I_ANNAN_DEL.delete(r);

const NYCKLAR = new Set(['id', 'text', 'mal', 'hash', 'klar', 'gor', 'nar']);
const MAL_NYCKLAR = new Set(['sel', 'innehaller', 'text', 'rad']);
const KLAR = new Set(['varde', 'andrat', 'valt', 'klickad']);
const GOR_NYCKLAR = new Set(['skriv', 'tangent']);
const TANGENTER = new Set(['Enter', 'Tab', 'Escape', 'ArrowDown', 'ArrowUp', ' ']);

// Skrivreglerna för texter som visas: inga tankstreck, inga ellipser, aldrig "hen", och en hel mening.
function textFel(t) {
  if (typeof t !== 'string' || t.trim().length < 3) return 'texten saknas';
  if (/[—–…]/.test(t) || /\.\.\./.test(t)) return 'tankstreck eller ellips';
  if (/(^|[^a-zåäöA-ZÅÄÖ])hen([^a-zåäöA-ZÅÄÖ]|$)/i.test(t)) return 'ordet hen';
  if (!/[.!?:]$/.test(t.trim())) return 'texten slutar inte med punkt';
  if (/Prova\b/.test(t)) return 'Prova ska vara Pröva';
  return null;
}
function malFel(m, var_) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return `${var_} är inte ett objekt`;
  for (const k of Object.keys(m)) if (!MAL_NYCKLAR.has(k)) return `${var_} har okänd nyckel ${k}`;
  if (typeof m.sel !== 'string' || !m.sel.trim()) return `${var_} saknar sel`;
  if (m.innehaller !== undefined && (typeof m.innehaller !== 'string' || !m.innehaller)) return `${var_} har fel innehaller`;
  if (m.rad !== undefined && (typeof m.rad !== 'string' || !m.rad.trim())) return `${var_} har fel rad`;
  if (m.text !== undefined && textFel(m.text)) return `${var_}: ${textFel(m.text)}`;
  return null;
}
// Alla fel i ett uppdrags steg, som text med stegets id.
export function stegFel(lista, up) {
  const fel = [];
  if (!Array.isArray(lista) || !lista.length) return ['uppdraget saknar steg'];
  const sedda = new Set();
  for (const [i, s] of lista.entries()) {
    const namn = `steg ${s?.id ?? i + 1}`;
    if (!s || typeof s !== 'object') { fel.push(`${namn} är inte ett objekt`); continue; }
    for (const k of Object.keys(s)) if (!NYCKLAR.has(k)) fel.push(`${namn} har okänd nyckel ${k}`);
    if (typeof s.id !== 'string' || !/^[a-z0-9-]+$/.test(s.id)) fel.push(`${namn} har ett id med andra tecken än a till z, siffror och bindestreck`);
    if (sedda.has(s.id)) fel.push(`${namn} finns två gånger`);
    sedda.add(s.id);
    const tf = textFel(s.text);
    if (tf) fel.push(`${namn}: ${tf}`);
    if (!Array.isArray(s.mal) || !s.mal.length) fel.push(`${namn} saknar mal`);
    else s.mal.forEach((m, j) => { const f = malFel(m, `mal ${j + 1}`); if (f) fel.push(`${namn}: ${f}`); });
    if (s.hash !== undefined && (typeof s.hash !== 'string' || !s.hash.startsWith('#/'))) fel.push(`${namn} har en hash som inte börjar med #/`);
    if (s.klar !== undefined && !KLAR.has(s.klar)) fel.push(`${namn} har okänt klar`);
    if (s.nar !== undefined) {
      const lista = [].concat(s.nar);
      if (!lista.length) fel.push(`${namn}: nar är tom`);
      for (const n of lista) { const f = malFel(n, 'nar'); if (f || n?.text !== undefined) fel.push(`${namn}: ${f ?? 'nar har text'}`); }
    }
    if (s.gor !== undefined) {
      if (!s.gor || typeof s.gor !== 'object') fel.push(`${namn} har fel gor`);
      else {
        for (const k of Object.keys(s.gor)) if (!GOR_NYCKLAR.has(k)) fel.push(`${namn} har okänd nyckel gor.${k}`);
        if (s.gor.skriv !== undefined && (typeof s.gor.skriv !== 'string' || !s.gor.skriv)) fel.push(`${namn} har fel gor.skriv`);
        if (s.gor.tangent !== undefined && !TANGENTER.has(s.gor.tangent)) fel.push(`${namn} har okänd tangent`);
      }
    }
    const svarsfalt = Array.isArray(s.mal) && s.mal.some(m => m?.sel === '#tp-svar');
    if (svarsfalt && !up.fraga) fel.push(`${namn} pekar på svarsfältet, men uppdraget har ingen fråga`);
    if (svarsfalt && !s.nar) fel.push(`${namn} pekar på svarsfältet men saknar nar, elementet där svaret står`);
  }
  if (up.fraga) {
    const sist = lista.at(-1);
    if (!sist?.mal?.some?.(m => m?.sel === '#tp-svar')) fel.push('uppdraget har en fråga, men sista steget pekar inte på svarsfältet #tp-svar');
    else if (!sist.gor?.skriv) fel.push('sista steget saknar gor.skriv med svaret');
    else if (!up.ratt(sist.gor.skriv)) fel.push(`svaret "${sist.gor.skriv}" i sista steget godtas inte av servern`);
  }
  return fel;
}

const filFor = (roll) => join(KATALOG, `${roll}.js`);
const lasFil = async (roll) => (await import(pathToFileURL(filFor(roll)).href)).default;

describe('Vägledningen i uppdragen', () => {
  test('varje uppdrag i testinbjudan har steg i filen för sin testroll, och filen har inga andra uppdrag', async () => {
    for (const r of TESTROLLER) {
      if (I_ANNAN_DEL.has(r.id)) { expect(existsSync(filFor(r.id)), `${r.id} har en fil: ta bort rollen ur I_ANNAN_DEL`).toBe(false); continue; }
      expect(existsSync(filFor(r.id)), `uppdrag-steg/${r.id}.js saknas`).toBe(true);
      const alla = await lasFil(r.id);
      expect(alla && typeof alla === 'object', `${r.id} exporterar inte ett objekt`).toBe(true);
      expect(Object.keys(alla).sort()).toEqual(r.uppdrag.map(u => u.id).sort());
    }
  });

  test('varje steg har giltig form, följer skrivreglerna och ger ett svar som servern godtar', async () => {
    const fel = [];
    for (const r of TESTROLLER) {
      if (!existsSync(filFor(r.id))) continue;
      const alla = await lasFil(r.id);
      for (const u of r.uppdrag) for (const f of stegFel(alla[u.id], u)) fel.push(`${r.id} ${u.id}: ${f}`);
    }
    expect(fel).toEqual([]);
  });

  test('stegen i första passet följer samma form', () => {
    const fel = [];
    for (const r of TESTROLLER) {
      const u = { fraga: null };
      for (const f of stegFel(PASS_STEG[r.id], u)) fel.push(`${r.id}: ${f}`);
    }
    expect(fel).toEqual([]);
  });

  test('formkontrollen hittar fel: okänd nyckel, fel id, tankstreck, hen, svarsfält utan nar och ett svar som inte godtas', () => {
    const u = { fraga: 'Vilket värde?', ratt: (s) => s === '0,9' };
    const ok = [{ id: 'meny', text: 'Välj Arbetslistan.', mal: [{ sel: 'a' }] }, { id: 'svar', text: 'Skriv värdet.', nar: { sel: 'td', innehaller: 'PK' }, mal: [{ sel: '#tp-svar' }], gor: { skriv: '0,9', tangent: 'Enter' } }];
    expect(stegFel(ok, u)).toEqual([]);
    expect(stegFel([], u)).toEqual(['uppdraget saknar steg']);
    expect(stegFel([{ ...ok[0], extra: 1 }, ok[1]], u).join()).toContain('okänd nyckel extra');
    expect(stegFel([{ ...ok[0], id: 'Meny 1' }, ok[1]], u).join()).toContain('bindestreck');
    expect(stegFel([{ ...ok[0], text: 'Välj – Arbetslistan.' }, ok[1]], u).join()).toContain('tankstreck');
    expect(stegFel([{ ...ok[0], text: 'Fråga om hen vill.' }, ok[1]], u).join()).toContain('hen');
    expect(stegFel([ok[0], { ...ok[1], nar: undefined }], u).join()).toContain('saknar nar');
    expect(stegFel([ok[0], { ...ok[1], gor: { skriv: '1,2' } }], u).join()).toContain('godtas inte');
    expect(stegFel([ok[0]], u).join()).toContain('sista steget pekar inte på svarsfältet');
    expect(stegFel(ok, { fraga: null }).join()).toContain('ingen fråga');
  });

  test('stegfilerna finns i service workerns lista och hämtas bara för den aktuella rollen', () => {
    const sw = readFileSync(fileURLToPath(new URL('../public/sw.js', import.meta.url)), 'utf8');
    expect(sw).toContain("'/js/uppdrag-steg/hjalp.js'");
    for (const r of TESTROLLER) if (existsSync(filFor(r.id))) expect(sw).toContain(`'/js/uppdrag-steg/${r.id}.js'`);
    const motor = readFileSync(fileURLToPath(new URL('../public/js/forsta-pass.js', import.meta.url)), 'utf8');
    expect(motor).toMatch(/import\(`\.\/uppdrag-steg\/\$\{testroll\}\.js`\)/);
  });
});
