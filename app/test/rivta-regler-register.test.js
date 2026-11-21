import { describe, test, expect, afterEach } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { nyDb } from './hjalp.js';
import * as rivta from '../src/rivta/index.js';
import * as nationella from '../src/rivta/nationella.js';
import * as register from '../src/rivta/register.js';
import { iProcessenSynk } from '../src/rivta/klient.js';
import { kuvert } from '../src/rivta/soap.js';
import { skriv, tolka } from '../src/rivta/xml.js';
import { schematron } from '../src/rivta/schematron.js';
import * as ei from '../src/engagemangsindex.js';
import * as hosp from '../src/hosp.js';
import * as F from './rivta-facit.js';
import { provar, prova, exempel, kropp, jamforExempelfel } from './rivta-regelhjalp.js';


// Testspår 2: affärsreglerna i TKB för registren och de nationella tjänsterna där Vårdkällan är konsument:
// engagemangsindex (Update), HSA-katalogen (GetEmployeeIncludingProtectedPerson), PU-tjänsten
// (LookupResidentForFullProfile), HOSP (GetHospPersonForPublicHealthCare) och läkemedlen hos andra vårdgivare
// (GetMedicationHistory). Vårdkällans begäran prövas mot TKB:s regler och mot Ineras Schematron, de simulerade
// tjänsterna prövas mot producentens regler, och Ineras exempel ska tas emot av Vårdkällans konsument.

const VG = 'SE2321000164-VK0000';
const RIVTA = join(import.meta.dir, '..', 'rivta');
const T = 'Affärsreglerna i TKB, register och nationella tjänster';
const sim = (db) => iProcessenSynk(nationella.tjanst, { ctx: { db }, avsandare: { hsaId: VG, via: 'direkt' } });
const fanga = (db) => {
  const fangat = [];
  const s = sim(db);
  nationella.satt((a) => { const r = s(a); fangat.push({ action: a.soapAction, begaran: a.text, svar: r.text }); return r; });
  return fangat;
};
afterEach(() => nationella.satt(null));

const DOMANER_EI = {
  'riv:clinicalprocess:healthcond:description': { kategorier: { voo: 'GetCareDocumentation', dia: 'GetDiagnosis', upp: 'GetAlertInformation' }, regler: ['4.1-1', '4.1-2', '4.1-3', '4.1-4', '4.1-5', '4.1-6', '4.1-7', '4.1-8', '4.1-9', '4.1-11', '4.1-12', '4.1-13', '4.1-14'] },
  'riv:clinicalprocess:logistics:logistics': { kategorier: { vko: 'GetCareContacts' }, regler: ['4.1-1', '4.1-2', '4.1-3', '4.1-4', '4.1-5', '4.1-6', '4.1-7', '4.1-8', '4.1-9', '4.1-11', '4.1-12', '4.1-13'] },
  'riv:clinicalprocess:activityprescription:actoutcome': { kategorier: { 'caa-gvh': 'GetVaccinationHistory' } },
};
const schemaFil = (...d) => schematron(readFileSync(join(RIVTA, ...d), 'utf8'));

describe(T, () => {
  test('engagemangsindex: varje Update från Vårdkällan följer TKB, domänernas regler och Ineras Schematron', () => {
    provar('Update', ['2.1.3-1', '3.2-1', '4.3.1.3-2', '5.2.2-1', 'kR1', 'kR2', 'kR3', 'kR3-2', 'kR3-3', 'kR4-1', '8.2.2.1-1', '8.2.2.1-2', '8.2.2.1-3', '8.2.2.1-4', '8.2.2.1-5', '8.2.2.1-6', '9.2-1', '9.2-2', '9.3.2-1', '9.3.4-1', '9.3.4.1-1', '9.3.4.2-1',
      '4.1-1', '4.1-3', '4.1-4', '4.1-5', '4.1-6', '4.1-7', '4.1-8', '4.1-9', '4.1-12', '4.1-13', '4.1-14', '4.1-15', '4.1-16', '4.1-21', '4.1-23', '4.1-24', '4.1-25', '4.1-26', '4.1-27', '4.1-28', '4.1-31', '4.1-32', '4.1-33', '4.1-35',
      '4.1-41', '4.1-43', '4.1-44', '4.1-45', '4.1-46', '4.1-47', '4.1-48', '4.1-49', '4.1-51', '4.1-52', '4.1-53']);
    provar('GetDiagnosis', ['4.1-1', '4.1-3', '4.1-4', '4.1-5', '4.1-6', '4.1-7', '4.1-8', '4.1-9', '4.1-11', '4.1-12', '4.1-13', '4.1-14']);
    provar('GetCareDocumentation', ['4.1-1', '4.1-3', '4.1-4', '4.1-5', '4.1-6', '4.1-7', '4.1-8', '4.1-9', '4.1-11', '4.1-12', '4.1-13', '4.1-14']);
    provar('GetAlertInformation', ['4.1-1', '4.1-3', '4.1-4', '4.1-5', '4.1-6', '4.1-7', '4.1-8', '4.1-9', '4.1-11', '4.1-12', '4.1-13', '4.1-14']);
    provar('GetDiagnosis', ['7.2.3-6']);
    provar('GetCareDocumentation', ['7.1.4-6']);
    provar('GetAlertInformation', ['7.3.3-6']);
    provar('GetCareContacts', ['4.1-1', '4.1-3', '4.1-4', '4.1-5', '4.1-6', '4.1-7', '4.1-8', '4.1-9', '4.1-11', '4.1-12', '4.1-13']);
    const db = nyDb();
    ei.installningar(db);
    db.query("INSERT OR REPLACE INTO installningar (nyckel, varde) VALUES ('engagemangsindex.poster_per_anrop', '25')").run();
    const fangat = fanga(db);
    ei.markeraPatienter(db);
    ei.skicka(db, { tvinga: true });
    const anrop = fangat.filter(f => f.action.includes('Update'));
    expect(anrop.length).toBeGreaterThan(1);
    const inera = [schemaFil('riv.itintegration.engagementindex', 'test-suite', 'UpdateMock', 'schematron', 'general_update_constraints.xml'),
      schemaFil('riv.clinicalprocess.healthcond.description', 'schemas', 'engagementindex', 'riv_clinicalprocess_healthcond_description_ei_update_constraints.xml'),
      schemaFil('riv.clinicalprocess.activityprescription.actoutcome', 'schemas', 'engagementindex', 'riv_clinicalprocess_activityprescription_actoutcome_ei_update_constraints.xml')];
    const fel = [];
    const reserv = new Set(db.query("SELECT personnummer FROM patienter WHERE id_typ NOT IN ('personnummer', 'samordningsnummer') OR skyddad = 1").all().map(r => r.personnummer));
    const nycklar = new Set();
    for (const a of anrop) {
      for (const s of inera) for (const f of s.prova(tolka(a.begaran))) fel.push(`Ineras Schematron: ${f.nod} ${f.test}`);
      const poster = kropp(a.begaran).barn;
      expect(poster.length).toBeLessThanOrEqual(25);
      const sedda = new Set();
      for (const t of poster) {
        const e = Object.fromEntries(t.barn.find(x => x.lokal === 'engagement').barn.map(x => [x.lokal, x.text]));
        const radera = t.barn.find(x => x.lokal === 'deleteFlag')?.text === 'true';
        const d = DOMANER_EI[e.serviceDomain];
        if (!d || !Object.hasOwn(d.kategorier, e.categorization)) fel.push(`okänd domän eller kategori ${e.serviceDomain} ${e.categorization}`);
        if (!/^(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01]|6[1-9]|[78]\d|9[01])\d{4}$/.test(e.registeredResidentIdentification)) fel.push(`personid ${e.registeredResidentIdentification.length} tecken`);
        if (reserv.has(e.registeredResidentIdentification)) fel.push('reservnummer eller skyddad identitet i indexet');
        if (e.logicalAddress !== e.sourceSystem || e.sourceSystem !== VG) fel.push('logicalAddress och sourceSystem');
        if (e.businessObjectInstanceIdentifier !== 'NA' || e.clinicalProcessInterestId !== 'NA') fel.push('NA');
        for (const x of ['owner', 'creationTime', 'updateTime']) if (Object.hasOwn(e, x)) fel.push(`${x} skickas`);
        if (!radera && !/^\d{14}$/.test(e.mostRecentContent ?? '')) fel.push(`mostRecentContent ${e.mostRecentContent}`);
        const vantad = e.serviceDomain === 'riv:clinicalprocess:logistics:logistics' ? 'SE2321000164' : VG;
        if (e.dataController !== vantad) fel.push(`dataController ${e.serviceDomain} ${e.dataController}`);
        const nyckel = [e.registeredResidentIdentification, e.serviceDomain, e.categorization, e.logicalAddress, e.sourceSystem, e.dataController].join('|');
        if (sedda.has(nyckel)) fel.push('dubblett i begäran');
        sedda.add(nyckel);
        nycklar.add(nyckel);
      }
    }
    expect([...new Set(fel)]).toEqual([]);
    expect(nycklar.size).toBeGreaterThan(20);
  });

  test('engagemangsindex: en borttagning har samma identitet som posten, och den sista uppgiften som försvinner tar bort posten', () => {
    provar('Update', ['4.3.1.3-1', '4.3.1.3-2', '5.2.2-2', 'kR2', '4.1-12', '4.1-31', '4.1-51']);
    const db = nyDb();
    const fangat = fanga(db);
    // En patient med vårdkontakter men inga vårdtillfällen (som inte får raderas).
    const pat = db.query("SELECT p.id FROM patienter p WHERE p.id_typ = 'personnummer' AND p.skyddad = 0 AND NOT EXISTS (SELECT 1 FROM vardtillfallen v WHERE v.patient_id = p.id) AND EXISTS (SELECT 1 FROM vardkontakter k WHERE k.patient_id = p.id) ORDER BY p.id").get().id;
    ei.markeraPatienter(db, [pat]);
    ei.skicka(db, { tvinga: true, patientId: pat });
    const ny = fangat.flatMap(f => kropp(f.begaran).barn).map(t => Object.fromEntries(t.barn.find(x => x.lokal === 'engagement').barn.map(x => [x.lokal, x.text])));
    const vko = ny.find(e => e.categorization === 'vko');
    expect(vko).toBeTruthy();
    // Alla vårdkontakter försvinner: posten tas bort med samma identitet och utan mostRecentContent.
    db.query('DELETE FROM vardkontakter WHERE patient_id = ?').run(pat);
    fangat.length = 0;
    ei.markeraPatienter(db, [pat]);
    ei.skicka(db, { tvinga: true, patientId: pat });
    const bort = fangat.flatMap(f => kropp(f.begaran).barn).filter(t => t.barn.find(x => x.lokal === 'deleteFlag')?.text === 'true')
      .map(t => Object.fromEntries(t.barn.find(x => x.lokal === 'engagement').barn.map(x => [x.lokal, x.text])));
    expect(bort.map(e => e.categorization)).toContain('vko');
    const b = bort.find(e => e.categorization === 'vko');
    expect({ ...b }).toEqual(Object.fromEntries(Object.entries(vko).filter(([k]) => k !== 'mostRecentContent')));
    // Det simulerade indexet har tagit bort posten.
    expect(db.query("SELECT count(*) AS n FROM rivta_sim_engagemang WHERE kategori = 'vko' AND personid = ?").get(vko.registeredResidentIdentification).n).toBe(0);
  });

  test('engagemangsindex: det simulerade indexet följer reglerna för producenten av Update', () => {
    provar('Update', ['pR1', 'pR2', 'pR4', 'pR5', 'pR7', 'kR1-2', '3.6-3', '3.6-5', '9.2-3', '4.1-12', '4.1-31', '4.1-51']);
    const db = nyDb();
    register.sakraSimuleratIndex(db);
    const post = (extra = {}) => ({ registeredResidentIdentification: '194502024732', serviceDomain: 'riv:clinicalprocess:healthcond:description', categorization: 'dia', logicalAddress: VG,
      businessObjectInstanceIdentifier: 'NA', clinicalProcessInterestId: 'NA', mostRecentContent: '20261120120000', sourceSystem: VG, dataController: VG, ...extra });
    const skicka = (t) => rivta.anropaSynk(register.EI, { logiskAdress: nationella.NATIONELL, begaran: { engagementTransaction: t }, transport: sim(db) });
    expect(skicka([{ deleteFlag: false, engagement: post() }]).ResultCode).toBe('OK');
    const rad = () => db.query("SELECT * FROM rivta_sim_engagemang WHERE kategori = 'dia'").all();
    expect(rad().length).toBe(1);
    expect(rad()[0].agare).toBe(nationella.NATIONELL);
    // Samma post igen ändrar inget, en ny tid uppdaterar posten och en dubblett i begäran är ett fel.
    const fore = rad()[0].uppdaterad;
    expect(skicka([{ deleteFlag: false, engagement: post() }]).ResultCode).toBe('OK');
    expect(rad()[0].uppdaterad).toBe(fore);
    expect(skicka([{ deleteFlag: false, engagement: post({ mostRecentContent: '20261121120000' }) }]).ResultCode).toBe('OK');
    expect(rad()[0].senast).toBe('20261121120000');
    const dubbel = skicka([{ deleteFlag: false, engagement: post() }, { deleteFlag: false, engagement: post() }]);
    expect(dubbel.ResultCode).toBe('ERROR');
    expect(dubbel.comment).toMatch(/samma identitet/);
    expect(skicka([{ deleteFlag: true, engagement: post({ mostRecentContent: undefined }) }]).ResultCode).toBe('OK');
    expect(rad().length).toBe(0);
  });

  test('engagemangsindex: Ineras testsvit för Update mot det simulerade indexet, och mockens svar tas emot av Vårdkällan', async () => {
    provar('Update', ['3.6-1', '3.6-4']);
    const db = nyDb();
    const d = 'riv.itintegration.engagementindex';
    const ut = {};
    const inera = F.data(d, 'UpdateEI');
    for (const tf of F.projekt(d, 'UpdateEI').testfall) {
      const varden = { ...inera.global, ...(inera.testfall[tf.namn] ?? {}), ntjpAdress: nationella.NATIONELL };
      const r = await F.korTestfall(tf, { varden, def: register.EI, doman: d, mapp: 'UpdateEI', skicka: async ({ text, soapAction }) => {
        const s = nationella.tjanst.hanteraAnropSynk({ db }, { text, soapAction, vag: register.EI.vag, avsandare: { hsaId: VG } });
        return { status: s.status, huvuden: s.headers, text: s.body };
      } });
      ut[tf.namn] = r.steg.flatMap(s => s.kontroller.filter(k => k.ok === false).map(k => `${k.namn ?? k.typ}: ${k.text}`.slice(0, 200)));
    }
    for (const e of exempel(d, 'UpdateMock').filter(x => x.namn.startsWith('mock '))) {
      try { rivta.anropaSynk(register.EI, { logiskAdress: nationella.NATIONELL, begaran: { engagementTransaction: [{ deleteFlag: false, engagement: { registeredResidentIdentification: '194502024732', serviceDomain: 'riv:clinicalprocess:healthcond:description', categorization: 'dia', logicalAddress: VG, businessObjectInstanceIdentifier: 'NA', clinicalProcessInterestId: 'NA', mostRecentContent: '20261120120000', sourceSystem: VG, dataController: VG } }] }, transport: () => ({ status: 200, text: e.text }) }); ut[e.namn] = 'tas emot'; } catch (x) { ut[e.namn] = `${x.kod}: ${x.message.slice(0, 120)}`; }
    }
    expect(ut['mock Update: OK']).toBe('tas emot');
    jamforExempelfel(d, 'Update', ut);
  });

  test('HSA-katalogen: Ineras mocksvar tas emot, och den simulerade katalogens svar följer schemat', () => {
    provar('GetEmployeeIncludingProtectedPerson', []);
    const d = 'riv.infrastructure.directory.employee';
    const ut = {};
    for (const e of exempel(d, 'GetEmployeeIncludingProtectedPersonMock').filter(x => x.namn.startsWith('mock '))) {
      try { rivta.anropaSynk(register.HSA, { logiskAdress: nationella.NATIONELL, begaran: { personHsaId: 'SE2321000164-VKP001' }, transport: () => ({ status: 200, text: e.text }) }); ut[e.namn] = 'tas emot'; } catch (x) { ut[e.namn] = `${x.kod}: ${x.message.slice(0, 160)}`; }
    }
    jamforExempelfel(d, 'GetEmployeeIncludingProtectedPerson', ut);
  });

  test('PU-tjänsten: Ineras exempel följer schemat, och för en patient med sekretessmarkering jämförs bara det som tjänsten lämnar', async () => {
    provar('LookupResidentForFullProfile', ['2.3-7']);
    const kat = join(RIVTA, 'riv.population.residentmaster', 'schemas', 'interactions', 'LookupResidentForFullProfileInteraction');
    for (const f of ['LookupResidentForFullProfileResponder_1.2.xml', 'LookupResidentForFullProfileResponder_Response_1.2.xml']) expect([f, register.PU.schema.validera(tolka(readFileSync(join(kat, f), 'utf8')))]).toEqual([f, []]);
    const db = nyDb();
    const { Atkomst } = await import('../src/atkomst.js');
    const pid = db.query("SELECT id, personnummer FROM patienter WHERE id_typ = 'personnummer' AND skyddad = 0 LIMIT 1").get();
    // PU-tjänsten svarar som TKB säger för en person med sekretessmarkering: bara personnumret och markeringen.
    const svar = register.PU.schema.bygg(register.PU.svar.ns, register.PU.svar.lokal, { resident: [{ Sekretessmarkering: 'J', Personpost: { PersonId: pid.personnummer, Relationer: {} } }] });
    nationella.satt(() => ({ status: 200, text: kuvert(skriv(svar)) }));
    const atk = new Atkomst(db, db.query("SELECT * FROM personal WHERE id = 'adm-kard'").get(), pid.id, {}, 'las_admin');
    const r = register.puPatient(atk);
    expect(r.sekretessmarkering).toBe(true);
    expect(r.skillnader).toEqual([]);
  });

  test('HOSP: omsändningen sker bara vid tekniska fel, med ökande intervall och ett begränsat antal försök', () => {
    provar('GetHospPersonForPublicHealthCare', ['4.3.2-1', '4.3.2-2', '4.3.1.1-1', '4.3.2.1-1']);
    const db = nyDb();
    const p = db.query("SELECT * FROM personal WHERE id = 'lak-kard'").get();
    let anrop = 0;
    nationella.satt(() => { anrop++; throw new Error('nere'); });
    const t0 = Date.parse('2026-11-20T08:00:00Z');
    const vid = (min) => new Date(t0 + min * 60_000);
    // Första försöket, och sedan inget nytt förrän intervallet har gått: 5, 10, 20 och 40 minuter.
    const tider = [0, 4, 5, 14, 15, 34, 35, 74, 75, 154, 155, 500, 1000];
    for (const m of tider) hosp.aktuell(db, p, vid(m));
    expect(anrop).toBe(5);
    expect(hosp.vantetidHosp(5)).toBe(hosp.DYGN_MS);
    // Ett svar som inte kunde användas ger inga nya försök samma dygn.
    const db2 = nyDb();
    let anrop2 = 0;
    nationella.satt(() => { anrop2++; return { status: 200, text: kuvert('<x xmlns="urn:fel"/>') }; });
    for (const m of [0, 10, 60, 600]) hosp.aktuell(db2, p, vid(m));
    expect(anrop2).toBe(1);
  });

  test('HOSP: en person med skyddad identitet stängs inte ute, eftersom registret inte kan visa legitimationen', () => {
    provar('GetHospPersonForPublicHealthCare', ['6.1.3-3', '6.1.3-4']);
    const db = nyDb();
    const p = db.query("SELECT * FROM personal WHERE id = 'lak-kard'").get();
    const pnr = hosp.exempelPost().personId;
    void pnr;
    const { PERSONNUMMER } = require('../src/seed/hosp.js');
    const post = { hospId: { extension: 1, root: '1.2.752.116.3.1.1' }, personId: { extension: PERSONNUMMER[p.id], root: '1.2.752.129.2.1.3.1' }, efternamn: 'Skyddad', samtligaFornamn: ['Skyddad'], fodelsedatum: PERSONNUMMER[p.id].slice(0, 8), skyddadIdentitet: true, skyddadIdentitetUpplysning: 'Kontakta Socialstyrelsen.' };
    nationella.satt(() => ({ status: 200, text: kuvert(skriv(hosp.HOSP.schema.bygg(hosp.HOSP.svar.ns, hosp.HOSP.svar.lokal, { hospPerson: [post] }))) }));
    const b = hosp.hamta(db, p);
    expect(b.status).toBe('skyddad');
    expect(() => hosp.vidInloggning(db, p)).not.toThrow();
    expect(hosp.forskrivning(db, p).kan).toBe(false);
  });

  test('HOSP: den simulerade tjänstens datum har formen ÅÅÅÅMMDD', () => {
    provar('GetHospPersonForPublicHealthCare', ['6.1.2-3', '5.2.1-1', '5.2.1-2', '3.1-1']);
    const db = nyDb();
    const fangat = fanga(db);
    hosp.hamta(db, db.query("SELECT * FROM personal WHERE id = 'lak-kard'").get());
    const s = kropp(fangat[0].svar);
    const datum = [];
    const ga = (e) => { if (/Datum$|datum$/.test(e.lokal)) datum.push(e.text); e.barn.forEach(ga); };
    ga(s);
    expect(datum.length).toBeGreaterThan(0);
    expect(datum.filter(x => !/^\d{4}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(x))).toEqual([]);
    expect(s.barn.filter(x => x.lokal === 'hospPerson').length).toBeLessThanOrEqual(1);
  });

  test('GetMedicationHistory: den simulerade tjänstens svar och Vårdkällans begäran följer Ineras Schematron, och mocksvaren tas emot', async () => {
    provar('GetMedicationHistory', ['1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '1.7', '1.8-1', '1.8-2', '1.8-3', '1.8-4', '1.8-5', '1.8-6', '1.9', '1.10', '1.11-1', '1.11-2', '2.1', '2.2', '2.3', '7.2.3-ejAngesHuvud-1', '7.2.3-prescriber-1', '7.2.3-startOfTreatment-1', '7.2.3-dosage-1', '7.2.3-lowHigh-1', '7.2.3-drugChoice-1', '7.2.3-nplId-3', '7.2.3-amount-1', '7.2.3-amount-2', '7.2.3-administrationTime-2', '7.2.3-referred-3']);
    const D = 'riv.clinicalprocess.activityprescription.actoutcome';
    const db = nyDb();
    const fel = [];
    const fangat = fanga(db);
    for (const pid of ['194502024732', '197701182383']) nationella.anropa(db, 'GetMedicationHistory', { patientId: { id: pid, type: '1.2.752.129.2.1.3.1' } });
    expect(fangat.length).toBe(2);
    for (const f of fangat) {
      for (const x of prova(f.svar, { doman: D, kontrakt: 'GetMedicationHistory', mapp: 'GetMedicationHistory' })) fel.push(`svar ${x.kalla} ${x.id} ${x.nod} ${x.test}`);
      for (const x of prova(f.begaran, { doman: D, kontrakt: 'GetMedicationHistory', mapp: 'GetMedicationHistoryMock' })) fel.push(`begäran ${x.kalla} ${x.id} ${x.nod}`);
    }
    expect(fel).toEqual([]);
    const ut = {};
    for (const e of exempel(D, 'GetMedicationHistoryMock').filter(x => x.namn.startsWith('mock '))) {
      try { await rivta.anropa(nationella.K.GetMedicationHistory, { logiskAdress: nationella.NATIONELL, begaran: { patientId: { id: '194502024732', type: '1.2.752.129.2.1.3.1' } }, transport: async () => ({ status: 200, text: e.text }) }); ut[e.namn] = 'tas emot'; } catch (x) { ut[e.namn] = `${x.kod}: ${x.message.slice(0, 160)}`; }
      const k = F.kuvertAv(e.text);
      if (!k.fel && !k.fault) ut[`${e.namn}: Ineras Schematron`] = F.constraints(D, 'GetMedicationHistory').prova(tolka(e.text)).map(x => `${x.nod} ${x.test}`.slice(0, 160));
    }
    jamforExempelfel(D, 'GetMedicationHistory', ut);
  });
});
