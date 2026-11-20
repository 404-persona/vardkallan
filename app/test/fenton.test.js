// Fenton 2025 (fenton.js): z-värde med SD23-korrektionen, storlek för gestationsåldern vid födelsen, vad vyn får och
// mellanhanden mot fentongrowth.ca. Fixturerna är påhittade och uppenbart falska LMS-värden (L 1 eller 0,5, M som
// växer linjärt med jämna tal och S 0,1), aldrig riktiga värden ur Fentons kurvdata. Testet mot den riktiga filen hoppas
// över när FENTON_DATA saknas.
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { byggSeed } from '../src/db.js';
import { Atkomst } from '../src/atkomst.js';
import * as F from '../src/fenton.js';
import * as T from '../src/tillvaxt.js';
import * as bhv from '../src/bhv.js';
import { testserver, klient } from './hjalp.js';

const BAS = new Date('2026-11-08T09:00:00Z');
// Påhittade LMS-rader per dag efter 22+0, från dag 0 till 196.
const falsk = (L, m0, steg) => ({ fran: 0, lms: Array.from({ length: 197 }, (_, d) => [L, m0 + steg * d, 0.1]) });
const FALSK = { format: 'vardkallan-fenton-1', matt: {
  vikt: { K: falsk(0.5, 1000, 20), M: falsk(0.5, 1000, 20) },
  langd: { K: falsk(1, 30, 0.2), M: falsk(1, 30, 0.2) },
  huvudomfang: { K: falsk(1, 20, 0.1), M: falsk(1, 20, 0.1) },
} };
const pers = (db, id) => db.query('SELECT * FROM personal WHERE id = ?').get(id);
const pat = (db, id) => db.query('SELECT * FROM patienter WHERE id = ?').get(id);

describe('Fenton 2025', () => {
  beforeAll(() => F.anvandData(FALSK));
  afterAll(() => F.aterstall());

  test('z-värdet räknas med SD23-korrektionen, SGA och LGA vid födelsen, och vyn får inga LMS-värden eller percentillinjer', () => {
    // L = 1 är normalfördelat, L = 0 lognormalt och annars Box-Cox.
    expect(F.zLms(110, 1, 100, 0.1)).toBeCloseTo(1, 10);
    expect(F.zLms(100 * Math.exp(0.2), 0, 100, 0.1)).toBeCloseTo(2, 10);
    expect(F.zLms(100 * (1 + 0.5 * 0.1 * 2) ** 2, 0.5, 100, 0.1)).toBeCloseTo(2, 10);
    // Över +3 och under -3: avståndet till 3 SD delat med avståndet mellan 2 och 3 SD.
    const vid = (z) => 100 * (1 + 0.5 * 0.1 * z) ** 2;
    expect(F.zLms(vid(3) + (vid(3) - vid(2)) / 2, 0.5, 100, 0.1)).toBeCloseTo(3.5, 10);
    expect(F.zLms(vid(-3) - (vid(-2) - vid(-3)), 0.5, 100, 0.1)).toBeCloseTo(-4, 10);
    expect(F.percentil(0)).toBe(50);
    expect(F.percentil(-1.2816)).toBe(10);
    expect(F.percentil(-3)).toBe(0.1);
    // Dag 30 efter 22+0 är 26+2. Falska M där är 1600 g, 36 cm och 23 cm.
    expect(F.dagVidFodsel(26, 2)).toBe(30);
    expect(F.veckaText(30)).toBe('26+2');
    expect(F.zVarde('vikt', 'man', 30, 1.6)).toBeCloseTo(0, 10);
    expect(F.zVarde('langd', 'kvinna', 30, 36 * 1.1)).toBeCloseTo(1, 10);
    expect(F.zVarde('vikt', 'man', 197, 1.6)).toBeNull();
    // SGA under 10:e percentilen och LGA över 90:e, bara för barn födda till och med vecka 36.
    expect(F.storlek('man', 26, 2, 1.6).klass).toBe('AGA');
    expect(F.storlek('man', 26, 2, 1.2).klass).toBe('SGA');
    expect(F.storlek('man', 26, 2, 2.1).klass).toBe('LGA');
    expect(F.storlek('man', 37, 0, 2.1)).toBeNull();

    // Vyn för pojken i seeden som föddes i vecka 26+2.
    const db = byggSeed(BAS);
    const p = pat(db, bhv.PREMATUR.id);
    const v = bhv.vy(new Atkomst(db, pers(db, 'lak-vc'), p.id, {}, 'las_matvarden'), p, { nu: BAS.getTime() });
    expect(v.fodsel).toMatchObject({ graviditetslangd: 26, graviditetsdagar: 2 });
    expect(v.fenton).toMatchObject({ tillganglig: true, gestationsalder: '26+2', doi: '10.1111/ppe.70035', namn: 'Fenton 2025 Preterm Growth Chart', storlek: { klass: 'SGA' } });
    expect(v.fenton.licens).toContain('CC BY-NC-ND 4.0');
    const vikt = v.fenton.kurvor.find(k => k.matt === 'vikt');
    expect(vikt.punkter[0]).toMatchObject({ dag: 30, vecka: '26+2', kalla: 'fodsel' });
    expect(vikt.punkter.at(-1).dag).toBeLessThanOrEqual(196);
    // Varje punkt har bara barnets värde och resultatet, och inget i svaret är en referenslinje eller en LMS-rad.
    for (const k of v.fenton.kurvor) {
      expect(Object.keys(k).sort()).toEqual(['matt', 'punkter']);
      for (const q of k.punkter) expect(Object.keys(q).sort()).toEqual(['dag', 'kalla', 'percentil', 'tid', 'utanfor', 'varde', 'vecka', 'z']);
    }
    const json = JSON.stringify(v.fenton);
    expect(json).not.toMatch(/"(lms|L|M|S|linjer|percentiler)"/);
    expect(T.ejTillgangliga(true).find(r => r.id === 'prematur').namn).toBe('Prematurkurvor från INTERGROWTH-21st');

    // Utan kurvdata visas förklaringen, som före tillståndet.
    F.anvandData(null);
    const utan = bhv.vy(new Atkomst(db, pers(db, 'lak-vc'), p.id, {}, 'las_matvarden'), p, { nu: BAS.getTime() });
    expect(utan.fenton).toMatchObject({ tillganglig: false });
    expect(utan.fenton.kurvor).toBeUndefined();
    expect(utan.ejTillgangliga.find(r => r.id === 'prematur').namn).toBe('Prematurkurvor (Fenton 2025 och INTERGROWTH-21st)');
    // Ett barn fött i vecka 39 har ingen prematurkurva.
    const ida = pat(db, bhv.BARN.id);
    expect(bhv.vy(new Atkomst(db, pers(db, 'lak-vc'), ida.id, {}, 'las_matvarden'), ida, { nu: BAS.getTime() }).fenton).toBeNull();
    F.anvandData(FALSK);
  });

  test('mellanhanden skickar bara i demon, för testpersonnummer och utan namn och personnummer', async () => {
    const db = byggSeed(BAS);
    const p = pat(db, bhv.PREMATUR.id);
    const demo = { FENTON_API_KEY: 'falsk-nyckel', FENTON_MELLANHAND: 'demo' };
    expect(F.sparr(p, {})).toContain('Nyckeln');
    expect(F.sparr(p, { FENTON_API_KEY: 'x' })).toContain('inte körs som demo');
    expect(F.sparr(p, { FENTON_API_KEY: 'x', FENTON_MELLANHAND: 'skarp' })).toContain('inte körs som demo');
    expect(F.sparr({ ...p, personnummer: '191212121212' }, demo)).toContain('testpersonnummer');
    expect(F.sparr(p, demo)).toBeNull();

    const punkter = { vikt: [{ tid: '2025-04-25T04:10:00Z', varde: 0.89, kalla: 'fodsel' }, { tid: '2025-05-02T08:00:00Z', varde: 0.86 }, { tid: '2025-05-03T08:00:00Z', varde: 9, vantar: true }], langd: [{ tid: '2025-04-25T04:10:00Z', varde: 34.5 }], huvudomfang: [] };
    const { text, antal } = F.csv(p, 26, 2, punkter);
    expect(antal).toBe(2);
    expect(text).toContain('GA at birth:,26 2/7,,');
    expect(text).toContain('Sex:,M,,');
    expect(text).toContain('26 2/7,890,,34.5');
    expect(text).toContain('27 2/7,860,,');
    expect(text).not.toContain(',9000');
    expect(text.split('\n').slice(0, 2)).toEqual(['Title:,,,', 'Number,,,']);
    for (const s of [p.fornamn, p.efternamn, p.personnummer, p.personnummer.slice(2)]) expect(text).not.toContain(s);

    // Tjänsten ersätts av en falsk som svarar som fentongrowth.ca. Loggen har inga mätvärden.
    const anrop = [];
    const loggar = [];
    const info = console.info;
    console.info = (r) => loggar.push(String(r));
    try {
      const hamta = async (url, o = {}) => {
        anrop.push({ url, nyckel: o.headers?.['X-API-Key'], fil: o.body ? await o.body.get('file').text() : null });
        if (url.endsWith('/ClientPlotPoints')) return Response.json({ ok: true, type: 'jpg', filename: 'x.jpg', contentUrl: '/temp/x.jpg' });
        if (url.endsWith('/ClientDownloadCsv')) return new Response('Title: \nDate,GA_weeks,Weight_g,W_Z,W_changeZ,W_%,Head_cm,H_Z,H_changeZ,H_%,Length_cm,L_Z,L_changeZ,L_%\n25-Apr-2025,26.2857,890,-1.000,0.000,16,,~,,,34.50,0.500,0.000,69\n', { headers: { 'content-type': 'text/csv' } });
        return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { headers: { 'content-type': 'image/jpeg' } });
      };
      const r = await F.rita({ patientId: p.id, csvText: text, antal }, { env: demo, hamta });
      expect(r).toMatchObject({ ok: true, bild: 'data:image/jpeg;base64,/9j/2Q==' });
      expect(r.z[0]).toMatchObject({ dag: 30, vikt: -1, langd: 0.5, huvudomfang: null });
      expect(anrop.map(a => a.url)).toEqual(['https://fentongrowth.ca/api/Fenton/ClientPlotPoints', 'https://fentongrowth.ca/api/Fenton/ClientDownloadCsv', 'https://fentongrowth.ca/temp/x.jpg']);
      expect(anrop[0].nyckel).toBe('falsk-nyckel');
      expect(anrop[0].fil).toBe(text);
      // En bild på en annan adress hämtas inte, och en tjänst som inte svarar stoppas av tidsgränsen.
      const annan = await F.rita({ patientId: p.id, csvText: text, antal }, { env: demo, hamta: async (url) => (url.endsWith('/ClientPlotPoints') ? Response.json({ ok: true, contentUrl: 'https://example.org/x.jpg' }) : new Response('')) });
      expect(annan.ok).toBe(false);
      const t0 = Date.now();
      const tyst = await F.rita({ patientId: p.id, csvText: text, antal }, { env: demo, tidsgrans: 50, hamta: (url, o) => new Promise((_, nej) => o.signal.addEventListener('abort', () => nej(o.signal.reason))) });
      expect(tyst).toMatchObject({ ok: false });
      expect(tyst.text).toContain('svarade inte i tid');
      expect(Date.now() - t0).toBeLessThan(2000);
    } finally { console.info = info; }
    expect(loggar.length).toBe(3);
    for (const l of loggar) { expect(l).not.toMatch(/890|860|34\.5|falsk-nyckel|Lund|202504252392/); expect(l).toContain('p62'); }
  });

  test('en sandlåda från före Fentons kurva får uppgiften graviditetsdagar, och raderna och skyddet mot ändringar finns kvar', () => {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE tillvaxt_uppgifter (id INTEGER PRIMARY KEY, patient_id TEXT NOT NULL, enhet_id TEXT NOT NULL, typ TEXT NOT NULL, varde REAL NOT NULL, tid TEXT NOT NULL,
      registrerad_av TEXT, registrerad TEXT NOT NULL, CHECK (typ IN ('graviditetslangd', 'fodelsevikt', 'fodelselangd', 'fodelse_huvudomfang', 'langd_mor', 'langd_far', 'tb_risk')))`);
    db.exec("INSERT INTO tillvaxt_uppgifter VALUES (7, 'p1', 'e1', 'graviditetslangd', 30, '2025-01-01', 'x', '2025-01-01')");
    bhv.sakraSchema(db);
    db.exec("INSERT INTO tillvaxt_uppgifter (patient_id, enhet_id, typ, varde, tid, registrerad) VALUES ('p1', 'e1', 'graviditetsdagar', 3, '2025-01-01', '2025-01-01')");
    expect(db.query('SELECT id, typ, varde FROM tillvaxt_uppgifter ORDER BY id').all()).toEqual([{ id: 7, typ: 'graviditetslangd', varde: 30 }, { id: 8, typ: 'graviditetsdagar', varde: 3 }]);
    expect(() => db.exec('UPDATE tillvaxt_uppgifter SET varde = 31 WHERE id = 7')).toThrow('ändras inte');
    expect(() => db.exec('DELETE FROM tillvaxt_uppgifter')).toThrow('raderas inte');
    bhv.sakraSchema(db);
    expect(db.query("SELECT count(*) AS n FROM sqlite_master WHERE name = 'tillvaxt_uppgifter_fore_fenton'").get().n).toBe(0);
  });

  describe('API', () => {
    let app;
    beforeAll(() => { app = testserver(); });
    afterAll(() => app.stopp());
    test('tillväxtvyn har prematurkurvan, och mellanhanden är avstängd utan nyckel och utan demoläge', async () => {
      const k = klient(app);
      await k.logga('lak-vc');
      const d = (await k.get(`/api/patient/${bhv.PREMATUR.id}/tillvaxt`)).data;
      expect(d.fenton.tillganglig).toBe(true);
      const spara = { nyckel: process.env.FENTON_API_KEY, lage: process.env.FENTON_MELLANHAND };
      delete process.env.FENTON_API_KEY;
      delete process.env.FENTON_MELLANHAND;
      try {
        expect((await k.get(`/api/patient/${bhv.PREMATUR.id}/tillvaxt`)).data.fenton.mellanhand.aktiv).toBe(false);
        const r = await k.post(`/api/patient/${bhv.PREMATUR.id}/tillvaxt/fenton`, {});
        expect(r.status).toBe(403);
        process.env.FENTON_API_KEY = 'falsk-nyckel';
        expect((await k.post(`/api/patient/${bhv.PREMATUR.id}/tillvaxt/fenton`, {})).status).toBe(403);
        process.env.FENTON_MELLANHAND = 'demo';
        // Ett barn som inte är fött före vecka 37 skickas aldrig.
        expect((await k.post(`/api/patient/${bhv.BARN.id}/tillvaxt/fenton`, {})).status).toBe(400);
      } finally {
        for (const [n, v] of [['FENTON_API_KEY', spara.nyckel], ['FENTON_MELLANHAND', spara.lage]]) { if (v == null) delete process.env[n]; else process.env[n] = v; }
      }
    });
  });

  // Mot den riktiga datafilen, bara lokalt. Testet säger inget om värdena i filen, bara att den läses och ger rimliga
  // resultat för pojken i seeden.
  test.skipIf(!process.env.FENTON_DATA)('den riktiga datafilen läses och ger z-värden för pojken i seeden', () => {
    F.aterstall();
    expect(F.ladda(process.env.FENTON_DATA)).toBe(true);
    const db = byggSeed(BAS);
    const p = pat(db, bhv.PREMATUR.id);
    const v = bhv.vy(new Atkomst(db, pers(db, 'lak-vc'), p.id, {}, 'las_matvarden'), p, { nu: BAS.getTime() });
    expect(v.fenton.tillganglig).toBe(true);
    expect(['SGA', 'AGA', 'LGA']).toContain(v.fenton.storlek.klass);
    for (const k of v.fenton.kurvor) {
      expect(k.punkter.length).toBeGreaterThan(3);
      for (const q of k.punkter) { expect(Number.isFinite(q.z)).toBe(true); expect(Math.abs(q.z)).toBeLessThan(6); }
    }
    // Ett större värde ger ett större z-värde, och korrektionen vid 3 SD gör inget hopp.
    const z = [0.5, 0.7, 0.9, 1.1, 1.3].map(x => F.zVarde('vikt', 'man', 30, x));
    expect(z.every((v, i) => i === 0 || v > z[i - 1])).toBe(true);
    let forra = null;
    for (let x = 0.2; x < 2.5; x += 0.001) { const zz = F.zVarde('vikt', 'man', 30, x); if (forra != null) expect(zz - forra).toBeLessThan(0.05); forra = zz; }
    F.anvandData(FALSK);
  });
});
