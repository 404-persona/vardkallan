// Runda 13, r3 (vårt L5): flerfaktor som krav. Runda 15, r1 (beslut från Jonas 2026-11-14): parametern
// sakerhet.flerfaktor_kravs är ersatt av en regel som systemet avgör. Inloggningen är alltid flerfaktor: tillitsnivå 3
// räknas redan, och en lägre nivå kompletteras med passkey eller kod, eller leder till registreringen av en faktor. Den
// sista faktorn får tas bort bara när den pågående inloggningen har tillitsnivå 3. Parameterns beslutade versioner finns
// kvar i historiken. Testnamnen används i kravregistret (krav.js).
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { testserver, klient, sandlada, personal, faktorEfterNiva3, bekraftaKod } from './hjalp.js';
import { datumAv } from '../src/db.js';
import * as konfiguration from '../src/konfiguration.js';
import * as ff from '../src/flerfaktor.js';

let app;
beforeAll(() => { app = testserver(); });
afterAll(() => app.stopp());

const NYCKEL = 'sakerhet.flerfaktor_kravs';
// En beslutad version av parametern från före version 1.5, som den ligger i en äldre sandlåda.
function gammalVersion(db) {
  const nu = new Date();
  db.query(`INSERT INTO konfig_andringar (slag, nyckel, varde, forra, giltig_fran, galler_fran, motivering, foreslagen_av, foreslagen, status, beslutad_av, beslutad)
    VALUES ('parameter', ?, 'true', 'false', ?, ?, 'Prov före version 1.5.', 'sysf', ?, 'godkand', 'sysf-2', ?)`).run(NYCKEL, datumAv(nu), datumAv(nu), nu.toISOString(), nu.toISOString());
}

describe('Flerfaktor som krav', () => {
  test('parametern Flerfaktor krävs vid inloggning är ersatt av en regel: den går inte att föreslå, historiken finns kvar och systemförvaltningen visar varför', async () => {
    const k = klient(app);
    await k.logga('sysf');
    const db = sandlada(app, k).db;
    gammalVersion(db);
    expect(Object.hasOwn(konfiguration.parametrar(), NYCKEL)).toBe(false);
    const f = await k.post('/api/konfiguration', { nyckel: NYCKEL, varde: 'ja', giltigFran: datumAv(new Date()), motivering: 'Prov.' });
    expect(f.status).toBe(400);
    const o = (await k.get('/api/konfiguration')).data;
    const e = o.ersatta.find(x => x.nyckel === NYCKEL);
    expect(e.rubrik).toBe('Flerfaktor krävs vid inloggning');
    expect(e.regel).toContain('tillitsnivå 3');
    expect(e.varfor).toContain('HSLF-FS 2016:40');
    expect(e.versioner).toBe(1);
    const h = o.historik.find(x => x.nyckel === NYCKEL);
    expect(h).toMatchObject({ rubrik: 'Flerfaktor krävs vid inloggning', ersatt: true, status: 'godkand' });
    expect(h.vardeText).toBe('Ja');
    // En beslutad version raderas aldrig.
    expect(() => db.query('DELETE FROM konfig_andringar WHERE nyckel = ?').run(NYCKEL)).toThrow();
  });

  // Säkerhetsgranskningen efter runda 15: under tillitsnivå 3 registreras ingen faktor med bara den första faktorn. Den
  // registreras efter en inloggning med tillitsnivå 3 och bekräftar sedan en inloggning med lägre nivå.
  test('under tillitsnivå 3 stoppas den som saknar faktor med en förklaring, och den som har en får ingen behörighet eller läskopia förrän den är bekräftad', async () => {
    const k = klient(app);
    const stopp = await k.post('/api/login', { personalId: 'ssk-kard', tillitsniva: 2 });
    expect(stopp.status).toBe(403);
    expect(stopp.data.kod).toBe('kraver_tillitsniva');
    expect(stopp.data.fel).toContain('SITHS-kortet');
    expect((await k.post('/api/flerfaktor/totp/borja')).status).toBe(401);
    const h = await faktorEfterNiva3(k, { personalId: 'ssk-kard' });
    const forsta = await k.post('/api/login', { personalId: 'ssk-kard', tillitsniva: 2 });
    expect(forsta.status).toBe(200);
    expect(forsta.data.inloggad).toBe(false);
    expect(forsta.data.lasnyckel).toBeUndefined();
    expect(forsta.data.flerfaktor).toMatchObject({ kravs: true, metoder: ['totp'] });
    expect(forsta.data.flerfaktor.registrera).toBeUndefined();
    expect((await k.get('/api/patient/p01')).status).toBe(401);
    expect((await k.get('/api/inkorg')).status).toBe(401);
    const r = await bekraftaKod(k, h);
    expect(r.status).toBe(200);
    expect(r.data.inloggad).toBe(true);
    expect(r.data.personal.id).toBe('ssk-kard');
    expect(r.data.lasnyckel).toBeTruthy();
    expect((await k.get('/api/patient/p01')).status).toBe(200);
  });

  test('under tillitsnivå 3 kan en inloggning som väntar på faktorn inte registrera en ny faktor', async () => {
    const k = klient(app);
    await faktorEfterNiva3(k, { personalId: 'usk-kard' });
    const v = await k.post('/api/login', { personalId: 'usk-kard', tillitsniva: 2 });
    expect(v.data.flerfaktor.metoder).toEqual(['totp']);
    expect((await k.post('/api/flerfaktor/totp/borja')).status).toBe(401);
    expect((await k.post('/api/flerfaktor/totp', { kod: '123456' })).status).toBe(401);
    expect((await k.get('/api/session')).data.inloggad).toBe(false);
  });

  test('under tillitsnivå 3 stoppas invånaren utan faktor, och med en faktor från en inloggning med tillitsnivå 3 visas journalen först efter bekräftelsen', async () => {
    const k = klient(app);
    const stopp = await k.post('/api/login/invanare', { invanareId: 'inv-p01', tillitsniva: 2 });
    expect(stopp.status).toBe(403);
    expect(stopp.data.fel).toContain('e-legitimation');
    const h = await faktorEfterNiva3(k, { invanareId: 'inv-p01' });
    const forsta = await k.post('/api/login/invanare', { invanareId: 'inv-p01', tillitsniva: 2 });
    expect(forsta.data.inloggad).toBe(false);
    expect(forsta.data.flerfaktor).toMatchObject({ kravs: true, metoder: ['totp'] });
    expect((await k.get('/api/min/journal/p01')).status).toBe(401);
    const r = await bekraftaKod(k, h);
    expect(r.status).toBe(200);
    expect(r.data.inloggad).toBe(true);
    expect(r.data.roll).toBe('invanare');
    expect(r.data.lasnyckel).toBeUndefined();
  });

  // Säkerhetsgranskningen: en väntande registrering får aldrig gå förbi en faktor som kontot redan har.
  test('en inloggning som väntar på faktorn tar aldrig bort en faktor', async () => {
    const k = klient(app);
    await faktorEfterNiva3(k, { personalId: 'far-kard' });
    await k.post('/api/login', { personalId: 'far-kard', tillitsniva: 2 });
    const db = sandlada(app, k).db;
    const befintlig = ff.aktiva(db, 'personal', 'far-kard')[0];
    expect((await k.post(`/api/flerfaktor/${befintlig.id}/ta-bort`)).status).toBe(401);
    expect(ff.aktiva(db, 'personal', 'far-kard').map(f => f.id)).toEqual([befintlig.id]);
    expect((await k.get('/api/session')).data.inloggad).toBe(false);
  });


  test('den sista faktorn tas bort bara efter en inloggning med tillitsnivå 3, och nekas med en förklaring efter en inloggning med lägre nivå', async () => {
    const k = klient(app);
    const h = await faktorEfterNiva3(k, { personalId: 'adm-kard' });
    await k.post('/api/login', { personalId: 'adm-kard', tillitsniva: 2 });
    expect((await bekraftaKod(k, h)).data.inloggad).toBe(true);
    const o = (await k.get('/api/flerfaktor')).data;
    expect(o.sistaFaktorKanTasBort).toBe(false);
    expect(o.text).toContain('tillitsnivå 3');
    const r = await k.post(`/api/flerfaktor/${o.faktorer[0].id}/ta-bort`);
    expect(r.status).toBe(400);
    expect(r.data.fel).toContain('Logga in med SITHS-kortet');
    expect((await k.get('/api/flerfaktor')).data.faktorer.length).toBe(1);
    const rader = sandlada(app, k).db.query("SELECT typ, beskrivning FROM sakerhetslogg WHERE personal_id = 'adm-kard' ORDER BY id").all();
    expect(rader.some(x => x.typ === 'inloggning' && x.beskrivning.includes('flerfaktor'))).toBe(true);
    // Efter inloggningen med SITHS-kortet (tillitsnivå 3) går den sista faktorn att ta bort.
    await k.post('/api/logout');
    await k.logga('adm-kard');
    expect((await k.get('/api/flerfaktor')).data.sistaFaktorKanTasBort).toBe(true);
    const ok = await k.post(`/api/flerfaktor/${o.faktorer[0].id}/ta-bort`);
    expect(ok.status).toBe(200);
    expect(ok.data.aktiv).toBe(false);
    // Samma regel för invånaren: efter e-legitimation med lägre nivå nekas den sista faktorn.
    const inv = klient(app);
    const hi = await faktorEfterNiva3(inv, { invanareId: 'inv-p03' });
    await inv.post('/api/login/invanare', { invanareId: 'inv-p03', tillitsniva: 2 });
    expect((await bekraftaKod(inv, hi)).data.inloggad).toBe(true);
    const oi = (await inv.get('/api/flerfaktor')).data;
    const ri = await inv.post(`/api/flerfaktor/${oi.faktorer[0].id}/ta-bort`);
    expect(ri.status).toBe(400);
    expect(ri.data.fel).toContain('e-legitimation');
  });
});
