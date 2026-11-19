// Runda 18, r3: varje tabell som någon modul skapar ska ha en klass för lagringen och uttaget per huvudman (lagring.js,
// klassa), också de tabeller som skapas först när de används, till exempel rapporterna till myndigheter. Testet läser
// alla CREATE TABLE i src/, skapar tabellerna i en tom databas och kräver att ingen är oklassad. En ny tabell med
// patientuppgifter som saknar klass stoppar alltså bygget, och felet säger var den ska klassas.
import { describe, test, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as lagring from '../src/lagring.js';
import { byggSeed } from '../src/db.js';

const SRC = join(import.meta.dir, '..', 'src');
// Moduler med en egen databas utanför sandlådan (synpunkterna och användartestets svar, som delas mellan besökarna).
// Deras tabeller finns aldrig i en sandlåda och hör inte till lagringen per huvudman.
// Sammanslagningen av runda 18: r1:s räknare för inbjudningar (inbjudan.js) ligger i synpunkternas databas.
const EGEN_DATABAS = new Set(['synpunkter.js', 'anvandartest-svar.js', 'inbjudan.js']);
const filer = (dir) => readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? filer(p) : f.endsWith('.js') ? [p] : []; });

// Varje CREATE TABLE med sin kolumnlista, utan de som byggs med en variabel i namnet eller i ett annat schema.
function skapaTabeller() {
  const ut = new Map();
  for (const f of filer(SRC)) {
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(/CREATE TABLE IF NOT EXISTS\s+("?)([a-z_][a-z0-9_]*)\1\s*\(/gi)) {
      let i = m.index + m[0].length;
      let d = 1;
      while (i < s.length && d > 0) { if (s[i] === '(') d++; else if (s[i] === ')') d--; i++; }
      const sql = s.slice(m.index, i);
      if (sql.includes('${') || ut.has(m[2]) || EGEN_DATABAS.has(f.slice(SRC.length + 1))) continue;
      ut.set(m[2], { sql, fil: f.slice(SRC.length + 1) });
    }
  }
  return ut;
}

describe('Lagringsklasser för alla tabeller', () => {
  test('varje tabell som någon modul skapar, också de som skapas först när de används, har en klass för lagringen och uttaget', () => {
    const tabeller = skapaTabeller();
    expect(tabeller.size).toBeGreaterThan(200);
    // Seedens databas först, så att tabeller som byggs om eller får kolumner senare har sin slutliga form.
    const db = byggSeed();
    const inte = [];
    for (const [namn, t] of tabeller) { try { db.exec(t.sql); } catch { inte.push(namn); } }
    const k = lagring.klassa(db);
    const oklassade = Object.entries(k).filter(([, v]) => v.typ === 'oklassad').map(([t]) => `${t} (${tabeller.get(t)?.fil ?? 'okänd fil'})`);
    if (oklassade.length) throw new Error(lagring.oklassadeFel(oklassade));
    // Säkerhetsgranskningen av runda 18: en rapport till myndigheter och kvalitetsregistrets återkoppling kan ha
    // identifierare och uppgifter per vårdenhet från flera huvudmän. De hör till systemet och följer inte med i ett uttag.
    expect(k.myndighetsrapporter).toEqual({ typ: 'system' });
    expect(k.registeraterkoppling).toEqual({ typ: 'system' });
    expect(inte.length).toBeLessThan(tabeller.size / 10);
  });

  test('säkerhetsgranskningen: rapporter till myndigheter och registrets återkoppling följer aldrig med i en huvudmans uttag', () => {
    const db = byggSeed();
    db.exec(readFileSync(join(SRC, 'myndighetsrapport.js'), 'utf8').match(/CREATE TABLE IF NOT EXISTS myndighetsrapporter[\s\S]*?\);/)[0]);
    db.exec(readFileSync(join(SRC, 'myndighetsrapport.js'), 'utf8').match(/CREATE TABLE IF NOT EXISTS registeraterkoppling[\s\S]*?\);/)[0]);
    // En rapport skickad av personal hos en huvudman, med identifierare och antal per vårdenhet från flera huvudmän.
    db.query("INSERT INTO myndighetsrapporter (rapport, period, skickad, av, mottagare, filer, antal, kvarhallna, utelamnade, kvittens) VALUES ('prov', '2026-01-01/2026-01-31', '2026-02-01T08:00:00Z', 'lak-kard', 'Prov', ?, '{}', 0, '[]', '{}')")
      .run(JSON.stringify([{ kod: 'MFR_FV1', idn: ['idn-prov-1', 'idn-prov-2'] }]));
    db.query("INSERT INTO registeraterkoppling (register, rapport_id, tid, data) VALUES ('prov', 'kvalitetsregister', '2026-02-02T08:00:00Z', ?)").run(JSON.stringify({ enheter: [{ hsaId: 'x', antal: 3 }] }));
    for (const h of lagring.huvudman_lista(db)) {
      const u = lagring.uttag(db, h.id);
      try {
        expect(u.antal.myndighetsrapporter ?? 0).toBe(0);
        expect(u.antal.registeraterkoppling ?? 0).toBe(0);
      } finally { u.db.close(); }
    }
  });

  test('en ny tabell med patientuppgifter i en kolumn som systemet inte känner igen blir oklassad och syns på sidan Lagring', () => {
    const db = byggSeed();
    db.exec('CREATE TABLE prov_utan_klass (id INTEGER PRIMARY KEY, personnummer TEXT, text TEXT)');
    expect(lagring.klassa(db).prov_utan_klass).toEqual({ typ: 'oklassad' });
  });
});
