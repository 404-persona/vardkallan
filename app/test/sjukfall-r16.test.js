// Runda 16, r2: stödet vid sjukskrivning (sjukfall.js). Sjukfallen räknas ur sjukintygen efter regeln i Rehabstöd,
// beslutsstödet jämförs med den sammanlagda sjukskrivningen, och en sjukskrivning förlängs med ett klick. Intygen
// signeras i den simulerade intygsapplikationen, som skickar svaren med statusuppdateringen.
import { describe, test, expect } from 'bun:test';
import { iso } from '../src/db.js';
import * as sjukfall from '../src/sjukfall.js';
import * as intyg from '../src/lakarintyg.js';
import * as app from '../src/intygsapplikation-simulerad.js';
import * as beslutsstod from '../src/intygsapplikation-beslutsstod-simulerad.js';
import * as IT from '../src/intygstyper.js';
import * as svar from '../src/sjukfall-intygssvar.js';
import * as rivta from '../src/rivta/index.js';
import { atk, personal } from './hjalp.js';
import { nyDbSomStangs } from './r14r3-hjalp.js';

const nyDbMedDemo = nyDbSomStangs();
// Demons sjukskrivningar ligger relativt till i dag. Testerna räknar med en fast dag och gör dem makulerade, så att de
// aldrig räknas (en rad raderas inte).
const nyDb = () => { const db = nyDbMedDemo(); db.query("UPDATE sjukskrivningar SET status = 'makulerat' WHERE kalla = 'demo'").run(); return db; };
const T = 'Sjukfall > ';
const DAG = '2026-11-12';
const patient = (db, pid) => db.query('SELECT * FROM patienter WHERE id = ?').get(pid);
const fel = async (fn) => { try { await fn(); } catch (e) { return e; } return null; };
const intygRad = (id, perioder, extra = {}) => ({ id, intygsId: `i${id}`, enhetId: 'vc-tybble', signerad: `2026-01-0${id}T10:00:00Z`, status: 'signerat', diagnosKod: 'M544', perioder,
  start: perioder.map(p => p.fran).sort()[0], slut: perioder.map(p => p.till).sort().at(-1), ...extra });
// Ett signerat sjukintyg direkt i journalens tabell, som från en statusuppdatering.
let nr = 0;
function lagg(db, { pid = 'p11', enhet = 'vc-tybble', pers = 'lak-vc', perioder, diagnos = 'M54.4', text = 'Lumbago-ischias', signerad = null, motivering = null, status = 'signerat' }) {
  const p = personal(db, pers);
  db.query(`INSERT INTO sjukskrivningar (patient_id, enhet_id, intygs_id, typ, personal_id, personal_namn, signerad, status, diagnos_kod, diagnos_text,
    sysselsattning, perioder, fmb_motivering, kalla, mottagen) VALUES (?, ?, ?, 'LISJP', ?, ?, ?, ?, ?, ?, 'nuvarande_arbete', ?, ?, 'test', ?)`)
    .run(pid, enhet, `test-${++nr}`, p.id, p.namn, signerad ?? '2026-10-15T10:00:00Z', status, diagnos.replace('.', ''), text, JSON.stringify(perioder), motivering, iso());
}
// Svaren i ett läkarintyg för sjukpenning (version 2) som läkaren fyller i, med frågans id som nyckel.
const NEDS = { heltid: 'HELT_NEDSATT', tre_fjardedelar: 'TRE_FJARDEDEL', halften: 'HALFTEN', en_fjardedel: 'EN_FJARDEDEL' };
const svarFor = ({ fran, till, nedsattning = 'heltid', motivering = null }) => ({
  '1': { FYSISKUNDERSOKNING: fran }, '28': ['NUVARANDE_ARBETE'], '29': 'Lagerarbetare', '6': [{ kod: 'M544', text: 'Lumbago-ischias' }],
  '35': 'Smärta i ländryggen.', '17': 'Kan inte lyfta.', '32': [{ kod: NEDS[nedsattning], fran, till }], ...(nedsattning !== 'heltid' ? { '33': false } : {}),
  '39': 'STOR_SANNOLIKHET', ...(motivering ? { '37': motivering } : {}),
});
// Ett sjukintyg som skrivs och signeras i intygsapplikationen, som läkaren gör.
async function signera(db, { pid = 'p11', pers = 'lak-vc', ...v }) {
  db.query("INSERT INTO diagnoser (patient_id, enhet_id, kod, text, typ, datum) VALUES (?, 'vc-tybble', 'M54.4', 'Lumbago-ischias', 'huvud', ?)").run(pid, DAG);
  const r = await intyg.skapa(atk(db, pers, pid, {}, 'skriv_intyg'), patient(db, pid), { typ: 'LISJP' }, DAG);
  const id = r.oppna.split('/').pop();
  const lak = personal(db, pers);
  await app.spara(db, lak, id, { svar: svarFor(v) });
  await app.atgard(db, lak, id, 'signera');
  return id;
}

describe('Stödet vid sjukskrivning', () => {
  test(`${T}intyg med högst 5 dagars uppehåll hör till samma sjukfall, och dagar mellan intygen räknas inte`, () => {
    // Exemplet i Rehabstöds användarmanual: 61 + 57 = 118 dagar.
    const s = sjukfall.byggSjukfall([intygRad(1, [{ fran: '2023-09-01', till: '2023-10-31', grad: 100 }]), intygRad(2, [{ fran: '2023-11-05', till: '2023-12-31', grad: 50 }])], { dag: '2023-12-01' });
    expect(s.length).toBe(1);
    expect(s[0]).toMatchObject({ start: '2023-09-01', slut: '2023-12-31', dagar: 118, antalIntyg: 2, pagaende: true, aktuellGrad: 50, uppskattadDag: 92 });
    expect(s[0].tidslinje.map(t => [t.fran, t.till, t.grad])).toEqual([['2023-09-01', '2023-10-31', 100], ['2023-11-05', '2023-12-31', 50]]);
    // Sex dagars uppehåll ger två sjukfall.
    expect(sjukfall.byggSjukfall([intygRad(1, [{ fran: '2023-09-01', till: '2023-09-10', grad: 100 }]), intygRad(2, [{ fran: '2023-09-17', till: '2023-09-20', grad: 100 }])], { dag: '2023-09-18' }).length).toBe(2);
    // Överlappande intyg räknas en gång per dag, och det som signerades senast bestämmer graden.
    const o = sjukfall.byggSjukfall([intygRad(1, [{ fran: '2023-09-01', till: '2023-09-20', grad: 100 }]), intygRad(2, [{ fran: '2023-09-15', till: '2023-09-30', grad: 25 }])], { dag: '2023-09-16' })[0];
    expect(o.dagar).toBe(30);
    expect(o.aktuellGrad).toBe(25);
    expect(o.nuvarandeIntygId).toBe(2);
    // Ett makulerat intyg räknas aldrig, och flera nivåer i samma intyg visas i ordning.
    const m = sjukfall.byggSjukfall([intygRad(1, [{ fran: '2023-09-01', till: '2023-09-10', grad: 100 }, { fran: '2023-09-11', till: '2023-09-20', grad: 50 }]), intygRad(2, [{ fran: '2023-09-21', till: '2023-12-20', grad: 100 }], { status: 'makulerat' })], { dag: '2023-09-12' });
    expect(m.length).toBe(1);
    expect(m[0]).toMatchObject({ dagar: 20, grader: [100, 50], aktuellGrad: 50, kvarDagar: 8 });
  });

  test(`${T}rehabiliteringskedjan: systemet säger när patienten närmar sig dag 90, 180 och 365`, () => {
    expect(sjukfall.rehabkedjan(50)).toMatchObject({ nastaGrans: 90, kvar: 40, nara: false });
    const n = sjukfall.rehabkedjan(80);
    expect(n).toMatchObject({ nastaGrans: 90, kvar: 10, nara: true });
    expect(n.text).toContain('Dag 90 i rehabiliteringskedjan om 10 dagar');
    expect(n.text).toContain('alla arbeten hos arbetsgivaren');
    expect(sjukfall.rehabkedjan(175)).toMatchObject({ nastaGrans: 180, nara: true, passerade: [90] });
    expect(sjukfall.rehabkedjan(400)).toMatchObject({ nastaGrans: null, passerade: [90, 180, 365] });
    expect(sjukfall.rehabkedjan(0)).toBeNull();
  });

  test(`${T}det signerade sjukintyget ger journalen perioden, graden, diagnosen och sysselsättningen genom statusuppdateringen`, async () => {
    const db = nyDb();
    const id = await signera(db, { fran: '2026-11-02', till: '2026-11-15', nedsattning: 'halften' });
    const rad = db.query('SELECT * FROM sjukskrivningar WHERE intygs_id = ?').get(id);
    expect(rad).toMatchObject({ patient_id: 'p11', enhet_id: 'vc-tybble', status: 'signerat', diagnos_kod: 'M544', sysselsattning: 'nuvarande_arbete', personal_id: 'lak-vc', kalla: 'statusuppdatering' });
    expect(JSON.parse(rad.perioder)).toEqual([{ fran: '2026-11-02', till: '2026-11-15', grad: 50 }]);
    // Statusuppdateringen följer schemat (grunden validerar varje meddelande) och loggas utan personnummer.
    const logg = rivta.anropslogg(db).filter(x => x.kontrakt === 'CertificateStatusUpdateForCare');
    expect(logg.every(x => x.resultat === 'ok')).toBe(true);
    const u = sjukfall.forPatient(atk(db, 'lak-vc', 'p11', {}, 'las_intyg'), patient(db, 'p11'), DAG);
    expect(u.pagaende[0]).toMatchObject({ start: '2026-11-02', slut: '2026-11-15', dagar: 14, aktuellGrad: 50, uppskattadDag: 11, diagnos: { kod: 'M54.4' } });
    // Skickat ändrar status, makulerat tar bort intyget ur sjukfallet.
    await app.atgard(db, personal(db, 'lak-vc'), id, 'skicka', {}, { samrad: true });
    expect(db.query('SELECT status FROM sjukskrivningar WHERE intygs_id = ?').get(id).status).toBe('skickat');
    await app.atgard(db, personal(db, 'lak-vc'), id, 'makulera', {}, { orsak: 'Utfärdat på fel patient.' });
    expect(sjukfall.forPatient(atk(db, 'lak-vc', 'p11', {}, 'las_intyg'), patient(db, 'p11'), DAG).pagaende).toEqual([]);
    // Ett utkast som aldrig signeras blir ingen sjukskrivning.
    const r = await intyg.skapa(atk(db, 'lak-vc', 'p11', {}, 'skriv_intyg'), patient(db, 'p11'), { typ: 'LISJP' }, DAG);
    await app.spara(db, personal(db, 'lak-vc'), r.oppna.split('/').pop(), { svar: { '32': [{ kod: 'HELT_NEDSATT', fran: DAG, till: '2026-11-20' }] } });
    expect(db.query('SELECT count(*) AS n FROM sjukskrivningar WHERE intygs_id = ?').get(r.oppna.split('/').pop()).n).toBe(0);
  });

  test(`${T}beslutsstödet varnar när den sammanlagda sjukskrivningen blir längre än Socialstyrelsens rekommendation, med de tidigare intygen`, async () => {
    const db = nyDb();
    lagg(db, { perioder: [{ fran: '2026-08-10', till: '2026-10-31', grad: 100 }] });
    const r = await intyg.skapa(atk(db, 'lak-vc', 'p11', {}, 'skriv_intyg'), patient(db, 'p11'), { typ: 'LISJP' }, DAG);
    const id = r.oppna.split('/').pop();
    const lak = personal(db, 'lak-vc');
    await app.spara(db, lak, id, { svar: { '6': [{ kod: 'M544', text: 'Lumbago-ischias' }], '32': [{ kod: 'HALFTEN', fran: '2026-11-01', till: '2026-11-30' }] } });
    const b = sjukfall.forUtkast(atk(db, 'lak-vc', 'p11', {}, 'las_intyg'), beslutsstod.utkastFor(db, lak, id), DAG);
    expect(b.beslutsstod.diagnosrubrik).toBe('Lumbago-ischias');
    expect(b.total).toBe(83 + 30);
    expect(b.tidigareDagar).toBe(83);
    expect(b.over).toBe(true);
    expect(b.varning).toContain('blir 113 dagar med det här intyget (83 dagar i tidigare intyg i sjukfallet)');
    expect(b.varning).toContain('som längst 3 månader (93 dagar)');
    expect(b.varning).not.toMatch(/[—–…]/);
    // Intyget sträcker sig över dag 90 i rehabiliteringskedjan.
    expect(b.passerar.map(x => x.dag)).toEqual([90]);
    // Inom rekommendationen: ingen varning.
    await app.spara(db, lak, id, { svar: { '32': [{ kod: 'HALFTEN', fran: '2026-11-01', till: '2026-11-05' }] } });
    expect(sjukfall.forUtkast(atk(db, 'lak-vc', 'p11', {}, 'las_intyg'), beslutsstod.utkastFor(db, lak, id), DAG)).toMatchObject({ over: false, varning: null, total: 88 });
    // Utan diagnos förklarar systemet vad som behövs.
    expect(sjukfall.bedom([], { diagnosKod: null, perioder: [] }).utanDiagnos).toContain('Välj en diagnos');
  });

  test(`${T}motiveringen skrivs en gång i fråga 37, följer med i intyget och i förlängningen`, async () => {
    const db = nyDb();
    lagg(db, { perioder: [{ fran: '2026-08-10', till: '2026-10-31', grad: 100 }] });
    const id = await signera(db, { fran: '2026-11-01', till: '2026-11-20', motivering: 'Väntar på operation, tungt arbete.' });
    // Motiveringen kom till journalen med statusuppdateringen (fråga 37).
    expect(db.query('SELECT fmb_motivering FROM sjukskrivningar WHERE intygs_id = ?').get(id).fmb_motivering).toBe('Väntar på operation, tungt arbete.');
    const u = sjukfall.forPatient(atk(db, 'lak-vc', 'p11', {}, 'las_intyg'), patient(db, 'p11'), DAG);
    expect(u.pagaende[0].fmb).toMatchObject({ over: true, motiverat: true });
    // Förlängningen förnyar intyget, och motiveringen följer med som ett svar som inte har ändrats.
    const f = await sjukfall.forlang(atk(db, 'lak-vc', 'p11', {}, 'skriv_intyg'), patient(db, 'p11'), {}, DAG);
    const nytt = app.lasSvar(db.query('SELECT * FROM sim_intygsapplikation WHERE intygs_id = ?').get(f.oppna.split('/').pop()));
    expect(nytt['37']).toBe('Väntar på operation, tungt arbete.');
    // Beslutsstödet i utkastet ser att motiveringen finns, men lämnar inte ut texten genom API:t (sjukfall-rutter.js).
    const b = sjukfall.forUtkast(atk(db, 'lak-vc', 'p11', {}, 'las_intyg'), beslutsstod.utkastFor(db, personal(db, 'lak-vc'), f.oppna.split('/').pop()), DAG);
    expect(b.motiveringIIntyget).toBe('Väntar på operation, tungt arbete.');
  });

  test(`${T}förlängningen förnyar med ett klick förra intyget, och beslutsstödet föreslår perioden från dagen efter`, async () => {
    const db = nyDb();
    await signera(db, { fran: '2026-11-02', till: '2026-11-15', nedsattning: 'tre_fjardedelar' });
    const u = sjukfall.forPatient(atk(db, 'lak-vc', 'p11', {}, 'las_intyg'), patient(db, 'p11'), DAG);
    expect(u.forlangning).toMatchObject({ fran: '2026-11-16', till: '2026-11-29', grad: 75, dagar: 14 });
    const f = await sjukfall.forlang(atk(db, 'lak-vc', 'p11', {}, 'skriv_intyg'), patient(db, 'p11'), {}, DAG);
    expect(f.forslag).toMatchObject({ fran: '2026-11-16', till: '2026-11-29', grad: 75 });
    const id = f.oppna.split('/').pop();
    // Förnyelsen i intygsapplikationen: svaren som inte har ändrats följer med, och grad, period, underlag och prognos tar
    // läkaren ställning till på nytt (intygstyper.overfor). Inget sparas i utkastet av förlängningen själv.
    const rad = db.query('SELECT * FROM sim_intygsapplikation WHERE intygs_id = ?').get(id);
    expect(rad.relation_typ).toBe('FRLANG');
    const s = app.lasSvar(rad);
    expect(s).toMatchObject({ '6': [{ kod: 'M544' }], '28': ['NUVARANDE_ARBETE'], '29': 'Lagerarbetare' });
    expect(s['32']).toBeUndefined();
    expect(s['39']).toBeUndefined();
    // Beslutsstödet föreslår perioden, som läkaren fyller i och sparar själv.
    const b = sjukfall.forUtkast(atk(db, 'lak-vc', 'p11', {}, 'las_intyg'), beslutsstod.utkastFor(db, personal(db, 'lak-vc'), id), DAG);
    expect(b.forslagPeriod).toMatchObject({ kod: 'TRE_FJARDEDEL', fran: '2026-11-16', till: '2026-11-29' });
    await app.spara(db, personal(db, 'lak-vc'), id, { svar: { '1': { FYSISKUNDERSOKNING: DAG }, '32': [{ kod: 'TRE_FJARDEDEL', fran: '2026-11-16', till: '2026-11-29' }], '33': false, '39': 'STOR_SANNOLIKHET' } });
    await app.atgard(db, personal(db, 'lak-vc'), id, 'signera');
    const e = sjukfall.forPatient(atk(db, 'lak-vc', 'p11', {}, 'las_intyg'), patient(db, 'p11'), DAG);
    expect(e.pagaende.length).toBe(1);
    expect(e.pagaende[0]).toMatchObject({ dagar: 28, antalIntyg: 2, slut: '2026-11-29' });
    // Ett sjukfall som tog slut för mer än 5 dagar sedan förlängs inte: det blir ett nytt sjukfall.
    const db2 = nyDb();
    lagg(db2, { perioder: [{ fran: '2026-10-01', till: '2026-11-05', grad: 100 }] });
    expect(sjukfall.forPatient(atk(db2, 'lak-vc', 'p11', {}, 'las_intyg'), patient(db2, 'p11'), DAG).forlangning).toBeNull();
    expect((await fel(() => sjukfall.forlang(atk(db2, 'lak-vc', 'p11', {}, 'skriv_intyg'), patient(db2, 'p11'), {}, DAG))).message).toContain('nytt sjukfall');
    // Ett sjukfall som bara finns i journalens tabell (utan intyget i journalen) förlängs med ett nytt sjukintyg, som skapas
    // med journalens förifyllnad från den egna vårdenheten.
    const db3 = nyDb();
    lagg(db3, { perioder: [{ fran: '2026-11-01', till: '2026-11-15', grad: 100 }] });
    const f3 = await sjukfall.forlang(atk(db3, 'lak-vc', 'p11', {}, 'skriv_intyg'), patient(db3, 'p11'), {}, DAG);
    expect(db3.query('SELECT relation_typ FROM sim_intygsapplikation WHERE intygs_id = ?').get(f3.oppna.split('/').pop()).relation_typ).toBeNull();
    // Sjuksköterskan ser sjukfallet men förlänger inte, och vårdadministratören ser inte sjukskrivningen.
    const ssk = sjukfall.forPatient(atk(db, 'ssk-vc', 'p11', {}, 'las_intyg'), patient(db, 'p11'), DAG);
    expect(ssk.forlangning).toBeNull();
    expect((await fel(() => sjukfall.forlang(atk(db, 'ssk-vc', 'p11', {}, 'skriv_intyg'), patient(db, 'p11'), {}, DAG))).status).toBe(403);
    const adm = db.query("SELECT id FROM personal WHERE yrke = 'vardadministrator' AND enhet_id = 'vc-tybble' LIMIT 1").get()?.id;
    if (adm) expect((await fel(() => sjukfall.forPatient(atk(db, adm, 'p11', {}, 'las_intyg'), patient(db, 'p11'), DAG))).status).toBe(403);
    // Reglerna för intyget gäller också förlängningen: en avliden patient får inget nytt sjukintyg.
    db.query("INSERT INTO avlidna (patient_id, datum, registrerad_av, registrerad) VALUES ('p11', ?, 'lak-vc', ?)").run(DAG, iso());
    expect((await fel(() => sjukfall.forlang(atk(db, 'lak-vc', 'p11', {}, 'skriv_intyg'), patient(db, 'p11'), {}, DAG)))?.status).toBe(400);
  });

  test(`${T}ett intyg på en spärrad vårdenhet räknas inte och röjs inte i dagar, summa eller varning, och räknas in med samtycke`, async () => {
    const db = nyDb();
    const tom = nyDb();
    for (const d of [db, tom]) {
      lagg(d, { perioder: [{ fran: '2026-11-01', till: '2026-11-20', grad: 100 }] });
      d.query("INSERT INTO sparrar (patient_id, enhet_id, registrerad, aktiv) VALUES ('p11', 'uso-kard', ?, 1)").run(iso());
    }
    // Den dolda raden: ett långt intyg på den spärrade vårdenheten, som annars skulle ge ett längre sjukfall och en varning.
    lagg(db, { enhet: 'uso-kard', pers: 'lak-kard', perioder: [{ fran: '2026-07-01', till: '2026-10-31', grad: 100 }] });
    const las = (d, val) => sjukfall.forPatient(atk(d, 'lak-vc', 'p11', val, 'las_intyg'), patient(d, 'p11'), DAG);
    for (const val of [{}, { andra_enheter: true }]) {
      const utan = las(db, val);
      expect(utan.pagaende[0].dagar).toBe(20);
      expect(JSON.stringify(utan)).toBe(JSON.stringify(las(tom, val)));
    }
    // Beslutsstödet i intygsapplikationen räknar också bara det som syns.
    const bedomning = (d, val) => {
      const a = atk(d, 'lak-vc', 'p11', val, 'las_intyg');
      return sjukfall.forUtkast(a, { intygsId: 'nytt', typ: 'LISJP', status: 'utkast', svar: { diagnosKod: 'M544', fran: '2026-11-21', till: '2026-12-20', nedsattning: 'heltid' } }, DAG);
    };
    expect(JSON.stringify(bedomning(db, { andra_enheter: true }))).toBe(JSON.stringify(bedomning(tom, { andra_enheter: true })));
    expect(bedomning(db, {}).over).toBe(false);
    // Med patientens samtycke till att spärren hävs räknas intyget in, och sjukfallet blir längre.
    const med = las(db, { andra_enheter: true, samtycke_sparr: true });
    expect(med.pagaende[0]).toMatchObject({ start: '2026-07-01', dagar: 123 + 20 });
    expect(bedomning(db, { andra_enheter: true, samtycke_sparr: true }).over).toBe(true);
  });

  test(`${T}ett intyg från en annan vårdenhet räknas in först efter ett aktivt val`, () => {
    const db = nyDb();
    lagg(db, { perioder: [{ fran: '2026-11-01', till: '2026-11-20', grad: 50 }] });
    lagg(db, { enhet: 'uso-kard', pers: 'lak-kard', perioder: [{ fran: '2026-10-01', till: '2026-10-29', grad: 100 }] });
    const utan = sjukfall.forPatient(atk(db, 'lak-vc', 'p11', {}, 'las_intyg'), patient(db, 'p11'), DAG);
    expect(utan.pagaende[0]).toMatchObject({ start: '2026-11-01', dagar: 20 });
    expect(utan.dolda?.kraverVal).toBe(true);
    const med = sjukfall.forPatient(atk(db, 'lak-vc', 'p11', { andra_enheter: true }, 'las_intyg'), patient(db, 'p11'), DAG);
    expect(med.pagaende[0]).toMatchObject({ start: '2026-10-01', dagar: 49, antalIntyg: 2 });
    expect(med.pagaende[0].intyg.map(i => i.egenEnhet)).toEqual([true, false]);
  });

  test(`${T}läkarens översikt visar de pågående sjukfall där läkaren har signerat det nuvarande intyget, och loggar varje patient`, () => {
    const db = nyDb();
    lagg(db, { pid: 'p11', perioder: [{ fran: '2026-08-20', till: '2026-11-20', grad: 100 }] });
    lagg(db, { pid: 'p14', perioder: [{ fran: '2026-11-01', till: '2026-11-13', grad: 50 }], diagnos: 'J06.9', text: 'Akut övre luftvägsinfektion' });
    // Patienten med skyddade personuppgifter visas maskerad.
    lagg(db, { pid: 'p03', perioder: [{ fran: '2026-11-05', till: '2026-11-25', grad: 25 }] });
    // Ett avslutat sjukfall och ett där en annan läkare signerade det nuvarande intyget visas inte.
    lagg(db, { pid: 'p18', perioder: [{ fran: '2026-09-01', till: '2026-09-30', grad: 100 }] });
    lagg(db, { pid: 'p06', perioder: [{ fran: '2026-11-01', till: '2026-11-10', grad: 100 }] });
    lagg(db, { pid: 'p06', pers: 'lak-kumla', perioder: [{ fran: '2026-11-11', till: '2026-11-30', grad: 100 }], signerad: '2026-11-11T10:00:00Z' });
    // En patient som läkaren inte har vårdrelation till tas inte med.
    lagg(db, { pid: 'p13', perioder: [{ fran: '2026-11-01', till: '2026-11-30', grad: 100 }] });
    const fore = db.query("SELECT count(*) AS n FROM atkomstlogg WHERE resurs = 'sjukfall:oversikt'").get().n;
    const m = sjukfall.minaSjukfall(db, personal(db, 'lak-vc'), () => ({}), DAG);
    expect(m.sjukfall.map(s => s.patientId).sort()).toEqual(['p03', 'p11', 'p14']);
    const p11 = m.sjukfall.find(s => s.patientId === 'p11');
    expect(p11).toMatchObject({ dagar: 93, uppskattadDag: 85, kvarDagar: 8, aktuellGrad: 100, rehabkedjan: { nastaGrans: 90, kvar: 5, nara: true } });
    expect(m.sjukfall.find(s => s.patientId === 'p14')).toMatchObject({ gaarUtSnart: true, kvarDagar: 1 });
    const p03 = m.sjukfall.find(s => s.patientId === 'p03');
    expect(p03.namn).toBe('Skyddad identitet');
    expect(p03.personnummer).not.toBe(patient(db, 'p03').personnummer);
    expect(db.query("SELECT count(*) AS n FROM atkomstlogg WHERE resurs = 'sjukfall:oversikt'").get().n - fore).toBe(3);
    // Översikten är för läkare.
    expect(() => sjukfall.minaSjukfall(db, personal(db, 'ssk-vc'), () => ({}), DAG)).toThrow();
  });

  test(`${T}vårdenhetens översikt för verksamhetschefen visar antal utan patientuppgifter, och små antal som färre än 5`, () => {
    const db = nyDb();
    const pids = ['p11', 'p14', 'p18', 'p06', 'p01', 'p07', 'p09'];
    pids.forEach((pid, i) => lagg(db, { pid, perioder: [{ fran: '2026-11-01', till: '2026-11-30', grad: i < 5 ? 100 : i === 5 ? 50 : 25 }] }));
    // Patienten med skyddade personuppgifter räknas inte.
    lagg(db, { pid: 'p03', perioder: [{ fran: '2026-11-01', till: '2026-11-30', grad: 100 }] });
    const chef = personal(db, 'chef-vc-tybble');
    const e = sjukfall.enhetensSjukfall(db, chef, DAG);
    expect(e.totalt).toBe(7);
    const g = Object.fromEntries(e.grad.map(r => [r.namn, r.text]));
    expect(g).toEqual({ '100 %': '5', '75 %': '0', '50 %': 'färre än 5', '25 %': 'färre än 5' });
    // När bara en ruta skulle döljas döljs också den näst minsta, så att den dolda inte kan räknas fram ur totalen.
    lagg(db, { pid: 'p10', perioder: [{ fran: '2026-11-01', till: '2026-11-30', grad: 50 }] });
    lagg(db, { pid: 'p12', perioder: [{ fran: '2026-11-01', till: '2026-11-30', grad: 50 }] });
    lagg(db, { pid: 'p13', perioder: [{ fran: '2026-11-01', till: '2026-11-30', grad: 50 }] });
    lagg(db, { pid: 'p15', perioder: [{ fran: '2026-11-01', till: '2026-11-30', grad: 50 }] });
    const g2 = Object.fromEntries(sjukfall.enhetensSjukfall(db, chef, DAG).grad.map(r => [r.namn, r.text]));
    expect(g2).toEqual({ '100 %': 'dolt för att skydda små antal', '75 %': '0', '50 %': '5', '25 %': 'färre än 5' });
    // Inget i svaret pekar ut en patient.
    const allt = JSON.stringify(e);
    for (const pid of [...pids, 'p03']) {
      const p = patient(db, pid);
      for (const v of [pid, p.personnummer, p.fornamn, p.efternamn]) expect(allt).not.toContain(`"${v}"`);
      expect(allt).not.toContain(p.personnummer);
    }
    expect(db.query("SELECT patient_id FROM atkomstlogg WHERE resurs = 'sjukfall:enhet' ORDER BY id DESC").get().patient_id).toBeNull();
    // Läkaren har inte vårdenhetens översikt.
    expect(() => sjukfall.enhetensSjukfall(db, personal(db, 'lak-vc'), DAG)).toThrow();
    // Med färre än fem pågående sjukfall döljs också totalen.
    const db2 = nyDb();
    lagg(db2, { pid: 'p11', perioder: [{ fran: '2026-11-01', till: '2026-11-30', grad: 100 }] });
    expect(sjukfall.enhetensSjukfall(db2, chef, DAG)).toMatchObject({ totalt: null, totaltText: 'färre än 5' });
  });

  test(`${T}demon har sjukfall för läkaren på vårdcentralen: nära dag 90 och längre än rekommendationen, nära dag 180 och en skyddad patient`, async () => {
    // Demons mall har sjukskrivningarna, relativt till dagen då mallen byggdes.
    expect(nyDbMedDemo().query("SELECT count(*) AS n FROM sjukskrivningar WHERE kalla = 'demo'").get().n).toBeGreaterThan(5);
    // Samma sjukskrivningar vid en fast dag.
    const db = nyDb();
    sjukfall.seedaDemo(db, DAG, { kalla: 'demotest' });
    const m = sjukfall.minaSjukfall(db, personal(db, 'lak-vc'), () => ({}), DAG);
    expect(m.sjukfall.map(s => s.patientId).sort()).toEqual(['p03', 'p18']);
    expect(m.sjukfall.find(s => s.patientId === 'p18')).toMatchObject({ uppskattadDag: 89, dagar: 95, aktuellGrad: 50, gaarUtSnart: true, rehabkedjan: { nastaGrans: 90, nara: true }, fmb: { over: true, motiverat: true } });
    const p03 = m.sjukfall.find(s => s.patientId === 'p03');
    expect(p03).toMatchObject({ namn: 'Skyddad identitet', uppskattadDag: 171, rehabkedjan: { nastaGrans: 180, nara: true }, grader: [50] });
    // Intygen finns också i journalen och i intygsapplikationen, så att förlängningen kan förnya dem.
    const r = db.query("SELECT s.lakarintyg_id, l.status, l.typ FROM sjukskrivningar s JOIN lakarintyg l ON l.id = s.lakarintyg_id WHERE s.kalla = 'demotest' AND s.patient_id = 'p18' ORDER BY s.signerad DESC").get();
    expect(r).toMatchObject({ status: 'skickat', typ: 'LISJP' });
    const sim = app.lasSvar(db.query("SELECT * FROM sim_intygsapplikation WHERE intygs_id = (SELECT intygs_id FROM lakarintyg WHERE id = ?)").get(r.lakarintyg_id));
    expect(sim['37']).toContain('ryggkirurg');
    expect(IT.saknas(IT.aktuell('LISJP'), sim)).toEqual([]);
    // Demons sjukskrivning förlängs genom förnyelsen av förra intyget.
    const f = await sjukfall.forlang(atk(db, 'lak-vc', 'p18', {}, 'skriv_intyg'), patient(db, 'p18'), {}, DAG);
    expect(db.query('SELECT relation_typ FROM sim_intygsapplikation WHERE intygs_id = ?').get(f.oppna.split('/').pop()).relation_typ).toBe('FRLANG');
    // Seeden läggs bara in en gång.
    const n = db.query("SELECT count(*) AS n FROM sjukskrivningar WHERE kalla = 'demotest'").get().n;
    sjukfall.seedaDemo(db, DAG, { kalla: 'demotest' });
    expect(db.query("SELECT count(*) AS n FROM sjukskrivningar WHERE kalla = 'demotest'").get().n).toBe(n);
  });

  test(`${T}en period med orimligt långt intervall avvisas med en förklaring, och ett stort intervall i databasen räknas snabbt`, async () => {
    // Regeln: giltiga datum, start före slut, inom två år från i dag och högst ett år per period.
    expect(svar.provaPeriod('2026-11-01', '2026-11-30', DAG)).toBeNull();
    expect(svar.provaPeriod('1900-01-01', '9999-12-31', DAG)).toContain('två år');
    expect(svar.provaPeriod('2026-11-01', '2028-01-01', DAG)).toContain('ett år');
    expect(svar.provaPeriod('2026-11-30', '2026-11-01', DAG)).toContain('före');
    expect(svar.provaPeriod('2026-02-30', '2026-03-01', DAG)).toContain('kalendern');
    // Intygsapplikationen sparar inte en sådan period.
    const db = nyDb();
    const r = await intyg.skapa(atk(db, 'lak-vc', 'p11', {}, 'skriv_intyg'), patient(db, 'p11'), { typ: 'LISJP' }, DAG);
    const f = await fel(() => app.spara(db, personal(db, 'lak-vc'), r.oppna.split('/').pop(), { svar: { '32': [{ kod: 'HELT_NEDSATT', fran: '1900-01-01', till: '9999-12-31' }] } }));
    expect(f.status).toBe(400);
    expect(f.message).toContain('två år');
    // Svaren ur ett meddelande och ur intygsapplikationen ger ingen sådan period.
    expect(svar.perioderUrSimSvar({ fran: '1900-01-01', till: '9999-12-31', nedsattning: 'heltid' }, DAG)).toEqual([]);
    const giltig = svar.rivSvar({ fran: '2026-11-01', till: '2026-11-30', nedsattning: 'heltid' });
    expect(svar.lasSvar(giltig, DAG).perioder).toEqual([{ fran: '2026-11-01', till: '2026-11-30', grad: 100 }]);
    const lang = JSON.parse(JSON.stringify(giltig).replace('2026-11-01', '1900-01-01').replace('2026-11-30', '9999-12-31'));
    expect(svar.lasSvar(lang, DAG).perioder).toEqual([]);
    // En rad som redan ligger i databasen med ett jättelikt intervall räknas utan att gå dag för dag.
    const t0 = performance.now();
    const s = sjukfall.byggSjukfall([intygRad(1, [{ fran: '1900-01-01', till: '9998-12-31', grad: 100 }]), intygRad(2, [{ fran: '2026-11-01', till: '2026-11-30', grad: 50 }])], { dag: DAG });
    expect(performance.now() - t0).toBeLessThan(200);
    expect(s[0].dagar).toBe(sjukfall.antalDagar('1900-01-01', '9998-12-31'));
    expect(s[0].tidslinje.map(t => t.grad)).toEqual([100, 50, 100]);
    expect(s[0].aktuellGrad).toBe(50);
  });

  test(`${T}svaren om sjukskrivningen byggs och läses i kontraktets form, och ett felaktigt svar ger ingen period`, () => {
    const s = svar.rivSvar({ sysselsattning: 'studier', fran: '2026-11-01', till: '2026-11-14', nedsattning: 'en_fjardedel', motiveringFmb: ' Skäl ' });
    expect(s.map(x => x['@id'])).toEqual(['28', '32', '37']);
    expect(svar.perioderUrSimSvar({ perioder: [{ fran: '2026-11-08', till: '2026-11-14', nedsattning: 'halften' }, { fran: '2026-11-01', till: '2026-11-07', nedsattning: 'heltid' }] }))
      .toEqual([{ fran: '2026-11-01', till: '2026-11-07', grad: 100 }, { fran: '2026-11-08', till: '2026-11-14', grad: 50 }]);
    expect(svar.perioderUrSimSvar({ fran: '2026-11-10', till: '2026-11-01', nedsattning: 'heltid' })).toEqual([]);
    expect(svar.perioderUrSimSvar({ fran: '2026-11-01', till: '2026-11-10', nedsattning: 'okand' })).toEqual([]);
    expect(svar.lasSvar([{ '@id': '32', delsvar: [{ '@id': '32.1', $any: [] }] }, null, 'x']).perioder).toEqual([]);
    expect(svar.simSvarUrForifyllnad([])).toEqual({});
    // Svar med frågans id som nyckel läses likadant.
    const id = { '6': [{ kod: 'M544', text: 'Lumbago-ischias' }], '28': ['STUDIER'], '32': [{ kod: 'HALFTEN', fran: '2026-11-01', till: '2026-11-14' }], '37': 'Skäl' };
    expect(svar.perioderUrSimSvar(id, '2026-11-12')).toEqual([{ fran: '2026-11-01', till: '2026-11-14', grad: 50 }]);
    expect(svar.simSvar(id)).toMatchObject({ diagnosKod: 'M544', sysselsattning: 'studier', motiveringFmb: 'Skäl' });
    expect(svar.harFrageNycklar(id)).toBe(true);
  });
});
