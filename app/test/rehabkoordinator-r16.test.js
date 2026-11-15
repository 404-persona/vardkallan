// Runda 16, rehabkoordinatorn (rehabkoordinator.js). Rollen arbetar efter lagen (2019:1297) om koordineringsinsatser för
// sjukskrivna patienter och som i Ineras Rehabstöd: ser de pågående sjukfallen på sin egen vårdenhet med minsta åtkomst,
// sätter REKO-status per sjukfall med historik och loggning, och ger koordineringsinsatser bara när patienten samtycker
// (3 §). Läkaren ser REKO-statusen men sätter den inte.
import { describe, test, expect } from 'bun:test';
import { iso } from '../src/db.js';
import * as sjukfall from '../src/sjukfall.js';
import * as reko from '../src/rehabkoordinator.js';
import { ROLLER, LEGITIMATION_FOR_ROLL, prova } from '../src/atkomst.js';
import { atk, personal } from './hjalp.js';
import { nyDbSomStangs } from './r14r3-hjalp.js';

const nyDbMedDemo = nyDbSomStangs();
// Demons sjukskrivningar och REKO-statusar ligger relativt till i dag. Testerna räknar med en fast dag.
const nyDb = () => {
  const db = nyDbMedDemo();
  db.query("UPDATE sjukskrivningar SET status = 'makulerat' WHERE kalla = 'demo'").run();
  return db;
};
const T = 'Rehabkoordinatorn > ';
const DAG = '2026-11-12';
const fel = (fn) => { try { fn(); } catch (e) { return e; } return null; };
let nr = 0;
function lagg(db, { pid = 'p11', enhet = 'vc-tybble', pers = 'lak-vc', fran = '2026-10-20', till = '2026-11-30', grad = 100, diagnos = 'M54.4', text = 'Lumbago-ischias' } = {}) {
  const p = personal(db, pers);
  const id = `rk-${++nr}`;
  db.query(`INSERT INTO sjukskrivningar (patient_id, enhet_id, intygs_id, typ, personal_id, personal_namn, signerad, status, diagnos_kod, diagnos_text,
    sysselsattning, perioder, fmb_motivering, kalla, mottagen) VALUES (?, ?, ?, 'LISJP', ?, ?, ?, 'signerat', ?, ?, 'nuvarande_arbete', ?, 'Hemlig motivering', 'test', ?)`)
    .run(pid, enhet, id, p.id, p.namn, `${fran}T10:00:00Z`, diagnos.replace('.', ''), text, JSON.stringify([{ fran, till, grad }]), iso());
  return id;
}
const rk = (db) => personal(db, 'rk-vc');
// En patient med vårdrelation till vårdcentralen, utan skyddade personuppgifter och utan demons sjukskrivningar.
const annan = (db) => db.query('SELECT id FROM patienter WHERE coalesce(skyddad, 0) = 0 ORDER BY id').all().map(r => r.id)
  .find(pid => !['p11', 'p18'].includes(pid) && prova(db, { personal: rk(db), patient: pid, handling: 'reko_satta', resurs: { enhet_id: 'vc-tybble' } }).tillaten);
const lista = (db, q = { sok: true }, p = rk(db)) => reko.lista(db, p, q, DAG);
const loggar = (db, handling) => db.query('SELECT * FROM atkomstlogg WHERE personal_id = ? AND handling = ? ORDER BY id').all('rk-vc', handling);

describe('Rehabkoordinatorn', () => {
  test(`${T}rollen har minsta åtkomst: sjukfallen och REKO-status, ingen journal, inga intyg, inga läkemedel, ingen nödåtkomst och inga andra vårdenheter`, () => {
    const db = nyDb();
    expect(rk(db)).toMatchObject({ yrke: 'rehabkoordinator', enhet_id: 'vc-tybble', demo: 1 });
    for (const h of ['sjukfall_reko', 'reko_lasa', 'reko_satta']) expect(ROLLER.rehabkoordinator).toContain(h);
    for (const h of ['las_oversikt', 'las_journal', 'las_omvardnad', 'skriv_journal', 'skriv_omvardnad', 'skriv_observation', 'las_lakemedel', 'ordinera', 'ge_lakemedel',
      'las_intyg', 'skriv_intyg', 'utkast_intyg', 'las_diagnoser', 'nodatkomst', 'andra_enheter', 'samtycke_sparr', 'visa_identitet', 'sok', 'las_matvarden']) {
      expect(ROLLER.rehabkoordinator).not.toContain(h);
    }
    // Läkaren ser REKO-statusen genom sina sjukfall men sätter den inte.
    expect(ROLLER.lakare).not.toContain('reko_satta');
    for (const h of ['las_journal', 'las_lakemedel', 'skriv_intyg']) {
      expect(prova(db, { personal: rk(db), patient: 'p11', handling: h }).tillaten).toBe(false);
      expect(prova(db, { personal: rk(db), patient: 'p11', handling: h, val: { nodatkomst: true } }).tillaten).toBe(false);
    }
    // Rollen är en funktion och kräver ingen viss legitimation.
    expect(LEGITIMATION_FOR_ROLL.rehabkoordinator).toBeUndefined();
    expect(reko.STATUSAR.map(s => s.text)).toEqual(['Ingen', 'Kontaktad', 'Aktiv', 'Uppföljning', 'Avslutad', 'Avböjt']);
  });

  test(`${T}tabellen är tom tills koordinatorn söker, och sökningen visar och loggar bara det Rehabstöd visar för rollen`, () => {
    const db = nyDb();
    lagg(db);
    const tom = lista(db, {});
    expect(tom.sjukfall).toBeNull();
    expect(loggar(db, 'reko_lasa').length).toBe(0);
    const d = lista(db);
    const s = d.sjukfall.find(x => x.patientId === 'p11');
    expect(s).toMatchObject({ namn: 'Anna Viklund', personnummer: '19800426-2385', kon: 'kvinna', start: '2026-10-20', slut: '2026-11-30', aktuellGrad: 100,
      diagnos: { kod: 'M54.4', text: 'Lumbago-ischias' }, sysselsattning: 'Nuvarande arbete', reko: { kod: 'ingen', text: 'Ingen' } });
    expect(s.lakare).toBe(personal(db, 'lak-vc').namn);
    // Inget ur journalen och inga intyg: ingen motivering, inga intygssvar, ingen tidslinje med intygen.
    expect(JSON.stringify(s)).not.toContain('Hemlig motivering');
    expect(s.intyg).toBeUndefined();
    const logg = loggar(db, 'reko_lasa');
    expect(logg.map(r => r.patient_id)).toContain('p11');
    expect(logg.every(r => r.resurs === 'sjukfall:rehabkoordinator' && r.resultat === 'tillaten')).toBe(true);
  });

  test(`${T}patienter med skyddade personuppgifter, intyg från andra vårdenheter och patienter utan vårdrelation visas inte`, () => {
    const db = nyDb();
    lagg(db, { pid: 'p03' });
    lagg(db, { pid: 'p11', enhet: 'uso-kard', pers: 'lak-kard', fran: '2026-09-01', till: '2026-10-14', diagnos: 'I21.4', text: 'Hjärtinfarkt' });
    lagg(db, { pid: 'p11' });
    const utan = db.query('SELECT id FROM patienter WHERE coalesce(skyddad, 0) = 0').all().map(r => r.id)
      .find(pid => !prova(db, { personal: rk(db), patient: pid, handling: 'reko_lasa', resurs: { enhet_id: 'vc-tybble' } }).tillaten);
    expect(utan).toBeTruthy();
    lagg(db, { pid: utan });
    const ids = lista(db).sjukfall.map(s => s.patientId);
    expect(ids).not.toContain('p03');
    expect(ids).not.toContain(utan);
    const s = lista(db).sjukfall.find(x => x.patientId === 'p11');
    // Sjukfallet räknas bara på den egna vårdenhetens intyg: kardiologens intyg före räknas inte.
    expect(s).toMatchObject({ start: '2026-10-20', diagnos: { kod: 'M54.4' } });
    expect(JSON.stringify(lista(db))).not.toContain('Hjärtinfarkt');
    // En rehabkoordinator på en annan vårdenhet ser inte sjukfallet och kan inte sätta status.
    db.query("INSERT INTO personal (id, hsa_id, namn, yrke, titel, enhet_id, aktiv) VALUES ('rk-kard', 'SE-TEST-RK-KARD', 'Test Koordinator', 'rehabkoordinator', 'Rehabkoordinator', 'uso-kard', 1)").run();
    expect(lista(db, { sok: true }, personal(db, 'rk-kard')).sjukfall.map(x => x.patientId)).not.toContain('p11');
    expect(fel(() => reko.satt(db, personal(db, 'rk-kard'), 'p11', { start: '2026-10-20', status: 'kontaktad' }, DAG))?.status).toBe(404);
  });

  test(`${T}koordineringsinsatser ges bara med patientens samtycke (lagen (2019:1297) 3 §): Aktiv och Uppföljning kräver ett bekräftat samtycke`, () => {
    const db = nyDb();
    lagg(db);
    const satt = (body) => reko.satt(db, rk(db), 'p11', { start: '2026-10-20', ...body }, DAG);
    // Att kontakta patienten och erbjuda insatser kräver inget samtycke.
    expect(satt({ status: 'kontaktad' }).reko).toMatchObject({ kod: 'kontaktad', samtycke: false });
    const utan = fel(() => satt({ status: 'aktiv' }));
    expect(utan?.status).toBe(400);
    expect(utan.message).toContain('samtycke');
    expect(utan.message).toContain('2019:1297');
    expect(fel(() => satt({ status: 'aktiv', samtycke: true }))?.status).toBe(400);
    expect(satt({ status: 'aktiv', samtycke: true, samtyckeSatt: 'muntligt' }).reko).toMatchObject({ kod: 'aktiv', samtycke: true, samtyckeSatt: 'muntligt' });
    // Samtycket gäller tills patienten avböjer eller insatserna avslutas.
    expect(satt({ status: 'uppfoljning' }).reko).toMatchObject({ kod: 'uppfoljning', samtycke: true });
    expect(satt({ status: 'avbojt' }).reko).toMatchObject({ kod: 'avbojt', samtycke: false });
    expect(fel(() => satt({ status: 'aktiv' }))?.status).toBe(400);
    expect(satt({ status: 'aktiv', samtycke: true, samtyckeSatt: 'skriftligt' }).reko.samtycke).toBe(true);
    expect(fel(() => satt({ status: 'okand' }))?.status).toBe(400);
    expect(fel(() => satt({ status: 'kontaktad', start: '2025-01-01' }))?.status).toBe(404);
    // Historiken visar varje ändring med vem och när, och varje ändring loggas.
    const h = reko.forPatient(db, rk(db), 'p11', DAG).sjukfall[0].historik;
    expect(h.map(x => x.kod)).toEqual(['aktiv', 'avbojt', 'uppfoljning', 'aktiv', 'kontaktad']);
    expect(h[0]).toMatchObject({ sattAv: personal(db, 'rk-vc').namn, samtyckeSatt: 'skriftligt' });
    expect(loggar(db, 'reko_satta').length).toBe(5);
    // Historiken ändras och raderas aldrig.
    expect(fel(() => db.query("UPDATE reko_status SET status = 'ingen'").run())).toBeTruthy();
    expect(fel(() => db.query('DELETE FROM reko_status').run())).toBeTruthy();
  });

  test(`${T}utan åtkomst till patienten röjs inte om ett sjukfall finns: samma svar för ett verkligt och ett påhittat sjukfall, och försöket loggas som nekat`, () => {
    const db = nyDb();
    const utan = db.query('SELECT id FROM patienter WHERE coalesce(skyddad, 0) = 0').all().map(r => r.id)
      .find(pid => !prova(db, { personal: rk(db), patient: pid, handling: 'reko_satta', resurs: { enhet_id: 'vc-tybble' } }).tillaten);
    lagg(db, { pid: utan });
    lagg(db, { pid: 'p03' });
    for (const pid of [utan, 'p03']) {
      const verkligt = fel(() => reko.satt(db, rk(db), pid, { start: '2026-10-20', status: 'kontaktad' }, DAG));
      const pahittat = fel(() => reko.satt(db, rk(db), pid, { start: '2025-01-01', status: 'kontaktad' }, DAG));
      expect(verkligt?.status).toBe(404);
      expect([pahittat.status, pahittat.message, pahittat.kod]).toEqual([verkligt.status, verkligt.message, verkligt.kod]);
      const lasning = fel(() => reko.forPatient(db, rk(db), pid, DAG));
      expect([lasning.status, lasning.message]).toEqual([verkligt.status, verkligt.message]);
    }
    const nekade = db.query("SELECT * FROM atkomstlogg WHERE personal_id = 'rk-vc' AND resultat = 'nekad' ORDER BY id").all();
    expect(nekade.filter(r => r.patient_id === utan && r.handling === 'reko_satta').length).toBe(2);
    expect(nekade.filter(r => r.patient_id === utan && r.handling === 'reko_lasa').length).toBe(1);
    expect(nekade.filter(r => r.patient_id === 'p03').length).toBe(3);
    // Inget sparades.
    expect(db.query('SELECT count(*) AS n FROM reko_status WHERE patient_id IN (?, ?)').get(utan, 'p03').n).toBe(0);
  });

  test(`${T}en patient utan sjukfall på vårdenheten ger samma 404 som utan åtkomst, och ingen loggrad för ett sjukfall som inte finns`, () => {
    const db = nyDb();
    expect(prova(db, { personal: rk(db), patient: 'p11', handling: 'reko_lasa', resurs: { enhet_id: 'vc-tybble' } }).tillaten).toBe(true);
    const e = fel(() => reko.forPatient(db, rk(db), 'p11', DAG));
    expect([e?.status, e?.message]).toEqual([404, reko.SAKNAS]);
    expect(db.query("SELECT count(*) AS n FROM atkomstlogg WHERE personal_id = 'rk-vc' AND patient_id = 'p11'").get().n).toBe(0);
  });

  test(`${T}patientens Avböjt följer med sjukfallet när starten flyttas, för koordinatorn och för läkaren`, () => {
    const db = nyDb();
    const forsta = lagg(db, { fran: '2026-10-01', till: '2026-10-19' });
    lagg(db, { fran: '2026-10-20', till: '2026-11-30' });
    const satt = (body) => reko.satt(db, rk(db), 'p11', body, DAG);
    satt({ start: '2026-10-01', status: 'aktiv', samtycke: true, samtyckeSatt: 'muntligt' });
    satt({ start: '2026-10-01', status: 'avbojt' });
    // Sjukfallets första intyg makuleras, och sjukfallet börjar nu 2026-10-20.
    db.query("UPDATE sjukskrivningar SET status = 'makulerat' WHERE intygs_id = ?").run(forsta);
    const s = lista(db).sjukfall.find(x => x.patientId === 'p11');
    expect(s.start).toBe('2026-10-20');
    expect(s.reko).toMatchObject({ kod: 'avbojt', text: 'Avböjt', samtycke: false });
    expect(reko.forPatient(db, rk(db), 'p11', DAG).sjukfall[0].historik.map(h => h.kod)).toEqual(['avbojt', 'aktiv']);
    expect(sjukfall.forPatient(atk(db, 'lak-vc', 'p11', {}, 'las_intyg'), null, DAG).pagaende[0].reko.kod).toBe('avbojt');
    expect(sjukfall.minaSjukfall(db, personal(db, 'lak-vc'), () => ({}), DAG).sjukfall.find(x => x.patientId === 'p11').reko.kod).toBe('avbojt');
    // Nejet gäller: att börja igen kräver ett nytt samtycke.
    expect(fel(() => satt({ start: '2026-10-20', status: 'aktiv' }))?.status).toBe(400);
    // Ett senare sjukfall efter ett uppehåll längre än 5 dagar börjar om med Ingen.
    const b = annan(db);
    lagg(db, { pid: b, fran: '2026-09-01', till: '2026-09-10' });
    reko.satt(db, rk(db), b, { start: '2026-09-01', status: 'kontaktad' }, '2026-09-05');
    lagg(db, { pid: b, fran: '2026-11-01', till: '2026-11-20' });
    expect(lista(db).sjukfall.find(x => x.patientId === b).reko.kod).toBe('ingen');
    // Ett sjukfall vars alla intyg har makulerats tar inte med sig sin status.
    const c = lagg(db, { pid: b, fran: '2026-06-01', till: '2026-06-10' });
    reko.satt(db, rk(db), b, { start: '2026-06-01', status: 'avbojt' }, '2026-06-05');
    db.query("UPDATE sjukskrivningar SET status = 'makulerat' WHERE intygs_id = ?").run(c);
    expect(lista(db).sjukfall.find(x => x.patientId === b).reko.kod).toBe('ingen');
  });

  test(`${T}handlingen för tabellen ger ingen åtkomst till en enskild patient`, () => {
    const db = nyDb();
    const utan = db.query('SELECT id FROM patienter WHERE coalesce(skyddad, 0) = 0').all().map(r => r.id)
      .find(pid => !prova(db, { personal: rk(db), patient: pid, handling: 'reko_lasa', resurs: { enhet_id: 'vc-tybble' } }).tillaten);
    expect(prova(db, { personal: rk(db), patient: utan, handling: 'sjukfall_reko' }).tillaten).toBe(false);
  });

  test(`${T}filtret på REKO-status visar bara sjukfall med den statusen`, () => {
    const db = nyDb();
    lagg(db);
    const b = annan(db);
    lagg(db, { pid: b, fran: '2026-11-01', till: '2026-11-20' });
    reko.satt(db, rk(db), 'p11', { start: '2026-10-20', status: 'kontaktad' }, DAG);
    expect(lista(db, { sok: true, reko: 'kontaktad' }).sjukfall.map(s => s.patientId)).toEqual(['p11']);
    expect(lista(db, { sok: true, reko: 'ingen' }).sjukfall.map(s => s.patientId)).toContain(b);
    expect(lista(db, { sok: true, reko: 'ingen' }).sjukfall.map(s => s.patientId)).not.toContain('p11');
    expect(fel(() => lista(db, { sok: true, reko: 'x' }))?.status).toBe(400);
  });

  test(`${T}läkaren ser REKO-statusen i sin översikt och på fliken Sjukskrivning men kan inte sätta den, och andra roller når inte listan`, () => {
    const db = nyDb();
    lagg(db);
    reko.satt(db, rk(db), 'p11', { start: '2026-10-20', status: 'aktiv', samtycke: true, samtyckeSatt: 'muntligt' }, DAG);
    const mina = sjukfall.minaSjukfall(db, personal(db, 'lak-vc'), () => ({}), DAG).sjukfall.find(s => s.patientId === 'p11');
    expect(mina.reko).toMatchObject({ kod: 'aktiv', text: 'Aktiv' });
    const pat = sjukfall.forPatient(atk(db, 'lak-vc', 'p11', {}, 'las_intyg'), null, DAG).pagaende[0];
    expect(pat.reko).toMatchObject({ kod: 'aktiv', text: 'Aktiv', sattAv: personal(db, 'rk-vc').namn });
    expect(fel(() => reko.satt(db, personal(db, 'lak-vc'), 'p11', { start: '2026-10-20', status: 'avslutad' }, DAG))?.status).toBe(403);
    expect(fel(() => reko.lista(db, personal(db, 'lak-vc'), { sok: true }, DAG))?.status).toBe(403);
    expect(fel(() => reko.lista(db, personal(db, 'adm-kard'), { sok: true }, DAG))?.status).toBe(403);
  });
});
