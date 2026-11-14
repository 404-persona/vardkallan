// Säkerhetsgranskningen efter sammanslagningen av runda 15 (r3, r5, r4 och r1). Varje test prövar ett fynd och skrevs
// rött innan felet rättades.
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { testserver, klient, sandlada, nyDb, atk } from './hjalp.js';
import * as underlag from '../src/anteckningsunderlag.js';
import * as journal from '../src/journal.js';
import * as ff from '../src/flerfaktor.js';
import * as idp from '../src/idp.js';
import * as tillit from '../src/tillitsniva.js';

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
