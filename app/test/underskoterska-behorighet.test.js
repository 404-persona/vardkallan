// Runda 15, r5 (säkerhetsfynd i granskningen av grenen): undersköterskan får skriva de anteckningar som vårdgivarens
// parameter och yrkesmallarna tillåter, och inget annat. Behörigheten är en egen, smal handling (skriv_observation) som
// bara anteckningsflödet godtar. Alla andra skrivvägar som prövar skriv_omvardnad (bilder och media, uppladdning,
// annoteringar, bilaga från remiss, formulärens förifyllnad och omvårdnadsprocessen) ska vara stängda som förut.
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { ROLLER, kanRoll } from '../src/atkomst.js';
import * as bilder from '../src/bilder.js';
import * as journal from '../src/journal.js';
import * as fm from '../src/formularmotor.js';
import * as konfiguration from '../src/konfiguration.js';
import { byggSeed } from '../src/db.js';
import { atk, personal, testserver, klient, sandlada } from './hjalp.js';

// Undersköterskans behörigheter på main före runda 15, i samma ordning.
const FORE = ['las_oversikt', 'las_omvardnad', 'las_lakemedel', 'las_matvarden', 'registrera_matvarde', 'las_admin', 'sok', 'vantrum', 'andra_enheter', 'samtycke_sparr',
  'visa_identitet', 'skriv_ut', 'ge_lakemedel', 'las_vardplan', 'vardplan_atgard', 'las_tvangsvard', 'utbildning', 'las_planering', 'utfora_uppgift', 'las_prover',
  'bestalla_prov_uppdrag', 'ta_prov', 'koppla_utrustning', 'las_operation'];
const fel = (fn) => { try { fn(); } catch (e) { return e; } return null; };

let app;
beforeAll(() => { app = testserver(); });
afterAll(() => app.stopp());

describe('Undersköterskans behörighet i runda 15', () => {
  test('undersköterskans behörigheter är desamma som före runda 15, med bara den smala handlingen för anteckningar tillagd', () => {
    expect(ROLLER.underskoterska.filter(h => h !== 'skriv_observation')).toEqual(FORE);
    expect(ROLLER.underskoterska).toContain('skriv_observation');
    const db = byggSeed();
    expect(kanRoll(personal(db, 'usk-kard'), 'skriv_omvardnad')).toBe(false);
    // Ingen annan roll har den smala handlingen.
    for (const [roll, h] of Object.entries(ROLLER)) if (roll !== 'underskoterska') expect(h).not.toContain('skriv_observation');
  });

  test('bilder och media: undersköterskan laddar inte upp, annoterar inte och för inte in en bilaga från en remiss', async () => {
    const db = byggSeed();
    expect(fel(() => bilder.ladda(atk(db, 'usk-kard', 'p01', {}, 'skriv_omvardnad'), {}))?.status).toBe(403);
    expect(fel(() => bilder.franRemissbilaga(atk(db, 'usk-kard', 'p01', {}, 'skriv_omvardnad'), 1, {}))?.status).toBe(403);
    const k = klient(app);
    await k.logga('usk-kard');
    for (const [metod, vag] of [['POST', '/api/patient/p01/media'], ['POST', '/api/patient/p01/media/uppladdning'], ['POST', '/api/patient/p01/media/remissbilaga/1']]) {
      expect((await k.raw(metod, vag, {})).status).toBe(403);
    }
    const s = sandlada(app, k).db;
    bilder.sakra(s);
    const m = s.query("SELECT id FROM media WHERE patient_id = 'p01' LIMIT 1").get();
    if (m) expect((await k.post(`/api/media/${m.id}/annoteringar`, {})).status).toBe(403);
  });

  test('sårdokumentationen och omvårdnadsprocessen är stängda för undersköterskan, men observationsanteckningen går att skriva, ändra och signera', async () => {
    const k = klient(app);
    await k.logga('usk-kard');
    // Beslut 2026-11-14: undersköterskan fyller i de formulär som vårdgivaren har gett yrket. Sårdokumentationen har hon inte.
    expect((await k.get('/api/patient/p01/formular/sar/forifyllnad')).status).toBe(403);
    expect((await k.get('/api/patient/p01/omvardnadsprocess')).status).toBe(403);
    expect((await k.post('/api/patient/p01/anteckningar', { typ: 'Tobaksvanor', tobak: {} })).status).toBe(403);
    expect((await k.post('/api/patient/p01/anteckningar', { typ: 'Omvårdnadsanteckning', sokord: [{ sokord: 'Sömn', text: 'x' }] })).status).toBe(403);
    const ny = await k.post('/api/patient/p01/anteckningar', { typ: 'Observationsanteckning', sokord: [{ sokord: 'Observation', text: 'Blek.' }] });
    expect(ny.status).toBe(201);
    expect((await k.put(`/api/anteckning/${ny.data.id}`, { sokord: [{ sokord: 'Observation', text: 'Blek och svettig.' }] })).status).toBe(200);
    expect((await k.post(`/api/anteckning/${ny.data.id}/signera`, {})).status).toBe(200);
    expect((await k.post(`/api/anteckning/${ny.data.id}/ratta`, { orsak: 'Fel ord', sokord: [{ sokord: 'Observation', text: 'Blek, inte svettig.' }] })).status).toBe(201);
    // Sessionens behörigheter till gränssnittet har den smala handlingen, inte skriv_omvardnad.
    const sess = (await k.get('/api/session')).data;
    const beh = JSON.stringify(sess);
    expect(beh).toContain('skriv_observation');
    expect(beh).not.toContain('skriv_omvardnad');
  });

  // Beslut 2026-11-14: formulär för observation och omvårdnad, styrda av samma parameter för yrken som mallarna.
  test('undersköterskan fyller i de formulär som vårdgivaren har gett yrket, fallriskbedömningen från början, och ett formulär som yrket inte har stoppas', async () => {
    const db = byggSeed();
    const usk = personal(db, 'usk-kard');
    expect(konfiguration.varde(db, 'journal.yrkesmallar.underskoterska')).toEqual(['Observationsanteckning', 'Fallriskbedömning']);
    expect(fm.mallarFor(db, usk).map(m => m.typ)).toEqual(['Fallriskbedömning']);
    const a = atk(db, 'usk-kard', 'p01', {}, 'skriv_observation');
    const f = fm.forifyllnad(a, 'fallrisk');
    expect(f.varden.alder.varde).toBeGreaterThan(60);
    expect(fel(() => fm.forifyllnad(a, 'sar'))?.status).toBe(403);
    const ny = journal.skapaAnteckning(a, { typ: 'Fallriskbedömning', formular: { alder: f.varden.alder.varde, fall: 'nej', lakemedel: 'ett', syn: 'nej', gang: 'hjalpmedel', forvirring: 'nej' } });
    expect(ny).toMatchObject({ kategori: 'omvardnad', typ: 'Fallriskbedömning' });
    expect(journal.signera(a, journal.hamtaAnteckningRad(db, ny.id)).status).toBe('signerad');
    expect(fel(() => journal.skapaAnteckning(a, { typ: 'Sårdokumentation', formular: { lage: [{ vy: 'bak', x: 56, y: 95 }], sartyp: 'trycksar' } }))?.status).toBe(403);
    // Den smala behörigheten öppnar inget annat: skriv_omvardnad har hon fortfarande inte.
    expect(kanRoll(usk, 'skriv_omvardnad')).toBe(false);
    // Parametern prövar formulären mot sandlådans aktiva formulär och deras kategori.
    const nyckel = 'journal.yrkesmallar.underskoterska';
    const sysf = personal(db, 'sysf');
    expect(konfiguration.forhandsvisa(db, sysf, { nyckel, varde: 'Observationsanteckning, Sårdokumentation' }).ok).toBe(true);
    expect(konfiguration.forhandsvisa(db, sysf, { nyckel, varde: 'Observationsanteckning, Påhittat formulär' }).varfor).toContain('ingen av journalens mallar eller formulär');
    // I API:t.
    const k = klient(app);
    await k.logga('usk-kard');
    expect((await k.get('/api/mallar')).data.map(m => m.typ)).toEqual(['Observationsanteckning', 'Fallriskbedömning']);
    expect((await k.get('/api/patient/p01/formular/fallrisk/forifyllnad')).status).toBe(200);
    expect((await k.get('/api/patient/p01/formular/sar/forifyllnad')).status).toBe(403);
  });
});
