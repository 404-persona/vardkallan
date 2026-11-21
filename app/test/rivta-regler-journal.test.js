import { describe, test, expect, beforeAll, afterAll, afterEach } from 'bun:test';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { nyDb, testserver, klient, sandlada } from './hjalp.js';
import * as rivta from '../src/rivta/index.js';
import * as nationella from '../src/rivta/nationella.js';
import { iProcessenSynk } from '../src/rivta/klient.js';
import { datumRiv } from '../src/tjanstekontrakt.js';
import { anteckningsKod } from '../src/rivta/journal.js';
import { tolka } from '../src/rivta/xml.js';
import * as F from './rivta-facit.js';
import { provar, prova, exempel, kropp, jamforExempelfel, exempelfel } from './rivta-regelhjalp.js';

// Testspår 2: affärsreglerna i TKB för journalens kontrakt (riv.clinicalprocess.healthcond.description,
// riv.clinicalprocess.logistics.logistics och riv.ehr.accesscontrol) som tester. Fältreglerna står som Schematron i
// app/rivta-regler/<domän>/<Kontrakt>.sch och prövas på varje svar från Vårdkällans producenter för alla demons patienter,
// på Vårdkällans egna begäran som konsument och på den simulerade aggregerande tjänstens svar. Ineras exempel (testsvitens
// begäran och mockens svar) prövas mot samma regler och mot schemat, och felen i dem redovisas i
// <Kontrakt>.exempelfel.json (de rättas inte). Reglerna om beteende prövas var för sig nedan.

const VG = 'SE2321000164-VK0000';
const D = 'riv.clinicalprocess.healthcond.description';
const L = 'riv.clinicalprocess.logistics.logistics';
const J = rivta.journal;
const PNR = '1.2.752.129.2.1.3.1';
const SAM = '1.2.752.129.2.1.3.3';
const KONTRAKT = [[D, 'GetDiagnosis', J.GET_DIAGNOSIS], [D, 'GetCareDocumentation', J.GET_CARE_DOCUMENTATION], [D, 'GetAlertInformation', J.GET_ALERT_INFORMATION], [L, 'GetCareContacts', J.GET_CARE_CONTACTS]];
const T = 'Affärsreglerna i TKB, journalens kontrakt';

// Ett anrop till Vårdkällans producent i samma process. Ger kuvertets text och svarets objekt.
async function fraga(db, def, begaran, { hsaId = rivta.konsumenter.NPO, logiskAdress = VG } = {}) {
  let text = null;
  const transport = async (a) => { const r = await rivta.vardkallan.hanteraAnrop({ db }, { ...a, avsandare: { hsaId, via: 'direkt' } }); text = r.body; return { status: r.status, text: r.body }; };
  const svar = await rivta.anropa(def, { logiskAdress, begaran, transport, db });
  return { text, svar };
}
const patienter = (db) => db.query("SELECT personnummer, id_typ FROM patienter WHERE id_typ IN ('personnummer', 'samordningsnummer') AND skyddad = 0 ORDER BY id").all()
  .map(p => ({ id: p.personnummer, type: p.id_typ === 'personnummer' ? PNR : SAM }));
const listan = (def, svar) => svar[{ GetDiagnosis: 'diagnosis', GetCareDocumentation: 'careDocumentation', GetAlertInformation: 'alertInformation', GetCareContacts: 'careContact' }[def.namn]] ?? [];
const huvudet = (def, post) => post[{ GetDiagnosis: 'diagnosisHeader', GetCareDocumentation: 'careDocumentationHeader', GetAlertInformation: 'alertInformationHeader', GetCareContacts: 'careContactHeader' }[def.namn]];

describe(T, () => {
  for (const [doman, kontrakt, def] of KONTRAKT) {
    test(`${kontrakt}: Vårdkällans svar följer fältreglerna i TKB för alla demons patienter`, async () => {
      // Prövar reglerna i <Kontrakt>.sch (regelförteckningen pekar på det här testet för dem).
      const db = nyDb();
      const fel = [];
      for (const p of patienter(db)) {
        for (const extra of [{}, { timePeriod: { start: '20140101', end: '20261231' } }]) {
          const { text } = await fraga(db, def, { patientId: p, ...extra });
          for (const f of prova(text, { doman, kontrakt, mapp: kontrakt })) fel.push(`${p.id} ${f.kalla} ${f.id ?? ''} ${f.nod} ${f.test}`);
        }
      }
      expect(fel).toEqual([]);
    });

    test(`${kontrakt}: Ineras exempel prövade mot schemat och reglerna i TKB, med felen redovisade`, () => {
      jamforExempelfel(doman, kontrakt, exempelfel(doman, kontrakt, kontrakt, def, { mock: `${kontrakt}Mock` }));
    });
  }

  test('källsystemet ska vara den logiska adressen, och vårdkontakter kräver källsystem (INVALID_REQUEST, och SOAP Fault för GetCareContacts)', async () => {
    provar('GetDiagnosis', ['7.2.3-14', '7.2.3-15', '4.4.1.1-1', '4.4.1.1-2']);
    provar('GetCareDocumentation', ['7.1.4-14', '7.1.4-15', '4.4.1.1-1', '4.4.1.1-2']);
    provar('GetAlertInformation', ['7.3.3-14', '7.3.3-15', '4.4.1.1-1', '4.4.1.1-2']);
    provar('GetCareContacts', ['6.1.2-9', '6.1.2-10']);
    const db = nyDb();
    const p = { id: '194502024732', type: PNR };
    for (const def of [J.GET_DIAGNOSIS, J.GET_CARE_DOCUMENTATION, J.GET_ALERT_INFORMATION]) {
      for (const begaran of [{ patientId: p, sourceSystemHSAId: 'SE2321000164-VK0120' }, { patientId: p, careContactId: ['4'] }]) {
        const b = def.namn === 'GetCareDocumentation' && begaran.sourceSystemHSAId ? { patientId: p, sourceSystemHSAid: begaran.sourceSystemHSAId } : begaran;
        const forsta = (await fraga(db, def, b)).svar;
        const andra = (await fraga(db, def, b)).svar;
        expect([def.namn, Object.keys(forsta), forsta.result.resultCode, forsta.result.errorCode]).toEqual([def.namn, ['result'], 'ERROR', 'INVALID_REQUEST']);
        // En omsändning ger samma fel.
        expect([andra.result.resultCode, andra.result.errorCode]).toEqual(['ERROR', 'INVALID_REQUEST']);
        expect(forsta.result.message).toMatch(/Källsystemet/);
      }
      // Med källsystemet lika med den logiska adressen är svaret som utan.
      const med = (await fraga(db, def, def.namn === 'GetCareDocumentation' ? { patientId: p, sourceSystemHSAid: VG } : { patientId: p, sourceSystemHSAId: VG })).svar;
      const utan = (await fraga(db, def, { patientId: p })).svar;
      expect(listan(def, med).length).toBe(listan(def, utan).length);
    }
    await expect(fraga(db, J.GET_CARE_CONTACTS, { patientId: p, careContactId: ['4'] })).rejects.toThrow('Källsystemet ska anges');
    await expect(fraga(db, J.GET_CARE_CONTACTS, { patientId: p, sourceSystemHSAId: 'SE2321000164-VK0120' })).rejects.toThrow('inte samma som den logiska adressen');
  });

  test('svaret innehåller bara uppgifter från källsystemet för den logiska adressen, och en okänd adress är fel', async () => {
    provar('GetDiagnosis', ['R3', '7.2.3-10']);
    provar('GetCareDocumentation', ['R3', '7.1.4-10']);
    provar('GetAlertInformation', ['R3', '7.3.3-10']);
    provar('GetCareContacts', ['6.1.2-8']);
    const db = nyDb();
    for (const [, , def] of KONTRAKT) {
      const { svar } = await fraga(db, def, { patientId: { id: '194502024732', type: PNR } });
      const falt = def.namn === 'GetCareDocumentation' ? 'sourceSystemHSAid' : 'sourceSystemHSAId';
      expect([def.namn, [...new Set(listan(def, svar).map(x => huvudet(def, x)[falt]))]]).toEqual([def.namn, [VG]]);
      await expect(fraga(db, def, { patientId: { id: '194502024732', type: PNR } }, { logiskAdress: 'SE0000000000-ANNAN' })).rejects.toThrow('inte en adress som Vårdkällan svarar för');
    }
  });

  test('perioden följer tidpunkterna som TKB anger för varje kontrakt, som datum i svensk tid', async () => {
    provar('GetDiagnosis', ['7.2.3-8', '7.2.3-9']);
    provar('GetCareDocumentation', ['7.1.4-8', '7.1.4-9']);
    provar('GetAlertInformation', ['7.3.3-8', '7.3.3-9']);
    provar('GetCareContacts', ['6.1.2-6', '6.1.2-7']);
    const db = nyDb();
    const p = { id: '194502024732', type: PNR };
    const dag = (t) => t?.slice(0, 8) ?? null;
    for (const [, , def] of KONTRAKT) {
      const alla = listan(def, (await fraga(db, def, { patientId: p })).svar);
      const tider = (x) => {
        const h = huvudet(def, x);
        if (def.namn === 'GetDiagnosis') return { punkter: [h.accountableHealthcareProfessional.authorTime, h.legalAuthenticator?.signatureTime, x.diagnosisBody.diagnosisTime] };
        if (def.namn === 'GetCareDocumentation') return { punkter: [h.documentTime, h.accountableHealthcareProfessional.authorTime, h.legalAuthenticator?.signatureTime] };
        if (def.namn === 'GetAlertInformation') return { start: x.alertInformationBody.validityTimePeriod.start, slut: x.alertInformationBody.obsoleteTime ?? x.alertInformationBody.validityTimePeriod.end ?? null };
        return { start: x.careContactBody.careContactTimePeriod.start, slut: x.careContactBody.careContactTimePeriod.end ?? x.careContactBody.careContactTimePeriod.start };
      };
      const datumen = [...new Set(alla.flatMap(x => { const t = tider(x); return (t.punkter ?? [t.start, t.slut]).filter(Boolean).map(dag); }))].sort();
      expect([def.namn, datumen.length > 0]).toEqual([def.namn, true]);
      // Varje period som börjar eller slutar på ett av datumen ger precis de poster som TKB:s regel säger.
      for (const d of datumen) {
        for (const period of [{ start: d, end: d }, { start: '19000101', end: d }, { start: d, end: '20991231' }]) {
          const fick = listan(def, (await fraga(db, def, { patientId: p, timePeriod: period })).svar).map(x => huvudet(def, x).documentId).sort();
          const vantat = alla.filter(x => {
            const t = tider(x);
            if (t.punkter) return t.punkter.filter(Boolean).map(dag).some(v => v >= period.start && v <= period.end);
            return dag(t.start) <= period.end && (!t.slut || dag(t.slut) >= period.start);
          }).map(x => huvudet(def, x).documentId).sort();
          expect([def.namn, period, fick]).toEqual([def.namn, period, vantat]);
        }
      }
    }
    // Ett datum utan tid är det datumet i Sverige, inte UTC-midnatt omräknad (01.00 eller 02.00).
    expect(datumRiv('2014-03-18')).toBe('20140318000000');
    expect(datumRiv('2026-07-01T10:00:00Z')).toBe('20260701120000');
    expect(datumRiv('2026-01-15T10:00:00Z')).toBe('20260115110000');
  });

  test('tidpunkterna är svensk tid, också runt sommartiden', () => {
    provar('GetDiagnosis', ['4.3.2.4-2', '4.3.2.4-3']);
    provar('GetCareDocumentation', ['4.3.2.4-2', '4.3.2.4-3']);
    provar('GetAlertInformation', ['4.3.2.4-2', '4.3.2.4-3']);
    provar('GetCareContacts', ['4.3.2.3-2', '4.3.2.3-3']);
    // Sista söndagen i mars 2026 (29 mars) går klockan från 02.00 till 03.00, och sista söndagen i oktober (25 oktober)
    // från 03.00 till 02.00.
    expect(datumRiv('2026-03-29T00:59:59Z')).toBe('20260329015959');
    expect(datumRiv('2026-03-29T01:00:00Z')).toBe('20260329030000');
    expect(datumRiv('2026-10-25T00:59:59Z')).toBe('20261025025959');
    expect(datumRiv('2026-10-25T01:00:00Z')).toBe('20261025020000');
  });

  test('filtren på vårdenhet och vårdkontakt ger bara poster för dem', async () => {
    provar('GetDiagnosis', ['7.2.3-1', '7.2.3-16']);
    provar('GetCareDocumentation', ['7.1.4-1', '7.1.4-16']);
    provar('GetAlertInformation', ['7.3.3-1', '7.3.3-16']);
    provar('GetCareContacts', ['6.1.2-1', '6.1.2-11']);
    const db = nyDb();
    const p = { id: '194502024732', type: PNR };
    for (const [, , def] of KONTRAKT) {
      const alla = listan(def, (await fraga(db, def, { patientId: p })).svar);
      const enhet = (x) => (def.namn === 'GetCareContacts' ? x.careContactHeader.accountableHealthcareProfessional.healthcareProfessionalCareUnitHSAId : huvudet(def, x).accountableHealthcareProfessional.healthcareProfessionalCareUnitHSAId);
      for (const e of [...new Set(alla.map(enhet))]) {
        const falt = def.namn === 'GetCareDocumentation' ? 'careUnitHSAid' : 'careUnitHSAId';
        const fick = listan(def, (await fraga(db, def, { patientId: p, [falt]: [e] })).svar);
        expect([def.namn, e, fick.length]).toEqual([def.namn, e, alla.filter(x => enhet(x) === e).length]);
      }
      const kontakt = (x) => (def.namn === 'GetCareContacts' ? x.careContactHeader.documentId : huvudet(def, x).careContactId);
      for (const k of [...new Set(alla.map(kontakt).filter(Boolean))]) {
        const kalla = def.namn === 'GetCareDocumentation' ? { sourceSystemHSAid: VG } : { sourceSystemHSAId: VG };
        const fick = listan(def, (await fraga(db, def, { patientId: p, careContactId: [k], ...kalla })).svar);
        expect([def.namn, k, fick.map(kontakt)]).toEqual([def.namn, k, alla.filter(x => kontakt(x) === k).map(kontakt)]);
      }
    }
  });

  test('samma post har samma documentId i varje anrop, och vårdkontakten har samma id i alla journalens kontrakt', async () => {
    provar('GetDiagnosis', ['7.2.3-17', '7.2.3-18']);
    provar('GetCareDocumentation', ['7.1.4-18', '7.1.4-19']);
    provar('GetAlertInformation', ['7.3.3-17', '7.3.3-18']);
    provar('GetCareContacts', ['6.1.2-12', '6.1.2-13']);
    const db = nyDb();
    const p = { id: '194502024732', type: PNR };
    for (const [, , def] of KONTRAKT) {
      const a = listan(def, (await fraga(db, def, { patientId: p })).svar).map(x => huvudet(def, x).documentId);
      const b = listan(def, (await fraga(db, def, { patientId: p })).svar).map(x => huvudet(def, x).documentId);
      expect([def.namn, a]).toEqual([def.namn, b]);
      expect(new Set(a).size).toBe(a.length);
    }
    const kontakter = new Set(listan(J.GET_CARE_CONTACTS, (await fraga(db, J.GET_CARE_CONTACTS, { patientId: p })).svar).map(x => x.careContactHeader.documentId));
    for (const def of [J.GET_DIAGNOSIS, J.GET_CARE_DOCUMENTATION]) {
      const refs = listan(def, (await fraga(db, def, { patientId: p })).svar).map(x => huvudet(def, x).careContactId).filter(Boolean);
      expect(refs.length).toBeGreaterThan(0);
      expect([def.namn, refs.filter(r => !kontakter.has(r))]).toEqual([def.namn, []]);
    }
  });

  test('en patient som inte finns och en som konsumenten inte får se ger samma tomma svar, och patientens id i svaret är det som frågades', async () => {
    provar('GetDiagnosis', ['7.2.3-19', '4.2.3-1']);
    provar('GetCareDocumentation', ['7.1.4-20', '4.2.3-1']);
    provar('GetAlertInformation', ['7.3.3-19', '4.2.3-1']);
    provar('GetCareContacts', ['6.1.2-14', '4.2.3-1']);
    const db = nyDb();
    for (const [, , def] of KONTRAKT) {
      const okand = (await fraga(db, def, { patientId: { id: '191212121212', type: PNR } })).svar;
      expect([def.namn, listan(def, okand).length]).toEqual([def.namn, 0]);
      for (const x of listan(def, (await fraga(db, def, { patientId: { id: '199302862397', type: SAM } })).svar)) expect(huvudet(def, x).patientId).toEqual({ id: '199302862397', type: SAM });
      await expect(fraga(db, def, { patientId: { id: '194502024732', type: PNR } }, { hsaId: 'SE0000000000-OKAND' })).rejects.toThrow('ingen anropsbehörighet');
    }
  });

  test('en konsument med en del av vårdenheterna får svaret som om de andra vårdenheterna inte fanns', async () => {
    provar('GetDiagnosis', ['4.2.3-2', '4.2.3-3']);
    provar('GetCareDocumentation', ['4.2.3-2', '4.2.3-3']);
    provar('GetAlertInformation', ['4.2.3-2', '4.2.3-3']);
    provar('GetCareContacts', ['4.2.3-2', '4.2.3-3']);
    const db = nyDb();
    const { registreraForTjanstekontrakt } = await import('../src/systemkonton.js');
    rivta.konsumenter.sakraDemo(db);
    const id = registreraForTjanstekontrakt(db, { namn: 'Konsument med kardiologin', syfte: 'Test.', vardenheter: ['uso-kard'], mangder: ['anteckningar', 'diagnoser', 'uppmarksamhet', 'overkanslighet', 'vardkontakter'], hsaId: 'SE0000000000-KARD' });
    db.query("INSERT INTO rivta_konsumenter (hsa_id, namn, systemkonto_id, kontrakt, simulerad, registrerad) VALUES ('SE0000000000-KARD', 'Kardiologin', ?, ?, 1, '2026-11-20')").run(id, JSON.stringify(KONTRAKT.map(k => k[1])));
    const p = { id: '194502024732', type: PNR };
    for (const [, , def] of [KONTRAKT[0], KONTRAKT[1], KONTRAKT[3]]) {
      const alla = listan(def, (await fraga(db, def, { patientId: p })).svar);
      const kard = listan(def, (await fraga(db, def, { patientId: p }, { hsaId: 'SE0000000000-KARD' })).svar);
      const enhet = (x) => huvudet(def, x).accountableHealthcareProfessional.healthcareProfessionalCareUnitHSAId;
      expect([def.namn, kard.map(x => huvudet(def, x).documentId).sort()]).toEqual([def.namn, alla.filter(x => enhet(x) === 'SE2321000164-VK0120').map(x => huvudet(def, x).documentId).sort()]);
      // Samma svar som en fråga med den vårdenheten som filter.
      const falt = def.namn === 'GetCareDocumentation' ? 'careUnitHSAid' : 'careUnitHSAId';
      expect(kard.length).toBe(listan(def, (await fraga(db, def, { patientId: p, [falt]: ['SE2321000164-VK0120'] })).svar).length);
    }
  });

  test('svaret är fullständigt utan period, inom 30 sekunder, och tio frågor samtidigt får alla ett giltigt svar', async () => {
    provar('GetDiagnosis', ['4.3.1-1', '4.3.1-6', '4.3.1-7']);
    provar('GetCareDocumentation', ['4.3.1-1', '4.3.1-6', '4.3.1-7']);
    provar('GetAlertInformation', ['4.3.1-1', '4.3.1-6', '4.3.1-7']);
    provar('GetCareContacts', ['4.3.1-1', '4.3.1-6', '4.3.1-7']);
    const db = nyDb();
    const p = { id: '194502024732', type: PNR };
    for (const [, , def] of KONTRAKT) {
      const t0 = performance.now();
      const svar = await Promise.all(Array.from({ length: 10 }, () => fraga(db, def, { patientId: p })));
      expect(performance.now() - t0).toBeLessThan(27_000);
      const n = listan(def, svar[0].svar).length;
      expect(svar.every(s => listan(def, s.svar).length === n)).toBe(true);
      // Fullständigt: med en period som täcker allt blir det lika många poster.
      expect(listan(def, (await fraga(db, def, { patientId: p, timePeriod: { start: '19000101', end: '20991231' } })).svar).length).toBe(n);
    }
  });

  test('typen av anteckning finns alltid och kommer ur KV Anteckningstyp', () => {
    provar('GetCareDocumentation', ['7.1.4-34']);
    const tillatna = ['utr', 'atb', 'sam', 'sao', 'ins', 'slu', 'auf', 'sva', 'bes'];
    const fall = { Inskrivningsanteckning: 'ins', Epikris: 'slu', Telefonkontakt: 'auf', Daganteckning: 'sva', Mottagningsanteckning: 'bes', Akutanteckning: 'bes', Utredning: 'utr', Operationsberättelse: 'atb', Vårdplan: 'sao' };
    for (const [titel, kod] of Object.entries(fall)) expect([titel, anteckningsKod(titel)]).toEqual([titel, kod]);
    expect(anteckningsKod('Psykologanteckning', { vardtillfalle: true })).toBe('sva');
    expect(tillatna).toContain(anteckningsKod(null));
  });

  test('vårdkontakternas typ utelämnas när den är okänd, och tiderna följer TKB för besök, planerade kontakter och pågående vårdtillfällen', async () => {
    provar('GetCareContacts', ['6.1.2-28', '6.1.2-29', '6.1.2-30', '6.1.2-31', '6.1.2-16', '6.1.2-17', 'Regel 1', 'Regel 2', 'Regel 4']);
    const db = nyDb();
    for (const p of patienter(db)) {
      for (const x of listan(J.GET_CARE_CONTACTS, (await fraga(db, J.GET_CARE_CONTACTS, { patientId: p })).svar)) {
        const b = x.careContactBody;
        const h = x.careContactHeader.accountableHealthcareProfessional;
        expect([b.careContactCode == null || ['1', '2', '3', '4', '5'].includes(String(b.careContactCode))]).toEqual([true]);
        if (String(b.careContactStatus) === '1') expect(b.careContactTimePeriod.end).toBeUndefined();
        else if (String(b.careContactCode) === '1') expect(b.careContactTimePeriod.end).toBe(b.careContactTimePeriod.start);
        if (String(b.careContactCode) === '3' && String(b.careContactStatus) === '3') expect(b.careContactTimePeriod.end).toBeUndefined();
        expect(h.authorTime).toMatch(/^\d{14}$/);
        expect(h.healthcareProfessionalCareUnitHSAId).toBe(h.healthcareProfessionalOrgUnit.orgUnitHSAId);
        expect(h.healthcareProfessionalCareGiverHSAId).toBe(VG);
      }
    }
  });

  test('AssertCareEngagement adresseras till vårdgivarens och vårdenhetens HSA-id som en sammansatt adress, och svarar inom en sekund', async () => {
    provar('AssertCareEngagement', ['3.2-1', '3.2-2', '3.2-3', '4.4.1-1', '4.4.1-3', '6.1-2', '6.1.2-3', '6.1.2-4', '6.1.2-5', '5.2.1-1']);
    const db = nyDb();
    const fraga2 = (begaran, logiskAdress) => fraga(db, J.ASSERT_CARE_ENGAGEMENT, begaran, { hsaId: rivta.konsumenter.SJF, logiskAdress });
    const b = { performer: 'SE2321000164-VKP001', subjectOfCareId: '194502024732', careUnitHsaIdentity: 'SE2321000164-VK0120', careGiverHsaIdentity: VG };
    expect((await fraga2(b, `${VG}#SE2321000164-VK0120`)).svar.HasCareEngagement).toBe(true);
    // Fel vårdenhet för medarbetaren ger false, och en adress som inte stämmer med begäran är ett fel.
    expect((await fraga2({ ...b, careUnitHsaIdentity: 'SE2321000164-VK0150' }, `${VG}#SE2321000164-VK0150`)).svar.HasCareEngagement).toBe(false);
    await expect(fraga2(b, `${VG}#SE2321000164-VK0150`)).rejects.toThrow('stämmer inte med vårdgivaren och vårdenheten i begäran');
    await expect(fraga2(b, 'SE0000000000-ANNAN#SE2321000164-VK0120')).rejects.toThrow('inte en adress som Vårdkällan svarar för');
    // Vårdgivarens HSA-id ensamt, som i Ineras testsvit, tas också emot.
    expect((await fraga2(b, VG)).svar.HasCareEngagement).toBe(true);
    // Svarstiden: högst en sekund för 95 procent av anropen, med minst ett anrop per sekund.
    const tider = [];
    for (let i = 0; i < 60; i++) { const t0 = performance.now(); await fraga2(b, `${VG}#SE2321000164-VK0120`); tider.push(performance.now() - t0); }
    tider.sort((x, y) => x - y);
    expect(tider[Math.floor(tider.length * 0.95)]).toBeLessThan(1000);
  });

  test('AssertCareEngagement grundas på journalen som den är i stunden, och en ny bokning ger vårdrelation direkt', async () => {
    provar('AssertCareEngagement', ['4.4.1-4', '6.1-1', '4.3.1.2-2']);
    const db = nyDb();
    const b = { performer: 'SE2321000164-VKP005', subjectOfCareId: '197701182383', careUnitHsaIdentity: 'SE2321000164-VK0410', careGiverHsaIdentity: VG };
    const svar = async () => (await fraga(db, J.ASSERT_CARE_ENGAGEMENT, b, { hsaId: rivta.konsumenter.SJF, logiskAdress: `${VG}#SE2321000164-VK0410` })).svar.HasCareEngagement;
    expect(await svar()).toBe(false);
    // En kallelse till ett besök på vårdcentralen om en vecka är en bokning.
    const om = new Date(Date.now() + 7 * 86400_000).toISOString();
    const pid = db.query("SELECT id FROM patienter WHERE personnummer = '197701182383'").get().id;
    db.query("INSERT INTO vardkontakter (patient_id, enhet_id, typ, start, planerad) VALUES (?, 'vc-tybble', 'besok', ?, 1)").run(pid, om);
    expect(await svar()).toBe(true);
  });

  test('ett internt fel ger SOAP Fault med ett slumpat log-id som en UUID, utan personuppgifter', async () => {
    provar('GetDiagnosis', ['4.4.1.2-1', '4.4.1.2-2', '4.4.1.2-3', '4.4.1.2-4', '4.4.1.2-5']);
    provar('GetCareDocumentation', ['4.4.1.2-1', '4.4.1.2-2', '4.4.1.2-3', '4.4.1.2-4', '4.4.1.2-5']);
    provar('GetAlertInformation', ['4.4.1.2-1', '4.4.1.2-2', '4.4.1.2-3', '4.4.1.2-4', '4.4.1.2-5']);
    provar('GetCareContacts', ['4.4.1.2-1', '4.4.1.2-2', '4.4.1.2-3']);
    const db = nyDb();
    const trasig = new Proxy(db, { get: (t, k) => (k === 'query' ? (sql) => { if (/patienter/i.test(sql)) throw new Error('nere 194502024732'); return t.query(sql); } : (typeof t[k] === 'function' ? t[k].bind(t) : t[k])) });
    const logg = console.error;
    const loggat = [];
    console.error = (...a) => loggat.push(a.map(String).join(' '));
    try {
      for (const [, , def] of KONTRAKT) {
        const ids = [];
        for (let i = 0; i < 2; i++) {
          const r = await rivta.vardkallan.hanteraAnrop({ db: trasig }, { text: rivta.soap.kuvert(rivta.xml.skriv(def.schema.bygg(def.begaran.ns, def.begaran.lokal, { patientId: { id: '194502024732', type: PNR } })), [rivta.soap.logiskAdress(VG)]), soapAction: def.soapAction, vag: def.vag, avsandare: { hsaId: rivta.konsumenter.NPO } });
          expect(r.status).toBe(500);
          expect(r.body).toContain('soap:Server');
          expect(r.body).not.toContain('194502024732');
          ids.push(/Felets id är ([0-9a-f-]+)\./.exec(r.body)[1]);
        }
        expect(ids[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
        expect(ids[0]).not.toBe(ids[1]);
      }
    } finally { console.error = logg; }
    // Felet finns i producentens logg, så att förvaltningen kan hitta det.
    expect(loggat.length).toBeGreaterThan(0);
  });
});

// Vårdkällan som konsument av GetCareDocumentation, GetDiagnosis och GetCareContacts mot den simulerade aggregerande
// tjänsten: Ineras mocksvar tas emot, och Vårdkällans begäran och den simulerade tjänstens svar följer reglerna.
let app;
beforeAll(() => { app = testserver(); });
afterAll(() => app.stopp());
afterEach(() => nationella.satt(null));

describe(`${T}, Vårdkällan som konsument`, () => {
  test('Vårdkällans begäran och den simulerade aggregerande tjänstens svar följer reglerna i TKB och Ineras Schematron', async () => {
    provar('GetDiagnosis', ['7.2.3-11', '7.2.3-13', '7.2.3-7', '4.3-2']);
    provar('GetCareDocumentation', ['7.1.4-11', '7.1.4-13', '7.1.4-7', '4.3-2']);
    provar('GetCareContacts', ['4.3-2']);
    const k = klient(app);
    await k.logga('lak-kard');
    const db = sandlada(app, k).db;
    const fangat = [];
    const sim = iProcessenSynk(nationella.tjanst, { ctx: { db }, avsandare: { hsaId: VG, via: 'direkt' } });
    nationella.satt((a) => { const r = sim(a); fangat.push({ action: a.soapAction, begaran: a.text, svar: r.text }); return r; });
    for (const pid of ['p01', 'p02', 'p03']) await k.post(`/api/patient/${pid}/sammanhallen`, { syfte: 'Bedömning', samtycke: true });
    const fel = [];
    const kontrakt = { GetDiagnosis: [D, 'GetDiagnosis'], GetCareDocumentation: [D, 'GetCareDocumentation'], GetCareContacts: [L, 'GetCareContacts'] };
    const sedda = new Set();
    for (const f of fangat) {
      const namn = Object.keys(kontrakt).find(n => f.action.includes(`:${n}`));
      if (!namn) continue;
      sedda.add(namn);
      const [doman] = kontrakt[namn];
      for (const x of prova(f.begaran, { doman, kontrakt: namn, mapp: `${namn}Mock` })) fel.push(`begäran ${namn} ${x.kalla} ${x.id} ${x.nod}`);
      for (const x of prova(f.svar, { doman, kontrakt: namn, mapp: namn })) fel.push(`svar ${namn} ${x.kalla} ${x.id} ${x.nod}`);
      // Konsumenten skickar aldrig källsystem eller reservnummer till den aggregerande tjänsten, och bara en majorversion.
      const b = kropp(f.begaran);
      expect(b.barn.map(x => x.lokal)).not.toContain('sourceSystemHSAId');
      expect(b.barn.map(x => x.lokal)).not.toContain('sourceSystemHSAid');
      expect(b.ns).toMatch(/:2$/);
    }
    expect([...sedda].sort()).toEqual(['GetCareContacts', 'GetCareDocumentation', 'GetDiagnosis']);
    expect(fel).toEqual([]);
  });

  test('Ineras mocksvar tas emot av Vårdkällans konsument, utom de som strider mot schemat', async () => {
    const ut = {};
    for (const [doman, namn, def] of [[D, 'GetDiagnosis', nationella.K.GetDiagnosis], [D, 'GetCareDocumentation', nationella.K.GetCareDocumentation], [L, 'GetCareContacts', nationella.K.GetCareContacts]]) {
      for (const e of exempel(doman, `${namn}Mock`).filter(x => x.namn.startsWith('mock '))) {
        try {
          await rivta.anropa(def, { logiskAdress: nationella.NATIONELL, begaran: { patientId: { id: '194502024732', type: PNR } }, transport: async () => ({ status: 200, text: e.text }) });
          ut[`${namn}: ${e.namn}`] = 'tas emot';
        } catch (x) { ut[`${namn}: ${e.namn}`] = `${x.kod}: ${x.message.slice(0, 160)}`; }
      }
    }
    // Felen i mocksvaren står i exempelfel-filerna; här ska varje mocksvar som följer schemat tas emot.
    const avvisade = Object.entries(ut).filter(([, v]) => v !== 'tas emot');
    for (const [, v] of avvisade) expect(v).toMatch(/^(schema|fault|svar): /);
    expect(Object.values(ut).filter(v => v === 'tas emot').length).toBeGreaterThan(10);
    jamforExempelfel(D, 'mocksvar-konsument', ut);
  });
});

void tolka;
