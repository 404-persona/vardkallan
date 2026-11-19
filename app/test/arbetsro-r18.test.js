// Runda 18, r5: lärdomar från vårdpersonalens erfarenheter av ett annat journalsystem. Två som arbetar med samma patient
// (samtidighet.js), listor utan överflöd (mallar), listor som uppdaterar sig själva utan att väcka en vilande sandlåda,
// och svarstiderna i webbläsaren (klientsvarstider.js).
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { testserver, klient, sandlada, somPerson } from './hjalp.js';

let app;
beforeAll(() => { app = testserver(); });
afterAll(() => app.stopp());

const inloggad = async (id) => { const k = klient(app); await k.logga(id); return k; };
const aktivOrdination = async (k, pid) => (await k.get(`/api/patient/${pid}/lakemedel`)).data.ordinationer.find(o => o.status === 'aktiv' && o.lakemedel?.namn !== 'Waran' && !o.vidBehov && o.dos != null && !o.trappning && !o.spadning && !o.direktiv && !o.muntlig);

// I demon har varje webbläsare sin egen sandlåda, och en session har en inloggad person. Två personer i samma sandlåda
// prövas därför genom att den andra tar över sessionen (somPerson), och två flikar genom samtidiga anrop i samma session.
describe('Två som arbetar med samma patient', () => {
  test('den som ändrar dosen efter en annan får besked om vem som ändrade vad, och inget sparas förrän den bekräftar', async () => {
    const k = await inloggad('lak-kard');
    const s = sandlada(app, k);
    const o = await aktivOrdination(k, 'p01');
    expect(o).toBeTruthy();
    const sett = { dosering: o.dosering, lakemedelId: o.lakemedel.id, status: 'aktiv' };
    const ny = (d) => ({ lakemedelId: o.lakemedel.id, dosering: d, dos: o.dos, dosEnhet: o.dosEnhet, tider: o.tider, forvantat: sett });
    expect((await k.post(`/api/ordination/${o.id}/dosandring`, ny(`${o.dosering}, ändrad av A`))).status).toBe(200);
    somPerson(s, 'ol-kard');
    const rb = await k.post(`/api/ordination/${o.id}/dosandring`, ny(`${o.dosering}, ändrad av B`));
    expect(rb.status).toBe(409);
    expect(rb.data.kod).toBe('andrad');
    expect(rb.data.fel).toContain('Sara Lindqvist');
    expect(rb.data.fel).toContain('ändrad av A');
    expect(rb.data.fel).toContain('inte sparad');
    expect(rb.data.nu.dosering).toContain('ändrad av A');
    expect((await aktivOrdination(k, 'p01')).dosering).toContain('ändrad av A');
    // Med det nya som förväntat sparas B:s ändring.
    expect((await k.post(`/api/ordination/${o.id}/dosandring`, { ...ny(`${o.dosering}, ändrad av B`), forvantat: rb.data.nu })).status).toBe(200);
    // Utan forvantat (äldre klienter) fungerar dosändringen som förut.
    expect((await k.post(`/api/ordination/${o.id}/dosandring`, { lakemedelId: o.lakemedel.id, dosering: `${o.dosering}, tredje`, dos: o.dos, dosEnhet: o.dosEnhet, tider: o.tider })).status).toBe(200);
  });

  test('en ordination som någon annan har satt ut ger besked om vem, när och varför, och ingen kan ändra den', async () => {
    const k = await inloggad('lak-kard');
    const s = sandlada(app, k);
    const o = await aktivOrdination(k, 'p01');
    const kontroll = (await k.get(`/api/ordination/${o.id}/utsattning`)).data;
    const plan = kontroll.planer ? { typ: kontroll.planer[0].typ, aterinsattning: kontroll.planer[0].aterinsattning ?? null } : undefined;
    expect((await k.post(`/api/ordination/${o.id}/utsatt`, { orsak: 'Biverkan av A', plan, kvitteradeVarningar: (kontroll.varningar ?? []).map(v => ({ regel: v.regel })) })).status).toBe(200);
    somPerson(s, 'ul-kard');
    const rb = await k.post(`/api/ordination/${o.id}/utsatt`, { orsak: 'Utsätts av B' });
    expect(rb.status).toBe(409);
    expect(rb.data.fel).toContain('Sara Lindqvist');
    expect(rb.data.fel).toContain('Biverkan av A');
    const rd = await k.post(`/api/ordination/${o.id}/dosandring`, { lakemedelId: o.lakemedel.id, dosering: 'Ny', dos: o.dos, tider: o.tider, forvantat: { dosering: o.dosering } });
    expect(rd.status).toBe(409);
  });

  test('beskedet ges först efter behörigheten: den som inte får ordinera får samma nekande som förut', async () => {
    const k = await inloggad('lak-kard');
    const o = await aktivOrdination(k, 'p01');
    somPerson(sandlada(app, k), 'ssk-kard');
    const r = await k.post(`/api/ordination/${o.id}/dosandring`, { dosering: 'X', forvantat: { dosering: 'annan' } });
    expect(r.status).toBe(403);
    expect(JSON.stringify(r.data)).not.toContain('ändrade dosen');
  });

  test('två flikar som skriver i samma patients journal samtidigt får inga fel och inget tappas', async () => {
    const k = await inloggad('lak-kard');
    const s = sandlada(app, k);
    const pid = 'p01';
    await k.get(`/api/patient/${pid}`);
    const fore = s.db.query('SELECT count(*) AS n FROM matvarden WHERE patient_id = ?').get(pid).n;
    const svar = await Promise.all(Array.from({ length: 12 }, (_, i) => k.post(`/api/patient/${pid}/matvarden`, { typ: 'puls', varde: String(60 + i) })));
    expect(svar.filter(r => r.status >= 500)).toEqual([]);
    const ok = svar.filter(r => r.status < 300).length;
    expect(ok).toBe(12);
    expect(s.db.query('SELECT count(*) AS n FROM matvarden WHERE patient_id = ?').get(pid).n - fore).toBe(12);
  });
});
