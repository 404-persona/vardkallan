// Säkerhetsgranskningen efter sammanslagningen av runda 15 (r3, r5, r4 och r1). Varje test prövar ett fynd och skrevs
// rött innan felet rättades.
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { testserver, klient, sandlada, nyDb, atk } from './hjalp.js';
import * as underlag from '../src/anteckningsunderlag.js';
import * as journal from '../src/journal.js';
import * as ff from '../src/flerfaktor.js';
import * as idp from '../src/idp.js';
import * as tillit from '../src/tillitsniva.js';
import * as mellanarkiv from '../src/mellanarkiv.js';
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

  test('i en sandlåda med tabeller utan AUTOINCREMENT stannar raden med det högsta id:t tills en nyare finns', () => {
    const d = nyDb();
    // Som en sandlåda från version 1.4: tabellen byggs om utan AUTOINCREMENT.
    const sql = d.query("SELECT sql FROM sqlite_master WHERE name = 'anteckningar'").get().sql.replace(/AUTOINCREMENT/i, '');
    const triggrar = d.query("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'anteckningar'").all().map(x => x.sql);
    const index = d.query("SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'anteckningar' AND sql IS NOT NULL").all().map(x => x.sql);
    d.exec('PRAGMA foreign_keys = OFF');
    d.transaction(() => {
      d.exec('ALTER TABLE anteckningar RENAME TO anteckningar_r14');
      d.exec(sql);
      d.exec('INSERT INTO anteckningar SELECT * FROM anteckningar_r14');
      d.exec('DROP TABLE anteckningar_r14');
      for (const s of [...index, ...triggrar]) d.exec(s);
    })();
    const gammal = Number(d.query(`INSERT INTO anteckningar (patient_id, enhet_id, typ, kategori, sokord, forfattare_id, skapad, status, signerad_tid, signerad_av, version, kalla)
      VALUES ('p02', 'vc-tybble', 'Mottagningsanteckning', 'lakare', '[{"sokord":"Aktuellt","text":"Migrerad 2012."}]', 'lak-vc', '2012-03-01T10:00:00.000Z', 'signerad', '2012-03-01T10:00:00.000Z', 'lak-vc', 1, 'migrerad') RETURNING id`).get().id);
    overfor(d);
    expect(d.query('SELECT id FROM anteckningar WHERE id = ?').get(gammal)).toBeTruthy();
    const ny = Number(d.query(`INSERT INTO anteckningar (patient_id, enhet_id, typ, kategori, sokord, forfattare_id, skapad, status, version, kalla)
      VALUES ('p03', 'uso-kard', 'Daganteckning', 'lakare', '[{"sokord":"Aktuellt","text":"Ny."}]', 'lak-kard', '2026-11-14T10:00:00.000Z', 'utkast', 1, 'vardkallan') RETURNING id`).get().id);
    expect(ny).toBeGreaterThan(gammal);
    overfor(d);
    expect(d.query('SELECT id FROM anteckningar WHERE id = ?').get(gammal)).toBeNull();
    const v = mellanarkiv.vy(d, 'anteckningar');
    expect(d.query(`SELECT id, count(*) AS n FROM ${v} GROUP BY id HAVING n > 1`).all()).toEqual([]);
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

  test('förhandsvisningen av tillfälliga diagnoser ger inga små tal till systemförvaltaren, som inte läser journaler', () => {
    const d = nyDb();
    d.query("INSERT INTO diagnoser (patient_id, enhet_id, kod, text, typ, datum) VALUES ('p02', 'vc-tybble', 'T74.1', 'Fysisk misshandel', 'huvud', '2012-02-01')").run();
    const f = konfiguration.forhandsvisa(d, personal(d, 'sysf'), { nyckel: 'arkiv.tillfalliga_diagnoser', varde: ['R', 'T74'] });
    const text = JSON.stringify(f);
    expect(text).not.toMatch(/räknas 1 diagnos/);
    expect(text).toMatch(/räknas (inga|färre än 10|omkring \d+0) diagnoser från före/);
  });

  test('en logg från reservservern läses in bara när den fortsätter sandlådans egen kedja, också när filen hänger ihop i sig', () => {
    const d = nyDb();
    const minne = new Map();
    const nyckel = 'r15-granskning';
    // Den simulerade loggen fortsätter kedjan och läses in.
    const { fil } = reservserver.simuleraLogg(d, { minne, nyckel });
    expect(reservserver.lasInFil(d, personal(d, 'sysf'), { minne, nyckel, fil }).inlasta).toBe(3);
    // En förfalskad logg som hänger ihop i sig men börjar på en annan kedja läses inte in.
    const sista = d.query('SELECT max(id) AS m FROM atkomstlogg').get().m;
    let prev = 'a'.repeat(64);
    const rader = [0, 1].map(i => {
      const rad = { id: sista + 1 + i, tid: new Date(Date.now() - (10 - i) * 60_000).toISOString(), personal_id: 'ssk-kard', enhet_id: 'uso-kard', patient_id: 'p02',
        handling: 'las_oversikt', resurs: 'oversikt', grund: 'vardrelation', syfte: 'Förfalskad', resultat: 'tillaten', invanare_id: null };
      const hash = hashFor(prev, rad);
      const ut = { ...rad, prev_hash: prev, hash, reservserver: { kopia: 'x', kopiaTid: rad.tid, nyckel } };
      prev = hash;
      return ut;
    });
    expect(reservserver.kontrolleraLogg(rader).hel).toBe(true);
    const namn = 'reservserver-logg-2026-11-14T10-00-00Z.ndjson';
    minne.get(nyckel).set(namn, rader);
    const o = reservserver.loggOversikt(d, { minne, nyckel }).filer.find(x => x.fil === namn);
    expect(o.kedjaHel).toBe(false);
    expect(() => reservserver.lasInFil(d, personal(d, 'sysf'), { minne, nyckel, fil: namn })).toThrow('hänger inte ihop');
  });
});
