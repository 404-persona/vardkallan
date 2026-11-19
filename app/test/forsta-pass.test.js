// Runda 18, r1: första passet i testinbjudan. Varje yrkesroll börjar med ett kort pass med en uppgift ur Sussas testfall,
// med vägledning i gränssnittet. Före passet frågar systemet en gång om passet får mätas. Mätningen och SUS efter passet
// sparas i synpunktsdatabasen med samma gallring och tak som synpunkterna, och testledaren ser dem sammanställda.
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { testserver, klient, sandlada } from './hjalp.js';
import * as ti from '../src/testinbjudan.js';
import * as sp from '../src/synpunkter.js';
import * as fp from '../src/forsta-pass.js';
import { TESTFALL } from '../src/sussa-testfall.js';
import { FLODEN } from '../src/klickbudget.js';
import { PASS_STEG, stegIdFor } from '../public/js/forsta-pass-steg.js';
import { T18R1 as T } from '../src/sussa/runda18-r1.js';

// Testnamnen står i kravregistret (src/sussa/runda18-r1.js), med avsnittets namn först.
const T18R1 = Object.fromEntries(Object.entries(T).map(([k, v]) => [k, v.replace(/^Första passet > /, '')]));

let app;
beforeAll(() => { app = testserver({ synpunktFil: ':memory:' }); });
afterAll(() => app.stopp());

async function borja(t, testroll, { matning, pass = true, profil = {} } = {}) {
  const k = klient(t);
  const r = ti.TESTROLLER.find(x => x.id === testroll);
  if (r.invanare) await k.post('/api/login/invanare', { invanareId: r.invanare }); else await k.logga(r.demoroll);
  const s = await k.post('/api/testare/starta', { testroll, profil, pass, ...(matning ? { matning } : {}) });
  expect(s.status).toBe(200);
  return { k, s: s.data };
}
const matningKropp = (testroll, extra = {}) => ({
  klick: 3, faltbyten: 1, tangenter: 0, tidForstaS: 4, hjalp: 0, sokningar: 0, aterkomster: 0, vagledning: true, avstangd: 0,
  steg: stegIdFor(testroll).slice(0, 3).map((id, i) => ({ id, tidS: 5 + i, aterkomster: 0, hjalp: 0, sokningar: 0 })), slut: true, bredd: 1280, ...extra,
});
describe('Första passet', () => {
  test(T18R1.pass, () => {
    expect(Object.keys(fp.PASS).sort()).toEqual(ti.TESTROLLER.map(r => r.id).sort());
    for (const r of ti.TESTROLLER) {
      const p = fp.passFor(r.id);
      expect(r.uppdrag.some(u => u.id === p.uppdrag)).toBe(true);
      expect(p.varfor.length).toBeGreaterThan(40);
      expect(p.text.length).toBeGreaterThan(20);
      expect(Number.isInteger(p.budget) && p.budget > 0).toBe(true);
      expect(p.budgetText.length).toBeGreaterThan(20);
      const steg = PASS_STEG[r.id];
      expect(steg.length).toBeGreaterThanOrEqual(3);
      expect(new Set(steg.map(s => s.id)).size).toBe(steg.length);
      for (const s of steg) {
        expect(s.mal.length).toBeGreaterThan(0);
        expect(s.text).toMatch(/^[A-ZÅÄÖ]/);
        for (const t of [s.text, ...s.mal.map(m => m.text ?? '')]) expect(t).not.toMatch(/[—–…]/);
      }
      if (r.sussaData) {
        // Rollerna med Sussas testdata gör ett av Sussas testfall, med Sussas tidsklass och körningens klickbudget.
        const tf = TESTFALL.find(x => x.nr === p.sussa);
        expect(tf).toBeDefined();
        expect(p.tidsklass).toBe(tf.tidsklass);
        expect(p.budget).toBe(tf.korningar.find(k => k.demoroll === r.demoroll).budget);
      } else {
        expect(p.sussa).toBeNull();
        expect(FLODEN.some(f => f.id === p.flode)).toBe(true);
      }
    }
  });

  test(T18R1.forst, async () => {
    const { k, s } = await borja(app, 'lakare-sjukhus');
    expect(s.pass).toMatchObject({ uppdrag: '3.1', fas: 'samtycke', matning: null });
    expect(s.aktuellt).toBe('3.1');
    expect(s.uppdrag[0].id).toBe('3.1');
    // Utan svar på frågan om mätning tas ingen mätning emot.
    expect((await k.post('/api/testare/pass/matning', matningKropp('lakare-sjukhus'))).status).toBe(409);
    expect((await k.post('/api/testare/pass/samtycke', { matning: 'kanske' })).status).toBe(400);
    const j = await k.post('/api/testare/pass/samtycke', { matning: 'ja' });
    expect(j.status).toBe(200);
    expect(j.data.pass).toMatchObject({ fas: 'pagar', matning: 'ja' });
    // Frågan ställs en gång.
    expect((await k.post('/api/testare/pass/samtycke', { matning: 'nej' })).status).toBe(409);
    const db = sandlada(app, k).db;
    const t = db.query('SELECT * FROM testare WHERE id = 1').get();
    expect(t.pass_start).toBeTruthy();
    expect(Date.parse(t.pass_start)).toBeGreaterThanOrEqual(Date.parse(t.start));
    // Utan pass är allt som förut: det första uppdraget först och inget pass.
    const { s: utan } = await borja(app, 'lakare-sjukhus', { pass: false });
    expect(utan.pass).toBeNull();
    expect(utan.aktuellt).toBe('forsta-patient');
  });

  test(T18R1.nej, async () => {
    const t = testserver({ synpunktFil: ':memory:' });
    try {
      const { k, s } = await borja(t, 'underskoterska', { matning: 'nej' });
      expect(s.pass).toMatchObject({ uppdrag: '4.2', fas: 'pagar', matning: 'nej' });
      for (const [typ, varde] of [['langd', '165'], ['vikt', '75'], ['blodtryck', '140/90'], ['puls', '83']]) expect((await k.post('/api/patient/sus06/matvarden', { typ, varde })).status).toBe(201);
      const efter = (await k.get('/api/testare')).data;
      expect(efter.pass.fas).toBe('aterkoppling');
      // Återkopplingen har bara Sussas budget och tidsklass, inget uppmätt.
      expect(efter.pass.resultat).toMatchObject({ status: 'klar', budget: 7, tidsklass: 6, tidS: null, steg: null });
      expect((await k.post('/api/testare/pass/matning', matningKropp('underskoterska'))).status).toBe(409);
      expect((await k.post('/api/testare/uppdrag/4.2/jamforelse', { jamforelse: 'lattare' })).status).toBe(201);
      expect(t.synpunkter.db.query('SELECT count(*) AS n FROM pass_matningar').get().n).toBe(0);
      expect(t.synpunkter.db.query("SELECT tid_s FROM jamforelser WHERE uppdrag = '4.2'").get().tid_s).toBeNull();
    } finally { t.stopp(); }
  });

  test(T18R1.matning, async () => {
    const t = testserver({ synpunktFil: ':memory:' });
    try {
      const { k } = await borja(t, 'underskoterska', { matning: 'ja', profil: { system: 'cosmic' } });
      // Passet som pågår finns i databasen från start, utan siffror, så att ett pass som aldrig avslutas syns.
      const rad = t.synpunkter.db.query('SELECT * FROM pass_matningar').get();
      expect(rad).toMatchObject({ testroll: 'underskoterska', uppdrag: '4.2', sussa: '4.2', status: 'pagar', budget: 7, tidsklass: 6, system: 'cosmic' });
      // Före uppgiften är gjord kan passet inte rapporteras som klart.
      expect((await k.post('/api/testare/pass/matning', matningKropp('underskoterska'))).status).toBe(409);
      for (const [typ, varde] of [['langd', '165'], ['vikt', '75'], ['blodtryck', '140/90'], ['puls', '83']]) await k.post('/api/patient/sus06/matvarden', { typ, varde });
      const m = await k.post('/api/testare/pass/matning', matningKropp('underskoterska', { klick: 5, faltbyten: 3, tangenter: 0 }));
      expect(m.status).toBe(201);
      expect(m.data.resultat).toMatchObject({ status: 'klar', steg: 8, budget: 7, tidsklass: 6, klick: 5, faltbyten: 3, tangenter: 0 });
      expect(Number.isInteger(m.data.resultat.tidS)).toBe(true);
      expect([10, 5, 2, 0]).toContain(m.data.resultat.tidspoang);
      expect(m.data.tillstand.pass.resultat).toMatchObject({ steg: 8 });
      const efter = t.synpunkter.db.query('SELECT * FROM pass_matningar').get();
      expect(efter).toMatchObject({ status: 'klar', klick: 5, faltbyten: 3, steg_antal: 8, vagledning: 1 });
      // Serverns tid gäller, inte klientens.
      expect(efter.tid_s).toBe(m.data.resultat.tidS);
      expect((await k.post('/api/testare/pass/matning', matningKropp('underskoterska'))).status).toBe(409);
    } finally { t.stopp(); }
  });

  test(T18R1.prova, async () => {
    const t = testserver({ synpunktFil: ':memory:' });
    try {
      const { k } = await borja(t, 'underskoterska', { matning: 'ja' });
      const delvis = (extra) => ({ ...matningKropp('underskoterska'), slut: false, ...extra });
      for (const fel of [{ klick: '3' }, { klick: -1 }, { klick: 1.5 }, { klick: 1e9 }, { tangenter: 99999 }, { vagledning: 'ja' },
        { steg: [{ id: 'finns-inte', tidS: 1 }] }, { steg: [{ id: 'langd', tidS: 'x' }] }, { steg: 'langd' },
        { steg: [{ id: 'langd', tidS: 1 }, { id: 'langd', tidS: 2 }] }, { tidForstaS: 1e7 }]) {
        expect((await k.post('/api/testare/pass/matning', delvis(fel))).status).toBe(400);
      }
      // Ett delresultat medan passet pågår uppdaterar raden men lämnar den som pågående.
      expect((await k.post('/api/testare/pass/matning', delvis({ klick: 2, patient: 'sus06', namn: 'Sara Sandmark', vy: '#/patient/sus06' }))).status).toBe(200);
      const rad = t.synpunkter.db.query('SELECT * FROM pass_matningar').get();
      expect(rad).toMatchObject({ status: 'pagar', klick: 2 });
      expect(JSON.stringify(rad)).not.toContain('sus06');
      expect(JSON.stringify(rad)).not.toContain('Sandmark');
    } finally { t.stopp(); }
  });

  test(T18R1.avbrutet, async () => {
    const t = testserver({ synpunktFil: ':memory:' });
    try {
      const { k } = await borja(t, 'sjukskoterska', { matning: 'ja' });
      expect((await k.post('/api/testare/pass/matning', matningKropp('sjukskoterska', { avbruten: true }))).status).toBe(201);
      expect(t.synpunkter.db.query('SELECT status FROM pass_matningar').get().status).toBe('avbruten');
      const s = (await k.get('/api/testare')).data;
      expect(s.pass.fas).toBe('aterkoppling');
      expect(s.pass.resultat.status).toBe('avbruten');
      expect(s.uppdrag.find(u => u.id === '4.2').status).toBe('hoppade_over');
      expect((await k.post('/api/testare/pass/matning', matningKropp('sjukskoterska'))).status).toBe(409);
      // Ett pass som aldrig rapporteras räknas som avbrutet efter två timmar i sammanställningen.
      await borja(t, 'barnmorska', { matning: 'ja' });
      const nu = new Date(Date.now() + 3 * 3600_000);
      const l = fp.sammanstall(t.synpunkter.db, { nu });
      expect(l.perUppgift.find(g => g.testroll === 'barnmorska')).toMatchObject({ antal: 1, klara: 0, avbrutna: 1 });
      expect(fp.sammanstall(t.synpunkter.db, { nu: new Date() }).perUppgift.find(g => g.testroll === 'barnmorska')).toMatchObject({ antal: 1, pagar: 1, avbrutna: 0 });
    } finally { t.stopp(); }
  });

  test(T18R1.inga, async () => {
    const t = testserver({ synpunktFil: ':memory:' });
    try {
      const { k } = await borja(t, 'sjukskoterska', { matning: 'ja' });
      for (const [typ, varde] of [['langd', '165'], ['vikt', '75'], ['blodtryck', '140/90'], ['puls', '83']]) await k.post('/api/patient/sus06/matvarden', { typ, varde });
      expect((await k.post('/api/testare/pass/matning', matningKropp('sjukskoterska', { steg: stegIdFor('sjukskoterska').map((id) => ({ id, tidS: 70, aterkomster: 1, hjalp: 1, sokningar: 1 })) }))).status).toBe(201);
      expect((await k.post('/api/testare/pass/sus', { svar: [4, 2, 4, 2, 4, 2, 4, 2, 4, 2] })).status).toBe(201);
      const db = sandlada(t, k).db;
      const patienter = db.query('SELECT id, fornamn, efternamn, personnummer FROM patienter').all();
      const sparat = JSON.stringify([...t.synpunkter.db.query('SELECT * FROM pass_matningar').all(), ...t.synpunkter.db.query('SELECT * FROM pass_sus').all()]
        .map(({ skapare, gransnitt, ...r }) => r));
      expect(patienter.length).toBeGreaterThan(20);
      for (const p of patienter) {
        expect(sparat).not.toContain(`"${p.id}"`);
        expect(sparat).not.toContain(`/${p.id}`);
        for (const n of [p.fornamn, p.efternamn]) if (n && n.length > 2) expect(sparat).not.toContain(n);
        if (p.personnummer) { expect(sparat).not.toContain(p.personnummer); expect(sparat).not.toContain(p.personnummer.replace(/\D/g, '')); }
      }
      // Svaren till testaren har inte heller något ur journalerna.
      const svar = JSON.stringify((await k.get('/api/testare')).data);
      for (const p of patienter) if (p.personnummer) expect(svar).not.toContain(p.personnummer);
    } finally { t.stopp(); }
  });

  test(T18R1.sus, async () => {
    const t = testserver({ synpunktFil: ':memory:' });
    try {
      const { k } = await borja(t, 'vardadministrator', { matning: 'nej' });
      // Före passet är gjort finns ingen SUS.
      expect((await k.post('/api/testare/pass/sus', { svar: [5, 1, 5, 1, 5, 1, 5, 1, 5, 1] })).status).toBe(409);
      await k.post('/api/testare/uppdrag/5.1/hoppa');
      for (const fel of [[5, 1, 5], [5, 1, 5, 1, 5, 1, 5, 1, 5, 6], ['5', 1, 5, 1, 5, 1, 5, 1, 5, 1], 'alla']) expect((await k.post('/api/testare/pass/sus', { svar: fel })).status).toBe(400);
      const r = await k.post('/api/testare/pass/sus', { svar: [5, 1, 5, 1, 5, 1, 5, 1, 5, 1], poang: 3 });
      expect(r.status).toBe(201);
      expect(r.data.poang).toBe(100);
      expect(r.data.tillstand.pass.sus).toBe('ja');
      expect((await k.post('/api/testare/pass/sus', { svar: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3] })).status).toBe(409);
      expect(t.synpunkter.db.query('SELECT poang, testroll, uppdrag FROM pass_sus').all()).toEqual([{ poang: 100, testroll: 'vardadministrator', uppdrag: '5.1' }]);
      // Den som inte vill svara slipper, och inget sparas.
      const { k: k2 } = await borja(t, 'fysioterapeut', { matning: 'nej' });
      await k2.post('/api/testare/uppdrag/2.6/hoppa');
      const h = await k2.post('/api/testare/pass/sus', { hoppa: true });
      expect(h.status).toBe(200);
      expect(h.data.tillstand.pass.sus).toBe('nej');
      expect(t.synpunkter.db.query('SELECT count(*) AS n FROM pass_sus').get().n).toBe(1);
    } finally { t.stopp(); }
  });

  test(T18R1.testledare, async () => {
    const db = sp.oppna(':memory:');
    const nu = new Date('2026-11-19T10:00:00Z');
    const ctx = { nu, session: {}, adress: '10.0.0.1', version: '1.8.0', gransnitt: 'abc', webblasare: 'Chrome 140, Linux' };
    const pass = fp.passFor('sjukskoterska');
    for (const [i, x] of [{ tid: 90, steg: 7 }, { tid: 150, steg: 9 }, { tid: 200, steg: 12, fast: true }, null].entries()) {
      const nr = fp.skapaRad(db, { ...ctx, session: {}, testroll: 'sjukskoterska', pass, profil: { system: i < 2 ? 'cosmic' : 'takecare' } });
      if (!x) continue;
      fp.uppdateraRad(db, nr, {
        klick: x.steg - 4, faltbyten: 4, tangenter: 0, tidForstaS: 3, hjalp: x.fast ? 1 : 0, sokningar: 0, aterkomster: x.fast ? 2 : 0, vagledning: true, avstangd: 0,
        steg: [{ id: 'patient', tidS: x.fast ? 80 : 10, aterkomster: x.fast ? 2 : 0, hjalp: 0, sokningar: 0 }, { id: 'langd', tidS: 20, aterkomster: 0, hjalp: x.fast ? 1 : 0, sokningar: 0 }],
      }, { status: 'klar', tidS: x.tid, nu });
    }
    for (const svar of [[5, 1, 5, 1, 5, 1, 5, 1, 5, 1], [4, 2, 4, 2, 4, 2, 4, 2, 4, 2]]) fp.sparaSus(db, svar, { ...ctx, session: {}, testroll: 'sjukskoterska', pass, profil: {} });
    const s = fp.sammanstall(db, { nu: new Date(nu.getTime() + 60_000) });
    const g = s.perUppgift.find(x => x.testroll === 'sjukskoterska');
    expect(g).toMatchObject({ uppdrag: '4.2', sussa: '4.2', antal: 4, klara: 3, pagar: 1, andelKlara: 75, budget: 7, tidsklass: 6, inomBudget: 1 });
    expect(g.tidS.median).toBe(150);
    expect(g.steg.median).toBe(9);
    expect(g.fastnar[0]).toMatchObject({ id: 'patient', antal: 1 });
    expect(g.fastnar.map(f => f.id)).toEqual(expect.arrayContaining(['patient', 'langd']));
    expect(g.fastnar[0].text.length).toBeGreaterThan(5);
    expect(g.sus).toMatchObject({ n: 2, medel: 87.5, min: 75, max: 100 });
    expect(g.sus.sd).toBeCloseTo(17.68, 1);
    expect(s.sus).toMatchObject({ n: 2, medel: 87.5 });
    // Läskoden krävs, och svaret har sammanställningen.
    const t = testserver({ synpunktFil: ':memory:' });
    try {
      expect((await klient(t).post('/api/testledare/synpunkter', { laskod: 'x'.repeat(40) })).status).toBe(403);
      const kod = sp.skapaLaskod(t.synpunkter.db, { namn: 'x' }).kod;
      const l = (await klient(t).post('/api/testledare/synpunkter', { laskod: kod })).data;
      expect(l.pass).toMatchObject({ perUppgift: [], sus: { n: 0 } });
    } finally { t.stopp(); }
  });

  test(T18R1.export, async () => {
    const t = testserver({ synpunktFil: ':memory:' });
    try {
      const { k } = await borja(t, 'underskoterska', { matning: 'ja', profil: { system: 'melior' } });
      for (const [typ, varde] of [['langd', '165'], ['vikt', '75'], ['blodtryck', '140/90'], ['puls', '83']]) await k.post('/api/patient/sus06/matvarden', { typ, varde });
      expect((await k.post('/api/testare/pass/matning', matningKropp('underskoterska'))).status).toBe(201);
      expect((await k.post('/api/testare/pass/sus', { svar: [4, 2, 4, 2, 4, 2, 4, 2, 4, 2] })).status).toBe(201);
      const kod = sp.skapaLaskod(t.synpunkter.db, { namn: 'x' }).kod;
      const csv = await klient(t).post('/api/testledare/export', { laskod: kod, format: 'csv-pass' });
      expect(csv.status).toBe(200);
      expect(csv.headers.get('content-disposition')).toMatch(/forsta-pass-\d{4}-\d{2}-\d{2}\.csv/);
      expect(csv.data.split('\n')[0]).toContain('steg_antal');
      expect(csv.data).toContain('underskoterska;4.2');
      const sus = await klient(t).post('/api/testledare/export', { laskod: kod, format: 'csv-sus' });
      expect(sus.data).toContain(';75');
      const md = (await klient(t).post('/api/testledare/export', { laskod: kod, format: 'md' })).data;
      expect(md).toContain('## Första passet');
      expect(md).toContain('Registrera mätvärden');
      expect(md).toContain('SUS');
      const nya = sp.nyaSomMarkdown(t.synpunkter.db, { namnFor: ti.namnFor });
      expect(nya.text).toContain('Första passet');
      expect(nya.text).toContain('1 nya pass');
      const igen = sp.nyaSomMarkdown(t.synpunkter.db, { namnFor: ti.namnFor }).text;
      expect(igen).toContain('0 nya pass');
      expect(igen).not.toContain('Första passet');
    } finally { t.stopp(); }
  });

  test(T18R1.krav, async () => {
    const t = testserver({ synpunktFil: ':memory:' });
    try {
      const tom = await klient(t).get('/api/testare/pass/sammanfattning');
      expect(tom.status).toBe(200);
      expect(tom.data).toEqual({ genomforda: 0, sus: { antal: 0, medel: null } });
      const { k } = await borja(t, 'underskoterska', { matning: 'ja' });
      for (const [typ, varde] of [['langd', '165'], ['vikt', '75'], ['blodtryck', '140/90'], ['puls', '83']]) await k.post('/api/patient/sus06/matvarden', { typ, varde });
      await k.post('/api/testare/pass/matning', matningKropp('underskoterska'));
      await k.post('/api/testare/pass/sus', { svar: [4, 2, 4, 2, 4, 2, 4, 2, 4, 2] });
      const d = (await klient(t).get('/api/testare/pass/sammanfattning')).data;
      expect(d).toEqual({ genomforda: 1, sus: { antal: 1, medel: 75 } });
    } finally { t.stopp(); }
  });

  test(T18R1.gallring, async () => {
    const db = sp.oppna(':memory:');
    const nu = new Date('2026-11-19T10:00:00Z');
    const ctx = { nu, session: {}, adress: '10.0.0.2', version: '1.8.0', gransnitt: 'abc', webblasare: 'Okänd' };
    const pass = fp.passFor('patient');
    fp.skapaRad(db, { ...ctx, testroll: 'patient', pass, profil: {} });
    fp.sparaSus(db, [3, 3, 3, 3, 3, 3, 3, 3, 3, 3], { ...ctx, session: {}, testroll: 'patient', pass, profil: {} });
    expect(sp.stada(db, { nu: new Date(nu.getTime() + 364 * 86400_000) })).toMatchObject({ pass: 0, sus: 0 });
    expect(sp.stada(db, { nu: new Date(nu.getTime() + 366 * 86400_000) })).toMatchObject({ pass: 1, sus: 1 });
    // Taket per session och minut gäller nya pass.
    const session = {};
    for (let i = 0; i < fp.TAK_PASS.perMinut; i++) fp.skapaRad(db, { ...ctx, session, testroll: 'patient', pass, profil: {} });
    expect(() => fp.skapaRad(db, { ...ctx, session, testroll: 'patient', pass, profil: {} })).toThrow(/Högst/);
  });

  test(T18R1.vidare, async () => {
    const { k } = await borja(app, 'patient', { matning: 'nej' });
    expect((await k.post('/api/testare/pass/vidare')).status).toBe(409);
    await k.post('/api/testare/uppdrag/egenmatning/hoppa');
    const v = await k.post('/api/testare/pass/vidare');
    expect(v.status).toBe(200);
    expect(v.data.pass.fas).toBe('klar');
    expect(v.data.aktuellt).toBe('las');
  });
});
