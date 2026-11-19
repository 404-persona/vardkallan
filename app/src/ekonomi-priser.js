// Priser där beslutet fattas (runda 18, r3, Sussa bör-krav B4 och 7.1.2.1): vid ordination av läkemedel, förskrivning av
// hjälpmedel och beställning av prover och undersökningar visas priset diskret, med ett billigare likvärdigt alternativ när
// ett sådant finns. Priset visas, aldrig ett hinder: inget flöde får fler klick, och inget val görs åt läkaren.
//
// Systemet är experten. Det räknar fram priset ur produkten, förpackningen, sortimentet och laboratoriet, och föreslår
// bara ett alternativ som är likvärdigt: periodens vara i samma utbytesgrupp, som apoteket ändå byter till om förskrivaren
// inte motsätter sig utbyte, och basmodellen ur hjälpmedelssortimentet. Det medicinskt rätta avgörs av läkaren.
//
// Alla priser här är påhittade demopriser. De är inte TLV:s priser, och utbytesgrupperna och periodens vara är påhittade
// för demon. Priserna för hjälpmedel kommer ur vårdenhetens prislista (ekonomi-schema.js).
import { KATALOG } from './seed/lakemedel-katalog.js';
import { ANALYS } from './labb-katalog.js';
import { kanRoll } from './atkomst.js';
import { BASPRISER, LIKVARDIGA, UTHAMTNING } from './ekonomi-schema.js';

export const DEMO_PRISER = 'Påhittade demopriser, inte TLV:s eller någon regions priser. Utbytesgrupperna och periodens vara är påhittade för demon.';

// Priser visas för den som fattar beslutet och ser kostnaderna i vårdprocessen: läkare och sjuksköterskor.
export const visarPriser = (personal) => kanRoll(personal, 'las_kostnader') && kanRoll(personal, 'las_lakemedel');

const kr = (n) => `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} kr`;
const krDec = (n) => (n >= 10 ? kr(n) : `${n.toFixed(2).replace('.', ',')} kr`);

// Generiska produkter har tillverkarens namn i produktnamnet. Ett påhittat demopris per enhet räknas ur formen, om
// produkten är generisk och ur produktens NPL-id, så att priset är detsamma varje gång.
const GENERISKA = /\b(Krka|Teva|Sandoz|Orifarm|Pfizer|Actavis|Pilum|Fresenius Kabi|Abcur|Alternova|Evolan|Santen|Mylan|Accord|Viatris|Ebb|Medical Valley)\b/;
// Substanser som har en påhittad utbytesgrupp med periodens vara i demon.
const UTBYTESGRUPPER = new Set(['apixaban', 'rivaroxaban', 'tikagrelor', 'paracetamol', 'escitalopram']);
function forpackning(form) {
  if (/infusion/.test(form)) return { antal: 10, enhet: 'flaskor' };
  if (/injektionspenna/.test(form)) return { antal: 5, enhet: 'pennor' };
  if (/förfylld spruta/.test(form)) return { antal: 10, enhet: 'sprutor' };
  if (/injektion/.test(form)) return { antal: 10, enhet: 'ampuller' };
  if (/spray|inhalation|nebulisator|ögondroppar|ögonsalva|lösning|salva|kräm/.test(form)) return { antal: 1, enhet: 'förpackning' };
  return { antal: 100, enhet: /kapsel/.test(form) ? 'kapslar' : 'tabletter' };
}
const fast = (npl) => (Number(String(npl).slice(-5)) % 997) / 997;
function perEnhet(k) {
  const f = fast(k.npl);
  const gen = GENERISKA.test(k.namn);
  if (/infusion|injektion/.test(k.form)) return Math.round(30 + f * (gen ? 60 : 300));
  if (forpackning(k.form).antal === 1) return Math.round(60 + f * (gen ? 90 : 260));
  return Math.round((gen ? 0.4 + f * 1.8 : 4 + f * 18) * 100) / 100;
}

const KATALOGEN = new Map(KATALOG.map(k => [k.id, k]));

// Priset för ett läkemedel ur katalogen, och periodens vara i utbytesgruppen när den är billigare.
export function lakemedelspris(lakemedelId) {
  const k = KATALOGEN.get(lakemedelId);
  if (!k) return null;
  const fp = forpackning(k.form);
  const enhet = perEnhet(k);
  const pris = Math.round(enhet * fp.antal);
  const fastForm = fp.antal > 1 && !/injektion|infusion/.test(k.form);
  let alternativ = null;
  if (fastForm && !GENERISKA.test(k.namn) && UTBYTESGRUPPER.has(k.substans)) {
    const pv = Math.max(0.3, Math.round(enhet * 0.25 * 100) / 100);
    const pvPris = Math.round(pv * fp.antal);
    alternativ = { typ: 'periodens_vara', pris: pvPris, perEnhet: pv, skillnad: pris - pvPris,
      text: `Periodens vara i utbytesgruppen för ${k.substans} ${k.styrka} kostar ${kr(pvPris)} för ${fp.antal} ${fp.enhet}. Apoteket byter till den om du inte motsätter dig utbyte, så du behöver inte göra något.` };
  }
  return {
    lakemedelId, pris, perEnhet: enhet, forpackning: `${fp.antal} ${fp.enhet}`, forman: true, alternativ, demo: DEMO_PRISER,
    text: `${kr(pris)} för ${fp.antal} ${fp.enhet} (${krDec(enhet)} per ${fp.antal === 1 ? 'förpackning' : fp.enhet === 'tabletter' ? 'tablett' : fp.enhet === 'kapslar' ? 'kapsel' : 'styck'}) inom läkemedelsförmånen`,
  };
}

// Prover och undersökningar: pris per analys eller undersökning hos det utförande laboratoriet eller röntgen (demopris).
const DISCIPLIN = { klinisk_kemi: 45, mikrobiologi: 320, patologi: 1200, transfusionsmedicin: 250, klinisk_immunologi: 380, klinisk_genetik: 4200, klinisk_fysiologi: 900, klinisk_neurofysiologi: 1800, patientnara: 35 };
const MODALITET = { DX: 750, CT: 2400, MR: 4200, US: 1100, ECG: 350, EEG: 1800, EMG: 2100 };
const SARSKILDA = { blodstatus: 60, hba1c: 70, ntprobnp: 180, troponin: 120, arbetsprov: 1600, eko: 2200, dt_buk: 2900, dt_torax: 2900 };
export function analyspris(analysId) {
  const a = ANALYS[analysId];
  if (!a) return null;
  const belopp = SARSKILDA[analysId] ?? (a.modalitet && a.ror === 'undersokning' ? MODALITET[a.modalitet] : null) ?? DISCIPLIN[a.disciplin] ?? 100;
  return { analys: analysId, belopp, text: kr(belopp), demo: DEMO_PRISER };
}

// Hjälpmedlet ur prislistans poster, med basmodellen ur sortimentet som likvärdigt billigare alternativ, och om det hämtas
// ut och betalas i receptionen.
export function hjalpmedelspris(poster, kod) {
  const p = poster?.[kod];
  if (!p) return null;
  const altKod = Object.hasOwn(LIKVARDIGA, kod) ? LIKVARDIGA[kod] : null;
  const alt = altKod && poster[altKod] && poster[altKod].pris < p.pris ? { kod: altKod, text: poster[altKod].text, pris: poster[altKod].pris, avgift: poster[altKod].avgift, skillnad: p.pris - poster[altKod].pris } : null;
  return { kod, pris: p.pris, avgift: p.avgift, uthamtning: UTHAMTNING.has(kod), alternativ: alt };
}

// Lägger till priset i katalogens träffar för den som ser priser. Andra får listan som den är.
export function markeraKatalog(personal, lista) {
  if (!visarPriser(personal) || !Array.isArray(lista)) return lista;
  return lista.map(l => { const p = lakemedelspris(l.id); return p ? { ...l, pris: { text: p.text, belopp: p.pris, alternativ: p.alternativ ? { text: p.alternativ.text, pris: p.alternativ.pris } : null } } : l; });
}

// Lägger till priset för varje analys och paket i förslaget för beställning av prover och undersökningar.
export function markeraForslag(personal, f) {
  if (!visarPriser(personal) || !f) return f;
  const med = (a) => { const p = analyspris(a.analys ?? a.id); return p ? { ...a, pris: { belopp: p.belopp, text: p.text } } : a; };
  const paket = (pk) => { const analyser = (pk.analyser ?? []).map(med); return { ...pk, analyser, pris: { belopp: analyser.reduce((s, a) => s + (a.pris?.belopp ?? 0), 0) } }; };
  return { ...f, analyser: (f.analyser ?? []).map(med), paket: (f.paket ?? []).map(paket), prisDemo: DEMO_PRISER };
}

export const ALLA_HJALPMEDEL = Object.keys(BASPRISER.hjalpmedel);
