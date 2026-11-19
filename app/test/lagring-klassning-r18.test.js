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
const EGEN_DATABAS = new Set(['synpunkter.js', 'anvandartest-svar.js']);
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
    // Rapporterna till myndigheter följer den som skickade dem, och kvalitetsregistrets återkoppling hör till systemet.
    expect(k.myndighetsrapporter).toEqual({ typ: 'via', kolumn: 'av', tabell: 'personal' });
    expect(k.registeraterkoppling).toEqual({ typ: 'system' });
    expect(inte.length).toBeLessThan(tabeller.size / 10);
  });

  test('en ny tabell med patientuppgifter i en kolumn som systemet inte känner igen blir oklassad och syns på sidan Lagring', () => {
    const db = byggSeed();
    db.exec('CREATE TABLE prov_utan_klass (id INTEGER PRIMARY KEY, personnummer TEXT, text TEXT)');
    expect(lagring.klassa(db).prov_utan_klass).toEqual({ typ: 'oklassad' });
  });
});
