// Runda 19, r1: vägledningen i alla uppdrag, servern. Jämförelsefrågan sparar om vägledningen var på, och testledaren
// ser det i sin vy och i exporten. Passet går till återkopplingen när uppgiften blir gjord innan frågan om mätning är
// besvarad, eftersom vägledningen nu visas direkt. Testkroken som byter gränssnittets version (omladdningen) finns bara
// med testflaggan i en testcontainer.
import { describe, test, expect } from 'bun:test';
import { testserver, klient } from './hjalp.js';
import * as sp from '../src/synpunkter.js';
import * as testversion from '../src/testversion.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function borja(t, testroll, demoroll, extra = {}) {
  const k = klient(t);
  await k.logga(demoroll);
  const s = await k.post('/api/testare/starta', { testroll, profil: { system: 'cosmic' }, ...extra });
  expect(s.status).toBe(200);
  return { k, s: s.data };
}

describe('Vägledningen i uppdragen, servern', () => {
  test('jämförelsefrågan sparar om vägledningen var på, bara som sant eller falskt, och testledaren ser det i vyn och exporten', async () => {
    const t = testserver({ synpunktFil: ':memory:' });
    try {
      const { k } = await borja(t, 'lakare-sjukhus', 'lak-kard');
      for (const id of ['3.4', '7.3', '6.3', '7.4']) expect((await k.post(`/api/testare/uppdrag/${id}/hoppa`, {})).status).toBe(200);
      // Fel typ ger 400 och sparar inget.
      for (const fel of ['ja', 1, 0, {}, []]) expect((await k.post('/api/testare/uppdrag/3.4/jamforelse', { jamforelse: 'lika', vagledning: fel })).status).toBe(400);
      expect((await k.post('/api/testare/uppdrag/3.4/jamforelse', { jamforelse: 'lika', vagledning: true })).status).toBe(201);
      expect((await k.post('/api/testare/uppdrag/7.3/jamforelse', { jamforelse: 'svarare', vagledning: false })).status).toBe(201);
      expect((await k.post('/api/testare/uppdrag/6.3/jamforelse', { jamforelse: 'lattare' })).status).toBe(201);
      expect((await k.post('/api/testare/uppdrag/7.4/jamforelse', { jamforelse: 'lattare', vagledning: null })).status).toBe(201);
      const rader = t.synpunkter.db.query('SELECT uppdrag, vagledning FROM jamforelser ORDER BY id').all();
      expect(rader).toEqual([{ uppdrag: '3.4', vagledning: 1 }, { uppdrag: '7.3', vagledning: 0 }, { uppdrag: '6.3', vagledning: null }, { uppdrag: '7.4', vagledning: null }]);
      const kod = sp.skapaLaskod(t.synpunkter.db, { namn: 'x' }).kod;
      const l = (await klient(t).post('/api/testledare/synpunkter', { laskod: kod })).data;
      expect(l.jamforelser.find(x => x.uppdrag === '3.4').vagledning).toBe(true);
      expect(l.jamforelser.find(x => x.uppdrag === '7.3').vagledning).toBe(false);
      expect(l.jamforelser.find(x => x.uppdrag === '6.3').vagledning).toBe(null);
      expect(l.perUppdrag.find(x => x.uppdrag === '3.4' && x.system === 'alla')).toMatchObject({ medVagledning: 1, utanVagledning: 0 });
      expect(l.perUppdrag.find(x => x.uppdrag === '7.3' && x.system === 'alla')).toMatchObject({ medVagledning: 0, utanVagledning: 1 });
      expect(l.perUppdrag.find(x => x.uppdrag === '6.3' && x.system === 'alla')).toMatchObject({ medVagledning: 0, utanVagledning: 0 });
      const csv = (await klient(t).post('/api/testledare/export', { laskod: kod, format: 'csv-uppdrag' })).data.split('\n');
      const kol = csv[0].split(';').indexOf('vagledning');
      expect(kol).toBeGreaterThan(0);
      const cell = (uppdrag) => csv.find(r => r.split(';')[3] === uppdrag)?.split(';')[kol];
      expect([cell('3.4'), cell('7.3'), cell('6.3')]).toEqual(['true', 'false', '']);
      const md = (await klient(t).post('/api/testledare/export', { laskod: kod, format: 'md' })).data;
      expect(md).toContain('| Med vägledning | Utan vägledning |');
      const nya = sp.nyaSomMarkdown(t.synpunkter.db, { markera: false, namnFor: () => null }).text;
      expect(nya).toContain('| Med vägledning | Utan vägledning |');
    } finally { t.stopp(); }
  });

  test('kolumnen för vägledningen läggs till i en äldre synpunktsdatabas, och gallringen tar raderna som förut', () => {
    const db = sp.oppna(':memory:');
    try {
      db.exec('ALTER TABLE jamforelser DROP COLUMN vagledning');
      expect(db.query("SELECT name FROM pragma_table_info('jamforelser')").all().map(k => k.name)).not.toContain('vagledning');
      db.close();
    } catch (e) { db.close(); throw e; }
    // En databas på disk utan kolumnen får den när den öppnas igen.
    const dir = mkdtempSync(join(tmpdir(), 'vk19-'));
    try {
      const fil = join(dir, 's.sqlite');
      const a = sp.oppna(fil);
      a.exec('ALTER TABLE jamforelser DROP COLUMN vagledning');
      a.close();
      const b = sp.oppna(fil);
      expect(b.query("SELECT name FROM pragma_table_info('jamforelser')").all().map(k => k.name)).toContain('vagledning');
      b.close();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('passet går till återkopplingen utan mätning när det blir gjort eller avbrutet innan frågan om mätning är besvarad', async () => {
    const t = testserver({ synpunktFil: ':memory:' });
    try {
      const { k, s } = await borja(t, 'lakare-sjukhus', 'lak-kard', { pass: true });
      expect(s.pass).toMatchObject({ uppdrag: '3.1', fas: 'samtycke', matning: null });
      // Testaren avbryter passet innan frågan är besvarad.
      const hoppa = await k.post('/api/testare/uppdrag/3.1/hoppa', {});
      expect(hoppa.data.pass).toMatchObject({ fas: 'aterkoppling', matning: null });
      expect(hoppa.data.pass.resultat).toMatchObject({ status: 'avbruten' });
      // Frågan går inte längre att besvara, och ingen mätning skapas.
      expect((await k.post('/api/testare/pass/samtycke', { matning: 'ja' })).status).toBe(409);
      expect(t.synpunkter.db.query('SELECT count(*) AS n FROM pass_matningar').get().n).toBe(0);
      // Jämförelsen för passets uppdrag sparas utan tid.
      expect((await k.post('/api/testare/uppdrag/3.1/jamforelse', { jamforelse: 'lika', vagledning: true })).status).toBe(201);
      expect(t.synpunkter.db.query("SELECT tid_s FROM jamforelser WHERE uppdrag = '3.1'").get().tid_s).toBe(null);
      // Sedan SUS och vidare som vanligt.
      expect((await k.post('/api/testare/pass/sus', { hoppa: true })).status).toBe(200);
      const v = await k.post('/api/testare/pass/vidare', {});
      expect(v.data.pass.fas).toBe('klar');
    } finally { t.stopp(); }
  });

  test('testkroken som byter gränssnittets version finns bara med testflaggan, och aldrig med driftens inställningar', async () => {
    expect(testversion.aktiv({})).toBe(false);
    expect(testversion.aktiv({ VARDKALLAN_TESTVERSION: '1' })).toBe(true);
    expect(testversion.aktiv({ VARDKALLAN_TESTVERSION: '1', SESSION_FIL: '/data/s.sqlite' })).toBe(false);
    expect(testversion.aktiv({ VARDKALLAN_TESTVERSION: '1', LITA_PA_PROXY: '1' })).toBe(false);
    expect(testversion.byt({ VARDKALLAN_TESTVERSION: '1', SESSION_FIL: '/data/s.sqlite' })).toBe(null);
    const t = testserver({ synpunktFil: ':memory:' });
    const forra = process.env.VARDKALLAN_TESTVERSION;
    try {
      const k = klient(t);
      const h1 = (await k.get('/api/health')).data;
      expect(typeof h1.gransnitt).toBe('string');
      // Utan flaggan är adressen okänd.
      delete process.env.VARDKALLAN_TESTVERSION;
      expect((await k.post('/api/test/ny-version', {})).status).toBe(404);
      expect((await k.get('/api/health')).data.gransnitt).toBe(h1.gransnitt);
      // Med flaggan byts versionen, och hälsokontrollen visar den nya.
      process.env.VARDKALLAN_TESTVERSION = '1';
      const b = await k.post('/api/test/ny-version', {});
      expect(b.status).toBe(200);
      const h2 = (await k.get('/api/health')).data;
      expect(h2.gransnitt).toBe(b.data.gransnitt);
      expect(h2.gransnitt).not.toBe(h1.gransnitt);
      expect(h2.gransnitt.startsWith(h1.gransnitt)).toBe(true);
      // Med en driftinställning vägrar kroken, och versionen är den riktiga igen.
      process.env.LITA_PA_PROXY = '1';
      expect((await k.post('/api/test/ny-version', {})).status).toBe(404);
      expect((await k.get('/api/health')).data.gransnitt).toBe(h1.gransnitt);
    } finally {
      delete process.env.LITA_PA_PROXY;
      if (forra === undefined) delete process.env.VARDKALLAN_TESTVERSION; else process.env.VARDKALLAN_TESTVERSION = forra;
      t.stopp();
    }
  });
});
