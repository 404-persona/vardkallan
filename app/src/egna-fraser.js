// Runda 15, r4: egna korta texter och egen ordning på sökorden (granskningen av mallarna, F9).
//
// Varje person kan spara några egna fraser, till exempel "Inga bröstsmärtor, ingen andnöd", och skriva in dem i ett
// sökord med ett kortkommando (punkt, kortnamnet och tabbtangenten, som .ub) eller med ett klick. Personen kan också
// välja i vilken ordning sökorden i vårdenhetens mall står när personen själv skriver. Det är personens eget: fraserna
// och ordningen sparas med personen, aldrig med en patient, och syns inte för någon annan.
//
// Gränserna, så att fraserna inte blir en källa till kopierad text: högst 20 fraser per person och 400 tecken per fras,
// bara text som personen själv har skrivit, aldrig värden ur journalen (de förs in med underlaget, med datum och källa)
// och aldrig personnummer. En fras visas inte som en egen mall, och ordningen kan bara flytta sökord som finns i
// vårdenhetens mall, aldrig ta bort eller lägga till.
import { Fel, iso } from './db.js';

export const TAK = 20;
export const MAX_TEXT = 400;
const KORT = /^[a-zåäö0-9]{1,12}$/;
// Säkerhetsgranskningen efter runda 15: också med mellanslag eller tankstreck som skiljetecken (ÅÅMMDD NNNN, ÅÅMMDD–NNNN).
const PERSONNUMMER = /\b(?:19|20)?\d{6}\s?[-+\u2010-\u2015]?\s?\d{4}\b/;
// Systemets format för ett värde ur journalen, till exempel (14 nov 07.00). Sådana värden förs in med underlaget.
const VARDE_MED_TID = /\d{1,2} (?:jan|feb|mars|april|maj|juni|juli|aug|sep|okt|nov|dec) \d{2}\.\d{2}/i;

export function sakraSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS egna_fraser (
    id INTEGER PRIMARY KEY, personal_id TEXT NOT NULL, kort TEXT NOT NULL, text TEXT NOT NULL, skapad TEXT NOT NULL, UNIQUE (personal_id, kort));
  CREATE TABLE IF NOT EXISTS egen_sokordsordning (
    personal_id TEXT NOT NULL, typ TEXT NOT NULL, ordning TEXT NOT NULL, andrad TEXT NOT NULL, PRIMARY KEY (personal_id, typ));`);
}

const fras = (r) => ({ id: r.id, kort: r.kort, text: r.text, skapad: r.skapad });

export function lista(db, personal) {
  sakraSchema(db);
  const fraser = db.query('SELECT * FROM egna_fraser WHERE personal_id = ? ORDER BY kort').all(personal.id).map(fras);
  const ordningar = Object.fromEntries(db.query('SELECT typ, ordning FROM egen_sokordsordning WHERE personal_id = ?').all(personal.id).map(r => [r.typ, JSON.parse(r.ordning)]));
  return { fraser, ordningar, tak: TAK, maxText: MAX_TEXT };
}

export function lagg(db, personal, { kort, text } = {}) {
  sakraSchema(db);
  const k = typeof kort === 'string' ? kort.trim().toLocaleLowerCase('sv').replace(/^\./, '') : '';
  const t = typeof text === 'string' ? text.trim() : '';
  if (!KORT.test(k)) throw new Fel(400, 'Kortnamnet är 1 till 12 bokstäver eller siffror utan mellanslag, till exempel ub.', 'ogiltig', { falt: ['kort'] });
  if (!t) throw new Fel(400, 'Skriv frasen.', 'ogiltig', { falt: ['text'] });
  if (t.length > MAX_TEXT) throw new Fel(400, `En fras är högst ${MAX_TEXT} tecken, så att den inte blir en mall.`, 'ogiltig', { falt: ['text'] });
  if (PERSONNUMMER.test(t)) throw new Fel(400, 'En fras får inte innehålla ett personnummer. Fraserna är dina egna och hör inte till någon patient.', 'ogiltig', { falt: ['text'] });
  if (VARDE_MED_TID.test(t)) throw new Fel(400, 'En fras är din egen text. Värden ur journalen förs in med underlaget bredvid sökorden, så att de alltid har datum och källa.', 'ogiltig', { falt: ['text'] });
  if (db.query('SELECT 1 FROM egna_fraser WHERE personal_id = ? AND kort = ?').get(personal.id, k)) throw new Fel(400, `Du har redan en fras med kortnamnet ${k}. Ta bort den först eller välj ett annat kortnamn.`, 'ogiltig', { falt: ['kort'] });
  if (db.query('SELECT count(*) AS n FROM egna_fraser WHERE personal_id = ?').get(personal.id).n >= TAK) throw new Fel(400, `Du har redan ${TAK} fraser, som är taket. Ta bort en som du inte använder.`, 'ogiltig', { falt: ['text'] });
  db.query('INSERT INTO egna_fraser (personal_id, kort, text, skapad) VALUES (?, ?, ?, ?)').run(personal.id, k, t, iso());
  return lista(db, personal);
}

export function taBort(db, personal, id) {
  sakraSchema(db);
  const r = db.query('DELETE FROM egna_fraser WHERE id = ? AND personal_id = ?').run(Number(id), personal.id);
  if (!r.changes) throw new Fel(404, 'Frasen finns inte.', 'saknas');
  return lista(db, personal);
}

// Egen ordning på sökorden i en mall. mall är mallen som den gäller för personen (med vårdenhetens anpassning), så att
// ordningen bara kan flytta de sökord som finns. En tom ordning tar bort den egna ordningen.
export function sattOrdning(db, personal, mall, ordning) {
  sakraSchema(db);
  if (!mall || mall.strukturerad || mall.formular) throw new Fel(400, 'Ordningen kan bara väljas för mallar med sökord.', 'ogiltig', { falt: ['typ'] });
  if (ordning == null || (Array.isArray(ordning) && !ordning.length)) {
    db.query('DELETE FROM egen_sokordsordning WHERE personal_id = ? AND typ = ?').run(personal.id, mall.typ);
    return lista(db, personal);
  }
  const namn = mall.sokord.map(s => (typeof s === 'string' ? s : s?.namn));
  if (!Array.isArray(ordning) || ordning.length !== namn.length || new Set(ordning).size !== ordning.length || ordning.some(x => typeof x !== 'string' || !namn.includes(x))) {
    throw new Fel(400, `Ordningen ska ha mallens sökord, vart och ett en gång: ${namn.join(', ')}.`, 'ogiltig', { falt: ['ordning'] });
  }
  db.query('INSERT OR REPLACE INTO egen_sokordsordning (personal_id, typ, ordning, andrad) VALUES (?, ?, ?, ?)').run(personal.id, mall.typ, JSON.stringify(ordning), iso());
  return lista(db, personal);
}

// Personens ordning för mallen, eller null.
export function ordningFor(db, personal, typ) {
  sakraSchema(db);
  const r = db.query('SELECT ordning FROM egen_sokordsordning WHERE personal_id = ? AND typ = ?').get(personal.id, String(typ ?? ''));
  return r ? JSON.parse(r.ordning) : null;
}
