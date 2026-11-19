// Runda 13, r1: guidade uppdrag för testare i den publika testinbjudan (#/testa). Syftet är att personal som arbetar i
// Cosmic eller i ett annat journalsystem gör samma arbetsflöden i Vårdkällan och säger var det är lättare, ungefär lika
// eller svårare, och vad som saknas.
//
// Uppdragen följer så långt det går Sussas 34 användbarhetstestfall (sussa-testfall.js, Bilaga F1:4), som regionerna
// använde när Cosmic utvärderades, med Sussas påhittade testpatienter (sussa-demo.js), så att jämförelsen gäller samma
// sak. Där testfallen saknar ett vardagligt flöde för rollen finns ett eget uppdrag, utan Sussa-nummer.
//
// Systemet bockar av ett uppdrag själv när det har hänt i sandlådan. Kontrollen görs på servern och räknar bara rader
// som rollens demoperson har skapat eller ändrat efter att uppdragen startade (rader med id över baslinjen, eller en tid
// efter starten för rader som ändras). Ett uppdrag som bara går ut på att hitta något (ett provsvar, en diagnos, en
// händelse) har en fråga, och servern prövar svaret mot Sussas rätta svar. Testaren kan också hoppa över ett uppdrag.
// Efter varje uppdrag kommer jämförelsefrågan (synpunkter.js, tabellen jamforelser).
//
// Tillståndet ligger i sandlådan (tabellerna testare och testare_uppdrag), så att det följer med när sandlådan sparas.
// Svaren som rör uppdragen innehåller aldrig patientuppgifter ur sandlådan: bara uppdragens egna texter och status.
import { Fel } from './db.js';
import { TESTFALL } from './sussa-testfall.js';
import * as sussaDemo from './sussa-demo.js';
import * as tidbok from './tidbok.js';
import { vardenhetFor } from './atkomst.js';
import { YRKEN, SYSTEM, AR, VARDFORM, HOPPADE_OVER } from '../public/js/synpunkt-regler.js';
import { profil as provaProfil } from './synpunkter.js';
// Runda 18, r1: första passet (forsta-pass.js).
import * as forstaPass from './forsta-pass.js';
import { KANALER } from '../public/js/inbjudan-regler.js';

export function sakra(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS testare (
    id INTEGER PRIMARY KEY CHECK (id = 1), testroll TEXT NOT NULL, start TEXT NOT NULL, bas TEXT NOT NULL, profil TEXT NOT NULL DEFAULT '{}'
  );
  CREATE TABLE IF NOT EXISTS testare_uppdrag (
    uppdrag TEXT PRIMARY KEY, status TEXT NOT NULL, tid TEXT NOT NULL, tid_s INTEGER, besvarad INTEGER NOT NULL DEFAULT 0,
    CHECK (status IN ('klar', 'hoppade_over'))
  );`);
  // Runda 18, r1: första passet. pass är uppdraget i passet, matning testarens svar på frågan om mätning ('ja' eller
  // 'nej', tomt innan frågan är besvarad), pass_start när passet började räknas, pass_rad raden i synpunktsdatabasen,
  // pass_resultat återkopplingen, pass_sus om SUS är besvarat ('ja') eller överhoppat ('nej') och pass_vidare att
  // testaren har gått vidare till nästa uppdrag.
  const kol = db.query("SELECT name FROM pragma_table_info('testare')").all().map(k => k.name);
  for (const [k, typ] of [['pass', "TEXT NOT NULL DEFAULT ''"], ['matning', "TEXT NOT NULL DEFAULT ''"], ['pass_start', 'TEXT'], ['pass_rad', 'TEXT'], ['pass_resultat', 'TEXT'], ['pass_sus', "TEXT NOT NULL DEFAULT ''"], ['pass_vidare', 'INTEGER NOT NULL DEFAULT 0'],
    // Tillägg 2026-11-19: kanalen som besökaren kom via, och om det genomförda passet är räknat på kanalen.
    ['inbjudan_kanal', 'TEXT'], ['inbjudan_klar', 'INTEGER NOT NULL DEFAULT 0']]) {
    if (!kol.includes(k)) db.exec(`ALTER TABLE testare ADD COLUMN ${k} ${typ}`);
  }
  return db;
}

const harTabell = (db, t) => Boolean(db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t));

// Kontrollerna. u är { av, start, bas }: demopersonens id, starttiden och baslinjen per tabell.
// nya: minst antal nya rader av personen i tabellen. andrade: rader som personen har ändrat efter starten.
const nya = (tabell, avKol, extra = '', antal = 1) => ({ tabeller: [tabell], prova: (db, u) => db.query(`SELECT count(*) AS n FROM ${tabell} t WHERE t.rowid > ? AND t.${avKol} = ? ${extra}`).get(u.bas[tabell] ?? 0, u.av).n >= antal });
const andrade = (tabell, avKol, tidKol, extra = '') => ({ tabeller: [tabell], prova: (db, u) => Boolean(db.query(`SELECT 1 FROM ${tabell} t WHERE t.${avKol} = ? AND t.${tidKol} >= ? ${extra} LIMIT 1`).get(u.av, u.start)) });
const nyLogg = (villkor, kol = 'personal_id') => ({ tabeller: ['atkomstlogg'], prova: (db, u) => Boolean(db.query(`SELECT 1 FROM atkomstlogg WHERE id > ? AND ${kol} = ? AND resultat = 'tillaten' AND ${villkor} LIMIT 1`).get(u.bas.atkomstlogg ?? 0, u.av)) });
const nagon = (...k) => ({ tabeller: k.flatMap(x => x.tabeller), prova: (db, u) => k.some(x => x.prova(db, u)) });
const egen = (tabeller, prova) => ({ tabeller, prova });
// Ett uppdrag som går ut på att hitta något: frågan och vad som räknas som rätt svar.
const fraga = (text, ratt, rattText) => ({ fraga: text, ratt, rattText });
const innehaller = (...ord) => (s) => ord.every(o => new RegExp(o, 'i').test(s));
const minstAv = (n, ...ord) => (s) => ord.filter(o => new RegExp(o, 'i').test(s)).length >= n;

// Uppdragets text: Sussas mål för testfallet när uppdraget följer ett testfall, annars den egna texten.
const sussa = (nr) => TESTFALL.find(t => t.nr === nr);

const L = 'lak-kard';
// Uppdragen per testroll, i den ordning en arbetsdag har dem.
export const TESTROLLER = [
  {
    id: 'lakare-sjukhus', knapp: 'Läkare på sjukhus', yrke: 'lakare', demoroll: L, sussaData: true, avdelning: true,
    om: 'Du arbetar som Sara Lindqvist, läkare på kardiologiska kliniken. Avdelning 72 motsvarar Sussas medicinavdelning.',
    uppdrag: [
      { id: 'forsta-patient', titel: 'Ta emot dagens första patient', text: ['Öppna journalen för en av dina patienter i arbetslistan och läs den senaste anteckningen.'], klar: nyLogg("patient_id IS NOT NULL AND handling IN ('las_oversikt', 'las_journal') AND resurs LIKE '/api/patient/%'") },
      { id: '3.4', sussa: '3.4', ...fraga('Vilket värde hade PK-provet?', (s) => /0[,.]9\b/.test(s), 'PK 0,9 INR') },
      { id: '1.2', sussa: '1.2', klar: nya('ordinationer', 'ordinerad_av', '', 2) },
      { id: 'varning', titel: 'Ordinera ett läkemedel och ta ställning till varningen', text: ['Ordinera ibuprofen vid behov till Gunnar Åkesson, som har Waran. Läs varningen från systemet och bestäm om ordinationen ska göras.'], klar: nya('ordinationer', 'ordinerad_av', 'AND t.kvitterade_varningar IS NOT NULL') },
      { id: '3.1', sussa: '3.1', klar: nya('labb_bestallningar', 'ansvarig_id') },
      { id: '2.3', sussa: '2.3', klar: nagon(andrade('remisser', 'bedomd_av', 'bedomd_tid'), nya('remiss_fordelningar', 'av'), andrade('remisskonferens_remisser', 'lagd_av', 'lagd_tid')) },
      { id: '2.6', sussa: '2.6', klar: andrade('remisser', 'besvarad_av', 'besvarad_tid') },
      { id: '2.1', sussa: '2.1', klar: nya('remisser', 'avsandare_id') },
      { id: '7.3', sussa: '7.3', ...fraga('Vilken händelse har Bertil Danielsson klockan 15?', innehaller('ekg'), 'EKG') },
      { id: '6.3', sussa: '6.3', ...fraga('Vilken var huvuddiagnosen vid det tidigare vårdtillfället?', innehaller('sepsis'), 'sepsis') },
      { id: '4.3', sussa: '4.3', klar: nya('anteckningar', 'forfattare_id', "AND t.typ = 'Epikris' AND t.status = 'signerad'") },
      { id: '7.4', sussa: '7.4', ...fraga('Vilken arbetsuppgift har läkaren klockan 11?', innehaller('infektion'), 'infektionskonsult') },
    ],
  },
  {
    id: 'lakare-primarvard', knapp: 'Läkare i primärvården', yrke: 'lakare', demoroll: 'lak-vc', sussaData: true,
    om: 'Du arbetar som Per Holm, distriktsläkare på Vårdcentralen Tybble, som motsvarar Sussas vårdcentral.',
    uppdrag: [
      { id: '5.6', sussa: '5.6', ...fraga('Hur många av dina patienter har kommit i dag?', (s) => /\b5\b|\bfem\b/i.test(s), 'fem') },
      { id: 'forsta-patient', titel: 'Ta emot dagens första patient', text: ['Öppna journalen för en av patienterna som har kommit och läs den senaste anteckningen.'], klar: nyLogg("patient_id IS NOT NULL AND handling IN ('las_oversikt', 'las_journal') AND resurs LIKE '/api/patient/%'") },
      { id: '4.2', sussa: '4.2', klar: nya('matvarden', 'registrerad_av', '', 2) },
      { id: '4.1', sussa: '4.1', klar: egen(['tobaksvanor', 'anteckningar'], (db, u) => Boolean(db.query('SELECT 1 FROM tobaksvanor t JOIN anteckningar a ON a.id = t.anteckning_id WHERE t.anteckning_id > ? AND a.forfattare_id = ? LIMIT 1').get(u.bas.anteckningar ?? 0, u.av))) },
      { id: '1.1', sussa: '1.1', klar: nya('ordinationer', 'ordinerad_av', '', 2) },
      { id: '3.1', sussa: '3.1', klar: nya('labb_bestallningar', 'ansvarig_id') },
      { id: '3.5', sussa: '3.5', klar: nya('kontrollordinationer', 'ordinerad_av') },
      { id: '2.1', sussa: '2.1', klar: nya('remisser', 'avsandare_id') },
      { id: 'kvittera', titel: 'Kvittera ett remissvar', text: ['Ett svar på en remiss som du har skickat har kommit. Läs det och kvittera att du har sett det.'], klar: andrade('remisser', 'svar_kvitterat_av', 'svar_kvitterat_tid') },
      { id: '4.4', sussa: '4.4', klar: egen(['anteckningar'], (db, u) => Boolean(db.query("SELECT 1 FROM anteckningar WHERE signerad_av = ? AND signerad_tid >= ? AND patient_id IN ('sus08', 'sus09', 'sus10') LIMIT 1").get(u.av, u.start))
        && !db.query("SELECT 1 FROM anteckningar WHERE forfattare_id = ? AND status = 'utkast' AND patient_id IN ('sus08', 'sus09', 'sus10') LIMIT 1").get(u.av)) },
    ],
  },
  {
    id: 'sjukskoterska', knapp: 'Sjuksköterska', yrke: 'sjukskoterska', demoroll: 'ssk-kard', sussaData: true, avdelning: true,
    om: 'Du arbetar som Johan Ek, sjuksköterska på avdelning 72, som motsvarar Sussas medicinavdelning.',
    uppdrag: [
      { id: '7.1', sussa: '7.1', ...fraga('Vilka händelser äger rum klockan 11?', minstAv(1, 'provtagning', 'sjukgymnastik'), 'provtagning och sjukgymnastik') },
      { id: '6.1', sussa: '6.1', klar: nya('vardtillfallen', 'inskriven_av') },
      { id: '4.2', sussa: '4.2', klar: nya('matvarden', 'registrerad_av', '', 2) },
      { id: 'news2', titel: 'Gör en NEWS2-kontroll', text: ['En av patienterna på avdelningen verkar sämre. Registrera en NEWS2-kontroll och se vad systemet föreslår.'], klar: nya('atgarder', 'av', "AND t.kod = 'QD008'") },
      { id: '1.4', sussa: '1.4', klar: nya('administreringar', 'utford_av', "AND t.status = 'given'") },
      { id: '1.3', sussa: '1.3', klar: nya('muntliga_ordinationer', 'mottagen_av') },
      { id: '3.2', sussa: '3.2', klar: nya('labb_bestallningar', 'registrerad_av', 'AND t.pa_uppdrag = 1') },
      { id: '3.3', sussa: '3.3', klar: andrade('labb_prov', 'provtagen_av', 'provtagen_tid') },
      { id: '4.1', sussa: '4.1', titel: 'Skapa anteckning', text: ['Skriv och signera en omvårdnadsanteckning, eller dokumentera tobaksvanorna för Berit Strandhall som i Sussas testfall 4.1.'], klar: nya('anteckningar', 'forfattare_id', "AND t.status = 'signerad'") },
      { id: '6.2', sussa: '6.2', klar: nya('vardtillfalle_handelser', 'av', "AND t.typ = 'flytt'") },
      { id: 'meddelande', titel: 'Svara på ett meddelande från en patient', text: ['En patient har skrivit en fråga till mottagningen i Min journal. Svara på den.'], klar: nya('invanarmeddelanden', 'personal_id', "AND t.fran = 'vard'") },
      { id: 'utskrivning', titel: 'Skriv ut en patient', text: ['En av patienterna på avdelningen går hem i dag. Skriv ut patienten.'], klar: nya('vardtillfalle_handelser', 'av', "AND t.typ = 'utskrivning'") },
    ],
  },
  {
    id: 'underskoterska', knapp: 'Undersköterska', yrke: 'underskoterska', demoroll: 'usk-kard', sussaData: true, avdelning: true,
    om: 'Du arbetar som Amira Haddad, undersköterska på avdelning 72, som motsvarar Sussas medicinavdelning.',
    uppdrag: [
      { id: '7.2', sussa: '7.2', ...fraga('Vilka händelser äger rum klockan 11 för de fyra patienterna?', minstAv(2, 'kontrast', 'fast', 'omläggning', 'teamrond'), 'dricka kontrast, börja fasta, såromläggning och teamrond') },
      { id: '4.2', sussa: '4.2', klar: nya('matvarden', 'registrerad_av', '', 2) },
      { id: 'vatskebalans', titel: 'Registrera vätskebalansen', text: ['Registrera hur mycket en patient på avdelningen har druckit eller kissat.'], klar: nya('vatskebalans', 'registrerad_av') },
      { id: 'dos', titel: 'Ge en dos med din delegering', text: ['Ge en tablett som en patient ska ha nu. Du har en delegering för tabletter.'], klar: nya('administreringar', 'utford_av', "AND t.status = 'given'") },
      { id: '3.2', sussa: '3.2', klar: nya('labb_bestallningar', 'registrerad_av', 'AND t.pa_uppdrag = 1') },
      { id: '3.3', sussa: '3.3', klar: andrade('labb_prov', 'provtagen_av', 'provtagen_tid') },
      { id: '3.4', sussa: '3.4', ...fraga('Vilket värde hade PK-provet?', (s) => /0[,.]9\b/.test(s), 'PK 0,9 INR') },
    ],
  },
  {
    id: 'barnmorska', knapp: 'Barnmorska', yrke: 'barnmorska', demoroll: 'bm-uso', sussaData: false,
    om: 'Du arbetar som Sofia Ekdahl, barnmorska på förlossningen. Sussas testfall har inga uppdrag för barnmorskor, så uppdragen här är förlossningens vanliga arbetsflöden.',
    uppdrag: [
      { id: 'oversikt', titel: 'Ta emot på förlossningen', text: ['Se vilka kvinnor som är inne på förlossningen och öppna journalen för den som föder nu.'], klar: nyLogg('patient_id IS NOT NULL') },
      { id: 'ctg', titel: 'Bedöm CTG', text: ['Bedöm det pågående CTG:t för kvinnan som föder.'], klar: nya('ctg_bedomning', 'av') },
      { id: 'partogram', titel: 'Fyll i partogrammet', text: ['Registrera hur mycket modermunnen har öppnat sig.'], klar: nya('partogram', 'av') },
      { id: 'smartlindring', titel: 'Registrera smärtlindring', text: ['Kvinnan vill ha lustgas. Registrera smärtlindringen.'], klar: nya('smartlindring', 'av') },
      { id: 'fodelse', titel: 'Registrera barnet', text: ['Barnet är fött. Registrera kön, vikt, längd, huvudomfång och Apgar.'], klar: nya('forlossning_barn', 'av') },
      { id: 'fodelseanmalan', titel: 'Gör födelseanmälan', text: ['Gör födelseanmälan för ett barn som saknar en.'], klar: nya('fodelseanmalan', 'av') },
      { id: 'bb', titel: 'Gör en kontroll på BB', text: ['Gör en kontroll av en mamma eller ett barn på BB.'], klar: nya('bb_kontroller', 'av') },
    ],
  },
  {
    id: 'vardadministrator', knapp: 'Vårdadministratör eller medicinsk sekreterare', yrke: 'vardadministrator', demoroll: 'adm-kard', sussaData: true,
    om: 'Du arbetar som Karin Berg, vårdadministratör på kardiologiska kliniken, som motsvarar Sussas mottagning.',
    uppdrag: [
      // Runda 13: registreringen i åtkomstloggen, inte ankomsttiden. En ankomst som registreras i efterhand räknas från
      // den bokade tiden, som kan ligga före testets start (tidbok.checkaInRad).
      { id: '5.5', sussa: '5.5', klar: nyLogg("handling = 'checka_in' AND resurs LIKE 'bokning:%:incheckad'") },
      { id: '5.7', sussa: '5.7', klar: nya('vardkontakter', 'skapad_av') },
      { id: '5.1', sussa: '5.1', klar: nya('bokningar', 'bokad_av', 'AND t.ersatter_id IS NULL AND t.vantelista_id IS NULL AND NOT EXISTS (SELECT 1 FROM teambesok_deltagare d WHERE d.bokning_id = t.id) AND (SELECT platser FROM tider WHERE id = t.tid_id) = 1') },
      { id: '5.2', sussa: '5.2', klar: egen(['bokningar', 'teambesok_deltagare'], (db, u) => Boolean(db.query('SELECT 1 FROM bokningar b JOIN teambesok_deltagare d ON d.bokning_id = b.id WHERE b.id > ? AND b.bokad_av = ? LIMIT 1').get(u.bas.bokningar ?? 0, u.av))) },
      { id: '5.3', sussa: '5.3', klar: nya('bokningar', 'bokad_av', 'AND (SELECT platser FROM tider WHERE id = t.tid_id) > 1') },
      { id: '5.4', sussa: '5.4', klar: andrade('bokningar', 'andrad_av', 'andrad', "AND t.status = 'avbokad'") },
      { id: '5.8', sussa: '5.8', klar: nya('bokningar', 'bokad_av', 'AND t.vantelista_id IS NOT NULL') },
      { id: '2.2', sussa: '2.2', klar: nya('remiss_pa_uppdrag', 'skriven_av') },
      { id: '2.4', sussa: '2.4', klar: nagon(nya('remiss_fordelningar', 'av'), andrade('remisskonferens_remisser', 'lagd_av', 'lagd_tid')) },
      { id: '2.5', sussa: '2.5', klar: andrade('remiss_extern', 'registrerad_av', 'registrerad_tid') },
      { id: 'betala', titel: 'Ta betalt', text: ['En patient som har checkat in ska betala sin avgift.'], klar: nya('betalningar', 'av', "AND t.satt IN ('kort', 'faktura')") },
      { id: 'dagsavslut', titel: 'Gör dagsavslut i kassan', text: ['Dagen är slut. Stäm av kassan och gör dagsavslutet.'], klar: nya('kassaavslut', 'kassor') },
    ],
  },
  {
    id: 'fysioterapeut', knapp: 'Fysioterapeut och andra yrken', yrke: 'paramedicin', demoroll: 'fys-kard', sussaData: true, avdelning: true,
    om: 'Du arbetar som Jenny Holmberg, fysioterapeut på kardiologiska mottagningen. Hon spelar Sussas paramedicinare, alltså också arbetsterapeut, dietist och kurator.',
    uppdrag: [
      { id: '7.1', sussa: '7.1', ...fraga('Vilka händelser äger rum klockan 11?', minstAv(1, 'provtagning', 'sjukgymnastik'), 'provtagning och sjukgymnastik') },
      { id: '2.3', sussa: '2.3', klar: nagon(andrade('remisser', 'bedomd_av', 'bedomd_tid'), nya('remiss_fordelningar', 'av'), andrade('remisskonferens_remisser', 'lagd_av', 'lagd_tid')) },
      { id: 'uppgift', titel: 'Bocka av dagens träning', text: ['Du har en planerad gångträning med en patient på avdelningen. Markera att den är gjord.'], klar: andrade('planerade_uppgifter', 'utford_av', 'utford') },
      { id: '4.1', sussa: '4.1', titel: 'Skapa anteckning', text: ['Skriv och signera en anteckning efter ett besök, eller dokumentera tobaksvanorna för Berit Strandhall som i Sussas testfall 4.1.'], klar: nya('anteckningar', 'forfattare_id', "AND t.status = 'signerad'") },
      { id: 'matvarde', titel: 'Registrera ett mätvärde', text: ['Registrera pulsen efter ett träningspass.'], klar: nya('matvarden', 'registrerad_av') },
      { id: '2.6', sussa: '2.6', klar: andrade('remisser', 'besvarad_av', 'besvarad_tid') },
      { id: '2.1', sussa: '2.1', klar: nya('remisser', 'avsandare_id') },
    ],
  },
  {
    id: 'systemforvaltare', knapp: 'Systemförvaltare', yrke: 'systemforvaltare', demoroll: 'sysf', sussaData: false,
    om: 'Du arbetar som Tomas Lindh, systemförvaltare. Sussas testfall har inga uppdrag för systemförvaltare, så uppdragen här är förvaltningens vanliga arbetsflöden. Ingen ändring gäller innan en andra systemförvaltare har godkänt den.',
    uppdrag: [
      { id: 'godkann', titel: 'Godkänn en ändring', text: ['Den andra systemförvaltaren har föreslagit en ändrad regel. Granska den och godkänn eller avslå den.'], klar: andrade('konfig_andringar', 'beslutad_av', 'beslutad') },
      { id: 'regel', titel: 'Föreslå en ändrad regel', text: ['Föreslå att en regel eller parameter ändras, till exempel hur många journalöppningar loggkontrollen tar stickprov på.'], klar: nya('konfig_andringar', 'foreslagen_av') },
      { id: 'mall', titel: 'Ändra en journalmall eller ett mätvärde', text: ['Föreslå en ny journalmall eller en ny mätvärdestyp, till exempel midjemått.'], klar: nya('struktur_versioner', 'foreslagen_av') },
      { id: 'formular', titel: 'Bygg ett formulär', text: ['Bygg ett enkelt bedömningsformulär och föreslå det.'], klar: nya('formular', 'foreslagen_av') },
      { id: 'kodverk', titel: 'Lägg in en ny utgåva av ett kodverk', text: ['Lägg in en ny utgåva av ett kodverk, till exempel några nya diagnoskoder.'], klar: nya('kodverk_utgavor', 'foreslagen_av') },
      { id: 'omorganisation', titel: 'Förbered ett namnbyte', text: ['Kardiologiska mottagningen ska byta namn nästa månad. Förbered namnbytet.'], klar: nya('omorganisationer', 'forberedd_av', "AND t.status <> 'avbruten'") },
      { id: 'lagring', titel: 'Kontrollera säkerhetskopian', text: ['Kontrollera att säkerhetskopian går att läsa tillbaka.'], klar: nya('lagringsmatningar', 'av') },
    ],
  },
  {
    id: 'patient', knapp: 'Patient i Min journal', yrke: 'patient', invanare: 'inv-p01', sussaData: false,
    om: 'Du är Gunnar Åkesson, en påhittad patient, och loggar in i Min journal med en simulerad e-legitimation.',
    uppdrag: [
      { id: 'las', titel: 'Läs din journal', text: ['Läs den senaste anteckningen i din journal.'], klar: nyLogg("handling = 'invanare_las' AND resurs LIKE 'min:anteckning%'", 'invanare_id') },
      { id: 'logglista', titel: 'Se vem som har läst din journal', text: ['Ta reda på vilka vårdenheter som har läst din journal och när.'], klar: nyLogg("handling = 'invanare_las' AND resurs = 'min:logglista'", 'invanare_id') },
      { id: 'egenmatning', titel: 'Lämna en egen mätning', text: ['Du har mätt blodtrycket hemma. Lämna värdet till vården.'], klar: egen(['matvarden', 'egenmatningar'], (db, u) => Boolean(db.query('SELECT 1 FROM egenmatningar WHERE matvarde_id > ? AND invanare_id = ? LIMIT 1').get(u.bas.matvarden ?? 0, u.av))) },
      { id: 'meddelande', titel: 'Skriv till vården', text: ['Skriv en fråga till mottagningen.'], klar: nya('meddelandetradar', 'skapad_av_invanare', "AND t.typ <> 'recept'") },
      { id: 'recept', titel: 'Förnya ett recept', text: ['Be om att få ett recept förnyat.'], klar: nya('meddelandetradar', 'skapad_av_invanare', "AND t.typ = 'recept'") },
      { id: 'tid', titel: 'Boka, boka om eller avboka en tid', text: ['Boka en tid, eller boka om eller avboka en tid som du har.'], klar: nyLogg("resurs LIKE 'min:bokning:%'", 'invanare_id') },
      { id: 'begaran', titel: 'Begär ett loggutdrag eller en spärr', text: ['Begär ett utdrag ur loggen, eller begär att uppgifter från en vårdenhet spärras.'], klar: nya('begaran', 'invanare_id') },
    ],
  },
];

// Uppdragets titel och text: Sussas när uppdraget följer ett testfall och inte har en egen.
export function uppdragUt(u) {
  const t = u.sussa ? sussa(u.sussa) : null;
  return {
    id: u.id, sussa: u.sussa ?? null, titel: u.titel ?? t?.titel ?? u.id,
    text: u.text ?? t?.mal ?? [], ...(u.fraga ? { fraga: u.fraga } : {}),
    // Sussas slutvillkor visas bara när det inte avslöjar svaret på en fråga.
    ...(t?.slut && !u.fraga ? { slut: t.slut } : {}),
  };
}
const testroll = (id) => TESTROLLER.find(r => r.id === id) ?? null;
export const uppdragFor = (rollId, uppdragId) => testroll(rollId)?.uppdrag.find(u => u.id === uppdragId) ?? null;
export const namnFor = (rollId, uppdragId) => { const r = testroll(rollId); const u = uppdragFor(rollId, uppdragId); return u ? `${uppdragUt(u).titel}` : (r ? uppdragId : null); };

// Startsidan: rollerna med knapptext och antal uppdrag. Inget här rör en sandlåda.
export const rollerUt = () => TESTROLLER.map(r => ({ id: r.id, knapp: r.knapp, yrke: r.yrke, demoroll: r.demoroll ?? null, invanare: r.invanare ?? null, om: r.om, antal: r.uppdrag.length, sussa: r.uppdrag.filter(u => u.sussa).length }));
export const VAL = { yrken: YRKEN, system: SYSTEM, ar: AR, vardform: VARDFORM };

const lasTillstand = (db) => (harTabell(db, 'testare') ? db.query('SELECT * FROM testare WHERE id = 1').get() : null);
function maxRowid(db, tabell) {
  if (!harTabell(db, tabell)) return 0;
  return db.query(`SELECT COALESCE(MAX(rowid), 0) AS m FROM ${tabell}`).get().m;
}

// Startar uppdragen för en testroll i sandlådan. Sussas testdata läggs in för de roller vars uppdrag följer testfallen,
// och baslinjen tas efter det, så att bara det testaren själv gör räknas. Tidigare uppdrag i sandlådan glöms.
export function starta(db, body = {}, { nu = new Date(), passRad = null } = {}) {
  const r = typeof body.testroll === 'string' ? testroll(body.testroll) : null;
  if (!r) throw new Fel(400, 'Välj en av yrkesrollerna.', 'ogiltig', { falt: ['testroll'] });
  const p = provaProfil(body.profil ?? {});
  // Runda 18, r1: första passet, och svaret på frågan om mätning om testaren redan har gett det.
  if (body.pass !== undefined && typeof body.pass !== 'boolean') throw new Fel(400, 'pass ska vara sant eller falskt.', 'ogiltig', { falt: ['pass'] });
  if (body.matning !== undefined && !['ja', 'nej'].includes(body.matning)) throw new Fel(400, 'Svara ja eller nej på frågan om mätning.', 'ogiltig', { falt: ['matning'] });
  const pass = body.pass === true ? forstaPass.passFor(r.id, r.demoroll) : null;
  if (body.via !== undefined && body.via !== null && !KANALER.some(([k]) => k === body.via)) throw new Fel(400, 'Kanalen för inbjudan känns inte igen.', 'ogiltig', { falt: ['via'] });
  sakra(db);
  if (r.sussaData) {
    const pers = db.query('SELECT * FROM personal WHERE id = ?').get(r.demoroll);
    if (r.avdelning) sussaDemo.laddaAvdelning(db, pers, { nu }); else sussaDemo.laddaTestdata(db, pers, { nu });
  }
  // Runda 13: kassans uppdrag (Ta betalt och Gör dagsavslut) har alltid en patient som har checkat in och ska betala,
  // också när testaren börjar på kvällen eller natten. Före baslinjen, så att ankomsten inte räknas som testarens.
  if (r.uppdrag.some(u => u.id === 'betala')) {
    const pers = db.query('SELECT * FROM personal WHERE id = ?').get(r.demoroll);
    tidbok.ankomstNu(db, vardenhetFor(db, pers.enhet_id));
  }
  const tabeller = new Set(['atkomstlogg']);
  for (const u of r.uppdrag) for (const t of u.klar?.tabeller ?? []) tabeller.add(t);
  const bas = Object.fromEntries([...tabeller].map(t => [t, maxRowid(db, t)]));
  db.transaction(() => {
    db.query('DELETE FROM testare_uppdrag').run();
    db.query('INSERT INTO testare (id, testroll, start, bas, profil) VALUES (1, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET testroll = excluded.testroll, start = excluded.start, bas = excluded.bas, profil = excluded.profil')
      .run(r.id, nu.toISOString(), JSON.stringify(bas), JSON.stringify(p));
    db.query("UPDATE testare SET pass = ?, matning = '', pass_start = NULL, pass_rad = NULL, pass_resultat = NULL, pass_sus = '', pass_vidare = 0, inbjudan_kanal = ?, inbjudan_klar = 0 WHERE id = 1").run(pass?.uppdrag ?? '', body.via ?? null);
  })();
  if (pass && body.matning) return samtycke(db, { matning: body.matning }, { nu, passRad });
  return tillstand(db, { nu });
}

// Runda 18, r1: svaret på frågan om mätning före passet. Frågan ställs en gång, och tiden räknas från svaret. Med ja
// skapas raden för passet i synpunktsdatabasen (passRad är forsta-pass.skapaRad med serverns sammanhang).
export function samtycke(db, body = {}, { nu = new Date(), passRad = null } = {}) {
  const { t, r, pass } = aktivtPass(db);
  if (!['ja', 'nej'].includes(body.matning)) throw new Fel(400, 'Svara ja eller nej på frågan om mätning.', 'ogiltig', { falt: ['matning'] });
  if (t.matning) throw new Fel(409, 'Du har redan svarat på frågan om mätning.', 'ogiltig');
  const rad = body.matning === 'ja' && passRad ? passRad({ testroll: r.id, pass, profil: profilFor(db) }) : null;
  db.query('UPDATE testare SET matning = ?, pass_start = ?, pass_rad = ? WHERE id = 1').run(body.matning, nu.toISOString(), rad);
  return tillstand(db, { nu });
}

function aktivtPass(db) {
  const t = lasTillstand(db);
  if (!t) throw new Fel(409, 'Välj en yrkesroll på startsidan för testare först.', 'ogiltig');
  const r = testroll(t.testroll);
  if (!t.pass || !r) throw new Fel(409, 'Det finns inget första pass för den här yrkesrollen just nu.', 'ogiltig');
  return { t, r, pass: forstaPass.passFor(r.id, r.demoroll) };
}

// Mätningen av passet. Räkningen kommer från klienten och prövas i forsta-pass.js. Om uppgiften är gjord, och tiden,
// bestämmer servern ur sandlådan. slut: false är ett delresultat medan passet pågår (när fliken stängs). avbruten: true
// avbryter passet, och uppdraget räknas som överhoppat. db2 och x är synpunktsdatabasen och serverns sammanhang.
export function matning(db, body = {}, { nu = new Date(), uppdatera } = {}) {
  const { t, r, pass } = aktivtPass(db);
  if (t.matning !== 'ja' || !t.pass_rad) throw new Fel(409, 'Passet mäts inte. Inget sparas.', 'ogiltig');
  if (t.pass_resultat) throw new Fel(409, 'Passet är redan rapporterat.', 'ogiltig');
  const m = forstaPass.provaMatning(r.id, body);
  kontrollera(db, r, t, nu);
  let s = db.query('SELECT * FROM testare_uppdrag WHERE uppdrag = ?').get(t.pass);
  if (m.avbruten && !s) { markera(db, r, t, t.pass, HOPPADE_OVER, nu); s = db.query('SELECT * FROM testare_uppdrag WHERE uppdrag = ?').get(t.pass); }
  const klar = s?.status === 'klar';
  if (m.slut && !s) throw new Fel(409, 'Passet är inte klart än. Systemet bockar av uppgiften när den är gjord.', 'ogiltig');
  if (!m.slut && !m.avbruten && !s) {
    // Ett delresultat: raden uppdateras men passet pågår.
    uppdatera(t.pass_rad, m, { status: 'pagar', tidS: passTid(t, nu), nu });
    return [200, { tillstand: tillstand(db, { nu }) }];
  }
  const status = klar ? 'klar' : 'avbruten';
  const rad = uppdatera(t.pass_rad, m, { status, tidS: passTid(t, s ? new Date(s.tid) : nu), nu });
  const res = forstaPass.resultat(pass, { status, rad });
  db.query('UPDATE testare SET pass_resultat = ? WHERE id = 1').run(JSON.stringify(res));
  return [201, { resultat: res, tillstand: tillstand(db, { nu }) }];
}
const passTid = (t, slut) => Math.min(4 * 3600, Math.max(0, Math.round((slut.getTime() - Date.parse(t.pass_start)) / 1000)));

// SUS efter passet, eller att testaren inte vill svara. spara är forsta-pass.sparaSus med serverns sammanhang.
export function sus(db, body = {}, { nu = new Date(), spara } = {}) {
  const { t, r, pass } = aktivtPass(db);
  if (!db.query('SELECT 1 FROM testare_uppdrag WHERE uppdrag = ?').get(t.pass)) throw new Fel(409, 'Gör passet eller hoppa över det först.', 'ogiltig');
  if (t.pass_sus) throw new Fel(409, 'Du har redan svarat på påståendena efter passet.', 'ogiltig');
  if (body.hoppa === true) {
    db.query("UPDATE testare SET pass_sus = 'nej' WHERE id = 1").run();
    return [200, { tillstand: tillstand(db, { nu }) }];
  }
  const ut = spara(body.svar, { testroll: r.id, pass, profil: profilFor(db) });
  db.query("UPDATE testare SET pass_sus = 'ja' WHERE id = 1").run();
  return [201, { ...ut, tillstand: tillstand(db, { nu }) }];
}

// Tillägg 2026-11-19: när passet är klart räknas det på kanalen som besökaren kom via, en gång. markera är
// inbjudan.passKlar med serverns sammanhang.
export function inbjudanKlar(db, markera) {
  const t = lasTillstand(db);
  if (!t?.pass || !t.inbjudan_kanal || t.inbjudan_klar) return false;
  const s = db.query('SELECT status FROM testare_uppdrag WHERE uppdrag = ?').get(t.pass);
  if (s?.status !== 'klar') return false;
  markera(t.inbjudan_kanal);
  db.query('UPDATE testare SET inbjudan_klar = 1 WHERE id = 1').run();
  return true;
}

// Efter passet: vidare till nästa uppdrag. Vägledningen följer inte med.
export function vidare(db, { nu = new Date() } = {}) {
  const { t } = aktivtPass(db);
  if (!db.query('SELECT 1 FROM testare_uppdrag WHERE uppdrag = ?').get(t.pass)) throw new Fel(409, 'Gör passet eller hoppa över det först.', 'ogiltig');
  db.query('UPDATE testare SET pass_vidare = 1 WHERE id = 1').run();
  return tillstand(db, { nu });
}

// Passet som det visas för testaren. Inget här kommer ur sandlådans journaler.
function passUt(t, r, status) {
  if (!t.pass) return null;
  const p = forstaPass.passFor(r.id, r.demoroll);
  const fas = !t.matning ? 'samtycke' : status === 'kvar' ? 'pagar' : t.pass_vidare ? 'klar' : 'aterkoppling';
  let res = null;
  try { res = t.pass_resultat ? JSON.parse(t.pass_resultat) : null; } catch { res = null; }
  // Utan mätning finns bara Sussas budget och tidsklass att visa.
  if (!res && t.matning === 'nej' && status !== 'kvar') res = forstaPass.resultat(p, { status: status === 'klar' ? 'klar' : 'avbruten' });
  return { uppdrag: p.uppdrag, sussa: p.sussa ?? null, titel: p.titel, text: p.text, budget: p.budget, tidsklass: p.tidsklass, matning: t.matning || null, fas, resultat: res, sus: t.pass_sus || null };
}

export function sparaProfil(db, body = {}) {
  const t = lasTillstand(db);
  if (!t) throw new Fel(409, 'Välj en yrkesroll på startsidan för testare först.', 'ogiltig');
  const p = provaProfil(body);
  db.query('UPDATE testare SET profil = ? WHERE id = 1').run(JSON.stringify(p));
  return { profil: p };
}
export const profilFor = (db) => { const t = lasTillstand(db); try { return t ? JSON.parse(t.profil) : {}; } catch { return {}; } };

// Bockar av de uppdrag som har hänt i sandlådan. En kontroll som inte kan avgöras (till exempel en tabell som inte finns
// än) räknas som inte gjord.
function kontrollera(db, r, t, nu) {
  const u = { av: r.demoroll ?? r.invanare, start: t.start, bas: JSON.parse(t.bas) };
  const klara = new Map(db.query('SELECT * FROM testare_uppdrag').all().map(x => [x.uppdrag, x]));
  for (const up of r.uppdrag) {
    if (klara.has(up.id) || !up.klar) continue;
    let ok = false;
    try { ok = up.klar.prova(db, u); } catch { ok = false; }
    if (ok) markera(db, r, t, up.id, 'klar', nu);
  }
}
function senasteTid(db, t) {
  return db.query('SELECT max(tid) AS m FROM testare_uppdrag').get().m ?? t.start;
}
function markera(db, r, t, id, status, nu) {
  const tidS = Math.max(0, Math.round((nu.getTime() - Date.parse(senasteTid(db, t))) / 1000));
  db.query('INSERT OR IGNORE INTO testare_uppdrag (uppdrag, status, tid, tid_s) VALUES (?, ?, ?, ?)').run(id, status, nu.toISOString(), tidS);
}

// Tillståndet för panelen: uppdragen med status, det aktuella uppdraget och de uppdrag som väntar på jämförelsefrågan.
export function tillstand(db, { nu = new Date() } = {}) {
  const t = lasTillstand(db);
  if (!t) return { aktiv: false };
  const r = testroll(t.testroll);
  if (!r) return { aktiv: false };
  kontrollera(db, r, t, nu);
  const status = new Map(db.query('SELECT * FROM testare_uppdrag').all().map(x => [x.uppdrag, x]));
  // Runda 18, r1: passets uppdrag står först.
  const ordning = t.pass ? [...r.uppdrag.filter(u => u.id === t.pass), ...r.uppdrag.filter(u => u.id !== t.pass)] : r.uppdrag;
  const uppdrag = ordning.map(u => {
    const s = status.get(u.id);
    return { ...uppdragUt(u), status: s?.status ?? 'kvar', besvarad: Boolean(s?.besvarad) };
  });
  const aktuellt = uppdrag.find(u => u.status === 'kvar')?.id ?? null;
  return {
    aktiv: true, testroll: r.id, knapp: r.knapp, om: r.om, demoroll: r.demoroll ?? null, invanare: r.invanare ?? null,
    start: t.start, profil: profilFor(db), uppdrag, aktuellt,
    pass: passUt(t, r, status.get(t.pass)?.status ?? 'kvar'),
    attBesvara: uppdrag.filter(u => u.status !== 'kvar' && !u.besvarad).map(u => u.id),
    klara: uppdrag.filter(u => u.status === 'klar').length, hoppade: uppdrag.filter(u => u.status === HOPPADE_OVER).length,
  };
}

function aktivtUppdrag(db, id) {
  const t = lasTillstand(db);
  if (!t) throw new Fel(409, 'Välj en yrkesroll på startsidan för testare först.', 'ogiltig');
  const r = testroll(t.testroll);
  const up = r?.uppdrag.find(u => u.id === id);
  if (!up) throw new Fel(404, 'Uppdraget finns inte.', 'saknas');
  return { t, r, up };
}

// Svaret på ett uppdrag som går ut på att hitta något. Servern prövar det mot Sussas rätta svar.
export function svara(db, id, body = {}, { nu = new Date() } = {}) {
  const { t, r, up } = aktivtUppdrag(db, id);
  if (!up.fraga) throw new Fel(400, 'Det här uppdraget har ingen fråga. Systemet bockar av det när det är gjort.', 'ogiltig');
  const svar = typeof body.svar === 'string' ? body.svar.trim().slice(0, 200) : '';
  if (!svar) throw new Fel(400, 'Skriv vad du hittade.', 'ogiltig', { falt: ['svar'] });
  const ratt = up.ratt(svar);
  if (ratt) markera(db, r, t, id, 'klar', nu);
  return { ratt, text: ratt ? 'Det stämmer. Uppdraget är klart.' : 'Det stämmer inte med det rätta svaret i Sussas testdata. Leta igen, eller hoppa över uppdraget.', tillstand: tillstand(db, { nu }) };
}

export function hoppa(db, id, { nu = new Date() } = {}) {
  const { t, r } = aktivtUppdrag(db, id);
  markera(db, r, t, id, HOPPADE_OVER, nu);
  return tillstand(db, { nu });
}

// Jämförelsen efter ett uppdrag som är klart eller överhoppat. Uppdraget och dess status kommer från sandlådan.
// spara är synpunkter.sparaJamforelse med serverns sammanhang.
export function jamfor(db, id, body, spara, { nu = new Date() } = {}) {
  const { r, up } = aktivtUppdrag(db, id);
  const s = db.query('SELECT * FROM testare_uppdrag WHERE uppdrag = ?').get(id);
  if (!s) throw new Fel(409, 'Gör uppdraget eller hoppa över det först.', 'ogiltig');
  if (s.besvarad) throw new Fel(409, 'Du har redan svarat på frågan för det här uppdraget.', 'ogiltig');
  // Testaren vill inte svara: frågan ställs inte igen, och inget sparas.
  if (body?.hoppa === true) {
    db.query('UPDATE testare_uppdrag SET besvarad = 1 WHERE uppdrag = ?').run(id);
    return { nummer: null, tillstand: tillstand(db, { nu }) };
  }
  // Runda 18, r1: den som har sagt nej till mätning får ingen tid sparad.
  const t = lasTillstand(db);
  const ut = spara({ testroll: r.id, uppdrag: up.id, sussa: up.sussa ?? '', status: s.status, tidS: t?.matning === 'nej' ? null : s.tid_s, profil: profilFor(db) });
  db.query('UPDATE testare_uppdrag SET besvarad = 1 WHERE uppdrag = ?').run(id);
  return { ...ut, tillstand: tillstand(db, { nu }) };
}

export function avsluta(db) {
  if (harTabell(db, 'testare')) db.transaction(() => { db.query('DELETE FROM testare').run(); db.query('DELETE FROM testare_uppdrag').run(); })();
  return { aktiv: false };
}
