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

  test('exporten till e-arkivet tar med handlingarna i mellanarkivet, med en post i indexet för varje', async () => {
    const k = await inloggad('ark');
    const d = db(k);
    const b = (await k.post('/api/arkiv/beslut', { diarienummer: 'DEMO-2026-0099', beslutsdatum: idag(), typ: 'leverans', patientId: 'p01' })).data;
    const res = await fetch(`${app.url}/api/arkiv/beslut/${b.id}/paket`, { method: 'POST', headers: { Cookie: k.kaka(), 'Content-Type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(200);
    const filer = packaUpp(Buffer.from(await res.arrayBuffer()));
    const rot = [...filer.keys()][0];
    const journal = JSON.parse(filer.get(`${rot}representations/rep_1/data/journal/p01.json`).data.toString('utf8'));
    const ur = journal.entry.map(e => e.resource).filter(r => (r.meta?.tag ?? []).some(t => t.code === 'mellanarkiv'));
    const antal = d.query("SELECT count(*) AS n FROM mellanarkiv_handlingar WHERE patient_id = 'p01'").get().n;
    expect(ur).toHaveLength(antal);
    expect(ur.every(r => /^ma-\d+$/.test(r.id))).toBe(true);
    const index = filer.get(`${rot}metadata/descriptive/earkiv-index.xml`).data.toString('utf8');
    for (const r of ur) expect(index).toContain(`<Referens>urn:vardkallan:${r.resourceType}/${r.id}</Referens>`);
    expect(index).toContain('<Dokumenttyp>Läkemedelsadministrering</Dokumenttyp>');
  });

  test('en spärr på vårdenheten som ordinerade följer med doserna till e-arkivet och till mellanarkivets index, också när dosen gavs på en annan vårdenhet', async () => {
    const k = await inloggad('ark');
    const d = db(k);
    // Ordinerad på vårdcentralen och given på Kardiologiska kliniken. Vårdcentralen är spärrad redan vid överföringen.
    const { adm } = gammalOrdination(d, { enhet: 'vc-tybble', admEnhet: 'uso-kard' });
    d.query("INSERT INTO sparrar (patient_id, enhet_id, registrerad, aktiv) VALUES ('p01', 'vc-tybble', ?, 1)").run(new Date().toISOString());
    await foverfor(k);
    const post = (xml, ref) => [...xml.matchAll(/<handling>([\s\S]*?)<\/handling>/g)].map(m => m[1]).find(x => x.includes(`<Referens>${ref}</Referens>`));
    // Mellanarkivets eget index.
    const rad = d.query("SELECT * FROM mellanarkiv_handlingar WHERE referens = ?").get(`urn:vardkallan:MedicationAdministration/${adm[0]}`);
    const paket = d.query('SELECT data FROM mellanarkiv_paket WHERE id = ?').get(rad.paket_id).data;
    const maIndex = [...packaUpp(Buffer.from(paket))].find(([n]) => n.endsWith('earkiv-index.xml'))[1].data.toString('utf8');
    expect(post(maIndex, `urn:vardkallan:MedicationAdministration/${adm[0]}`)).toContain('<Spärr>ja</Spärr>');
    // Exporten till e-arkivet.
    const b = (await k.post('/api/arkiv/beslut', { diarienummer: 'DEMO-2026-0101', beslutsdatum: idag(), typ: 'leverans', patientId: 'p01' })).data;
    const res = await fetch(`${app.url}/api/arkiv/beslut/${b.id}/paket`, { method: 'POST', headers: { Cookie: k.kaka(), 'Content-Type': 'application/json' }, body: '{}' });
    const filer = packaUpp(Buffer.from(await res.arrayBuffer()));
    const rot = [...filer.keys()][0];
    const index = filer.get(`${rot}metadata/descriptive/earkiv-index.xml`).data.toString('utf8');
    expect(post(index, `urn:vardkallan:MedicationAdministration/ma-${rad.id}`)).toContain('<Spärr>ja</Spärr>');
    // Resursen bär vårdenheterna, så att mottagaren kan tillämpa spärren.
    const journal = JSON.parse(filer.get(`${rot}representations/rep_1/data/journal/p01.json`).data.toString('utf8'));
    const r = journal.entry.map(e => e.resource).find(x => x.id === `ma-${rad.id}`);
    expect(r.meta.tag).toContainEqual({ system: mellanarkiv.TAGG_ORDINATIONSENHET, code: 'vc-tybble' });
    expect(r.meta.tag).toContainEqual({ system: mellanarkiv.TAGG_ENHET, code: 'uso-kard' });
    const ord = journal.entry.map(e => e.resource).find(x => x.resourceType === 'MedicationRequest' && x.id === r.request.reference.split('/')[1]);
    expect(ord.meta.tag).toContainEqual({ system: mellanarkiv.TAGG_ENHET, code: 'vc-tybble' });
    expect(post(index, `urn:vardkallan:MedicationRequest/${ord.id}`)).toContain('<Spärr>ja</Spärr>');
  }, 30_000);

  test('gallringsregeln räknar med det som finns i mellanarkivet, och för en ordination med när den sattes ut', async () => {
    const k = await inloggad('ark');
    const d = db(k);
    const gallring = async () => (await k.get(`/api/arkiv/beslut/${(await k.post('/api/arkiv/beslut', { diarienummer: 'DEMO-2026-0100', beslutsdatum: idag(), typ: 'gallring' })).data.id}/underlag`)).data.patienter.map(p => p.id);
    expect(await gallring()).toContain('p20');
    // En ordination från 2012 som sattes ut för sex år sedan gör att journalen inte ska gallras än.
    const utsatt = new Date(Date.now() - 6 * 365.25 * 86400_000).toISOString();
    const { id } = gammalOrdination(d, { pid: 'p20', enhet: 'uso-med', utsatt });
    expect(await gallring()).not.toContain('p20');
    await foverfor(k);
    expect(d.query('SELECT 1 FROM ordinationer WHERE id = ?').get(id)).toBeNull();
    expect(d.query("SELECT sista FROM mellanarkiv_handlingar WHERE slag = 'ordination' AND referens = ?").get(`urn:vardkallan:MedicationRequest/${id}`).sista).toBe(utsatt);
    // Ordinationen finns nu bara i mellanarkivet, och den räknas fortfarande.
    expect(await gallring()).not.toContain('p20');
  }, 30_000);

  test('vårdenhetens reservdator tar inte med ordinationer ur mellanarkivet', async () => {
    const k = await inloggad('ssk-kard');
    const r = await k.get('/api/reservlista');
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.data)).not.toContain('Feber och muskelvärk vid influensa');
    expect(personal(db(k), 'ssk-kard')).toBeTruthy();
  });
});

// Runda 15, r3 (Sussa 11.2.1.8): läskopian vid avbrott har det som behövs oavsett ålder och inget ur mellanarkivet.
const LASKOPIA_PER_PATIENT = 128 * 1024;
const LASKOPIA_TOTALT = 1024 * 1024;
describe('Läskopian och mellanarkivet', () => {
  test('läskopian har uppmärksamhetsinformationen, de aktuella läkemedlen och de senaste mätvärdena oavsett ålder, men inget ur mellanarkivet', async () => {
    const k = await inloggad('lak-kard');
    const d = db(k);
    // Ett mätvärde av en typ som bara mättes för länge sedan är patientens senaste och följer med.
    d.query("INSERT INTO matvarden (patient_id, enhet_id, typ, varde, varde_num, matt_enhet, tid) VALUES ('p01', 'uso-kard', 'langd', '176', 176, 'cm', '2009-04-02T09:00:00.000Z')").run();
    await k.get('/api/patient/p01');
    const kopia = (await k.get('/api/lasekopia')).data;
    const p = kopia.patienter.p01;
    expect(p).toBeTruthy();
    // Uppmärksamhetsinformationen i huvudet, som i journalen.
    const huvud = (await k.get('/api/patient/p01')).data;
    expect(p.huvud.uppmarksamhet.poster.length).toBeGreaterThan(0);
    expect(p.huvud.uppmarksamhet.poster.map(x => x.term)).toEqual(huvud.uppmarksamhet.poster.map(x => x.term));
    // De aktuella läkemedlen, också de som är många år gamla.
    const aktuella = p.lakemedel.ordinationer.filter(o => o.aktuell);
    expect(aktuella.length).toBeGreaterThan(0);
    expect(aktuella.some(o => o.start < '2016-01-01')).toBe(true);
    // Det senaste mätvärdet av varje typ, också längden från 2009.
    expect(p.oversikt.matvarden.find(m => m.typ === 'langd')).toBeTruthy();
    // Inget ur mellanarkivet: inte i översiktens tidslinje, inte i läkemedelslistan och inte i anteckningarna.
    const text = JSON.stringify(p);
    for (const x of ['Ur mellanarkivet', 'Troligen extraslag', 'Livsstilsråd. Ny kontroll om tre månader', 'Lågt vätskeintag under dagen', 'Feber och muskelvärk vid influensa']) expect(text).not.toContain(x);
    expect(p.oversikt.tidslinje.some(t => t.typ === 'mellanarkiv')).toBe(false);
    // I den vanliga översikten finns de.
    expect((await k.get('/api/patient/p01/oversikt')).data.tidslinje.some(t => t.typ === 'mellanarkiv')).toBe(true);
  });

  test('läskopian ryms inom sitt tak per patient och totalt, och den blir inte större av det som förs till mellanarkivet', async () => {
    const k = await inloggad('ark');
    const d = db(k);
    // En lång utsatt behandling med doser tre gånger om dagen i ett halvår, som förs till mellanarkivet.
    const { id } = gammalOrdination(d, { enhet: 'uso-kard' });
    const ins = d.query(`INSERT INTO administreringar (patient_id, enhet_id, ordination_id, lakemedel_id, planerad, status, dos, dos_enhet, antal, tid, utford_av, registrerad, registrerad_av)
      VALUES ('p01', 'uso-kard', ?, 'VK-NPL-0033', ?, 'given', 1, 'g', 1, ?, 'ssk-kard', ?, 'ssk-kard')`);
    for (let i = 0; i < 540; i++) { const t = new Date(Date.parse('2011-11-01T08:00:00.000Z') + i * 8 * 3600_000).toISOString(); ins.run(id, t, t, t); }
    const lak = await inloggad('lak-kard');
    sandlada(app, lak).db = d;
    await lak.get('/api/patient/p01');
    const fore = (await lak.get('/api/lasekopia')).data;
    await foverfor(k);
    expect(d.query('SELECT 1 FROM ordinationer WHERE id = ?').get(id)).toBeNull();
    const efter = (await lak.get('/api/lasekopia')).data;
    const storlek = (x) => Buffer.byteLength(JSON.stringify(x));
    expect(storlek(efter.patienter.p01)).toBeLessThanOrEqual(storlek(fore.patienter.p01));
    // Taken: 128 kB per patient och 1 MB för hela kopian, med marginal mot det som demon ger i dag.
    for (const [pid, post] of Object.entries(efter.patienter)) expect([pid, storlek(post) <= LASKOPIA_PER_PATIENT]).toEqual([pid, true]);
    expect(storlek(efter)).toBeLessThanOrEqual(LASKOPIA_TOTALT);
    // Doserna ur mellanarkivet finns i den vanliga läkemedelslistan, märkta, men inte i läskopian.
    expect((await lak.get('/api/patient/p01/lakemedel')).data.mellanarkiv.some(o => o.ordinationsorsak === 'Halsfluss')).toBe(true);
    expect(JSON.stringify(efter.patienter.p01)).not.toContain('Halsfluss');
  }, 30_000);
});

// Runda 15, r3: handlingarna i mellanarkivet i FHIR-API:t, med samma behörighet och loggning som den aktiva journalen.
const LAGRING = 'https://vardkallan.404haven.se/fhir/CodeSystem/lagring';
const urMellanarkivet = (r) => (r.meta?.tag ?? []).some(t => t.system === LAGRING && t.code === 'mellanarkiv');
const resurser = (b) => (b.entry ?? []).map(e => e.resource);

describe('FHIR ur mellanarkivet', () => {
  test('sökningen på patient tar med handlingarna ur mellanarkivet märkta med meta.tag och meta.source, och läsningen på id loggas', async () => {
    const k = await inloggad('lak-kard');
    const d = db(k);
    const mr = resurser((await k.get('/fhir/MedicationRequest?patient=p01')).data);
    const ur = mr.filter(urMellanarkivet);
    expect(ur).toHaveLength(1);
    expect(ur[0].id).toMatch(/^ma-\d+$/);
    expect(ur[0].meta.source).toMatch(/^urn:vardkallan:mellanarkiv:IP_/);
    expect(ur[0].meta.tag).toContainEqual({ system: LAGRING, code: 'mellanarkiv', display: 'Ur mellanarkivet' });
    // Taggarna som bara behövs i paketet följer inte med, och källan står kvar.
    expect(JSON.stringify(ur[0].meta)).not.toContain('urn:vardkallan:vardenhet');
    expect(ur[0].meta.tag.some(t => t.code === 'migrerad:VAS')).toBe(true);
    // Resurserna i den aktiva journalen har ingen sådan tagg.
    expect(mr.filter(r => !urMellanarkivet(r)).length).toBeGreaterThan(0);
    // Doserna pekar på ordinationen i mellanarkivet.
    const ma = resurser((await k.get('/fhir/MedicationAdministration?patient=p01')).data).filter(urMellanarkivet);
    expect(ma).toHaveLength(4);
    expect(ma.every(a => a.request.reference === `MedicationRequest/${ur[0].id}`)).toBe(true);
    expect(ma.find(a => a.status === 'not-done').statusReason[0].text).toContain('Patienten avböjde');
    // Läsningen på id.
    const las = await k.get(`/fhir/MedicationRequest/${ur[0].id}`);
    expect(las.status).toBe(200);
    expect(las.data.id).toBe(ur[0].id);
    expect(d.query('SELECT * FROM atkomstlogg WHERE resurs = ? ORDER BY id DESC').get(`fhir/MedicationRequest/${ur[0].id}`)).toMatchObject({ personal_id: 'lak-kard', patient_id: 'p01', handling: 'las_lakemedel', resultat: 'tillaten' });
    // Fel resurstyp är som en som inte finns.
    expect((await k.get(`/fhir/Composition/${ur[0].id}`)).status).toBe(404);
    // Anteckningarna: den egna vårdenheten direkt och andra vårdenheter efter ett aktivt val.
    const fore = resurser((await k.get('/fhir/Composition?patient=p01')).data).filter(urMellanarkivet);
    expect(fore.map(c => c.custodian.reference)).toEqual(['Organization/uso-kard']);
    await k.post('/api/patient/p01/val', { typ: 'andra_enheter', syfte: 'Vården av patienten' });
    const efter = resurser((await k.get('/fhir/Composition?patient=p01')).data).filter(urMellanarkivet);
    expect(efter.map(c => c.custodian.reference).sort()).toEqual(['Organization/uso-kard', 'Organization/uso-med', 'Organization/vc-tybble']);
    expect(resurser((await k.get('/fhir/Observation?patient=p01')).data).filter(urMellanarkivet)).toHaveLength(1);
  });

  test('FHIR lämnar inte ut handlingar ur mellanarkivet från en spärrad vårdenhet, och en sådan resurs på id lämnas inte ut', async () => {
    const k = await inloggad('lak-kard');
    const d = db(k);
    await k.post('/api/patient/p01/val', { typ: 'andra_enheter', syfte: 'Vården av patienten' });
    d.query("INSERT INTO sparrar (patient_id, enhet_id, registrerad, aktiv) VALUES ('p01', 'vc-tybble', ?, 1)").run(new Date().toISOString());
    const c = resurser((await k.get('/fhir/Composition?patient=p01')).data).filter(urMellanarkivet);
    expect(JSON.stringify(c)).not.toContain('vc-tybble');
    expect(resurser((await k.get('/fhir/Observation?patient=p01')).data).filter(urMellanarkivet)).toEqual([]);
    const id = d.query("SELECT id FROM mellanarkiv_handlingar WHERE enhet_id = 'vc-tybble' AND slag = 'anteckning'").get().id;
    const dold = await k.get(`/fhir/Composition/ma-${id}`);
    expect(dold.status).toBe(403);
    expect(JSON.stringify(dold.data)).not.toContain('Tybble');
    expect(JSON.stringify(dold.data)).not.toContain('hypertoni');
    // Det nekade försöket loggas.
    expect(d.query("SELECT count(*) AS n FROM atkomstlogg WHERE resurs = ? AND resultat = 'nekad'").get(`fhir/Composition/ma-${id}`).n).toBe(1);
    // Med patientens samtycke nu lämnas den ut.
    await k.post('/api/patient/p01/val', { typ: 'samtycke_sparr', syfte: 'Patienten samtycker' });
    expect((await k.get(`/fhir/Composition/ma-${id}`)).status).toBe(200);
  });

  test('skyddad identitet: resurserna ur mellanarkivet bär inga personuppgifter och pekar på journalens id', async () => {
    const k = await inloggad('lak-kard');
    const d = db(k);
    const p = d.query("SELECT * FROM patienter WHERE id = 'p01'").get();
    d.query("UPDATE patienter SET skyddad = 1 WHERE id = 'p01'").run();
    for (const t of ['Composition', 'Observation', 'MedicationRequest', 'MedicationAdministration']) {
      const svar = await k.get(`/fhir/${t}?patient=p01`);
      const ur = resurser(svar.data).filter(urMellanarkivet);
      if (t !== 'Observation') expect(ur.length).toBeGreaterThan(0);
      const text = JSON.stringify(ur);
      for (const x of [p.personnummer, p.personnummer.replace('-', ''), p.fornamn, p.efternamn]) expect(text).not.toContain(x);
      expect(ur.every(r => (r.subject?.reference ?? 'Patient/p01') === 'Patient/p01')).toBe(true);
    }
  });

  test('en roll utan läkemedel får inga ordinationer ur mellanarkivet, och undantag från FHIR gäller handlingarna där', async () => {
    const k = await inloggad('adm-kard');
    const d = db(k);
    const id = d.query("SELECT id FROM mellanarkiv_handlingar WHERE slag = 'ordination'").get().id;
    const r = await k.get(`/fhir/MedicationRequest/ma-${id}`);
    expect(r.status).toBe(403);
    expect(d.query("SELECT count(*) AS n FROM atkomstlogg WHERE resurs = ? AND resultat = 'nekad' AND personal_id = 'adm-kard'").get(`fhir/MedicationRequest/ma-${id}`).n).toBe(1);
    // Systemförvaltningens undantag av vårdcentralen från FHIR gäller också handlingarna i mellanarkivet.
    const lak = await inloggad('lak-kard');
    const d2 = db(lak);
    await lak.post('/api/patient/p01/val', { typ: 'andra_enheter', syfte: 'Vården av patienten' });
    d2.query(`INSERT INTO konfig_andringar (slag, nyckel, varde, giltig_fran, motivering, foreslagen_av, foreslagen, status, beslutad_av, beslutad, galler_fran)
      VALUES ('undantag', 'enhet:vc-tybble', ?, '2020-01-01', 'Test av undantag', 'sysf', '2020-01-01', 'godkand', 'sysf2', '2020-01-01', '2020-01-01')`).run(JSON.stringify({ kanaler: ['fhir'] }));
    const c = resurser((await lak.get('/fhir/Composition?patient=p01')).data).filter(urMellanarkivet);
    expect(c.length).toBe(2);
    expect(JSON.stringify(c)).not.toContain('vc-tybble');
    const ut = d2.query("SELECT id FROM mellanarkiv_handlingar WHERE enhet_id = 'vc-tybble' AND slag = 'anteckning'").get().id;
    expect((await lak.get(`/fhir/Composition/ma-${ut}`)).status).toBe(404);
  });

  test('hela journalen ($everything) tar med handlingarna ur mellanarkivet', async () => {
    const k = await inloggad('lak-kard');
    const b = (await k.get('/fhir/Patient/p01/$everything')).data;
    const ur = resurser(b).filter(urMellanarkivet);
    expect(ur.map(r => r.resourceType).sort()).toEqual(expect.arrayContaining(['Composition', 'MedicationAdministration', 'MedicationRequest']));
  });
});
