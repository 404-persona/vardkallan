// Runda 15, r4: underlaget bredvid sökorden och referenserna i anteckningen (granskningen av mallarna, F1, Sussa 3.1.7.1).
//
// Systemet vet redan kontaktorsaken, prioriteten ur triagen, mätvärdena och provsvaren, läkemedelsändringarna och
// diagnoserna. Underlaget visar det som hör till anteckningen bredvid skrivrutan: mätvärden och provsvar sedan förra
// anteckningen av samma slag med en pil för förändringen mot värdet före, läkemedel som är nya, ändrade eller
// utsatta under vårdkontakten eller sedan förra anteckningen, och de aktuella diagnoserna. Kontaktorsak och Prioritet
// fyller systemet i med källan, och användaren kan ändra dem.
//
// Ett värde förs in i texten med ett klick som en referens: texten står i anteckningen som systemet skrev den, med
// datum, och referensen sparas bredvid ({ typ, id, text }). Inget dras in i texten av sig självt, eftersom data som
// kopieras in gör anteckningarna längre utan att de säger mer. Servern prövar varje referens när anteckningen sparas:
// värdet måste finnas för patienten, den som skriver måste få se det, och texten måste vara den som systemet skriver
// för värdet och stå kvar i sökordet. Annars sparas texten utan referens, som om personen hade skrivit den själv.
//
// Allt räknas bara på det som den som skriver får se: spärrade vårdenheter, inre sekretess, skyddad identitet och
// aktiva val prövas av behörighetsmotorn för varje rad, på samma sätt som i journalen. Ett värde som inte syns ändrar
// varken pilarna, perioden eller texterna. En referens lämnas ut med typ och id bara i FHIR, och bara till den som får
// se resursen.
import { Fel } from './db.js';
import { kanRoll } from './atkomst.js';
import * as journal from './journal.js';
import * as undantag from './undantag.js';
import * as lakemedel from './lakemedel.js';
import * as vardkontakt from './vardkontakt.js';

const TZ = 'Europe/Stockholm';
const MANADER = ['jan', 'feb', 'mars', 'april', 'maj', 'juni', 'juli', 'aug', 'sep', 'okt', 'nov', 'dec'];
const DAG = 86400_000;
const delar = (t) => Object.fromEntries(new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
  .formatToParts(new Date(t)).map(p => [p.type, p.value]));
export const datumText = (t) => { const d = delar(t); return `${Number(d.day)} ${MANADER[Number(d.month) - 1]}`; };
export const tidText = (t) => { const d = delar(t); return `${datumText(t)} ${d.hour === '24' ? '00' : d.hour}.${d.minute}`; };

// Provsvaren skiljs från mätvärdena i underlaget. Övriga typer, också de som systemförvaltningen skapar, är mätvärden.
const PROVSVAR = new Set(['crp', 'egfr', 'kreatinin', 'hba1c', 'inr', 'ntprobnp', 'hb', 'glukos', 'kalium', 'troponin', 'tsh', 'lpk', 'tpk', 'natrium', 'kobalamin', 'folat', 'sr']);
export const REFERENSTYPER = ['matvarde', 'ordination', 'dosandring', 'diagnos', 'vardkontakt', 'akutbesok', 'vaccination'];
// Beslut 2026-11-14: för barn och unga visar underlaget den senaste tillväxten och vaccinationerna.
const TILLVAXT = ['langd', 'vikt', 'huvudomfang'];
const vaccinNamn = (v) => { try { return require('./bhv-program.js').vaccinRad(v.vaccin_id)?.namn ?? require('./vaccinationsprogram-regler.js').vaccinRad(v.vaccin_id)?.namn ?? null; } catch { return null; } };
const vaccinText = (v) => `${vaccinNamn(v) ?? `Vaccin ${v.atc}, dos ${v.dos}`} ${datumText(v.tid)} ${new Date(v.tid).getUTCFullYear()}`;
const synligaVaccinationer = (atk) => { try { return atk.filtrera(atk.db.query('SELECT * FROM vaccinationer WHERE patient_id = ? ORDER BY tid DESC, id DESC').all(atk.patientId), 'las_oversikt'); } catch { return []; } };
const MAX_REFERENSER = 30;
// Säkerhetsgranskningen efter runda 15: högst så många referenser i en hel anteckning, så att ett anrop med många sökord
// inte kan hålla servern sysselsatt.
export const MAX_REFERENSER_TOTALT = 60;

const tal = (v) => String(v).replace('.', ',');
function matvardeText(db, m) {
  const def = journal.mattypFor(db, m.typ);
  // Medvetandegrad, syrgas, smärta och GCS har systemets text, som redan säger vad värdet är.
  const b = journal.beskrivning(m)?.replace(/\.$/, '');
  const text = !b ? `${def?.namn ?? m.typ} ${tal(m.varde_num ?? m.varde)}${m.matt_enhet ? ` ${m.matt_enhet}` : ''}` : m.typ === 'medvetande' ? `Medvetandegrad ${b}` : b;
  return `${text} (${tidText(m.tid)})`.replace(/\s+/g, ' ').trim();
}
// Jämför två värden av samma typ. Blodtrycket jämförs med det systoliska.
function jamfor(m, forra) {
  if (!forra) return null;
  const v = (x) => (x.typ === 'blodtryck' ? Number(String(x.varde).split('/')[0]) : Number(x.varde_num ?? x.varde));
  const a = v(m);
  const b = v(forra);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return a > b ? 'upp' : a < b ? 'ned' : 'samma';
}
const PILTEXT = { upp: 'högre än förra', ned: 'lägre än förra', samma: 'samma som förra' };

const lmNamn = (db, o) => { const k = db.query('SELECT namn, styrka FROM katalog WHERE id = ?').get(o.lakemedel_id); return k ? `${k.namn}${k.styrka ? ` ${k.styrka}` : ''}` : 'Läkemedel'; };
const substans = (db, o) => db.query('SELECT substans, namn FROM katalog WHERE id = ?').get(o.lakemedel_id)?.substans ?? o.lakemedel_id;
// En ordination som sätts in högst en timme efter att samma substans sattes ut är en ändring. Bara ordinationerna som
// den som skriver får se (synliga) räknas, så att en dos från en spärrad vårdenhet aldrig hamnar i texten.
const NARA = 3600_000;
const foregangare = (db, o, synliga) => synliga.filter(x => x.id !== o.id && x.status === 'utsatt' && x.utsatt_tid && substans(db, x) === substans(db, o) && Math.abs(Date.parse(o.skapad) - Date.parse(x.utsatt_tid)) <= NARA)
  .sort((a, b) => (a.utsatt_tid < b.utsatt_tid ? 1 : -1))[0] ?? null;
const efterfoljare = (db, o, synliga) => synliga.find(x => x.id !== o.id && o.utsatt_tid && substans(db, x) === substans(db, o) && Math.abs(Date.parse(x.skapad) - Date.parse(o.utsatt_tid)) <= NARA) ?? null;
function ordinationText(db, o, synliga) {
  const fore = o.kalla === 'vardkallan' ? foregangare(db, o, synliga) : null;
  if (fore) return `${lmNamn(db, o)} ändrad ${datumText(o.skapad)} från ${fore.dosering.toLowerCase()} till ${o.dosering.toLowerCase()}`;
  if (o.status === 'utsatt' && o.utsatt_tid) return `${lmNamn(db, o)} utsatt ${datumText(o.utsatt_tid)}${o.utsatt_orsak ? `: ${o.utsatt_orsak.toLowerCase()}` : ''}`;
  return `${lmNamn(db, o)} insatt ${datumText(o.skapad)}: ${o.dosering.toLowerCase()}`;
}
function dosandringText(db, d) {
  const o = db.query('SELECT * FROM ordinationer WHERE id = ?').get(d.ordination_id);
  return `${o ? lmNamn(db, o) : 'Läkemedel'} ny dos från ${datumText(`${d.fran}T12:00:00Z`)}: ${String(d.efter).toLowerCase()}, tidigare ${String(d.fore).toLowerCase()}`;
}
const diagnosText = (d) => `${d.text} (${d.kod})`;
const kontaktText = (v) => String(v.orsak ?? '').trim();

// Den pågående kontakten som anteckningen hamnar på, om användaren får se den.
function kontaktFor(atk) {
  if (!kanRoll(atk.personal, 'las_admin')) return null;
  try { return vardkontakt.aktuell(atk); } catch (e) { if (e instanceof Fel) return null; throw e; }
}
// Akutbesöket för kontakten, med prioriteten ur triagen, om det finns och syns.
function akutbesokFor(atk, v) {
  if (!v || v.typ !== 'akut' || v.dold) return null;
  try {
    const a = atk.db.query('SELECT * FROM akutbesok WHERE vardkontakt_id = ? AND patient_id = ?').get(v.id, atk.patientId);
    if (!a?.prioritet || !atk.prova('las_admin', { enhet_id: a.enhet_id }).tillaten) return null;
    return a;
  } catch { return null; }
}
const PRIORITETTEXT = { rod: 'Röd', orange: 'Orange', gul: 'Gul', gron: 'Grön', bla: 'Blå' };
const akutText = (a) => `${PRIORITETTEXT[a.prioritet] ?? a.prioritet} enligt triagen ${tidText(a.triage_tid ?? a.ankomst)}`;

// Anteckningstypen i bestämd form: daganteckningen, epikrisen. En typ som inte slutar som de vanliga får en omskrivning.
const bestamd = (typ) => { const t = typ.toLowerCase(); return /(ing|is|ning)$/.test(t) ? `${t}en` : /e$/.test(t) ? `${t}n` : `anteckningen av typen ${typ}`; };

// Förra signerade anteckningen av samma typ som den som skriver får se.
function forraAnteckning(atk, typ, utom = null) {
  if (!kanRoll(atk.personal, 'las_journal') && !kanRoll(atk.personal, 'las_omvardnad')) return null;
  return journal.synligaAnteckningar(atk).find(a => a.typ === typ && a.status === 'signerad' && a.id !== utom) ?? null;
}

// Underlaget för en ny anteckning av typen typ för patienten i atk. utkastId är utkastet som skrivs, som inte räknas
// som förra anteckningen. nu används i testerna.
export function underlag(atk, { typ, utkastId = null, kontakt = undefined, nu = Date.now(), alder = null } = {}) {
  const db = atk.db;
  const k = kontakt === undefined ? kontaktFor(atk) : kontakt;
  const v = k?.vardkontakt ?? null;
  const forra = forraAnteckning(atk, typ, utkastId);
  const vtStart = v?.vardtillfalleId && !v.dold ? db.query('SELECT inskriven FROM vardtillfallen WHERE id = ?').get(v.vardtillfalleId)?.inskriven : null;
  // Mätvärdena gäller sedan förra anteckningen av samma typ, annars sedan kontakten började, annars de senaste 30 dagarna.
  const sedan = forra ? (forra.signerad_tid ?? forra.skapad) : (v && !v.dold ? v.start : null) ?? new Date(nu - 30 * DAG).toISOString();
  const sedanText = forra ? `Sedan förra ${bestamd(typ)} ${tidText(sedan)}` : v && !v.dold ? `Sedan vårdkontakten började ${tidText(sedan)}` : 'De senaste 30 dagarna';
  // Läkemedlen gäller hela vårdtillfället eller kontakten, och det som är nytt sedan förra anteckningen märks.
  const lmSedan = [vtStart, v && !v.dold ? v.start : null, sedan].filter(Boolean).sort()[0];
  const ut = { typ, sedan, sedanText, kontakt: null, prioritet: null, matvarden: [], provsvar: [], lakemedel: [], diagnoser: [], tillvaxt: [], vaccinationer: [], forifyllt: {} };

  if (v && !v.dold && kontaktText(v)) {
    ut.kontakt = { ref: { typ: 'vardkontakt', id: v.id }, text: kontaktText(v), kalla: `Ur vårdkontakten ${datumText(v.start)}`, tid: v.start };
  }
  const ab = akutbesokFor(atk, v);
  if (ab) ut.prioritet = { ref: { typ: 'akutbesok', id: ab.id }, text: akutText(ab), kalla: 'Ur triagen på akutmottagningen', tid: ab.triage_tid ?? ab.ankomst };

  if (kanRoll(atk.personal, 'las_matvarden')) {
    const alla = journal.synligaMatvarden(atk).filter(m => {
      const kl = journal.matvardeUt(db, m).klass;
      return !kl || kl.kvalitetssakrad;
    });
    const perTyp = new Map();
    for (const m of alla) { if (!perTyp.has(m.typ)) perTyp.set(m.typ, []); perTyp.get(m.typ).push(m); }
    for (const [mtyp, rader] of perTyp) {
      const senaste = rader[0];
      if (!(senaste.tid > sedan)) continue;
      const forraV = rader[1] ?? null;
      const pil = jamfor(senaste, forraV);
      const post = {
        ref: { typ: 'matvarde', id: senaste.id }, typ: mtyp, namn: journal.mattypFor(db, mtyp)?.namn ?? mtyp, text: matvardeText(db, senaste), tid: senaste.tid,
        ...(pil ? { pil, pilText: `${PILTEXT[pil]} värdet ${tal(forraV.varde_num ?? forraV.varde)} (${datumText(forraV.tid)})` } : {}),
        antal: rader.filter(r => r.tid > sedan).length,
      };
      (PROVSVAR.has(mtyp) ? ut.provsvar : ut.matvarden).push(post);
    }
    const ordning = (a, b) => (a.tid < b.tid ? 1 : a.tid > b.tid ? -1 : a.namn.localeCompare(b.namn, 'sv'));
    ut.matvarden.sort(ordning);
    ut.provsvar.sort(ordning);
  }

  if (kanRoll(atk.personal, 'las_lakemedel')) {
    const ord = lakemedel.synligaOrdinationer(atk);
    const synligaId = new Set(ord.map(o => o.id));
    const poster = [];
    for (const o of ord) {
      const insatt = o.kalla === 'vardkallan' && o.skapad > lmSedan;
      const utsatt = o.status === 'utsatt' && o.utsatt_tid && o.utsatt_tid > lmSedan;
      // En utsättning som följs av en ny ordination av samma substans visas som en ändring på den nya ordinationen.
      if (utsatt && !insatt) { const efter = efterfoljare(db, o, ord); if (efter) continue; }
      if (insatt || utsatt) {
        const tid = insatt ? o.skapad : o.utsatt_tid;
        poster.push({ ref: { typ: 'ordination', id: o.id }, text: ordinationText(db, o, ord), tid, nytt: tid > sedan });
      }
    }
    try {
      for (const d of db.query('SELECT d.* FROM dosandringar d JOIN ordinationer o ON o.id = d.ordination_id WHERE o.patient_id = ? AND d.tid > ? ORDER BY d.tid DESC').all(atk.patientId, lmSedan)) {
        if (!synligaId.has(d.ordination_id) || !atk.prova('las_lakemedel', { enhet_id: d.enhet_id, gemensam: true }).tillaten) continue;
        poster.push({ ref: { typ: 'dosandring', id: d.id }, text: dosandringText(db, d), tid: d.tid, nytt: d.tid > sedan });
      }
    } catch { /* utan dosändringar */ }
    ut.lakemedel = poster.sort((a, b) => (a.tid < b.tid ? 1 : -1));
    ut.lakemedelText = lmSedan === sedan ? sedanText : `Under vårdkontakten sedan ${tidText(lmSedan)}`;
  }

  if (kanRoll(atk.personal, 'las_diagnoser')) {
    const sett = new Set();
    for (const d of journal.synligaDiagnoser(atk)) {
      if (sett.has(d.kod) || sett.size >= 6) continue;
      sett.add(d.kod);
      ut.diagnoser.push({ ref: { typ: 'diagnos', id: d.id }, text: diagnosText(d), tid: d.datum, typText: d.typ === 'huvud' ? 'Huvuddiagnos' : 'Bidiagnos' });
    }
  }

  // Barn och unga: den senaste längden, vikten och huvudomfånget oavsett period, och vaccinationerna.
  if (Number.isFinite(alder) && alder < 18) {
    if (kanRoll(atk.personal, 'las_matvarden')) {
      const alla = journal.synligaMatvarden(atk);
      for (const t of TILLVAXT) {
        const m = alla.find(x => x.typ === t);
        if (m) ut.tillvaxt.push({ ref: { typ: 'matvarde', id: m.id }, typ: t, namn: journal.mattypFor(db, t)?.namn ?? t, text: matvardeText(db, m), tid: m.tid });
      }
    }
    if (kanRoll(atk.personal, 'las_oversikt')) {
      ut.vaccinationer = synligaVaccinationer(atk).slice(0, 10).map(v => ({ ref: { typ: 'vaccination', id: v.id }, text: vaccinText(v), tid: v.tid }));
    }
  }

  // Förifyllnaden av sökorden Kontaktorsak och Prioritet, med källan.
  if (ut.kontakt) ut.forifyllt.Kontaktorsak = { text: ut.kontakt.text, kalla: ut.kontakt.kalla, ref: ut.kontakt.ref };
  if (ut.prioritet) ut.forifyllt.Prioritet = { text: ut.prioritet.text, kalla: ut.prioritet.kalla, ref: ut.prioritet.ref };
  return ut;
}

// Texten som systemet skriver för en referens, prövad med behörigheten i atk. null om resursen inte finns för
// patienten eller inte syns för den som skriver.
// minne: en Map som håller de synliga raderna under ett anrop, så att de räknas en gång när många referenser prövas.
export function referensText(atk, typ, id, minne = null) {
  const db = atk.db;
  const pid = atk.patientId;
  const en = (nyckel, fn) => { if (!minne) return fn(); if (!minne.has(nyckel)) minne.set(nyckel, fn()); return minne.get(nyckel); };
  if (typ === 'matvarde') {
    if (!kanRoll(atk.personal, 'las_matvarden')) return null;
    const m = db.query('SELECT * FROM matvarden WHERE id = ? AND patient_id = ?').get(id, pid);
    return m && en('matvarden', () => new Set(journal.synligaMatvarden(atk).map(x => x.id))).has(m.id) ? matvardeText(db, m) : null;
  }
  if (typ === 'ordination') {
    if (!kanRoll(atk.personal, 'las_lakemedel')) return null;
    const synliga = en('ordinationer', () => lakemedel.synligaOrdinationer(atk));
    const o = synliga.find(x => x.id === id);
    return o ? ordinationText(db, o, synliga) : null;
  }
  if (typ === 'dosandring') {
    if (!kanRoll(atk.personal, 'las_lakemedel')) return null;
    const d = db.query('SELECT d.* FROM dosandringar d JOIN ordinationer o ON o.id = d.ordination_id WHERE d.id = ? AND o.patient_id = ?').get(id, pid);
    return d && en('ordinationer', () => lakemedel.synligaOrdinationer(atk)).some(o => o.id === d.ordination_id) && atk.prova('las_lakemedel', { enhet_id: d.enhet_id, gemensam: true }).tillaten ? dosandringText(db, d) : null;
  }
  if (typ === 'diagnos') {
    if (!kanRoll(atk.personal, 'las_diagnoser')) return null;
    const d = en('diagnoser', () => journal.synligaDiagnoser(atk)).find(x => x.id === id);
    return d ? diagnosText(d) : null;
  }
  if (typ === 'vardkontakt') {
    const v = en('kontakt', () => kontaktFor(atk))?.vardkontakt;
    return v && !v.dold && v.id === id && kontaktText(v) ? kontaktText(v) : null;
  }
  if (typ === 'akutbesok') {
    const a = akutbesokFor(atk, en('kontakt', () => kontaktFor(atk))?.vardkontakt);
    return a && a.id === id ? akutText(a) : null;
  }
  if (typ === 'vaccination') {
    if (!kanRoll(atk.personal, 'las_oversikt')) return null;
    const v = en('vaccinationer', () => synligaVaccinationer(atk)).find(x => x.id === id);
    return v ? vaccinText(v) : null;
  }
  return null;
}

// Prövar referenserna i sökorden från klienten. Ger sökorden med de referenser som håller, i formen { typ, id, text }.
// En referens som inte håller tas bort utan fel, eftersom texten då är personens egen.
export function provaReferenser(atk, sokord) {
  // Säkerhetsgranskningen efter runda 15: de synliga raderna räknas en gång per anrop, texten prövas innan raden slås
  // upp, och hela anteckningen har ett tak.
  const minne = new Map();
  let kvar = MAX_REFERENSER_TOTALT;
  return sokord.map(s => {
    const ref = Array.isArray(s.referenser) ? s.referenser.slice(0, MAX_REFERENSER) : [];
    const { referenser, ...utan } = s; // eslint-disable-line no-unused-vars
    const sett = new Set();
    const goda = [];
    for (const r of ref) {
      const typ = REFERENSTYPER.includes(r?.typ) ? r.typ : null;
      const id = Number.isInteger(r?.id) && r.id > 0 ? r.id : null;
      if (!typ || !id || sett.has(`${typ}:${id}`) || kvar <= 0) continue;
      if (typeof r.text !== 'string' || !r.text || typeof utan.text !== 'string' || !utan.text.includes(r.text)) continue;
      const text = referensText(atk, typ, id, minne);
      if (!text || r.text !== text || !utan.text.includes(text)) continue;
      sett.add(`${typ}:${id}`);
      kvar--;
      goda.push({ typ, id, text });
    }
    return goda.length ? { ...utan, referenser: goda } : utan;
  });
}

// Referenserna i en sparad anteckning, för läsaren: texten och vilket slag av uppgift den kommer ur, aldrig id:t.
const SLAG = { matvarde: 'Ur mätvärdena', ordination: 'Ur läkemedelslistan', dosandring: 'Ur läkemedelslistan', diagnos: 'Ur diagnoserna', vardkontakt: 'Ur vårdkontakten', akutbesok: 'Ur triagen', vaccination: 'Ur vaccinationerna' };
export const referenserUt = (sokord) => sokord.map(s => (Array.isArray(s.referenser) ? { ...s, referenser: s.referenser.map(r => ({ text: r.text, kalla: SLAG[r.typ] ?? 'Ur journalen' })) } : s));

// FHIR: referenserna i ett sökord som section.entry, bara till resurser som läsaren får se.
const FHIR_TYP = { matvarde: 'Observation', ordination: 'MedicationRequest', diagnos: 'Condition', vardkontakt: 'Encounter', vaccination: 'Immunization' };
const FHIR_TABELL = { matvarde: ['matvarden', 'las_matvarden', false], ordination: ['ordinationer', 'las_lakemedel', true], diagnos: ['diagnoser', 'las_diagnoser', false], vardkontakt: ['vardkontakter', 'las_admin', false], vaccination: ['vaccinationer', 'las_oversikt', false] };
export function fhirEntries(atk, s) {
  if (!atk || !Array.isArray(s.referenser)) return [];
  const ut = [];
  // Säkerhetsgranskningen efter runda 15: en referens följer också undantagen från FHIR och från visning, som resursen
  // den pekar på, så att ett undantaget mätvärde inte syns som en referens.
  const fhir = undantag.provare(atk.db, 'fhir');
  const visning = undantag.provare(atk.db, 'visning');
  for (const r of s.referenser) {
    if (!Object.hasOwn(FHIR_TYP, r.typ)) continue;
    const [tabell, handling, gemensam] = FHIR_TABELL[r.typ];
    const rad = atk.db.query(`SELECT * FROM ${tabell} WHERE id = ?`).get(r.id);
    if (!rad || rad.patient_id !== atk.patientId || !kanRoll(atk.personal, handling) || !atk.prova(handling, { enhet_id: rad.enhet_id, gemensam }).tillaten) continue;
    const sort = r.typ === 'matvarde' ? 'matvarde' : null;
    if (fhir(rad, sort) || visning(rad, sort)) continue;
    ut.push({ reference: `${FHIR_TYP[r.typ]}/${rad.id}`, display: r.text });
  }
  return ut;
}
