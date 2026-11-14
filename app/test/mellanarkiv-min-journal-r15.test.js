// Beslut 2026-11-14 (runda 15, r3, Sussa 5.4.2.2): Min journal visar det som har förts till mellanarkivet, med exakt
// samma regler som resten av det som patienten ser där. Testnamnen står i src/sussa/runda15-r3.js.
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { testserver, klient, sandlada, personal } from './hjalp.js';
import * as mellanarkiv from '../src/mellanarkiv.js';
import { ARKIV_ETIKETT } from '../src/patientvy.js';

let app;
beforeAll(() => { app = testserver(); });
afterAll(() => app.stopp());

const db = (k) => sandlada(app, k).db;
const invanare = async (id, k = klient(app)) => { const r = await k.post('/api/login/invanare', { invanareId: id }); if (r.status !== 200) throw new Error(JSON.stringify(r.data)); return k; };
const arkiverade = (x) => (x ?? []).filter(a => String(a.id).startsWith('ma-'));

// En avslutad kontakt 2012 på vårdcentralen med en tillfällig diagnos och en kvitterad remiss, som förs till mellanarkivet.
function gammalKontakt(d, pid = 'p01') {
  const vk = Number(d.query("INSERT INTO vardkontakter (patient_id, enhet_id, typ, start, slut, plats, orsak) VALUES (?, 'vc-tybble', 'oppenvard', '2012-02-01T09:00:00.000Z', '2012-02-01T09:30:00.000Z', 'Mottagningen', 'Halsont och feber') RETURNING id").get(pid).id);
  d.query("INSERT INTO diagnoser (patient_id, enhet_id, vardkontakt_id, kod, text, typ, datum) VALUES (?, 'vc-tybble', ?, 'J06.9', 'Akut övre luftvägsinfektion', 'huvud', '2012-02-01')").run(pid, vk);
  d.query(`INSERT INTO remisser (patient_id, fran_enhet_id, till_enhet_id, avsandare_id, fragestallning, prioritet, svar_senast, status, skickad_tid, bedomd_tid, beslut, besvarad_tid, svar, svar_kvitterat_tid)
    VALUES (?, 'vc-tybble', 'uso-kard', 'lak-vc', 'Bedömning av återkommande halsfluss', 'normal', '2012-03-01', 'svar_kvitterat', '2012-02-01T10:00:00.000Z', '2012-02-03T10:00:00.000Z', 'accepterad', '2012-02-20T10:00:00.000Z', 'Ingen åtgärd behövs.', '2012-02-21T10:00:00.000Z')`).run(pid);
}
function overfor(d) {
  const b = d.query(`INSERT INTO arkivbeslut (typ, beslutsfattare, diarienummer, beslutsdatum, lagrum, omfattning, registrerad, registrerad_av)
    VALUES ('leverans', 'Vårdgivarens arkivansvarige', 'RS 2026-701', '2026-11-14', 'Arkivlagen', ?, '2026-11-14', 'ark') RETURNING id`).get(JSON.stringify({ urval: 'mellanarkiv', ar: 5, fore: '2016-01-01' })).id;
  return mellanarkiv.overfor(d, personal(d, 'ark'), d.query('SELECT * FROM arkivbeslut WHERE id = ?').get(b));
}

describe('Min journal och mellanarkivet', () => {
  test('Min journal visar anteckningar, mätvärden, diagnoser, läkemedel, remisser och vårdkontakter ur mellanarkivet, märkta som äldre uppgifter', async () => {
    const k = await invanare('inv-p01');
    const d = db(k);
    gammalKontakt(d);
    overfor(d);
    const ant = (await k.get('/api/min/journal/p01/anteckningar')).data.anteckningar;
    const urAnt = arkiverade(ant);
    expect(urAnt.length).toBeGreaterThanOrEqual(3);
    expect(urAnt.every(a => a.kallaEtikett === ARKIV_ETIKETT)).toBe(true);
    // Listan står i datumordning, och de äldre uppgifterna står sist.
    expect(ant.at(-1).arkiv).toBe(true);
    const full = await k.get(`/api/min/journal/p01/anteckning/${urAnt[0].id}`);
    expect(full.status).toBe(200);
    expect(full.data.sokord.length).toBeGreaterThan(0);
    expect(d.query('SELECT * FROM atkomstlogg WHERE resurs = ? ORDER BY id DESC').get(`min:anteckning:${urAnt[0].id}`)).toMatchObject({ invanare_id: 'inv-p01', patient_id: 'p01' });
    const lm = (await k.get('/api/min/journal/p01/lakemedel')).data;
    expect(arkiverade(lm.tidigare).map(o => o.ordinationsorsak)).toContain('Feber och muskelvärk vid influensa');
    expect(arkiverade(lm.aktuella)).toEqual([]);
    const dia = arkiverade((await k.get('/api/min/journal/p01/diagnoser')).data.diagnoser);
    expect(dia.map(x => x.kod)).toContain('J06.9');
    const rem = arkiverade((await k.get('/api/min/journal/p01/remisser')).data.remisser);
    expect(rem[0]).toMatchObject({ fran: 'Vårdcentralen Tybble', status: 'svar_kvitterat', svar: 'Ingen åtgärd behövs.', kallaEtikett: ARKIV_ETIKETT });
    const vk = arkiverade((await k.get('/api/min/journal/p01/vardkontakter')).data.vardkontakter);
    expect(vk[0]).toMatchObject({ orsak: 'Halsont och feber', pagaende: false });
    // Doserna visas inte i Min journal, som i dag, och ingen uppgift har personalens id.
    expect(JSON.stringify(lm)).not.toContain('Patienten avböjde');
    expect(JSON.stringify([ant, lm, dia, rem, vk])).not.toMatch(/Practitioner\//);
  }, 30_000);

  test('samma visningsregler som i övrigt: en anteckningstyp som inte visas i Min journal visas inte heller ur mellanarkivet, och den räknas', async () => {
    const k = await invanare('inv-p01');
    const d = db(k);
    const id = d.query("SELECT id FROM mellanarkiv_handlingar WHERE slag = 'anteckning' AND enhet_id = 'uso-kard'").get().id;
    expect(arkiverade((await k.get('/api/min/journal/p01/anteckningar')).data.anteckningar).map(a => a.id)).toContain(`ma-${id}`);
    d.query("INSERT INTO visningsregler (enhet_id, anteckningstyp, visning, dagar, motivering) VALUES ('uso-kard', 'Mottagningsanteckning', 'visas_inte', NULL, 'Test av regel')").run();
    const efter = (await k.get('/api/min/journal/p01/anteckningar')).data;
    expect(efter.anteckningar.map(a => a.id)).not.toContain(`ma-${id}`);
    expect(efter.ejVisade.find(x => x.motivering === 'Test av regel').antal).toBeGreaterThanOrEqual(1);
    expect((await k.get(`/api/min/journal/p01/anteckning/ma-${id}`)).status).toBe(404);
    expect(JSON.stringify(efter)).not.toContain('extraslag');
  });

  test('patientens egna mätningar och värden som vården inte har godkänt visas inte heller ur mellanarkivet', async () => {
    const k = await invanare('inv-p01');
    const d = db(k);
    const ins = d.query("INSERT INTO matvarden (patient_id, enhet_id, typ, varde, varde_num, matt_enhet, tid, kalla) VALUES ('p01', 'uso-kard', 'puls', ?, ?, '/min', ?, ?)");
    ins.run('123', 123, '2011-05-01T08:00:00.000Z', 'patient');
    ins.run('64', 64, '2011-05-02T08:00:00.000Z', 'vardkallan');
    overfor(d);
    expect(d.query("SELECT count(*) AS n FROM mellanarkiv_handlingar WHERE slag = 'matvarde' AND typ = 'puls' AND datum LIKE '2011-05-0%'").get().n).toBe(2);
    const ps = (await k.get('/api/min/journal/p01/provsvar')).data;
    const ur = arkiverade(ps.matvarden).filter(m => m.typ === 'puls');
    expect(ur.map(m => m.varde)).toEqual([64]);
  }, 30_000);

  test('ett ombud ser inget ur mellanarkivet, och vårdnadshavaren ser barnets äldre uppgifter som barnets övriga', async () => {
    const o = await invanare('inv-om01');
    for (const del of ['anteckningar', 'lakemedel', 'diagnoser', 'remisser', 'vardkontakter', 'provsvar']) {
      const r = await o.get(`/api/min/journal/p01/${del}`);
      expect([del, r.status]).toEqual([del, 403]);
      expect(JSON.stringify(r.data)).not.toContain('Alvedon');
    }
    expect((await o.get('/api/min/journal/p01/anteckning/ma-1')).status).toBe(403);
    // Vårdnadshavaren för Leo (p09).
    const v = await invanare('inv-vh01');
    const d = db(v);
    gammalKontakt(d, 'p09');
    overfor(d);
    const vk = arkiverade((await v.get('/api/min/journal/p09/vardkontakter')).data.vardkontakter);
    expect(vk.map(x => x.orsak)).toContain('Halsont och feber');
    // En annan patients journal är som en som inte finns, också för det som ligger i mellanarkivet.
    expect((await v.get('/api/min/journal/p01/anteckningar')).status).toBe(404);
  }, 30_000);
});
