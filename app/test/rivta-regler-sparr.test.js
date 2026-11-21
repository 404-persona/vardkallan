import { describe, test, expect, beforeAll, afterAll, afterEach } from 'bun:test';
import { testserver, klient, sandlada } from './hjalp.js';
import * as nationella from '../src/rivta/nationella.js';
import { iProcessenSynk } from '../src/rivta/klient.js';
import { kuvert } from '../src/rivta/soap.js';
import { skriv } from '../src/rivta/xml.js';
import { svenskTid, franSvenskTid, slutPaDagen } from '../src/rivta/tid.js';
import * as sj from '../src/sammanhallen.js';
import { provar, kropp } from './rivta-regelhjalp.js';

// Testspår 2: affärsreglerna i TKB för spärrtjänsten (riv.ehr.blocking 3.2.2) och samtyckestjänsten
// (riv.ehr.patientconsent 1.0.1). Vårdkällan är konsument, och tjänsterna är simulerade (nationella.js). Domänerna har
// ingen testsvit och inga exempel, så reglerna prövas på Vårdkällans begäran och på de simulerade tjänsternas svar i
// flödena för sammanhållen journalföring, och på konsumentens hantering av svar som tjänsterna kan ge.

const VG = 'SE2321000164-VK0000';
const T = 'Affärsreglerna i TKB, spärr- och samtyckestjänsten';
const SPARR = ['CheckBlocks', 'GetAllBlocksForPatient', 'GetBlocksForPatient', 'RegisterTemporaryExtendedRevoke', 'CancelTemporaryExtendedRevoke'];
const SAMTYCKE = ['CheckConsent', 'RegisterExtendedConsent', 'CancelExtendedConsent', 'GetExtendedConsentsForPatient'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TID = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
const PNR = /^(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01]|6[1-9]|[78]\d|9[01])\d{4}$/;
const HSA = /^SE\d{10}-[A-Za-z0-9]+$/;

let app;
beforeAll(() => { app = testserver(); });
afterAll(() => app.stopp());
afterEach(() => nationella.satt(null));
async function inloggad(id) { const k = klient(app); await k.logga(id); return k; }
const hamta = (k, pid, body = {}) => k.post(`/api/patient/${pid}/sammanhallen`, { syfte: 'Bedömning av patientens hjärtsvikt', ...body });

// Fångar varje anrop till de simulerade tjänsterna, som element: { kontrakt, begaran, svar }.
function fanga(db, andra = () => null) {
  const fangat = [];
  const sim = iProcessenSynk(nationella.tjanst, { ctx: { db }, avsandare: { hsaId: VG, via: 'direkt' } });
  nationella.satt((a) => {
    const kontrakt = /:(\w+)Responder:/.exec(a.soapAction)?.[1] ?? a.soapAction;
    const r = andra(kontrakt, a) ?? sim(a);
    fangat.push({ kontrakt, begaran: kropp(a.text), svar: kropp(r.text), text: a.text });
    return r;
  });
  return fangat;
}
const alla = (el, namn) => { const ut = []; const ga = (e) => { if (e.lokal === namn) ut.push(e); e.barn.forEach(ga); }; if (el) ga(el); return ut; };
const varden = (el, namn) => alla(el, namn).map(e => e.text);

describe(T, () => {
  test('tiderna till tjänsterna är svensk tid utan tidszon, och datumen och id:na har TKB:s format', async () => {
    provar('CheckBlocks', ['2.4-1', '2.5-1', '2.6-1', '2.6-2', '2.6-3', '2.1.1-1']);
    provar('GetAllBlocksForPatient', ['2.4-1', '2.5-1', '2.6-1', '2.6-2', '2.6-3', '2.1.1-1']);
    provar('GetBlocksForPatient', ['2.4-1', '2.5-1', '2.6-1', '2.6-2', '2.6-3', '2.1.1-1']);
    provar('RegisterTemporaryExtendedRevoke', ['2.4-1', '2.5-1', '2.6-1', '2.6-2', '2.6-3', '2.1.1-1']);
    provar('RegisterExtendedConsent', ['2.4-1', '2.5-1', '2.6-1', '2.6-2', '2.6-3', '2.1.1-1']);
    provar('CancelExtendedConsent', ['2.4-1', '2.5-1', '2.6-1', '2.6-2', '2.6-3', '2.1.1-1']);
    provar('GetExtendedConsentsForPatient', ['2.4-1', '2.5-1', '2.6-1', '2.6-2', '2.6-3', '2.1.1-1']);
    provar('GetAllBlocksForPatient', ['19.1.7-1', '19.1.8-1', '19.1.13-1']);
    provar('GetBlocksForPatient', ['19.1.7-1', '19.1.8-1', '19.1.13-1']);
    provar('RegisterTemporaryExtendedRevoke', ['19.1.7-1', '19.1.8-1']);
    provar('CheckBlocks', ['20.1.5-1', '20.1.8-1', '20.1.3-1', '20.1.6-2', '20.1.6-4', '9.4-1', '9.4-2', '9-3']);
    provar('RegisterTemporaryExtendedRevoke', ['17.4-1', '17.4-2', '17.4-3']);
    provar('RegisterExtendedConsent', ['10.1.12-1', '10.1.13-1', '10.1.16-1']);
    provar('CancelExtendedConsent', ['10.1.12-1', '10.1.13-1']);
    provar('GetExtendedConsentsForPatient', ['10.1.12-1', '10.1.13-1', '10.1.16-1']);
    provar('RegisterExtendedConsent', ['7.4-1', '7.4-2', '7.4-6']);
    provar('GetExtendedConsentsForPatient', ['5.4-2']);
    provar('GetAllBlocksForPatient', ['4.4-1']);
    const k = await inloggad('lak-kard');
    const db = sandlada(app, k).db;
    const fangat = fanga(db);
    const fore = Date.now();
    await hamta(k, 'p01', { samtycke: true });
    await k.post('/api/patient/p01/sammanhallen/hav-sparr', { samtycke: true });
    await k.post('/api/patient/p01/sammanhallen/aterkalla', {});
    // Vårdadministratören jämför Vårdkällans spärrar med spärrtjänsten (GetBlocksForPatient).
    const adm = await inloggad('adm-kard');
    const dbAdm = sandlada(app, adm).db;
    const fangatAdm = fanga(dbAdm);
    await adm.get('/api/patient/p01/sparr/sparrtjansten');
    fangat.push(...fangatAdm);
    const efter = Date.now();
    const sedda = new Set(fangat.map(f => f.kontrakt));
    for (const kk of ['CheckBlocks', 'GetAllBlocksForPatient', 'GetBlocksForPatient', 'RegisterTemporaryExtendedRevoke', 'RegisterExtendedConsent', 'CancelExtendedConsent', 'GetExtendedConsentsForPatient']) expect(sedda).toContain(kk);
    const fel = [];
    for (const f of fangat) {
      const b = f.begaran;
      for (const n of ['RequestDate', 'RegistrationDate']) {
        for (const v of varden(b, n)) {
          if (!TID.test(v)) fel.push(`${f.kontrakt} ${n} ${v}`);
          // Svensk tid: tiden ligger mellan början och slutet av testet i svensk tid.
          const t = franSvenskTid(v)?.getTime();
          if (!(t >= fore - 2000 && t <= efter + 2000)) fel.push(`${f.kontrakt} ${n} ${v} är inte svensk tid nu`);
        }
      }
      for (const n of ['InformationStartDate', 'InformationEndDate', 'EndDate', 'StartDate']) for (const v of varden(b, n)) if (!TID.test(v)) fel.push(`${f.kontrakt} ${n} ${v}`);
      for (const n of ['EmployeeId', 'CareUnitId', 'CareProviderId', 'RevokedForCareUnitId', 'RevokedForEmployeeId', 'InformationCareProviderId']) for (const v of varden(b, n)) if (!HSA.test(v) && v !== sj.VARDGIVARE.hsaId && !/^DEMO-/.test(v)) fel.push(`${f.kontrakt} ${n} ${v}`);
      for (const n of ['PatientId']) for (const v of varden(b, n)) if (!PNR.test(v)) fel.push(`${f.kontrakt} ${n} ${v.length} tecken`);
      for (const n of ['AssertionId', 'TemporaryRevokeId']) for (const v of varden(b, n)) if (!UUID.test(v)) fel.push(`${f.kontrakt} ${n} ${v}`);
      if (f.kontrakt === 'CheckBlocks') {
        const rader = varden(b, 'RowNumber');
        if (new Set(rader).size !== rader.length) fel.push('RowNumber har dubbletter');
        if (varden(f.svar, 'RowNumber').sort().join() !== [...rader].sort().join()) fel.push('CheckResults motsvarar inte begäran');
        for (const e of alla(b, 'InformationEntities')) { const [s, t] = ['InformationStartDate', 'InformationEndDate'].map(n => varden(e, n)[0]); if (s > t) fel.push('startdatum efter slutdatum'); }
      }
      if (f.kontrakt === 'RegisterTemporaryExtendedRevoke') for (const v of varden(b, 'EndDate')) if (v !== slutPaDagen()) fel.push(`hävningen slutar ${v}, inte ${slutPaDagen()}`);
    }
    expect(fel).toEqual([]);
    // Sista sekunden på dagen i Sverige, också strax efter midnatt svensk tid (som är dagen före i UTC).
    expect(slutPaDagen(new Date('2026-11-20T23:30:00Z'))).toBe('2026-11-21T23:59:59');
    expect(svenskTid('2026-07-01T10:00:00Z')).toBe('2026-07-01T12:00:00');
    expect(franSvenskTid('2026-03-29T03:00:00').toISOString()).toBe('2026-03-29T01:00:00.000Z');
  });

  test('de simulerade tjänsternas svar har tom ResultText när resultatet är OK', async () => {
    provar('GetAllBlocksForPatient', ['19.1.15-1']);
    provar('GetBlocksForPatient', ['19.1.15-1']);
    provar('RegisterTemporaryExtendedRevoke', ['19.1.15-1']);
    provar('CheckBlocks', ['20.1.9-1']);
    provar('RegisterExtendedConsent', ['10.1.18-1']);
    provar('CancelExtendedConsent', ['10.1.18-1']);
    provar('GetExtendedConsentsForPatient', ['10.1.18-1']);
    const k = await inloggad('lak-kard');
    const db = sandlada(app, k).db;
    const fangat = fanga(db);
    await hamta(k, 'p01', { samtycke: true });
    await k.post('/api/patient/p01/sammanhallen/hav-sparr', { samtycke: true });
    const fel = [];
    for (const f of fangat) for (const r of [...alla(f.svar, 'Result'), ...alla(f.svar, 'ResultType')]) {
      const kod = varden(r, 'ResultCode')[0];
      const text = varden(r, 'ResultText')[0] ?? '';
      if (kod === 'OK' && text !== '') fel.push(`${f.kontrakt}: ${text}`);
    }
    expect(fangat.length).toBeGreaterThan(3);
    expect(fel).toEqual([]);
  });

  test('ett svar från spärrtjänsten med ERROR betyder att åtgärden inte genomfördes, inte att patienten saknar spärrar', async () => {
    provar('CheckBlocks', ['2.3-5', '2.3-6']);
    provar('GetAllBlocksForPatient', ['2.3-5', '2.3-6']);
    provar('GetBlocksForPatient', ['2.3-5', '2.3-6']);
    provar('RegisterTemporaryExtendedRevoke', ['2.3-5', '2.3-6']);
    provar('GetAllBlocksForPatient', ['4-1']);
    const k = await inloggad('lak-kard');
    const db = sandlada(app, k).db;
    await hamta(k, 'p01', { samtycke: true });
    const fel = (kontrakt) => {
      const def = nationella.K[kontrakt];
      return { status: 200, text: kuvert(skriv(def.schema.bygg(def.svar.ns, def.svar.lokal, { BlockHeaderType: { Result: { ResultCode: 'ERROR', ResultText: 'Underlaget är inte tillräckligt aktuellt.' }, Blocks: [], NextCreatedOnOrAfter: svenskTid(new Date()), LatestCancellation: svenskTid(new Date()) } }))) };
    };
    const fangat = fanga(db, (kontrakt) => (kontrakt === 'GetAllBlocksForPatient' ? fel(kontrakt) : null));
    // Hävningen kan inte göras när spärrarna inte kunde hämtas, och ingen hävning registreras.
    const r = await k.post('/api/patient/p01/sammanhallen/hav-sparr', { samtycke: true });
    expect(r.status).toBe(503);
    expect(fangat.some(f => f.kontrakt === 'RegisterTemporaryExtendedRevoke')).toBe(false);
    // Jämförelsen med Vårdkällans spärrar säger att tjänsten inte kunde svara, i stället för att spärrarna saknas där.
    const k2 = await inloggad('adm-kard');
    const db2 = sandlada(app, k2).db;
    fanga(db2, (kontrakt) => (kontrakt === 'GetBlocksForPatient' ? fel(kontrakt) : null));
    expect((await k2.get('/api/patient/p01/sparr/sparrtjansten')).data.stammer).toBe(null);
  });

  test('INFO från CheckBlocks är en genomförd kontroll, och bara uppgifterna med status OK visas', async () => {
    provar('CheckBlocks', ['2.3-6', '20.1.10-1', '9-4', '9.5-4']);
    const k = await inloggad('lak-kard');
    const db = sandlada(app, k).db;
    await hamta(k, 'p01', { samtycke: true });
    const sim = iProcessenSynk(nationella.tjanst, { ctx: { db }, avsandare: { hsaId: VG, via: 'direkt' } });
    fanga(db, (kontrakt, a) => {
      if (kontrakt !== 'CheckBlocks') return null;
      const def = nationella.K.CheckBlocks;
      const svar = def.schema.lasUt(kropp(sim(a).text));
      // Den första uppgiften får ett valideringsfel, och resultatet blir INFO.
      svar.CheckBlocksResultType.Result = { ResultCode: 'INFO', ResultText: 'Informationsresurs(er) innehåller valideringsfel' };
      svar.CheckBlocksResultType.CheckResults[0].Status = 'VALIDATIONERROR';
      return { status: 200, text: kuvert(skriv(def.schema.bygg(def.svar.ns, def.svar.lokal, svar))) };
    });
    const d = (await k.get('/api/patient/p01/sammanhallen')).data;
    expect(d.fel ?? null).toBe(null);
    expect(d.poster.length).toBe(sj.POSTER.p01.filter(p => !p.sparrad).length - 1);
  });

  test('INFO från samtyckestjänsten är en genomförd fråga, och samtycket gäller som vanligt', async () => {
    provar('RegisterExtendedConsent', ['2.3-5', '2.3-6']);
    provar('CancelExtendedConsent', ['2.3-5', '2.3-6']);
    provar('GetExtendedConsentsForPatient', ['2.3-5', '2.3-6']);
    const k = await inloggad('lak-kard');
    const db = sandlada(app, k).db;
    await hamta(k, 'p01', { samtycke: true });
    const sim = iProcessenSynk(nationella.tjanst, { ctx: { db }, avsandare: { hsaId: VG, via: 'direkt' } });
    fanga(db, (kontrakt, a) => {
      if (kontrakt !== 'GetExtendedConsentsForPatient') return null;
      const def = nationella.K.GetExtendedConsentsForPatient;
      const svar = def.schema.lasUt(kropp(sim(a).text));
      svar.GetExtendedConsentsResultType.Result = { ResultCode: 'INFO', ResultText: 'Ett meddelande från tjänsten.' };
      return { status: 200, text: kuvert(skriv(def.schema.bygg(def.svar.ns, def.svar.lokal, svar))) };
    });
    const d = (await k.get('/api/patient/p01/sammanhallen')).data;
    expect(d.samtyckeGaller).toBe(true);
    expect(d.samtyckestjanst).toBe('ok');
  });

  test('den simulerade spärrtjänsten lämnar inte ut hävningar som har gått ut, och en omsändning av en hävning är genomförd', async () => {
    provar('GetAllBlocksForPatient', ['4-2', '19.1.17-2']);
    provar('RegisterTemporaryExtendedRevoke', ['2.3-7', '17-1', '17-2']);
    const k = await inloggad('lak-kard');
    const db = sandlada(app, k).db;
    await hamta(k, 'p01', { samtycke: true });
    const block = nationella.anropa(db, 'GetAllBlocksForPatient', { PatientId: '194502024732' }).BlockHeaderType.Blocks.find(b => b.BlockType === 'Outer');
    const havning = (id, slut) => nationella.anropa(db, 'RegisterTemporaryExtendedRevoke', { TemporaryRevokeId: id, BlockId: block.BlockId, EndDate: slut, RevokedForCareUnitId: 'SE2321000164-VK0120',
      RegisterAction: { RequestDate: svenskTid(new Date()), RequestedBy: { EmployeeId: 'SE2321000164-VKP001' }, RegistrationDate: svenskTid(new Date()), RegisteredBy: { EmployeeId: 'SE2321000164-VKP001' } }, RevokeReason: 'PatientsConsent', ReplicationTimeout: 0 }).ResultType.ResultCode;
    const id = crypto.randomUUID();
    expect(havning(id, slutPaDagen())).toBe('OK');
    expect(havning(id, slutPaDagen())).toBe('OK');
    const gammal = crypto.randomUUID();
    expect(havning(gammal, svenskTid(new Date(Date.now() - 3600_000)))).toBe('OK');
    const lista = nationella.anropa(db, 'GetAllBlocksForPatient', { PatientId: '194502024732' }).BlockHeaderType.Blocks.find(b => b.BlockId === block.BlockId).TemporaryRevokes ?? [];
    expect(lista.map(h => h.TemporaryRevokeId)).toEqual([id]);
  });
});
