// Runda 13, r3 (vårt L5): flerfaktor som krav. Runda 15, r1 (beslut från Jonas 2026-11-14): parametern
// sakerhet.flerfaktor_kravs är ersatt av en regel som systemet avgör. Inloggningen är alltid flerfaktor: tillitsnivå 3
// räknas redan, och en lägre nivå kompletteras med passkey eller kod, eller leder till registreringen av en faktor. Den
// sista faktorn får tas bort bara när den pågående inloggningen har tillitsnivå 3. Parameterns beslutade versioner finns
// kvar i historiken. Testnamnen används i kravregistret (krav.js).
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { testserver, klient, sandlada, personal } from './hjalp.js';
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

  test('under tillitsnivå 3 leds den som saknar faktor till att registrera en, och får ingen behörighet eller läskopia förrän den är bekräftad', async () => {
    const k = klient(app);
    const forsta = await k.post('/api/login', { personalId: 'ssk-kard', tillitsniva: 2 });
    expect(forsta.status).toBe(200);
    expect(forsta.data.inloggad).toBe(false);
    expect(forsta.data.lasnyckel).toBeUndefined();
    expect(forsta.data.flerfaktor).toMatchObject({ kravs: true, registrera: true, metoder: [] });
    expect(forsta.data.flerfaktorVantar).toMatchObject({ registrera: true });
    expect((await k.get('/api/patient/p01')).status).toBe(401);
    expect((await k.get('/api/inkorg')).status).toBe(401);
    const b = (await k.post('/api/flerfaktor/totp/borja')).data;
    const h = ff.fran32(b.nyckel);
    const r = await k.post('/api/flerfaktor/totp', { kod: ff.totp(h, Date.now()) });
    expect(r.status).toBe(201);
    expect(r.data.inloggad).toBe(true);
    expect(r.data.personal.id).toBe('ssk-kard');
    expect(r.data.flerfaktor).toMatchObject({ aktiv: true, metod: 'totp' });
    expect(r.data.lasnyckel).toBeTruthy();
    expect((await k.get('/api/patient/p01')).status).toBe(200);
    await k.post('/api/logout');
    const nasta = await k.post('/api/login', { personalId: 'ssk-kard', tillitsniva: 2 });
    expect(nasta.data.inloggad).toBe(false);
    expect(nasta.data.flerfaktor.metoder).toEqual(['totp']);
    expect(nasta.data.flerfaktor.registrera).toBeUndefined();
  });

  test('under tillitsnivå 3 ger en felaktig kod vid registreringen ingen inloggning, och för många försök avbryter', async () => {
    const k = klient(app);
    await k.post('/api/login', { personalId: 'usk-kard', tillitsniva: 2 });
    const b = (await k.post('/api/flerfaktor/totp/borja')).data;
    const h = ff.fran32(b.nyckel);
    const giltiga = new Set([-1, 0, 1].map(d => ff.totp(h, Date.now() + d * 30_000)));
    const felkoder = ['123456', '234567', '345678', '456789', '567890', '678901', '789012'].filter(x => !giltiga.has(x));
    let sista;
    for (let i = 0; i < ff.MAX_FORSOK; i++) {
      sista = await k.post('/api/flerfaktor/totp', { kod: felkoder[i] });
      expect(sista.status).toBe(400);
      expect(sista.data.inloggad).toBeUndefined();
    }
    expect(sista.data.fel).toContain('För många felaktiga försök');
    expect((await k.post('/api/flerfaktor/totp', { kod: ff.totp(h, Date.now()) })).status).toBe(401);
    expect((await k.get('/api/session')).data.inloggad).toBe(false);
  });

  test('under tillitsnivå 3 leds invånaren i Min journal till att registrera en faktor innan journalen visas', async () => {
    const k = klient(app);
    const forsta = await k.post('/api/login/invanare', { invanareId: 'inv-p01', tillitsniva: 2 });
    expect(forsta.data.inloggad).toBe(false);
    expect(forsta.data.flerfaktor).toMatchObject({ kravs: true, registrera: true });
    expect((await k.get('/api/min/journal/p01')).status).toBe(401);
    const b = (await k.post('/api/flerfaktor/totp/borja')).data;
    const r = await k.post('/api/flerfaktor/totp', { kod: ff.totp(ff.fran32(b.nyckel), Date.now()) });
    expect(r.status).toBe(201);
    expect(r.data.inloggad).toBe(true);
    expect(r.data.roll).toBe('invanare');
    expect(r.data.lasnyckel).toBeUndefined();
  });

  // Säkerhetsgranskningen: en väntande registrering får aldrig gå förbi en faktor som kontot redan har.
  test('en väntande registrering slutför inte inloggningen när kontot har fått en faktor under tiden, och tar aldrig bort faktorer', async () => {
    const k = klient(app);
    await k.logga('far-kard');
    const db = sandlada(app, k).db;
    await k.post('/api/logout');
    expect((await k.post('/api/login', { personalId: 'far-kard', tillitsniva: 2 })).data.flerfaktor.registrera).toBe(true);
    const b = (await k.post('/api/flerfaktor/totp/borja')).data;
    const annan = ff.borjaTotp(db, { typ: 'personal', id: 'far-kard', namn: 'Elsa Nordin' });
    ff.bekraftaTotp(db, { typ: 'personal', id: 'far-kard' }, ff.totp(ff.fran32(annan.nyckel), Date.now()));
    const befintlig = ff.aktiva(db, 'personal', 'far-kard')[0];
    const r = await k.post('/api/flerfaktor/totp', { kod: ff.totp(ff.fran32(b.nyckel), Date.now()) });
    expect(r.status).toBe(400);
    expect(r.data.inloggad).toBeUndefined();
    expect(r.data.flerfaktor).toMatchObject({ kravs: true, metoder: ['totp'] });
    expect(r.data.flerfaktor.registrera).toBeUndefined();
    expect(ff.aktiva(db, 'personal', 'far-kard').map(f => f.id)).toEqual([befintlig.id]);
    expect((await k.get('/api/session')).data.inloggad).toBe(false);
    expect((await k.post('/api/flerfaktor/totp/borja')).status).toBe(401);
    expect((await k.post(`/api/flerfaktor/${befintlig.id}/ta-bort`)).status).toBe(401);
    expect(ff.aktiva(db, 'personal', 'far-kard').length).toBe(1);
  });

  test('en väntande registrering kan aldrig ta bort en faktor', async () => {
    const k = klient(app);
    await k.logga('vch-kard');
    const db = sandlada(app, k).db;
    await k.post('/api/logout');
    await k.post('/api/login', { personalId: 'vch-kard', tillitsniva: 2 });
    const b = (await k.post('/api/flerfaktor/totp/borja')).data;
    const rad = db.query("SELECT id FROM flerfaktorer WHERE agare_id = 'vch-kard'").get();
    expect((await k.post(`/api/flerfaktor/${rad.id}/ta-bort`)).status).toBe(401);
    expect(db.query("SELECT count(*) AS n FROM flerfaktorer WHERE agare_id = 'vch-kard'").get().n).toBe(1);
    expect(b.nyckel).toBeTruthy();
  });

  test('den sista faktorn tas bort bara efter en inloggning med tillitsnivå 3, och nekas med en förklaring efter en inloggning med lägre nivå', async () => {
    const k = klient(app);
    await k.post('/api/login', { personalId: 'adm-kard', tillitsniva: 2 });
    const b = (await k.post('/api/flerfaktor/totp/borja')).data;
    const h = ff.fran32(b.nyckel);
    await k.post('/api/flerfaktor/totp', { kod: ff.totp(h, Date.now()) });
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
    await inv.post('/api/login/invanare', { invanareId: 'inv-p03', tillitsniva: 2 });
    const bi = (await inv.post('/api/flerfaktor/totp/borja')).data;
    await inv.post('/api/flerfaktor/totp', { kod: ff.totp(ff.fran32(bi.nyckel), Date.now()) });
    const oi = (await inv.get('/api/flerfaktor')).data;
    const ri = await inv.post(`/api/flerfaktor/${oi.faktorer[0].id}/ta-bort`);
    expect(ri.status).toBe(400);
    expect(ri.data.fel).toContain('e-legitimation');
  });
});
