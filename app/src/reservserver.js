// Runda 15, r3 (Sussa 11.2.1.8, KD1.1.3.3, KD1.1.3.6, KD1.1.1.11 och KD1.2.1.4): en fristående reservserver.
//
// Reservservern är samma program som kärnsystemet, startat på en annan plats med en inställning (RESERVSERVER=1) eller
// med kommandot `bun src/reservserver.js`. Den läser den senaste verifierade säkerhetskopian från platserna där
// kärnsystemet lägger sina kopior (sakerhetskopior.js), kontrollerar den på samma sätt som vid en återställning
// (kontrollsumman, att databasen är hel och att loggarnas hashkedjor håller) och läser den från den andra platsen om den
// första är skadad. Den ändrar aldrig något på platserna.
//
// Den kan bara läsas. Varje anrop som skulle ändra journalen nekas med en förklaring på vanlig svenska (skrivningNekad),
// och de viktigaste tabellerna i journalen har dessutom triggrar som stoppar en ändring i databasen, så att inte heller
// ett fel i koden kan registrera något på reservservern. Det som går att göra är att logga in, göra ett aktivt val och
// läsa. Varje läsning loggas i åtkomstloggen precis som i kärnsystemet, och loggraderna skrivs också till en fil på
// reservserverns egen disk när de skrivs (RESERV_LOGG), så att de finns kvar om reservservern stannar. När kärnsystemet
// är i drift igen läses filen in i kärnsystemets logg med kommandot `bun src/reservserver.js --las-in-logg <fil>
// --databas <fil>` (lasInLogg).
//
// Reservservern säger tydligt att den är en reservserver och hur gamla uppgifterna är: i varje svar om sessionen, i
// hälsokontrollen och i en rad överst på varje sida.
import { Database } from 'bun:sqlite';
import { existsSync, readFileSync, readdirSync, appendFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Fel, iso } from './db.js';
import * as sakerhetslogg from './sakerhetslogg.js';
import { verifieraKopia } from './sakerhetskopior.js';
import { loggaRad, hashFor } from './logg.js';

// Tabellerna i journalen som aldrig får ändras på reservservern. Läsningar som håller härledda uppgifter aktuella
// (till exempel en dosändring vars datum har kommit) ändrar andra tabeller och stoppas inte.
export const SKYDDADE = ['patienter', 'anteckningar', 'matvarden', 'diagnoser', 'administreringar', 'remisser', 'overkanslighet', 'uppmarksamhet',
  'sparrar', 'vardkontakter', 'mellanarkiv_handlingar', 'mellanarkiv_paket', 'sammanhallen_samtycken', 'identiteter'];
const TEXT = 'Reservservern kan bara läsas.';

// Anrop som ändrar något och som ändå görs på reservservern: inloggningen och utloggningen, förlängningen av
// inloggningen, ett aktivt val och loggen från läsläget. Allt annat nekas.
const TILLATNA = [/^\/api\/login(\/|$)/, /^\/api\/logout$/, /^\/api\/session\/forlang$/, /^\/api\/patient\/[^/]+\/val$/, /^\/api\/lasekopia\/(logg|krypterad-logg)$/];
export const tillatenSkrivning = (vag) => TILLATNA.some(r => r.test(vag));

const nycklar = (katalog) => (katalog && existsSync(katalog) ? readdirSync(katalog).filter(x => /^[0-9a-f]{32}$/.test(x)) : []);
const lasIndex = (platser, k) => {
  for (const p of platser) {
    try { return JSON.parse(readFileSync(join(p, k, 'index.json'), 'utf8')); } catch { /* nästa plats */ }
  }
  return [];
};
const packaUpp = (b) => {
  if (!b) return null;
  if (b[0] !== 0x28 || b[1] !== 0xb5 || b[2] !== 0x2f || b[3] !== 0xfd) return b;
  try { return Buffer.from(Bun.zstdDecompressSync(b)); } catch { return null; }
};
const lasFil = (p, k, fil) => { try { return packaUpp(readFileSync(join(p, k, fil))); } catch { return null; } };

// Den senaste verifierade kopian på platserna. nyckel väljer en sandlåda (katalogen med kopiorna, som sidan
// Säkerhetskopior visar); utan nyckel tas den senaste kopian av alla. Ger kopians data och vad som är känt om den, eller
// kastar Fel om ingen kopia håller.
export function senasteKopia({ katalog, andraKatalog = null, nyckel = null } = {}) {
  const platser = [katalog, andraKatalog].filter(Boolean);
  if (!platser.length) throw new Fel(500, 'Reservservern vet inte var säkerhetskopiorna finns. Ange KOPIOR_KATALOG och KOPIOR_ANDRA.', 'fel');
  if (nyckel && !/^[0-9a-f]{32}$/.test(nyckel)) throw new Fel(500, 'Nyckeln för sandlådan ska vara 32 tecken 0 till 9 och a till f.', 'fel');
  const kandidater = [];
  for (const k of nyckel ? [nyckel] : [...new Set(platser.flatMap(nycklar))]) {
    for (const post of lasIndex(platser, k)) if (post.verifierad) kandidater.push({ k, post });
  }
  kandidater.sort((a, b) => String(b.post.tid).localeCompare(String(a.post.tid)));
  const forsok = [];
  for (const { k, post } of kandidater) {
    for (let i = 0; i < platser.length; i++) {
      const data = lasFil(platser[i], k, post.fil);
      const v = verifieraKopia(data, post.sha256);
      forsok.push({ kopia: post.id, plats: i + 1, ok: v.ok });
      if (v.ok) return { data, nyckel: k, kopia: { id: post.id, tid: post.tid, sha256: post.sha256, byte: post.byte, plats: i + 1, kontroller: v.kontroller }, forsok };
    }
  }
  throw new Fel(500, kandidater.length ? 'Ingen av säkerhetskopiorna håller på någon av platserna. Reservservern startar inte.' : 'Det finns ingen verifierad säkerhetskopia på platserna. Reservservern startar inte.', 'fel', { forsok });
}

// Triggrar som gör de viktigaste tabellerna omöjliga att ändra. Åtkomstloggen och säkerhetsloggen skrivs som vanligt.
export function lasEndast(db) {
  const finns = new Set(db.query("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(r => r.name));
  for (const t of SKYDDADE.filter(x => finns.has(x))) {
    for (const h of ['INSERT', 'UPDATE', 'DELETE']) db.exec(`CREATE TRIGGER IF NOT EXISTS reservserver_${t}_${h.toLowerCase()} BEFORE ${h} ON "${t}" BEGIN SELECT RAISE(ABORT, '${TEXT}'); END;`);
  }
}

// Säkerhetsgranskningen efter sammanslagningen av runda 15: loggen från reservservern signeras rad för rad med en
// nyckel som kärnsystemet och reservservern delar (RESERV_LOGG_NYCKEL, minst 32 tecken, i driftens hemligheter och
// aldrig i databasen, som andra signeringsnycklar). Signaturen täcker radens hash, som täcker raden och kedjan bakåt,
// och vilken kopia reservservern läste med dess sista rad i åtkomstloggen, så att kärnsystemet kan kräva att loggen
// börjar direkt efter kopian. De simulerade loggarna i demon signeras med en nyckel som bara finns i processens minne.
export const loggNyckelUrMiljo = () => { const v = process.env.RESERV_LOGG_NYCKEL; return typeof v === 'string' && v.length >= 32 ? Buffer.from(v) : null; };
const DEMO_NYCKEL = randomBytes(32);
export const loggMac = (nyckel, r, m) => createHmac('sha256', nyckel).update(JSON.stringify([r.id, r.hash, m.kopia ?? null, m.kopiaSha256 ?? null, m.kopiaLoggId ?? null, m.nyckel ?? null])).digest('hex');
function macOk(nyckel, r) {
  const m = r?.reservserver;
  if (!nyckel || !m || typeof m.mac !== 'string' || !/^[0-9a-f]{64}$/.test(m.mac)) return false;
  return timingSafeEqual(Buffer.from(m.mac, 'hex'), Buffer.from(loggMac(nyckel, r, m), 'hex'));
}
// Öppnar reservserverns databas ur den senaste verifierade kopian.
export function oppna({ katalog, andraKatalog = null, nyckel = null, loggKatalog = null, loggNyckel = loggNyckelUrMiljo(), nu = new Date() } = {}) {
  if (loggKatalog && !loggNyckel) throw new Fel(500, 'Reservservern skriver en logg men saknar nyckeln som den delar med kärnsystemet. Ange RESERV_LOGG_NYCKEL, samma som i kärnsystemet, med minst 32 tecken.', 'fel');
  const k = senasteKopia({ katalog, andraKatalog, nyckel });
  const db = Database.deserialize(k.data);
  lasEndast(db);
  const sista = db.query('SELECT coalesce(max(id), 0) AS m FROM atkomstlogg').get().m;
  const reserv = { db, kopia: k.kopia, nyckel: k.nyckel, startad: iso(nu), loggKatalog, loggFil: null, loggNyckel, kopiaLoggId: sista, sistaLoggId: sista };
  if (loggKatalog) {
    mkdirSync(loggKatalog, { recursive: true, mode: 0o700 });
    reserv.loggFil = join(loggKatalog, `reservserver-logg-${reserv.startad.replace(/[:.]/g, '-')}.ndjson`);
  }
  return reserv;
}

// Tiden för kopian i svensk tid, som 2026-11-14 kl. 11.05.
const svenskTid = (t) => new Date(t).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(' ', ' kl. ').replace(/(\d{2}):(\d{2})$/, '$1.$2');

// Det reservservern säger om sig själv i sessionen, hälsokontrollen och raden överst på sidan.
export function info(reserv, nu = new Date()) {
  const minuter = Math.max(0, Math.floor((nu.getTime() - Date.parse(reserv.kopia.tid)) / 60_000));
  const alder = minuter < 60 ? `${minuter} ${minuter === 1 ? 'minut' : 'minuter'}` : minuter < 2880 ? `${Math.floor(minuter / 60)} timmar och ${minuter % 60} minuter` : `${Math.floor(minuter / 1440)} dygn`;
  return {
    kopia: reserv.kopia.tid, alderMinuter: minuter, plats: reserv.kopia.plats, startad: reserv.startad,
    text: `Reservserver. Uppgifterna kommer från säkerhetskopian som togs ${svenskTid(reserv.kopia.tid)} och är ${alder} gamla. Det som har registrerats efter det finns inte här.`,
    gor: 'Du kan läsa journalen men inte registrera något. Anteckna på papper och för in uppgifterna i journalen när kärnsystemet är i drift igen. Varje läsning loggas som vanligt.',
  };
}

// Svaret på ett anrop som skulle ändra något.
export function skrivningNekad(reserv) {
  const i = info(reserv);
  return new Fel(423, `${TEXT} Den visar journalen som den var i säkerhetskopian som togs ${svenskTid(i.kopia)}. Anteckna på papper och för in uppgifterna i journalen när kärnsystemet är i drift igen.`, 'reservserver', { reservserver: i });
}

// Skriver loggraderna som har tillkommit sedan förra gången till reservserverns loggfil, en rad per åtkomst.
export function sparaLogg(reserv) {
  if (!reserv.loggFil) return 0;
  const rader = reserv.db.query('SELECT * FROM atkomstlogg WHERE id > ? ORDER BY id').all(reserv.sistaLoggId);
  if (!rader.length) return 0;
  const meta = { kopia: reserv.kopia.id, kopiaTid: reserv.kopia.tid, kopiaSha256: reserv.kopia.sha256, kopiaLoggId: reserv.kopiaLoggId, nyckel: reserv.nyckel };
  appendFileSync(reserv.loggFil, rader.map(r => `${JSON.stringify({ ...r, reservserver: { ...meta, mac: loggMac(reserv.loggNyckel, r, meta) } })}\n`).join(''), { mode: 0o600 });
  reserv.sistaLoggId = rader.at(-1).id;
  return rader.length;
}

// Läser in reservserverns logg i kärnsystemets åtkomstlogg när kärnsystemet är i drift igen. Varje rad läggs till sist i
// kärnsystemets kedja med sin ursprungliga tid och person och med syftet märkt, så att loggen visar att åtkomsten
// gjordes på reservservern. Rader som redan är inlästa och rader som fanns i säkerhetskopian läses inte in igen. Ger
// antalet inlästa rader.
export function lasInLogg(db, rader) {
  const finns = new Set(db.query("SELECT tid, personal_id, patient_id, handling, resurs FROM atkomstlogg WHERE syfte LIKE 'Reservservern:%'").all().map(r => JSON.stringify([r.tid, r.personal_id, r.patient_id, r.handling, r.resurs])));
  let n = 0;
  db.transaction(() => {
    for (const r of rader) {
      if (!r || typeof r !== 'object' || typeof r.handling !== 'string' || typeof r.tid !== 'string' || !r.reservserver) continue;
      if (Date.parse(r.tid) < Date.parse(r.reservserver.kopiaTid)) continue;
      const nyckel = JSON.stringify([r.tid, r.personal_id ?? null, r.patient_id ?? null, r.handling, r.resurs ?? null]);
      if (finns.has(nyckel)) continue;
      loggaRad(db, { tid: r.tid, personal_id: r.personal_id ?? null, enhet_id: r.enhet_id ?? null, patient_id: r.patient_id ?? null, handling: r.handling, resurs: r.resurs ?? null,
        grund: r.grund, resultat: r.resultat, invanare_id: r.invanare_id ?? null,
        syfte: `Reservservern: ${r.syfte ?? 'Åtkomst'} (säkerhetskopian från ${r.reservserver.kopiaTid})`.slice(0, 500) });
      finns.add(nyckel);
      n++;
    }
  })();
  return n;
}

// ---- Beslut 2026-11-14: systemförvaltarens vy över loggen från reservservern (reservlogg-rutter.js) ----------------
//
// Loggfilerna ligger i katalogen som driften gör tillgänglig för kärnsystemet (RESERV_LOGG), en fil per gång
// reservservern startades. Vyn visar filerna för den egna sandlådan (nyckeln för dess säkerhetskopior): antal rader,
// period, vilken kopia reservservern läste, hur många rader som redan är inlästa och om kedjan i filen håller.
// En fil vars kedja inte håller läses inte in, eftersom den kan ha ändrats.
const FILNAMN = /^reservserver-logg-[0-9TZ-]{10,40}\.ndjson$/;
// Säkerhetsgranskningen efter runda 15: tak på antal filer, filens storlek och antal rader, eftersom katalogen läses vid
// varje anrop. En fil över taket räknas som trasig och läses inte.
export const MAX_FILER = 50;
export const MAX_BYTE = 8 * 1024 * 1024;
export const MAX_RADER = 50_000;
function lasLoggfiler(katalog) {
  if (!katalog || !existsSync(katalog)) return [];
  return readdirSync(katalog).filter(f => FILNAMN.test(f)).sort().slice(-MAX_FILER).map(f => {
    let rader = [];
    try {
      if (statSync(join(katalog, f)).size > MAX_BYTE) throw new Error('för stor');
      rader = readFileSync(join(katalog, f), 'utf8').split('\n').filter(Boolean);
      if (rader.length > MAX_RADER) throw new Error('för många rader');
      rader = rader.map(x => JSON.parse(x));
    } catch { rader = null; }
    return { fil: f, rader, simulerad: false };
  });
}
const inlastNyckel = (r) => JSON.stringify([r.tid, r.personal_id ?? null, r.patient_id ?? null, r.handling, r.resurs ?? null]);
function filerFor({ katalog, minne, nyckel }) {
  const ur = [...lasLoggfiler(katalog), ...[...(minne.get(nyckel) ?? new Map())].map(([fil, rader]) => ({ fil, rader, simulerad: true }))];
  // Säkerhetsgranskningen efter runda 15: en trasig fil går inte att knyta till en sandlåda och visas därför inte för
  // någon. Driften har originalet på reservserverns disk.
  return ur.map(f => ({ ...f, rader: (f.rader ?? []).filter(r => r?.reservserver?.nyckel === nyckel) })).filter(f => f.rader.length);
}
// Prövar en logg innan den läses in: kedjan i filen, signaturen på varje rad, att alla rader kommer från samma kopia,
// att kopian är en av den här sandlådans kopior och att loggen börjar direkt efter kopians sista rad i åtkomstloggen.
// Ger null eller förklaringen till varför loggen inte läses in.
function provaLogg(db, f, { loggNyckel = loggNyckelUrMiljo(), kopior = null } = {}) {
  const r0 = f.rader[0];
  const m = r0?.reservserver ?? {};
  if (!kontrolleraLogg(f.rader).hel) return 'Loggen från reservservern hänger inte ihop: en rad saknas eller har ändrats. Den läses inte in. Kontakta driften, som har originalet på reservserverns disk.';
  const nyckel = f.simulerad ? DEMO_NYCKEL : loggNyckel;
  if (!nyckel) return 'Kärnsystemet saknar nyckeln som det delar med reservservern (RESERV_LOGG_NYCKEL), så loggens signatur kan inte prövas. Den läses inte in.';
  if (!f.rader.every(r => macOk(nyckel, r))) return 'Loggen från reservservern är inte signerad med nyckeln som kärnsystemet och reservservern delar. Den läses inte in.';
  if (!f.rader.every(r => r.reservserver.kopia === m.kopia && r.reservserver.kopiaLoggId === m.kopiaLoggId && r.reservserver.kopiaSha256 === m.kopiaSha256)) return 'Loggen från reservservern blandar rader från flera kopior. Den läses inte in.';
  if (!Number.isInteger(m.kopiaLoggId) || r0.id !== m.kopiaLoggId + 1 || !fortsatterKedjan(db, f.rader)) return 'Loggen från reservservern hänger inte ihop med den här sandlådans åtkomstlogg: den börjar inte direkt efter kopian som reservservern läste. Den läses inte in.';
  const post = f.simulerad ? null : (kopior ?? []).find(p => p.id === m.kopia && p.sha256 === m.kopiaSha256);
  if (!f.simulerad && !post) return 'Kopian som reservservern läste är inte en av den här sandlådans säkerhetskopior. Loggen läses inte in.';
  if (post && post.loggId !== m.kopiaLoggId) return 'Loggen från reservservern hänger inte ihop med den här sandlådans åtkomstlogg: den börjar inte direkt efter kopian som reservservern läste. Den läses inte in.';
  return null;
}
// Säkerhetsgranskningen efter runda 15: den första raden i filen ska fortsätta kedjan i den här sandlådans åtkomstlogg,
// från den sista raden i kopian som reservservern läste. Annars hör loggen inte hit, eller har ändrats.
function fortsatterKedjan(db, rader) {
  if (!rader.length) return false;
  const forra = db.query('SELECT hash FROM atkomstlogg WHERE id = ?').get(Number(rader[0].id) - 1);
  return Boolean(forra) && forra.hash === rader[0].prev_hash;
}
export function loggOversikt(db, { katalog = null, minne = new Map(), nyckel, loggNyckel = loggNyckelUrMiljo(), kopior = null } = {}) {
  const inlasta = new Set(db.query("SELECT tid, personal_id, patient_id, handling, resurs FROM atkomstlogg WHERE syfte LIKE 'Reservservern:%'").all().map(inlastNyckel));
  const filer = filerFor({ katalog, minne, nyckel }).map(f => {
    const tider = f.rader.map(r => r.tid).sort();
    const kvar = f.rader.filter(r => !inlasta.has(inlastNyckel(r))).length;
    const k = kontrolleraLogg(f.rader);
    return { fil: f.fil, simulerad: f.simulerad, rader: f.rader.length, kvar, inlast: kvar === 0, fran: tider[0] ?? null, till: tider.at(-1) ?? null,
      kopia: f.rader[0]?.reservserver ? { id: f.rader[0].reservserver.kopia, tid: f.rader[0].reservserver.kopiaTid } : null, kedjaHel: k.hel && !provaLogg(db, f, { loggNyckel, kopior }) };
  }).sort((a, b) => String(b.till).localeCompare(String(a.till)));
  const vantar = filer.filter(f => !f.inlast);
  return {
    filer, vantar: vantar.length,
    text: vantar.length ? `${vantar.length === 1 ? 'En logg från reservservern är inte inläst' : `${vantar.length} loggar från reservservern är inte inlästa`}. Läs in dem, så att åtkomsterna på reservservern finns i åtkomstloggen.`
      : 'Ingen logg från reservservern väntar på att läsas in.',
    kommando: 'Loggen kan också läsas in med kommandot bun src/reservserver.js --las-in-logg <fil> --databas <fil>.',
  };
}
export function lasInFil(db, personal, { katalog = null, minne = new Map(), nyckel, fil, loggNyckel = loggNyckelUrMiljo(), kopior = null } = {}) {
  const f = typeof fil === 'string' ? filerFor({ katalog, minne, nyckel }).find(x => x.fil === fil) : null;
  if (!f) throw new Fel(404, 'Loggen finns inte.', 'saknas');
  const varfor = provaLogg(db, f, { loggNyckel, kopior });
  if (varfor) throw new Fel(409, varfor, 'ogiltig');
  const n = lasInLogg(db, f.rader);
  sakerhetslogg.logga(db, { typ: 'andrad_installning', personal_id: personal.id, enhet_id: personal.enhet_id,
    beskrivning: `Läste in ${n} ${n === 1 ? 'rad' : 'rader'} från reservserverns logg ${f.fil} i åtkomstloggen.` });
  return { inlasta: n, ...loggOversikt(db, { katalog, minne, nyckel, loggNyckel, kopior }) };
}
// Demon: tre läsningar på en reservserver för den här sandlådan, en kvart efter en kopia av läget nu. Raderna skrivs i en
// kopia av databasen, så att kedjan fortsätter från kopian som i en riktig reservserver, och märks som simulerade.
export function simuleraLogg(db, { minne, nyckel, nu = new Date() }) {
  const kopia = Database.deserialize(db.serialize());
  try {
    const sista = kopia.query('SELECT coalesce(max(id), 0) AS m FROM atkomstlogg').get().m;
    const kopiaTid = new Date(nu.getTime() - 30 * 60_000).toISOString();
    const p = kopia.query("SELECT id, enhet_id FROM personal WHERE id = 'ssk-kard'").get() ?? kopia.query("SELECT id, enhet_id FROM personal WHERE yrke = 'sjukskoterska' LIMIT 1").get();
    const pat = kopia.query("SELECT id FROM patienter WHERE id IN ('p01', 'p02', 'p03') ORDER BY id").all().map(x => x.id);
    pat.forEach((pid, i) => loggaRad(kopia, { tid: new Date(nu.getTime() - (20 - i * 5) * 60_000).toISOString(), personal_id: p.id, enhet_id: p.enhet_id, patient_id: pid,
      handling: 'las_oversikt', resurs: 'oversikt', grund: 'vardrelation', syfte: 'Läsning på reservservern (simulerad i demon)' }));
    const id = `demo-${iso(nu).replace(/[:.]/g, '-')}`;
    const meta = { kopia: id, kopiaTid, kopiaSha256: null, kopiaLoggId: sista, nyckel, simulerad: true };
    const rader = kopia.query('SELECT * FROM atkomstlogg WHERE id > ? ORDER BY id').all(sista).map(r => ({ ...r, reservserver: { ...meta, mac: loggMac(DEMO_NYCKEL, r, meta) } }));
    if (!minne.has(nyckel)) minne.set(nyckel, new Map());
    const fil = `reservserver-logg-${iso(nu).replace(/[:.]/g, '-')}.ndjson`;
    minne.get(nyckel).set(fil, rader);
    // Högst tre simulerade loggar per sandlåda.
    while (minne.get(nyckel).size > 3) minne.get(nyckel).delete(minne.get(nyckel).keys().next().value);
    return { fil, rader: rader.length };
  } finally { kopia.close(); }
}

// Kontrollerar att en loggfil från reservservern hänger ihop: raderna följer på varandra, och varje rads hash stämmer
// med raden och föregående rads hash, från den sista raden i säkerhetskopian. Ger { hel, antal, felRad }.
export function kontrolleraLogg(rader) {
  for (let i = 0; i < rader.length; i++) {
    const r = rader[i];
    if (i && (r.id !== rader[i - 1].id + 1 || r.prev_hash !== rader[i - 1].hash)) return { hel: false, antal: rader.length, felRad: r.id };
    const { reservserver: _, prev_hash: prev, hash, ...rad } = r;
    if (hashFor(prev, rad) !== hash) return { hel: false, antal: rader.length, felRad: r.id };
  }
  return { hel: true, antal: rader.length, felRad: null };
}

// Kommandot. Utan argument startar det reservservern med samma inställningar som kärnsystemet (KOPIOR_KATALOG,
// KOPIOR_ANDRA, PORT) och RESERV_SANDLADA och RESERV_LOGG. Med --las-in-logg läser det in en loggfil i en databas.
if (import.meta.main) {
  const arg = process.argv.slice(2);
  const varde = (namn) => { const i = arg.indexOf(namn); return i >= 0 ? arg[i + 1] : null; };
  if (varde('--las-in-logg')) {
    const fil = varde('--las-in-logg');
    const dbFil = varde('--databas');
    if (!dbFil) { console.error('Ange databasen med --databas <fil>.'); process.exit(2); }
    const rader = readFileSync(fil, 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x));
    const db = new Database(dbFil);
    // Säkerhetsgranskningen efter runda 15: kommandot prövar kedjan, signaturen och början av loggen som vyn gör.
    const varfor = provaLogg(db, { rader, simulerad: false }, { kopior: [{ id: rader[0]?.reservserver?.kopia, sha256: rader[0]?.reservserver?.kopiaSha256, loggId: rader[0]?.reservserver?.kopiaLoggId }] });
    if (varfor) { console.error(varfor); db.close(); process.exit(1); }
    const n = lasInLogg(db, rader);
    db.close();
    console.log(`Läste in ${n} rader från reservserverns logg i ${dbFil}.`);
    process.exit(0);
  }
  process.env.RESERVSERVER = '1';
  const { starta } = await import('./server.js');
  const app = starta();
  console.log(`Reservservern lyssnar på ${app.port}. ${app.reservserver.text}`);
  const avsluta = () => { try { app.sparaReservlogg(); } catch (e) { console.error('Loggen kunde inte sparas:', e.message); } process.exit(0); };
  process.on('SIGTERM', avsluta);
  process.on('SIGINT', avsluta);
}
