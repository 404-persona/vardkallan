// Runda 14, r5: instruktionsfilmerna (instruktionsfilmer.js, Sussa 11.2.1.4 och 10.1.1.3). Filmerna spelas in av
// test/instruktionsfilmer.cjs och ligger i docs/filmer/. I Docker-bygget finns bara app/, och då prövas registret.
import { describe, test, expect } from 'bun:test';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { FILMER, filmer, MAX_BYTE, manifest, filmUrl } from '../src/instruktionsfilmer.js';
import { FLODEN } from '../src/klickbudget.js';

const ROT = join(import.meta.dir, '..', '..');
const KATALOG = join(ROT, 'docs', 'filmer');

describe('Instruktionsfilmer', () => {
  test('varje instruktionsfilm är ett flöde i klickbudgeten, och filmerna täcker läkaren, sjuksköterskan, undersköterskan, vårdadministratören, invånaren och systemförvaltaren', () => {
    const f = filmer();
    expect(f.length).toBe(FILMER.length);
    expect(new Set(f.map(x => x.id)).size).toBe(f.length);
    for (const x of f) {
      expect(FLODEN.some(fl => fl.id === x.flode), x.id).toBe(true);
      expect(x.beskrivning.length, x.id).toBeGreaterThan(40);
      expect(/[—–…]/.test(x.rubrik + x.beskrivning), x.id).toBe(false);
    }
    const roller = new Set(f.map(x => x.roll));
    for (const r of ['lak-kard', 'ssk-kard', 'usk-kard', 'adm-kard', 'sysf']) expect(roller.has(r), r).toBe(true);
    expect([...roller].some(r => r.startsWith('inv-'))).toBe(true);
  });

  // Runda 15: filmerna ligger som bilagor till releasen för versionen på GitHub, och repot har bara förteckningen med
  // kontrollsummor (src/instruktionsfilmer-manifest.json), så att repot inte växer varje gång filmerna spelas in.
  test('skriptet som spelar in filmerna finns i repot, och förteckningen över filmerna i releasen har varje film som en WebM på högst 2 MB med kontrollsumma', () => {
    const m = manifest();
    expect(m.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(Object.keys(m.filer).sort()).toEqual(FILMER.map(x => x.id).sort());
    for (const [id, f] of Object.entries(m.filer)) {
      expect(f.sha256, id).toMatch(/^[0-9a-f]{64}$/);
      expect(f.byte, id).toBeLessThanOrEqual(MAX_BYTE);
      expect(f.byte, id).toBeGreaterThan(20_000);
      expect(filmUrl(id)).toBe(`https://github.com/SpankulatorX/vardkallan/releases/download/v${m.version}/${id}.webm`);
    }
    // Förteckningen gäller en version som inte är nyare än systemet.
    const [a, b, c] = m.version.split('.').map(Number);
    const [x, y, z] = JSON.parse(readFileSync(join(import.meta.dir, '..', 'package.json'), 'utf8')).version.split('.').map(Number);
    expect((a * 1000 + b) * 1000 + c).toBeLessThanOrEqual((x * 1000 + y) * 1000 + z);
    // I Docker-bygget finns bara app/. Skriptet och de filmer som finns lokalt prövas när repot är monterat.
    if (!existsSync(join(ROT, 'test'))) return;
    const skript = join(ROT, 'test', 'instruktionsfilmer.cjs');
    expect(readFileSync(skript, 'utf8')).toContain('recordVideo');
    expect(readFileSync(skript, 'utf8')).toContain('instruktionsfilmer-manifest.json');
    if (!existsSync(KATALOG)) return;
    for (const n of readdirSync(KATALOG).filter(n => n.endsWith('.webm'))) {
      const id = n.replace(/\.webm$/, '');
      const b = readFileSync(join(KATALOG, n));
      expect(b.subarray(0, 4).toString('hex'), n).toBe('1a45dfa3');
      expect(m.filer[id]?.sha256, n).toBe(createHash('sha256').update(b).digest('hex'));
    }
  });
});
