// Runda 15, r4: anteckningsvyn med underlag, referenser, utkast som sparas av sig självt, varianter, läs- och
// skrivordning och egna fraser (granskningen av mallarna, F1, F2, F5 och F9). Testnamnen står i
// src/sussa/runda15-r4.js.
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { createCipheriv, randomBytes, randomUUID } from 'node:crypto';
import { testserver, klient, sandlada, nyDb, atk, somPerson } from './hjalp.js';
import * as underlag from '../src/anteckningsunderlag.js';
import * as varianter from '../src/mallvarianter.js';
import * as fraser from '../src/egna-fraser.js';
import { foreslagnaSokord } from '../src/mallforslag.js';
import { klassa } from '../src/lagring.js';

let app;
beforeAll(() => { app = testserver(); });
afterAll(() => app.stopp());

const inloggad = async (roll) => { const k = klient(app); await k.logga(roll); return k; };
const db = (k) => sandlada(app, k).db;
const mall = (k, pid, typ, extra = '') => k.get(`/api/patient/${pid}/anteckningsmall?typ=${encodeURIComponent(typ)}${extra}`);
const iso = (ms) => new Date(ms).toISOString();
function nyttMatvarde(d, { pid = 'p01', enhet = 'uso-kard-72', typ = 'blodtryck', varde = '150/95', num = null, tid = iso(Date.now() - 60_000), av = 'ssk-kard' } = {}) {
  return Number(d.query("INSERT INTO matvarden (patient_id, enhet_id, typ, varde, varde_num, matt_enhet, tid, registrerad_av) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id")
    .get(pid, enhet, typ, varde, num, typ === 'blodtryck' ? 'mmHg' : 'slag/min', tid, av).id);
}
const sparr = (d, pid, enhet) => d.query('INSERT INTO sparrar (patient_id, enhet_id, registrerad, aktiv) VALUES (?, ?, ?, 1)').run(pid, enhet, new Date().toISOString());

describe('Anteckningsvyn: underlaget', () => {
  test('underlaget för en daganteckning har mätvärden sedan förra daganteckningen med pil, läkemedel under vårdtillfället och diagnoserna', async () => {
    const k = await inloggad('lak-kard');
    const r = await mall(k, 'p01', 'Daganteckning');
    expect(r.status).toBe(200);
    const u = r.data.underlag;
    expect(u.sedanText).toMatch(/^Sedan förra daganteckningen /);
    const bt = u.matvarden.find(m => m.typ === 'blodtryck');
    expect(bt.text).toMatch(/^Blodtryck 126\/76 mmHg \(\d{1,2} \S+ \d{2}\.\d{2}\)$/);
    expect(bt.pil).toBe('ned');
    expect(bt.pilText).toMatch(/^lägre än förra värdet 128\/78 \(/);
    expect(u.matvarden.find(m => m.typ === 'smarta').text).toMatch(/^Smärta 0 av 10 \(NRS\), ingen smärta \(/);
    expect(u.provsvar.map(p => p.typ)).toContain('inr');
    // Metoprolol sattes ut och in igen med en ny dos, och visas som en ändring.
    expect(u.lakemedel.map(l => l.text)).toEqual(expect.arrayContaining([expect.stringMatching(/^Metoprolol Sandoz .*ändrad .* från 1 tablett på morgonen till 2 tabletter på morgonen$/)]));
    expect(u.lakemedel.some(l => /^Metoprolol Sandoz .*utsatt/.test(l.text))).toBe(false);
    expect(u.diagnoser.map(d => d.text)).toContain('Persisterande förmaksflimmer (I48.1)');
    expect(u.kontakt.text).toBe('Förmaksflimmer med snabb kammarfrekvens och hjärtsvikt');
    // Daganteckningen har inget sökord Kontaktorsak, men underlaget visar kontaktorsaken att föra in.
    expect(r.data.mall.sokord).toEqual(['Aktuellt', 'Status', 'Bedömning', 'Åtgärd']);
  });

  test('underlaget räknas bara på det som syns: en annan vårdenhets diagnos kräver aktivt val, och en spärrad vårdenhet ändrar inte svaret', async () => {
    const k = await inloggad('lak-kard');
    const utan = (await mall(k, 'p01', 'Daganteckning')).data;
    expect(JSON.stringify(utan)).not.toContain('I10.9');
    expect(JSON.stringify(utan)).not.toContain('Tybble');
    await k.post('/api/patient/p01/val', { typ: 'andra_enheter', syfte: 'Vården av patienten' });
    const med = (await mall(k, 'p01', 'Daganteckning')).data;
    expect(med.underlag.diagnoser.map(d => d.text)).toContain('Essentiell hypertoni (högt blodtryck utan känd orsak) (I10.9)');
    // Ett nyare blodtryck på en spärrad vårdenhet syns inte, ändrar inte pilen och svaret är detsamma som utan raden.
    const k2 = await inloggad('lak-kard');
    await k2.post('/api/patient/p01/val', { typ: 'andra_enheter', syfte: 'Vården av patienten' });
    for (const x of [k, k2]) sparr(db(x), 'p01', 'vc-tybble');
    nyttMatvarde(db(k), { enhet: 'vc-tybble', varde: '180/110' });
    const a = (await mall(k, 'p01', 'Daganteckning')).data;
    const b = (await mall(k2, 'p01', 'Daganteckning')).data;
    expect(JSON.stringify(a.underlag)).toBe(JSON.stringify(b.underlag));
    expect(JSON.stringify(a)).not.toContain('180/110');
    // Utan spärr och med aktivt val syns det nyare värdet, och pilen pekar uppåt.
    const k3 = await inloggad('lak-kard');
    await k3.post('/api/patient/p01/val', { typ: 'andra_enheter', syfte: 'Vården av patienten' });
    nyttMatvarde(db(k3), { enhet: 'vc-tybble', varde: '180/110' });
    const c = (await mall(k3, 'p01', 'Daganteckning')).data;
    expect(c.underlag.matvarden.find(m => m.typ === 'blodtryck')).toMatchObject({ pil: 'upp' });
    expect(c.underlag.matvarden.find(m => m.typ === 'blodtryck').text).toContain('180/110');
  });

  test('en ändrad dos räknas bara på ordinationer som syns: med spärr på den förra ordinationens vårdenhet blir det en insättning', async () => {
    const k = await inloggad('lak-kard');
    sparr(db(k), 'p01', 'uso-med');
    const u = (await mall(k, 'p01', 'Daganteckning')).data.underlag;
    expect(u.lakemedel.find(l => l.text.startsWith('Metoprolol')).text).toMatch(/insatt .*: 2 tabletter på morgonen$/);
    expect(JSON.stringify(u)).not.toMatch(/Metoprolol[^"]*från 1 tablett/);
    expect(JSON.stringify(u)).not.toContain('Waran');
  });

  test('på akuten fyller systemet i kontaktorsaken och prioriteten ur triagen med källa, och skyddad identitet röjs inte', async () => {
    const k = await inloggad('lak-akut');
    const r = await mall(k, 'p03', 'Akutanteckning');
    expect(r.status).toBe(200);
    expect(r.data.underlag.forifyllt.Kontaktorsak).toMatchObject({ text: 'Buksmärta', kalla: expect.stringMatching(/^Ur vårdkontakten /) });
    expect(r.data.underlag.forifyllt.Prioritet).toMatchObject({ text: expect.stringMatching(/^Gul enligt triagen /), kalla: 'Ur triagen på akutmottagningen' });
    const p = db(k).query("SELECT * FROM patienter WHERE id = 'p03'").get();
    const j = JSON.stringify(r.data);
    for (const x of [p.fornamn, p.efternamn, p.personnummer, p.adress].filter(Boolean)) expect(j).not.toContain(x);
  });

  test('fel roll: vårdadministratören får inte mallen eller underlaget, och en okänd mall ger 404', async () => {
    const adm = await inloggad('adm-kard');
    expect((await mall(adm, 'p01', 'Daganteckning')).status).toBe(403);
    const ssk = await inloggad('ssk-kard');
    expect((await mall(ssk, 'p01', 'Daganteckning')).status).toBe(403);
    expect((await mall(ssk, 'p01', 'Omvårdnadsanteckning')).status).toBe(200);
    const lak = await inloggad('lak-kard');
    expect((await mall(lak, 'p01', 'Finns inte')).status).toBe(404);
    // Åtkomsten till underlaget loggas på patienten.
    expect(db(ssk).query("SELECT count(*) AS n FROM atkomstlogg WHERE personal_id = 'ssk-kard' AND patient_id = 'p01' AND resurs LIKE '%anteckningsmall%'").get().n).toBeGreaterThan(0);
  });
});

describe('Anteckningsvyn: referenser', () => {
  test('ett värde ur underlaget sparas som referens med datum och källa, och en referens som inte håller sparas som vanlig text', async () => {
    const k = await inloggad('lak-kard');
    const d = db(k);
    const u = (await mall(k, 'p01', 'Daganteckning')).data.underlag;
    const bt = u.matvarden.find(m => m.typ === 'blodtryck');
    const lm = u.lakemedel[0];
    const annan = nyttMatvarde(d, { pid: 'p02', enhet: 'uso-kard-72' });
    const sparrad = nyttMatvarde(d, { enhet: 'vc-tybble', varde: '170/100' });
    const sokord = [
      { sokord: 'Aktuellt', text: `Pigg. ${bt.text}.`, referenser: [{ ...bt.ref, text: bt.text }, { typ: 'matvarde', id: annan, text: 'Blodtryck 150/95 mmHg' }, { typ: 'matvarde', id: sparrad, text: 'x' }] },
      { sokord: 'Bedömning', text: `Stabil. ${lm.text}.`, referenser: [{ ...lm.ref, text: lm.text }, { ...bt.ref, text: bt.text }] },
      { sokord: 'Åtgärd', text: 'Fortsatt plan.', referenser: [{ ...bt.ref, text: 'Blodtryck 999/1 mmHg' }] },
    ];
    const ny = await k.post('/api/patient/p01/anteckningar', { typ: 'Daganteckning', sokord });
    expect(ny.status).toBe(201);
    const rad = d.query('SELECT sokord FROM anteckningar WHERE id = ?').get(ny.data.id);
    const sparat = JSON.parse(rad.sokord);
    expect(sparat[0].referenser).toEqual([{ typ: 'matvarde', id: bt.ref.id, text: bt.text }]);
    // Referensen till blodtrycket i Bedömning stryks, eftersom texten inte står där.
    expect(sparat[1].referenser).toEqual([{ typ: lm.ref.typ, id: lm.ref.id, text: lm.text }]);
    expect(sparat[2].referenser).toBeUndefined();
    await k.post(`/api/anteckning/${ny.data.id}/signera`, {});
    // Läsaren får texten och källan men inte id:t.
    const las = (await k.get(`/api/anteckning/${ny.data.id}`)).data;
    expect(las.sokord[0].referenser).toEqual([{ text: bt.text, kalla: 'Ur mätvärdena' }]);
    // FHIR har referensen till Observation för den som får se mätvärdet.
    const f = (await k.get(`/fhir/Composition/${ny.data.id}`)).data;
    expect(f.section.find(s => s.title === 'Aktuellt').entry).toEqual([{ reference: `Observation/${bt.ref.id}`, display: bt.text }]);
    // Utan rätt att läsa mätvärden lämnas ingen referens ut.
    const s = JSON.parse(d.query('SELECT sokord FROM anteckningar WHERE id = ?').get(ny.data.id).sokord);
    expect(underlag.fhirEntries(atk(d, 'adm-kard', 'p01'), s[0])).toEqual([]);
    expect(underlag.fhirEntries(atk(d, 'lak-kard', 'p01'), s[0])).toHaveLength(1);
  });

  test('en rättelse behåller referensen när texten står kvar', async () => {
    const k = await inloggad('lak-kard');
    const u = (await mall(k, 'p01', 'Daganteckning')).data.underlag;
    const bt = u.matvarden.find(m => m.typ === 'blodtryck');
    const ny = await k.post('/api/patient/p01/anteckningar', { typ: 'Daganteckning', sokord: [{ sokord: 'Aktuellt', text: `Pigg. ${bt.text}.`, referenser: [{ ...bt.ref, text: bt.text }] }] });
    await k.post(`/api/anteckning/${ny.data.id}/signera`, {});
    const r = await k.post(`/api/anteckning/${ny.data.id}/ratta`, { orsak: 'Stavfel', sokord: [{ sokord: 'Aktuellt', text: `Pigg och glad. ${bt.text}.` }] });
    expect(r.status).toBe(201);
    expect(JSON.parse(db(k).query('SELECT sokord FROM anteckningar WHERE id = ?').get(r.data.id).sokord)[0].referenser).toEqual([{ typ: 'matvarde', id: bt.ref.id, text: bt.text }]);
  });
});

describe('Anteckningsvyn: utkast', () => {
  test('utkastet sparas av sig självt på patienten och vårdkontakten, ändras med samma id och syns bara för den som skriver', async () => {
    const k = await inloggad('lak-kard');
    const d = db(k);
    const utkastFore = d.query("SELECT count(*) AS n FROM anteckningar WHERE patient_id = 'p01' AND status = 'utkast' AND forfattare_id = 'lak-kard'").get().n;
    const tom = await k.put('/api/patient/p01/anteckningsutkast', { typ: 'Daganteckning', sokord: [{ sokord: 'Aktuellt', text: '  ' }] });
    expect(tom.data).toEqual({ tomt: true });
    const r = await k.put('/api/patient/p01/anteckningsutkast', { typ: 'Daganteckning', sokord: [{ sokord: 'Aktuellt', text: 'Pigg' }] });
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ status: 'utkast', typ: 'Daganteckning' });
    const rad = d.query('SELECT * FROM anteckningar WHERE id = ?').get(r.data.id);
    expect(rad).toMatchObject({ patient_id: 'p01', forfattare_id: 'lak-kard', status: 'utkast' });
    expect(rad.vardkontakt_id).not.toBeNull();
    const r2 = await k.put('/api/patient/p01/anteckningsutkast', { anteckningId: r.data.id, typ: 'Daganteckning', sokord: [{ sokord: 'Aktuellt', text: 'Pigg, äter bra' }, { sokord: 'Bedömning', text: '' }] });
    expect(r2.data.id).toBe(r.data.id);
    expect(JSON.parse(d.query('SELECT sokord FROM anteckningar WHERE id = ?').get(r.data.id).sokord)[0].text).toBe('Pigg, äter bra');
    expect(d.query("SELECT count(*) AS n FROM anteckningar WHERE patient_id = 'p01' AND status = 'utkast' AND forfattare_id = 'lak-kard'").get().n).toBe(utkastFore + 1);
    // Mallen för patienten säger att utkastet finns, så att vyn kan fortsätta i det.
    expect((await mall(k, 'p01', 'Daganteckning')).data.utkast.map(u => u.id)).toContain(r.data.id);
    // En annan läkare i samma sandlåda ser inte utkastet och kan inte ändra det.
    somPerson(sandlada(app, k), 'ol-kard');
    const lista = await k.get('/api/patient/p01/anteckningar');
    expect(lista.data.anteckningar.map(a => a.id)).not.toContain(r.data.id);
    expect((await k.put('/api/patient/p01/anteckningsutkast', { anteckningId: r.data.id, typ: 'Daganteckning', sokord: [{ sokord: 'Aktuellt', text: 'x' }] })).status).toBe(404);
    somPerson(sandlada(app, k), 'lak-kard');
  });

  test('ett utkast som tillhör någon annan eller redan är signerat ändras inte, och fel roll får inte spara', async () => {
    const k = await inloggad('lak-kard');
    const fore = db(k).query("SELECT count(*) AS n FROM anteckningar WHERE patient_id = 'p01' AND status = 'utkast' AND forfattare_id = 'lak-kard'").get().n;
    const r = await k.put('/api/patient/p01/anteckningsutkast', { typ: 'Daganteckning', sokord: [{ sokord: 'Aktuellt', text: 'Pigg' }] });
    // Samma id för en annan patient finns inte.
    expect((await k.put('/api/patient/p02/anteckningsutkast', { anteckningId: r.data.id, typ: 'Daganteckning', sokord: [{ sokord: 'Aktuellt', text: 'x' }] })).status).toBe(404);
    await k.post(`/api/anteckning/${r.data.id}/signera`, {});
    const sign = await k.put('/api/patient/p01/anteckningsutkast', { anteckningId: r.data.id, typ: 'Daganteckning', sokord: [{ sokord: 'Aktuellt', text: 'x' }] });
    expect(sign.status).toBe(409);
    expect(sign.data.fel).toMatch(/redan signerad/);
    // Signeringen gjorde utkastet till anteckningen, så inget utkast ligger kvar.
    expect(db(k).query("SELECT count(*) AS n FROM anteckningar WHERE patient_id = 'p01' AND status = 'utkast' AND forfattare_id = 'lak-kard'").get().n).toBe(fore);
    const ssk = await inloggad('ssk-kard');
    expect((await ssk.put('/api/patient/p01/anteckningsutkast', { typ: 'Daganteckning', sokord: [{ sokord: 'Aktuellt', text: 'x' }] })).status).toBe(403);
    expect((await ssk.put('/api/patient/p01/anteckningsutkast', { typ: 'Omvårdnadsanteckning', sokord: [{ sokord: 'Sömn', text: 'Sov gott' }] })).status).toBe(200);
  });

  test('ett utkast som skrevs under avbrottet sparas från skrivkön, och en senare version av samma utkast ändrar samma anteckning', async () => {
    const k = klient(app);
    await k.logga('lak-kard');
    const s = (await k.get('/api/session')).data;
    const kopia = (await k.get('/api/lasekopia')).data;
    const n = { nyckel: Buffer.from(s.lasnyckel.nyckel, 'base64url'), kopiaId: kopia.kopiaId, personalId: s.personal.id };
    const krypt = (rad) => {
      const iv = randomBytes(12);
      const c = createCipheriv('aes-256-gcm', n.nyckel, iv);
      c.setAAD(Buffer.from(`vardkallan-skrivko|${n.kopiaId}|${n.personalId}|${rad.id}`));
      return { id: rad.id, iv: iv.toString('base64url'), data: Buffer.concat([c.update(JSON.stringify(rad), 'utf8'), c.final(), c.getAuthTag()]).toString('base64url') };
    };
    const lokalId = randomUUID();
    const rad = (text) => ({ id: randomUUID(), typ: 'utkast', patientId: 'p01', gjord: iso(Date.now() - 5 * 60_000), data: { lokalId, typ: 'Daganteckning', sokord: [{ sokord: 'Aktuellt', text }] } });
    const r1 = await k.post('/api/skrivko', { kopiaId: n.kopiaId, rader: [krypt(rad('Skrivet under avbrottet'))] });
    expect(r1.data.resultat[0]).toMatchObject({ status: 'sparad' });
    const id = r1.data.resultat[0].resultatId;
    const r2 = await k.post('/api/skrivko', { kopiaId: n.kopiaId, rader: [krypt(rad('Skrivet under avbrottet, version två'))] });
    expect(r2.data.resultat[0]).toMatchObject({ status: 'sparad', resultatId: id });
    const a = db(k).query('SELECT * FROM anteckningar WHERE id = ?').get(id);
    expect(a).toMatchObject({ status: 'utkast', forfattare_id: 'lak-kard', patient_id: 'p01' });
    expect(JSON.parse(a.sokord)[0].text).toBe('Skrivet under avbrottet, version två');
  });
});

describe('Anteckningsvyn: varianter och ordning', () => {
  test('systemet väljer variant ur kontakten: telefon, psykiatrins vårdenhet, suicidtankar och kroniska sjukdomar på vårdcentralen', () => {
    const d = nyDb();
    const p = (id) => d.query('SELECT * FROM personal WHERE id = ?').get(id);
    expect(varianter.valjVarianter(d, p('lak-vc'), 'Mottagningsanteckning', { kontakt: { vardkontakt: { kontaktsatt: 'telefon', orsak: 'Telefontid' } } }).map(v => v.id)).toEqual(['telefon']);
    expect(varianter.valjVarianter(d, p('lak-psyk'), 'Mottagningsanteckning', { kontakt: { vardkontakt: { kontaktsatt: 'besok', orsak: 'Besök' } } }).map(v => v.id)).toEqual(['psykiatri']);
    expect(varianter.valjVarianter(d, p('lak-akut'), 'Akutanteckning', { kontakt: { vardkontakt: { kontaktsatt: 'besok', orsak: 'Suicidtankar' } } })[0]).toMatchObject({ id: 'psykiatri', varfor: expect.stringContaining('suicidtankar') });
    const kr = varianter.valjVarianter(d, p('lak-vc'), 'Mottagningsanteckning', { kontakt: null, diagnoser: [{ kod: 'E11.9' }, { kod: 'J45.9' }] });
    expect(kr).toEqual([expect.objectContaining({ id: 'kronisk', utfallda: ['Diabetes', 'Astma och KOL'] })]);
    // Utanför primärvården fälls de kroniska sjukdomarna inte ut, och en mall utan varianter har inga.
    expect(varianter.valjVarianter(d, p('lak-kard'), 'Mottagningsanteckning', { diagnoser: [{ kod: 'E11.9' }] })).toEqual([]);
    expect(varianter.valjVarianter(d, p('lak-kard'), 'Epikris', {})).toEqual([]);
  });

  test('mallen för patienten har varianterna och de kroniska sjukdomarna som patienten har, ur diagnoserna som syns', async () => {
    const k = await inloggad('lak-vc');
    const r = (await mall(k, 'p06', 'Mottagningsanteckning')).data;
    expect(r.varianter.map(v => v.id)).toEqual(['telefon', 'psykiatri', 'kronisk']);
    expect(r.valdaVarianter.find(v => v.id === 'kronisk').utfallda).toEqual(expect.arrayContaining(['Diabetes']));
    expect(r.valdaVarianter.find(v => v.id === 'kronisk').utfallda).not.toContain('Astma och KOL');
    expect(r.foreslagna).toEqual([]);
  });

  test('läsordningen visar bedömning och åtgärd först utan att ändra det sparade, och skrivordningen är vårdenhetens förval', async () => {
    const s = [{ sokord: 'Aktuellt', text: 'a' }, { sokord: 'Status', text: 's' }, { sokord: 'Bedömning', text: 'b' }, { sokord: 'Åtgärd', text: 'p' }];
    expect(varianter.lasordning(s).map(x => x.sokord)).toEqual(['Bedömning', 'Åtgärd', 'Aktuellt', 'Status']);
    expect(s.map(x => x.sokord)).toEqual(['Aktuellt', 'Status', 'Bedömning', 'Åtgärd']);
    expect(varianter.lasordning([{ sokord: 'Sömn', text: 'x' }]).map(x => x.sokord)).toEqual(['Sömn']);
    const sysf = await inloggad('sysf');
    expect((await sysf.put('/api/vyforval', { vardenhetId: 'uso-kard', vy: 'anteckning', installning: { skrivordning: 'fel' } })).status).toBe(400);
    const lak = await inloggad('lak-kard');
    expect((await mall(lak, 'p01', 'Daganteckning')).data.mall.sokord).toEqual(['Aktuellt', 'Status', 'Bedömning', 'Åtgärd']);
    // Förvalet gäller vårdenheten i sandlådan där systemförvaltaren sätter det.
    const sb = sandlada(app, lak);
    const r = await lak.get('/api/session');
    expect(r.status).toBe(200);
    sb.db.query('INSERT OR REPLACE INTO vyforval_vardenhet (vardenhet_id, vy, data, andrad, andrad_av) VALUES (?, ?, ?, ?, ?)').run('uso-kard', 'anteckning', JSON.stringify({ skrivordning: 'apso' }), new Date().toISOString(), 'sysf');
    const apso = (await mall(lak, 'p01', 'Daganteckning')).data;
    expect(apso.mall.sokord).toEqual(['Bedömning', 'Åtgärd', 'Aktuellt', 'Status']);
    expect(apso.skrivordning).toMatchObject({ id: 'apso' });
    expect((await sysf.put('/api/vyforval', { vardenhetId: 'uso-kard', vy: 'anteckning', installning: { skrivordning: 'apso' } })).status).toBe(200);
  });

  test('den senaste bedömningen räknas bland anteckningarna som syns', async () => {
    const k = await inloggad('lak-kard');
    const r = (await k.get('/api/patient/p01/anteckningar')).data;
    expect(r.senasteBedomning).toMatchObject({ typ: 'Daganteckning' });
    const forsta = r.anteckningar.find(a => a.id === r.senasteBedomning.id);
    expect(forsta.status).toBe('signerad');
    // Undersköterskan läser inte läkaranteckningar, och får ingen bedömning ur dem.
    const usk = await inloggad('usk-kard');
    const u = (await usk.get('/api/patient/p01/anteckningar')).data;
    expect(u.senasteBedomning?.typ ?? null).not.toBe('Daganteckning');
  });

  test('mallforslag ger inga förslag förrän omvårdnadens regler finns', () => {
    const d = nyDb();
    expect(foreslagnaSokord(atk(d, 'ssk-kard', 'p01'), 'p01', { typ: 'Omvårdnadsanteckning', sokord: [] }, null)).toEqual([]);
  });
});

describe('Anteckningsvyn: egna fraser', () => {
  test('egna fraser har tak och gränser, sparas med personen och syns inte för någon annan', async () => {
    const k = await inloggad('lak-kard');
    const r = await k.post('/api/egna-fraser', { kort: '.ub', text: 'Inga bröstsmärtor, ingen andnöd.' });
    expect(r.status).toBe(201);
    expect(r.data.fraser).toEqual([expect.objectContaining({ kort: 'ub', text: 'Inga bröstsmärtor, ingen andnöd.' })]);
    expect((await k.post('/api/egna-fraser', { kort: 'ub', text: 'igen' })).status).toBe(400);
    expect((await k.post('/api/egna-fraser', { kort: 'pn', text: 'Patient 19121212-1212 mår bra' })).data.fel).toMatch(/personnummer/);
    expect((await k.post('/api/egna-fraser', { kort: 'bt', text: 'Blodtryck 126/76 mmHg (14 nov 07.00)' })).data.fel).toMatch(/underlaget/);
    expect((await k.post('/api/egna-fraser', { kort: 'lang', text: 'x'.repeat(401) })).status).toBe(400);
    expect((await k.post('/api/egna-fraser', { kort: 'två ord', text: 'x' })).status).toBe(400);
    const d = db(k);
    for (let i = 1; i < fraser.TAK; i++) d.query('INSERT INTO egna_fraser (personal_id, kort, text, skapad) VALUES (?, ?, ?, ?)').run('lak-kard', `f${i}`, 'text', new Date().toISOString());
    expect((await k.post('/api/egna-fraser', { kort: 'sista', text: 'x' })).data.fel).toMatch(/taket/);
    // Fraserna hör till personen, inte till någon patient, och lagringen klassar dem efter personen.
    expect(klassa(d).egna_fraser).toEqual({ typ: 'via', kolumn: 'personal_id', tabell: 'personal' });
    // En annan person i samma sandlåda ser inte fraserna och kan inte ta bort dem.
    const id = r.data.fraser[0].id;
    somPerson(sandlada(app, k), 'ol-kard');
    expect((await k.get('/api/egna-fraser')).data.fraser).toEqual([]);
    expect((await k.raw('DELETE', `/api/egna-fraser/${id}`)).status).toBe(404);
    somPerson(sandlada(app, k), 'lak-kard');
    expect((await k.raw('DELETE', `/api/egna-fraser/${id}`)).status).toBe(200);
    // Den som inte skriver i journalen har inga fraser.
    const adm = await inloggad('adm-kard');
    expect((await adm.post('/api/egna-fraser', { kort: 'x', text: 'x' })).status).toBe(403);
  });

  test('egen ordning på sökorden flyttar bara mallens sökord och gäller i mallen för personen', async () => {
    const k = await inloggad('lak-kard');
    expect((await k.put('/api/egna-fraser/ordning', { typ: 'Daganteckning', ordning: ['Bedömning', 'Aktuellt'] })).status).toBe(400);
    expect((await k.put('/api/egna-fraser/ordning', { typ: 'Daganteckning', ordning: ['Bedömning', 'Aktuellt', 'Status', 'Påhittat'] })).status).toBe(400);
    expect((await k.put('/api/egna-fraser/ordning', { typ: 'Tobaksvanor', ordning: ['x'] })).status).toBe(400);
    const r = await k.put('/api/egna-fraser/ordning', { typ: 'Daganteckning', ordning: ['Bedömning', 'Aktuellt', 'Status', 'Åtgärd'] });
    expect(r.data.ordningar.Daganteckning).toEqual(['Bedömning', 'Aktuellt', 'Status', 'Åtgärd']);
    const m = (await mall(k, 'p01', 'Daganteckning')).data;
    expect(m.mall.sokord).toEqual(['Bedömning', 'Aktuellt', 'Status', 'Åtgärd']);
    expect(m.skrivordning.egen).toBe(true);
    await k.put('/api/egna-fraser/ordning', { typ: 'Daganteckning', ordning: [] });
    expect((await mall(k, 'p01', 'Daganteckning')).data.mall.sokord).toEqual(['Aktuellt', 'Status', 'Bedömning', 'Åtgärd']);
  });
});
