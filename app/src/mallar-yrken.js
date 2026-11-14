// Runda 15, r5 (F3, Sussa 3.1.3.5 och 12.1.1.7): mallar per yrke, och vilka yrken som skriver med vilka mallar.
//
// Systemet är experten. Varje yrke ser bara sina mallar, och systemet väljer mallen efter yrket: undersköterskan får
// observationsanteckningen, fysioterapeuten fysioterapianteckningen och sjuksköterskan omvårdnadsanteckningen med
// omvårdnadsprocessen (omvardnadsprocess.js). Ingen behöver veta vilken mall som är den rätta.
//
// Mallarna för rehabilitering och kurator är byggda kring funktion, aktivitet, mål, åtgärd och resultat, som i ICF
// (WHO:s Klassifikation av funktionstillstånd, funktionshinder och hälsa). Undersköterskans mall är kort: det som har
// observerats och det som har gjorts. Anteckningarna hör till omvårdnadens dokumentation, så att sjuksköterskan läser
// dem i sitt underlag, och de har samma behörighet, spärr och loggning som andra omvårdnadsanteckningar.
//
// Vilka yrken som får skriva och med vilka mallar bestämmer vårdgivaren. Det är parametrar i konfiguration.js
// (journal.yrkesmallar.<yrke>), som ändras med fyra ögon och giltighetsdatum. Det som följer av behörighetsmodellen går
// inte att ändra där: ett yrke kan bara få en mall i en kategori som yrket har behörighet att skriva i.
//
// Arbetsterapeut, kurator och dietist är inte inloggningsroller i demon. Deras mallar finns och kan ges till ett yrke
// som parameter, men ingen i demon har de yrkena.
//
// Modulen importerar inte konfiguration.js och journal.js när den läses in, så att de kan importera den.
import { Fel } from './db.js';
import { ROLLER } from './atkomst.js';

const mall = (typ, sokord, beskrivning) => ({ typ, kategori: 'omvardnad', sokord, yrkesmall: true, beskrivning });
export const OBSERVATION = mall('Observationsanteckning', ['Observation', 'Utförd åtgärd'],
  'Undersköterskans korta anteckning om det som har observerats och det som har gjorts. Sjuksköterskan ser den i sitt underlag.');
export const FYSIOTERAPI = mall('Fysioterapianteckning', ['Funktion', 'Aktivitet', 'Mål', 'Åtgärd', 'Resultat'],
  'Fysioterapeutens anteckning om kroppens funktion, vad patienten klarar att göra, målet, åtgärden och resultatet.');
export const ARBETSTERAPI = mall('Arbetsterapianteckning', ['Aktivitet', 'Funktion', 'Mål', 'Åtgärd', 'Resultat'],
  'Arbetsterapeutens anteckning om vad patienten klarar att göra i vardagen, funktionen, målet, åtgärden och resultatet.');
export const KURATOR = mall('Kuratorsanteckning', ['Sociala förhållanden', 'Psykiskt mående', 'Mål', 'Åtgärd', 'Resultat'],
  'Kuratorns anteckning om patientens sociala förhållanden och mående, målet, åtgärden och resultatet.');
export const DIETIST = mall('Dietistanteckning', ['Nutrition', 'Mål', 'Åtgärd', 'Resultat'],
  'Dietistens anteckning om nutritionen, målet, åtgärden och resultatet.');
export const MALLAR = [OBSERVATION, FYSIOTERAPI, ARBETSTERAPI, KURATOR, DIETIST];

// Yrkena och deras namn. Arbetsterapeut, kurator och dietist finns inte som roller i demon.
export const YRKEN = {
  lakare: 'Läkare', sjukskoterska: 'Sjuksköterska', underskoterska: 'Undersköterska', fysioterapeut: 'Fysioterapeut',
  arbetsterapeut: 'Arbetsterapeut', kurator: 'Kurator', dietist: 'Dietist',
};
const plural = { lakare: 'läkare', sjukskoterska: 'sjuksköterskor', underskoterska: 'undersköterskor', fysioterapeut: 'fysioterapeuter', arbetsterapeut: 'arbetsterapeuter', kurator: 'kuratorer', dietist: 'dietister' };

// Förvalet per yrke, i den ordning mallarna visas. Det första är yrkets huvudmall, som systemet väljer.
export const STANDARD = {
  lakare: ['Daganteckning', 'Mottagningsanteckning', 'Akutanteckning', 'Inskrivningsanteckning', 'Epikris', 'Omvårdnadsanteckning', 'Tobaksvanor', 'Levnadsvanor', 'Donationsanteckning'],
  sjukskoterska: ['Omvårdnadsanteckning', 'Tobaksvanor', 'Levnadsvanor'],
  underskoterska: ['Observationsanteckning'],
  fysioterapeut: ['Fysioterapianteckning', 'Tobaksvanor', 'Levnadsvanor'],
  arbetsterapeut: ['Arbetsterapianteckning'],
  kurator: ['Kuratorsanteckning'],
  dietist: ['Dietistanteckning'],
};
// Yrken som bara skriver med de mallar som står i deras lista, och inte med systemförvaltningens egna mallar eller
// formulär som inte uttryckligen är gjorda för yrket. Undersköterskans dokumentation är avgränsad, och vårdgivaren
// lägger till en mall för yrket med parametern.
export const ENDAST_LISTADE = new Set(['underskoterska']);

const journal = () => require('./journal.js');
const konfiguration = () => require('./konfiguration.js');
const handlingFor = (kategori) => (kategori === 'omvardnad' ? 'skriv_omvardnad' : 'skriv_journal');
// De inbyggda mallarna, efter typ.
const inbyggda = () => new Map(journal().MALLAR.map(m => [m.typ, m]));
// Yrken som finns som roller och kan skriva anteckningar, och därför har en parameter.
export const yrkenMedParameter = () => Object.keys(STANDARD).filter(y => Object.hasOwn(ROLLER, y));

// Parametern för ett yrke (konfiguration.js). Listan prövas mot de inbyggda mallarna och yrkets behörighet.
export function yrkesparameter(yrke) {
  return {
    omrade: 'strukturerad', rubrik: `Mallar som ${plural[yrke]} skriver med`, enhet: 'mallar', typ: 'lista', standard: [...STANDARD[yrke]], tomTillaten: true,
    anvands: 'mallar-yrken.js, journal.js och anteckningsformuläret',
    beskrivning: `Mallarna som ${plural[yrke]} får skriva anteckningar med, i den ordning de visas. Den första är yrkets huvudmall, som systemet väljer när inget annat passar bättre. En mall kan bara ges till ett yrke som har behörighet att skriva i mallens kategori.`,
    provaLista: (lista) => {
      const finns = inbyggda();
      const sett = new Set();
      for (const typ of lista) {
        const m = [...finns.values()].find(x => x.typ.toLocaleLowerCase('sv') === typ.toLocaleLowerCase('sv'));
        if (!m) return `${typ} är ingen av journalens mallar. Mallarna är ${[...finns.keys()].join(', ')}.`;
        if (sett.has(m.typ)) return `${m.typ} står två gånger.`;
        sett.add(m.typ);
        if (!(ROLLER[yrke] ?? []).includes(handlingFor(m.kategori))) {
          return `${YRKEN[yrke]} har inte behörighet att skriva ${m.kategori === 'omvardnad' ? 'omvårdnadsanteckningar' : 'läkaranteckningar'}, så ${m.typ} kan inte ges till yrket. Behörigheten följer patientdatalagen och ändras inte här.`;
        }
      }
      return null;
    },
    normalisera: (lista) => { const finns = [...inbyggda().keys()]; return lista.map(t => finns.find(x => x.toLocaleLowerCase('sv') === t.toLocaleLowerCase('sv')) ?? t); },
    effekt: (db, nytt, forra) => {
      const ut = [];
      for (const t of nytt.filter(x => !forra.includes(x))) ut.push(`${YRKEN[yrke]} kan skriva ${t}.`);
      for (const t of forra.filter(x => !nytt.includes(x))) ut.push(`${YRKEN[yrke]} kan inte längre skriva ${t}.`);
      if (!ut.length) ut.push('Samma mallar i en annan ordning. Den första är yrkets huvudmall.');
      if (!nytt.length) ut.push(`${YRKEN[yrke]} skriver inga anteckningar.`);
      ut.push('Anteckningar som redan är skrivna står kvar som de skrevs, och ett utkast kan signeras.');
      return ut;
    },
  };
}
export const parameterNyckel = (yrke) => `journal.yrkesmallar.${yrke}`;

// Mallarna som yrket får skriva med i dag, i ordning.
export function mallarForYrke(db, yrke, nu = new Date()) {
  if (!Object.hasOwn(STANDARD, yrke)) return [];
  if (!Object.hasOwn(ROLLER, yrke)) return [...STANDARD[yrke]];
  return konfiguration().varde(db, parameterNyckel(yrke), nu);
}

// Får personen skriva med mallen? mall är { typ, kategori, egen?, formular? }. En inbyggd mall prövas mot yrkets
// lista, en mall som systemförvaltningen har skapat mot kategorin, och ett formulär mot formulärets egna yrken.
export function far(db, personal, mall, nu = new Date()) {
  if (!personal || !mall) return false;
  if (inbyggda().has(mall.typ) && !mall.egen && !mall.formular) return mallarForYrke(db, personal.yrke, nu).includes(mall.typ);
  if (ENDAST_LISTADE.has(personal.yrke)) return Boolean(mall.formular?.definition?.roller?.includes(personal.yrke));
  return true;
}

// Stoppar en mall som yrket inte skriver med, och säger vem som skriver med den.
export function provaMall(db, personal, mall) {
  if (far(db, personal, mall)) return;
  const vem = Object.keys(STANDARD).filter(y => Object.hasOwn(ROLLER, y) && mallarForYrke(db, y).includes(mall.typ)).map(y => plural[y]);
  const egna = mallarForYrke(db, personal.yrke);
  const yrke = YRKEN[personal.yrke] ?? 'Din yrkesroll';
  throw new Fel(403, `${yrke} skriver inte ${mall.typ.toLowerCase()}${vem.length ? `, som skrivs av ${vem.join(' och ')}` : ''}. ${egna.length ? `Din mall är ${egna[0].toLowerCase()}.` : 'Din yrkesroll skriver inga anteckningar.'}`, 'nekad');
}

// Mallarna för en person i GET /api/mallar: bara de som personen får skriva med, yrkets egna först i yrkets ordning.
export function mallarForPerson(db, personal, mallar) {
  const ordning = personal ? mallarForYrke(db, personal.yrke) : [];
  const tillatna = mallar.filter(m => far(db, personal, m));
  const plats = (m) => { const i = m.egen || m.formular ? -1 : ordning.indexOf(m.typ); return i < 0 ? ordning.length : i; };
  return tillatna.map((m, i) => ({ m, i })).sort((a, b) => plats(a.m) - plats(b.m) || a.i - b.i).map(({ m }) => (ordning[0] === m.typ ? { ...m, huvudmall: true } : m));
}
