// Säkerhetsgranskningen efter sammanslagningen av runda 15 (r3, r5, r4 och r1). Varje test prövar ett fynd och skrevs
// rött innan felet rättades.
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { datumAv } from '../src/db.js';
import { join } from 'node:path';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { testserver, klient, sandlada, nyDb, atk } from './hjalp.js';
import * as underlag from '../src/anteckningsunderlag.js';
import * as journal from '../src/journal.js';
import * as undantagMod from '../src/undantag.js';
import * as ff from '../src/flerfaktor.js';
import * as idp from '../src/idp.js';
import * as tillit from '../src/tillitsniva.js';
import * as mellanarkiv from '../src/mellanarkiv.js';
import * as sam from '../src/samtycke-nationellt.js';
import * as eiMod from '../src/engagemangsindex.js';
import * as arkivMod from '../src/arkiv.js';
import * as nat from '../src/rivta/nationella.js';
import { Atkomst as AtkomstKlass } from '../src/atkomst.js';
import * as makuleringMod from '../src/vardkontakt-makulering.js';
import * as konfiguration from '../src/konfiguration.js';
import * as reservserver from '../src/reservserver.js';
import { hashFor } from '../src/logg.js';
import { personal } from './hjalp.js';

let app;
beforeAll(() => { app = testserver(); });
afterAll(() => app.stopp());

const inloggad = async (roll) => { const k = klient(app); await k.logga(roll); return k; };

describe('Säkerhetsgranskningen efter runda 15: anteckningsvyn', () => {
  test('utkastet röjer inte vilka anteckningar en patient har: samma svar för ett id som finns och ett som inte finns', async () => {
    const k = await inloggad('lak-psyk');
    const db = sandlada(app, k).db;
    const finns = db.query('SELECT id FROM anteckningar WHERE patient_id = ? ORDER BY id LIMIT 1').get('p01').id;
    const saknas = db.query('SELECT MAX(id) + 1000 AS id FROM anteckningar').get().id;
    const a = await k.put('/api/patient/p01/anteckningsutkast', { anteckningId: finns });
    const b = await k.put('/api/patient/p01/anteckningsutkast', { anteckningId: saknas });
    expect([a.status, a.data]).toEqual([b.status, b.data]);
    // Också med en typ, och för borttagningen.
    const c = await k.put('/api/patient/p01/anteckningsutkast', { anteckningId: finns, typ: 'Daganteckning', sokord: [{ sokord: 'Aktuellt', text: 'x' }] });
    const d = await k.put('/api/patient/p01/anteckningsutkast', { anteckningId: saknas, typ: 'Daganteckning', sokord: [{ sokord: 'Aktuellt', text: 'x' }] });
    expect([c.status, c.data]).toEqual([d.status, d.data]);
    const e = await k.raw('DELETE', `/api/patient/p01/anteckningsutkast/${finns}`);
    const f = await k.raw('DELETE', `/api/patient/p01/anteckningsutkast/${saknas}`);
    expect([e.status, e.data]).toEqual([f.status, f.data]);
  });

  test('undersköterskan hämtar mallen för sin observationsanteckning, sparar och tar bort sitt utkast, och loggas med sin egen handling', async () => {
    const k = await inloggad('usk-kard');
    const m = await k.get('/api/patient/p04/anteckningsmall?typ=Observationsanteckning');
    expect(m.status).toBe(200);
    const u = await k.put('/api/patient/p04/anteckningsutkast', { typ: 'Observationsanteckning', sokord: [{ sokord: 'Observation', text: 'Pigg och vaken.' }] });
    expect(u.status).toBe(200);
    const db = sandlada(app, k).db;
    const rad = db.query("SELECT handling FROM atkomstlogg WHERE personal_id = 'usk-kard' AND patient_id = 'p04' ORDER BY id DESC LIMIT 1").get();
    expect(rad.handling).toBe('skriv_observation');
    const t = await k.raw('DELETE', `/api/patient/p04/anteckningsutkast/${u.data.id}`);
    expect(t.status).toBe(200);
    // En mall som yrket inte skriver med hämtas inte.
    expect((await k.get('/api/patient/p04/anteckningsmall?typ=Omvårdnadsanteckning')).status).toBe(404);
  });

  test('mallen hämtas bara för en mall som yrket skriver med', async () => {
    const k = await inloggad('fys-kard');
    expect((await k.get('/api/patient/p01/anteckningsmall?typ=Omvårdnadsanteckning')).status).toBe(404);
    expect((await k.get('/api/patient/p01/anteckningsmall?typ=Fysioterapianteckning')).status).toBe(200);
  });

  test('en egen fras med ett personnummer stoppas också med mellanslag eller tankstreck', async () => {
    const k = await inloggad('lak-kard');
    for (const pnr of ['19121212 1212', '121212 1212', '121212\u20131212', '19121212-1212']) {
      expect([pnr, (await k.post('/api/egna-fraser', { kort: 'prov', text: `Patienten ${pnr} mår bra.` })).status]).toEqual([pnr, 400]);
    }
  });

  test('en referens i FHIR följer undantagen från FHIR för resursen den pekar på', () => {
    const d = nyDb();
    const a = atk(d, 'lak-kard', 'p01');
    const m = journal.synligaMatvarden(a)[0];
    const s = { sokord: 'Status', text: 'x', referenser: [{ typ: 'matvarde', id: m.id, text: 'x' }] };
    expect(underlag.fhirEntries(a, s).map(e => e.reference)).toEqual([`Observation/${m.id}`]);
    const nu = new Date();
    // Svenskt datum, som i undantag-r12.test.js, så att testet håller också mellan 00 och 01.
    const giltig = datumAv(nu);
    const { andring } = undantagMod.foresla(d, personal(d, 'sysf'), { omfang: 'matvarde', varde: m.typ, kanaler: ['fhir'], giltigFran: giltig, motivering: 'Prov efter granskningen.' }, nu);
    undantagMod.godkann(d, personal(d, 'sysf-2'), andring.id, {}, nu);
    expect(underlag.fhirEntries(atk(d, 'lak-kard', 'p01'), s)).toEqual([]);
  });

  test('en kontakt som systemet skapade för ett utkast ger ingen vårdrelation, och den tas bort med utkastet', async () => {
    const k = await inloggad('lak-kard');
    const db = sandlada(app, k).db;
    // Ett telefonsamtal som ny kontakt: systemet skapar en automatisk kontakt för utkastet.
    const fore = db.query('SELECT coalesce(max(id), 0) AS m FROM vardkontakter').get().m;
    const r = await k.put('/api/patient/p01/anteckningsutkast', { typ: 'Daganteckning', sokord: [{ sokord: 'Aktuellt', text: 'Prov av utkast.' }], nyKontakt: { kontaktsatt: 'telefon' } });
    expect(r.status).toBe(200);
    const kontakt = db.query('SELECT vardkontakt_id AS v FROM anteckningar WHERE id = ?').get(r.data.id).v;
    expect(kontakt).toBeGreaterThan(fore);
    const hittad = { pid: 'p01', id: r.data.id, kontakt };
    expect(db.query('SELECT automatisk, ger_vardrelation FROM vardkontakter WHERE id = ?').get(hittad.kontakt)).toEqual({ automatisk: 1, ger_vardrelation: 0 });
    expect((await k.raw('DELETE', `/api/patient/${hittad.pid}/anteckningsutkast/${hittad.id}`)).status).toBe(200);
    expect(db.query('SELECT 1 FROM vardkontakter WHERE id = ?').get(hittad.kontakt)).toBeNull();
  });

  test('referensprövningen räknar de synliga raderna en gång per anrop, och tar högst ett tak av referenser per anteckning', () => {
    const db = nyDb();
    const a = atk(db, 'lak-kard', 'p01');
    const m = journal.synligaMatvarden(a)[0];
    const text = underlag.referensText(a, 'matvarde', m.id);
    expect(text).toBeTruthy();
    let anrop = 0;
    const filtrera = a.filtrera.bind(a);
    a.filtrera = (...x) => { anrop++; return filtrera(...x); };
    const sokord = Array.from({ length: 30 }, (_, i) => ({ sokord: `S${i}`, text: `Värde: ${text}`, referenser: Array.from({ length: 30 }, () => ({ typ: 'matvarde', id: m.id, text })) }));
    const ut = underlag.provaReferenser(a, sokord);
    expect(anrop).toBeLessThanOrEqual(3);
    const antal = ut.reduce((s, x) => s + (x.referenser?.length ?? 0), 0);
    expect(antal).toBeGreaterThan(0);
    expect(antal).toBeLessThanOrEqual(underlag.MAX_REFERENSER_TOTALT);
  });
});

describe('Säkerhetsgranskningen efter runda 15: tillitsnivån', () => {
  test('under tillitsnivå 3 kan den som saknar faktor inte registrera en egen andra faktor och få behörighet med bara den första', async () => {
    const k = klient(app);
    const r = await k.post('/api/login', { personalId: 'ssk-kard', tillitsniva: 2 });
    expect(r.status).toBe(403);
    expect(r.data.kod).toBe('kraver_tillitsniva');
    expect(r.data.fel).toContain('tillitsnivå 3');
    expect((await k.post('/api/flerfaktor/totp/borja')).status).toBe(401);
    expect((await k.get('/api/patient/p01')).status).toBe(401);
    // Invånaren likadant.
    const i = klient(app);
    const ri = await i.post('/api/login/invanare', { invanareId: 'inv-p01', tillitsniva: 2 });
    expect(ri.status).toBe(403);
    expect(ri.data.kod).toBe('kraver_tillitsniva');
    expect((await i.post('/api/flerfaktor/totp/borja')).status).toBe(401);
  });

  test('en faktor som registrerades efter en inloggning med tillitsnivå 3 bekräftar en senare inloggning med tillitsnivå 2', async () => {
    const k = klient(app);
    await k.logga('lak-kard');
    const b = (await k.post('/api/flerfaktor/totp/borja')).data;
    const h = ff.fran32(b.nyckel);
    expect((await k.post('/api/flerfaktor/totp', { kod: ff.totp(h, Date.now()) })).status).toBe(201);
    await k.post('/api/logout');
    const r = await k.post('/api/login', { personalId: 'lak-kard', tillitsniva: 2 });
    expect(r.status).toBe(200);
    expect(r.data.inloggad).toBe(false);
    expect(r.data.flerfaktor.metoder).toEqual(['totp']);
    expect(r.data.flerfaktor.registrera).toBeUndefined();
    const s = await k.post('/api/login/flerfaktor', { typ: 'totp', kod: ff.totp(h, Date.now() + 30_000) });
    expect(s.status).toBe(200);
    expect(s.data.inloggad).toBe(true);
  });

  test('en sparad session från en version före biljetterna räknas inte som flerfaktor', () => {
    const db = nyDb();
    const p = db.query("SELECT * FROM personal WHERE id = 'lak-kard'").get();
    const u = idp.uppdragForGammalSession(db, p);
    expect(u.personHsaId).toBe(p.hsa_id);
    expect(tillit.forUppdrag(u).flerfaktor).toBe(false);
  });
});

describe('Säkerhetsgranskningen efter runda 15: mellanarkivet', () => {
  const overfor = (d) => {
    const b = d.query(`INSERT INTO arkivbeslut (typ, beslutsfattare, diarienummer, beslutsdatum, lagrum, omfattning, registrerad, registrerad_av)
      VALUES ('leverans', 'Vårdgivarens arkivansvarige', 'RS 2026-799', '2026-11-14', 'Arkivlagen', ?, '2026-11-14', 'ark') RETURNING id`).get(JSON.stringify({ urval: 'mellanarkiv', ar: 5, fore: '2016-01-01' })).id;
    return mellanarkiv.overfor(d, personal(d, 'ark'), d.query('SELECT * FROM arkivbeslut WHERE id = ?').get(b)).resultat;
  };
  test('ett id återanvänds aldrig efter en överföring, och vyn får inga dubbla id', () => {
    const d = nyDb();
    // En migrerad anteckning från 2012 som läses in sist och därför har det högsta id:t.
    const gammal = Number(d.query(`INSERT INTO anteckningar (patient_id, enhet_id, typ, kategori, sokord, forfattare_id, skapad, status, signerad_tid, signerad_av, version, kalla)
      VALUES ('p02', 'vc-tybble', 'Mottagningsanteckning', 'lakare', '[{"sokord":"Aktuellt","text":"Migrerad 2012."}]', 'lak-vc', '2012-03-01T10:00:00.000Z', 'signerad', '2012-03-01T10:00:00.000Z', 'lak-vc', 1, 'migrerad') RETURNING id`).get().id);
    overfor(d);
    expect(d.query('SELECT id FROM anteckningar WHERE id = ?').get(gammal)).toBeNull();
    const ny = Number(d.query(`INSERT INTO anteckningar (patient_id, enhet_id, typ, kategori, sokord, forfattare_id, skapad, status, version, kalla)
      VALUES ('p03', 'uso-kard', 'Daganteckning', 'lakare', '[{"sokord":"Aktuellt","text":"Ny."}]', 'lak-kard', '2026-11-14T10:00:00.000Z', 'utkast', 1, 'vardkallan') RETURNING id`).get().id);
    expect(ny).toBeGreaterThan(gammal);
    const v = mellanarkiv.vy(d, 'anteckningar');
    expect(d.query(`SELECT id, count(*) AS n FROM ${v} GROUP BY id HAVING n > 1`).all()).toEqual([]);
    // Räknaren hålls över det högsta id:t i mellanarkivet också när den har blivit lägre, som efter en återföring.
    d.query("UPDATE sqlite_sequence SET seq = 1 WHERE name = 'anteckningar'").run();
    mellanarkiv.hojIdGolv(d);
    expect(d.query("SELECT seq FROM sqlite_sequence WHERE name = 'anteckningar'").get().seq).toBeGreaterThanOrEqual(gammal);
  });

  // Som en sandlåda från version 1.4: tabellen byggs om utan AUTOINCREMENT.
  const utanAutoinkrement = (d, tabell) => {
    const sql = d.query("SELECT sql FROM sqlite_master WHERE name = ?").get(tabell).sql.replace(/AUTOINCREMENT/i, '');
    const extra = d.query("SELECT sql FROM sqlite_master WHERE type IN ('trigger', 'index') AND tbl_name = ? AND sql IS NOT NULL").all(tabell).map(x => x.sql);
    d.exec('PRAGMA foreign_keys = OFF; PRAGMA legacy_alter_table = ON;');
    d.transaction(() => {
      d.exec(`ALTER TABLE ${tabell} RENAME TO ${tabell}_r14`);
      d.exec(sql);
      d.exec(`INSERT INTO ${tabell} SELECT * FROM ${tabell}_r14`);
      d.exec(`DROP TABLE ${tabell}_r14`);
      for (const s of extra) d.exec(s);
    })();
    d.exec('PRAGMA legacy_alter_table = OFF;');
  };
  test('en sandlåda med tabeller utan AUTOINCREMENT byggs om, så att ett id inte återanvänds efter en överföring eller en gallring', () => {
    const d = nyDb();
    utanAutoinkrement(d, 'anteckningar');
    utanAutoinkrement(d, 'matvarden');
    const raderFore = d.query('SELECT count(*) AS n FROM anteckningar').get().n;
    const gammal = Number(d.query(`INSERT INTO anteckningar (patient_id, enhet_id, typ, kategori, sokord, forfattare_id, skapad, status, signerad_tid, signerad_av, version, kalla)
      VALUES ('p02', 'vc-tybble', 'Mottagningsanteckning', 'lakare', '[{"sokord":"Aktuellt","text":"Migrerad 2012."}]', 'lak-vc', '2012-03-01T10:00:00.000Z', 'signerad', '2012-03-01T10:00:00.000Z', 'lak-vc', 1, 'migrerad') RETURNING id`).get().id);
    overfor(d);
    expect(d.query("SELECT sql FROM sqlite_master WHERE name = 'anteckningar'").get().sql).toMatch(/AUTOINCREMENT/);
    expect(d.query("SELECT count(*) AS n FROM sqlite_master WHERE tbl_name = 'anteckningar' AND type = 'trigger'").get().n).toBeGreaterThan(0);
    expect(d.query('SELECT id FROM anteckningar WHERE id = ?').get(gammal)).toBeNull();
    expect(d.query('SELECT count(*) AS n FROM anteckningar').get().n).toBeLessThanOrEqual(raderFore);
    const ny = Number(d.query(`INSERT INTO anteckningar (patient_id, enhet_id, typ, kategori, sokord, forfattare_id, skapad, status, version, kalla)
      VALUES ('p03', 'uso-kard', 'Daganteckning', 'lakare', '[{"sokord":"Aktuellt","text":"Ny."}]', 'lak-kard', '2026-11-14T10:00:00.000Z', 'utkast', 1, 'vardkallan') RETURNING id`).get().id);
    expect(ny).toBeGreaterThan(gammal);
    const v = mellanarkiv.vy(d, 'anteckningar');
    expect(d.query(`SELECT id, count(*) AS n FROM ${v} GROUP BY id HAVING n > 1`).all()).toEqual([]);
    // Gallringen: raden med det högsta id:t tas bort, och nästa rad får ändå ett nytt id.
    const e = nyDb();
    utanAutoinkrement(e, 'matvarden');
    mellanarkiv.sakraIdGolv(e);
    const hogst = e.query('SELECT max(id) AS m FROM matvarden').get().m;
    e.query('DELETE FROM matvarden WHERE id = ?').run(hogst);
    const nasta = Number(e.query("INSERT INTO matvarden (patient_id, enhet_id, typ, varde, varde_num, matt_enhet, tid, registrerad_av) VALUES ('p01', 'uso-kard', 'puls', '70', 70, '/min', '2026-11-14T10:00:00.000Z', 'ssk-kard') RETURNING id").get().id);
    expect(nasta).toBeGreaterThan(hogst);
  });

  test('invånarens FHIR lämnar inte ut ordinationens historik och meddelanden till NLL ur mellanarkivet', async () => {
    const k = klient(app);
    expect((await k.post('/api/login/invanare', { invanareId: 'inv-p01' })).data.inloggad).toBe(true);
    const r = await k.get('/fhir/MedicationRequest?patient=p01');
    expect(r.status).toBe(200);
    const ur = (r.data.entry ?? []).map(e => e.resource).filter(x => String(x.id).startsWith('ma-'));
    expect(ur.length).toBeGreaterThan(0);
    for (const x of ur) expect([x.id, x.note]).toEqual([x.id, undefined]);
    expect(JSON.stringify(ur)).not.toContain('Händelse');
  });

  test('förhandsvisningen av tillfälliga diagnoser räknar per kapitel utan små tal, så att en differens mellan två listor inte röjer en diagnos', () => {
    const d = nyDb();
    const text = (varde) => konfiguration.forhandsvisa(d, personal(d, 'sysf'), { nyckel: 'arkiv.tillfalliga_diagnoser', varde }).effekt[0];
    const fore = text(['R', 'T74']);
    d.query("INSERT INTO diagnoser (patient_id, enhet_id, kod, text, typ, datum) VALUES ('p02', 'vc-tybble', 'T74.1', 'Fysisk misshandel', 'huvud', '2012-02-01')").run();
    // Två listor som skiljer sig med en kod i ett kapitel som redan är med ger samma text.
    expect(text(['R', 'T74'])).toBe(text(['R', 'T7']));
    expect(text(['R', 'T74'])).toBe(text(['R', 'T70', 'T71']));
    expect(text(['R', 'T74'])).not.toMatch(/räknas 1 diagnos/);
    expect(text(['R', 'T74'])).toMatch(/kapitel R, T i ICD-10-SE\. Där finns (färre än 10|omkring \d+0) diagnoser/);
    // Samma text för 0 som för färre än tio.
    expect(fore).toMatch(/färre än 10 diagnoser|omkring \d+0 diagnoser/);
    expect(text(['N30'])).toMatch(/kapitel N i ICD-10-SE\. Där finns färre än 10 diagnoser/);
  });

  test('signaturen på reservserverns logg täcker varje fält som inläsningen läser', () => {
    const kalla = readFileSync(join(import.meta.dir, '..', 'src', 'reservserver.js'), 'utf8');
    // Fälten som läses på en rad ur loggen (r.reservserver.x, rader[0].reservserver.x).
    const lasta = new Set([...kalla.matchAll(/(?:\br|\])\??\.reservserver\??\.(\w+)/g)].map(x => x[1]).filter(x => x !== 'mac'));
    expect(lasta.size).toBeGreaterThan(0);
    for (const f of lasta) expect([f, reservserver.MAC_FALT.includes(f)]).toEqual([f, true]);
  });

  test('en logg från reservservern läses in bara när den är signerad med den delade nyckeln, kommer från en av sandlådans kopior och börjar direkt efter kopian', () => {
    const d = nyDb();
    const dir = mkdtempSync(join(import.meta.dir, '..', '.testtmp-reservlogg-r15-'));
    try {
      const nyckel = 'r15granskning';
      const loggNyckel = Buffer.from('en-delad-nyckel-for-reservserverns-logg-r15');
      const sista = d.query('SELECT max(id) AS m FROM atkomstlogg').get().m;
      const kopior = [{ id: 'kopia-1', sha256: 'c'.repeat(64), loggId: sista, tid: '2026-11-14T09:00:00.000Z' }];
      const hashAv = (id) => d.query('SELECT hash FROM atkomstlogg WHERE id = ?').get(id).hash;
      const bygg = ({ start = sista + 1, prev = hashAv(sista), kopiaLoggId = sista, kopia = 'kopia-1', nyckelFor = loggNyckel, kopiaTid = '2026-11-14T09:00:00.000Z', andraTid = null } = {}) => {
        const metaFor = (i) => ({ kopia, kopiaTid: i === 1 && andraTid ? andraTid : kopiaTid, kopiaSha256: 'c'.repeat(64), kopiaLoggId, nyckel });
        let p = prev;
        return [0, 1].map(i => {
          const rad = { id: start + i, tid: new Date(Date.now() - (10 - i) * 60_000).toISOString(), personal_id: 'ssk-kard', enhet_id: 'uso-kard', patient_id: 'p02',
            handling: 'las_oversikt', resurs: 'oversikt', grund: 'vardrelation', syfte: 'Läsning på reservservern', resultat: 'tillaten', invanare_id: null };
          const hash = hashFor(p, rad);
          p = hash;
          return { ...rad, hash };
        }).map((r, i, alla) => {
          const ut = { ...r, prev_hash: i === 0 ? prev : alla[i - 1].hash };
          const meta = metaFor(i);
          return { ...ut, reservserver: { ...meta, mac: reservserver.loggMac(nyckelFor, ut, meta) } };
        });
      };
      let n = 0;
      const prova = (rader) => {
        const fil = `reservserver-logg-2026-11-14T10-00-0${n++}Z.ndjson`;
        writeFileSync(join(dir, fil), rader.map(r => JSON.stringify(r)).join('\n') + '\n');
        try { return reservserver.lasInFil(d, personal(d, 'sysf'), { katalog: dir, nyckel, fil, loggNyckel, kopior }).inlasta; } catch (e) { return e.message; }
      };
      // En logg som börjar på fel ställe: efter en äldre rad i kedjan, eller med en annan början än kopian säger.
      expect(prova(bygg({ start: sista, prev: hashAv(sista - 1), kopiaLoggId: sista - 1 }))).toContain('börjar inte direkt efter kopian');
      expect(prova(bygg({ start: sista + 1, prev: 'a'.repeat(64), kopiaLoggId: sista }))).toContain('börjar inte direkt efter kopian');
      // En ändrad rad.
      const andrad = bygg();
      andrad[1] = { ...andrad[1], patient_id: 'p03' };
      expect(prova(andrad)).toContain('hänger inte ihop');
      // Utan giltig signatur, och med en annan nyckel.
      const utan = bygg();
      utan[0] = { ...utan[0], reservserver: { ...utan[0].reservserver, mac: '0'.repeat(64) } };
      expect(prova(utan)).toContain('inte signerad');
      expect(prova(bygg({ nyckelFor: Buffer.from('en-annan-nyckel-som-inte-ar-den-delade-r15') }))).toContain('inte signerad');
      // En kopia som inte är sandlådans.
      expect(prova(bygg({ kopia: 'kopia-annan' }))).toContain('inte en av den här sandlådans');
      // En ändrad kopiaTid bryter signaturen, rader med olika kopior blandas inte, och en kopiaTid som inte är kopians
      // tid i kopieindexet godtas inte.
      const tid = bygg();
      tid[0] = { ...tid[0], reservserver: { ...tid[0].reservserver, kopiaTid: '2026-11-14T08:00:00.000Z' } };
      expect(prova(tid)).toContain('inte signerad');
      expect(prova(bygg({ andraTid: '2026-11-14T08:00:00.000Z' }))).toContain('blandar rader');
      expect(prova(bygg({ kopiaTid: '2026-11-14T08:00:00.000Z' }))).toContain('börjar inte direkt efter kopian');
      // Utan nyckel i kärnsystemet läses ingen logg in.
      const fil = 'reservserver-logg-2026-11-14T10-00-09Z.ndjson';
      writeFileSync(join(dir, fil), bygg().map(r => JSON.stringify(r)).join('\n') + '\n');
      expect(() => reservserver.lasInFil(d, personal(d, 'sysf'), { katalog: dir, nyckel, fil, loggNyckel: null, kopior })).toThrow('saknar nyckeln');
      // Den riktiga loggen läses in.
      expect(prova(bygg())).toBe(2);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('Säkerhetsgranskningen efter runda 15: omvårdnadsprocessen och undersköterskan', () => {
  const sokordAv = (o) => Object.entries(o).map(([sokord, text]) => ({ sokord, text }));
  test('ett mål som tas bort efter att utkastet sparades får inget resultat när anteckningen signeras', () => {
    const d = nyDb();
    const ssk = atk(d, 'ssk-kard', 'p04', {}, 'skriv_omvardnad');
    const plan = d.query("SELECT * FROM vardplaner WHERE patient_id = 'p04' AND mall = 'fall'").get();
    const mal = d.query('SELECT * FROM vardplan_mal WHERE plan_id = ? AND borttagen IS NULL ORDER BY id').get(plan.id);
    const a = journal.skapaAnteckning(ssk, { typ: 'Omvårdnadsanteckning', sokord: sokordAv({ Resultat: 'Har inte fallit.' }), process: { resultat: [{ malId: mal.id, status: 'uppnatt' }] } });
    d.query('UPDATE vardplan_mal SET borttagen = ? WHERE id = ?').run('2026-11-14T10:00:00.000Z', mal.id);
    const fore = d.query("SELECT count(*) AS n FROM vardplan_historik WHERE typ = 'resultat'").get().n;
    journal.signera(ssk, journal.hamtaAnteckningRad(d, a.id));
    expect(d.query("SELECT count(*) AS n FROM vardplan_historik WHERE typ = 'resultat'").get().n).toBe(fore);
  });
});

describe('Säkerhetsgranskningen efter runda 15: samtycket och den skyddade identiteten', () => {
  const pers = (db, id) => db.query('SELECT * FROM personal WHERE id = ?').get(id);
  const giltiga = (db, typ) => { try { return db.query("SELECT intyg_id FROM rivta_sim_samtycken WHERE patient_id = 'p01' AND aterkallat IS NULL AND typ = ?").all(typ); } catch { return []; } };
  const iTjansten = (db) => { try { return db.query("SELECT intyg_id, aterkallat FROM rivta_sim_samtycken WHERE patient_id = 'p01'").all(); } catch { return []; } };
  test('en köad registrering skickas inte till samtyckestjänsten när patienten har fått skyddad identitet', () => {
    const db = nyDb();
    const a = new AtkomstKlass(db, pers(db, 'lak-kard'), 'p01', {}, 'las_journal');
    nat.satt(() => { throw new Error('nere'); });
    try { sam.registrera(a, { giltighet: 'tillsvidare' }); } finally { nat.satt(null); }
    expect(db.query("SELECT count(*) AS n FROM samtycke_utkorg WHERE status = 'vantar'").get().n).toBe(1);
    db.query("UPDATE patienter SET skyddad = 1 WHERE id = 'p01'").run();
    sam.skickaKo(db, { tvinga: true });
    expect(iTjansten(db)).toEqual([]);
    expect(db.query("SELECT status FROM samtycke_utkorg").get().status).toBe('avbruten');
  });
  test('en registrering som försöktes utan svar men kom fram återkallas också, och ett intyg om nödsituation överlever återkallelsen av samtycket', () => {
    const db = nyDb();
    const a = new AtkomstKlass(db, pers(db, 'lak-kard'), 'p01', { nodatkomst: { syfte: 'Akut' } }, 'las_journal');
    sam.registrera(a, { giltighet: 'tillsvidare' });
    // Svaret gick förlorat: registreringen kom fram men står som försökt och väntande.
    db.query("UPDATE samtycke_utkorg SET status = 'vantar', forsok = 1 WHERE handling = 'registrera' AND typ = 'Consent'").run();
    const nod = sam.registreraNodsituation(new AtkomstKlass(db, pers(db, 'lak-kard'), 'p01', { nodatkomst: { syfte: 'Akut' } }, 'las_journal'));
    expect(giltiga(db, 'Consent').length).toBe(1);
    db.query("UPDATE patienter SET skyddad = 1 WHERE id = 'p01'").run();
    sam.aterkalla(a);
    expect(giltiga(db, 'Consent')).toEqual([]);
    if (nod) expect(giltiga(db, 'Emergency').length).toBeGreaterThan(0);
  });

  test('en återkallelse utan några egna intyg markeras aldrig som skickad, utan står kvar för systemförvaltaren', () => {
    const db = nyDb();
    const a = new AtkomstKlass(db, pers(db, 'lak-kard'), 'p01', {}, 'las_journal');
    db.query("UPDATE patienter SET skyddad = 1 WHERE id = 'p01'").run();
    sam.aterkalla(a);
    const r = db.query("SELECT status, fel FROM samtycke_utkorg WHERE handling = 'aterkalla' ORDER BY id DESC").get();
    expect(r).toBeTruthy();
    expect(r.status).toBe('vantar');
    expect(r.fel).toContain('Systemförvaltaren');
    expect(sam.lageForvaltning(db).ejFramme).toBeGreaterThan(0);
  });

  test('när en hel journal förstörs återkallas samtycket i tjänsten och patienten markeras för borttagning ur engagemangsindex', () => {
    const db = nyDb();
    const a = new AtkomstKlass(db, pers(db, 'lak-kard'), 'p01', {}, 'las_journal');
    sam.registrera(a, { giltighet: 'tillsvidare' });
    expect(iTjansten(db).filter(x => !x.aterkallat).length).toBe(1);
    eiMod.sakra(db);
    db.query("INSERT INTO ei_poster (patient_id, personid, doman, kategori, senast, skickad) VALUES ('p01', '194502024732', 'riv:clinicalprocess:healthcond:description', 'caredocumentation', '20261114000000', '2026-11-14T00:00:00.000Z')").run();
    sam.registreraNodsituation(new AtkomstKlass(db, pers(db, 'lak-kard'), 'p01', { nodatkomst: { syfte: 'Akut' } }, 'las_journal'));
    expect(giltiga(db, 'Emergency').length).toBe(1);
    arkivMod.radera(db, 'p01', { hela: true });
    expect(db.query("SELECT count(*) AS n FROM ei_poster WHERE patient_id = 'p01'").get().n).toBe(1);
    expect(db.query("SELECT count(*) AS n FROM ei_markerade WHERE patient_id = 'p01' AND markerad IS NULL").get().n).toBeGreaterThan(0);
    sam.skickaKo(db, { tvinga: true });
    // När patientens uppgifter tas bort ur tjänsten tas alla intyg bort, också intyget om nödsituation.
    expect(iTjansten(db).filter(x => !x.aterkallat)).toEqual([]);
  });

  test('när patienten får skyddad identitet tas alla intyg som Vårdkällan har registrerat bort ur tjänsten, också om nödsituation och försökta', () => {
    const db = nyDb();
    const a = new AtkomstKlass(db, pers(db, 'lak-kard'), 'p01', { nodatkomst: { syfte: 'Akut' } }, 'las_journal');
    sam.registrera(a, { giltighet: 'tillsvidare' });
    sam.registreraNodsituation(a);
    db.query("UPDATE samtycke_utkorg SET status = 'vantar', forsok = 1 WHERE handling = 'registrera' AND typ = 'Consent'").run();
    expect(giltiga(db, 'Consent').length + giltiga(db, 'Emergency').length).toBe(2);
    db.query("UPDATE patienter SET skyddad = 1 WHERE id = 'p01'").run();
    sam.efterTid(db);
    sam.skickaKo(db, { tvinga: true });
    expect(giltiga(db, 'Consent')).toEqual([]);
    expect(giltiga(db, 'Emergency')).toEqual([]);
    const sista = db.query("SELECT begaran FROM samtycke_utkorg WHERE handling = 'aterkalla' ORDER BY id DESC").get().begaran;
    expect(sista).not.toContain('194502024732');
  });

  test('ett samtycke som registrerades före skyddet återkallas i tjänsten med vårdenhetens egna intyg, utan personnummer', () => {
    const db = nyDb();
    const a = new AtkomstKlass(db, pers(db, 'lak-kard'), 'p01', {}, 'las_journal');
    sam.registrera(a, { giltighet: 'tillsvidare' });
    expect(iTjansten(db).filter(x => !x.aterkallat).length).toBe(1);
    db.query("UPDATE patienter SET skyddad = 1 WHERE id = 'p01'").run();
    sam.aterkalla(a);
    expect(iTjansten(db).filter(x => !x.aterkallat)).toEqual([]);
    const sista = db.query("SELECT begaran FROM samtycke_utkorg WHERE handling = 'aterkalla' ORDER BY id DESC").get();
    expect(sista.begaran).not.toContain('194502024732');
  });
});

describe('Säkerhetsgranskningen efter runda 15: flytten och det som inte syns', () => {
  const pers = (db, id) => db.query('SELECT * FROM personal WHERE id = ?').get(id);
  // Lägger in en rad med de värden som ges och enkla värden i övriga obligatoriska kolumner.
  const lagIn = (db, tabell, varden) => {
    const kol = db.query(`PRAGMA table_info(${tabell})`).all();
    const v = { ...varden };
    for (const k of kol) if (k.notnull && k.dflt_value == null && !k.pk && !(k.name in v)) v[k.name] = /INT/i.test(k.type) ? 1 : 'x';
    const n = Object.keys(v);
    return Number(db.query(`INSERT INTO ${tabell} (${n.join(', ')}) VALUES (${n.map(() => '?').join(', ')}) RETURNING rowid AS id`).get(...n.map(x => v[x])).id);
  };
  const kontakt = (db) => db.query(`SELECT v.* FROM vardkontakter v WHERE v.enhet_id LIKE 'uso-kard%' AND v.kalla = 'vardkallan' AND v.vardtillfalle_id IS NULL
    AND v.typ <> 'slutenvard' AND coalesce(v.planerad, 0) = 0 AND v.patient_id NOT IN ('p05', 'p12') AND EXISTS (SELECT 1 FROM anteckningar a WHERE a.vardkontakt_id = v.id) ORDER BY v.id LIMIT 1`).get();
  const doljAnteckning = (db, v) => {
    const a = db.query('SELECT * FROM anteckningar WHERE vardkontakt_id = ? LIMIT 1').get(v.id);
    const kol = Object.keys(a).filter(k => k !== 'id');
    db.query(`INSERT INTO anteckningar (${kol.join(', ')}) VALUES (${kol.map(() => '?').join(', ')})`).run(...kol.map(k => (k === 'enhet_id' ? 'kkoga-ane' : a[k])));
  };
  const doljRemissMedBilaga = (db, v) => {
    const r = lagIn(db, 'remisser', { patient_id: v.patient_id, fran_enhet_id: 'kkoga-ane', till_enhet_id: 'kkoga-ane', vardkontakt_id: v.id, status: 'skickad' });
    lagIn(db, 'remiss_bilagor', { remiss_id: r, patient_id: v.patient_id });
  };
  const sparr = (db, v) => db.query('INSERT INTO sparrar (patient_id, enhet_id, registrerad, aktiv) VALUES (?, ?, ?, 1)').run(v.patient_id, 'kkoga-ane', new Date().toISOString());
  const forhandsvisning = (db, v) => JSON.stringify(makuleringMod.forhandsvisa(new AtkomstKlass(db, pers(db, 'adm-kard'), v.patient_id, {}, 'registrera_vardkontakt'), makuleringMod.objekt(db, 'vardkontakt', v.id)));
  const vagran = (db, v) => { try { makuleringMod.makulera(new AtkomstKlass(db, pers(db, 'adm-kard'), v.patient_id, {}, 'registrera_vardkontakt'), makuleringMod.objekt(db, 'vardkontakt', v.id), { orsak: 'Besöket registrerades på fel patient i receptionen.' }); return 'lyckades'; } catch (e) { return JSON.stringify([e.status, e.message, e.kod, e.extra]); } };

  test('en flytt tar med kontrasigneringen av en anteckning och uppmärksamhetsinformation byggd på en diagnos, så att inget blir kvar hos fel patient', () => {
    const db = nyDb();
    const v = kontakt(db);
    const a = db.query('SELECT * FROM anteckningar WHERE vardkontakt_id = ? LIMIT 1').get(v.id);
    lagIn(db, 'kontrasigneringar', { patient_id: v.patient_id, typ: 'anteckning', post_id: a.id, enhet_id: a.enhet_id, begard_av: 'lak-kard', begard: '2026-11-14T09:00:00.000Z', mottagare_id: 'lak-kard', status: 'begard' });
    const d = lagIn(db, 'diagnoser', { patient_id: v.patient_id, enhet_id: v.enhet_id, vardkontakt_id: v.id, kod: 'I48.9', text: 'Förmaksflimmer', typ: 'huvud', datum: '2026-11-14' });
    lagIn(db, 'uppmarksamhet', { patient_id: v.patient_id, enhet_id: v.enhet_id, kategori: 'medicinskt', term: 'Prov', kalla_typ: 'diagnos', kalla_id: d, status: 'aktiv', registrerad: '2026-11-14T09:00:00.000Z' });
    const f = makuleringMod.tillhor(db, makuleringMod.objekt(db, 'vardkontakt', v.id));
    expect(f.get('kontrasigneringar')?.length).toBe(1);
    expect(f.get('uppmarksamhet')?.length).toBe(1);
  });

  test('förhandsvisningen är densamma med och utan en dold anteckning på en spärrad vårdenhet', () => {
    const utan = nyDb(); const med = nyDb();
    const v = kontakt(utan); sparr(utan, v);
    sparr(med, v); doljAnteckning(med, v);
    expect(forhandsvisning(med, v)).toBe(forhandsvisning(utan, v));
  });

  test('förhandsvisningen är densamma också när den dolda raden bara har barn utan vårdenhet', () => {
    const utan = nyDb(); const med = nyDb();
    const v = kontakt(utan); sparr(utan, v);
    sparr(med, v); doljRemissMedBilaga(med, v);
    expect(forhandsvisning(med, v)).toBe(forhandsvisning(utan, v));
  });

  test('vägran för en planerad kontakt med uppgifter är densamma med och utan en dold rad, utan antal, och systemförvaltningen får samma meddelande', () => {
    const utan = nyDb(); const med = nyDb(); const barn = nyDb();
    const v = kontakt(utan);
    // Kontakten görs planerad (i morgon, inte genomförd), med en synlig anteckning knuten till sig.
    const imorgon = new Date(Date.now() + 86_400_000).toISOString();
    for (const d of [utan, med, barn]) d.query('UPDATE vardkontakter SET start = ?, slut = NULL, ankomst = NULL WHERE id = ?').run(imorgon, v.id);
    sparr(utan, v);
    sparr(med, v); doljAnteckning(med, v);
    sparr(barn, v); doljRemissMedBilaga(barn, v);
    for (const d of [utan, med, barn]) expect(forhandsvisning(d, v)).toBe(forhandsvisning(utan, v));
    const a = vagran(utan, v);
    expect(a).not.toBe('lyckades');
    expect(vagran(med, v)).toBe(a);
    expect(vagran(barn, v)).toBe(a);
    expect(a).not.toMatch(/\d+ anteckning/);
    const rad = (db) => db.query("SELECT beskrivning FROM sakerhetslogg WHERE typ = 'flytt_hindrad' ORDER BY id DESC").get()?.beskrivning;
    expect(rad(med)).toBe(rad(utan));
    expect(rad(utan)).toBeTruthy();
  });
});

describe('Säkerhetsgranskningen efter runda 15: samtyckets omfattning', () => {
  test('ett intyg med omfattningen CareProviderLevel eller utan omfattning räknas inte som samtycke till sammanhållen journalföring', () => {
    const villkor = { minEnhet: 'SE2321000164-VK0120', jag: 'SE2321000164-L1', t: '2026-11-14T10:00:00' };
    const intyg = (Scope) => ({ PDLAssertion: { AssertionType: 'Consent', ...(Scope ? { Scope } : {}), CareUnitId: villkor.minEnhet, StartDate: '2026-11-01T00:00:00' }, RegistrationInfo: { RegistrationDate: '2026-11-01T00:00:00' } });
    expect(sam.giltigtSamtycke(intyg('NationalLevel'), villkor)).toBe(true);
    expect(sam.giltigtSamtycke(intyg('CareProviderLevel'), villkor)).toBe(false);
    expect(sam.giltigtSamtycke(intyg(null), villkor)).toBe(false);
  });
});

describe('Säkerhetsgranskningen efter runda 15: timern för de nationella köerna', () => {
  test('det brådskande har ett tak per varv, och nästa varv fortsätter där det förra slutade', async () => {
    const r2 = await import('../src/r15r2-rutter.js');
    const dbs = Array.from({ length: 100 }, (_, i) => ({ i }));
    const korda = [];
    const n1 = r2.schemalagg(dbs, { prioritet: () => 2, kor: (db) => korda.push(db.i) });
    expect(n1).toBeLessThanOrEqual(r2.MAX_BRADSKANDE);
    const n2 = r2.schemalagg(dbs, { prioritet: () => 2, kor: (db) => korda.push(db.i) });
    expect(n2).toBeLessThanOrEqual(r2.MAX_BRADSKANDE);
    expect(new Set(korda).size).toBe(korda.length);
  });
});

describe('Säkerhetsgranskningen efter runda 15: FHIR Consent', () => {
  test('slutdatumet och statusen följer de tre giltighetsvalen', async () => {
    const fhirMod = await import('../src/fhir.js');
    const db = nyDb();
    const pers = (id) => db.query('SELECT * FROM personal WHERE id = ?').get(id);
    const rad = () => db.query("SELECT * FROM sammanhallen_samtycken WHERE patient_id = 'p01' ORDER BY id DESC").get();
    const a = new AtkomstKlass(db, pers('lak-kard'), 'p01', {}, 'las_journal');
    const om30 = new Date(Date.now() + 30 * 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
    sam.registrera(a, { giltighet: 'tid', giltigTill: om30 });
    const tid = rad();
    expect(fhirMod.consent(db, tid).provision.period.end).toBe(om30);
    expect(fhirMod.consent(db, tid).status).toBe('active');
    expect(fhirMod.consent(db, tid, new Date(Date.now() + 40 * 86_400_000)).status).toBe('inactive');
    sam.aterkalla(a);
    sam.registrera(a, { giltighet: 'tillsvidare' });
    const tv = rad();
    expect(fhirMod.consent(db, tv).provision.period.end).toBeUndefined();
    expect(fhirMod.consent(db, tv).extension[0].valueCode).toBe('tillsvidare');
    sam.aterkalla(a);
    sam.registrera(a, { giltighet: 'vardrelation' });
    const vr = rad();
    expect(fhirMod.consent(db, vr).provision.period.end).toBeUndefined();
    expect(fhirMod.consent(db, vr).status).toBe('active');
    expect(fhirMod.consent(db, vr).extension[0].valueCode).toBe('vardrelation');
  });
});

