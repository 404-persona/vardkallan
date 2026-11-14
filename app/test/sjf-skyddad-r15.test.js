import { describe, test, expect, beforeAll, afterAll, afterEach } from 'bun:test';
import { testserver, klient, sandlada } from './hjalp.js';
import * as sj from '../src/sammanhallen.js';
import * as nationella from '../src/rivta/nationella.js';
import { anropslogg } from '../src/rivta/index.js';

// Runda 15, r2, andra omgången: sammanhållen journalföring för patienter med skyddade personuppgifter. Ineras villkor för
// NPÖ (version 1.4, avsnitt 6.2.2): uppgifter om patienter med sekretessmarkering eller skyddad folkbokföring
// tillgängliggörs inte. Patientens skydd går först, men nödåtkomst stoppas aldrig när uppgifterna behövs för vården.

let app;
beforeAll(() => { app = testserver(); });
afterAll(() => app.stopp());
afterEach(() => nationella.satt(null));
const inloggad = async (id) => { const k = klient(app); await k.logga(id); return k; };
const nationellaAnrop = (db) => anropslogg(db, { max: 1000 }).filter(a => a.riktning === 'ut').length;
const T = 'Sammanhållen journalföring och skyddade personuppgifter';

describe(T, () => {
  test('utan nödåtkomst hämtas inget och inget slås upp i de nationella tjänsterna med patientens identitet', async () => {
    const k = await inloggad('lak-kard');
    const db = sandlada(app, k).db;
    db.query("UPDATE patienter SET skyddad = 1 WHERE id = 'p01'").run();
    const fore = nationellaAnrop(db);
    const d = (await k.get('/api/patient/p01/sammanhallen')).data;
    expect(d).toMatchObject({ hamtningMojlig: false, hamtad: false, poster: [], sparradeHosAnnan: false, text: sj.SKYDDAD_TEXT });
    const r = await k.post('/api/patient/p01/sammanhallen', { syfte: 'Bedömning', samtycke: true });
    expect(r.status).toBe(409);
    expect(r.data.fel ?? r.data.text ?? JSON.stringify(r.data)).toContain('skyddade personuppgifter');
    expect((await k.get('/api/patient/p01/oversikt')).data.tidslinje.some(t => t.typ === 'extern')).toBe(false);
    expect(nationellaAnrop(db)).toBe(fore);
  });

  test('vid nödåtkomst hämtas uppgifterna som för andra patienter, spärrarna gäller och hämtningen loggas med nödåtkomst', async () => {
    const k = await inloggad('lak-kard');
    const db = sandlada(app, k).db;
    db.query("UPDATE patienter SET skyddad = 1 WHERE id = 'p13'").run();
    expect((await k.post('/api/patient/p13/val', { typ: 'nodatkomst', syfte: 'Patienten är medvetslös' })).status).toBe(200);
    const r = await k.post('/api/patient/p13/sammanhallen', { syfte: 'Akut bedömning' });
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ hamtningMojlig: true, hamtad: true, grund: 'nodatkomst' });
    expect(r.data.poster.length).toBe(sj.POSTER.p13.filter(p => !p.sparrad).length);
    expect(JSON.stringify(r.data)).not.toContain(sj.POSTER.p13.find(p => p.sparrad).rubrik);
    expect(db.query("SELECT grund FROM atkomstlogg WHERE patient_id = 'p13' AND resurs LIKE 'sammanhallen:%' ORDER BY id DESC").get().grund).toBe('nodatkomst');
    // Inget intyg om nödsituation och inget samtycke lämnas till samtyckestjänsten för en skyddad patient.
    expect(db.query("SELECT count(*) AS n FROM samtycke_utkorg WHERE patient_id = 'p13'").get().n).toBe(0);
  });

  test('patienten anmäls aldrig till engagemangsindex, och ett valt samtycke ger ingen hämtning efter att identiteten har skyddats', async () => {
    const k = await inloggad('lak-kard');
    const db = sandlada(app, k).db;
    const r = await k.post('/api/patient/p01/sammanhallen', { syfte: 'Bedömning', samtycke: true });
    expect(r.data.hamtad).toBe(true);
    db.query("UPDATE patienter SET skyddad = 1 WHERE id = 'p01'").run();
    const fore = nationellaAnrop(db);
    const d = (await k.get('/api/patient/p01/sammanhallen')).data;
    expect(d).toMatchObject({ hamtad: false, poster: [], hamtningMojlig: false });
    expect(nationellaAnrop(db)).toBe(fore);
    const ei = await import('../src/engagemangsindex.js');
    expect(ei.onskat(db, 'p01')).toEqual({ personid: null, poster: [] });
  });
});
