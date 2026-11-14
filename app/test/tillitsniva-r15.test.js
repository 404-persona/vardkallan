// Runda 15, r1 (vårt L5 och Sussa 5.2.1.1, beslut från Jonas): SITHS och andra inloggningar med tillitsnivå 3 räknas som
// flerfaktor. Systemet avgör nivån ur en signerad biljett, en lägre nivå kompletteras med passkey eller engångskod, och
// systemförvaltningen anger lägsta nivå per inloggningstjänst med fyra ögon. Testnamnen används i kravregistret (krav.js)
// och i Sussa-mappningen (src/sussa/mappning/5.2.js).
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { generateKeyPairSync } from 'node:crypto';
import { testserver, sandlada, personal } from './hjalp.js';
import { startaTestutfardare } from './oidc-testutfardare.js';
import { datumAv } from '../src/db.js';
import * as konfiguration from '../src/konfiguration.js';
import * as tillit from '../src/tillitsniva.js';
import * as jwt from '../src/oidc-jwt.js';
import * as idp from '../src/idp.js';
import * as ff from '../src/flerfaktor.js';

const HEMLIGHET = 'testhemlighet-r15-som-aldrig-sparas';
process.env.VK_IDP_R15 = HEMLIGHET;
const SAMBI = (n) => `http://id.sambi.se/loa/loa${n}`;

let app, op;
beforeAll(() => {
  op = startaTestutfardare({ hemlighet: HEMLIGHET, klientId: 'vardkallan-r15' });
  app = testserver({ inloggningTillatna: op.url });
});
afterAll(() => { app.stopp(); op.stopp(); });

// En klient som håller sessionskakan också genom omdirigeringarna i inloggningen.
function webblasare() {
  let kaka = null;
  const ta = (r) => { const sc = r.headers.get('set-cookie'); if (sc) kaka = sc.split(';')[0]; return r; };
  const anrop = async (metod, vag, kropp) => {
    const h = { ...(kaka ? { Cookie: kaka } : {}), ...(kropp !== undefined ? { 'Content-Type': 'application/json' } : {}) };
    const r = ta(await fetch(app.url + vag, { method: metod, headers: h, body: kropp !== undefined ? JSON.stringify(kropp) : undefined, redirect: 'manual' }));
    const typ = r.headers.get('content-type') || '';
    return { status: r.status, data: typ.includes('json') ? await r.json() : await r.text() };
  };
  return {
    get: (v) => anrop('GET', v), post: (v, k = {}) => anrop('POST', v, k), kaka: () => kaka,
    async som(id, extra = {}) { await anrop('POST', '/api/logout', {}); const r = await anrop('POST', '/api/login', { personalId: id, ...extra }); if (r.status !== 200) throw new Error(JSON.stringify(r.data)); return r; },
    async extern(tjanstId) {
      const r1 = ta(await fetch(`${app.url}/api/inloggning/extern/${tjanstId}`, { headers: kaka ? { Cookie: kaka } : {}, redirect: 'manual' }));
      const till = r1.headers.get('location');
      if (!/^https?:/.test(till)) return (await anrop('GET', '/api/inloggning/resultat')).data.resultat;
      const r2 = await fetch(till, { redirect: 'manual' });
      ta(await fetch(r2.headers.get('location'), { headers: kaka ? { Cookie: kaka } : {}, redirect: 'manual' }));
      return (await anrop('GET', '/api/inloggning/resultat')).data.resultat;
    },
  };
}
const db = (b) => sandlada(app, b).db;
const sakerhet = (b) => db(b).query('SELECT * FROM sakerhetslogg ORDER BY id').all();
function attributFor(d, id) {
  const p = personal(d, id);
  const u = idp.uppdragFor(d, p);
  return { employeeHsaId: p.hsa_id, given_name: p.namn.split(' ')[0], family_name: p.namn.split(' ').slice(1).join(' '), commissionHsaId: u.commissionHsaId,
    commissionPurpose: u.commissionPurpose, healthCareUnitHsaId: u.healthCareUnitHsaId, healthCareProviderHsaId: u.healthCareProviderHsaId,
    ...({ lakare: { healthcareProfessionalLicense: ['LK'] }, sjukskoterska: { healthcareProfessionalLicense: ['SJ'] } }[p.yrke] ?? {}) };
}
// Kopplar in testutfärdaren med fyra ögon och ger tjänstens id. lagsta sätts med en egen ändring med fyra ögon.
async function kopplaIn(b, { lagsta = null } = {}) {
  await b.som('sysf');
  const r = await b.post('/api/inloggningstjanster', { namn: 'Regionens inloggningstjänst (r15)', utfardare: op.iss, klientId: op.klientId, klientautentisering: 'client_secret_basic', hemlighetMiljo: 'VK_IDP_R15', motivering: 'Prov av tillitsnivåer.' });
  if (r.status !== 201) throw new Error(JSON.stringify(r.data));
  await b.som('sysf-2');
  expect((await b.post(`/api/inloggningstjanster/andring/${r.data.andring.id}/godkann`, {})).status).toBe(200);
  const id = r.data.andring.tjanst;
  if (lagsta) await andraLagsta(b, id, lagsta);
  await b.post('/api/logout', {});
  return id;
}
async function andraLagsta(b, id, niva) {
  await b.som('sysf');
  const f = await b.post(`/api/inloggningstjanster/${id}/tillitsniva`, { niva, motivering: 'Personal utan SITHS ska kunna logga in och bekräfta med passkey.' });
  if (f.status !== 201) throw new Error(JSON.stringify(f.data));
  await b.som('sysf-2');
  expect((await b.post(`/api/inloggningstjanster/andring/${f.data.andring.id}/godkann`, {})).status).toBe(200);
  return f.data.andring;
}
// En app för engångskoder för personen, registrerad medan personen är inloggad. Ger nyckeln.
async function totpFor(b, id) {
  await b.som(id);
  const r = (await b.post('/api/flerfaktor/totp/borja')).data;
  const h = ff.fran32(r.nyckel);
  expect((await b.post('/api/flerfaktor/totp', { kod: ff.totp(h, Date.now()) })).status).toBe(201);
  await b.post('/api/logout', {});
  return h;
}

describe('Tillitsnivån tolkas ur acr', () => {
  test('tillitsnivå: Ineras, DIGG:s och eIDAS identifierare tolkas, en självdeklarerad nivå räknas lägre och ett okänt eller saknat värde är en faktor', () => {
    expect(tillit.tolka(SAMBI(3))).toMatchObject({ niva: 3, kand: true });
    expect(tillit.tolka('http://id.elegnamnden.se/loa/1.0/loa2')).toMatchObject({ niva: 2, kand: true });
    expect(tillit.tolka('http://id.elegnamnden.se/loa/1.0/loa4').niva).toBe(4);
    expect(tillit.tolka('http://id.elegnamnden.se/loa/1.0/eidas-sub').niva).toBe(3);
    expect(tillit.tolka('http://id.swedenconnect.se/loa/1.0/uncertified-loa3')).toMatchObject({ niva: 2, sjalvdeklarerad: true });
    expect(tillit.tolka('urn:okand:loa3')).toMatchObject({ niva: null, kand: false });
    expect(tillit.tolka(undefined)).toMatchObject({ niva: null, kand: false });
    expect(tillit.tolka({ niva: 3 }).niva).toBeNull();
    expect(tillit.jamforbar(tillit.tolka(undefined))).toBe(1);
    // amr visas men avgör aldrig.
    expect(tillit.forUppdrag({ tillitsniva: SAMBI(2), amr: ['mfa', 'sc', 'pin'], extern: true, tjanstNamn: 'X' }).flerfaktor).toBe(false);
    expect(tillit.forUppdrag({ tillitsniva: SAMBI(2), andraFaktor: 'passkey' }).flerfaktor).toBe(true);
    expect(tillit.forUppdrag({ tillitsniva: SAMBI(3) }).flerfaktor).toBe(true);
    expect(tillit.forUppdrag({ tillitsniva: SAMBI(2), andraFaktor: 'annat' }).flerfaktor).toBe(false);
    expect(tillit.lagstaNiva(undefined)).toBe(3);
    expect(tillit.lagstaNiva('2')).toBe(2);
    expect(tillit.lagstaNiva(5)).toBeNull();
    expect(tillit.lagstaNiva('2; DROP')).toBeNull();
  });
});

describe('SITHS och tillitsnivå 3 som flerfaktor', () => {
  test('simulerat SITHS-kort: demorollen loggar in direkt med tillitsnivå 3, också med en registrerad faktor', async () => {
    const b = webblasare();
    await totpFor(b, 'lak-vc');
    const r = await b.som('lak-vc');
    expect(r.data.inloggad).toBe(true);
    expect(r.data.flerfaktor.kravs).toBeUndefined();
    expect(r.data.inloggningsniva).toMatchObject({ niva: 3, flerfaktor: true });
    expect(r.data.inloggningsniva.metod).toContain('SITHS-kort med PIN-kod');
    expect(r.data.lasnyckel).toBeTruthy();
    expect(sakerhet(b).at(-1)).toMatchObject({ typ: 'inloggning', personal_id: 'lak-vc' });
    expect(sakerhet(b).at(-1).beskrivning).toContain('tillitsnivå 3, flerfaktor');
    // Översikten över flerfaktorn säger varför ingen faktor behövdes.
    const o = (await b.get('/api/flerfaktor')).data;
    expect(o.inloggning.text).toContain('redan flerfaktor');
    // Inloggningen med SITHS är en färsk bekräftelse: en faktor till kan läggas till direkt.
    expect((await b.post('/api/flerfaktor/totp/borja')).status).toBe(200);
  });

  test('simulerat SITHS-kort: utan kortet i demon (tillitsnivå 2) kompletteras inloggningen med faktorn, och utan faktor leds personen till att registrera en', async () => {
    const b = webblasare();
    const h = await totpFor(b, 'adm-kard');
    await b.post('/api/logout', {});
    const forsta = await b.post('/api/login', { personalId: 'adm-kard', tillitsniva: 2 });
    expect(forsta.data.inloggad).toBe(false);
    expect(forsta.data.flerfaktor).toMatchObject({ kravs: true, metoder: ['totp'] });
    expect(forsta.data.flerfaktor.orsak).toContain('tillitsnivå 2');
    expect((await b.get('/api/inkorg')).status).toBe(401);
    const r = await b.post('/api/login/flerfaktor', { typ: 'totp', kod: ff.totp(h, Date.now() + 30_000) });
    expect(r.data.inloggad).toBe(true);
    expect(r.data.inloggningsniva).toMatchObject({ niva: 2, flerfaktor: true, andraFaktor: 'totp' });
    expect(sakerhet(b).at(-1).beskrivning).toContain('tillitsnivå 2');
    // Utan faktor: registreringen är den andra faktorn, oavsett vårdgivaren.
    const c = webblasare();
    await c.get('/api/session');
    const u = await c.post('/api/login', { personalId: 'ssk-kard', tillitsniva: 2 });
    expect(u.data.flerfaktor).toMatchObject({ kravs: true, registrera: true, metoder: [] });
    expect(u.data.flerfaktor.text).toContain('tillitsnivå 2');
    // Bara nivå 2 och 3 finns i demon.
    expect((await c.post('/api/login', { personalId: 'ssk-kard', tillitsniva: 1 })).status).toBe(400);
  });

  test('biljett med nivå 3 från en godkänd inloggningstjänst räknas som flerfaktor, också med en registrerad faktor', async () => {
    const b = webblasare();
    await b.get('/api/session');
    const id = await kopplaIn(b);
    op.attribut = () => attributFor(db(b), 'lak-kard');
    op.manipulera = null;
    for (const krav of ['första', 'andra']) {
      await totpFor(b, 'lak-kard').catch(() => null);
      await b.post('/api/logout', {});
      const r = await b.extern(id);
      expect({ krav, ok: r.ok, flerfaktor: r.flerfaktor ?? null }).toEqual({ krav, ok: true, flerfaktor: null });
      const s = (await b.get('/api/session')).data;
      expect(s.personal.id).toBe('lak-kard');
      expect(s.inloggningsniva).toMatchObject({ niva: 3, flerfaktor: true });
      expect(sakerhet(b).at(-1)).toMatchObject({ typ: 'inloggning', personal_id: 'lak-kard' });
      expect(sakerhet(b).at(-1).beskrivning).toContain('tillitsnivå 3, flerfaktor');
    }
  });

  test('biljett med nivå 2 stoppas när tjänsten kräver nivå 3, och förklaringen säger vad som gäller och vem som kan ändra det', async () => {
    const b = webblasare();
    await b.get('/api/session');
    const id = await kopplaIn(b);
    op.attribut = () => attributFor(db(b), 'lak-kard');
    op.manipulera = (h, p) => [h, { ...p, acr: SAMBI(2) }];
    const r = await b.extern(id);
    expect(r.ok).toBe(false);
    expect(r.text).toContain('tillitsnivån räcker inte');
    expect(r.text).toContain('Inloggningen hade tillitsnivå 2');
    expect(r.text).toContain('lägst tillitsnivå 3');
    expect(r.text).toContain('Systemförvaltningen kan ändra');
    expect((await b.get('/api/session')).data.personal).toBeFalsy();
    expect(sakerhet(b).at(-1)).toMatchObject({ typ: 'inloggning_misslyckad' });
    expect(sakerhet(b).at(-1).beskrivning).toContain('tillitsnivå 2');
    op.manipulera = null;
  });

  test('biljett med nivå 2 godtas när tjänstens lägsta nivå är 2, men ger behörighet först efter passkey eller kod', async () => {
    const b = webblasare();
    await b.get('/api/session');
    const id = await kopplaIn(b, { lagsta: 2 });
    op.attribut = () => attributFor(db(b), 'ssk-kard');
    op.manipulera = (h, p) => [h, { ...p, acr: SAMBI(2) }];
    for (const krav of ['första', 'andra']) {
      db(b).query("DELETE FROM flerfaktorer WHERE agare_id = 'ssk-kard'").run();
      await b.post('/api/logout', {});
      // Utan faktor: resultatet bär utmaningen, och registreringen slutför inloggningen.
      const r = await b.extern(id);
      expect({ krav, ok: r.ok, registrera: r.flerfaktor?.registrera }).toEqual({ krav, ok: true, registrera: true });
      expect(r.flerfaktor.text).toContain('tillitsnivå 2');
      expect((await b.get('/api/session')).data.inloggad).toBe(false);
      expect((await b.get('/api/inkorg')).status).toBe(401);
      const bo = (await b.post('/api/flerfaktor/totp/borja')).data;
      const h = ff.fran32(bo.nyckel);
      const klar = await b.post('/api/flerfaktor/totp', { kod: ff.totp(h, Date.now()) });
      expect(klar.status).toBe(201);
      expect(klar.data.inloggad).toBe(true);
      expect(klar.data.inloggningsniva).toMatchObject({ niva: 2, flerfaktor: true, andraFaktor: 'totp' });
      // Nästa gång frågar systemet efter koden.
      await b.post('/api/logout', {});
      const igen = await b.extern(id);
      expect(igen.flerfaktor).toMatchObject({ kravs: true, metoder: ['totp'] });
      expect(igen.flerfaktor.registrera).toBeUndefined();
      const ok = await b.post('/api/login/flerfaktor', { typ: 'totp', kod: ff.totp(h, Date.now() + 30_000) });
      expect(ok.data.inloggad).toBe(true);
      expect(ok.data.personal.id).toBe('ssk-kard');
    }
    op.manipulera = null;
  });

  test('saknad nivå stoppas med tjänstens standard, och med lägsta nivå 1 räknas den som en faktor', async () => {
    const b = webblasare();
    await b.get('/api/session');
    const id = await kopplaIn(b);
    op.attribut = () => attributFor(db(b), 'lak-kard');
    op.manipulera = (h, p) => { const q = { ...p }; delete q.acr; return [h, q]; };
    const r = await b.extern(id);
    expect(r.ok).toBe(false);
    expect(r.text).toContain('ingen uppgift om tillitsnivå');
    op.manipulera = (h, p) => [h, { ...p, acr: 'urn:example:okand' }];
    expect((await b.extern(id)).text).toContain('en tillitsnivå som Vårdkällan inte känner igen');
    await andraLagsta(b, id, 1);
    await b.post('/api/logout', {});
    op.manipulera = (h, p) => { const q = { ...p }; delete q.acr; return [h, q]; };
    const en = await b.extern(id);
    expect(en.ok).toBe(true);
    expect(en.flerfaktor).toMatchObject({ kravs: true, registrera: true });
    expect(en.flerfaktor.text).toContain('utan känd tillitsnivå');
    op.manipulera = null;
  });

  test('en osignerad biljett eller en biljett med fel nyckel godtas aldrig, också med nivå 4', async () => {
    const b = webblasare();
    await b.get('/api/session');
    const id = await kopplaIn(b);
    op.attribut = () => attributFor(db(b), 'lak-kard');
    const egen = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    for (const [orsak, fn] of [
      ['signaturen stämmer inte', (h, p) => jwt.signera(h, { ...p, acr: SAMBI(4) }, egen)],
      ['algoritmen none godtas inte', (h, p) => `${b64({ ...h, alg: 'none' })}.${b64({ ...p, acr: SAMBI(4) })}.`],
    ]) {
      op.manipulera = fn;
      const r = await b.extern(id);
      expect({ orsak, ok: r.ok }).toEqual({ orsak, ok: false });
      expect(r.text).toContain(orsak);
      expect((await b.get('/api/session')).data.personal).toBeFalsy();
    }
    op.manipulera = null;
  });

  test('en inloggningstjänst som inte är godkänd går inte att logga in genom, oavsett nivå', async () => {
    const b = webblasare();
    await b.som('sysf');
    const r = await b.post('/api/inloggningstjanster', { namn: 'Ej godkänd tjänst (r15)', utfardare: op.iss, klientId: op.klientId, klientautentisering: 'client_secret_basic', hemlighetMiljo: 'VK_IDP_R15', motivering: 'Prov.' });
    expect(r.status).toBe(201);
    await b.post('/api/logout', {});
    expect((await b.get('/api/inloggning/tjanster')).data.tjanster).toEqual([]);
    const ut = await b.extern(r.data.andring.tjanst);
    expect(ut.ok).toBe(false);
    expect(ut.text).toContain('finns inte eller är avstängd');
    // En biljett med nivå 3 från en utfärdare som inte är den simulerade tjänsten godtas inte heller som biljett.
    const egen = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;
    const a = { iss: 'https://idp.example.invalid', aud: idp.MOTTAGARE, acr: idp.TILLITSNIVA, jti: 'r15-x', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60 };
    const f = await b.post('/api/login/biljett', { biljett: idp.signera({ alg: 'ES256', typ: 'JWT', kid: 'x' }, a, egen) });
    expect(f.status).toBe(401);
  });

  test('lägsta nivå per tjänst: ändringen kräver fyra ögon och motivering, systemet förklarar nivåerna och säkerhetsloggen visar beslutet', async () => {
    const b = webblasare();
    await b.get('/api/session');
    const id = await kopplaIn(b);
    await b.som('sysf');
    const o = (await b.get('/api/inloggningstjanster')).data;
    const t = o.tjanster.find(x => x.id === id);
    expect(t.lagstaTillitsniva).toBe(3);
    expect(t.lagstaTillitsnivaText).toContain('Tillitsnivå 3');
    expect(Object.keys(o.tillitsnivaer)).toEqual(['1', '2', '3', '4']);
    expect(o.tillitsnivaer['2'].text).toContain('passkey');
    // Fel värden och samma värde stoppas med en förklaring.
    expect((await b.post(`/api/inloggningstjanster/${id}/tillitsniva`, { niva: 7, motivering: 'x' })).status).toBe(400);
    expect((await b.post(`/api/inloggningstjanster/${id}/tillitsniva`, { niva: '2', motivering: '' })).data.fel).toContain('Skriv varför');
    expect((await b.post(`/api/inloggningstjanster/${id}/tillitsniva`, { niva: 3, motivering: 'Samma.' })).data.fel).toContain('redan');
    const f = await b.post(`/api/inloggningstjanster/${id}/tillitsniva`, { niva: 2, motivering: 'Kommunens personal saknar SITHS.' });
    expect(f.status).toBe(201);
    expect(f.data.andring).toMatchObject({ atgard: 'andring', lagstaTillitsniva: 2, forraLagstaTillitsniva: 3 });
    expect(f.data.andring.atgardText).toBe('Ändrad lägsta tillitsnivå');
    // Samma systemförvaltare kan inte godkänna, och inget gäller ännu.
    expect((await b.post(`/api/inloggningstjanster/andring/${f.data.andring.id}/godkann`, {})).status).toBe(403);
    expect((await b.get('/api/inloggningstjanster')).data.tjanster.find(x => x.id === id).lagstaTillitsniva).toBe(3);
    // Bara systemförvaltningen.
    await b.som('lak-kard');
    expect((await b.post(`/api/inloggningstjanster/${id}/tillitsniva`, { niva: 2, motivering: 'x' })).status).toBe(403);
    await b.som('sysf-2');
    expect((await b.post(`/api/inloggningstjanster/andring/${f.data.andring.id}/godkann`, {})).status).toBe(200);
    expect((await b.get('/api/inloggningstjanster')).data.tjanster.find(x => x.id === id).lagstaTillitsniva).toBe(2);
    const rad = sakerhet(b).filter(x => x.typ === 'andrad_installning').at(-1);
    expect(rad.beskrivning).toContain('Ändrad lägsta tillitsnivå');
    expect(rad.beskrivning).toContain('från tillitsnivå 3 till tillitsnivå 2');
  });

  test('loggen: säkerhetsloggen visar metod och tillitsnivå för lyckade och misslyckade inloggningar, och sessionen visar dem', async () => {
    const b = webblasare();
    const s = (await b.som('ssk-kard')).data;
    expect(s.inloggningsniva).toMatchObject({ niva: 3, flerfaktor: true });
    expect(s.uppdrag.tillitsniva).toBe(idp.TILLITSNIVA);
    const rad = sakerhet(b).filter(x => x.typ === 'inloggning').at(-1);
    expect(rad.beskrivning).toBe('Inloggning med SITHS-kort med PIN-kod (simulerat), tillitsnivå 3, flerfaktor.');
    await b.post('/api/logout', {});
    await b.post('/api/login', { personalId: 'ssk-kard', tillitsniva: 2 });
    const vantar = sakerhet(b).filter(x => x.typ === 'flerfaktor').at(-1);
    expect(vantar.beskrivning).toContain('tillitsnivå 2');
  });

  test('känsliga handlingar: nödåtkomst, att häva en spärr och fyra ögon kräver en inloggning med flerfaktor, och en session utan nivå stoppas med förklaring', async () => {
    const b = webblasare();
    await b.som('lak-akut');
    const s = sandlada(app, b);
    // Med SITHS-kortet går nödåtkomsten som förut.
    const p = s.db.query("SELECT id FROM patienter WHERE id = 'p02'").get();
    expect(p).toBeTruthy();
    const ok = await b.post('/api/patient/p02/val', { typ: 'nodatkomst', syfte: 'Medvetslös patient på akuten.' });
    expect(ok.status).toBe(200);
    // En session vars uppdrag saknar nivå, till exempel från en äldre version, stoppas.
    s.uppdrag = { ...s.uppdrag, tillitsniva: null };
    const nej = await b.post('/api/patient/p02/val', { typ: 'nodatkomst', syfte: 'Medvetslös patient på akuten.' });
    expect(nej.status).toBe(403);
    expect(nej.data.kod).toBe('kraver_flerfaktor');
    expect(nej.data.fel).toContain('SITHS-kortet');
    // Andra val än nödåtkomst och spärr stoppas inte.
    expect((await b.post('/api/patient/p02/val', { typ: 'andra_enheter', syfte: 'Läsa tidigare vård.' })).status).not.toBe(403);
    // Godkännanden med fyra ögon.
    await b.som('sysf-2');
    sandlada(app, b).uppdrag = { ...sandlada(app, b).uppdrag, tillitsniva: undefined };
    expect((await b.post('/api/konfiguration/1/godkann', {})).data.kod).toBe('kraver_flerfaktor');
    expect((await b.post('/api/inloggningstjanster/andring/1/godkann', {})).data.kod).toBe('kraver_flerfaktor');
    expect(sakerhet(b).at(-1)).toMatchObject({ typ: 'avvisat_anrop', status: 403 });
  });
});

// Beslut från Jonas 2026-11-14: invånarens e-legitimation med tillitsnivå 3 räknas som flerfaktor på samma sätt, och
// Vårdkällan begär tjänstens lägsta nivå med acr_values men prövar ändå nivån i svaret.
describe('E-legitimation i Min journal och acr_values', () => {
  test('e-legitimation: invånaren loggar in direkt med tillitsnivå 3, också med en faktor', async () => {
    const b = webblasare();
    await b.som('lak-kard');
    await b.post('/api/logout', {});
    // En registrerad app för engångskoder behövs inte efter e-legitimationen.
    expect((await b.post('/api/login/invanare', { invanareId: 'inv-p01', tillitsniva: 2 })).data.flerfaktor.registrera).toBe(true);
    const bo = (await b.post('/api/flerfaktor/totp/borja')).data;
    expect((await b.post('/api/flerfaktor/totp', { kod: ff.totp(ff.fran32(bo.nyckel), Date.now()) })).data.inloggad).toBe(true);
    await b.post('/api/logout', {});
    const r = await b.post('/api/login/invanare', { invanareId: 'inv-p01' });
    expect(r.data.inloggad).toBe(true);
    expect(r.data.roll).toBe('invanare');
    expect(r.data.flerfaktor.kravs).toBeUndefined();
    expect(r.data.inloggningsniva).toMatchObject({ niva: 3, flerfaktor: true });
    expect(r.data.inloggningsniva.metod).toContain('E-legitimation (simulerad)');
    expect(sakerhet(b).at(-1)).toMatchObject({ typ: 'inloggning', invanare_id: 'inv-p01' });
    expect(sakerhet(b).at(-1).beskrivning).toContain('tillitsnivå 3, flerfaktor');
    expect((await b.get('/api/min/journal/p01')).status).toBe(200);
    const o = (await b.get('/api/flerfaktor')).data;
    expect(o.inloggning.text).toContain('redan flerfaktor');
  });

  test('e-legitimation: med lägre tillitsnivå kompletteras inloggningen i Min journal med faktorn, och utan faktor leds invånaren till registreringen', async () => {
    const b = webblasare();
    await b.get('/api/session');
    const u = await b.post('/api/login/invanare', { invanareId: 'inv-p02', tillitsniva: 2 });
    expect(u.data.inloggad).toBe(false);
    expect(u.data.flerfaktor).toMatchObject({ kravs: true, registrera: true });
    expect(u.data.flerfaktor.text).toContain('tillitsnivå 2');
    expect((await b.get('/api/min/journal/p02')).status).toBe(401);
    const bo = (await b.post('/api/flerfaktor/totp/borja')).data;
    const h = ff.fran32(bo.nyckel);
    const klar = await b.post('/api/flerfaktor/totp', { kod: ff.totp(h, Date.now()) });
    expect(klar.data.inloggad).toBe(true);
    expect(klar.data.inloggningsniva).toMatchObject({ niva: 2, flerfaktor: true, andraFaktor: 'totp' });
    await b.post('/api/logout', {});
    const igen = await b.post('/api/login/invanare', { invanareId: 'inv-p02', tillitsniva: 2 });
    expect(igen.data.flerfaktor).toMatchObject({ kravs: true, metoder: ['totp'] });
    expect(igen.data.flerfaktor.orsak).toContain('din journal');
    // Bara nivå 2 och 3 finns i demon, och invånarens biljett godtas aldrig som personalens.
    expect((await b.post('/api/login/invanare', { invanareId: 'inv-p02', tillitsniva: 4 })).status).toBe(400);
    expect((await b.post('/api/login/biljett', { biljett: idp.autentiseraInvanare({ id: 'inv-p02' }) })).status).toBe(401);
  });

  test('e-legitimation: ombud och vårdnadshavare loggar in som förut, med tillitsnivå 3', async () => {
    for (const id of ['inv-om01', 'inv-vh01']) {
      const b = webblasare();
      const r = await b.post('/api/login/invanare', { invanareId: id });
      expect({ id, inloggad: r.data.inloggad, niva: r.data.inloggningsniva?.niva }).toEqual({ id, inloggad: true, niva: 3 });
    }
  });

  test('acr_values: inloggningsbegäran ber om tjänstens lägsta nivå och högre, och nivån i svaret prövas ändå', async () => {
    const b = webblasare();
    await b.get('/api/session');
    const id = await kopplaIn(b);
    op.attribut = () => attributFor(db(b), 'lak-kard');
    op.manipulera = null;
    expect((await b.extern(id)).ok).toBe(true);
    // Testutfärdaren anger inga stödda nivåer, så systemet ber om de kända nivåerna 3 och 4 i båda ramverken.
    const nivaer = op.begaran.acr_values.split(' ');
    expect(nivaer).toEqual(expect.arrayContaining([SAMBI(3), SAMBI(4), 'http://id.elegnamnden.se/loa/1.0/loa3', 'http://id.elegnamnden.se/loa/1.0/loa4']));
    expect(nivaer.some(n => tillit.tolka(n).niva < 3)).toBe(false);
    expect(nivaer.some(n => /uncertified/.test(n))).toBe(false);
    // Tjänsten svarar ändå med nivå 2: biljetten avvisas.
    await b.post('/api/logout', {});
    op.manipulera = (h, p) => [h, { ...p, acr: SAMBI(2) }];
    expect((await b.extern(id)).text).toContain('tillitsnivån räcker inte');
    op.manipulera = null;
    // Med lägsta nivå 2 ber systemet också om nivå 2, och med nivå 1 om ingen viss nivå.
    await andraLagsta(b, id, 2);
    await b.post('/api/logout', {});
    await b.extern(id);
    expect(op.begaran.acr_values.split(' ')).toEqual(expect.arrayContaining([SAMBI(2), SAMBI(3)]));
    await andraLagsta(b, id, 1);
    await b.post('/api/logout', {});
    await b.extern(id);
    expect(op.begaran.acr_values).toBeUndefined();
  });

  test('acr_values: en tjänst som anger sina nivåer får bara de nivåer den stödjer, från lägsta nivån', async () => {
    const b = webblasare();
    await b.som('sysf');
    const f = await b.post('/api/inloggningstjanster', { ovning: true, motivering: 'Prov av acr_values.' });
    expect(f.status).toBe(201);
    await b.som('sysf-2');
    await b.post(`/api/inloggningstjanster/andring/${f.data.andring.id}/godkann`, {});
    await b.post('/api/logout', {});
    const r = await fetch(`${app.url}/api/inloggning/extern/${f.data.andring.tjanst}`, { headers: { Cookie: b.kaka() }, redirect: 'manual' });
    const u = new URL(r.headers.get('location'), app.url);
    // Övningstjänsten anger Sambi nivå 2 och 3. Med lägsta nivå 3 begärs bara nivå 3.
    expect(u.searchParams.get('acr_values')).toBe(SAMBI(3));
  });
});
