// Runda 15, r4, andra delen (beslut 2026-11-14): fler varianter som systemet väljer ur kontakten och patientens
// uppgifter, och inmatning i anteckningsrutan som aktivitet för utloggningen (K2 1.6.1). Testnamnen står i
// src/sussa/runda15-r4.js.
import { describe, test, expect, beforeAll, afterAll, afterEach } from 'bun:test';
import { testserver, klient, sandlada, nyDb } from './hjalp.js';
import { stallKlockan, aterstallKlockan } from './falsk-klocka.js';
import * as varianter from '../src/mallvarianter.js';
import { SOKORD } from '../src/fackssprak.js';
import { aktivitetsSignal } from '../public/js/aktivitet-regler.js';

let app;
beforeAll(() => { app = testserver(); });
afterAll(() => app.stopp());
afterEach(() => aterstallKlockan());

const inloggad = async (roll) => { const k = klient(app); await k.logga(roll); return k; };
const mall = (k, pid, typ) => k.get(`/api/patient/${pid}/anteckningsmall?typ=${encodeURIComponent(typ)}`);
const p = (d, id) => d.query('SELECT * FROM personal WHERE id = ?').get(id);
const ids = (l) => l.map(v => v.id);

describe('Anteckningsvyn: fler varianter', () => {
  test('systemet väljer variant ur kontakten och patientens uppgifter: digital kontakt, barn, äldre med många läkemedel, palliativ vård och graviditet', () => {
    const d = nyDb();
    const vc = p(d, 'lak-vc');
    expect(ids(varianter.valjVarianter(d, vc, 'Mottagningsanteckning', { kontakt: { vardkontakt: { kontaktsatt: 'video', orsak: 'Videobesök' } } }))).toEqual(['digital']);
    const barn = varianter.valjVarianter(d, vc, 'Mottagningsanteckning', { patient: { alder: 4 } });
    expect(barn).toEqual([expect.objectContaining({ id: 'barn', varfor: expect.stringContaining('4 år') })]);
    const aldre = varianter.valjVarianter(d, vc, 'Mottagningsanteckning', { patient: { alder: 81, lakemedel: 6 } });
    expect(aldre).toEqual([expect.objectContaining({ id: 'aldre', varfor: expect.stringMatching(/81 år och har 6 läkemedel/) })]);
    expect(varianter.valjVarianter(d, vc, 'Mottagningsanteckning', { patient: { alder: 81, lakemedel: 4 } })).toEqual([]);
    expect(varianter.valjVarianter(d, vc, 'Mottagningsanteckning', { patient: { alder: 70, lakemedel: 9 } })).toEqual([]);
    expect(ids(varianter.valjVarianter(d, p(d, 'lak-kard'), 'Daganteckning', { diagnoser: [{ kod: 'Z51.5', text: 'Palliativ vård' }] }))).toEqual(['palliativ']);
    expect(ids(varianter.valjVarianter(d, p(d, 'lak-kard'), 'Daganteckning', { kontakt: { vardkontakt: { orsak: 'Brytpunktssamtal inför palliativ vård' } } }))).toEqual(['palliativ']);
    expect(ids(varianter.valjVarianter(d, vc, 'Mottagningsanteckning', { patient: { graviditet: true } }))).toEqual(['graviditet']);
    // Digital kontakt gäller bara mottagningsanteckningen, och varje variant har två till fyra undersökord.
    expect(varianter.valjVarianter(d, p(d, 'lak-kard'), 'Daganteckning', { kontakt: { vardkontakt: { kontaktsatt: 'video' } } })).toEqual([]);
    for (const v of Object.values(varianter.VARIANTER)) if (['digital', 'barn', 'aldre', 'palliativ', 'graviditet'].includes(v.id)) expect([v.id, v.sokord.length >= 2 && v.sokord.length <= 4]).toEqual([v.id, true]);
    for (const sk of varianter.VARIANTSOKORD) expect([sk, Boolean(SOKORD[sk]?.code || SOKORD[sk]?.ingen)]).toEqual([sk, true]);
  });

  test('för ett barn visar underlaget tillväxten och vaccinationerna ur systemet, bara det som syns', async () => {
    const k = await inloggad('lak-vc');
    const r = (await mall(k, 'p61', 'Mottagningsanteckning')).data;
    expect(ids(r.valdaVarianter)).toContain('barn');
    expect(r.underlag.tillvaxt.length).toBeGreaterThan(0);
    expect(r.underlag.tillvaxt.every(t => ['langd', 'vikt', 'huvudomfang'].includes(t.typ))).toBe(true);
    expect(r.underlag.vaccinationer.length).toBeGreaterThan(0);
    const v = structuredClone(r.underlag.vaccinationer[0]);
    expect(r.underlag.vaccinationer[0]).toMatchObject({ ref: { typ: 'vaccination' }, text: expect.stringMatching(/\d{1,2} \S+ \d{4}$/) });
    // En vaccination förs in som referens, som andra värden ur underlaget.
    const ny = await k.post('/api/patient/p61/anteckningar', { typ: 'Mottagningsanteckning', sokord: [{ sokord: 'Vaccinationer', text: v.text, referenser: [{ ...v.ref, text: v.text }] }] });
    expect(ny.status, JSON.stringify(ny.data)).toBe(201);
    expect(JSON.parse(sandlada(app, k).db.query('SELECT sokord FROM anteckningar WHERE id = ?').get(ny.data.id).sokord)[0].referenser).toEqual([{ ...v.ref, text: v.text }]);
    // En vuxen får varken tillväxt eller vaccinationer i underlaget.
    const vuxen = (await mall(k, 'p06', 'Mottagningsanteckning')).data;
    expect(vuxen.underlag.tillvaxt).toEqual([]);
    expect(vuxen.underlag.vaccinationer).toEqual([]);
  });

  test('äldre med många läkemedel räknas ur läkemedelslistan som syns, och en spärrad vårdenhets läkemedel räknas inte', async () => {
    const k = await inloggad('lak-kard');
    const d = sandlada(app, k).db;
    const lm = d.query("SELECT id FROM katalog WHERE atc = 'A02BC01' LIMIT 1").get() ?? d.query('SELECT id FROM katalog LIMIT 1').get();
    const forre = (await mall(k, 'p01', 'Daganteckning')).data;
    expect(ids(forre.valdaVarianter)).not.toContain('aldre');
    // Ett femte läkemedel på en spärrad vårdenhet räknas inte.
    d.query("INSERT INTO ordinationer (patient_id, enhet_id, lakemedel_id, dosering, typ, orsak, uppfoljning, start, ordinerad_av, skapad) VALUES ('p01', 'vc-tybble', ?, '1 tablett', 'staende', 'Prov', '2027-01-01', '2026-01-01', 'lak-vc', '2026-01-01T08:00:00Z')").run(lm.id);
    d.query('INSERT INTO sparrar (patient_id, enhet_id, registrerad, aktiv) VALUES (?, ?, ?, 1)').run('p01', 'vc-tybble', new Date().toISOString());
    expect(ids((await mall(k, 'p01', 'Daganteckning')).data.valdaVarianter)).not.toContain('aldre');
    // På den egna vårdenheten räknas det.
    d.query("INSERT INTO ordinationer (patient_id, enhet_id, lakemedel_id, dosering, typ, orsak, uppfoljning, start, ordinerad_av, skapad) VALUES ('p01', 'uso-kard-72', ?, '1 tablett', 'staende', 'Prov', '2027-01-01', '2026-01-01', 'lak-kard', '2026-01-01T08:00:00Z')").run(lm.id);
    const efter = (await mall(k, 'p01', 'Daganteckning')).data.valdaVarianter.find(v => v.id === 'aldre');
    expect(efter.varfor).toMatch(/har 5 läkemedel/);
  });
});

describe('Anteckningsvyn: aktivitet och utloggning', () => {
  test('aktivitetssignalen skickas högst en gång i minuten', () => {
    let t = 0;
    const s = aktivitetsSignal({ nu: () => t });
    expect(s()).toBe(true);
    t = 30_000; expect(s()).toBe(false);
    t = 59_999; expect(s()).toBe(false);
    t = 60_000; expect(s()).toBe(true);
    t = 61_000; expect(s()).toBe(false);
  });

  test('sparande i bakgrunden utan inmatning förlänger inte inloggningen: efter tiden utan aktivitet loggas den ut med texten sparad', async () => {
    const t0 = Date.parse('2026-11-12T09:00:00Z');
    stallKlockan(new Date(t0));
    const k = await inloggad('lak-kard');
    const bak = { 'X-Vk-Bakgrund': '1', 'Content-Type': 'application/json' };
    const r1 = await k.raw('PUT', '/api/patient/p01/anteckningsutkast', { typ: 'Daganteckning', sokord: [{ sokord: 'Aktuellt', text: 'Första' }] }, bak);
    expect(r1.status).toBe(200);
    stallKlockan(new Date(t0 + 20 * 60_000));
    expect((await k.raw('PUT', '/api/patient/p01/anteckningsutkast', { anteckningId: r1.data.id, typ: 'Daganteckning', sokord: [{ sokord: 'Aktuellt', text: 'Andra versionen' }] }, bak)).status).toBe(200);
    stallKlockan(new Date(t0 + 31 * 60_000));
    expect((await k.raw('GET', '/api/inkorg', undefined, { 'X-Vk-Bakgrund': '1' })).status).toBe(401);
    await k.logga('lak-kard');
    const a = sandlada(app, k).db.query('SELECT status, sokord FROM anteckningar WHERE id = ?').get(r1.data.id);
    expect(a.status).toBe('utkast');
    expect(JSON.parse(a.sokord)[0].text).toBe('Andra versionen');
  });

  test('inmatning i rutan räknas som aktivitet: en signal i minuten håller inloggningen vid liv medan användaren skriver', async () => {
    const t0 = Date.parse('2026-11-12T09:00:00Z');
    stallKlockan(new Date(t0));
    const k = await inloggad('lak-kard');
    const signal = aktivitetsSignal({ nu: () => Date.now() });
    // Användaren skriver i 40 minuter. Varje inmatning provar signalen, och bara en i minuten skickas.
    let skickade = 0;
    for (let min = 0; min <= 40; min += 0.5) {
      stallKlockan(new Date(t0 + min * 60_000));
      if (signal()) { skickade++; expect((await k.post('/api/session/forlang', {})).status).toBe(200); }
    }
    expect(skickade).toBe(41);
    stallKlockan(new Date(t0 + 41 * 60_000));
    expect((await k.get('/api/inkorg')).status).toBe(200);
  });
});
