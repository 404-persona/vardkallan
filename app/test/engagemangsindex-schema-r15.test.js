import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { testserver, klient, sandlada, nyDb } from './hjalp.js';
import * as ei from '../src/engagemangsindex.js';
import { schemalagg } from '../src/r15r2-rutter.js';

// Runda 15, r2, säkerhetsgranskningen av kön till engagemangsindex: borttagningar när en patient får skyddad identitet
// eller en spärr går före allt annat och skickas direkt i samma handling, timerns schema svälter ingen sandlåda, och en
// uttrycklig ändring får sin prioritet också när en avstämning väntar.

let app;
beforeAll(() => { app = testserver(); });
afterAll(() => app.stopp());
const indexet = (db, pnr) => db.query('SELECT kategori FROM rivta_sim_engagemang WHERE personid = ?').all(pnr).map(r => r.kategori);
const grundladda = (db) => { ei.markeraPatienter(db); ei.skicka(db, { tvinga: true }); };
const T = 'Kön till engagemangsindex, ordning och prioritet';

describe(T, () => {
  test('många sandlådor: borttagningen för en patient som just har fått skyddad identitet i den sista går fram inom ett varv', () => {
    const dbs = [];
    for (let i = 0; i < 5; i++) {
      const db = nyDb();
      grundladda(db);
      // Varje sandlåda har en lång avstämning som har väntat länge.
      ei.markeraPatienter(db);
      ei.skicka(db, { nu: new Date(Date.now() - 3600_000), maxPatienter: 0 });
      db.query("UPDATE ei_markerade SET markerad = '2000-01-01T00:00:00.000Z'").run();
      dbs.push(db);
    }
    const sista = dbs.at(-1);
    expect(indexet(sista, '196603193373').length).toBeGreaterThan(0);
    sista.query("UPDATE patienter SET skyddad = 1 WHERE id = 'p02'").run();
    // Ett varv utan tid över: det brådskande skickas ändå, och det först.
    schemalagg(dbs, { maxMs: 0 });
    expect(indexet(sista, '196603193373')).toEqual([]);
  });

  test('en spärr eller skyddad identitet tas bort ur indexet direkt i samma handling', async () => {
    const k = await inloggad();
    const db = sandlada(app, k).db;
    grundladda(db);
    expect(indexet(db, '196603193373').length).toBeGreaterThan(0);
    // En handling som skyddar identiteten, följd av svaret på samma anrop.
    db.query("UPDATE patienter SET skyddad = 1 WHERE id = 'p02'").run();
    expect((await k.post('/api/patient/p01/sammanhallen', { syfte: 'Bedömning', samtycke: true })).status).toBe(200);
    expect(indexet(db, '196603193373')).toEqual([]);
  });

  test('en uttrycklig ändring får prioritet också när en avstämning väntar för samma patient', () => {
    const db = nyDb();
    grundladda(db);
    ei.markeraPatienter(db);
    ei.markeraPatienter(db, ['p05']);
    expect(db.query("SELECT count(*) AS n FROM ei_markerade WHERE patient_id = 'p05' AND kalla IS NULL").get().n).toBe(1);
    const nu = new Date();
    ei.skicka(db, { nu, maxPatienter: 0 });
    ei.skicka(db, { nu: new Date(nu.getTime() + 2 * 60_000), maxPatienter: 1 });
    expect(db.query("SELECT count(*) AS n FROM ei_markerade WHERE patient_id = 'p05'").get().n).toBe(0);
    expect(db.query("SELECT count(DISTINCT patient_id) AS n FROM ei_markerade WHERE kalla = 'avstamning'").get().n).toBeGreaterThan(10);
  });
});

async function inloggad() { const k = klient(app); await k.logga('lak-kard'); return k; }
