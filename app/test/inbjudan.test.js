// Tillägg 2026-11-19 (Jonas), runda 18, r1: bjud in en kollega och dela. Systemet skickar aldrig något självt och sparar
// inga adresser. En inbjudan har en slumpad kod, ett besök sparar bara kanalen, och ett genomfört pass räknas på besöket
// utan koppling till mätningen eller svaren.
import { describe, test, expect } from 'bun:test';
import { testserver, klient, sandlada } from './hjalp.js';
import * as sp from '../src/synpunkter.js';
import * as ib from '../src/inbjudan.js';
import { KANALER, KOD, delningslankar, inbjudningstext, lankFor } from '../public/js/inbjudan-regler.js';
import { T18R1IB } from '../src/sussa/runda18-r1.js';

const T = Object.fromEntries(Object.entries(T18R1IB).map(([k, v]) => [k, v.replace(/^Inbjudan > /, '')]));

describe('Inbjudan', () => {
  test(T.skapa, async () => {
    const t = testserver({ synpunktFil: ':memory:' });
    try {
      const k = klient(t);
      const r = await k.post('/api/inbjudan', { namn: 'Kalle', epost: 'kalle@example.se' });
      expect(r.status).toBe(201);
      expect(r.data.kod).toMatch(KOD);
      expect(Object.keys(r.data)).toEqual(['kod']);
      const rad = t.synpunkter.db.query('SELECT * FROM inbjudningar').get();
      expect(JSON.stringify(rad)).not.toContain('Kalle');
      expect(JSON.stringify(rad)).not.toContain('example');
      expect(Object.keys(rad).sort()).toEqual(['id', 'kod', 'skapare', 'tid']);
      // Taket per session och timme.
      for (let i = 1; i < ib.TAK_INBJUDAN.perTimme; i++) { const x = await k.post('/api/inbjudan', {}); if (x.status === 429) break; }
      const db = sp.oppna(':memory:');
      const session = {};
      const nu = new Date('2026-11-19T10:00:00Z');
      for (let i = 0; i < ib.TAK_INBJUDAN.perMinut; i++) ib.skapa(db, { nu: new Date(nu.getTime() + i * 1000), session, adress: '10.1.1.1' });
      expect(() => ib.skapa(db, { nu, session, adress: '10.1.1.1' })).toThrow(/Högst/);
      for (let i = ib.TAK_INBJUDAN.perMinut; i < ib.TAK_INBJUDAN.perTimme; i++) ib.skapa(db, { nu: new Date(nu.getTime() + i * 61_000), session, adress: '10.1.1.1' });
      expect(() => ib.skapa(db, { nu: new Date(nu.getTime() + 3000_000), session, adress: '10.1.1.1' })).toThrow(/i timmen/);
    } finally { t.stopp(); }
  });

  test(T.besok, async () => {
    const t = testserver({ synpunktFil: ':memory:' });
    try {
      const { kod } = (await klient(t).post('/api/inbjudan', {})).data;
      // Besöket kräver ingen sandlåda.
      const b = await klient(t).post('/api/inbjudan/besok', { kod, kanal: 'linkedin' });
      expect(b.status).toBe(200);
      expect(b.data.besok).toMatch(/^B-/);
      for (const fel of [{ kod: 'I-AAAAAA', kanal: 'lank' }, { kod, kanal: 'tiktok' }, { kod: 'x'.repeat(500), kanal: 'lank' }, { kod: 5, kanal: 'lank' }]) {
        const r = await klient(t).post('/api/inbjudan/besok', fel);
        expect(r.status).toBe(200);
        expect(r.data).toEqual({ besok: null });
      }
      const rader = t.synpunkter.db.query('SELECT * FROM inbjudan_besok').all();
      expect(rader).toHaveLength(1);
      expect(rader[0]).toMatchObject({ kod, kanal: 'linkedin', pass: 0 });
    } finally { t.stopp(); }
  });

  test(T.pass, async () => {
    const t = testserver({ synpunktFil: ':memory:' });
    try {
      const { kod } = (await klient(t).post('/api/inbjudan', {})).data;
      const { besok } = (await klient(t).post('/api/inbjudan/besok', { kod, kanal: 'epost' })).data;
      const k = klient(t);
      await k.logga('usk-kard');
      expect((await k.post('/api/testare/starta', { testroll: 'underskoterska', pass: true, matning: 'ja', besok })).status).toBe(200);
      expect((await k.post('/api/testare/starta', { testroll: 'underskoterska', pass: true, matning: 'ja', besok: 'inte-en-kod' })).status).toBe(400);
      await k.post('/api/testare/starta', { testroll: 'underskoterska', pass: true, matning: 'ja', besok });
      expect(t.synpunkter.db.query('SELECT pass FROM inbjudan_besok').get().pass).toBe(0);
      for (const [typ, varde] of [['langd', '165'], ['vikt', '75'], ['blodtryck', '140/90'], ['puls', '83']]) await k.post('/api/patient/sus06/matvarden', { typ, varde });
      await k.get('/api/testare');
      expect(t.synpunkter.db.query('SELECT pass FROM inbjudan_besok').get().pass).toBe(1);
      // Mätningen, svaren och synpunkterna har ingen kod eller något besök.
      await k.post('/api/testare/pass/matning', { klick: 4, faltbyten: 3, tangenter: 0, slut: true });
      await k.post('/api/synpunkter', { typ: 'annat', allvar: 'liten', text: 'En synpunkt.' });
      const ovrigt = JSON.stringify([...t.synpunkter.db.query('SELECT * FROM pass_matningar').all(), ...t.synpunkter.db.query('SELECT * FROM synpunkter').all()]);
      expect(ovrigt).not.toContain(kod);
      expect(ovrigt).not.toContain(besok);
      // Sandlådan har bara besöket, aldrig koden.
      expect(JSON.stringify(sandlada(t, k).db.query('SELECT * FROM testare').get())).not.toContain(kod);
    } finally { t.stopp(); }
  });

  test(T.testledare, async () => {
    const db = sp.oppna(':memory:');
    const nu = new Date('2026-11-19T10:00:00Z');
    const { kod } = ib.skapa(db, { nu, session: {}, adress: '10.2.2.2' });
    const b1 = ib.besok(db, { kod, kanal: 'linkedin' }, { nu, adress: '10.3.3.3' }).besok;
    ib.besok(db, { kod, kanal: 'linkedin' }, { nu, adress: '10.3.3.4' });
    ib.besok(db, { kod, kanal: 'x' }, { nu, adress: '10.3.3.5' });
    ib.passKlar(db, b1);
    const s = ib.sammanstall(db);
    expect(s).toEqual({ koder: 1, besok: 3, pass: 1, perKanal: KANALER.map(([k, text]) => ({ kanal: k, text, besok: k === 'linkedin' ? 2 : k === 'x' ? 1 : 0, pass: k === 'linkedin' ? 1 : 0 })) });
    expect(JSON.stringify(s)).not.toContain(kod);
    expect(sp.lista(db, {}).inbjudningar).toEqual(s);
    expect(sp.stada(db, { nu: new Date(nu.getTime() + 366 * 86400_000) })).toMatchObject({ inbjudningar: 1, besok: 3 });
    expect(ib.sammanstall(db).koder).toBe(0);
  });

  test(T.takUtanSession, async () => {
    const t = testserver({ synpunktFil: ':memory:' });
    try {
      // Varje anrop utan kaka från samma adress: taket per minut gäller ändå, eftersom det räknas per adressgrupp i databasen.
      const svar = [];
      for (let i = 0; i <= ib.TAK_INBJUDAN.perMinut; i++) svar.push((await klient(t).post('/api/inbjudan', {})).status);
      expect(svar.slice(0, ib.TAK_INBJUDAN.perMinut)).toEqual(Array(ib.TAK_INBJUDAN.perMinut).fill(201));
      expect(svar.at(-1)).toBe(429);
      // Taket i timmen och per dygn räknas också per adressgrupp, utan session.
      const db = sp.oppna(':memory:');
      const nu = new Date('2026-11-19T10:00:00Z');
      for (let i = 0; i < ib.TAK_INBJUDAN.perTimme; i++) ib.skapa(db, { nu: new Date(nu.getTime() + i * 61_000), adress: '10.9.9.9' });
      expect(() => ib.skapa(db, { nu: new Date(nu.getTime() + 20 * 61_000), adress: '10.9.9.9' })).toThrow(/i timmen/);
      // En annan adress påverkas inte.
      expect(ib.skapa(db, { nu, adress: '10.8.8.8' }).kod).toMatch(KOD);
      // Det totala taket tar aldrig bort någons levande inbjudan: nya stoppas med 503 (fail closed), och bara gallringen
      // tar bort rader efter ålder.
      const db2 = sp.oppna(':memory:');
      const tak = { ...ib.TAK_INBJUDAN, totalt: 3 };
      const koder = [];
      for (let i = 0; i < 3; i++) koder.push(ib.skapa(db2, { nu, adress: `10.7.7.${i}`, tak }).kod);
      let fel = null;
      try { ib.skapa(db2, { nu, adress: '10.7.7.9', tak }); } catch (e) { fel = e; }
      expect(fel?.status).toBe(503);
      expect(fel.message).toMatch(/tar inte emot fler inbjudningar/);
      expect(db2.query('SELECT kod FROM inbjudningar ORDER BY id').all().map(r => r.kod)).toEqual(koder);
      // Besöken: samma sak, och en levande inbjudans räkning per kanal ändras inte.
      const takB = { ...ib.TAK_BESOK, totalt: 2 };
      for (let i = 0; i < 2; i++) expect(ib.besok(db2, { kod: koder[0], kanal: 'x' }, { nu, adress: `10.6.6.${i}`, tak: takB }).besok).toMatch(/^B-/);
      expect(() => ib.besok(db2, { kod: koder[0], kanal: 'x' }, { nu, adress: '10.6.6.9', tak: takB })).toThrow(/tar inte emot fler/);
      expect(db2.query('SELECT count(*) AS n FROM inbjudan_besok').get().n).toBe(2);
      // Ett globalt tak per minut och timme för nya koder, oavsett adress.
      const db3 = sp.oppna(':memory:');
      const takG = { ...ib.TAK_INBJUDAN, globaltPerMinut: 4, globaltPerTimme: 6 };
      for (let i = 0; i < 4; i++) ib.skapa(db3, { nu, adress: `10.5.5.${i}`, tak: takG });
      expect(() => ib.skapa(db3, { nu, adress: '10.5.5.99', tak: takG })).toThrow(/just nu/);
      for (let i = 0; i < 2; i++) ib.skapa(db3, { nu: new Date(nu.getTime() + 120_000), adress: `10.5.6.${i}`, tak: takG });
      expect(() => ib.skapa(db3, { nu: new Date(nu.getTime() + 240_000), adress: '10.5.7.1', tak: takG })).toThrow(/just nu/);
    } finally { t.stopp(); }
  });

  test(T.ipv6, () => {
    // IPv6-adresser grupperas per /48 för rutterna utan inloggning, så att en klient inte kan byta adress i sitt nät för
    // att komma runt taken. IPv4 räknas per adress.
    expect(sp.skapareFor('2001:db8:1:1::5')).toBe(sp.skapareFor('2001:db8:1:ffff::9'));
    expect(sp.skapareFor('2001:db8:1::1')).not.toBe(sp.skapareFor('2001:db8:2::1'));
    expect(sp.skapareFor('[2001:0db8:0001:0002::1]')).toBe(sp.skapareFor('2001:db8:1:3::1'));
    expect(sp.skapareFor('10.0.0.1')).not.toBe(sp.skapareFor('10.0.0.2'));
    expect(sp.skapareFor('::ffff:10.0.0.1')).toBe(sp.skapareFor('10.0.0.1'));
    const db = sp.oppna(':memory:');
    const nu = new Date('2026-11-19T10:00:00Z');
    for (let i = 0; i < ib.TAK_INBJUDAN.perMinut; i++) ib.skapa(db, { nu, adress: `2001:db8:7:${i}::1` });
    expect(() => ib.skapa(db, { nu, adress: '2001:db8:7:99::1' })).toThrow(/Högst/);
  });

  test(T.text, () => {
    const origin = 'https://vardkallan.example';
    const kod = 'I-ABCDEF';
    const l = delningslankar(origin, kod);
    expect(new URL(l.linkedin).hostname).toBe('www.linkedin.com');
    expect(new URL(l.facebook).hostname).toBe('www.facebook.com');
    expect(new URL(l.x).hostname).toBe('x.com');
    expect(l.epost.startsWith('mailto:?subject=')).toBe(true);
    for (const [kanal, href] of Object.entries(l)) {
      const u = decodeURIComponent(href);
      expect(u).toContain(`${origin}/#/testa?i=${kod}&k=${kanal}`);
    }
    expect(lankFor(origin, kod, 'lank')).toBe(`${origin}/#/testa?i=I-ABCDEF&k=lank`);
    const text = inbjudningstext('LÄNK');
    expect(text).toContain('fem minuter');
    expect(text).toContain('påhittade patienter');
    expect(text).not.toMatch(/Cosmic|Take Care|Melior|bäst|bättre|enklare|snabbare|fantastisk|[—–…]/i);
  });
});
