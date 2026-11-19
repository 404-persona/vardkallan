// Runda 18, r2: sökrutan "Vad vill du göra?" och ordlistan "Jag letar efter" (handlingssok.js och handlingssok-rutter.js).
// Listan byggs på servern ur behörighetsmotorn för den inloggade och, när en patient är öppen, för den patienten. Den
// röjer aldrig något om en patient som rollen inte får se.
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { testserver, klient, sandlada } from './hjalp.js';
import TESTPNR from '../src/seed/testpersonnummer.json' with { type: 'json' };
import { KATALOG, ORDLISTA, matcha, normalisera, likhet, FORBJUDNA_NAMN } from '../src/handlingssok.js';

let app;
beforeAll(() => { app = testserver(); });
afterAll(() => app.stopp());

const inloggad = async (id) => { const k = klient(app); await k.logga(id); return k; };
const sok = async (k, q, patient) => (await k.get(`/api/handlingar/sok?${new URLSearchParams({ q, ...(patient ? { patient } : {}) })}`));
const ids = (svar) => svar.traffar.map(t => t.id);
const forsta = (svar) => svar.traffar[0]?.id;

describe('Vad vill du göra', () => {
  test('vardagliga ord, stavfel, böjningar och synonymer hittar rätt handling', () => {
    const hela = KATALOG;
    const topp = (q) => matcha(q, hela)[0]?.post.id;
    expect(topp('sjukskriv')).toBe('sjukskriv');
    expect(topp('sjukskrivning')).toBe('sjukskriv');
    expect(topp('skriv remiss')).toBe('remiss');
    expect(topp('remmis')).toBe('remiss');
    expect(topp('remisserna')).toBe('remiss');
    expect(['ge-dos', 'ge-dos-patient']).toContain(topp('ge dos'));
    expect(topp('ändra dos')).toBe('andra-dos');
    expect(topp('andra dosen')).toBe('andra-dos');
    expect(topp('läkarintyg')).toBe('intyg');
    expect(topp('lakarintyg')).toBe('intyg');
    expect(topp('boka tid')).toBe('boka');
    expect(topp('blodtrycket')).toBe('matvarde');
    expect(topp('vitalparametrar')).toBe('matvarde');
    expect(topp('ordinera')).toBe('ordinera');
    expect(topp('ordinationen')).toBe('ordinera');
    expect(topp('sätta ut läkemedel')).toBe('satt-ut');
    expect(topp('nödöppning')).toBe('nodatkomst');
    expect(topp('anteckna')).toBe('ny-anteckning');
    expect(topp('diktera')).toBe('diktera');
    // Ett ord från ett annat journalsystem eller från vardagen förklaras med Vårdkällans namn.
    const kurva = matcha('läkemedelskurvan', hela)[0];
    expect(kurva.post.id).toBe('ge-dos');
    expect(kurva.via).toContain('Läkemedel att ge');
    // Tomt, för kort eller bara utfyllnadsord ger inget.
    expect(matcha('', hela)).toEqual([]);
    expect(matcha('jag vill', hela)).toEqual([]);
    expect(matcha('x', hela)).toEqual([]);
    // Likheten tål en bokstav fel, en bokstav för mycket och å, ä och ö.
    expect(likhet(normalisera('remis')[0], 'remiss')).toBeGreaterThan(0);
    expect(likhet(normalisera('blodtryk')[0], 'blodtryck')).toBeGreaterThan(0);
    expect(likhet('katt', 'remiss')).toBe(0);
  });

  test('listan byggs på servern ur behörigheten, så att varje roll bara får det rollen får', async () => {
    const lak = await inloggad('lak-vc');
    const ssk = await inloggad('ssk-kard');
    const adm = await inloggad('adm-kard');
    const sysf = await inloggad('sysf-2');
    expect(forsta((await sok(lak, 'remiss')).data)).toBe('remiss');
    expect(ids((await sok(ssk, 'remiss')).data)).not.toContain('remiss');
    // Sjuksköterskan ger doser i Läkemedel att ge, läkaren från patientens läkemedelsflik.
    expect(forsta((await sok(ssk, 'ge dos')).data)).toBe('ge-dos');
    expect(ids((await sok(lak, 'ge dos')).data)).toContain('ge-dos-patient');
    expect(ids((await sok(lak, 'ge dos')).data)).not.toContain('ge-dos');
    // Vårdadministratören bokar, och läkaren får boka återbesök.
    expect(forsta((await sok(adm, 'boka tid')).data)).toBe('boka');
    expect(ids((await sok(adm, 'ordinera')).data)).not.toContain('ordinera');
    // Systemförvaltaren läser inte journalen och får inga handlingar i journalen.
    const sf = (await sok(sysf, 'anteckning')).data;
    expect(sf.traffar.every(t => !t.kraverPatient)).toBe(true);
    expect(forsta((await sok(sysf, 'regler')).data)).toBe('regler');
    // Utan fråga visas det vanligaste för rollen.
    const vanligt = (await sok(ssk, '')).data;
    expect(vanligt.vanliga).toBe(true);
    expect(ids(vanligt)).toEqual(expect.arrayContaining(['ge-dos', 'matvarde']));
    expect(ids(vanligt)).not.toContain('remiss');
  });

  test('en handling som rollen saknar säger vilken roll som gör den, utan patientuppgifter', async () => {
    const ssk = await inloggad('ssk-kard');
    const s = sandlada(app, ssk);
    await ssk.get('/api/patient/p01');
    const svar = (await sok(ssk, 'sjukskriv', 'p01')).data;
    expect(ids(svar)).not.toContain('sjukskriv');
    const saknas = svar.saknas.find(x => x.id === 'sjukskriv');
    expect(saknas.text).toContain('läkare');
    expect(saknas.text).toContain('sjuksköterska');
    // Inget om patienten: varken id, namn eller personnummer.
    const p = s.db.query('SELECT * FROM patienter WHERE id = ?').get('p01');
    for (const x of ['p01', p.fornamn, p.efternamn, p.personnummer]) expect(JSON.stringify(svar.saknas)).not.toContain(x);
    // Vårdadministratören får veta att en läkare ordinerar.
    const adm = await inloggad('adm-kard');
    const ord = (await sok(adm, 'ordinera')).data.saknas.find(x => x.id === 'ordinera');
    expect(ord.text).toContain('läkare');
  });

  test('med en öppen patient pekar handlingen på patientens flik, och en patient som inte är öppnad eller inte får ses ger samma svar som ingen patient', async () => {
    const lak = await inloggad('lak-vc');
    const utan = (await sok(lak, 'remiss')).data;
    const remiss = utan.traffar.find(t => t.id === 'remiss');
    expect(remiss.href).toBeNull();
    expect(remiss.kraverPatient).toBe(true);
    expect(remiss.mal).toEqual({ flik: 'remisser', sub: 'ny' });
    expect(utan.patient).toBe(false);
    // Inte öppnad i sessionen: samma svar som utan patient, också för en patient som inte finns.
    expect((await sok(lak, 'remiss', 'p01')).data).toEqual(utan);
    expect((await sok(lak, 'remiss', 'finns-inte')).data).toEqual(utan);
    // Öppnad patient med vårdrelation på vårdcentralen (Mikael Svensson): länken går till patientens remissformulär.
    expect((await lak.get('/api/patient/p14')).status).toBe(200);
    const med = (await sok(lak, 'remiss', 'p14')).data;
    expect(med.patient).toBe(true);
    expect(med.traffar.find(t => t.id === 'remiss').href).toBe('#/patient/p14/remisser/ny');
    // En patient som läkaren inte får se (ingen vårdrelation) ger samma svar som utan patient, också om id:t har
    // skickats in som öppnat i sessionen.
    const s = sandlada(app, lak);
    const ny = 'p-r18r2-utan';
    const anvanda = new Set(s.db.query('SELECT personnummer FROM patienter').all().map(r => r.personnummer));
    const pnr = TESTPNR.find(x => x.startsWith('19') && !anvanda.has(x));
    s.db.query("INSERT INTO patienter (id, personnummer, fornamn, efternamn, fodd, kon) VALUES (?, ?, 'Tolvan', 'Tolvansson', '1950-01-01', 'man')").run(ny, pnr);
    s.oppnade.add(ny);
    const nekad = (await sok(lak, 'remiss', ny)).data;
    expect(nekad).toEqual(utan);
    expect(JSON.stringify(nekad)).not.toContain('Tolvan');
    expect(JSON.stringify(nekad)).not.toContain(ny);
  });

  test('skyddad identitet: svaret innehåller aldrig namn eller personnummer, bara det id som anroparen skickade', async () => {
    const lak = await inloggad('lak-kard');
    const s = sandlada(app, lak);
    for (const pid of ['p01', 'p03']) {
      await lak.get(`/api/patient/${pid}`);
      const p = s.db.query('SELECT * FROM patienter WHERE id = ?').get(pid);
      for (const q of ['anteckning', 'läkemedel', 'mätvärde', 'logglista', 'ordinera', '']) {
        const t = JSON.stringify((await sok(lak, q, pid)).data);
        for (const x of [p.fornamn, p.efternamn, p.personnummer, p.personnummer.slice(0, 8)]) expect(t).not.toContain(x);
      }
    }
  });

  test('ett nummer eller ett namn som inte är en handling föreslår sökning av patient, och i en öppen journal sökning i journalen', async () => {
    const lak = await inloggad('lak-vc');
    const nr = (await sok(lak, '19121212-1212')).data;
    expect(forsta(nr)).toBe('sok-patient-fraga');
    expect(nr.traffar[0].href).toBe(`#/sok?q=${encodeURIComponent('19121212-1212')}`);
    await lak.get('/api/patient/p14');
    const ord = (await sok(lak, 'waran', 'p14')).data;
    expect(ids(ord)).toEqual(expect.arrayContaining(['sok-patient-fraga', 'sok-journal-fraga']));
    expect(ord.traffar.find(t => t.id === 'sok-journal-fraga').href).toBe('#/patient/p14/sok?q=waran');
    // Utan träff säger svaret vad användaren kan göra.
    expect(ord.inget ?? '').toBe('');
    const sysf = await inloggad('sysf-2');
    const inget = (await sok(sysf, 'zzqqxx')).data;
    expect(inget.traffar).toEqual([]);
    expect(inget.inget).toContain('Jag letar efter');
  });

  test('undersköterskan utan giltig delegering får veta att det krävs en delegering, och studenten utan handledning att den saknas', async () => {
    const usk = await inloggad('usk-kard');
    const s = sandlada(app, usk);
    // Alla undersköterskans delegeringar återkallas, så att testet inte beror på seedens datum.
    s.db.query("UPDATE delegeringar SET aterkallad_tid = '2026-01-01T00:00:00Z', aterkallad_av = 'ssk-kard', aterkallad_orsak = 'Test' WHERE personal_id = 'usk-kard' AND aterkallad_tid IS NULL").run();
    expect((await usk.get('/api/session')).data.behorigheter).not.toContain('ge_lakemedel');
    const efter = (await sok(usk, 'ge dos')).data;
    expect(ids(efter)).not.toContain('ge-dos');
    expect(efter.saknas.find(x => x.id === 'ge-dos').text).toContain('delegering');
    // Studenten utan pågående handledning har bara övningarna, och sökningen säger varför.
    const st = await inloggad('ssk-kard');
    const ss = sandlada(app, st);
    const student = ss.db.query("SELECT id FROM personal WHERE yrke = 'sjukskoterskestudent' LIMIT 1").get();
    if (student) {
      ss.personalId = student.id;
      const sv = (await sok(st, 'mätvärde')).data;
      const sessS = (await st.get('/api/session')).data;
      if (sessS.handledning?.student && !sessS.handledning.pagar) {
        expect(ids(sv)).not.toContain('matvarde');
        expect(sv.saknas.find(x => x.id === 'matvarde').text).toContain('handledning');
      }
    }
  });

  test('sökningen kräver personalens inloggning, loggar inget och tar bara en fråga av rimlig längd', async () => {
    const ute = klient(app);
    expect((await sok(ute, 'remiss')).status).toBe(401);
    const lak = await inloggad('lak-vc');
    const s = sandlada(app, lak);
    await lak.get('/api/patient/p14');
    const fore = s.db.query('SELECT count(*) AS n FROM atkomstlogg').get().n;
    await sok(lak, 'remiss', 'p14');
    await sok(lak, 'ordinera', 'p14');
    expect(s.db.query('SELECT count(*) AS n FROM atkomstlogg').get().n).toBe(fore);
    expect((await sok(lak, 'a'.repeat(200))).status).toBe(400);
    expect((await lak.get('/api/handlingar/sok?q=remiss&patient=' + 'x'.repeat(200))).status).toBe(400);
  });

  test('Jag letar efter: ordlistan kopplar ord från andra system och vardagen till Vårdkällans namn och vy, neutralt och utan namn på andra system', async () => {
    const katalog = new Set(KATALOG.map(k => k.id));
    expect(ORDLISTA.length).toBeGreaterThanOrEqual(30);
    for (const o of ORDLISTA) {
      expect(katalog.has(o.handling)).toBe(true);
      expect(o.ord.length).toBeGreaterThan(0);
      const text = [...o.ord, o.heter, o.forklaring].join(' ');
      for (const n of FORBJUDNA_NAMN) expect(text).not.toMatch(new RegExp(`(^|[^a-zåäö0-9])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-zåäö0-9])`, 'i'));
      // Neutralt: ingen jämförelse i sak.
      expect(text).not.toMatch(/\b(bättre|sämre|enklare än|till skillnad från)\b/i);
    }
    // Utan inloggning: listan utan länkar. Inloggad: länkar bara för det rollen får.
    const ute = (await klient(app).get('/api/handlingar/ordlista')).data;
    expect(ute.poster.length).toBe(ORDLISTA.length);
    expect(ute.poster.every(p => p.href == null)).toBe(true);
    const ssk = await inloggad('ssk-kard');
    const lista = (await ssk.get('/api/handlingar/ordlista')).data;
    expect(lista.poster.find(p => p.handling === 'ge-dos').href).toBe('#/administrering');
    expect(lista.poster.find(p => p.handling === 'remiss').href).toBeNull();
  });

  test('texterna är svenska utan tankstreck och ellipser, och varje handling pekar på en vy eller flik som finns i gränssnittet', () => {
    const rot = join(import.meta.dir, '..');
    const appJs = readFileSync(join(rot, 'public', 'js', 'app.js'), 'utf8');
    const patientJs = readFileSync(join(rot, 'public', 'js', 'vyer', 'patient.js'), 'utf8');
    for (const k of KATALOG) {
      const t = [k.namn, k.vy, k.beskrivning ?? '', ...(k.ord ?? [])].join(' ');
      expect(t).not.toMatch(/[—–…]/);
      if (k.href) {
        const vag = k.href.split('?')[0].replace(/^#\//, '');
        expect(appJs.includes(`#\\/${vag.replace(/\//g, '\\/')}$`) || appJs.includes(`#\\/${vag.replace(/\//g, '\\/')}(`) || appJs.includes(`['#/${vag}'`)).toBe(true);
      }
      if (k.mal) expect(k.mal.flik === 'oversikt' || patientJs.includes(`['${k.mal.flik}',`)).toBe(true);
    }
    for (const o of ORDLISTA) expect([...o.ord, o.heter, o.forklaring].join(' ')).not.toMatch(/[—–…]/);
    expect(existsSync(join(rot, 'public', 'js', 'vyer', 'ordlista.js'))).toBe(true);
  });
});
