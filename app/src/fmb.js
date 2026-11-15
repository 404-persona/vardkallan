// Runda 16, r2: Socialstyrelsens försäkringsmedicinska beslutsstöd (FMB) när läkaren skriver ett sjukintyg.
//
// Datan är ett utdrag ur Socialstyrelsens öppna API för FMB (https://api.socialstyrelsen.se/fmb), som Socialstyrelsen
// tillhandahåller med villkoret CC0. Utdraget ligger i fmb/fmb-data.json och byggs med scripts/fmb-hamta.js. Texterna
// är Socialstyrelsens, med tankstreck utbytta efter Vårdkällans språkregler. Det som Vårdkällan själv lägger till är
// urvalet för en diagnos, omräkningen av tiden till dagar och varningen på vanlig svenska.
//
// Systemet är experten: läkaren behöver inte söka i beslutsstödet. Diagnosen i intyget ger diagnosrubriken, de typiska
// funktionsnedsättningarna och aktivitetsbegränsningarna och typfallen med Socialstyrelsens rekommenderade
// sjukskrivningstid. Den längsta rekommenderade tiden för diagnosen är den längsta i något av typfallen, som i Webcert,
// och den jämförs med den sammanlagda sjukskrivningen som systemet räknar själv ur patientens intyg (sjukfall.js).
import data from './fmb/fmb-data.json' with { type: 'json' };

export const KALLA = { text: data.kalla, licens: data.licens, version: data.version, hamtad: data.hamtad };

// Tiden i typfallen anges med olika enheter i Socialstyrelsens data. Webcert räknar dag som 1, vecka som 7 och månad
// som 31 dagar och läser bara koderna d, wk och mo. Vårdkällan läser också de varianter som förekommer i datan (w och v
// för veckor, m, M och md för månader), så att inget typfall faller bort för att enheten är skriven på ett annat sätt.
export const ENHETER = {
  d: { dagar: 1, en: 'dag', flera: 'dagar' },
  wk: { dagar: 7, en: 'vecka', flera: 'veckor' }, w: { dagar: 7, en: 'vecka', flera: 'veckor' }, v: { dagar: 7, en: 'vecka', flera: 'veckor' },
  mo: { dagar: 31, en: 'månad', flera: 'månader' }, m: { dagar: 31, en: 'månad', flera: 'månader' },
  M: { dagar: 31, en: 'månad', flera: 'månader' }, md: { dagar: 31, en: 'månad', flera: 'månader' },
};

// ICD-10-SE med eller utan punkt, i versaler: J06.9, J069 och j06.9 blir J069.
export const normalisera = (kod) => String(kod ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const DIAGNOSER = data.diagnoser.map(d => ({ ...d, normkoder: d.koder.map(normalisera) }));
const TYPFALL = data.typfall.map(t => ({ ...t, normkoder: t.koder.map(normalisera) }));

// Hur väl en kod i FMB passar diagnosen: hela koden eller en överordnad kategori (J06 för J06.9). Längst vinner.
const matchning = (normkoder, diag) => Math.max(0, ...normkoder.filter(k => k && diag.startsWith(k)).map(k => k.length));

export function tidIDagar(tid, enhet) {
  if (tid == null || !Number.isFinite(tid)) return null;
  const e = Object.hasOwn(ENHETER, enhet ?? '') ? ENHETER[enhet] : null;
  return e ? tid * e.dagar : null;
}
export function tidText(tid, enhet) {
  const e = Object.hasOwn(ENHETER, enhet ?? '') ? ENHETER[enhet] : null;
  if (tid == null || !e) return null;
  if (tid === 0) return 'ingen sjukskrivning';
  return `${tid} ${tid === 1 ? e.en : e.flera}`;
}

// Beslutsstödet för en diagnoskod: diagnosrubriken, funktionsnedsättningar, aktivitetsbegränsningar och typfall. null
// när Socialstyrelsen inte har någon diagnosrubrik för koden.
export function forDiagnos(kod) {
  const diag = normalisera(kod);
  if (!diag) return null;
  let bast = 0;
  let rubriker = [];
  for (const d of DIAGNOSER) {
    const m = matchning(d.normkoder, diag);
    if (m > bast) { bast = m; rubriker = [d]; } else if (m && m === bast) rubriker.push(d);
  }
  if (!rubriker.length) return null;
  let bastTyp = 0;
  let typfall = [];
  for (const t of TYPFALL) {
    const m = matchning(t.normkoder, diag);
    if (m > bastTyp) { bastTyp = m; typfall = [t]; } else if (m && m === bastTyp) typfall.push(t);
  }
  const ut = typfall.map(t => ({
    id: t.id, tillstand: t.tillstand, rekommendation: t.rekommendation, grad: t.grad,
    tid: tidText(t.tid, t.enhet), dagar: tidIDagar(t.tid, t.enhet),
  }));
  const medTid = ut.filter(t => t.dagar != null);
  const langst = medTid.length ? medTid.reduce((a, b) => (b.dagar > a.dagar ? b : a)) : null;
  const d = rubriker[0];
  return {
    diagnosrubrik: rubriker.map(r => r.rubrik).join(', '),
    koder: [...new Set(rubriker.flatMap(r => r.koder))],
    funktionsnedsattning: d.funktionsnedsattning, funktionsnedsattningIcf: d.funktionsnedsattningIcf,
    aktivitetsbegransning: d.aktivitetsbegransning, aktivitetsbegransningIcf: d.aktivitetsbegransningIcf,
    typfall: ut,
    rekommenderadMaxDagar: langst ? langst.dagar : null,
    rekommenderadMaxText: langst ? langst.tid : null,
    kalla: `${KALLA.text}, version ${KALLA.version}, hämtad ${KALLA.hamtad}. Villkor: ${KALLA.licens}.`,
  };
}

export const ANTAL = { diagnosrubriker: DIAGNOSER.length, typfall: TYPFALL.length };
