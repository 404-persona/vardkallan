// Lagringen för äldre uppgifter (runda 18, r3, Sussa KD1.1.3.5): en egen databas för det som enligt lagringsklassen
// Lagring för äldre uppgifter (lagringsklasser, migrering 2 i releaser.js) ska flyttas från den snabba lagringen.
//
// Vad som flyttas. Filinnehållet i avslutade vårdkontakter och i äldre handlingar: bilder och andra filer i journalen
// (media), inskannade restjournaler och mellanarkivets paket. Raden med uppgifterna om filen (patient, vårdenhet,
// vårdkontakt, namn, typ, storlek, kontrollsumma, status) stannar i den aktiva databasen, så att journalen, listorna,
// sökningen, behörigheten och loggningen ser ut och fungerar som förut. Det som flyttas är själva innehållet, som är den
// stora delen av volymen och som sällan läses när det har blivit gammalt. Miniatyrerna stannar i den snabba lagringen.
//
// Regeln. En fil flyttas när den är äldre än lagringsklassens gräns (flytt_efter_ar) och den vårdkontakt den hör till är
// avslutad sedan minst lika länge. En fil som väntar på granskning, hör till en pågående vårdkontakt eller saknar en känd
// huvudman flyttas aldrig. Mellanarkivets paket flyttas när det senaste i paketet är äldre än gränsen.
//
// Den egna databasen. I demon är den en SQLite-databas i minnet som är kopplad till sandlådan (ATTACH, schemat aldre),
// med egna sidor och ett eget schema. I driften är den en egen fil på en billigare volym med längre svarstid. Allt som
// läser en fil går genom lasData, som tar innehållet ur den aktiva databasen eller ur den äldre och kontrollerar
// kontrollsumman. När sandlådan sparas, kopieras eller säkerhetskopieras (bild) följer den äldre databasen med i samma
// ögonblicksbild, och när den läses in igen (koppla) läggs den tillbaka i en egen databas.
//
// Flytten prövar regeln och kontrollsumman på varje rad i samma transaktion som flyttar den, läser tillbaka innehållet ur
// den äldre databasen och jämför innan raden töms i den aktiva. Stämmer något inte stoppas hela flytten och inget flyttas
// (fail closed). Flytten går att köra igen: det som redan är flyttat är inte längre en kandidat, och en rad som redan finns
// i den äldre databasen skrivs aldrig två gånger.
//
// Gallring och radering. En rad som gallras eller raderas ur den aktiva databasen tas också bort ur den äldre, av en
// trigger som hör till sandlådans anslutning. När sandlådan kopplas tas innehåll bort som inte längre har någon rad.
// Sammanslagning av journaler ändrar bara patienten på raden i den aktiva databasen, och den äldre databasen har ingen
// patient, så innehållet följer med av sig självt.
import { Database } from 'bun:sqlite';
import { createHash } from 'node:crypto';
import { Fel, iso } from './db.js';
import { kanRoll } from './atkomst.js';
import { loggaRad } from './logg.js';

export const SCHEMA_NAMN = 'aldre';
const BILD_TABELL = 'lagring_aldre_bild';
const AR = 365.25 * 86400_000;

// Tabellerna vars innehåll kan flyttas. datum är uttrycket för när uppgiften är från, kontakt kolumnen med vårdkontakten
// och villkor det som måste gälla för att raden ska få flyttas.
export const FLYTTBARA = Object.freeze({
  media: { text: 'Bilder och filer i journalen', datum: 't.tagen', kontakt: 'vardkontakt_id', villkor: "t.status = 'journal'" },
  restjournaler: { text: 'Inskannade restjournaler', datum: 'coalesce(t.period_till, t.period_fran, t.skannad)', kontakt: 'vardkontakt_id', villkor: "t.status = 'journal'" },
  mellanarkiv_paket: { text: 'Mellanarkivets paket', datum: "(SELECT max(coalesce(h.sista, h.datum)) FROM mellanarkiv_handlingar h WHERE h.paket_id = t.id)", kontakt: null, villkor: '1' },
});

const sha = (b) => createHash('sha256').update(b).digest('hex');
const norm = (s) => String(s ?? '').toLowerCase();
const finnsTabell = (db, t) => Boolean(db.query("SELECT 1 FROM main.sqlite_master WHERE type = 'table' AND name = ?").get(t));
const ar = (db) => db.query("SELECT name FROM pragma_database_list WHERE name = ?").get(SCHEMA_NAMN);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS ${SCHEMA_NAMN}.filinnehall (
  tabell TEXT NOT NULL, rad_id INTEGER NOT NULL, sha256 TEXT NOT NULL, storlek INTEGER NOT NULL, data BLOB NOT NULL, flyttad TEXT NOT NULL,
  PRIMARY KEY (tabell, rad_id)
);
CREATE TABLE IF NOT EXISTS ${SCHEMA_NAMN}.flyttar (
  id INTEGER PRIMARY KEY, tid TEXT NOT NULL, av TEXT, filer INTEGER NOT NULL, byte INTEGER NOT NULL, per_tabell TEXT NOT NULL, grans TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS ${SCHEMA_NAMN}.filinnehall_andras_ej BEFORE UPDATE ON filinnehall BEGIN SELECT RAISE(ABORT, 'Innehållet i lagringen för äldre uppgifter ändras inte.'); END;
CREATE TRIGGER IF NOT EXISTS ${SCHEMA_NAMN}.flyttar_andras_ej BEFORE UPDATE ON flyttar BEGIN SELECT RAISE(ABORT, 'En flytt ändras inte.'); END;
CREATE TRIGGER IF NOT EXISTS ${SCHEMA_NAMN}.flyttar_raderas_ej BEFORE DELETE ON flyttar BEGIN SELECT RAISE(ABORT, 'En flytt raderas inte.'); END;
`;

// Triggrarna som tar bort innehållet när raden gallras eller raderas. De hör till anslutningen (TEMP), eftersom en trigger
// i den aktiva databasen inte får peka på en annan databas.
function gallringsTriggrar(db) {
  for (const t of Object.keys(FLYTTBARA)) {
    if (!finnsTabell(db, t)) continue;
    db.exec(`CREATE TEMP TRIGGER IF NOT EXISTS lagring_aldre_${t}_gallras AFTER DELETE ON main."${t}"
      BEGIN DELETE FROM ${SCHEMA_NAMN}.filinnehall WHERE tabell = '${t}' AND rad_id = old.id; END`);
  }
}

// Innehåll som inte längre har någon rad i den aktiva databasen (gallrad medan den äldre databasen inte var kopplad, eller
// en rad vars kontrollsumma inte stämmer) tas bort.
function rensa(db) {
  for (const t of Object.keys(FLYTTBARA)) {
    if (!finnsTabell(db, t)) {
      db.query(`DELETE FROM ${SCHEMA_NAMN}.filinnehall WHERE tabell = ?`).run(t);
      continue;
    }
    db.query(`DELETE FROM ${SCHEMA_NAMN}.filinnehall WHERE tabell = ? AND NOT EXISTS (SELECT 1 FROM main."${t}" m WHERE m.id = filinnehall.rad_id AND lower(m.sha256) = lower(filinnehall.sha256))`).run(t);
  }
}

const kopplade = new WeakSet();

// Kopplar den äldre databasen till sandlådan. Har sandlådan en sparad bild av den (från bild) läggs den tillbaka i den
// egna databasen och tas bort ur den aktiva. Går att anropa hur många gånger som helst.
export function koppla(db) {
  if (kopplade.has(db) && ar(db)) return db;
  if (!ar(db)) db.exec(`ATTACH DATABASE ':memory:' AS ${SCHEMA_NAMN}`);
  db.exec(SCHEMA);
  if (finnsTabell(db, BILD_TABELL)) {
    const rad = db.query(`SELECT data FROM main.${BILD_TABELL} ORDER BY id DESC LIMIT 1`).get();
    if (rad?.data) {
      const kopia = Database.deserialize(rad.data);
      try {
        const ins = db.query(`INSERT OR IGNORE INTO ${SCHEMA_NAMN}.filinnehall (tabell, rad_id, sha256, storlek, data, flyttad) VALUES (?, ?, ?, ?, ?, ?)`);
        for (const r of kopia.query('SELECT * FROM filinnehall').iterate()) ins.run(r.tabell, r.rad_id, r.sha256, r.storlek, r.data, r.flyttad);
        const insF = db.query(`INSERT OR IGNORE INTO ${SCHEMA_NAMN}.flyttar (id, tid, av, filer, byte, per_tabell, grans) VALUES (?, ?, ?, ?, ?, ?, ?)`);
        for (const r of kopia.query('SELECT * FROM flyttar').iterate()) insF.run(r.id, r.tid, r.av, r.filer, r.byte, r.per_tabell, r.grans);
      } finally { kopia.close(); }
    }
    db.exec(`DROP TABLE main.${BILD_TABELL}`);
  }
  gallringsTriggrar(db);
  rensa(db);
  kopplade.add(db);
  return db;
}

const antalFiler = (db) => db.query(`SELECT count(*) AS n FROM ${SCHEMA_NAMN}.filinnehall`).get().n;

// Ögonblicksbilden av sandlådan med den äldre databasen. Används i stället för db.serialize() överallt där sandlådan
// sparas, kopieras eller säkerhetskopieras. Är den äldre databasen tom, eller inte kopplad (då finns en sparad bild redan
// kvar i den aktiva databasen), är bilden densamma som db.serialize(). Den levande databasen ändras aldrig.
export function bild(db) {
  const data = db.serialize();
  if (!ar(db) || !antalFiler(db)) return data;
  const kopia = Database.deserialize(data);
  try {
    kopia.exec(`CREATE TABLE IF NOT EXISTS ${BILD_TABELL} (id INTEGER PRIMARY KEY, tid TEXT NOT NULL, sha256 TEXT NOT NULL, data BLOB NOT NULL)`);
    const aldre = db.serialize(SCHEMA_NAMN);
    kopia.query(`INSERT INTO ${BILD_TABELL} (tid, sha256, data) VALUES (?, ?, ?)`).run(iso(), sha(aldre), aldre);
    return kopia.serialize();
  } finally { kopia.close(); }
}

// En databas ur en ögonblicksbild, med den äldre databasen kopplad.
export const ny = (data) => koppla(Database.deserialize(data));

// Innehållet i en fil: ur den aktiva databasen, eller ur den äldre om det är flyttat. Kontrollsumman prövas. Anroparen
// har redan prövat behörigheten och loggar läsningen, precis som innan innehållet flyttades.
export function lasData(db, tabell, rad) {
  if (!rad) return null;
  if (rad.data?.length || !rad.storlek || !Object.hasOwn(FLYTTBARA, tabell)) return rad.data;
  koppla(db);
  const r = db.query(`SELECT data, sha256 FROM ${SCHEMA_NAMN}.filinnehall WHERE tabell = ? AND rad_id = ?`).get(tabell, rad.id);
  if (!r || norm(r.sha256) !== norm(rad.sha256) || sha(r.data) !== norm(rad.sha256)) {
    throw new Fel(503, 'Filen kunde inte läsas ur lagringen för äldre uppgifter. Försök igen om en stund. Fortsätter det, kontakta systemförvaltningen.', 'lagring');
  }
  return r.data;
}
export const medData = (db, tabell, rad) => (rad ? { ...rad, data: lasData(db, tabell, rad) } : rad);

// Lagringsklassen för äldre uppgifter och gränsen för flytt, eller null när lagringsklasserna inte finns (efter en
// återgång till en version före 1.2.0).
export function klass(db, nu = new Date()) {
  if (!finnsTabell(db, 'lagringsklasser')) return null;
  const k = db.query('SELECT * FROM lagringsklasser WHERE flytt_efter_ar IS NOT NULL ORDER BY flytt_efter_ar LIMIT 1').get();
  if (!k) return null;
  return { id: k.id, namn: k.namn, kvalitet: k.kvalitet, svarstidMs: k.svarstid_ms, krPerGbManad: k.kr_per_gb_manad, flyttEfterAr: k.flytt_efter_ar,
    grans: new Date(nu.getTime() - k.flytt_efter_ar * AR).toISOString() };
}

// Raderna som regeln säger ska flyttas, per tabell. Bara id, inga patientuppgifter.
function kandidatSql(db, t) {
  const f = FLYTTBARA[t];
  const kontakt = f.kontakt && db.query(`SELECT 1 FROM pragma_table_info('${t}') WHERE name = ?`).get(f.kontakt)
    ? `AND (t.${f.kontakt} IS NULL OR EXISTS (SELECT 1 FROM main.vardkontakter v WHERE v.id = t.${f.kontakt} AND v.slut IS NOT NULL AND v.slut <= ?2))` : 'AND ?2 IS NOT NULL';
  return `SELECT t.id FROM main."${t}" t WHERE length(t.data) > 0 AND t.storlek > 0 AND ${f.villkor} AND ${f.datum} IS NOT NULL AND ${f.datum} <= ?1 ${kontakt}
    AND NOT EXISTS (SELECT 1 FROM ${SCHEMA_NAMN}.filinnehall a WHERE a.tabell = '${t}' AND a.rad_id = t.id)`;
}
export function kandidater(db, nu = new Date()) {
  koppla(db);
  const k = klass(db, nu);
  const ut = {};
  for (const t of Object.keys(FLYTTBARA)) {
    if (!finnsTabell(db, t)) { ut[t] = []; continue; }
    ut[t] = k ? db.query(kandidatSql(db, t)).all(k.grans, k.grans).map(r => r.id) : [];
  }
  return ut;
}

// Huvudmannen för varje enhet (lagring.js). Läses vid anropet, så att modulerna kan peka på varandra.
const huvudmanFor = (db) => require('./lagring.js').huvudman(db);

// Gör flytten. personal är systemförvaltaren, eller null när systemet gör den av sig självt på schemat. Ger antalet filer
// och byte per tabell.
export function flytta(db, personal = null, { nu = new Date() } = {}) {
  if (personal && !kanRoll(personal, 'lagring')) throw new Fel(403, 'Bara systemförvaltningen flyttar uppgifter mellan lagringsklasserna.', 'nekad');
  koppla(db);
  const k = klass(db, nu);
  if (!k) throw new Fel(409, 'Lagringsklasserna finns inte i den här versionen, så inget flyttas.', 'ogiltig');
  const hm = huvudmanFor(db);
  const resultat = { filer: 0, byte: 0, perTabell: {}, grans: k.grans, flyttEfterAr: k.flyttEfterAr };
  const stopp = () => new Fel(409, 'Flytten stoppades eftersom en fil inte kunde kontrolleras. Inget flyttades. Kontakta systemförvaltningen.', 'ogiltig');
  db.transaction(() => {
    for (const [t, ids] of Object.entries(kandidater(db, nu))) {
      if (!ids.length) continue;
      const ins = db.query(`INSERT INTO ${SCHEMA_NAMN}.filinnehall (tabell, rad_id, sha256, storlek, data, flyttad) VALUES (?, ?, ?, ?, ?, ?)`);
      const regel = db.query(`${kandidatSql(db, t)} AND t.id = ?3`);
      const flyttade = [];
      for (const id of ids) {
        // Regeln prövas på nytt för raden i transaktionen, och raden ska höra till en känd huvudman.
        if (!regel.get(k.grans, k.grans, id)) throw stopp();
        const r = db.query(`SELECT * FROM main."${t}" WHERE id = ?`).get(id);
        const enhet = r.enhet_id ?? db.query('SELECT enhet_id FROM main.mellanarkiv_handlingar WHERE paket_id = ? LIMIT 1').get(r.id)?.enhet_id ?? null;
        if (!enhet || !hm.has(enhet)) throw stopp();
        // Kontrollsumman ska stämma med innehållet, både före flytten och när det läses tillbaka ur den äldre databasen.
        if (sha(r.data) !== norm(r.sha256)) throw stopp();
        ins.run(t, r.id, norm(r.sha256), r.data.length, r.data, iso(nu));
        const tillbaka = db.query(`SELECT data FROM ${SCHEMA_NAMN}.filinnehall WHERE tabell = ? AND rad_id = ?`).get(t, r.id);
        if (!tillbaka || sha(tillbaka.data) !== norm(r.sha256)) throw stopp();
        flyttade.push(r);
      }
      // Raderna töms i den aktiva databasen med tabellens skydd mot ändring tillfälligt borttaget, i samma transaktion.
      const skydd = db.query("SELECT name, sql FROM main.sqlite_master WHERE type = 'trigger' AND tbl_name = ? AND sql LIKE '%BEFORE UPDATE%'").all(t);
      for (const s of skydd) db.exec(`DROP TRIGGER main."${s.name}"`);
      try {
        const tom = db.query(`UPDATE main."${t}" SET data = X'' WHERE id = ?`);
        for (const r of flyttade) tom.run(r.id);
      } finally { for (const s of skydd) db.exec(s.sql); }
      const byte = flyttade.reduce((s, r) => s + r.data.length, 0);
      resultat.perTabell[t] = { text: FLYTTBARA[t].text, filer: flyttade.length, byte };
      resultat.filer += flyttade.length;
      resultat.byte += byte;
    }
    if (resultat.filer) {
      db.query(`INSERT INTO ${SCHEMA_NAMN}.flyttar (tid, av, filer, byte, per_tabell, grans) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(iso(nu), personal?.id ?? null, resultat.filer, resultat.byte, JSON.stringify(resultat.perTabell), k.grans);
    }
    // Flytten loggas utan patient: ingen läser något innehåll, och inget lämnar systemet.
    loggaRad(db, { personal_id: personal?.id ?? 'systemet', enhet_id: personal?.enhet_id ?? null, handling: 'lagring', resurs: 'lagring:flytt', grund: 'administrativ',
      syfte: `Flytt till ${k.namn.toLowerCase()}: ${resultat.filer} filer, ${resultat.byte} byte.` });
  })();
  return resultat;
}

// Läget för sidan Lagring: storleken på den äldre databasen, vad som har flyttats och vad som väntar. Bara antal och
// storlekar, inga patientuppgifter.
export function lage(db, nu = new Date()) {
  koppla(db);
  const k = klass(db, nu);
  const sidor = db.query(`PRAGMA ${SCHEMA_NAMN}.page_count`).get().page_count * db.query(`PRAGMA ${SCHEMA_NAMN}.page_size`).get().page_size;
  const perTabell = Object.entries(FLYTTBARA).map(([t, f]) => {
    const a = db.query(`SELECT count(*) AS n, coalesce(sum(storlek), 0) AS b FROM ${SCHEMA_NAMN}.filinnehall WHERE tabell = ?`).get(t);
    return { tabell: t, text: f.text, filer: a.n, byte: a.b };
  });
  const vantar = kandidater(db, nu);
  const vantarAntal = Object.values(vantar).reduce((s, l) => s + l.length, 0);
  const vantarByte = Object.entries(vantar).reduce((s, [t, ids]) => s + (ids.length ? db.query(`SELECT coalesce(sum(storlek), 0) AS b FROM main."${t}" WHERE id IN (${ids.map(() => '?').join(', ')})`).get(...ids).b : 0), 0);
  const senaste = db.query(`SELECT * FROM ${SCHEMA_NAMN}.flyttar ORDER BY id DESC LIMIT 5`).all().map(f => ({
    tid: f.tid, filer: f.filer, byte: f.byte, av: f.av ? db.query('SELECT namn FROM personal WHERE id = ?').get(f.av)?.namn ?? null : 'Systemet', perTabell: JSON.parse(f.per_tabell),
  }));
  return {
    databas: { namn: SCHEMA_NAMN, byte: sidor, text: 'En egen SQLite-databas kopplad till sandlådan. I driften en egen fil på en billigare volym.' },
    klass: k, filer: perTabell.reduce((s, x) => s + x.filer, 0), byte: perTabell.reduce((s, x) => s + x.byte, 0), perTabell,
    vantar: { filer: vantarAntal, byte: vantarByte }, senaste,
    regel: k ? `Filer i avslutade vårdkontakter och äldre handlingar flyttas till ${k.namn.toLowerCase()} när de är äldre än ${k.flyttEfterAr} år. Raden om filen stannar i den aktiva databasen, så journalen ser ut som förut, och filen läses ur den äldre databasen med samma behörighet och loggning.` : 'Lagringsklasserna finns inte i den här versionen.',
  };
}

// Skriver in innehållet ur den äldre databasen i en kopia av tabellerna (uttaget per huvudman i lagring.js), så att
// uttaget har hela filerna.
export function fyllI(db, ut, tabell, rader) {
  if (!Object.hasOwn(FLYTTBARA, tabell)) return;
  const upp = ut.query(`UPDATE "${tabell}" SET data = ? WHERE id = ?`);
  for (const r of rader) if (!r.data?.length && r.storlek) upp.run(lasData(db, tabell, r), r.id);
}
