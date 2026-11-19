// Runda 18, r4: texterna på de publika sidorna #/testa, #/om, #/krav och #/moduler granskas vid varje version
// (src/textgranskning.js). Testerna stoppar bygget när en text inte är granskad i den aktuella versionen, när en text
// är ny eller ändrad sedan granskningen, och när ett handskrivet tal inte stämmer med det som koden räknar fram.
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { testserver, klient } from './hjalp.js';
import { KANDA_BEGRANSNINGAR } from '../public/js/kanda-begransningar.js';
import { TESTFALL } from '../src/sussa-testfall.js';
import { TESTROLLER } from '../src/testinbjudan.js';
import { MODULER } from '../src/moduler.js';
import { SANDLADA_TIMMAR } from '../src/sandlada-livslangd.js';
import { SPEC, MISSADE_RATTELSER, MAPPNING } from '../src/sussa/index.js';
import { RATTELSER, rattaTexter } from '../src/sussa/runda18-r4.js';
import {
  SIDOR, kallor, granska, attGranska, aktuellVersion, fakta, kontrolleraTal, hashFor, FORBJUDNA_ORD,
} from '../src/textgranskning.js';

const APP = join(import.meta.dir, '..');
const paketversion = JSON.parse(readFileSync(join(APP, 'package.json'), 'utf8')).version;

let app;
beforeAll(() => { app = testserver(); });
afterAll(() => app.stopp());

describe('Textgranskning', () => {
  test('versionen som texterna granskas mot är major och minor ur package.json', () => {
    expect(aktuellVersion()).toBe(paketversion.split('.').slice(0, 2).join('.'));
  });

  test('de fyra sidorna har var sin källa med texter, och varje källa hör till en av sidorna', () => {
    expect(SIDOR.map(s => s.id)).toEqual(['testa', 'om', 'krav', 'moduler']);
    const k = kallor();
    for (const s of SIDOR) expect(k.some(x => x.sidor.includes(s.id))).toBe(true);
    for (const x of k) {
      expect(x.texter.length).toBeGreaterThan(0);
      for (const sida of x.sidor) expect(SIDOR.map(s => s.id)).toContain(sida);
    }
  });

  test('varje post i kända begränsningar är granskad i den aktuella versionen', () => {
    const v = aktuellVersion();
    const gamla = KANDA_BEGRANSNINGAR.filter(b => b.granskad !== v).map(b => `${b.rubrik} (granskad ${b.granskad ?? 'aldrig'})`);
    if (gamla.length) throw new Error(`Pröva de här kända begränsningarna för version ${v} och sätt granskad: '${v}': ${gamla.join('; ')}`);
    for (const b of KANDA_BEGRANSNINGAR) {
      expect(b.rubrik.length).toBeGreaterThan(5);
      expect(b.text).toMatch(/\.$/);
    }
  });

  test('alla handskrivna texter på de fyra sidorna är granskade i den aktuella versionen och oförändrade sedan dess', () => {
    const g = granska();
    if (g.fel.length) throw new Error(`Texterna ska granskas för version ${g.version}. Läs dem med scripts/textgranskning.js och uppdatera src/textgranskning-granskade.js:\n${g.fel.join('\n')}`);
    expect(attGranska()).toEqual([]);
  });

  test('granskningen stoppar en källa som är granskad i en äldre version, en ny text och en källa som saknas', () => {
    const k = [{ id: 'prov', sidor: ['om'], namn: 'Prov', texter: ['En text som är granskad.', 'En ny text.'] }, { id: 'ny', sidor: ['om'], namn: 'Ny', texter: ['Något nytt.'] }];
    const reg = { prov: { granskad: '1.7', texter: hashFor('En text som är granskad.') } };
    const g = granska({ version: '1.8', kallor: k, granskade: reg, begransningar: [] });
    expect(g.fel.join('\n')).toContain('Prov är granskad i 1.7');
    expect(g.fel.join('\n')).toContain('Ny eller ändrad text i Prov');
    expect(g.fel.join('\n')).toContain('En ny text.');
    expect(g.fel.join('\n')).toContain('Ny är inte granskad');
    const ok = granska({ version: '1.8', kallor: [k[0]], granskade: { prov: { granskad: '1.8', texter: `${hashFor('En text som är granskad.')} ${hashFor('En ny text.')}` } }, begransningar: [] });
    expect(ok.fel).toEqual([]);
    // En begränsning utan granskad eller med en äldre version kommer med i listan.
    const b = granska({ version: '1.8', kallor: [], granskade: {}, begransningar: [{ rubrik: 'A', text: 'A.', granskad: '1.8' }, { rubrik: 'B', text: 'B.', granskad: '1.7' }, { rubrik: 'C', text: 'C.' }] });
    expect(b.att.map(x => x.vad)).toEqual(['B', 'C']);
  });

  test('fakta räknas ur koden: Sussas testfall och poster, sandlådans livslängd, testrollerna och uppdragen', () => {
    const f = fakta();
    expect(f.sussaTestfall).toBe(TESTFALL.length);
    expect(f.sussaPoster).toBe(SPEC.poster.length);
    expect(f.sandladaTimmar).toBe(SANDLADA_TIMMAR);
    expect(f.testroller).toBe(TESTROLLER.length);
    expect(f.uppdrag).toBe(TESTROLLER.reduce((n, r) => n + r.uppdrag.length, 0));
    expect(f.moduler).toBe(MODULER.length);
  });

  test('handskrivna tal i de fyra sidornas texter stämmer med källan, och ett okänt tal stoppar bygget', () => {
    const fel = kontrolleraTal(kallor().flatMap(k => k.texter.map(t => ({ kalla: k.namn, text: t }))));
    if (fel.length) throw new Error(`Tal som inte stämmer eller inte är kontrollerade:\n${fel.join('\n')}`);
    const f = { ...fakta(), sussaTestfall: 34, sandladaTimmar: 8, sussaPoster: 389 };
    expect(kontrolleraTal([{ kalla: 'Prov', text: 'Uppdragen följer de 33 testfall som regionerna använde.' }], f).join()).toContain('33');
    expect(kontrolleraTal([{ kalla: 'Prov', text: 'Den försvinner efter sju timmar.' }], f).join()).toContain('sju timmar');
    expect(kontrolleraTal([{ kalla: 'Prov', text: 'En lista med 390 krav.' }], f).join()).toContain('390');
    expect(kontrolleraTal([{ kalla: 'Prov', text: 'Det finns 12 roller i demon.' }], f).join()).toContain('12 roller');
    // Tal som inte är fakta om systemet, som doser och steg, kontrolleras inte.
    expect(kontrolleraTal([{ kalla: 'Prov', text: 'Ge Alvedon 1 g i 6 dagar, sju steg.' }], f)).toEqual([]);
    expect(kontrolleraTal([{ kalla: 'Prov', text: 'Uppdragen följer de 34 testfall som regionerna använde, och sandlådan försvinner efter åtta timmar.' }], f)).toEqual([]);
  });

  test('texterna på de fyra sidorna har inga tankstreck, ellipser eller ordet hen', () => {
    const fel = [];
    for (const k of kallor()) for (const t of k.texter) if (FORBJUDNA_ORD.test(t)) fel.push(`${k.namn}: ${t.slice(0, 120)}`);
    for (const b of KANDA_BEGRANSNINGAR) if (FORBJUDNA_ORD.test(`${b.rubrik} ${b.text}`)) fel.push(`Kända begränsningar: ${b.rubrik}`);
    expect(fel).toEqual([]);
  });

  test('GET /api/krav/version har fakta som räknas ur koden, och GET /api/textgranskning listar inget att granska', async () => {
    const k = klient(app);
    const v = await k.get('/api/krav/version');
    expect(v.status).toBe(200);
    expect(v.data.fakta).toEqual(fakta());
    const t = await k.get('/api/textgranskning');
    expect(t.status).toBe(200);
    expect(t.data.version).toBe(aktuellVersion());
    expect(t.data.attGranska).toEqual([]);
    expect(t.data.sidor.map(s => s.id)).toEqual(SIDOR.map(s => s.id));
    // Uppdragens texter syns först efter inloggningen och följer därför med i svaret, utan något ur en sandlåda.
    expect(t.data.uppdrag.length).toBe(TESTROLLER.length);
    expect(JSON.stringify(t.data)).not.toMatch(/"(patient_id|personnummer)"/);
  });

  test('rättelserna av inaktuella texter på kravsidan hittar sina meningar, och en rättelse som inte hittar sin mening syns', () => {
    expect(MISSADE_RATTELSER).toEqual([]);
    for (const r of RATTELSER) for (const id of r.ids) {
      const m = MAPPNING.find(x => x.id === id);
      expect(m[r.falt]).toContain(r.efter);
      expect(m[r.falt]).not.toContain(r.fore);
    }
    expect(rattaTexter([{ id: '2.3.1.4', anmarkning: 'En annan text.' }]).length).toBeGreaterThan(0);
  });

  test('modulsidan: en offentlig sida nås med sitt eget namn, och modulen Testinbjudan och synpunkter nämner varje sida en gång', async () => {
    const r = await klient(app).get('/api/moduler');
    const ti = r.data.moduler.find(m => m.id === 'testinbjudan');
    const offentliga = ti.rutter.filter(x => x.offentlig && !x.meny);
    expect(offentliga.map(x => x.namn)).toEqual(['Testa Vårdkällan', 'Om demon och testet', 'Synpunkter och jämförelser']);
    for (const m of r.data.moduler) for (const x of m.rutter.filter(y => y.finns && y.offentlig && !y.meny && !y.vag.includes(':'))) expect(x.namn).toBeTruthy();
    expect(ti.beskrivning).toContain(`${TESTFALL.length} testfall`);
    expect(ti.beskrivning).not.toMatch(/\bhen\b/);
  });
});
