// Runda 18, r1: första passet i testinbjudan. Den som väljer en yrkesroll på #/testa börjar med ett kort pass med en
// uppgift som yrket gör varje dag, med en patient och vägledning i gränssnittet (public/js/forsta-pass.js). Före passet
// frågar systemet en gång om passet får mätas. Svarar testaren nej fungerar allt likadant, men ingenting mäts.
//
// Mätningen visar var nya användare fastnar: tiden till första handlingen, tiden per steg i vägledningen, återvändor,
// öppnad hjälp, sökningar och avbrutna pass. Raden skapas när passet börjar (med status pagar), så att ett pass som aldrig
// avslutas syns som avbrutet, och uppdateras när passet är slut. Tiden för passet och om uppgiften blev gjord räknar
// servern själv ur sandlådan; klienten skickar bara räkningen av klick, fältbyten och tangenter och stegen, som prövas
// mot de kända stegen för passet (public/js/forsta-pass-steg.js). Inga personuppgifter, ingen adress (bara HMAC som för
// synpunkterna), inga fritexter och inget om demons patienter sparas: stegen har egna namn.
//
// Efter passet får testaren återkoppling mot Sussas tidsklass och klickbudget, och kan svara på SUS (sus.js), vars
// poäng servern räknar. Tabellerna ligger i synpunktsdatabasen (synpunkter.js) med samma gallring och samma öppenhet.
import { Fel } from './db.js';
import { TESTFALL, tidspoang } from './sussa-testfall.js';
import { FLODEN } from './klickbudget.js';
import { spridning } from './anvandartest.js';
import { provaTak, nyttNummer, skapareFor, profil as provaProfil } from './synpunkter.js';
import { stegFor, stegIdFor, FASTNAR_S } from '../public/js/forsta-pass-steg.js';
import { susPoang } from '../public/js/sus.js';

export const TAK_PASS = { perMinut: 10, perTimme: 60, perAdress: 300, totalt: 100000 };
export const TAK_SUS = { perMinut: 5, perTimme: 30, perAdress: 150, totalt: 100000 };
// Ett pass som inte har rapporterats på så här lång tid räknas som avbrutet: testaren har stängt fliken eller gått.
export const OVERGIVET_MS = 2 * 3600_000;
// Högsta tid som tas emot för ett pass eller ett steg, och högsta antal uppdateringar av en rad.
const MAX_S = 4 * 3600;
const MAX_UPPDATERINGAR = 50;

// Passen. uppdrag är ett av rollens uppdrag i testinbjudan.js. text är det testaren ser: uppgiften med de värden som
// behövs, utan var det ska klickas. Rollerna med Sussas testdata gör ett av Sussas testfall med Sussas tidsklass och
// klickbudgeten för rollens körning i sussa-testfall.js. De andra gör ett eget vanligt flöde med flödets klickbudget i
// klickbudget.js och de steg som behövs för att komma dit från rollens startsida.
export const PASS = {
  'lakare-sjukhus': {
    uppdrag: '3.1', sussa: '3.1',
    text: 'Hamid Burvall har kommit in med feber och frossa. Beställ CRP, blodstatus, kreatinin och blododling.',
    varfor: 'Att beställa prover gör en läkare på sjukhus varje dag, och testfallet är kort. Systemet föreslår provpaketet ur orsaken till besöket, så den som aldrig har sett systemet behöver inte kunna analyskoder eller laboratorier.',
  },
  'lakare-primarvard': {
    uppdrag: '4.1', sussa: '4.1',
    text: 'Berit Strandhall röker 25 cigaretter om dagen och vill ha hjälp att sluta. Dokumentera hennes tobaksvanor och att hon tackar ja till rådgivande samtal.',
    varfor: 'Att dokumentera i journalen gör en läkare i primärvården vid varje besök, och tobaksvanor är en av Sussas strukturerade anteckningar. Systemet skriver anteckningen ur svaren och föreslår åtgärden med KVÅ-kod, så ingen behöver kunna kodverket.',
  },
  sjukskoterska: {
    uppdrag: '4.2', sussa: '4.2',
    text: 'Sara Sandmark har kommit till avdelningen. Registrera längd 165 cm, vikt 75 kg, blodtryck 140/90 och puls 83.',
    varfor: 'Att registrera mätvärden gör en sjuksköterska flera gånger varje pass, och testfallet har alla värden givna. Systemet sätter tid, enhet och kod och räknar BMI, så det enda testaren gör är att skriva värdena.',
  },
  underskoterska: {
    uppdrag: '4.2', sussa: '4.2',
    text: 'Sara Sandmark har kommit till avdelningen. Registrera längd 165 cm, vikt 75 kg, blodtryck 140/90 och puls 83.',
    varfor: 'Mätvärden är det undersköterskan dokumenterar oftast, och testfallet har alla värden givna. Systemet sätter tid, enhet och kod och räknar BMI, så det enda testaren gör är att skriva värdena.',
  },
  barnmorska: {
    uppdrag: 'ctg', sussa: null, flode: 'ctg-bedomning', navigering: 1,
    text: 'Amanda Lindholm föder. Bedöm hennes pågående CTG.',
    varfor: 'Sussas testfall har inga uppdrag för barnmorskor. Att bedöma CTG gör barnmorskan på förlossningen många gånger under en förlossning, och systemet har redan bedömt kurvan, så testaren läser och bekräftar.',
  },
  vardadministrator: {
    uppdrag: '5.1', sussa: '5.1',
    text: 'Helene Lund ska komma på ett återbesök hos läkaren. Boka en tid och skicka kallelsen.',
    varfor: 'Att boka besök är vårdadministratörens vanligaste uppgift. Systemet väljer besökstyp, längd och läkare ur det patienten har gjort förut och föreslår de lämpligaste tiderna, så testaren behöver inte kunna tidboken.',
  },
  fysioterapeut: {
    uppdrag: '2.6', sussa: '2.6',
    text: 'Du har just träffat Sara Sandmark. Besvara remissen från vårdcentralen och skicka svaret.',
    varfor: 'Att besvara en remiss efter ett besök gör fysioterapeuten och de andra yrkena i Sussas grupp paramedicinare varje vecka, och testfallet har svarstexten given. Remissen är redan accepterad, så inget annat behöver väljas.',
  },
  systemforvaltare: {
    uppdrag: 'regel', sussa: null, flode: 'andra-demoregel', navigering: 0,
    text: 'Mottagningen vill att påminnelsen före en bokad tid skickas 72 timmar före i stället för 48. Föreslå ändringen.',
    varfor: 'Sussas testfall har inga uppdrag för systemförvaltare. Att ändra en regel är förvaltningens vanligaste uppgift. Systemet visar vad ändringen gör och säger till om värdet inte är rimligt, och ingen ändring gäller förrän en andra systemförvaltare har godkänt den.',
  },
  patient: {
    uppdrag: 'egenmatning', sussa: null, flode: 'egen-matning', navigering: 0,
    text: 'Du har mätt blodtrycket hemma och fick 138/86. Lämna värdet till vården.',
    varfor: 'Sussas testfall gäller personalen. Att lämna en egen mätning är något en patient med blodtryckskontroller gör ofta, och vården ser värdet direkt.',
  },
};

// Passet för en testroll, med klickbudget och tidsklass. testinbjudan.js ger demorollen.
export function passFor(testroll, demoroll = null) {
  if (!Object.hasOwn(PASS, testroll)) return null;
  const p = PASS[testroll];
  const roll = demoroll ?? ROLLER_DEMO[testroll] ?? null;
  if (p.sussa) {
    const tf = TESTFALL.find(t => t.nr === p.sussa);
    const k = tf?.korningar.find(x => x.demoroll === roll) ?? tf?.korningar[0];
    return { testroll, ...p, flode: null, titel: tf.titel, tidsklass: tf.tidsklass, budget: k.budget, budgetText: k.motivering };
  }
  const f = FLODEN.find(x => x.id === p.flode);
  const nav = p.navigering ?? 0;
  return { testroll, ...p, titel: f.namn, tidsklass: null, budget: f.budget + nav,
    budgetText: `${f.motivering}${nav ? ` Ett klick till för att komma dit från startsidan (${nav === 1 ? 'menyn' : `${nav} steg`}).` : ''}` };
}
// Demorollerna, så att passFor kan anropas utan testinbjudan.js (som importerar den här filen).
const ROLLER_DEMO = { 'lakare-sjukhus': 'lak-kard', 'lakare-primarvard': 'lak-vc', sjukskoterska: 'ssk-kard', underskoterska: 'usk-kard', barnmorska: 'bm-uso', vardadministrator: 'adm-kard', fysioterapeut: 'fys-kard', systemforvaltare: 'sysf', patient: null };

// Validering av räkningen från klienten. Allt annat i anropet ignoreras.
const fel = (text, falt) => new Fel(400, text, 'ogiltig', { falt });
function heltal(v, falt, max, { tom = false } = {}) {
  if (tom && (v === null || v === undefined)) return null;
  if (v === undefined) return 0;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > max) throw fel(`${falt} ska vara ett heltal från 0 till ${max}.`, [falt]);
  return v;
}
function sant(v, falt, standard) {
  if (v === undefined) return standard;
  if (typeof v !== 'boolean') throw fel(`${falt} ska vara sant eller falskt.`, [falt]);
  return v;
}
export function provaMatning(testroll, body = {}) {
  const kanda = new Set(stegIdFor(testroll));
  // Fliken har ingen räkning (en ny flik eller en tömd webbläsare): passet rapporteras utan siffror.
  if (body.utanRakning === true) {
    return { klick: null, faltbyten: null, tangenter: null, tidForstaS: null, hjalp: null, sokningar: null, aterkomster: null, vagledning: true, avstangd: null, steg: [],
      slut: sant(body.slut, 'slut', true), avbruten: sant(body.avbruten, 'avbruten', false), bredd: null };
  }
  if (body.steg !== undefined && !Array.isArray(body.steg)) throw fel('Stegen ska vara en lista.', ['steg']);
  const steg = (body.steg ?? []).slice(0, kanda.size + 1);
  if (steg.length > kanda.size) throw fel('För många steg.', ['steg']);
  const sedda = new Set();
  const stegUt = steg.map((s) => {
    if (!s || typeof s !== 'object' || typeof s.id !== 'string' || !kanda.has(s.id) || sedda.has(s.id)) throw fel('Ett steg finns inte i passet.', ['steg']);
    sedda.add(s.id);
    return { id: s.id, tidS: heltal(s.tidS, 'tidS', MAX_S), aterkomster: heltal(s.aterkomster, 'aterkomster', 500), hjalp: heltal(s.hjalp, 'hjalp', 100), sokningar: heltal(s.sokningar, 'sokningar', 200) };
  });
  return {
    klick: heltal(body.klick, 'klick', 2000), faltbyten: heltal(body.faltbyten, 'faltbyten', 2000), tangenter: heltal(body.tangenter, 'tangenter', 5000),
    tidForstaS: heltal(body.tidForstaS, 'tidForstaS', MAX_S, { tom: true }), hjalp: heltal(body.hjalp, 'hjalp', 100), sokningar: heltal(body.sokningar, 'sokningar', 200),
    aterkomster: heltal(body.aterkomster, 'aterkomster', 500), vagledning: sant(body.vagledning, 'vagledning', true), avstangd: heltal(body.avstangd, 'avstangd', 100),
    steg: stegUt, slut: sant(body.slut, 'slut', true), avbruten: sant(body.avbruten, 'avbruten', false),
    bredd: Number.isInteger(body.bredd) && body.bredd >= 200 && body.bredd <= 10000 ? body.bredd : null,
  };
}

// En ny rad när passet börjar. ctx kommer från servern (session, adress, version, gränssnitt, webbläsare) och
// testinbjudan.js (testroll, pass och profil).
export function skapaRad(db, { nu = new Date(), session = {}, adress = 'okänd', version = 'okänd', gransnitt = 'okänd', webblasare = 'Okänd', testroll, pass, profil = {}, tak = TAK_PASS }) {
  const skapare = skapareFor(adress);
  const p = provaProfil(profil);
  provaTak(db, 'pass_matningar', { session, skapare, nu, tak, nyckel: 'passTider' });
  const nummer = nyttNummer(db, 'P', 'pass_matningar');
  db.query(`INSERT INTO pass_matningar (nummer, tid, testroll, uppdrag, sussa, status, budget, tidsklass, yrke, system, ar, vardform, version, gransnitt, webblasare, skapare)
    VALUES (?, ?, ?, ?, ?, 'pagar', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(nummer, nu.toISOString(), testroll, pass.uppdrag, pass.sussa ?? '', pass.budget, pass.tidsklass,
    p.yrke, p.system, p.ar, p.vardform, String(version), String(gransnitt).slice(0, 64), webblasare, skapare);
  return nummer;
}

// Uppdaterar raden med räkningen. status och tidS bestämmer servern. En rad som är klar eller avbruten ändras inte.
export function uppdateraRad(db, nummer, m, { status, tidS = null, nu = new Date() }) {
  const r = db.query('SELECT * FROM pass_matningar WHERE nummer = ?').get(nummer);
  if (!r) throw new Fel(409, 'Mätningen av passet finns inte längre. Den kan ha gallrats.', 'ogiltig');
  if (r.status !== 'pagar') throw new Fel(409, 'Passet är redan rapporterat.', 'ogiltig');
  if (r.uppdateringar >= MAX_UPPDATERINGAR) throw new Fel(429, 'Passet har uppdaterats för många gånger.', 'for_manga');
  db.query(`UPDATE pass_matningar SET status = ?, slut_tid = ?, tid_s = ?, tid_forsta_s = ?, klick = ?, faltbyten = ?, tangenter = ?, steg_antal = ?, aterkomster = ?, hjalp = ?,
    sokningar = ?, vagledning = ?, avstangd = ?, steg = ?, bredd = COALESCE(?, bredd), uppdateringar = uppdateringar + 1 WHERE nummer = ?`)
    .run(status, nu.toISOString(), tidS, m.tidForstaS, m.klick, m.faltbyten, m.tangenter, m.klick == null ? null : m.klick + m.faltbyten + m.tangenter, m.aterkomster, m.hjalp, m.sokningar,
      m.vagledning ? 1 : 0, m.avstangd, JSON.stringify(m.steg), m.bredd ?? null, nummer);
  return db.query('SELECT * FROM pass_matningar WHERE nummer = ?').get(nummer);
}

// SUS efter passet. Poängen räknar servern.
export function sparaSus(db, svar, { nu = new Date(), session = {}, adress = 'okänd', version = 'okänd', gransnitt = 'okänd', webblasare = 'Okänd', testroll, pass, profil = {}, tak = TAK_SUS }) {
  if (!Array.isArray(svar) || svar.length !== 10 || !svar.every(v => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5)) throw fel('Svara på alla tio påståenden med 1 till 5.', ['svar']);
  const poang = susPoang(svar);
  const skapare = skapareFor(adress);
  const p = provaProfil(profil);
  provaTak(db, 'pass_sus', { session, skapare, nu, tak, nyckel: 'passSusTider' });
  const nummer = nyttNummer(db, 'U', 'pass_sus');
  db.query(`INSERT INTO pass_sus (nummer, tid, testroll, uppdrag, sussa, svar, poang, yrke, system, ar, vardform, version, gransnitt, webblasare, skapare)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(nummer, nu.toISOString(), testroll, pass.uppdrag, pass.sussa ?? '', JSON.stringify(svar), poang,
    p.yrke, p.system, p.ar, p.vardform, String(version), String(gransnitt).slice(0, 64), webblasare, skapare);
  return { nummer, poang };
}

// Återkopplingen till testaren: tiden mot Sussas tidsklass och stegen mot klickbudgeten. Utan mätning bara budgeten.
export function resultat(pass, { status, rad = null }) {
  const matt = Boolean(rad);
  const tidS = matt ? rad.tid_s : null;
  return {
    status, budget: pass.budget, tidsklass: pass.tidsklass, sussa: pass.sussa ?? null,
    tidS, steg: matt ? rad.steg_antal : null, klick: matt ? rad.klick : null, faltbyten: matt ? rad.faltbyten : null, tangenter: matt ? rad.tangenter : null,
    tidspoang: matt && pass.tidsklass && status === 'klar' && tidS != null ? tidspoang(tidS, pass.tidsklass) : null,
  };
}

// Sammanställningen för testledaren: per yrkesroll och uppgift, och SUS för alla pass.
const medelSd = (v) => {
  if (!v.length) return { n: 0, medel: null, sd: null, median: null, min: null, max: null };
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = v.length > 1 ? Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)) : null;
  const s = spridning(v);
  return { n: v.length, medel: Math.round(m * 10) / 10, sd: sd == null ? null : Math.round(sd * 100) / 100, median: s.median, min: s.min, max: s.max };
};
const statusNu = (r, nu) => (r.status === 'pagar' && nu.getTime() - Date.parse(r.slut_tid ?? r.tid) > OVERGIVET_MS ? 'avbruten' : r.status);
const fastnade = (s) => s.tidS >= FASTNAR_S || s.aterkomster > 0 || s.hjalp > 0 || s.sokningar > 0;

export function sammanstall(db, { nu = new Date(), filter = {} } = {}) {
  const f = (v) => (typeof v === 'string' && v ? v : null);
  const system = f(filter.system); const testroll = f(filter.testroll);
  const rader = db.query('SELECT * FROM pass_matningar ORDER BY id').all().filter(r => (!system || r.system === system) && (!testroll || r.testroll === testroll));
  const sus = db.query('SELECT * FROM pass_sus ORDER BY id').all().filter(r => (!system || r.system === system) && (!testroll || r.testroll === testroll));
  const grupper = new Map();
  for (const r of rader) {
    const k = `${r.testroll}|${r.uppdrag}`;
    if (!grupper.has(k)) grupper.set(k, []);
    grupper.get(k).push({ ...r, status: statusNu(r, nu), steg: (() => { try { return JSON.parse(r.steg ?? '[]'); } catch { return []; } })() });
  }
  const perUppgift = [...grupper.entries()].map(([k, g]) => {
    const [tr, upp] = k.split('|');
    const p = passFor(tr);
    const klara = g.filter(r => r.status === 'klar');
    const raknade = klara.filter(r => r.steg_antal != null);
    const texter = new Map(stegFor(tr).map(s => [s.id, s.text]));
    const perSteg = new Map();
    for (const r of g.filter(x => x.status !== 'pagar')) {
      for (const s of r.steg) {
        const x = perSteg.get(s.id) ?? { id: s.id, text: texter.get(s.id) ?? s.id, antal: 0, tider: [] };
        if (fastnade(s)) x.antal++;
        x.tider.push(s.tidS);
        perSteg.set(s.id, x);
      }
    }
    const ordning = stegIdFor(tr);
    const fastnar = [...perSteg.values()].filter(x => x.antal > 0).sort((a, b) => b.antal - a.antal || ordning.indexOf(a.id) - ordning.indexOf(b.id))
      .slice(0, 5).map(x => ({ id: x.id, text: x.text, antal: x.antal, medianTidS: spridning(x.tider).median }));
    const s = sus.filter(x => x.testroll === tr && x.uppdrag === upp).map(x => x.poang);
    return {
      testroll: tr, uppdrag: upp, sussa: p?.sussa ?? null, titel: p?.titel ?? upp, budget: p?.budget ?? null, tidsklass: p?.tidsklass ?? null,
      antal: g.length, klara: klara.length, avbrutna: g.filter(r => r.status === 'avbruten').length, pagar: g.filter(r => r.status === 'pagar').length,
      andelKlara: g.length ? Math.round((klara.length / g.length) * 100) : null,
      tidS: spridning(klara.map(r => r.tid_s)), steg: spridning(raknade.map(r => r.steg_antal)), tidForstaS: spridning(klara.map(r => r.tid_forsta_s)),
      inomBudget: raknade.filter(r => r.steg_antal <= (p?.budget ?? 0)).length, medVagledning: g.filter(r => r.vagledning === 1).length,
      fastnar, sus: medelSd(s),
    };
  }).sort((a, b) => a.testroll.localeCompare(b.testroll) || a.uppdrag.localeCompare(b.uppdrag, 'sv', { numeric: true }));
  return { perUppgift, sus: medelSd(sus.map(x => x.poang)), antal: { pass: rader.length, sus: sus.length } };
}

// Kravsidan: antalet genomförda pass och SUS-medelvärdet, räknat ur databasen.
export function sammanfattning(db) {
  const genomforda = db.query("SELECT count(*) AS n FROM pass_matningar WHERE status = 'klar'").get().n;
  const s = db.query('SELECT count(*) AS n, avg(poang) AS m FROM pass_sus').get();
  return { genomforda, sus: { antal: s.n, medel: s.n ? Math.round(s.m * 10) / 10 : null } };
}

// Raderna som de lämnas ut till testledaren och exporten.
export const radUt = (r) => ({
  nummer: r.nummer, tid: r.tid, slutTid: r.slut_tid, testroll: r.testroll, uppdrag: r.uppdrag, sussa: r.sussa, status: r.status, tidS: r.tid_s, tidForstaS: r.tid_forsta_s,
  klick: r.klick, faltbyten: r.faltbyten, tangenter: r.tangenter, stegAntal: r.steg_antal, budget: r.budget, tidsklass: r.tidsklass, aterkomster: r.aterkomster,
  hjalp: r.hjalp, sokningar: r.sokningar, vagledning: r.vagledning, avstangd: r.avstangd, steg: r.steg, yrke: r.yrke, system: r.system, ar: r.ar, vardform: r.vardform,
  version: r.version, gransnitt: String(r.gransnitt).slice(0, 12), bredd: r.bredd, webblasare: r.webblasare,
});
export const susUt = (r) => ({ nummer: r.nummer, tid: r.tid, testroll: r.testroll, uppdrag: r.uppdrag, sussa: r.sussa, svar: r.svar, poang: r.poang, yrke: r.yrke, system: r.system, ar: r.ar, vardform: r.vardform, version: r.version, gransnitt: String(r.gransnitt).slice(0, 12), webblasare: r.webblasare });
