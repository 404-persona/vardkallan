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

describe('Listor som uppdaterar sig själva', () => {
  test('en fråga i bakgrunden väcker inte en vilande sandlåda och räknas inte som aktivitet, och en vanlig fråga läser in den', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(import.meta.dir, '..', '.testtmp-r18-'));
    const v = testserver({ vilaKatalog: join(dir, 'vila'), maxIMinnet: 5, maxSandlador: 50 });
    try {
      const k = klient(v);
      await k.logga('lak-kard');
      const s = sandlada(v, k);
      const fore = s.anvand;
      const bg = { 'X-Vk-Bakgrund': '1' };
      expect((await k.get('/api/arbetslista', bg)).status).toBe(200);
      expect(s.anvand).toBe(fore);
      expect(v.vila(s)).toBeTruthy();
      expect(s.vilar).toBe(true);
      for (const vag of ['/api/arbetslista', '/api/inkorg', '/api/vantrum', '/api/avdelning/planering']) {
        const r = await k.get(vag, bg);
        expect(r.status).toBe(204);
        expect(r.headers.get('x-vk-vilar')).toBe('1');
      }
      expect(s.vilar).toBe(true);
      // Andra adresser och vanliga anrop läser in sandlådan som förut.
      expect((await k.get('/api/arbetslista')).status).toBe(200);
      expect(s.vilar).toBe(false);
    } finally { v.stopp(); rmSync(dir, { recursive: true, force: true }); }
  });

  test('samma behörighet som listan: utan inloggning ger frågan i bakgrunden 401 och ingen lista', async () => {
    const k = klient(app);
    const r = await k.get('/api/arbetslista', { 'X-Vk-Bakgrund': '1' });
    expect(r.status).toBe(401);
  });
});

describe('Listor utan överflöd', () => {
  test('de senast använda mallarna är personens egna, högst tre och bara sådana som rollen får skriva med', async () => {
    const k = await inloggad('lak-kard');
    const s = sandlada(app, k);
    for (const typ of ['Mottagningsanteckning', 'Epikris', 'Daganteckning']) {
      expect((await k.post('/api/patient/p01/anteckningar', { typ, sokord: [{ sokord: 'Aktuellt', text: 'Senast använd' }] })).status).toBe(201);
    }
    const r = (await k.get('/api/mallar/senaste')).data;
    expect(r.typer.length).toBeLessThanOrEqual(3);
    expect(r.typer).toContain('Daganteckning');
    const tillatna = (await k.get('/api/mallar')).data.map(m => m.typ);
    expect(r.typer.every(t => tillatna.includes(t))).toBe(true);
    // En annan person ser inte Saras mallar som sina senaste.
    somPerson(s, 'ssk-kard');
    const ssk = (await k.get('/api/mallar/senaste')).data;
    expect(ssk.typer).not.toContain('Epikris');
    expect(JSON.stringify(ssk)).not.toContain('p01');
  });

  test('andra vårdenheters formulär och lokala mallar finns inte i listan', async () => {
    const k = await inloggad('lak-kard');
    const s = sandlada(app, k);
    const mallar = (await k.get('/api/mallar')).data;
    const egna = new Set(mallar.map(m => m.typ));
    const formular = s.db.query("SELECT namn, definition FROM formular WHERE status = 'aktiv'").all().map(r => ({ namn: r.namn, def: JSON.parse(r.definition) }));
    const { vardenhetFor } = await import('../src/atkomst.js');
    const min = vardenhetFor(s.db, 'uso-kard');
    for (const f of formular.filter(x => x.def.enheter && !x.def.enheter.includes(min))) expect(egna.has(f.namn)).toBe(false);
    expect(mallar.filter(m => m.lokal && m.lokal.enhet && !/Kardiolog/.test(m.lokal.enhet))).toEqual([]);
  });
});

describe('Svarstider i webbläsaren', () => {
  test('mätningen räknas bara när den gäller gränssnittet som körs, och sidan Svarstider får den utan inloggning', async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { webblasarSvarstider } = await import('../src/arbetsro-rutter.js');
    const { gransnittHash, PUBLIC } = await import('../src/klientresultat.js');
    const dir = mkdtempSync(join(import.meta.dir, '..', '.testtmp-r18-'));
    try {
      const fil = join(dir, 'svarstider-klient.json');
      expect(webblasarSvarstider(fil).finns).toBe(false);
      const lage = { antal: 100, p95Aterkoppling: 40, andelAterkoppling: 1, p95Resultat: 300, andelResultat: 0.99 };
      writeFileSync(fil, JSON.stringify({ tid: '2026-11-19T12:00:00Z', webblasare: 'Chromium', gransnittHash: gransnittHash(PUBLIC), mal: { aterkopplingMs: 100 }, lagen: { vanlig: lage, strypt: lage } }));
      expect(webblasarSvarstider(fil)).toMatchObject({ finns: true, aktuell: true, lagen: { vanlig: { p95Resultat: 300 } } });
      writeFileSync(fil, JSON.stringify({ gransnittHash: 'annan', lagen: {} }));
      expect(webblasarSvarstider(fil).aktuell).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
    const r = await klient(app).get('/api/drift/webblasare');
    expect(r.status).toBe(200);
    expect(typeof r.data.finns).toBe('boolean');
  });
});
