// Runda 13, r1: synpunkter och jämförelser från testare i den publika testinbjudan. De sparas i en egen databas som alla
// sandlådor delar och som överlever en ny driftsättning (synpunkter.sqlite bredvid sandlådorna i driftens volym), på
// samma sätt som svaren från användartesterna (anvandartest-svar.js).
//
// Två slags rader:
//   synpunkter       det en testare skriver från vilken vy som helst: typ, allvar och fritext, och frivilligt yrke,
//                    journalsystem, hur länge och vårdform, och en kontaktuppgift.
//   jamforelser      svaret efter ett uppdrag (testinbjudan.js): lättare, ungefär lika, svårare eller går inte att
//                    jämföra mot testarens journalsystem i dag, en fritext och frivilligt hur många klick eller hur lång
//                    tid det tar där.
// Systemet fyller själv i vy, demoroll, uppdrag, version, gränssnittets hash, skärmbredd, webbläsare och tid. Klientens
// påstådda version, tid och roll används aldrig.
//
// Läsning. Bara testledaren läser, med en läskod som skapas av skriptet scripts/testinbjudan.js på servern, visas en gång
// och bara sparas som sha256. Det som behövs för att lämna en synpunkt ger ingen läsrätt. Fel läskod ger samma svar
// varje gång, och efter MAX_FEL_LASKOD fel försök i timmen från en adress stoppas fler försök.
//
// Missbruk. Tak per session och minut, per session och timme, per adress och dygn (adressen sparas bara som HMAC med en
// hemlig nyckel i en fil bredvid databasen) och totalt. Fritexten har en största längd, HTML tas inte emot, styrtecken och
// riktningstecken tas bort, och inget riktigt personnummer tas emot. Länkar blir aldrig klickbara hos testledaren:
// vyn visar texten som text, och Markdown och CSV avväpnar länkar och formler.
import { Database } from 'bun:sqlite';
import { createHash, createHmac, randomBytes, randomInt } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { Fel } from './db.js';
import { tolka, demoKontroll } from './identitet.js';
import { adressGrupp } from './anvandartest-svar.js';
// Runda 18, r1: första passet (forsta-pass.js) sparar sina mätningar och SUS i samma databas.
import { sammanstall as passSammanstall, radUt as passRadUt, susUt as passSusUt, passFor } from './forsta-pass.js';
// Tillägg 2026-11-19: inbjudningarna (inbjudan.js).
import { sammanstall as inbjudanSammanstall, sakra as sakraInbjudan, stada as stadaInbjudan } from './inbjudan.js';
import {
  TYPER, ALLVAR, YRKEN, SYSTEM, AR, VARDFORM, JAMFORELSE, HOPPADE_OVER, MAX_TEXT, MIN_TEXT, MAX_KONTAKT, MAX_MITT_SYSTEM,
  GALLRING_DAGAR, KONTAKT_DAGAR, PERSONNUMMER_TEXT, kandidater,
} from '../public/js/synpunkt-regler.js';

const DAG = 86400_000;
export const TAK = { perMinut: 5, perTimme: 30, perAdress: 150, totalt: 20000 };
export const TAK_JAMFORELSER = { perMinut: 20, perTimme: 120, perAdress: 600, totalt: 100000 };
export const MAX_FEL_LASKOD = 10;
export const MAX_LISTA = 5000;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS synpunkter (
  id INTEGER PRIMARY KEY, nummer TEXT NOT NULL UNIQUE, tid TEXT NOT NULL,
  typ TEXT NOT NULL, allvar TEXT NOT NULL, text TEXT NOT NULL, kontakt TEXT NOT NULL DEFAULT '',
  yrke TEXT NOT NULL DEFAULT '', system TEXT NOT NULL DEFAULT '', ar TEXT NOT NULL DEFAULT '', vardform TEXT NOT NULL DEFAULT '',
  vy TEXT NOT NULL, roll TEXT, roll_text TEXT, testroll TEXT NOT NULL DEFAULT '', uppdrag TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL, gransnitt TEXT NOT NULL, bredd INTEGER, webblasare TEXT NOT NULL, skapare TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jamforelser (
  id INTEGER PRIMARY KEY, nummer TEXT NOT NULL UNIQUE, tid TEXT NOT NULL,
  testroll TEXT NOT NULL, uppdrag TEXT NOT NULL, sussa TEXT NOT NULL DEFAULT '', status TEXT NOT NULL, tid_s INTEGER,
  jamforelse TEXT NOT NULL, text TEXT NOT NULL DEFAULT '', mitt_system TEXT NOT NULL DEFAULT '',
  yrke TEXT NOT NULL DEFAULT '', system TEXT NOT NULL DEFAULT '', ar TEXT NOT NULL DEFAULT '', vardform TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL, gransnitt TEXT NOT NULL, bredd INTEGER, webblasare TEXT NOT NULL, skapare TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_synpunkter_skapare ON synpunkter (skapare, tid);
CREATE INDEX IF NOT EXISTS ix_jamforelser_skapare ON jamforelser (skapare, tid);
CREATE TABLE IF NOT EXISTS synpunkt_laskoder (
  id INTEGER PRIMARY KEY, hash TEXT NOT NULL UNIQUE, namn TEXT NOT NULL, skapad TEXT NOT NULL, aterkallad TEXT
);
CREATE TABLE IF NOT EXISTS synpunkt_utskrifter (namn TEXT PRIMARY KEY, synpunkt INTEGER NOT NULL, jamforelse INTEGER NOT NULL);
-- Runda 18, r1: första passet. En rad per pass med samtycke till mätning, skapad när passet börjar, och en rad per svar
-- på SUS efter passet. Inga personuppgifter, ingen adress och inget om demons patienter (forsta-pass.js).
CREATE TABLE IF NOT EXISTS pass_matningar (
  id INTEGER PRIMARY KEY, nummer TEXT NOT NULL UNIQUE, tid TEXT NOT NULL, slut_tid TEXT,
  testroll TEXT NOT NULL, uppdrag TEXT NOT NULL, sussa TEXT NOT NULL DEFAULT '', status TEXT NOT NULL CHECK (status IN ('pagar', 'klar', 'avbruten')),
  tid_s INTEGER, tid_forsta_s INTEGER, klick INTEGER, faltbyten INTEGER, tangenter INTEGER, steg_antal INTEGER, budget INTEGER, tidsklass INTEGER,
  aterkomster INTEGER, hjalp INTEGER, sokningar INTEGER, vagledning INTEGER, avstangd INTEGER, steg TEXT NOT NULL DEFAULT '[]', uppdateringar INTEGER NOT NULL DEFAULT 0,
  yrke TEXT NOT NULL DEFAULT '', system TEXT NOT NULL DEFAULT '', ar TEXT NOT NULL DEFAULT '', vardform TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL, gransnitt TEXT NOT NULL, bredd INTEGER, webblasare TEXT NOT NULL, skapare TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pass_sus (
  id INTEGER PRIMARY KEY, nummer TEXT NOT NULL UNIQUE, tid TEXT NOT NULL, testroll TEXT NOT NULL, uppdrag TEXT NOT NULL, sussa TEXT NOT NULL DEFAULT '',
  svar TEXT NOT NULL, poang REAL NOT NULL,
  yrke TEXT NOT NULL DEFAULT '', system TEXT NOT NULL DEFAULT '', ar TEXT NOT NULL DEFAULT '', vardform TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL, gransnitt TEXT NOT NULL, webblasare TEXT NOT NULL, skapare TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_pass_matningar_skapare ON pass_matningar (skapare, tid);
CREATE INDEX IF NOT EXISTS ix_pass_sus_skapare ON pass_sus (skapare, tid);
`;

export function oppna(fil = ':memory:') {
  const db = new Database(fil, { create: true });
  if (fil !== ':memory:') { db.exec('PRAGMA journal_mode = WAL'); db.exec('PRAGMA busy_timeout = 5000'); }
  db.exec(SCHEMA);
  // Runda 18, r1: skriptets utskrifter minns också passen och SUS.
  const kol = db.query("SELECT name FROM pragma_table_info('synpunkt_utskrifter')").all().map(k => k.name);
  if (!kol.includes('pass')) db.exec('ALTER TABLE synpunkt_utskrifter ADD COLUMN pass INTEGER NOT NULL DEFAULT 0');
  if (!kol.includes('sus')) db.exec('ALTER TABLE synpunkt_utskrifter ADD COLUMN sus INTEGER NOT NULL DEFAULT 0');
  // Runda 19, r1: om vägledningen var på när testaren svarade på jämförelsefrågan (1 eller 0, tomt för äldre svar).
  const jkol = db.query("SELECT name FROM pragma_table_info('jamforelser')").all().map(k => k.name);
  if (!jkol.includes('vagledning')) db.exec('ALTER TABLE jamforelser ADD COLUMN vagledning INTEGER CHECK (vagledning IN (0, 1))');
  // Tillägg 2026-11-19: räknarna för inbjudningar, en rad per dag och kanal (inbjudan.js).
  sakraInbjudan(db);
  return db;
}

// Nyckeln för adresserna. I en fil bredvid databasen, så att taket per adress håller efter en omstart, annars slumpad.
let NYCKEL = null;
export function satNyckel({ fil = null, hex = process.env.SYNPUNKT_NYCKEL } = {}) {
  if (hex && /^[0-9a-f]{64}$/i.test(hex)) { NYCKEL = hex; return; }
  if (fil) {
    try {
      if (existsSync(fil)) { const t = readFileSync(fil, 'utf8').trim(); if (/^[0-9a-f]{64}$/i.test(t)) { NYCKEL = t; return; } }
      const ny = randomBytes(32).toString('hex');
      writeFileSync(fil, ny, { mode: 0o600 });
      NYCKEL = ny;
      return;
    } catch { /* faller tillbaka på en slumpad nyckel */ }
  }
  NYCKEL = randomBytes(32).toString('hex');
}
// Runda 18, r1: IPv6-adresser räknas per /48 (adressGrupp ger /64), så att en klient inte kommer runt taken för rutterna
// utan inloggning genom att byta adress i sitt nät. IPv4 räknas per adress.
const grupp48 = (adress) => { const g = adressGrupp(adress); return g.endsWith('::/64') ? `${g.split(':').slice(0, 3).join(':')}::/48` : g; };
export const skapareFor = (adress) => { if (!NYCKEL) satNyckel(); return createHmac('sha256', NYCKEL).update(`synpunkt:${grupp48(adress)}`).digest('hex'); };

// Webbläsaren som namn, huvudversion och operativsystem. Hela rubriken sparas aldrig.
export function webblasare(ua) {
  const s = String(ua ?? '');
  const os = /Windows/.test(s) ? 'Windows' : /iPhone|iPad|iPod/.test(s) ? 'iOS' : /Android/.test(s) ? 'Android' : /Mac OS X|Macintosh/.test(s) ? 'macOS' : /CrOS/.test(s) ? 'ChromeOS' : /Linux/.test(s) ? 'Linux' : null;
  const MONSTER = [['Edge', /Edg(?:A|iOS)?\/(\d+)/], ['Opera', /OPR\/(\d+)/], ['Samsung Internet', /SamsungBrowser\/(\d+)/], ['Firefox', /(?:Firefox|FxiOS)\/(\d+)/],
    ['Chrome', /(?:CriOS|Chrome)\/(\d+)/], ['Safari', /Version\/(\d+)[.\d]* (?:Mobile\/\S+ )?Safari/]];
  for (const [namn, re] of MONSTER) {
    const m = s.match(re);
    if (m && os) return `${namn} ${m[1]}, ${os}`;
  }
  return 'Okänd';
}

// Text som sparas: Unicode i normalform, utan styrtecken (utom radbrytning och tabb) och utan tecken som vänder
// skrivriktningen, högst två tomma rader i följd.
export function rensa(text) {
  return String(text ?? '').normalize('NFC')
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩﻿]/g, '')
    .replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
const arHtml = (t) => /<\s*[a-zA-Z!/?]/.test(t);

// Ett riktigt personnummer eller samordningsnummer, alltså med rätt kontrollsiffra och inte ett av Skatteverkets
// testnummer. Demons patienter har testpersonnummer och går därför bra.
export function riktigtPersonnummer(text) {
  for (const k of kandidater(text)) {
    const t = tolka(k);
    if (t.ok && (t.typ === 'personnummer' || t.typ === 'samordningsnummer') && demoKontroll(t)) return true;
  }
  return false;
}

const fel = (text, falt) => new Fel(400, text, 'ogiltig', { falt });
const iLista = (lista, v) => lista.some(([k]) => k === v);
function valfri(lista, v, falt, text) {
  if (v === undefined || v === null || v === '') return '';
  if (typeof v !== 'string' || !iLista(lista, v)) throw fel(text, [falt]);
  return v;
}
function fritext(v, falt, { min = 0, max, namn }) {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string') throw fel(`${namn} ska vara text.`, [falt]);
  const t = rensa(v);
  if (t.length < min) throw fel(min > 1 ? `Skriv minst ${min} tecken i ${namn.toLowerCase()}.` : `Skriv något i ${namn.toLowerCase()}.`, [falt]);
  if (t.length > max) throw fel(`${namn} får vara högst ${max} tecken. Nu är den ${t.length}.`, [falt]);
  if (arHtml(t)) throw fel(`${namn} ska vara vanlig text. HTML tas inte emot.`, [falt]);
  if (riktigtPersonnummer(t)) throw fel(PERSONNUMMER_TEXT, [falt]);
  return t;
}
// Profilen som testaren kan fylla i en gång: yrke, journalsystem, hur länge och vårdform. Allt är frivilligt.
export function profil(body = {}) {
  return {
    yrke: valfri(YRKEN, body.yrke, 'yrke', 'Välj yrke ur listan, eller låt bli.'),
    system: valfri(SYSTEM, body.system, 'system', 'Välj journalsystem ur listan, eller låt bli.'),
    ar: valfri(AR, body.ar, 'ar', 'Välj hur länge ur listan, eller låt bli.'),
    vardform: valfri(VARDFORM, body.vardform, 'vardform', 'Välj region, kommun, privat vård eller annat, eller låt bli.'),
  };
}
// Vyn är adressens väg utan fråga, till exempel #/patient/p01/lakemedel. Patientens id i demon är påhittat.
export const vyFor = (v) => { const vag = String(v ?? '').split('?')[0]; return /^#\/[A-Za-z0-9/_-]{0,120}$/.test(vag) || vag === '#/' ? vag : 'okänd'; };
const breddFor = (b) => (Number.isInteger(b) && b >= 200 && b <= 10000 ? b : null);

// Kort nummer som bekräftelse: en bokstav för slaget och sex tecken utan förväxlingsbara tecken.
const TECKEN = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function nyttNummer(db, prefix, tabell, kol = 'nummer') {
  for (let i = 0; i < 20; i++) {
    const n = `${prefix}-${Array.from({ length: 6 }, () => TECKEN[randomInt(TECKEN.length)]).join('')}`;
    if (!db.query(`SELECT 1 FROM ${tabell} WHERE ${kol} = ?`).get(n)) return n;
  }
  throw new Fel(500, 'Kunde inte skapa ett nummer.', 'fel');
}

// Taken. session är ett objekt per webbläsarsession, där tiderna för de senaste raderna hålls.
export function provaTak(db, tabell, { session, skapare, nu, tak, nyckel }) {
  const ms = nu.getTime();
  const tider = (session[nyckel] ?? []).filter(x => x > ms - 3600_000);
  session[nyckel] = tider;
  if (db.query(`SELECT count(*) AS n FROM ${tabell}`).get().n >= tak.totalt) throw new Fel(503, 'Demon tar inte emot fler synpunkter just nu, eftersom taket för hela testet är nått. Tack för att du ville hjälpa till.', 'fullt');
  if (tider.filter(x => x > ms - 60_000).length >= tak.perMinut) throw new Fel(429, `Högst ${tak.perMinut} på en minut. Vänta en stund och skicka sedan igen. Det du har skrivit finns kvar.`, 'for_manga');
  if (tider.length >= tak.perTimme) throw new Fel(429, `Högst ${tak.perTimme} i timmen från samma webbläsare. Vänta en stund och skicka sedan igen.`, 'for_manga');
  const sedan = new Date(ms - DAG).toISOString();
  if (db.query(`SELECT count(*) AS n FROM ${tabell} WHERE skapare = ? AND tid > ?`).get(skapare, sedan).n >= tak.perAdress) throw new Fel(429, 'Det har kommit väldigt många svar från din adress i dag. Försök igen i morgon.', 'for_manga');
  tider.push(ms);
}

// Sparar en synpunkt. ctx kommer från servern: adress, session, roll, testroll, uppdrag, version, gränssnitt och
// webbläsare. Bara fälten typ, allvar, text, kontakt, yrke, system, ar, vardform, vy och bredd läses ur anropet.
export function spara(db, body = {}, { nu = new Date(), session = {}, adress = 'okänd', roll = null, rollText = null, testroll = '', uppdrag = '', version, gransnitt, webblasare: wb = 'Okänd', tak = TAK } = {}) {
  if (!iLista(TYPER, body.typ)) throw fel('Välj vad synpunkten gäller.', ['typ']);
  if (!iLista(ALLVAR, body.allvar)) throw fel('Välj hur allvarligt det är för dig.', ['allvar']);
  const text = fritext(body.text, 'text', { min: MIN_TEXT, max: MAX_TEXT, namn: 'Texten' });
  const kontakt = fritext(body.kontakt, 'kontakt', { max: MAX_KONTAKT, namn: 'Kontaktuppgiften' });
  const p = profil(body);
  const skapare = skapareFor(adress);
  provaTak(db, 'synpunkter', { session, skapare, nu, tak, nyckel: 'synpunkterTider' });
  const nummer = nyttNummer(db, 'S', 'synpunkter');
  db.query(`INSERT INTO synpunkter (nummer, tid, typ, allvar, text, kontakt, yrke, system, ar, vardform, vy, roll, roll_text, testroll, uppdrag, version, gransnitt, bredd, webblasare, skapare)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(nummer, nu.toISOString(), body.typ, body.allvar, text, kontakt, p.yrke, p.system, p.ar, p.vardform,
    vyFor(body.vy), roll, rollText, testroll, uppdrag, String(version), String(gransnitt).slice(0, 64), breddFor(body.bredd), wb, skapare);
  return { nummer };
}

// Sparar jämförelsen efter ett uppdrag. Uppdraget och dess status kommer från testinbjudan.js, inte från klienten.
export function sparaJamforelse(db, body = {}, { nu = new Date(), session = {}, adress = 'okänd', testroll, uppdrag, sussa = '', status, tidS = null, profil: pr = {}, version, gransnitt, webblasare: wb = 'Okänd', tak = TAK_JAMFORELSER } = {}) {
  if (!iLista(JAMFORELSE, body.jamforelse)) throw fel('Välj om det var lättare, ungefär lika eller svårare, eller att det inte går att jämföra.', ['jamforelse']);
  const text = fritext(body.text, 'text', { max: MAX_TEXT, namn: 'Texten' });
  const mitt = fritext(body.mittSystem, 'mittSystem', { max: MAX_MITT_SYSTEM, namn: 'Klick eller tid i ditt system' });
  const p = profil({ ...pr, ...profilUrBody(body) });
  // Runda 19, r1: bara sant eller falskt tas emot. Utan värde sparas inget.
  if (body.vagledning !== undefined && body.vagledning !== null && typeof body.vagledning !== 'boolean') throw fel('Vägledningen ska vara sann eller falsk.', ['vagledning']);
  const vagledning = typeof body.vagledning === 'boolean' ? Number(body.vagledning) : null;
  const skapare = skapareFor(adress);
  provaTak(db, 'jamforelser', { session, skapare, nu, tak, nyckel: 'jamforelserTider' });
  const nummer = nyttNummer(db, 'J', 'jamforelser');
  db.query(`INSERT INTO jamforelser (nummer, tid, testroll, uppdrag, sussa, status, tid_s, jamforelse, text, mitt_system, yrke, system, ar, vardform, version, gransnitt, bredd, webblasare, skapare)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(nummer, nu.toISOString(), testroll, uppdrag, sussa, status, Number.isInteger(tidS) ? tidS : null, body.jamforelse, text, mitt,
    p.yrke, p.system, p.ar, p.vardform, String(version), String(gransnitt).slice(0, 64), breddFor(body.bredd), wb, skapare);
  db.query('UPDATE jamforelser SET vagledning = ? WHERE nummer = ?').run(vagledning, nummer);
  return { nummer };
}
const profilUrBody = (b) => Object.fromEntries(['yrke', 'system', 'ar', 'vardform'].filter(k => b[k] !== undefined).map(k => [k, b[k]]));

// Läskoderna. Koden lämnas ut en gång och sparas bara som sha256.
const hash = (kod) => createHash('sha256').update(String(kod)).digest('hex');
export function skapaLaskod(db, { namn = 'testledare', nu = new Date() } = {}) {
  const kod = randomBytes(32).toString('base64url');
  const id = Number(db.query('INSERT INTO synpunkt_laskoder (hash, namn, skapad) VALUES (?, ?, ?)').run(hash(kod), String(namn).slice(0, 60), nu.toISOString()).lastInsertRowid);
  return { id, kod };
}
export const giltigLaskod = (db, kod) => typeof kod === 'string' && kod.length >= 32 && kod.length <= 100
  && Boolean(db.query('SELECT 1 FROM synpunkt_laskoder WHERE hash = ? AND aterkallad IS NULL').get(hash(kod)));
export const laskoder = (db) => db.query('SELECT id, namn, skapad, aterkallad FROM synpunkt_laskoder ORDER BY id').all();
export function aterkallaLaskod(db, id, nu = new Date()) {
  return db.query('UPDATE synpunkt_laskoder SET aterkallad = ? WHERE id = ? AND aterkallad IS NULL').run(nu.toISOString(), Number(id)).changes;
}

const ALLVAR_KORT = { stoppar: 'stoppar arbetet', stor: 'besvärligt', liten: 'detalj eller förslag' };
const text = (lista, k) => lista.find(([x]) => x === k)?.[1] ?? '';
const synpunktUt = (r) => ({
  nummer: r.nummer, tid: r.tid, typ: r.typ, typText: text(TYPER, r.typ), allvar: r.allvar, allvarText: text(ALLVAR, r.allvar), text: r.text, kontakt: r.kontakt,
  yrke: r.yrke, system: r.system, ar: r.ar, vardform: r.vardform, vy: r.vy, roll: r.roll, rollText: r.roll_text, testroll: r.testroll, uppdrag: r.uppdrag,
  version: r.version, gransnitt: r.gransnitt.slice(0, 12), bredd: r.bredd, webblasare: r.webblasare,
});
const jamforelseUt = (r) => ({
  nummer: r.nummer, tid: r.tid, testroll: r.testroll, uppdrag: r.uppdrag, sussa: r.sussa, status: r.status, tidS: r.tid_s, jamforelse: r.jamforelse,
  text: r.text, mittSystem: r.mitt_system, yrke: r.yrke, system: r.system, ar: r.ar, vardform: r.vardform, version: r.version,
  gransnitt: r.gransnitt.slice(0, 12), bredd: r.bredd, webblasare: r.webblasare,
  // Runda 19, r1.
  vagledning: r.vagledning == null ? null : r.vagledning === 1,
});

// Filtret som testledarens vy och exporten delar. Okända värden ignoreras.
function filtrera(rader, f = {}) {
  const s = (v) => (typeof v === 'string' && v ? v : null);
  const typ = s(f.typ); const allvar = s(f.allvar); const roll = s(f.roll); const vy = s(f.vy); const system = s(f.system); const testroll = s(f.testroll);
  return rader.filter(r => (!typ || r.typ === typ) && (!allvar || r.allvar === allvar) && (!roll || (r.roll ?? '') === roll) && (!vy || r.vy === vy)
    && (!system || r.system === system) && (!testroll || r.testroll === testroll));
}
function filtreraJ(rader, f = {}) {
  const s = (v) => (typeof v === 'string' && v ? v : null);
  const system = s(f.system); const testroll = s(f.testroll);
  return rader.filter(r => (!system || r.system === system) && (!testroll || r.testroll === testroll));
}

// Jämförelserna per uppdrag och journalsystem: antal och andel lättare, lika, svårare och går inte att jämföra.
export function perUppdrag(jamforelser, namnFor = () => null) {
  const grupper = new Map();
  for (const r of jamforelser) {
    for (const system of ['alla', r.system || 'okänt']) {
      const k = `${r.testroll}|${r.uppdrag}|${system}`;
      const g = grupper.get(k) ?? { testroll: r.testroll, uppdrag: r.uppdrag, sussa: r.sussa, titel: namnFor(r.testroll, r.uppdrag), system, antal: 0, klara: 0, hoppade: 0, lattare: 0, lika: 0, svarare: 0, kan_inte: 0, medVagledning: 0, utanVagledning: 0, texter: [] };
      g.antal++;
      // Runda 19, r1: hur många som hade vägledningen på eller avstängd.
      if (r.vagledning === true) g.medVagledning++; else if (r.vagledning === false) g.utanVagledning++;
      if (r.status === 'klar') g.klara++; else if (r.status === HOPPADE_OVER) g.hoppade++;
      g[r.jamforelse]++;
      if (r.text && system === 'alla') g.texter.push({ jamforelse: r.jamforelse, system: r.system, text: r.text, mittSystem: r.mittSystem });
      grupper.set(k, g);
    }
  }
  return [...grupper.values()].map(g => {
    const jamforbara = g.lattare + g.lika + g.svarare;
    const andel = (n) => (jamforbara ? Math.round((n / jamforbara) * 100) : null);
    return { ...g, andelLattare: andel(g.lattare), andelLika: andel(g.lika), andelSvarare: andel(g.svarare) };
  }).sort((a, b) => a.testroll.localeCompare(b.testroll) || a.uppdrag.localeCompare(b.uppdrag, 'sv', { numeric: true }) || (a.system === 'alla' ? -1 : b.system === 'alla' ? 1 : a.system.localeCompare(b.system)));
}

const raknaPer = (rader, nyckel) => {
  const m = {};
  for (const r of rader) { const k = r[nyckel] || 'okänd'; m[k] = (m[k] ?? 0) + 1; }
  return Object.entries(m).map(([k, n]) => ({ nyckel: k, antal: n })).sort((a, b) => b.antal - a.antal || a.nyckel.localeCompare(b.nyckel));
};

// Allt för testledaren, det senaste först, högst MAX_LISTA av varje slag.
export function lista(db, { filter = {}, namnFor } = {}) {
  const alla = db.query('SELECT * FROM synpunkter ORDER BY id DESC LIMIT ?').all(MAX_LISTA).map(synpunktUt);
  const allaJ = db.query('SELECT * FROM jamforelser ORDER BY id DESC LIMIT ?').all(MAX_LISTA).map(jamforelseUt);
  const synpunkter = filtrera(alla, filter);
  const jamforelser = filtreraJ(allaJ, filter);
  return {
    antal: { synpunkter: db.query('SELECT count(*) AS n FROM synpunkter').get().n, jamforelser: db.query('SELECT count(*) AS n FROM jamforelser').get().n },
    synpunkter, jamforelser,
    perVy: raknaPer(synpunkter, 'vy'), perTyp: raknaPer(synpunkter, 'typ'), perRoll: raknaPer(synpunkter, 'roll'), perAllvar: raknaPer(synpunkter, 'allvar'),
    perUppdrag: perUppdrag(jamforelser, namnFor),
    // Runda 18, r1: första passet per yrkesroll och uppgift, och SUS.
    pass: passSammanstall(db, { filter }),
    // Tillägg 2026-11-19: bara antal besök och genomförda pass per kanal.
    inbjudningar: inbjudanSammanstall(db),
    val: { roller: [...new Set(alla.map(r => r.roll ?? ''))], vyer: [...new Set(alla.map(r => r.vy))].sort(), testroller: [...new Set([...alla, ...allaJ, ...db.query('SELECT DISTINCT testroll FROM pass_matningar').all()].map(r => r.testroll).filter(Boolean))] },
  };
}

// Avväpning för Markdown: inga länkar som blir klickbara, inga bilder och inget HTML. Specialtecken escapas.
export function mdText(t) {
  return String(t ?? '')
    .replace(/[\\`*_[\]<>#|~!]/g, (c) => `\\${c}`)
    .replace(/\bhttp(s?):\/\//gi, 'hxxp$1://')
    .replace(/\bwww\./gi, (m) => `${m.slice(0, 3)}[.]`)
    .replace(/\n/g, '  \n');
}
// En CSV-cell: semikolon som avgränsare, citattecken vid behov och en apostrof före något som ett kalkylprogram tolkar
// som en formel.
function cell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const datumSv = (d) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
const tidSv = (iso) => new Date(iso).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' }).slice(0, 16);

function synpunktMd(s) {
  const om = [s.yrke && text(YRKEN, s.yrke), s.system && `arbetar i ${text(SYSTEM, s.system)}`, s.ar && text(AR, s.ar).toLowerCase(), s.vardform && text(VARDFORM, s.vardform).toLowerCase()].filter(Boolean).join(', ');
  return [
    `### ${s.nummer}: ${mdText(s.typText)} (${ALLVAR_KORT[s.allvar] ?? ''})`, '',
    `${tidSv(s.tid)}, vy ${mdText(s.vy)}, ${s.roll ? `inloggad som ${mdText(s.rollText ?? s.roll)}` : 'inte inloggad'}${s.uppdrag ? `, uppdrag ${mdText(s.uppdrag)}` : ''}. Version ${mdText(s.version)}, gränssnitt ${mdText(s.gransnitt)}, ${mdText(s.webblasare)}${s.bredd ? `, ${s.bredd} px bred skärm` : ''}.`,
    om ? `Testaren: ${mdText(om)}.` : '', s.kontakt ? `Vill bli kontaktad: ${mdText(s.kontakt)}` : '', '',
    mdText(s.text), '',
  ].filter((r, i, a) => r !== '' || a[i - 1] !== '').join('\n');
}
function perUppdragMd(rader) {
  const r = ['| Roll | Uppdrag | Sussa | Journalsystem | Svar | Klara | Hoppade | Lättare | Lika | Svårare | Går inte att jämföra | Med vägledning | Utan vägledning |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const g of rader) {
    const p = (n, a) => `${n}${a == null ? '' : ` (${a} %)`}`;
    r.push(`| ${mdText(g.testroll)} | ${mdText(g.titel ?? g.uppdrag)} | ${mdText(g.sussa)} | ${g.system === 'alla' ? 'alla' : mdText(text(SYSTEM, g.system) || g.system)} | ${g.antal} | ${g.klara} | ${g.hoppade} | ${p(g.lattare, g.andelLattare)} | ${p(g.lika, g.andelLika)} | ${p(g.svarare, g.andelSvarare)} | ${g.kan_inte} | ${g.medVagledning} | ${g.utanVagledning} |`);
  }
  return r.join('\n');
}

// Runda 18, r1: första passet i Markdown, per yrkesroll och uppgift.
const tal1 = (v) => (v == null ? '' : Number(v).toLocaleString('sv-SE', { maximumFractionDigits: 1 }));
const median = (s) => (s?.n ? tal1(s.median) : '');
function passMd(p) {
  if (!p.perUppgift.length) return ['Inga pass än.'];
  const r = ['Tiden är serverns, från svaret på frågan om mätning till att uppgiften är gjord. Steg är klick, fältbyten och tangenter som i klickbudgeten. Medianerna gäller de klarade passen med mätning.', '',
    '| Roll | Uppgift | Sussa | Pass | Klarade | Avbrutna | Pågår | Tid, median (s) | Tidsklass (min) | Steg, median | Budget | Inom budget | Fastnar oftast | SUS, medel (sd, antal) |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const g of p.perUppgift) {
    const fast = g.fastnar.slice(0, 3).map(f => `${mdText(f.id)} (${f.antal})`).join(', ');
    r.push(`| ${mdText(g.testroll)} | ${mdText(g.titel)} | ${mdText(g.sussa ?? '')} | ${g.antal} | ${g.klara}${g.andelKlara == null ? '' : ` (${g.andelKlara} %)`} | ${g.avbrutna} | ${g.pagar} | ${median(g.tidS)} | ${g.tidsklass ?? ''} | ${median(g.steg)} | ${g.budget ?? ''} | ${g.inomBudget} | ${fast} | ${g.sus.n ? `${tal1(g.sus.medel)} (${g.sus.sd == null ? 'en' : tal1(g.sus.sd)}, ${g.sus.n})` : ''} |`);
  }
  r.push('', p.sus.n ? `SUS efter passet, alla roller: medel ${tal1(p.sus.medel)}, standardavvikelse ${p.sus.sd == null ? 'saknas' : tal1(p.sus.sd)}, median ${tal1(p.sus.median)}, ${tal1(p.sus.min)} till ${tal1(p.sus.max)}, ${p.sus.n} svar.` : 'SUS efter passet: inga svar.');
  return r;
}

// Exporten för testledaren som fil. format: csv (synpunkterna), csv-uppdrag (jämförelserna), csv-pass (första passen),
// csv-sus (SUS efter passen) eller md (allt).
export function exportera(db, { format = 'csv', filter = {}, namnFor, nu = new Date() } = {}) {
  const l = lista(db, { filter, namnFor });
  const dag = datumSv(nu);
  if (format === 'csv') {
    const kol = ['nummer', 'tid', 'typ', 'allvar', 'text', 'yrke', 'system', 'ar', 'vardform', 'kontakt', 'vy', 'roll', 'testroll', 'uppdrag', 'version', 'gransnitt', 'bredd', 'webblasare'];
    const rader = [kol.join(';'), ...l.synpunkter.map(s => kol.map(k => cell(s[k])).join(';'))];
    return { text: `${rader.join('\n')}\n`, contentType: 'text/csv; charset=utf-8', namn: `synpunkter-${dag}.csv` };
  }
  if (format === 'csv-uppdrag') {
    const kol = ['nummer', 'tid', 'testroll', 'uppdrag', 'sussa', 'status', 'tidS', 'jamforelse', 'vagledning', 'text', 'mittSystem', 'yrke', 'system', 'ar', 'vardform', 'version', 'gransnitt', 'bredd', 'webblasare'];
    const rader = [kol.join(';'), ...l.jamforelser.map(s => kol.map(k => cell(s[k])).join(';'))];
    return { text: `${rader.join('\n')}\n`, contentType: 'text/csv; charset=utf-8', namn: `jamforelser-${dag}.csv` };
  }
  // Runda 18, r1: första passen och SUS, en rad per pass eller svar.
  if (format === 'csv-pass' || format === 'csv-sus') {
    const f = (v) => (typeof v === 'string' && v ? v : null);
    const ok = (r) => (!f(filter.system) || r.system === filter.system) && (!f(filter.testroll) || r.testroll === filter.testroll);
    const pass = format === 'csv-pass';
    const rader = db.query(`SELECT * FROM ${pass ? 'pass_matningar' : 'pass_sus'} ORDER BY id DESC LIMIT ?`).all(MAX_LISTA).filter(ok).map(pass ? passRadUt : passSusUt);
    const kol = pass
      ? ['nummer', 'tid', 'slutTid', 'testroll', 'uppdrag', 'sussa', 'status', 'tidS', 'tidForstaS', 'klick', 'faltbyten', 'tangenter', 'stegAntal', 'budget', 'tidsklass', 'aterkomster', 'hjalp', 'sokningar', 'vagledning', 'avstangd', 'steg', 'yrke', 'system', 'ar', 'vardform', 'version', 'gransnitt', 'bredd', 'webblasare']
      : ['nummer', 'tid', 'testroll', 'uppdrag', 'sussa', 'svar', 'poang', 'yrke', 'system', 'ar', 'vardform', 'version', 'gransnitt', 'webblasare'];
    const rubrik = kol.map(k => (k === 'stegAntal' ? 'steg_antal' : k)).join(';');
    return { text: `${[rubrik, ...rader.map(x => kol.map(k => cell(x[k])).join(';'))].join('\n')}\n`, contentType: 'text/csv; charset=utf-8', namn: `${pass ? 'forsta-pass' : 'sus-efter-pass'}-${dag}.csv` };
  }
  const md = [
    `# Synpunkter och jämförelser från testinbjudan, ${dag}`, '',
    `${l.synpunkter.length} synpunkter och ${l.jamforelser.length} svar efter uppdrag med det valda filtret.`, '',
    '## Jämförelse per uppdrag och journalsystem', '',
    'Andelarna räknas på dem som kunde jämföra (lättare, lika eller svårare).', '',
    l.perUppdrag.length ? perUppdragMd(l.perUppdrag) : 'Inga svar än.', '',
    // Runda 18, r1: första passet.
    '## Första passet', '', ...passMd(l.pass), '',
    '## Fritexter efter uppdragen', '',
    ...l.perUppdrag.filter(g => g.system === 'alla' && g.texter.length).flatMap(g => [`### ${mdText(g.testroll)}: ${mdText(g.titel ?? g.uppdrag)}`, '',
      ...g.texter.map(t => `- ${mdText(text(JAMFORELSE, t.jamforelse))}${t.system ? ` (${mdText(text(SYSTEM, t.system))})` : ''}: ${mdText(t.text)}${t.mittSystem ? ` Hos testaren: ${mdText(t.mittSystem)}` : ''}`), '']),
    '## Synpunkter', '',
    ...l.synpunkter.map(synpunktMd),
  ];
  return { text: `${md.join('\n')}\n`, contentType: 'text/markdown; charset=utf-8', namn: `synpunkter-${dag}.md` };
}

// Skriptet på servern: de synpunkter och jämförelser som har kommit sedan förra gången, som Markdown.
export function nyaSomMarkdown(db, { namn = 'skript', namnFor, markera = true, nu = new Date() } = {}) {
  const forra = db.query('SELECT * FROM synpunkt_utskrifter WHERE namn = ?').get(namn) ?? { synpunkt: 0, jamforelse: 0, pass: 0, sus: 0 };
  const s = db.query('SELECT * FROM synpunkter WHERE id > ? ORDER BY id').all(forra.synpunkt);
  const j = db.query('SELECT * FROM jamforelser WHERE id > ? ORDER BY id').all(forra.jamforelse);
  // Runda 18, r1: de pass och SUS-svar som har kommit sedan förra utskriften. Ett pass som pågick står med sin status.
  const pa = db.query('SELECT * FROM pass_matningar WHERE id > ? ORDER BY id').all(forra.pass ?? 0);
  const su = db.query('SELECT * FROM pass_sus WHERE id > ? ORDER BY id').all(forra.sus ?? 0);
  const r = [`# Nya synpunkter, ${tidSv(nu.toISOString())}`, '', `${s.length} nya synpunkter och ${j.length} nya svar efter uppdrag sedan förra utskriften, och ${pa.length} nya pass och ${su.length} nya svar på SUS efter första passet.`, ''];
  if (j.length) r.push('## Jämförelse per uppdrag och journalsystem (de nya svaren)', '', perUppdragMd(perUppdrag(j.map(jamforelseUt), namnFor)), '');
  if (pa.length || su.length) r.push('## Första passet (de nya passen)', '');
  for (const x of pa) r.push(`- ${mdText(x.nummer)}: ${mdText(x.testroll)}, ${mdText(passFor(x.testroll)?.titel ?? x.uppdrag)}, ${x.status === 'klar' ? 'klarat' : x.status === 'avbruten' ? 'avbrutet' : 'pågår eller övergivet'}${x.tid_s != null ? `, ${x.tid_s} s` : ''}${x.steg_antal != null ? `, ${x.steg_antal} steg mot budgeten ${x.budget}` : ''}${x.system ? `, arbetar i ${mdText(text(SYSTEM, x.system))}` : ''}.`);
  for (const x of su) r.push(`- ${mdText(x.nummer)}: SUS ${tal1(x.poang)} efter passet ${mdText(x.testroll)}, ${mdText(passFor(x.testroll)?.titel ?? x.uppdrag)}.`);
  if (pa.length || su.length) r.push('');
  if (s.length) r.push('## Synpunkter', '', ...s.map(x => synpunktMd(synpunktUt(x))));
  if (markera) {
    db.query('INSERT INTO synpunkt_utskrifter (namn, synpunkt, jamforelse, pass, sus) VALUES (?, ?, ?, ?, ?) ON CONFLICT(namn) DO UPDATE SET synpunkt = excluded.synpunkt, jamforelse = excluded.jamforelse, pass = excluded.pass, sus = excluded.sus')
      .run(namn, s.at(-1)?.id ?? forra.synpunkt, j.at(-1)?.id ?? forra.jamforelse, pa.at(-1)?.id ?? forra.pass ?? 0, su.at(-1)?.id ?? forra.sus ?? 0);
  }
  return { antal: s.length + j.length + pa.length + su.length, synpunkter: s.length, jamforelser: j.length, pass: pa.length, sus: su.length, text: `${r.join('\n')}\n` };
}

// Gallring: kontaktuppgiften efter KONTAKT_DAGAR och raden efter GALLRING_DAGAR.
export function stada(db, { nu = new Date() } = {}) {
  const kontakt = new Date(nu.getTime() - KONTAKT_DAGAR * DAG).toISOString();
  const grans = new Date(nu.getTime() - GALLRING_DAGAR * DAG).toISOString();
  const k = db.query("UPDATE synpunkter SET kontakt = '' WHERE kontakt <> '' AND tid < ?").run(kontakt).changes;
  const s = db.query('DELETE FROM synpunkter WHERE tid < ?').run(grans).changes;
  const j = db.query('DELETE FROM jamforelser WHERE tid < ?').run(grans).changes;
  // Runda 18, r1: första passen och SUS gallras på samma sätt.
  const pa = db.query('DELETE FROM pass_matningar WHERE tid < ?').run(grans).changes;
  const su = db.query('DELETE FROM pass_sus WHERE tid < ?').run(grans).changes;
  // Tillägg 2026-11-19: räknarna för inbjudningar, per dag.
  const ib = stadaInbjudan(db, new Date(nu.getTime() - GALLRING_DAGAR * DAG));
  return { kontakter: k, synpunkter: s, jamforelser: j, pass: pa, sus: su, inbjudningar: ib };
}
