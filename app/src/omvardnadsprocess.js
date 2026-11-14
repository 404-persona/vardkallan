// Runda 15, r5 (F4, Sussa 3.1.3.5, 3.2.2.1 och 5.1.3.4): omvårdnadsanteckningen som omvårdnadsprocess.
//
// Anteckningen har processens fyra delar, omvårdnadsproblem, mål, åtgärd och resultat, och tolv statusområden som fälls
// ut när de behövs. Omvårdnadsproblemen väljs bland begrepp i Snomed CT som systemet föreslår ur journalen, och
// resultatet bedöms mot vårdplanens mål, så att uppföljningen står i vårdplanen utan att någon skriver den två gånger.
//
// Systemet är experten. Det föreslår de statusområden som gäller patienten i dag (mallforslag.js), föreslår
// omvårdnadsproblemen och de formulär som borde fyllas i, visar vårdplanens mål med den senaste bedömningen och
// undersköterskans observationer sedan sjuksköterskans förra anteckning. Koderna sätts av systemet och syns inte.
// Förslagen räknas bara på den egna vårdenhetens uppgifter som den som skriver får se, utan aktiva val och nödåtkomst,
// som formulärens förifyllnad (formularmotor.js), så att ett förslag aldrig röjer en annan eller spärrad vårdenhet.
//
// Statusområdena är Vårdkällans egna. De är grupperade efter kroppsfunktioner och aktiviteter i ICF (WHO:s
// Klassifikation av funktionstillstånd, funktionshinder och hälsa) och efter de bedömningar som systemet redan gör
// (NEWS2, fallrisk, sår, smärtskattning och vikt). Namnen och ordningen är inte hämtade ur VIPS-modellen, som är
// upphovsrättsligt skyddad. Omvårdnadsprocessens steg (problem, mål, åtgärd, resultat) är den allmänna
// omvårdnadsprocessen och inte en enskild modells. Förslagsreglerna är demoregler.
import { Fel, iso } from './db.js';
import { Atkomst, kanRoll, vardenhetFor, alder } from './atkomst.js';
import { filtreraVisning } from './undantag.js';

export const TYP = 'Omvårdnadsanteckning';
export const PROCESS = ['Omvårdnadsproblem', 'Mål', 'Åtgärd', 'Resultat'];
// Statusområdena i ICF:s ordning, med kapitlet eller kategorierna de motsvarar.
export const OMRADEN = [
  { namn: 'Medvetande', icf: 'b110 och b114' },
  { namn: 'Psykiskt mående', icf: 'b152' },
  { namn: 'Sömn', icf: 'b134' },
  { namn: 'Kommunikation', icf: 'd3, b210 och b230' },
  { namn: 'Smärta', icf: 'b280' },
  { namn: 'Andning och cirkulation', icf: 'b4' },
  { namn: 'Nutrition', icf: 'b510, b530 och b545' },
  { namn: 'Elimination', icf: 'b525 och b620' },
  { namn: 'Hud och sår', icf: 'b8' },
  { namn: 'Rörlighet', icf: 'd4' },
  { namn: 'Personlig vård', icf: 'd5' },
  { namn: 'Sociala förhållanden', icf: 'd7 och e3' },
];
const OMRADESNAMN = OMRADEN.map(o => o.namn);
export const MALL = {
  typ: TYP, kategori: 'omvardnad', sokord: [...PROCESS, ...OMRADESNAMN],
  // Statusområdena är utfällbara. Bara de som systemet föreslår, och de som har text, visas från början.
  utfallda: [...OMRADESNAMN], process: true,
};
// Sökord i äldre omvårdnadsanteckningar och det statusområde de motsvarar, för förslagen ur förra anteckningen.
export const ERSATTA = { 'Andning/cirkulation': 'Andning och cirkulation', 'Hud/vävnad': 'Hud och sår', Aktivitet: 'Rörlighet', Psykosocialt: 'Psykiskt mående' };

// Omvårdnadsproblemen, begrepp i SNOMED CT International Edition 20250201 (kontrollerade på tx.fhir.org 2026-11-14).
// Begreppen motsvarar omvårdnadsdiagnoser i ICNP och NANDA, men ICNP-delmängden i den svenska utgåvan är inte
// kontrollerad, eftersom den kräver licens.
export const PROBLEM = {
  fall: { text: 'Ökad risk för fall', omrade: 'Rörlighet', code: '129839007', display: 'At increased risk for falls' },
  rorlighet: { text: 'Nedsatt rörlighet', omrade: 'Rörlighet', code: '82971005', display: 'Impaired mobility' },
  trycksar: { text: 'Risk för trycksår', omrade: 'Hud och sår', code: '285304000', display: 'At risk of pressure injury' },
  sar: { text: 'Sår', omrade: 'Hud och sår', code: '416462003', display: 'Wound' },
  akut_smarta: { text: 'Akut smärta', omrade: 'Smärta', code: '274663001', display: 'Acute pain' },
  langvarig_smarta: { text: 'Långvarig smärta', omrade: 'Smärta', code: '82423001', display: 'Chronic pain' },
  gasutbyte: { text: 'Nedsatt gasutbyte', omrade: 'Andning och cirkulation', code: '70944005', display: 'Impaired gas exchange' },
  vatska: { text: 'Risk för vätskeöverskott', omrade: 'Nutrition', code: '129849005', display: 'At increased risk for excess fluid volume' },
  undernaring: { text: 'Risk för undernäring', omrade: 'Nutrition', code: '129845004', display: 'At increased risk for imbalanced nutrition, less than body requirements' },
  forstoppning: { text: 'Förstoppning', omrade: 'Elimination', code: '14760008', display: 'Constipation' },
  inkontinens: { text: 'Urininkontinens', omrade: 'Elimination', code: '165232002', display: 'Urinary incontinence' },
  somn: { text: 'Sömnsvårigheter', omrade: 'Sömn', code: '193462001', display: 'Insomnia' },
  oro: { text: 'Oro', omrade: 'Psykiskt mående', code: '48694002', display: 'Anxiety' },
  forvirring: { text: 'Risk för förvirring', omrade: 'Medvetande', code: '430794006', display: 'At increased risk for delirium' },
};
export const MALSTATUS = { uppnatt: 'Uppnått', delvis: 'Delvis uppnått', ej_uppnatt: 'Inte uppnått' };
export const DEMOREGLER = 'Förslagen på statusområden, omvårdnadsproblem och formulär är demoregler för att visa flödet. De är inte granskade av vården.';
// Standardplanerna i vardplan.js och de statusområden de gäller.
const PLANOMRADEN = { hjartsvikt: ['Andning och cirkulation', 'Nutrition'], trycksar: ['Hud och sår', 'Nutrition'], diabetes: ['Nutrition'], fall: ['Rörlighet'], lpt: ['Psykiskt mående'] };

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS omvardnad_process (
  anteckning_id INTEGER PRIMARY KEY, problem TEXT NOT NULL DEFAULT '[]', resultat TEXT NOT NULL DEFAULT '[]', sparad TEXT NOT NULL
);
`;
export const sakra = (db) => db.exec(SCHEMA);
const harTabell = (db, t) => Boolean(db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t));

const journal = () => require('./journal.js');
const vardplan = () => require('./vardplan.js');
const DAG = 86400_000;
const klock = (t) => new Date(t).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit' });
const dagText = (t, nu) => {
  const d = (x) => new Date(x).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
  if (d(t) === d(nu)) return `i dag ${klock(t)}`;
  if (d(t) === d(nu - DAG)) return `i går ${klock(t)}`;
  return new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm', day: 'numeric', month: 'short' });
};
const tal = (v) => String(v).replace('.', ',');

// --- Den egna vårdenhetens uppgifter som personen får se -------------------------------------------------------------

// En åtkomst utan aktiva val, och bara rader från den egna vårdenheten.
const egenAtkomst = (atk, patientId = atk.patientId, handling = 'las_omvardnad') => new Atkomst(atk.db, atk.personal, patientId, {}, handling);
const egen = (atk, enhetId) => vardenhetFor(atk.db, enhetId) === vardenhetFor(atk.db, atk.personal.enhet_id);

function egnaMatvarden(atk) {
  if (!kanRoll(atk.personal, 'las_matvarden')) return [];
  return journal().synligaMatvarden(egenAtkomst(atk, atk.patientId, 'las_matvarden')).filter(m => egen(atk, m.enhet_id));
}
function egnaAnteckningar(atk) {
  if (!kanRoll(atk.personal, 'las_omvardnad')) return [];
  const a = egenAtkomst(atk);
  const rader = atk.db.query("SELECT * FROM anteckningar WHERE patient_id = ? AND status = 'signerad' ORDER BY signerad_tid DESC, id DESC").all(atk.patientId)
    .filter(r => !atk.db.query('SELECT 1 FROM anteckningar WHERE ersatter_id = ?').get(r.id));
  return filtreraVisning(a, a.filtrera(rader, r => journal().lasHandling(r.kategori)), 'anteckning').filter(r => egen(atk, r.enhet_id));
}
function egnaPlaner(atk) {
  if (!kanRoll(atk.personal, 'las_vardplan')) return [];
  return vardplan().synligaPlaner(egenAtkomst(atk, atk.patientId, 'las_vardplan')).filter(p => p.status !== 'avslutad' && egen(atk, p.enhet_id));
}
const formularsvar = (atk, a) => { try { return require('./formularmotor.js').ut(atk.db, a.id); } catch { return null; } };

// NEWS2 ur den egna vårdenhetens värden, den senaste omgången under det senaste dygnet.
function news2Senaste(atk, rader, nu) {
  const p = atk.db.query('SELECT * FROM patienter WHERE id = ?').get(atk.patientId);
  if (!p) return null;
  const n = require('./vitalparametrar.js').news2For(egenAtkomst(atk, atk.patientId, 'las_matvarden'), p, rader, nu);
  const a = n?.aktuell;
  return a && nu - Date.parse(a.tid) <= DAG ? a : null;
}

// Allt som förslagen räknas på, en gång per anrop.
function underlag(atk, nu) {
  const matvarden = egnaMatvarden(atk);
  const anteckningar = egnaAnteckningar(atk);
  return { matvarden, anteckningar, planer: egnaPlaner(atk), news2: news2Senaste(atk, matvarden, nu), nu };
}

// --- Förslagen -----------------------------------------------------------------------------------------------------

// Omvårdnadsproblem som systemet föreslår ur journalen, med varför.
export function problemForslag(atk, u = underlag(atk, Date.now())) {
  const ut = new Map();
  const lagg = (id, varfor) => { if (!ut.has(id)) ut.set(id, varfor); };
  const { nu } = u;
  for (const p of u.planer) {
    if (p.mall === 'fall') lagg('fall', `Vårdplanen ${p.rubrik} pågår.`);
    if (p.mall === 'trycksar') lagg('trycksar', `Vårdplanen ${p.rubrik} pågår.`);
    if (p.mall === 'hjartsvikt') lagg('vatska', `Vårdplanen ${p.rubrik} pågår.`);
  }
  const fall = u.anteckningar.find(a => formularsvar(atk, a)?.kod === 'fallrisk');
  const fp = fall && formularsvar(atk, fall)?.poang;
  if (fp?.tolkning?.varning) lagg('fall', `Fallriskbedömningen ${dagText(Date.parse(fall.signerad_tid), nu)} gav ${fp.summa} poäng, ${fp.tolkning.text.toLowerCase()}.`);
  const sar = u.anteckningar.find(a => formularsvar(atk, a)?.kod === 'sar');
  if (sar && nu - Date.parse(sar.signerad_tid) <= 14 * DAG) lagg('sar', `Ett sår dokumenterades ${dagText(Date.parse(sar.signerad_tid), nu)}.`);
  const smarta = u.matvarden.find(m => m.typ === 'smarta');
  if (smarta && nu - Date.parse(smarta.tid) <= DAG && Number(smarta.varde_num ?? smarta.varde) >= 4) lagg('akut_smarta', `Smärtan skattades till ${tal(smarta.varde_num ?? smarta.varde)} av 10 ${dagText(Date.parse(smarta.tid), nu)}.`);
  const sat = u.news2?.delar?.find(d => d.parameter === 'saturation');
  if (sat && sat.poang >= 2) lagg('gasutbyte', `Syremättnaden var ${tal(sat.varde)} procent ${dagText(Date.parse(u.news2.tid), nu)}, vilket ger ${sat.poang} poäng i NEWS2.`);
  const vikt = viktforandring(u.matvarden, nu);
  if (vikt?.okning) lagg('vatska', `Vikten har ökat ${tal(vikt.okning)} kg på tre dygn.`);
  if (vikt?.minskning) lagg('undernaring', `Vikten har minskat ${vikt.minskning} procent de senaste tre månaderna.`);
  return [...ut].map(([id, varfor]) => ({ id, text: PROBLEM[id].text, omrade: PROBLEM[id].omrade, varfor }));
}

// En ökning med minst 2 kg på tre dygn (vätska) eller en minskning med minst 5 procent på tre månader (nutrition).
function viktforandring(matvarden, nu) {
  const v = matvarden.filter(m => m.typ === 'vikt' && Number.isFinite(Number(m.varde_num ?? m.varde))).map(m => ({ t: Date.parse(m.tid), v: Number(m.varde_num ?? m.varde) }))
    .filter(x => nu - x.t <= 90 * DAG).sort((a, b) => b.t - a.t);
  if (v.length < 2) return null;
  const sista = v[0];
  const ut = {};
  const tre = v.filter(x => sista.t - x.t <= 3 * DAG && x !== sista);
  if (tre.length) { const okning = sista.v - Math.min(...tre.map(x => x.v)); if (okning >= 2) ut.okning = Math.round(okning * 10) / 10; }
  const max = Math.max(...v.map(x => x.v));
  const minskning = Math.round(((max - sista.v) / max) * 100);
  if (minskning >= 5) ut.minskning = minskning;
  return Object.keys(ut).length ? ut : null;
}

// Statusområden som gäller patienten i dag, med varför. Används av mallforslag.js.
export function foreslagnaOmraden(atk, u = underlag(atk, Date.now())) {
  const ut = new Map();
  const lagg = (omrade, varfor) => { if (!OMRADESNAMN.includes(omrade)) return; if (!ut.has(omrade)) ut.set(omrade, []); if (!ut.get(omrade).includes(varfor) && ut.get(omrade).length < 2) ut.get(omrade).push(varfor); };
  const { nu } = u;
  for (const p of u.planer) for (const o of PLANOMRADEN[p.mall] ?? []) lagg(o, `Vårdplanen ${p.rubrik} pågår.`);
  for (const pf of problemForslag(atk, u)) lagg(pf.omrade, pf.varfor);
  if (u.news2) {
    if (u.news2.poang >= 5 || u.news2.rod?.length) lagg('Andning och cirkulation', `NEWS2 ${u.news2.komplett ? `är ${u.news2.poang}` : 'har ett värde med 3 poäng'} ${dagText(Date.parse(u.news2.tid), nu)}.`);
    const med = u.news2.delar?.find(d => d.parameter === 'medvetande');
    if (med && med.poang >= 3) lagg('Medvetande', `Medvetandegraden var ${med.visning.toLowerCase()} ${dagText(Date.parse(u.news2.tid), nu)}.`);
  }
  // Det som skrevs i förra omvårdnadsanteckningen på vårdenheten.
  const forra = u.anteckningar.find(a => a.typ === TYP);
  if (forra) {
    for (const s of JSON.parse(forra.sokord)) {
      const o = ERSATTA[s.sokord] ?? s.sokord;
      if (s.text && OMRADESNAMN.includes(o)) lagg(o, `Skrevs i förra omvårdnadsanteckningen ${dagText(Date.parse(forra.signerad_tid), nu)}.`);
    }
  }
  return OMRADESNAMN.filter(o => ut.has(o)).map(o => ({ sokord: o, varfor: ut.get(o).join(' ') }));
}

// Formulär som borde fyllas i, med varför. Bara formulär som personen får fylla i.
function formularForslag(atk, u) {
  const db = atk.db;
  const yrken = require('./mallar-yrken.js');
  const fm = require('./formularmotor.js');
  const mallar = fm.mallarFor(db, atk.personal).filter(m => yrken.far(db, atk.personal, m));
  const ut = [];
  const { nu } = u;
  const inlagd = Boolean(db.query("SELECT enhet_id FROM vardkontakter WHERE patient_id = ? AND typ = 'slutenvard' AND slut IS NULL").all(atk.patientId).some(v => egen(atk, v.enhet_id)));
  const fall = mallar.find(m => m.formular.kod === 'fallrisk');
  if (fall && inlagd) {
    const sist = u.anteckningar.find(a => formularsvar(atk, a)?.kod === 'fallrisk');
    const p = db.query('SELECT fodd FROM patienter WHERE id = ?').get(atk.patientId);
    const ar = p?.fodd ? alder(p.fodd, new Date(nu).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' })) : null;
    const plan = u.planer.find(x => x.mall === 'fall');
    if ((!sist || nu - Date.parse(sist.signerad_tid) > 7 * DAG) && (plan || (ar != null && ar >= 65))) {
      ut.push({ typ: fall.typ, varfor: `${sist ? `Fallrisken bedömdes senast ${dagText(Date.parse(sist.signerad_tid), nu)}` : 'Fallrisken är inte bedömd under vårdtiden'}, och ${plan ? `vårdplanen ${plan.rubrik} pågår` : `patienten är ${ar} år`}.` });
    }
  }
  const sarMall = mallar.find(m => m.formular.kod === 'sar');
  const sar = u.anteckningar.find(a => formularsvar(atk, a)?.kod === 'sar');
  if (sarMall && sar && nu - Date.parse(sar.signerad_tid) > 2 * DAG && nu - Date.parse(sar.signerad_tid) <= 30 * DAG) {
    ut.push({ typ: sarMall.typ, varfor: `Såret dokumenterades senast ${dagText(Date.parse(sar.signerad_tid), nu)}.` });
  }
  return ut;
}

// Undersköterskans observationer på vårdenheten sedan personens egen förra omvårdnadsanteckning, högst två dygn bakåt.
function observationer(atk, u) {
  const forra = u.anteckningar.find(a => a.typ === TYP && a.forfattare_id === atk.personal.id);
  const fran = Math.max(u.nu - 2 * DAG, forra ? Date.parse(forra.signerad_tid) : 0);
  const namn = (id) => atk.db.query('SELECT namn, titel FROM personal WHERE id = ?').get(id);
  return u.anteckningar.filter(a => a.typ === 'Observationsanteckning' && Date.parse(a.signerad_tid) > fran).slice(0, 5).map(a => ({
    id: a.id, tid: a.signerad_tid, forfattare: namn(a.forfattare_id)?.namn ?? null, titel: namn(a.forfattare_id)?.titel ?? null,
    sokord: JSON.parse(a.sokord).filter(s => s.text).map(s => ({ sokord: s.sokord, text: s.text })),
  }));
}

// Vårdplanens mål på den egna vårdenheten, med den senaste bedömningen.
function mal(atk, u) {
  const ut = [];
  for (const p of u.planer.filter(x => x.status === 'aktiv')) {
    const plan = vardplan().planUt(egenAtkomst(atk, atk.patientId, 'las_vardplan'), p, u.nu);
    for (const m of plan.mal) ut.push({ planId: p.id, plan: p.rubrik, malId: m.id, text: m.text, status: m.status, statusText: m.statusText });
  }
  return ut;
}

// Allt som anteckningsvyn behöver för omvårdnadsprocessen (GET /api/patient/:id/omvardnadsprocess).
export function forPatient(atk, { mall = null, kontakt = null } = {}) {
  const yrken = require('./mallar-yrken.js');
  if (!yrken.far(atk.db, atk.personal, { typ: TYP, kategori: 'omvardnad' })) {
    throw new Fel(403, `${yrken.YRKEN[atk.personal.yrke] ?? 'Din yrkesroll'} skriver inte omvårdnadsanteckningar med omvårdnadsprocessen.`, 'nekad');
  }
  atk.krav('skriv_omvardnad');
  const nu = Date.now();
  const u = underlag(atk, nu);
  const kanResultat = kanRoll(atk.personal, 'vardplan') && atk.prova('vardplan').grund !== 'nodatkomst';
  return {
    mal: kanResultat ? mal(atk, u) : [], kanBedomaResultat: kanResultat, malstatus: MALSTATUS,
    problem: Object.entries(PROBLEM).map(([id, p]) => ({ id, text: p.text, omrade: p.omrade })),
    problemForslag: problemForslag(atk, u), foreslagna: require('./mallforslag.js').foreslagnaSokord(atk, atk.patientId, mall ?? MALL, kontakt),
    observationer: observationer(atk, u), formularforslag: formularForslag(atk, u), demoregler: DEMOREGLER,
  };
}

// --- Det som sparas med anteckningen --------------------------------------------------------------------------------

// Kontrollerar processens strukturerade delar. problem är id i PROBLEM, resultat är [{ malId, status }] för mål i en
// pågående vårdplan på den egna vårdenheten. Resultatet förs in i vårdplanen när anteckningen signeras, och kräver
// därför samma behörighet som en uppföljning av vårdplanen.
export function forbered(atk, process) {
  if (process == null) return null;
  if (typeof process !== 'object' || Array.isArray(process)) throw new Fel(400, 'Omvårdnadsprocessen anges med problem och resultat.', 'ogiltig', { falt: ['process'] });
  const problem = Array.isArray(process.problem) ? process.problem : [];
  if (problem.length > Object.keys(PROBLEM).length || problem.some(p => typeof p !== 'string' || !Object.hasOwn(PROBLEM, p))) {
    throw new Fel(400, 'Välj omvårdnadsproblemen bland de som systemet visar.', 'ogiltig', { falt: ['process.problem'] });
  }
  const resultat0 = Array.isArray(process.resultat) ? process.resultat : [];
  if (resultat0.length > 30) throw new Fel(400, 'För många resultat.', 'ogiltig', { falt: ['process.resultat'] });
  const resultat = [];
  if (resultat0.length) {
    if (!kanRoll(atk.personal, 'vardplan')) throw new Fel(403, 'Din yrkesroll bedömer inte vårdplanens mål. Skriv resultatet under sökordet Resultat.', 'nekad');
    const r = atk.krav('vardplan', { beskrivning: 'vardplan' });
    if (r.grund === 'nodatkomst') throw new Fel(403, 'Att bedöma vårdplanens mål kräver vårdrelation till patienten på din vårdenhet. Nödåtkomst ger bara läsning.', 'nekad');
    const u = { planer: egnaPlaner(atk).filter(p => p.status === 'aktiv') };
    for (const x of resultat0) {
      const status = x?.status;
      if (!Object.hasOwn(MALSTATUS, String(status))) throw new Fel(400, 'Ange om målet är uppnått, delvis uppnått eller inte uppnått.', 'ogiltig', { falt: ['process.resultat'] });
      const m = Number.isInteger(x?.malId) ? atk.db.query('SELECT * FROM vardplan_mal WHERE id = ? AND borttagen IS NULL').get(x.malId) : null;
      const plan = m && u.planer.find(p => p.id === m.plan_id);
      if (!plan) throw new Fel(400, 'Målet finns inte i någon pågående vårdplan på din vårdenhet.', 'ogiltig', { falt: ['process.resultat'] });
      if (resultat.some(y => y.malId === m.id)) throw new Fel(400, `Målet "${m.text}" står två gånger.`, 'ogiltig', { falt: ['process.resultat'] });
      resultat.push({ malId: m.id, planId: plan.id, text: m.text, status });
    }
  }
  return { problem: [...new Set(problem)], resultat };
}

export function spara(db, anteckningId, p) {
  if (!p) return;
  sakra(db);
  db.query('INSERT OR REPLACE INTO omvardnad_process (anteckning_id, problem, resultat, sparad) VALUES (?, ?, ?, ?)').run(anteckningId, JSON.stringify(p.problem), JSON.stringify(p.resultat), iso());
}

export function lasRad(db, anteckningId) {
  if (!harTabell(db, 'omvardnad_process')) return null;
  const r = db.query('SELECT * FROM omvardnad_process WHERE anteckning_id = ?').get(anteckningId);
  return r ? { problem: JSON.parse(r.problem), resultat: JSON.parse(r.resultat) } : null;
}

// Processen som den lämnas ut med anteckningen. Målens text är den som gällde när anteckningen skrevs.
export function ut(db, anteckningId) {
  const r = lasRad(db, anteckningId);
  if (!r || (!r.problem.length && !r.resultat.length)) return null;
  return {
    problem: r.problem.filter(id => Object.hasOwn(PROBLEM, id)).map(id => ({ id, text: PROBLEM[id].text, omrade: PROBLEM[id].omrade })),
    resultat: r.resultat.map(x => ({ malId: x.malId, planId: x.planId, mal: x.text, status: x.status, statusText: MALSTATUS[x.status] })),
  };
}

// Vid signeringen förs resultatet in i vårdplanen som en bedömning av målen, med anteckningen som källa. Planens
// historik ändras aldrig, och en bedömning i en plan som har avslutats sedan utkastet sparades förs inte in.
export function vidSignering(atk, a) {
  const r = lasRad(atk.db, a.id);
  if (!r?.resultat.length) return;
  // Säkerhetsgranskningen efter runda 15: behörigheten prövas igen när resultatet förs in, med samma regel som när det
  // angavs, eftersom vårdrelationen kan ha upphört sedan utkastet sparades. Ett mål som har tagits bort får inget resultat.
  if (!kanRoll(atk.personal, 'vardplan')) throw new Fel(403, 'Din yrkesroll bedömer inte vårdplanens mål. Ta bort resultatet mot målen innan du signerar.', 'nekad');
  const g = atk.krav('vardplan', { beskrivning: 'vardplan' });
  if (g.grund === 'nodatkomst') throw new Fel(403, 'Att bedöma vårdplanens mål kräver vårdrelation till patienten på din vårdenhet. Nödåtkomst ger bara läsning. Ta bort resultatet mot målen innan du signerar.', 'nekad');
  const per = new Map();
  for (const x of r.resultat) {
    if (!atk.db.query('SELECT 1 FROM vardplan_mal WHERE id = ? AND plan_id = ? AND borttagen IS NULL').get(x.malId, x.planId)) continue;
    if (!per.has(x.planId)) per.set(x.planId, []);
    per.get(x.planId).push(x);
  }
  for (const [planId, lista] of per) {
    const plan = atk.db.query("SELECT * FROM vardplaner WHERE id = ? AND status = 'aktiv'").get(planId);
    if (!plan || !egen(atk, plan.enhet_id)) continue;
    const text = lista.map(x => `målet "${x.text}" ${MALSTATUS[x.status].toLowerCase()}`).join(', ');
    atk.db.query('INSERT INTO vardplan_historik (plan_id, tid, av, enhet_id, typ, text, detalj) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(planId, iso(), atk.personal.id, atk.personal.enhet_id, 'resultat', `Resultat i omvårdnadsanteckningen: ${text}.`, JSON.stringify({ mal: Object.fromEntries(lista.map(x => [x.malId, x.status])), anteckning: a.id }));
  }
}

// --- FHIR -------------------------------------------------------------------------------------------------------------

// Omvårdnadsproblemen och resultaten som resurser i anteckningens Composition (contained), så att koderna och
// bedömningen mot målet följer med anteckningen och har samma behörighet som den.
const GOAL_STATUS = { uppnatt: 'achieved', delvis: 'improving', ej_uppnatt: 'not-achieved' };
export function fhirInnehall(db, a, patientRef) {
  const r = ut(db, a.id);
  if (!r) return null;
  const contained = [];
  const problem = r.problem.map((p, i) => {
    const id = `problem-${i + 1}`;
    contained.push({
      resourceType: 'Condition', id,
      clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] },
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-category', code: 'problem-list-item', display: 'Problem List Item' }], text: 'Omvårdnadsproblem' }],
      code: { coding: [{ system: 'http://snomed.info/sct', code: PROBLEM[p.id].code, display: PROBLEM[p.id].display }], text: p.text },
      subject: patientRef, recordedDate: a.signerad_tid ?? a.skapad,
    });
    return { reference: `#${id}`, display: p.text };
  });
  const resultat = r.resultat.map((x, i) => {
    const id = `mal-${i + 1}`;
    contained.push({
      resourceType: 'Goal', id, lifecycleStatus: 'active',
      achievementStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/goal-achievement', code: GOAL_STATUS[x.status] }], text: x.statusText },
      description: { text: x.mal }, subject: patientRef,
      identifier: [{ system: 'https://vardkallan.404haven.se/fhir/vardplan-mal', value: String(x.malId) }],
    });
    return { reference: `#${id}`, display: `${x.mal}: ${x.statusText}` };
  });
  return { contained, problem, resultat };
}

// --- Seeden ------------------------------------------------------------------------------------------------------------

// Elin Sandberg (p04) på avdelning 72 med vårdplanen Förebyggande av fall: undersköterskans observation i morse,
// sjuksköterskans omvårdnadsanteckning i går med omvårdnadsproblem och resultat mot vårdplanens mål, och
// fysioterapeutens anteckning efter gångträningen. Läggs in före signaturerna (schema-runda9-r7.js).
export function seeda(db, bas = new Date()) {
  sakra(db);
  const finns = (t, id) => db.query(`SELECT 1 FROM ${t} WHERE id = ?`).get(id);
  if (!finns('patienter', 'p04') || !finns('personal', 'usk-kard') || !finns('personal', 'ssk-kard') || !finns('personal', 'fys-kard')) return;
  if (db.query("SELECT 1 FROM anteckningar WHERE typ IN ('Observationsanteckning', 'Fysioterapianteckning') LIMIT 1").get()) return;
  const t = (h) => new Date(bas.getTime() - h * 3600_000).toISOString();
  const vk = db.query("SELECT id FROM vardkontakter WHERE patient_id = 'p04' AND enhet_id = 'uso-kard-72' ORDER BY start DESC").get()?.id ?? null;
  const lagg = (typ, enhet, av, timmar, sokord) => Number(db.query(`INSERT INTO anteckningar (patient_id, enhet_id, vardkontakt_id, typ, kategori, sokord, forfattare_id, skapad, status, signerad_tid, signerad_av)
    VALUES ('p04', ?, ?, ?, 'omvardnad', ?, ?, ?, 'signerad', ?, ?)`).run(enhet, vk, typ, JSON.stringify(Object.entries(sokord).map(([s, text]) => ({ sokord: s, text }))), av, t(timmar), t(timmar), av).lastInsertRowid);
  const omv = lagg(TYP, 'uso-kard-72', 'ssk-kard', 20, {
    'Omvårdnadsproblem': 'Ökad risk för fall. Ostadig vid uppresning, särskilt på morgonen.',
    'Mål': 'Patienten faller inte under vårdtiden.',
    'Åtgärd': 'Hjälp vid förflyttning och toalettbesök. Larmknappen inom räckhåll. Säng i lågt läge på natten.',
    'Resultat': 'Inga fall sedan inskrivningen, men behöver fortfarande stöd vid uppresning.',
    'Rörlighet': 'Går med rollator i korridoren. Stöd av en person vid uppresning ur sängen.',
  });
  const plan = db.query("SELECT id FROM vardplaner WHERE patient_id = 'p04' AND mall = 'fall' AND status = 'aktiv'").get();
  const m = plan && db.query('SELECT * FROM vardplan_mal WHERE plan_id = ? AND borttagen IS NULL ORDER BY id').get(plan.id);
  const resultat = m ? [{ malId: m.id, planId: plan.id, text: m.text, status: 'delvis' }] : [];
  db.query('INSERT INTO omvardnad_process (anteckning_id, problem, resultat, sparad) VALUES (?, ?, ?, ?)').run(omv, JSON.stringify(['fall']), JSON.stringify(resultat), t(20));
  if (m) {
    db.query('INSERT INTO vardplan_historik (plan_id, tid, av, enhet_id, typ, text, detalj) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(plan.id, t(20), 'ssk-kard', 'uso-kard-72', 'resultat', `Resultat i omvårdnadsanteckningen: målet "${m.text}" delvis uppnått.`, JSON.stringify({ mal: { [m.id]: 'delvis' }, anteckning: omv }));
  }
  lagg('Fysioterapianteckning', 'uso-kard-mott', 'fys-kard', 6, {
    'Funktion': 'Nedsatt balans i stående. Muskelstyrkan i benen är något nedsatt efter vårdtiden.',
    'Aktivitet': 'Går 40 meter med rollator och tillsyn. Reser sig från stol med stöd av armstöden.',
    'Mål': 'Går självständigt med rollator på avdelningen inom en vecka.',
    'Åtgärd': 'Gångträning och balansövningar dagligen. Instruktion till personalen om förflyttning.',
  });
  lagg('Observationsanteckning', 'uso-kard-72', 'usk-kard', 3, {
    'Observation': 'Ostadig vid uppresning i morse och tog stöd mot väggen. Åt halva frukosten. Säger att hon är trött.',
    'Utförd åtgärd': 'Hjälp till toaletten och vid morgontoaletten. Rollatorn ställd vid sängen.',
  });
}
