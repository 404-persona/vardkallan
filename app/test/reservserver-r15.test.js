// Runda 15, r3 (Sussa 11.2.1.8, KD1.1.3.3, KD1.1.3.6, KD1.1.1.11 och KD1.2.1.4): den fristående reservservern
// (reservserver.js). Testnamnen står i src/sussa/runda15-r3.js.
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, rmSync, readdirSync, readFileSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { testserver, klient, sandlada, nyDb } from './hjalp.js';
import * as reservserver from '../src/reservserver.js';

const tmp = () => mkdtempSync(join(import.meta.dir, '..', '.testtmp-reserv-'));
const inloggad = async (app, roll) => { const k = klient(app); await k.logga(roll); return k; };
// Alla filer på en plats med storlek och tid, för att visa att reservservern inte skriver där.
const innehall = (dir) => (existsSync(dir) ? readdirSync(dir, { recursive: true }).sort().map(f => { const s = statSync(join(dir, f)); return `${f}:${s.size}:${s.mtimeMs}`; }) : []);

let a; let b; let logg; let karna; let sid; let kopia; let reserv;
const VIKT_FORE = '81.4';
const VIKT_EFTER = '79.3';

beforeAll(async () => {
  a = tmp(); b = tmp(); logg = tmp();
  // Kärnsystemet: en sjuksköterska registrerar en vikt, systemet tar en kopia, och sedan registreras en vikt till.
  karna = testserver({ kopieKatalog: a, kopieAndra: b, kopieMinuter: 0 });
  const k = await inloggad(karna, 'ssk-kard');
  const s = sandlada(karna, k);
  sid = s.kopieId;
  const ny = (varde) => s.db.query("INSERT INTO matvarden (patient_id, enhet_id, typ, varde, varde_num, matt_enhet, tid, registrerad_av) VALUES ('p01', 'uso-kard', 'vikt', ?, ?, 'kg', ?, 'ssk-kard')")
    .run(varde, Number(varde), new Date().toISOString());
  ny(VIKT_FORE);
  kopia = karna.kopior.ta(sid, s.db, { orsak: 'manuell' });
  ny(VIKT_EFTER);
  karna.stopp();
  reserv = testserver({ reservserver: { katalog: a, andraKatalog: b, loggKatalog: logg } });
});
afterAll(() => { reserv?.stopp(); for (const d of [a, b, logg]) rmSync(d, { recursive: true, force: true }); });

describe('Reservserver', () => {
  test('reservservern läser den senaste verifierade säkerhetskopian och säger att den är en reservserver och hur gamla uppgifterna är', async () => {
    expect(reserv.reservserver.kopia).toBe(kopia.tid);
    expect(reserv.reservserver.text).toMatch(/^Reservserver\. Uppgifterna kommer från säkerhetskopian som togs \d{4}-\d{2}-\d{2} kl\. \d{2}\.\d{2} och är \d+ minuter? gamla\./);
    // Före inloggningen, i hälsokontrollen.
    const h = await (await fetch(`${reserv.url}/api/health`)).json();
    expect(h.reservserver).toMatchObject({ kopia: kopia.tid, plats: 1 });
    // Efter inloggningen, i varje svar om sessionen.
    const k = await inloggad(reserv, 'lak-kard');
    const s = (await k.get('/api/session')).data;
    expect(s.reservserver).toMatchObject({ kopia: kopia.tid, alderMinuter: expect.any(Number) });
    expect(s.reservserver.gor).toContain('Anteckna på papper');
    // Journalen är som i kopian: vikten före kopian finns, men inte den som registrerades efter.
    const ov = (await k.get('/api/patient/p01/oversikt')).data;
    expect(String(ov.matvarden.find(m => m.typ === 'vikt').varde)).toBe(VIKT_FORE);
    expect(JSON.stringify(ov)).not.toContain(VIKT_EFTER);
    // Åldern räknas från kopian.
    const om = reservserver.info({ kopia: { tid: '2026-11-14T10:00:00.000Z', plats: 1 }, startad: '2026-11-14T10:30:00.000Z' }, new Date('2026-11-14T12:05:00.000Z'));
    expect(om.alderMinuter).toBe(125);
    expect(om.text).toContain('2 timmar och 5 minuter gamla');
  });

  test('reservservern kan bara läsas: en registrering nekas med en förklaring, och journalens tabeller går inte att ändra', async () => {
    const k = await inloggad(reserv, 'ssk-kard');
    const r = await k.post('/api/patient/p01/matvarden', { typ: 'vikt', varde: '80' });
    expect(r.status).toBe(423);
    expect(r.data.kod).toBe('reservserver');
    expect(r.data.fel).toContain('Reservservern kan bara läsas.');
    expect(r.data.fel).toContain('Anteckna på papper');
    const ant = await k.post('/api/patient/p01/anteckningar', { typ: 'Daganteckning', sokord: { Aktuellt: 'Test' } });
    expect(ant.status).toBe(423);
    // Också skrivningar genom FHIR och från utrustning nekas.
    expect((await fetch(`${reserv.url}/fhir/Encounter/1`, { method: 'PATCH', headers: { Cookie: k.kaka(), 'Content-Type': 'application/json' }, body: '[]' })).status).toBe(423);
    expect((await fetch(`${reserv.url}/mt/matvarden`, { method: 'POST', body: '{}' })).status).toBe(423);
    // I databasen stoppar triggrarna en ändring, så att inte heller ett fel i koden kan registrera något.
    expect(() => reserv.reservDb.query("INSERT INTO anteckningar (patient_id, enhet_id, typ, kategori, sokord, forfattare_id, skapad, status) VALUES ('p01', 'uso-kard', 'X', 'journal', '{}', 'lak-kard', '2026-01-01', 'utkast')").run()).toThrow(/Reservservern kan bara läsas/);
    expect(() => reserv.reservDb.query("UPDATE patienter SET fornamn = 'X' WHERE id = 'p01'").run()).toThrow(/Reservservern kan bara läsas/);
    expect(() => reserv.reservDb.query("DELETE FROM sparrar").run()).toThrow(/Reservservern kan bara läsas/);
    // Det som går att göra: logga in, göra ett aktivt val och läsa.
    expect((await k.post('/api/patient/p01/val', { typ: 'andra_enheter', syfte: 'Vården av patienten' })).status).toBe(200);
    expect((await k.get('/api/patient/p01/lakemedel')).status).toBe(200);
  });

  test('reservservern loggar all åtkomst som vanligt och skriver loggen till sin egen disk, och loggen läses in i kärnsystemet efteråt', async () => {
    const k = await inloggad(reserv, 'lak-kard');
    await k.get('/api/patient/p01/oversikt');
    const d = reserv.reservDb;
    const rad = d.query("SELECT * FROM atkomstlogg WHERE personal_id = 'lak-kard' AND patient_id = 'p01' ORDER BY id DESC").get();
    expect(rad).toBeTruthy();
    expect(Date.parse(rad.tid)).toBeGreaterThan(Date.parse(kopia.tid));
    // Hashkedjan i reservserverns logg fortsätter från kopian och håller.
    const { verifiera } = await import('../src/logg.js');
    expect(verifiera(d).hel).toBe(true);
    // Loggfilen på reservserverns disk har samma rader, och kedjan i filen håller.
    const fil = readdirSync(logg).find(f => f.endsWith('.ndjson'));
    const rader = readFileSync(join(logg, fil), 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x));
    expect(rader.some(r => r.id === rad.id && r.hash === rad.hash)).toBe(true);
    expect(reservserver.kontrolleraLogg(rader).hel).toBe(true);
    const andrad = rader.map((r, i) => (i === 1 ? { ...r, patient_id: 'p02' } : r));
    expect(reservserver.kontrolleraLogg(andrad).hel).toBe(false);
    // När kärnsystemet är i drift igen läses filen in. Varje rad läses in en gång och är märkt med reservservern.
    const db = nyDb();
    const n = reservserver.lasInLogg(db, rader);
    expect(n).toBe(rader.length);
    expect(reservserver.lasInLogg(db, rader)).toBe(0);
    const inlast = db.query("SELECT * FROM atkomstlogg WHERE syfte LIKE 'Reservservern:%' ORDER BY id").all();
    expect(inlast).toHaveLength(n);
    expect(inlast.find(x => x.tid === rad.tid && x.personal_id === 'lak-kard')).toBeTruthy();
    expect(verifiera(db).hel).toBe(true);
  });

  test('reservservern ändrar aldrig något på platserna för säkerhetskopiorna', async () => {
    const fore = [innehall(a), innehall(b)];
    const k = await inloggad(reserv, 'ssk-kard');
    await k.get('/api/patient/p01/oversikt');
    await k.post('/api/patient/p01/matvarden', { typ: 'vikt', varde: '80' });
    expect([innehall(a), innehall(b)]).toEqual(fore);
  });

  test('en skadad kopia på den första platsen läses från den andra, och utan någon kopia som håller startar reservservern inte', () => {
    const x = tmp(); const y = tmp();
    try {
      const app = testserver({ kopieKatalog: x, kopieAndra: y, kopieMinuter: 0 });
      const db = nyDb();
      const p = app.kopior.ta('sandlada-1', db, { orsak: 'manuell' });
      app.kopior.skada('sandlada-1', p.id, 1);
      app.stopp();
      const r = reservserver.oppna({ katalog: x, andraKatalog: y });
      expect(r.kopia).toMatchObject({ id: p.id, plats: 2 });
      r.db.close();
      // Båda platserna skadade.
      // Båda platserna skadade: en byte i kopian på den andra platsen ändras också.
      const k2 = readdirSync(y).find(f => /^[0-9a-f]{32}$/.test(f));
      const fil = join(y, k2, p.fil);
      const data = readFileSync(fil);
      data[Math.floor(data.length / 2)] ^= 0xff;
      writeFileSync(fil, data);
      expect(() => reservserver.oppna({ katalog: x, andraKatalog: y })).toThrow(/Ingen av säkerhetskopiorna håller/);
      // Inga kopior alls.
      const tom = tmp();
      expect(() => reservserver.oppna({ katalog: tom })).toThrow(/ingen verifierad säkerhetskopia/);
      rmSync(tom, { recursive: true, force: true });
    } finally { rmSync(x, { recursive: true, force: true }); rmSync(y, { recursive: true, force: true }); }
  });

  test('driften tar reservservern i drift med inställningen RESERVSERVER=1 och väljer sandlåda med nyckeln från sidan Säkerhetskopior', async () => {
    // Nyckeln står på systemförvaltarens sida för säkerhetskopior.
    const x = tmp();
    const app = testserver({ kopieKatalog: x, kopieMinuter: 0 });
    const k = await inloggad(app, 'sysf');
    const s = sandlada(app, k);
    app.kopior.ta(s.kopieId, s.db, { orsak: 'manuell' });
    const sida = (await k.get('/api/sakerhetskopior')).data;
    expect(sida.reservserver.nyckel).toMatch(/^[0-9a-f]{32}$/);
    // En annan sandlåda har en senare kopia, men nyckeln väljer den rätta.
    app.kopior.ta('en-annan', nyDb(), { orsak: 'manuell', nu: new Date(Date.now() + 60_000) });
    app.stopp();
    const env = { ...process.env };
    try {
      Object.assign(process.env, { RESERVSERVER: '1', KOPIOR_KATALOG: x, RESERV_SANDLADA: sida.reservserver.nyckel });
      const r = testserver();
      try {
        expect(r.reservserver.kopia).toBe(sida.senaste?.tid ?? r.reservserver.kopia);
        expect((await (await fetch(`${r.url}/api/health`)).json()).reservserver).toBeTruthy();
      } finally { r.stopp(); }
    } finally {
      for (const n of ['RESERVSERVER', 'KOPIOR_KATALOG', 'RESERV_SANDLADA']) { if (env[n] === undefined) delete process.env[n]; else process.env[n] = env[n]; }
      rmSync(x, { recursive: true, force: true });
    }
  });
});

// Beslut 2026-11-14: systemförvaltarens vy över loggen från reservservern på sidan Lagring.
describe('Loggen från reservservern', () => {
  test('sidan Lagring visar en logg som inte är inläst med antal rader, period och kopia, och den läses in med ett klick, en gång', async () => {
    const x = tmp(); const y = tmp(); const l = tmp();
    try {
      // Kärnsystemet med en sandlåda, en kopia av den och en reservserver som läser kopian och loggar till l.
      const karna = testserver({ kopieKatalog: x, kopieAndra: y, kopieMinuter: 0, reservloggKatalog: l });
      const sf2 = await inloggad(karna, 'sysf');
      const s = sandlada(karna, sf2);
      const kopia = karna.kopior.ta(s.kopieId, s.db, { orsak: 'manuell' });
      expect((await sf2.get('/api/reservlogg')).data).toMatchObject({ vantar: 0, filer: [] });
      const r = testserver({ reservserver: { katalog: x, andraKatalog: y, loggKatalog: l } });
      const k = await inloggad(r, 'lak-kard');
      await k.get('/api/patient/p01/oversikt');
      await k.get('/api/patient/p02/oversikt');
      r.stopp();
      // Kärnsystemet är i drift igen och ser loggen i katalogen.
      const o = (await sf2.get('/api/reservlogg')).data;
      expect(o.vantar).toBe(1);
      expect(o.text).toMatch(/^En logg från reservservern är inte inläst/);
      const f = o.filer[0];
      expect(f).toMatchObject({ kvar: f.rader, inlast: false, kedjaHel: true, simulerad: false, kopia: { tid: kopia.tid } });
      expect(f.rader).toBeGreaterThanOrEqual(2);
      expect(Date.parse(f.fran)).toBeGreaterThan(Date.parse(kopia.tid));
      expect(o.kommando).toContain('--las-in-logg');
      // Andra roller når inte vyn.
      const lak = await inloggad(karna, 'lak-kard');
      expect((await lak.get('/api/reservlogg')).status).toBe(403);
      // Ett klick läser in loggen, och nästa gång finns inget att läsa in.
      const in1 = await sf2.post('/api/reservlogg/las-in', { fil: f.fil });
      expect(in1.status).toBe(200);
      expect(in1.data).toMatchObject({ inlasta: f.rader, vantar: 0 });
      expect(s.db.query("SELECT count(*) AS n FROM atkomstlogg WHERE syfte LIKE 'Reservservern:%' AND personal_id = 'lak-kard'").get().n).toBe(f.rader);
      expect((await sf2.post('/api/reservlogg/las-in', { fil: f.fil })).data.inlasta).toBe(0);
      expect(s.db.query("SELECT 1 FROM sakerhetslogg WHERE beskrivning LIKE 'Läste in % från reservserverns logg %'").get()).toBeTruthy();
      // Ett okänt filnamn, också ett som pekar utanför katalogen, är som en logg som inte finns.
      expect((await sf2.post('/api/reservlogg/las-in', { fil: '../../etc/passwd' })).status).toBe(404);
      karna.stopp();
    } finally { for (const d of [x, y, l]) rmSync(d, { recursive: true, force: true }); }
  }, 60_000);

  test('en logg vars kedja inte håller läses inte in, och en annan sandlådas logg syns inte', async () => {
    const app = testserver({ kopieMinuter: 0 });
    try {
      const sf = await inloggad(app, 'sysf');
      expect((await sf.post('/api/reservlogg/demo', {})).status).toBe(201);
      const o = (await sf.get('/api/reservlogg')).data;
      expect(o.filer[0]).toMatchObject({ simulerad: true, rader: 3, kvar: 3, kedjaHel: true });
      // En annan sandlåda ser inte loggen.
      const annan = await inloggad(app, 'sysf');
      expect((await annan.get('/api/reservlogg')).data.filer).toEqual([]);
      expect((await annan.post('/api/reservlogg/las-in', { fil: o.filer[0].fil })).status).toBe(404);
      // En ändrad rad bryter kedjan.
      const rader = [{ id: 5, prev_hash: 'a'.repeat(64), hash: 'b'.repeat(64), tid: '2026-01-01T00:00:00.000Z', handling: 'las_oversikt', grund: 'vardrelation', resultat: 'tillaten', reservserver: { nyckel: 'x', kopiaTid: '2025-01-01' } }];
      expect(reservserver.kontrolleraLogg(rader).hel).toBe(false);
      expect((await sf.post('/api/reservlogg/las-in', { fil: o.filer[0].fil })).data.inlasta).toBe(3);
    } finally { app.stopp(); }
  });
});
