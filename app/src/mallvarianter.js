// Runda 15, r4: varianter inom läkarnas anteckningsmallar och läsordningen (granskningen av mallarna, F5).
//
// En variant är några undersökord som fälls ut inom en befintlig mall, inte en ny mall. Systemet väljer varianten ur
// sammanhanget och säger varför: en telefonkontakt ger telefonvarianten, psykiatrins vårdenhet eller en kontaktorsak om
// suicidtankar ger psykiskt status och suicidriskbedömning, och på vårdcentralen fälls sökorden för de kroniska
// sjukdomar som patienten har ut. Användaren kan välja bort varianten eller fälla ut ett annat undersökord med ett klick,
// men behöver aldrig välja mall för situationen. Det är samma grepp som Sussa nu inför i Cosmic med dynamiska sökord, men
// utan att mallarna blir fler.
//
// Läsordningen: läsvyn visar Bedömning och Åtgärd först (APSO), eftersom det är det som läses mest. Det sparade ändras
// inte, och den som vill kan visa anteckningen i den ordning den skrevs. Skrivordningen är vårdenhetens val
// (presentationsvyer.js, vyn anteckning), som systemförvaltningen eller verksamhetschefen sätter.
import { vardenhetFor } from './atkomst.js';

// Mönstret för kontaktorsaker som gör att psykiatrins variant väljs, också utanför psykiatrin (till exempel på akuten).
const SUICID = /suicid|självmord|självskad|ta sitt liv/i;

// Undersökorden för de kroniska sjukdomarna i primärvården och diagnoserna (ICD-10-SE) som fäller ut dem.
export const KRONISKA = [
  { sokord: 'Diabetes', kod: /^E1[0-4]/, text: 'diabetes' },
  { sokord: 'Astma och KOL', kod: /^J4[45]/, text: 'astma eller KOL' },
  { sokord: 'Hypertoni', kod: /^I1[0-5]/, text: 'högt blodtryck' },
  { sokord: 'Hjärtsvikt', kod: /^I50/, text: 'hjärtsvikt' },
];

export const VARIANTER = {
  telefon: {
    id: 'telefon', namn: 'Telefonkontakt', sokord: ['Råd och egenvård'], ersatter: ['Status'], efter: 'Bedömning',
    galler: { kontakttyp: ['telefon'] },
  },
  psykiatri: {
    id: 'psykiatri', namn: 'Psykiatri', sokord: ['Psykiskt status', 'Suicidriskbedömning'], efter: 'Status',
    galler: { vardenhet: 'psykiatri', kontaktorsak: 'suicid' },
  },
  kronisk: {
    id: 'kronisk', namn: 'Kroniska sjukdomar', sokord: KRONISKA.map(k => k.sokord), efter: 'Status',
    galler: { vardenhet: 'primarvard', diagnos: KRONISKA.map(k => k.kod.source) },
  },
  // Beslut 2026-11-14: fler varianter, var och en med två till fyra undersökord. Inget av dem är obligatoriskt, och
  // inget dras in som löptext; värdena finns i underlaget att föra in med ett klick.
  digital: {
    id: 'digital', namn: 'Digital kontakt', sokord: ['Observerat i videosamtalet', 'Råd och egenvård'], ersatter: ['Status'], efter: 'Aktuellt',
    galler: { kontakttyp: ['video', 'chatt'] },
  },
  barn: {
    id: 'barn', namn: 'Barn och unga', sokord: ['Tillväxt', 'Vaccinationer', 'Utveckling'], efter: 'Status',
    galler: { alder: '< 18' },
  },
  aldre: {
    id: 'aldre', namn: 'Äldre med många läkemedel', sokord: ['Läkemedelsgenomgång', 'Fallrisk'], efter: 'Bedömning',
    galler: { alder: '>= 75', lakemedel: '>= 5' },
  },
  palliativ: {
    id: 'palliativ', namn: 'Palliativ vård', sokord: ['Brytpunktssamtal', 'Symtomskattning'], efter: 'Aktuellt',
    galler: { diagnos: ['Z51.5'], kontaktorsak: 'palliativ' },
  },
  graviditet: {
    id: 'graviditet', namn: 'Graviditet', sokord: ['Graviditet', 'Läkemedel under graviditet'], efter: 'Aktuellt',
    galler: { graviditet: true },
  },
};

// Vilka varianter varje läkarmall har. Mallarna själva står i journal.js.
export const MALLVARIANTER = {
  Mottagningsanteckning: ['telefon', 'digital', 'psykiatri', 'kronisk', 'barn', 'aldre', 'palliativ', 'graviditet'],
  Daganteckning: ['psykiatri', 'barn', 'aldre', 'palliativ', 'graviditet'],
  Inskrivningsanteckning: ['psykiatri', 'barn', 'aldre', 'palliativ', 'graviditet'],
  Akutanteckning: ['psykiatri', 'barn', 'aldre', 'graviditet'],
};
// Gränserna för äldre med många läkemedel följer Socialstyrelsens föreskrift om läkemedelsgenomgång (HSLF-FS 2017:37),
// som gäller patienter som är 75 år eller äldre och har minst fem läkemedel.
export const ALDRE_ALDER = 75;
export const ALDRE_LAKEMEDEL = 5;
const PALLIATIV = /palliativ|brytpunkt/i;

// Alla undersökord i varianterna, för fackspråket och kontrollen av mallarnas sökord.
export const VARIANTSOKORD = [...new Set(Object.values(VARIANTER).flatMap(v => v.sokord))];

export const varianterFor = (typ) => (typeof typ === 'string' && Object.hasOwn(MALLVARIANTER, typ) ? MALLVARIANTER[typ].map(id => VARIANTER[id]) : []);

function foraldrar(db, enhetId) {
  const ut = [];
  let e = enhetId && db.query('SELECT id, namn, forald_id FROM enheter WHERE id = ?').get(enhetId);
  for (let i = 0; e && i < 10; i++) { ut.push(e); e = e.forald_id ? db.query('SELECT id, namn, forald_id FROM enheter WHERE id = ?').get(e.forald_id) : null; }
  return ut;
}
export const arPsykiatri = (db, enhetId) => foraldrar(db, vardenhetFor(db, enhetId)).some(e => /psykiatri/i.test(e.namn));
export const arPrimarvard = (db, enhetId) => foraldrar(db, enhetId).some(e => e.id === 'primarvard' || /^primärvård/i.test(e.namn));

// Varianterna som systemet väljer för mallen, med varför på vanlig svenska. kontakt är svaret från vardkontakt.aktuell
// ({ vardkontakt, ny }), diagnoser de diagnoser som den som skriver får se och patient { alder, lakemedel, graviditet }
// med åldern, antalet aktuella läkemedel som syns och om en pågående graviditet syns. Bara det som syns räknas.
export function valjVarianter(db, personal, typ, { kontakt = null, diagnoser = [], patient = {} } = {}) {
  const ut = [];
  const v = kontakt?.vardkontakt ?? null;
  const kontaktsatt = v?.kontaktsatt ?? kontakt?.ny?.kontaktsatt ?? null;
  const orsak = (v ? v.orsak : kontakt?.ny?.orsak) ?? '';
  for (const variant of varianterFor(typ)) {
    if (variant.id === 'telefon' && kontaktsatt === 'telefon') {
      ut.push({ id: 'telefon', varfor: 'Kontakten är ett telefonsamtal, så systemet har valt telefonvarianten utan status och med råd och egenvård.' });
    } else if (variant.id === 'psykiatri') {
      if (arPsykiatri(db, personal.enhet_id)) ut.push({ id: 'psykiatri', varfor: 'Du skriver på en psykiatrisk vårdenhet, så psykiskt status och suicidriskbedömning finns med.' });
      else if (SUICID.test(orsak)) ut.push({ id: 'psykiatri', varfor: 'Kontaktorsaken handlar om suicidtankar, så psykiskt status och suicidriskbedömning finns med.' });
    } else if (variant.id === 'digital' && ['video', 'chatt'].includes(kontaktsatt)) {
      ut.push({ id: 'digital', varfor: 'Kontakten är ett videosamtal, så systemet har valt den digitala varianten med det som syntes i samtalet och råd i stället för status.' });
    } else if (variant.id === 'barn' && Number.isFinite(patient.alder) && patient.alder < 18) {
      ut.push({ id: 'barn', varfor: `Patienten är ${patient.alder} år, så tillväxt, vaccinationer och utveckling finns med. Tillväxten och vaccinationerna står i underlaget.` });
    } else if (variant.id === 'aldre' && Number.isFinite(patient.alder) && patient.alder >= ALDRE_ALDER && (patient.lakemedel ?? 0) >= ALDRE_LAKEMEDEL) {
      ut.push({ id: 'aldre', varfor: `Patienten är ${patient.alder} år och har ${patient.lakemedel} läkemedel i läkemedelslistan, så läkemedelsgenomgång och fallrisk finns med (HSLF-FS 2017:37).` });
    } else if (variant.id === 'palliativ' && (diagnoser.some(d => /^Z51\.5/.test(String(d.kod ?? ''))) || PALLIATIV.test(orsak))) {
      ut.push({ id: 'palliativ', varfor: diagnoser.some(d => /^Z51\.5/.test(String(d.kod ?? ''))) ? 'Patienten har palliativ vård bland diagnoserna, så brytpunktssamtal och symtomskattning finns med.' : 'Kontaktorsaken handlar om palliativ vård, så brytpunktssamtal och symtomskattning finns med.' });
    } else if (variant.id === 'graviditet' && patient.graviditet) {
      ut.push({ id: 'graviditet', varfor: 'Patienten har en pågående graviditet i graviditetsjournalen, så graviditeten och läkemedel under graviditet finns med.' });
    } else if (variant.id === 'kronisk' && arPrimarvard(db, personal.enhet_id)) {
      const har = KRONISKA.map(k => ({ k, d: diagnoser.find(d => k.kod.test(String(d.kod ?? ''))) })).filter(x => x.d);
      if (har.length) {
        ut.push({
          id: 'kronisk', utfallda: har.map(x => x.k.sokord),
          varfor: `Patienten har ${lista(har.map(x => x.k.text))} bland diagnoserna, så de sökorden är utfällda. Övriga kroniska sjukdomar fälls ut med ett klick.`,
        });
      }
    }
  }
  return ut;
}
const lista = (l) => (l.length <= 1 ? l.join('') : `${l.slice(0, -1).join(', ')} och ${l.at(-1)}`);

// Läsordningen APSO: Bedömning och Åtgärd först, sedan resten i den ordning de skrevs. Ändrar aldrig det sparade.
export const LAS_FORST = ['Bedömning', 'Åtgärd'];
export function lasordning(sokord) {
  if (!Array.isArray(sokord) || !sokord.some(s => LAS_FORST.includes(s.sokord))) return sokord;
  return [...LAS_FORST.flatMap(n => sokord.filter(s => s.sokord === n)), ...sokord.filter(s => !LAS_FORST.includes(s.sokord))];
}

// Skrivordningen i vårdenhetens förval: 'apso' sätter Bedömning och Åtgärd först i läkarmallarna, annars mallens ordning.
export const SKRIVORDNINGAR = { mall: 'Mallens ordning, med kontaktorsak och anamnes först', apso: 'Bedömning och åtgärd först' };
export function skrivordning(sokord, ordning) {
  if (ordning !== 'apso') return sokord;
  const namn = (s) => (typeof s === 'string' ? s : s?.namn);
  if (!sokord.some(s => LAS_FORST.includes(namn(s)))) return sokord;
  return [...LAS_FORST.flatMap(n => sokord.filter(s => namn(s) === n)), ...sokord.filter(s => !LAS_FORST.includes(namn(s)))];
}
