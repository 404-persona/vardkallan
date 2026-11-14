import { describe, test, expect, beforeAll, afterAll, afterEach } from 'bun:test';
import { aterstallKlockan, stallKlockan } from './falsk-klocka.js';
import { testserver, klient, sandlada } from './hjalp.js';
import * as nationella from '../src/rivta/nationella.js';
import * as samtycke from '../src/samtycke-nationellt.js';

// Runda 15, r2, andra omgången (beslut 2026-11-14): samtyckets giltighet. Förvalet är så länge vårdrelationen pågår, som
// lag (2022:913) 3 kap. 1 § ändå kräver för åtkomsten. Patienten kan i stället välja en viss tid eller tills vidare, och
// samma giltighet skickas till samtyckestjänsten i kontraktets form (EndDate eller inget slutdatum).

let app;
beforeAll(() => { app = testserver(); });
afterAll(() => app.stopp());
afterEach(() => { nationella.satt(null); aterstallKlockan(); });
const inloggad = async (id) => { const k = klient(app); await k.logga(id); return k; };
const hamta = (k, body = {}) => k.post('/api/patient/p01/sammanhallen', { syfte: 'Bedömning av patientens hjärtsvikt', ...body });
const lakare = (db) => db.query("SELECT * FROM personal WHERE id = 'lak-kard'").get();
const iTjansten = (db, id) => db.query("SELECT * FROM rivta_sim_samtycken WHERE intyg_id = (SELECT intyg_id FROM samtycke_utkorg WHERE samtycke_id = ? AND handling = 'registrera')").get(id);
// Kardiologens vårdrelation till Gunnar Åkesson upphör i sandlådan.
function utanVardrelation(db) {
  db.query("UPDATE vardkontakter SET ger_vardrelation = 0 WHERE patient_id = 'p01'").run();
  db.query("DELETE FROM listningar WHERE patient_id = 'p01'").run();
  db.query("UPDATE remisser SET status = 'svar_kvitterat', svar_kvitterat_tid = '2000-01-01T00:00:00.000Z' WHERE patient_id = 'p01'").run();
}

describe('Samtyckets giltighet', () => {
  test('förvalet gäller så länge vårdrelationen pågår, utan slutdatum i tjänsten, och upphör när vårdrelationen upphör', async () => {
    const k = await inloggad('lak-kard');
    const db = sandlada(app, k).db;
    const d = (await hamta(k, { samtycke: true })).data;
    expect(d.samtycke).toMatchObject({ giltighet: 'vardrelation', giltigTill: null });
    expect(d.samtycke.giltighetText).toBe('Samtycket gäller så länge patienten har en vårdrelation till vårdenheten.');
    expect(iTjansten(db, d.samtycke.id).slut).toBeNull();
    // Vårdrelationen upphör: systemet ser det själv, och samtycket upphör här och i tjänsten.
    utanVardrelation(db);
    samtycke.stamAvGiltighet(db);
    const s = db.query('SELECT * FROM sammanhallen_samtycken WHERE id = ?').get(d.samtycke.id);
    expect(s.aterkallat).toBeTruthy();
    expect(s.aterkallat_kalla).toBe('vardrelation');
    expect(iTjansten(db, d.samtycke.id).aterkallat).toBeTruthy();
    expect(samtycke.prova({ db, personal: lakare(db), patientId: 'p01' }).text).toBe('Patientens samtycke upphörde när vårdrelationen upphörde. Fråga patienten om samtycke igen.');
  });

  test('en viss tid skickas som slutdatum till tjänsten, och samtycket gäller inte efter dagen', async () => {
    const k = await inloggad('lak-kard');
    const db = sandlada(app, k).db;
    const till = new Date(Date.now() + 10 * 86400_000).toISOString().slice(0, 10);
    const d = (await hamta(k, { samtycke: true, giltighet: 'tid', giltigTill: till })).data;
    expect(d.samtycke).toMatchObject({ giltighet: 'tid', giltigTill: till });
    expect(d.samtycke.giltighetText).toContain('Samtycket gäller till och med den');
    expect(iTjansten(db, d.samtycke.id).slut).toBe(`${till}T23:59:59`);
    stallKlockan(new Date(Date.now() + 12 * 86400_000));
    const p = samtycke.prova({ db, personal: lakare(db), patientId: 'p01' });
    expect(p.galler).toBe(false);
    expect(db.query('SELECT aterkallat_kalla FROM sammanhallen_samtycken WHERE id = ?').get(d.samtycke.id).aterkallat_kalla).toBe('utgangen');
    expect(p.text).toBe('Patientens samtycke gällde till och med en dag som har passerat. Fråga patienten om samtycke igen.');
  });

  test('tills vidare gäller också när vårdrelationen har upphört, tills patienten återkallar', async () => {
    const k = await inloggad('lak-kard');
    const db = sandlada(app, k).db;
    const d = (await hamta(k, { samtycke: true, giltighet: 'tillsvidare' })).data;
    expect(d.samtycke.giltighetText).toBe('Samtycket gäller tills patienten återkallar det.');
    expect(iTjansten(db, d.samtycke.id).slut).toBeNull();
    utanVardrelation(db);
    samtycke.stamAvGiltighet(db);
    expect(db.query('SELECT aterkallat FROM sammanhallen_samtycken WHERE id = ?').get(d.samtycke.id).aterkallat).toBeNull();
  });

  test('personalen anger bara patientens svar: okänd giltighet, ett datum som har passerat eller saknas ger ett fel med fältet', async () => {
    const k = await inloggad('lak-kard');
    const db = sandlada(app, k).db;
    expect((await hamta(k, { samtycke: true, giltighet: 'evigt' })).data.falt).toEqual(['giltighet']);
    expect((await hamta(k, { samtycke: true, giltighet: 'tid' })).data.falt).toEqual(['giltigTill']);
    expect((await hamta(k, { samtycke: true, giltighet: 'tid', giltigTill: '2020-01-01' })).data.falt).toEqual(['giltigTill']);
    expect((await hamta(k, { samtycke: true, giltighet: 'tid', giltigTill: 12 })).data.falt).toEqual(['giltigTill']);
    expect(db.query("SELECT count(*) AS n FROM sammanhallen_samtycken WHERE patient_id = 'p01'").get().n).toBe(0);
    // Valen förklaras på vanlig svenska i svaret, och giltigheten ändras inte i efterhand.
    expect((await k.get('/api/patient/p01/sammanhallen')).data.giltigheter.map(g => g.id)).toEqual(['vardrelation', 'tid', 'tillsvidare']);
    const d = (await hamta(k, { samtycke: true })).data;
    expect(() => db.query("UPDATE sammanhallen_samtycken SET giltighet = 'tillsvidare' WHERE id = ?").run(d.samtycke.id)).toThrow();
  });
});
