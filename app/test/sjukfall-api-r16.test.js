// Runda 16, r2: API:t för stödet vid sjukskrivning genom servern, med inloggning och loggning som i gränssnittet.
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { testserver, klient, sandlada } from './hjalp.js';
import * as r3 from '../src/rivta-r3.js';
import { idag, addDagar } from '../src/db.js';

let app;
beforeAll(() => { app = testserver(); });
afterAll(() => app.stopp());

describe('Stödet vid sjukskrivning i API:t', () => {
  test('Sjukfall > API: läkaren signerar ett sjukintyg, ser sjukfallet och beslutsstödet, motiverar och förlänger med ett klick', async () => {
    const k = klient(app);
    await k.logga('lak-vc');
    const db = sandlada(app, k).db;
    const d = idag();
    db.query("INSERT INTO diagnoser (patient_id, enhet_id, kod, text, typ, datum) VALUES ('p11', 'vc-tybble', 'J06.9', 'Akut övre luftvägsinfektion', 'huvud', ?)").run(d);
    const s = await k.post('/api/patient/p11/intyg', { typ: 'LISJP' });
    const iid = s.data.oppna.split('/').pop();
    await k.post(`/api/intygsapplikation/${iid}`, { sysselsattning: 'nuvarande_arbete', nedsattning: 'heltid', fran: addDagar(d, -10), till: addDagar(d, 3) });
    // Beslutsstödet medan läkaren skriver: 14 dagar är inom Socialstyrelsens rekommendation för övre luftvägsinfektion.
    const b = await k.get(`/api/intygsapplikation/${iid}/beslutsstod`);
    expect(b.status).toBe(200);
    expect(b.data).toMatchObject({ total: 14, over: false, sjukintyg: true, kanMotivera: true });
    expect(b.data.beslutsstod.rekommenderadMaxDagar).toBe(14);
    expect((await k.post(`/api/intygsapplikation/${iid}/beslutsstod/motivering`, { motivering: 'Tungt arbete utomhus.' })).data.motivering).toBe('Tungt arbete utomhus.');
    expect((await k.post(`/api/intygsapplikation/${iid}/signera`)).data.status).toBe('signerat');
    const sj = await k.get('/api/patient/p11/sjukskrivning');
    expect(sj.status).toBe(200);
    expect(sj.data.pagaende[0]).toMatchObject({ dagar: 14, aktuellGrad: 100, uppskattadDag: 11 });
    expect(sj.data.forlangning.fran).toBe(addDagar(d, 4));
    const f = await k.post('/api/patient/p11/sjukskrivning/forlang', {});
    expect(f.status).toBe(201);
    const nytt = f.data.oppna.split('/').pop();
    const b2 = await k.get(`/api/intygsapplikation/${nytt}/beslutsstod`);
    // Med förlängningen blir sjukskrivningen 28 dagar: längre än rekommendationen, och motiveringen följde med.
    expect(b2.data).toMatchObject({ total: 28, tidigareDagar: 14, over: true, motiveringIIntyget: 'Tungt arbete utomhus.' });
    // Översikten: sjukfallet syns för läkaren, som har signerat det nuvarande intyget.
    const m = await k.get('/api/sjukskrivningar');
    expect(m.status).toBe(200);
    expect(m.data.sjukfall.map(x => x.patientId)).toContain('p11');
    // Varje anrop rörde patienten och loggades på patienten.
    expect(db.query("SELECT count(*) AS n FROM atkomstlogg WHERE patient_id = 'p11' AND resurs LIKE '%sjukskrivning%'").get().n).toBeGreaterThan(0);
    // En annan vårdenhet når inte beslutsstödet för utkastet, och sjuksköterskan förlänger inte.
    const kard = klient(app);
    await kard.logga('lak-kard');
    sandlada(app, kard).db = db;
    expect((await kard.get(`/api/intygsapplikation/${nytt}/beslutsstod`)).status).toBe(404);
    const ssk = klient(app);
    await ssk.logga('ssk-vc');
    sandlada(app, ssk).db = db;
    expect((await ssk.get('/api/patient/p11/sjukskrivning')).data.forlangning).toBeNull();
    expect((await ssk.post('/api/patient/p11/sjukskrivning/forlang', {})).status).toBe(403);
    expect((await ssk.get('/api/sjukskrivningar')).status).toBe(403);
    await r3.klart(db);
  }, 30_000);

  test('Sjukfall > API: verksamhetschefen ser vårdenhetens sjukfall som antal, och läkaren gör det inte', async () => {
    const k = klient(app);
    await k.logga('lak-vc');
    expect((await k.get('/api/sjukskrivningar/enhet')).status).toBe(403);
    const chef = klient(app);
    await chef.logga('vch-kard');
    const e = await chef.get('/api/sjukskrivningar/enhet');
    expect(e.status).toBe(200);
    expect(e.data.regel).toContain('skyddade personuppgifter');
    expect(Array.isArray(e.data.grad)).toBe(true);
  }, 30_000);
});
