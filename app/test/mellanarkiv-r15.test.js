// Runda 15, r3 (Sussa 5.4.2.2): avslutade ordinationer och administreringar i mellanarkivet. Testnamnen står i
// src/sussa/mappning/5.4.2.js och src/sussa/runda15-r3.js.
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { testserver, klient, sandlada, nyDb, atk, personal } from './hjalp.js';
import * as mellanarkiv from '../src/mellanarkiv.js';
import { packaUpp } from '../src/zip.js';
import { idag } from '../src/db.js';

let app;
beforeAll(() => { app = testserver(); });
afterAll(() => app.stopp());

const inloggad = async (roll) => { const k = klient(app); await k.logga(roll); return k; };
const db = (k) => sandlada(app, k).db;
const lmSlag = (rader) => rader.filter(r => ['ordination', 'administrering'].includes(r.slag));

// En utsatt ordination från 2012 med två givna doser. Vårdenheten som ordinerade och vårdenheten som gav doserna kan
// skilja sig, som när en dos ges på en annan avdelning.
function gammalOrdination(d, { pid = 'p01', enhet = 'vc-tybble', admEnhet = enhet, lm = 'VK-NPL-0033', status = 'utsatt', utsatt = '2012-05-10T10:00:00.000Z', slut = null, admStatus = 'given' } = {}) {
  const id = Number(d.query(`INSERT INTO ordinationer (patient_id, enhet_id, lakemedel_id, dosering, dos, dos_enhet, tider, typ, orsak, uppfoljning, start, slut, status, utsatt_tid, utsatt_av, utsatt_orsak, ordinerad_av, skapad, nll_status)
    VALUES (?, ?, ?, '1 tablett 3 gånger dagligen', 1, 'g', '["08","14","20"]', 'tillfallig', 'Halsfluss', '2012-05-10', '2012-05-01', ?, ?, ?, ?, ?, 'lak-kard', '2012-05-01T09:00:00.000Z', 'kvitterad') RETURNING id`)
    .get(pid, enhet, lm, slut, status, status === 'utsatt' ? utsatt : null, status === 'utsatt' ? 'lak-kard' : null, status === 'utsatt' ? 'Kuren avslutad' : null).id);
  d.query("INSERT INTO ordination_historik (ordination_id, tid, personal_id, handelse, detalj) VALUES (?, '2012-05-01T09:00:00.000Z', 'lak-kard', 'Ordinerad', 'Testordination')").run(id);
  const adm = [];
  for (const tid of ['2012-05-01T12:00:00.000Z', '2012-05-01T18:00:00.000Z']) {
    adm.push(Number(d.query(`INSERT INTO administreringar (patient_id, enhet_id, ordination_id, lakemedel_id, planerad, status, dos, dos_enhet, antal, tid, utford_av, registrerad, registrerad_av)
      VALUES (?, ?, ?, ?, ?, ?, 1, 'g', 1, ?, ?, ?, 'ssk-kard') RETURNING id`).get(pid, admEnhet, id, lm, tid, admStatus, admStatus === 'iordningstalld' ? null : tid, admStatus === 'iordningstalld' ? null : 'ssk-kard', tid).id));
  }
  return { id, adm };
}
const ordIds = (d, fore = '2016-01-01', pid = 'p01') => (mellanarkiv.kandidater(d, fore).get(pid)?.ordinationer ?? []).map(o => o.id);

// Arkivarien registrerar ett beslut och för över, i sandlådan som k har.
async function foverfor(k) {
  const b = await k.post('/api/arkiv/beslut', { typ: 'mellanarkiv', diarienummer: `RS 2026-${Math.floor(Math.random() * 9000) + 1000}` });
  expect(b.status).toBe(201);
  const o = await k.post(`/api/arkiv/beslut/${b.data.id}/overfor`, {});
  expect(o.status).toBe(200);
  return o.data;
}

describe('Mellanarkiv för läkemedel', () => {
  test('en avslutad ordination förs över med sina administreringar och sin historik, och finns inte kvar i den aktiva journalen', async () => {
    const k = await inloggad('ark');
    const d = db(k);
    const { id, adm } = gammalOrdination(d);
    expect(ordIds(d)).toContain(id);
    const u = await k.get(`/api/arkiv/beslut/${(await k.post('/api/arkiv/beslut', { typ: 'mellanarkiv', diarienummer: 'RS 2026-601' })).data.id}/underlag`);
    expect(u.data.patienter.find(p => p.id === 'p01')).toMatchObject({ ordinationer: expect.any(Number), administreringar: expect.any(Number) });
    expect(u.data.regel).toContain('Pågående och aktuella ordinationer');
    const r = await foverfor(k);
    expect(r.resultat.ordinationer).toBeGreaterThan(0);
    expect(r.resultat.administreringar).toBeGreaterThanOrEqual(2);
    // Ordinationen, historiken och doserna finns inte kvar i den aktiva journalen.
    expect(d.query('SELECT 1 FROM ordinationer WHERE id = ?').get(id)).toBeNull();
    expect(d.query('SELECT 1 FROM ordination_historik WHERE ordination_id = ?').get(id)).toBeNull();
    expect(d.query(`SELECT count(*) AS n FROM administreringar WHERE id IN (${adm.join(', ')})`).get().n).toBe(0);
    // I mellanarkivet: ordinationen med historiken som not och båda doserna, i samma paket.
    const rader = d.query("SELECT * FROM mellanarkiv_handlingar WHERE patient_id = 'p01' AND referens IN (?, ?, ?)").all(`urn:vardkallan:MedicationRequest/${id}`, ...adm.map(a => `urn:vardkallan:MedicationAdministration/${a}`));
    expect(rader.map(x => x.slag).sort()).toEqual(['administrering', 'administrering', 'ordination']);
    expect(new Set(rader.map(x => x.paket_id)).size).toBe(1);
    const ord = JSON.parse(rader.find(x => x.slag === 'ordination').resurs);
    expect(ord.resourceType).toBe('MedicationRequest');
    expect(ord.status).toBe('stopped');
    expect(ord.note.map(n => n.text)).toContain('Händelse: Ordinerad. Testordination.');
    expect(rader.filter(x => x.slag === 'administrering').every(x => x.ordination_enhet_id === 'vc-tybble')).toBe(true);
    // Paketet följer FGS och har en post i e-arkivets index för varje dos.
    const p = d.query('SELECT * FROM mellanarkiv_paket WHERE id = ?').get(rader[0].paket_id);
    const index = [...packaUpp(Buffer.from(p.data))].find(([n]) => n.endsWith('earkiv-index.xml'))[1].data.toString('utf8');
    expect(index).toContain(`urn:vardkallan:MedicationRequest/${id}`);
    for (const a of adm) expect(index).toContain(`urn:vardkallan:MedicationAdministration/${a}`);
    expect(index).toContain('<Dokumenttyp>Läkemedelsadministrering</Dokumenttyp>');
    // Loggen säger hur många ordinationer och administreringar som fördes över.
    expect(d.query("SELECT syfte FROM atkomstlogg WHERE patient_id = 'p01' AND handling = 'arkivera' ORDER BY id DESC").get().syfte).toMatch(/ordinationer och \d+ administreringar/);
  }, 30_000);

  test('en pågående eller aktuell ordination förs aldrig över, hur gammal den än är', () => {
    const d = nyDb();
    // Seedens pågående ordinationer, varav flera är äldre än fem år, är aldrig med.
    const aktiva = d.query("SELECT id FROM ordinationer WHERE status = 'aktiv' AND (slut IS NULL OR slut >= ?)").all(idag()).map(r => r.id);
    expect(d.query("SELECT count(*) AS n FROM ordinationer WHERE status = 'aktiv' AND start < '2016-01-01' AND slut IS NULL").get().n).toBeGreaterThan(0);
    const alla = [...mellanarkiv.kandidater(d, '2021-01-01').values()].flatMap(k => k.ordinationer.map(o => o.id));
    for (const id of aktiva) expect(alla).not.toContain(id);
    // En pågående ordination som startade 2009 och inte har något slutdatum.
    const pagar = gammalOrdination(d, { status: 'aktiv' });
    // En utsatt ordination med en dos som är iordningsställd men inte registrerad.
    const iordning = gammalOrdination(d, { admStatus: 'iordningstalld' });
    // En kur vars slutdatum har passerat är avslutad, och den förs över.
    const kur = gammalOrdination(d, { status: 'aktiv', slut: '2012-05-10' });
    const utsatt = gammalOrdination(d);
    const ids = ordIds(d);
    expect(ids).not.toContain(pagar.id);
    expect(ids).not.toContain(iordning.id);
    expect(ids).toContain(kur.id);
    expect(ids).toContain(utsatt.id);
    // En ordination som utsattes efter gränsen är inte med.
    const nyligen = gammalOrdination(d, { utsatt: '2024-02-01T10:00:00.000Z' });
    expect(ordIds(d)).not.toContain(nyligen.id);
  });

  test('det som fortfarande gäller stannar i den aktiva journalen: uppmärksamhetsinformation, den senaste vidimeringen, svar från NLL och en plan för återinsättning', () => {
    const d = nyDb();
    const a = gammalOrdination(d);
    const b = gammalOrdination(d);
    const c = gammalOrdination(d);
    const e = gammalOrdination(d);
    const f = gammalOrdination(d);
    expect(ordIds(d)).toEqual(expect.arrayContaining([a.id, b.id, c.id, e.id, f.id]));
    // Uppmärksamhetsinformation som pekar på ordinationen.
    d.query(`INSERT INTO uppmarksamhet (patient_id, enhet_id, kategori, undergrupp, term, kalla_typ, kalla_id, status, registrerad, registrerad_av)
      SELECT 'p01', 'vc-tybble', kategori, undergrupp, 'Test', 'ordination', ?, 'aktiv', '2012-05-01', 'lak-kard' FROM uppmarksamhet LIMIT 1`).run(a.id);
    // Den senaste vidimeringen av läkemedelslistan.
    d.query("INSERT INTO vidimeringar (patient_id, enhet_id, tid, av, ordinationer, andringar) VALUES ('p01', 'uso-kard', '2030-01-01T10:00:00.000Z', 'lak-kard', ?, '[]')").run(JSON.stringify([{ id: b.id }]));
    // Ett meddelande till NLL som inte är kvitterat.
    d.query("INSERT INTO nll_meddelanden (ordination_id, typ, skickad, status) VALUES (?, 'utsattning', '2012-05-10T10:00:00.000Z', 'timeout')").run(c.id);
    // En plan för återinsättning efter ett uppehåll.
    d.query("INSERT INTO utsattningsplaner (ordination_id, typ, aterinsattning, registrerad, av) VALUES (?, 'uppehall', '2012-05-20', '2012-05-10', 'lak-kard')").run(e.id);
    const ids = ordIds(d);
    for (const x of [a, b, c, e]) expect(ids).not.toContain(x.id);
    expect(ids).toContain(f.id);
  });

  test('det senaste mätvärdet av varje typ stannar i den aktiva journalen, hur gammalt det än är', () => {
    const d = nyDb();
    const ins = d.query("INSERT INTO matvarden (patient_id, enhet_id, typ, varde, varde_num, matt_enhet, tid) VALUES ('p20', 'uso-med', ?, ?, ?, ?, ?) RETURNING id");
    const aldre = ins.get('langd', '178', 178, 'cm', '2010-01-01T10:00:00.000Z').id;
    const senaste = ins.get('langd', '179', 179, 'cm', '2011-01-01T10:00:00.000Z').id;
    d.query("DELETE FROM matvarden WHERE patient_id = 'p20' AND typ = 'langd' AND id NOT IN (?, ?)").run(aldre, senaste);
    const mv = (mellanarkiv.kandidater(d, '2016-01-01').get('p20')?.matvarden ?? []).map(m => m.id);
    expect(mv).toContain(aldre);
    expect(mv).not.toContain(senaste);
  });

  test('läkemedelslistan visar avslutade ordinationer ur mellanarkivet märkta Ur mellanarkivet, och en roll utan läkemedel ser inga', async () => {
    const k = await inloggad('lak-kard');
    const r = await k.get('/api/patient/p01/lakemedel');
    expect(r.status).toBe(200);
    const ur = r.data.mellanarkiv.find(o => o.lakemedel.namn.startsWith('Alvedon'));
    expect(ur).toMatchObject({ mellanarkiv: true, kallaEtikett: 'Ur mellanarkivet', ordinationsorsak: 'Feber och muskelvärk vid influensa', start: '2012-03-05', slut: '2012-03-07', vardenhet: { id: 'uso-kard' } });
    // Läsningen ur mellanarkivet loggas.
    expect(db(k).query("SELECT count(*) AS n FROM atkomstlogg WHERE patient_id = 'p01' AND personal_id = 'lak-kard' AND handling = 'las_lakemedel' AND resurs = 'mellanarkiv'").get().n).toBeGreaterThan(0);
    // Läkemedelslistan är gemensam: ett aktivt val behövs inte, men vårdadministratören läser inte läkemedel.
    const d = nyDb();
    expect(lmSlag(mellanarkiv.synliga(atk(d, 'ssk-kard', 'p01'))).length).toBe(5);
    expect(lmSlag(mellanarkiv.synliga(atk(d, 'adm-kard', 'p01')))).toEqual([]);
    expect(lmSlag(mellanarkiv.synliga(atk(d, 'ark', 'p01')))).toEqual([]);
  });

  test('en spärrad vårdenhets ordination syns inte, inte heller dess doser på en annan vårdenhet, och svaret är detsamma utan den', async () => {
    const k = await inloggad('ark');
    const d = db(k);
    // Ordinerad på vårdcentralen och given på Kardiologiska kliniken.
    const { id } = gammalOrdination(d, { enhet: 'vc-tybble', admEnhet: 'uso-kard' });
    await foverfor(k);
    const lak = await inloggad('lak-kard');
    sandlada(app, lak).db = d;
    const fore = await lak.get('/api/patient/p01/lakemedel');
    expect(fore.data.mellanarkiv.some(o => o.vardenhet.id === 'vc-tybble')).toBe(true);
    d.query("INSERT INTO sparrar (patient_id, enhet_id, registrerad, aktiv) VALUES ('p01', 'vc-tybble', ?, 1)").run(new Date().toISOString());
    const med = await lak.get('/api/patient/p01/lakemedel');
    expect(JSON.stringify(med.data.mellanarkiv)).not.toContain('vc-tybble');
    expect(med.data.dolda.sparrade).toBe(true);
    // Doserna gavs på Kardiologiska kliniken, men ordinationen är från den spärrade vårdenheten.
    const doser = d.query("SELECT * FROM mellanarkiv_handlingar WHERE slag = 'administrering' AND ordination_enhet_id = 'vc-tybble'").all();
    expect(doser.length).toBe(2);
    expect(doser.every(x => x.enhet_id === 'uso-kard')).toBe(true);
    const syns = mellanarkiv.synliga(atk(d, 'lak-kard', 'p01'));
    expect(syns.some(x => x.ordination_enhet_id === 'vc-tybble' || x.enhet_id === 'vc-tybble')).toBe(false);
    // En dos hämtad på id är som en som inte finns.
    const dold = await lak.get(`/api/mellanarkiv/${doser[0].id}`);
    const saknas = await lak.get('/api/mellanarkiv/999999');
    expect([dold.status, dold.data.fel]).toEqual([saknas.status, saknas.data.fel]);
    // Samma svar som om de spärrade handlingarna inte fanns.
    d.exec('DROP TRIGGER mellanarkiv_handlingar_raderas_ej');
    const utan = JSON.stringify((await lak.get('/api/patient/p01/lakemedel')).data);
    d.query("DELETE FROM mellanarkiv_handlingar WHERE enhet_id = 'vc-tybble' OR ordination_enhet_id = 'vc-tybble'").run();
    expect(JSON.stringify((await lak.get('/api/patient/p01/lakemedel')).data)).toBe(utan);
    expect(id).toBeGreaterThan(0);
  }, 30_000);

  test('en ordination ur mellanarkivet öppnas med dosering, period, historik och doser, och läsningen loggas', async () => {
    const k = await inloggad('lak-kard');
    const d = db(k);
    const id = d.query("SELECT id FROM mellanarkiv_handlingar WHERE slag = 'ordination' AND patient_id = 'p01'").get().id;
    const r = await k.get(`/api/mellanarkiv/${id}`);
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ slag: 'ordination', kallaEtikett: 'Ur mellanarkivet', mellanarkiv: { oforandrad: true } });
    const s = Object.fromEntries(r.data.sokord.map(x => [x.sokord, x.text]));
    expect(s.Läkemedel).toContain('Alvedon');
    expect(s.Dosering).toBe('2 tabletter 3 gånger dagligen i 3 dagar');
    expect(s.Period).toBe('2012-03-05 till 2012-03-07');
    expect(s.Historik).toContain('Migrerad från VAS');
    expect(s.Administreringar.split('\n')).toHaveLength(4);
    expect(s.Administreringar).toContain('Inte given: Patienten avböjde');
    expect(d.query("SELECT * FROM atkomstlogg WHERE resurs = ? AND patient_id = 'p01' ORDER BY id DESC").get(`mellanarkiv:${id}`)).toMatchObject({ handling: 'las_lakemedel', resultat: 'tillaten' });
    // Tidslinjen och sökningen tar med ordinationen men inte de enskilda doserna.
    const t = (await k.get('/api/patient/p01/oversikt')).data.tidslinje.filter(x => x.typ === 'mellanarkiv');
    expect(t.filter(x => x.rubrik.startsWith('Ordinerat: Alvedon'))).toHaveLength(1);
    expect(t.some(x => /Inte given/.test(x.text ?? ''))).toBe(false);
    const sok = (await k.get('/api/patient/p01/sok?q=influensa')).data.traffar.filter(x => x.typ === 'mellanarkiv');
    expect(sok.length).toBe(1);
  });

  test('mellanarkivet avvisar en administrering vars ordination inte finns i paketet', () => {
    const d = nyDb();
    const { id } = gammalOrdination(d);
    const valda = mellanarkiv.kandidater(d, '2016-01-01').get('p01');
    const o = valda.ordinationer.find(x => x.id === id);
    // Bara doserna, utan ordinationen.
    const { paket } = mellanarkiv.paketFor(d, 'p01', { anteckningar: [], matvarden: [], ordinationer: [], administreringar: o.administreringar.map(a => ({ ...a })) });
    expect(() => mellanarkiv.taEmot(d, paket, { kalla: 'test' })).toThrow(/saknar sin ordination/);
    // Hela ordinationen tas emot.
    const hel = mellanarkiv.paketFor(d, 'p01', { anteckningar: [], matvarden: [], ordinationer: [o], administreringar: [] });
    expect(mellanarkiv.taEmot(d, hel.paket, { kalla: 'test' }).handlingar).toBe(3);
  });

  test('en sandlåda från version 1.4 får tabellen uppgraderad med samma rader, och handlingarna skyddas som förut', () => {
    const d = new Database(':memory:');
    d.exec(`CREATE TABLE mellanarkiv_handlingar (
      id INTEGER PRIMARY KEY AUTOINCREMENT, paket_id TEXT NOT NULL, patient_id TEXT NOT NULL, enhet_id TEXT NOT NULL, slag TEXT NOT NULL,
      kategori TEXT, typ TEXT NOT NULL, referens TEXT NOT NULL, datum TEXT NOT NULL, rubrik TEXT NOT NULL, forfattare TEXT, text TEXT NOT NULL,
      resurs TEXT NOT NULL, sha256 TEXT NOT NULL, CHECK (slag IN ('anteckning', 'matvarde')));
      CREATE TRIGGER mellanarkiv_handlingar_raderas_ej BEFORE DELETE ON mellanarkiv_handlingar BEGIN SELECT RAISE(ABORT, 'En handling i mellanarkivet raderas inte.'); END;
      INSERT INTO mellanarkiv_handlingar VALUES (7, 'IP_x', 'p01', 'uso-kard', 'anteckning', 'journal', 'Anteckning', 'urn:x', '2010-01-01', 'Anteckning', null, 'Text', '{}', 'abc');`);
    mellanarkiv.sakra(d);
    expect(d.query("SELECT sql FROM sqlite_master WHERE name = 'mellanarkiv_handlingar'").get().sql).toContain("'administrering'");
    expect(d.query('SELECT id, text, sha256 FROM mellanarkiv_handlingar').all()).toEqual([{ id: 7, text: 'Text', sha256: 'abc' }]);
    expect(() => d.query('DELETE FROM mellanarkiv_handlingar').run()).toThrow(/raderas inte/);
    expect(() => d.query("UPDATE mellanarkiv_handlingar SET text = 'x'").run()).toThrow(/ändras inte/);
    d.close();
  });

  test('vårdenhetens reservdator tar inte med ordinationer ur mellanarkivet', async () => {
    const k = await inloggad('ssk-kard');
    const r = await k.get('/api/reservlista');
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.data)).not.toContain('Feber och muskelvärk vid influensa');
    expect(personal(db(k), 'ssk-kard')).toBeTruthy();
  });
});
