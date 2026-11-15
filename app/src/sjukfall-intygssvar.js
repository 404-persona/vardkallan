// Runda 16, r2: svaren i Läkarintyg för sjukpenning (FK 7804) som sjukskrivningen bygger på, i tjänstekontraktens form
// (riv.clinicalprocess.healthcond.certificate 3, Svar och Delsvar). Den simulerade intygsapplikationen skickar dem med
// statusuppdateringen när intyget signeras, som en riktig intygsapplikation gör, och journalen läser dem (sjukfall.js).
//
// Frågorna har samma id som i FK 7804 version 1 (Ineras tekniska beskrivning och intygens källkod):
//   6    Diagnos, delsvar 6.2 kod i ICD-10-SE
//   28   Sysselsättning, delsvar 28.1 kod i KV_FKMU_0002
//   32   Behov av sjukskrivning, en gång per period: 32.1 sjukskrivningsnivå i KV_FKMU_0003 och 32.2 perioden
//   37   Försäkringsmedicinskt beslutsstöd, delsvar 37.1: läkarens motivering när sjukskrivningen blir längre än
//        Socialstyrelsens rekommendation
//
// Filen beror inte på journalen eller simuleringen, så att båda kan använda den.
import { el } from './rivta/xml.js';
import { idag, addDagar } from './db.js';

export const NS_TYPES = 'urn:riv:clinicalprocess:healthcond:certificate:types:3';
export const KV_SYSSELSATTNING = 'KV_FKMU_0002';
export const KV_NIVA = 'KV_FKMU_0003';
export const ICD10 = '1.2.752.116.1.1.1';

// Sjukskrivningsnivåerna: den simulerade intygsapplikationens svar, koden i KV_FKMU_0003 och graden i procent.
export const NIVAER = {
  heltid: { kod: 'HELT_NEDSATT', grad: 100, text: 'Helt nedsatt' },
  tre_fjardedelar: { kod: 'TRE_FJARDEDEL', grad: 75, text: 'Nedsatt med tre fjärdedelar' },
  halften: { kod: 'HALFTEN', grad: 50, text: 'Nedsatt till hälften' },
  en_fjardedel: { kod: 'EN_FJARDEDEL', grad: 25, text: 'Nedsatt med en fjärdedel' },
};
const NIVA_AV_KOD = new Map(Object.entries(NIVAER).map(([nyckel, n]) => [n.kod, { nyckel, ...n }]));
const NIVA_AV_GRAD = new Map(Object.entries(NIVAER).map(([nyckel, n]) => [n.grad, nyckel]));
export const nivaForGrad = (grad) => NIVA_AV_GRAD.get(Number(grad)) ?? null;

export const SYSSELSATTNINGAR = {
  nuvarande_arbete: { kod: 'NUVARANDE_ARBETE', text: 'Nuvarande arbete' },
  arbetssokande: { kod: 'ARBETSSOKANDE', text: 'Arbetssökande' },
  foraldraledighet: { kod: 'FORALDRALEDIG', text: 'Föräldraledighet' },
  studier: { kod: 'STUDIER', text: 'Studier' },
};
const SYSS_AV_KOD = new Map(Object.entries(SYSSELSATTNINGAR).map(([nyckel, s]) => [s.kod, nyckel]));

const DATUM = /^\d{4}-\d\d-\d\d$/;
// Ett datum som finns i kalendern (2026-02-30 gör det inte).
const datum = (v) => (typeof v === 'string' && DATUM.test(v) && !Number.isNaN(Date.parse(v)) && new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v ? v : null);

// Perioden i ett sjukintyg (Vårdkällans demoregel): giltiga datum, start före slut, båda inom två år från i dag och
// högst ett år per period. En längre sjukskrivning skrivs som flera intyg. Ger förklaringen på vanlig svenska, eller
// null när perioden går. Regeln gäller både när perioden sparas och när den läses, så att ett orimligt intervall aldrig
// når beräkningen av sjukfallet.
export const PERIOD_FONSTER_DAGAR = 730;
export const PERIOD_HOGST_DAGAR = 366;
export function provaPeriod(fran, till, dag = idag()) {
  const f = fran == null ? null : datum(fran);
  const t = till == null ? null : datum(till);
  if ((fran != null && !f) || (till != null && !t)) return 'Datum ska skrivas ÅÅÅÅ-MM-DD och finnas i kalendern.';
  const forsta = addDagar(dag, -PERIOD_FONSTER_DAGAR);
  const sista = addDagar(dag, PERIOD_FONSTER_DAGAR);
  for (const d of [f, t]) if (d && (d < forsta || d > sista)) return `Perioden ska ligga inom två år från i dag, mellan ${forsta} och ${sista}.`;
  if (f && t && t < f) return 'Slutdatumet kan inte vara före startdatumet.';
  if (f && t && (Date.parse(t) - Date.parse(f)) / 86_400_000 + 1 > PERIOD_HOGST_DAGAR) return 'En period i sjukintyget kan vara högst ett år. Skriv ett nytt intyg när perioden går ut.';
  return null;
}

// Perioderna i den simulerade intygsapplikationens svar. Den har i dag en period (fran, till och nedsattning). En lista
// med perioder (perioder: [{ fran, till, nedsattning }]) läses på samma sätt, så att flera sjukskrivningsnivåer i samma
// intyg, som FK 7804 tillåter, räknas rätt när intygsapplikationen får dem.
// Den simulerade intygsapplikationens svar på ett gemensamt sätt. Två former läses: den med namngivna fält (diagnosKod,
// sysselsattning, nedsattning, fran, till och motiveringFmb) och den där svaren har frågans id som nyckel ('6' diagnoser,
// '28' sysselsättningar, '32' perioder med kod i KV_FKMU_0003 och '37' motiveringen), så att stödet fungerar med båda.
export function simSvar(s = {}) {
  const per = Array.isArray(s?.['32']) ? s['32'].map(p => ({ fran: p?.fran, till: p?.till, nedsattning: NIVA_AV_KOD.get(p?.kod)?.nyckel ?? p?.kod }))
    : Array.isArray(s?.perioder) ? s.perioder : [{ fran: s?.fran, till: s?.till, nedsattning: s?.nedsattning }];
  const d = Array.isArray(s?.['6']) ? s['6'][0] : null;
  const sy = Array.isArray(s?.['28']) ? s['28'][0] : null;
  return {
    diagnosKod: s?.diagnosKod ?? d?.kod ?? null, diagnosText: s?.diagnosText ?? d?.text ?? null,
    sysselsattning: s?.sysselsattning ?? (typeof sy === 'string' ? SYSS_AV_KOD.get(sy) ?? sy : null),
    perioder: per, motiveringFmb: typeof s?.motiveringFmb === 'string' ? s.motiveringFmb : typeof s?.['37'] === 'string' ? s['37'] : null,
  };
}
// Om svaren har frågans id som nyckel, så att motiveringen sparas som fråga 37.
export const harFrageNycklar = (s = {}) => ['6', '28', '32', '37'].some(k => Object.hasOwn(s ?? {}, k));

export function perioderUrSimSvar(s = {}, dag = idag()) {
  const lista = simSvar(s).perioder;
  return lista
    .map(p => ({ fran: datum(p?.fran), till: datum(p?.till), niva: Object.hasOwn(NIVAER, p?.nedsattning ?? '') ? p.nedsattning : null }))
    .filter(p => p.fran && p.till && p.niva && !provaPeriod(p.fran, p.till, dag))
    .map(p => ({ fran: p.fran, till: p.till, grad: NIVAER[p.niva].grad }))
    .sort((a, b) => (a.fran < b.fran ? -1 : a.fran > b.fran ? 1 : 0));
}

const cv = (code, codeSystem, displayName) => el(NS_TYPES, 'cv', [el(NS_TYPES, 'code', code), el(NS_TYPES, 'codeSystem', codeSystem), displayName ? el(NS_TYPES, 'displayName', displayName) : null]);

// Svaren för sysselsättning, sjukskrivningens perioder och motiveringen, i kontraktets form. Diagnosen (fråga 6) bygger
// intygsapplikationen själv.
export function rivSvar(s0 = {}) {
  const s = simSvar(s0);
  const ut = [];
  if (Object.hasOwn(SYSSELSATTNINGAR, s.sysselsattning ?? '')) {
    const x = SYSSELSATTNINGAR[s.sysselsattning];
    ut.push({ '@id': '28', instans: 1, delsvar: [{ '@id': '28.1', $any: [cv(x.kod, KV_SYSSELSATTNING, x.text)] }] });
  }
  perioderUrSimSvar(s0).forEach((p, i) => {
    const n = NIVAER[nivaForGrad(p.grad)];
    ut.push({ '@id': '32', instans: i + 1, delsvar: [
      { '@id': '32.1', $any: [cv(n.kod, KV_NIVA, n.text)] },
      { '@id': '32.2', $any: [el(NS_TYPES, 'datePeriod', [el(NS_TYPES, 'start', p.fran), el(NS_TYPES, 'end', p.till)])] },
    ] });
  });
  const motivering = typeof s.motiveringFmb === 'string' ? s.motiveringFmb.trim() : '';
  if (motivering) ut.push({ '@id': '37', delsvar: [{ '@id': '37.1', $: motivering }] });
  return ut;
}

// Läser svaren ur ett mottaget intyg. Det som inte går att läsa hoppas över, så att ett felaktigt svar aldrig ger en
// period som inte finns.
const barnText = (nod, namn) => (nod?.barn ?? []).find(b => b.lokal === namn)?.text?.trim() ?? null;
export function lasSvar(svar = [], dag = idag()) {
  const ut = { diagnosKod: null, diagnosText: null, sysselsattning: null, perioder: [], motivering: null };
  for (const sv of Array.isArray(svar) ? svar : []) {
    if (!sv || typeof sv !== 'object') continue;
    const delsvar = Array.isArray(sv?.delsvar) ? sv.delsvar : [];
    const d = (id) => delsvar.find(x => x?.['@id'] === id);
    const forsta = (id, lokal) => (d(id)?.$any ?? []).find(x => x?.lokal === lokal) ?? null;
    if (sv['@id'] === '6') {
      const c = forsta('6.2', 'cv');
      if (c && !ut.diagnosKod) { ut.diagnosKod = barnText(c, 'code')?.slice(0, 10) ?? null; ut.diagnosText = barnText(c, 'displayName')?.slice(0, 200) ?? null; }
    } else if (sv['@id'] === '28') {
      const c = forsta('28.1', 'cv');
      if (c && barnText(c, 'codeSystem') === KV_SYSSELSATTNING) ut.sysselsattning = SYSS_AV_KOD.get(barnText(c, 'code')) ?? null;
    } else if (sv['@id'] === '32') {
      const c = forsta('32.1', 'cv');
      const p = forsta('32.2', 'datePeriod');
      const niva = c && barnText(c, 'codeSystem') === KV_NIVA ? NIVA_AV_KOD.get(barnText(c, 'code')) : null;
      const fran = datum(barnText(p, 'start'));
      const till = datum(barnText(p, 'end'));
      if (niva && fran && till && !provaPeriod(fran, till, dag)) ut.perioder.push({ fran, till, grad: niva.grad });
    } else if (sv['@id'] === '37') {
      const t = typeof d('37.1')?.$ === 'string' ? d('37.1').$.trim() : '';
      if (t) ut.motivering = t.slice(0, 4000);
    }
  }
  // FK 7804 har en period per sjukskrivningsnivå, högst fyra, och intygsapplikationen sparar inte fler.
  ut.perioder.sort((a, b) => (a.fran < b.fran ? -1 : a.fran > b.fran ? 1 : 0)).splice(4);
  return ut;
}

// Svaren i intyget i statusuppdateringen: diagnosen som intygsapplikationen bygger, och för sjukintyget svaren om
// sjukskrivningen. null när inget ska med.
export function sjukskrivningSvar(typ, med, simSvar, diagnosSvar) {
  if (!med) return null;
  const ut = [...(diagnosSvar ?? []), ...(typ === 'LISJP' ? rivSvar(simSvar ?? {}) : [])];
  return ut.length ? ut : null;
}

// Förifyllnaden i CreateDraftCertificate som den simulerade intygsapplikationens svar. En period, eftersom
// intygsapplikationen i demon har en period per intyg; med flera perioder tas den sista.
export function simSvarUrForifyllnad(svar) {
  const s = lasSvar(svar ?? []);
  const ut = {};
  if (s.sysselsattning) ut.sysselsattning = s.sysselsattning;
  const p = s.perioder.at(-1);
  if (p) Object.assign(ut, { fran: p.fran, till: p.till, nedsattning: nivaForGrad(p.grad) });
  if (s.motivering) ut.motiveringFmb = s.motivering.slice(0, 2000);
  return ut;
}
