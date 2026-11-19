// Tillägg 2026-11-19 (Jonas), runda 18, r1: bjud in en kollega och dela. Systemet skickar aldrig något självt och sparar
// inga adresser. Att bjuda in skapar ingen rad: länken bär bara kanalen. Besök och genomförda pass räknas i en räknare per
// dag och kanal med fast storlek, och en adressgrupp kan bara räkna ett visst antal gånger i timmen.
import { describe, test, expect } from 'bun:test';
import { testserver, klient, sandlada } from './hjalp.js';
import * as sp from '../src/synpunkter.js';
import * as ib from '../src/inbjudan.js';
import { KANALER, delningslankar, inbjudningstext, lankFor } from '../public/js/inbjudan-regler.js';
import { T18R1IB } from '../src/sussa/runda18-r1.js';

const T = Object.fromEntries(Object.entries(T18R1IB).map(([k, v]) => [k, v.replace(/^Inbjudan > /, '')]));
const rader = (db) => db.query('SELECT dag, kanal, besok, pass FROM inbjudan_rakning ORDER BY dag, kanal').all();

describe('Inbjudan', () => {
  test(T.ingenRad, async () => {
    const t = testserver({ synpunktFil: ':memory:' });
    try {
      // Det finns ingen rutt för att skapa en inbjudan, och inga tabeller för koder.
      expect((await klient(t).post('/api/inbjudan', {})).status).toBe(404);
      const tabeller = t.synpunkter.db.query("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(r => r.name);
      expect(tabeller).not.toContain('inbjudningar');
      expect(tabeller).not.toContain('inbjudan_besok');
      expect(lankFor('https://x.example', 'linkedin')).toBe('https://x.example/#/testa?via=linkedin');
      expect(KANALER.map(([k]) => k)).toEqual(['lank', 'epost', 'linkedin', 'facebook', 'x', 'dela']);
      // En databas från före omgörningen blir av med tabellerna för koder.
      const db = sp.oppna(':memory:');
      db.exec("CREATE TABLE inbjudningar (id INTEGER PRIMARY KEY, kod TEXT); CREATE TABLE inbjudan_besok (id INTEGER PRIMARY KEY)");
      ib.sakra(db);
      expect(db.query("SELECT count(*) AS n FROM sqlite_master WHERE name IN ('inbjudningar', 'inbjudan_besok')").get().n).toBe(0);
    } finally { t.stopp(); }
  });

  test(T.besok, async () => {
    const t = testserver({ synpunktFil: ':memory:' });
    try {
      // Besöket kräver ingen sandlåda och sätter ingen kaka.
      const b = await klient(t).post('/api/inbjudan/besok', { kanal: 'linkedin', namn: 'Kalle' });
      expect(b.status).toBe(200);
      expect(b.data).toEqual({ ok: true });
      expect(b.headers.get('set-cookie')).toBeNull();
      for (const fel of [{ kanal: 'tiktok' }, { kanal: 5 }, { kanal: 'x'.repeat(500) }, {}]) {
        const r = await klient(t).post('/api/inbjudan/besok', fel);
        expect(r.status).toBe(200);
        expect(r.data).toEqual({ ok: true });
      }
      const r = rader(t.synpunkter.db);
      expect(r).toHaveLength(1);
      expect(r[0]).toMatchObject({ kanal: 'linkedin', besok: 1, pass: 0 });
      expect(JSON.stringify(t.synpunkter.db.query('SELECT * FROM inbjudan_rakning').all())).not.toContain('Kalle');
    } finally { t.stopp(); }
  });

  test(T.pass, async () => {
    const t = testserver({ synpunktFil: ':memory:' });
    try {
      const k = klient(t);
      await k.logga('usk-kard');
      expect((await k.post('/api/testare/starta', { testroll: 'underskoterska', pass: true, matning: 'ja', via: 'tiktok' })).status).toBe(400);
      expect((await k.post('/api/testare/starta', { testroll: 'underskoterska', pass: true, matning: 'ja', via: 'epost' })).status).toBe(200);
      expect(rader(t.synpunkter.db)).toEqual([]);
      for (const [typ, varde] of [['langd', '165'], ['vikt', '75'], ['blodtryck', '140/90'], ['puls', '83']]) await k.post('/api/patient/sus06/matvarden', { typ, varde });
      await k.get('/api/testare');
      await k.get('/api/testare');
      expect(rader(t.synpunkter.db)).toEqual([expect.objectContaining({ kanal: 'epost', besok: 0, pass: 1 })]);
      // Mätningen, svaren och synpunkterna har ingen kanal.
      await k.post('/api/testare/pass/matning', { klick: 4, faltbyten: 3, tangenter: 0, slut: true });
      await k.post('/api/synpunkter', { typ: 'annat', allvar: 'liten', text: 'En synpunkt.' });
      const ovrigt = JSON.stringify([...t.synpunkter.db.query('SELECT * FROM pass_matningar').all(), ...t.synpunkter.db.query('SELECT * FROM synpunkter').all()]);
      expect(ovrigt).not.toContain('epost');
      expect(sandlada(t, k).db.query('SELECT inbjudan_kanal FROM testare').get().inbjudan_kanal).toBe('epost');
    } finally { t.stopp(); }
  });

  test(T.tak, () => {
    const db = sp.oppna(':memory:');
    const tak = new ib.TakPerTimme();
    const nu = new Date('2026-11-19T10:00:00Z');
    for (let i = 0; i < ib.MAX_PER_TIMME + 5; i++) expect(ib.besok(db, { kanal: 'x' }, { nu, adress: '10.1.1.1', tak })).toEqual({ ok: true });
    expect(rader(db)[0].besok).toBe(ib.MAX_PER_TIMME);
    // En annan adress räknas för sig, och IPv6 räknas per /48.
    ib.besok(db, { kanal: 'x' }, { nu, adress: '10.1.1.2', tak });
    for (let i = 0; i < ib.MAX_PER_TIMME + 5; i++) ib.besok(db, { kanal: 'facebook' }, { nu, adress: `2001:db8:7:${i}::1`, tak });
    expect(rader(db).find(r => r.kanal === 'x').besok).toBe(ib.MAX_PER_TIMME + 1);
    expect(rader(db).find(r => r.kanal === 'facebook').besok).toBe(ib.MAX_PER_TIMME);
    // Nästa timme räknas igen.
    ib.besok(db, { kanal: 'x' }, { nu: new Date(nu.getTime() + 3600_000), adress: '10.1.1.1', tak });
    expect(rader(db).find(r => r.kanal === 'x').besok).toBe(ib.MAX_PER_TIMME + 2);
    // Passen har samma tak.
    for (let i = 0; i < ib.MAX_PER_TIMME + 3; i++) ib.passKlar(db, 'dela', { nu, adress: '10.9.9.9', tak });
    expect(rader(db).find(r => r.kanal === 'dela').pass).toBe(ib.MAX_PER_TIMME);
    expect(sp.skapareFor('2001:db8:1:1::5')).toBe(sp.skapareFor('2001:db8:1:ffff::9'));
    expect(sp.skapareFor('2001:db8:1::1')).not.toBe(sp.skapareFor('2001:db8:2::1'));
    expect(sp.skapareFor('::ffff:10.0.0.1')).toBe(sp.skapareFor('10.0.0.1'));
  });

  test(T.testledare, () => {
    const db = sp.oppna(':memory:');
    const tak = new ib.TakPerTimme();
    const nu = new Date('2026-11-19T10:00:00Z');
    for (let i = 0; i < 1000; i++) ib.besok(db, { kanal: 'linkedin' }, { nu, adress: `10.3.${Math.floor(i / 200)}.${i % 200}`, tak });
    ib.besok(db, { kanal: 'x' }, { nu: new Date(nu.getTime() + 86400_000), adress: '10.4.4.4', tak });
    ib.passKlar(db, 'linkedin', { nu, adress: '10.5.5.5', tak });
    // En rad per dag och kanal.
    expect(rader(db)).toHaveLength(2);
    const s = ib.sammanstall(db);
    expect(s).toEqual({ besok: 1001, pass: 1, perKanal: KANALER.map(([k, text]) => ({ kanal: k, text, besok: k === 'linkedin' ? 1000 : k === 'x' ? 1 : 0, pass: k === 'linkedin' ? 1 : 0 })) });
    expect(sp.lista(db, {}).inbjudningar).toEqual(s);
    expect(sp.stada(db, { nu: new Date(nu.getTime() + 366 * 86400_000) })).toMatchObject({ inbjudningar: 1 });
    expect(rader(db).map(r => r.kanal)).toEqual(['x']);
  });

  test(T.text, () => {
    const origin = 'https://vardkallan.example';
    const l = delningslankar(origin);
    expect(new URL(l.linkedin).hostname).toBe('www.linkedin.com');
    expect(new URL(l.facebook).hostname).toBe('www.facebook.com');
    expect(new URL(l.x).hostname).toBe('x.com');
    expect(l.epost.startsWith('mailto:?subject=')).toBe(true);
    for (const [kanal, href] of Object.entries(l)) expect(decodeURIComponent(href)).toContain(`${origin}/#/testa?via=${kanal}`);
    const text = inbjudningstext('LÄNK');
    expect(text).toContain('fem minuter');
    expect(text).toContain('påhittade patienter');
    expect(text).not.toMatch(/Cosmic|Take Care|Melior|bäst|bättre|enklare|snabbare|fantastisk|[—–…]/i);
  });
});
