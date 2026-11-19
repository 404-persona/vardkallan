// Ekonomin i version 1.8 (runda 18, r3, Sussa bör-krav B1 till B5, 7.1.1.2 och 7.1.2.1): kostnaden i vårdprocessen med
// prover och undersökningar, källor och jämförelse, priser där beslutet fattas, uthämtning och betalning av hjälpmedel
// med kvitto, avtal med betalningsmottagare och kostnaderna per vårdenhet för verksamhetschefen. Tiden skickas in (nu),
// och testerna räknar bara de rader de själva lägger in.
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { byggSeed, idag, addDagar, datumAv } from '../src/db.js';
import * as ekonomi from '../src/ekonomi.js';
import * as priser from '../src/ekonomi-priser.js';
import * as kassa from '../src/kassa.js';
import { BASPRISER, kommunDygnRiks } from '../src/ekonomi-schema.js';
import { atk, personal, testserver, klient, sandlada } from './hjalp.js';

let app;
beforeAll(() => { app = testserver(); });
afterAll(() => app.stopp());

const inloggad = async (roll) => { const k = klient(app); await k.logga(roll); return k; };
const db = (k) => sandlada(app, k).db;
const fel = (fn) => { try { fn(); } catch (e) { return e; } return null; };
const vt = (d, pid) => d.query('SELECT * FROM vardtillfallen WHERE patient_id = ? ORDER BY id DESC').get(pid);
const pagandeVistelse = (d, pid) => d.query("SELECT * FROM vardkontakter WHERE patient_id = ? AND typ = 'slutenvard' AND slut IS NULL ORDER BY start DESC").get(pid);

// En beställning med analyser på en vårdkontakt, som om läkaren hade beställt den.
function bestall(d, { pid, enhet, vk, analyser, nu = Date.now(), ansvarig = 'lak-kard' }) {
  const tid = new Date(nu - 3600_000).toISOString();
  const b = d.query(`INSERT INTO labb_bestallningar (nummer, patient_id, enhet_id, vardkontakt_id, ansvarig_id, registrerad_av, skapad, planerad)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`).get(`PROV-R18-${Math.random().toString(36).slice(2, 10)}`, pid, enhet, vk, ansvarig, ansvarig, tid, tid).id;
  for (const a of analyser) d.query("INSERT INTO labb_analyser (bestallning_id, patient_id, enhet_id, analys, lab_id, prov_id, status) VALUES (?, ?, ?, ?, 'lab-kem-uso', 0, 'bestalld')").run(b, pid, enhet, a);
  return b;
}

describe('Ekonomi 1.8: kostnader i vårdprocessen', () => {
  test('rutan har prover och undersökningar, källan för varje belopp och jämförelsen med en jämförbar process i samma DRG-grupp', () => {
    const d = byggSeed();
    const nu = Date.now();
    const v = pagandeVistelse(d, 'p01');
    const undersokning = () => ekonomi.kostnader(atk(d, 'lak-kard', 'p01', {}, 'las_kostnader'), {}, nu).aktuell.kategorier.find(k => k.typ === 'undersokning')?.belopp ?? 0;
    const fore = undersokning();
    bestall(d, { pid: 'p01', enhet: v.enhet_id, vk: v.id, analyser: ['crp', 'rtg_lungor'], nu });
    const ut = ekonomi.kostnader(atk(d, 'lak-kard', 'p01', {}, 'las_kostnader'), {}, nu).aktuell;
    const us = ut.kategorier.find(k => k.typ === 'undersokning');
    expect(us).toMatchObject({ text: 'Prover och undersökningar', belopp: fore + priser.analyspris('crp').belopp + priser.analyspris('rtg_lungor').belopp });
    expect(ut.undersokningar.map(x => x.kod)).toEqual(expect.arrayContaining(['crp', 'rtg_lungor']));
    expect(ut.totalt).toBe(ut.kategorier.reduce((s, k) => s + k.belopp, 0));
    // Varje kategori har sin källa, och rutan listar prislistan med version.
    for (const k of ut.kategorier) expect(k.kalla).toBeTruthy();
    expect(ut.kallor.some(x => x.typ === 'prislista' && /version \d+ från \d{4}-\d{2}-\d{2}/.test(x.text))).toBe(true);
    // Jämförelsen: ersättningen för ett jämförbart vårdtillfälle i samma DRG-grupp och skillnaden mot kostnaden hittills.
    expect(ut.jamforelse).toMatchObject({ finns: true, drg: ut.drg.belopp, totalt: ut.totalt, skillnad: ut.totalt - ut.drg.belopp });
    expect(ut.jamforelse.text).toContain('samma DRG-grupp');
  });

  test('spärr: prover på en spärrad vårdenhet syns inte, och hela svaret är detsamma med och utan den dolda beställningen', () => {
    const nu = Date.now();
    const svar = (dold) => {
      const d = byggSeed();
      d.query("INSERT INTO sparrar (patient_id, enhet_id, registrerad) VALUES ('p22', 'uso-psyk', ?)").run(idag());
      const psyk = d.query("SELECT * FROM vardkontakter WHERE patient_id = 'p22' AND enhet_id = 'uso-psyk' ORDER BY start DESC").get();
      if (dold) bestall(d, { pid: 'p22', enhet: 'uso-psyk', vk: psyk.id, analyser: ['mr_hjarna', 'eeg'], nu, ansvarig: 'lak-psyk' });
      return JSON.stringify(ekonomi.kostnader(atk(d, 'lak-kard', 'p22', {}, 'las_kostnader'), {}, nu));
    };
    const utan = svar(false);
    const med = svar(true);
    expect(med).toBe(utan);
    for (const x of ['MR hjärna', 'EEG', 'mr_hjarna']) expect(med).not.toContain(x);
  });
});

describe('Ekonomi 1.8: priser där beslutet fattas', () => {
  test('läkemedlet har sitt pris och periodens vara i katalogen, utan något extra steg, och vårdadministratören ser inga priser', async () => {
    const k = await inloggad('lak-kard');
    const l = (await k.get('/api/lakemedel/katalog?q=eliquis')).data;
    const eliquis = l.find(x => x.namn === 'Eliquis');
    expect(eliquis.pris.belopp).toBeGreaterThan(0);
    expect(eliquis.pris.alternativ.pris).toBeLessThan(eliquis.pris.belopp);
    expect(eliquis.pris.alternativ.text).toContain('Periodens vara');
    // En generisk produkt har inget billigare alternativ i demon.
    const ator = (await k.get('/api/lakemedel/katalog?q=atorvastatin')).data[0];
    expect(ator.pris.belopp).toBeGreaterThan(0);
    expect(ator.pris.alternativ).toBeNull();
    const p = (await k.get(`/api/priser/lakemedel/${encodeURIComponent(eliquis.id)}`)).data;
    expect(p).toMatchObject({ pris: eliquis.pris.belopp, forman: true });
    expect(p.demo).toContain('Påhittade demopriser');
    const adm = await inloggad('adm-kard');
    expect((await adm.get('/api/lakemedel/katalog?q=eliquis')).data.every(x => x.pris === undefined)).toBe(true);
    expect((await adm.get(`/api/priser/lakemedel/${encodeURIComponent(eliquis.id)}`)).status).toBe(403);
  });

  test('beställningen av prover och undersökningar har priset för varje analys och paket', async () => {
    const k = await inloggad('lak-kard');
    const f = (await k.get('/api/patient/p01/prover/forslag')).data;
    expect(f.analyser.length).toBeGreaterThan(0);
    for (const a of f.analyser) expect(a.pris.belopp).toBe(priser.analyspris(a.id).belopp);
    for (const p of f.paket) expect(p.pris.belopp).toBe(p.analyser.reduce((s, a) => s + a.pris.belopp, 0));
    expect(priser.analyspris('mr_hjarna').belopp).toBeGreaterThan(priser.analyspris('rtg_lungor').belopp);
  });

  test('hjälpmedlen har priset och basmodellen ur sortimentet som likvärdigt billigare alternativ', async () => {
    const k = await inloggad('ssk-kard');
    const { hjalpmedel } = (await k.get('/api/hjalpmedel')).data;
    const r = hjalpmedel.find(h => h.kod === 'HM-ROLLATOR');
    expect(r).toMatchObject({ pris: BASPRISER.hjalpmedel['HM-ROLLATOR'].pris, alternativ: { kod: 'HM-ROLLATOR-BAS', pris: BASPRISER.hjalpmedel['HM-ROLLATOR-BAS'].pris } });
    expect(hjalpmedel.find(h => h.kod === 'HM-ORTOS-KNA')).toMatchObject({ uthamtning: true });
  });
});

describe('Ekonomi 1.8: uthämtning och betalning av hjälpmedel', () => {
  test('ett hjälpmedel som hämtas ut är förskrivet tills patienten hämtar det i receptionen och betalar, med kvitto, och betalningen finns i kassan och underlaget', async () => {
    const k = await inloggad('ssk-kard');
    const r = await k.post('/api/patient/p01/hjalpmedel', { artikel: 'HM-ORTOS-KNA' });
    expect(r.status).toBe(201);
    expect(r.data).toMatchObject({ uthamtning: true });
    expect(r.data.besked).toContain('hämtar ut det i receptionen');
    const d = db(k);
    // Förskrivet men inte uthämtat: ingen post i underlaget än.
    const fore = ekonomi.transaktioner(d, { vardenhet: 'uso-kard', fran: idag(), till: idag() }).filter(x => x.kalla === `hjalpmedel:${r.data.id}`);
    expect(fore).toEqual([]);
    // Samma sandlåda: kassören på vårdenheten loggar in, ser hjälpmedlet i rutan och tar betalt.
    const adm = k;
    await adm.logga('adm-kard');
    const ruta = (await adm.get('/api/patient/p01/kostnader')).data;
    expect(ruta.hjalpmedelAttHamta.find(h => h.id === r.data.id)).toMatchObject({ status: 'forskriven', avgift: BASPRISER.hjalpmedel['HM-ORTOS-KNA'].avgift, kanHamta: true, kanBetala: true });
    expect((await adm.post(`/api/patient/p01/hjalpmedel/${r.data.id}/uthamta`, {})).status).toBe(400);
    const b = await adm.post(`/api/patient/p01/hjalpmedel/${r.data.id}/uthamta`, { satt: 'kort' });
    expect(b.status).toBe(201);
    expect(b.data.kvitto).toMatchObject({ belopp: 300, satt: 'kort', sattText: 'Kort' });
    expect(b.data.kvitto.kvitto).toMatch(/^VK-DEMO-H-\d{5}$/);
    expect(b.data.hjalpmedel.status).toBe('betald');
    // Kvittot går att visa igen, och en andra betalning stoppas.
    expect((await adm.get(`/api/patient/p01/hjalpmedel/${r.data.id}/kvitto`)).data.kvitto).toBe(b.data.kvitto.kvitto);
    const igen = await adm.post(`/api/patient/p01/hjalpmedel/${r.data.id}/uthamta`, { satt: 'kort' });
    expect(igen.status).toBe(400);
    expect(igen.data.fel).toContain('redan betalt');
    // Underlaget har hjälpmedlet och avgiften som betald med kvittot, och kassan har betalningen.
    const t = ekonomi.transaktioner(d, { vardenhet: 'uso-kard', fran: idag(), till: idag() }).filter(x => x.kalla === `hjalpmedel:${r.data.id}`);
    expect(t.find(x => x.typ === 'hjalpmedel')).toBeTruthy();
    expect(t.find(x => x.typ === 'patientavgift')).toMatchObject({ status: 'betald', debiteras: false, kvitto: b.data.kvitto.kvitto });
    const ks = kassa.kassa(d, personal(d, 'adm-kard'));
    const rad = ks.kassorer.flatMap(x => x.rader).find(x => x.kvitto === b.data.kvitto.kvitto);
    expect(rad).toMatchObject({ slag: 'Hjälpmedelsavgift', satt: 'kort', belopp: 300, kanAterbetalas: false });
    expect(d.query("SELECT * FROM atkomstlogg WHERE resurs = ? ORDER BY id DESC").get(`hjalpmedel:${r.data.id}:uthamtning`)).toMatchObject({ personal_id: 'adm-kard', patient_id: 'p01' });
  });

  test('uthämtningen prövas: en annan vårdenhet, en roll utan kassa och en betalning som inte ändras', () => {
    const d = byggSeed();
    const [, f] = ekonomi.registreraHjalpmedel(atk(d, 'ssk-kard', 'p01', {}, 'hjalpmedel'), { artikel: 'HM-ORTOS-KNA' });
    // Sjuksköterskan har ingen kassa och tar inte betalt för en avgift.
    expect(fel(() => ekonomi.uthamta(atk(d, 'ssk-kard', 'p01', {}, 'las_kostnader'), f.id, { satt: 'kort' }))?.status).toBe(403);
    // Kassören på en annan vårdenhet får samma svar som om hjälpmedlet inte fanns.
    const annan = 'adm-test-vc';
    d.query("INSERT INTO personal (id, namn, yrke, titel, enhet_id, hsa_id, demo) VALUES (?, 'Test Kassör', 'vardadministrator', 'Vårdadministratör', 'vc-tybble', ?, 0)").run(annan, annan);
    const e = fel(() => ekonomi.uthamta(atk(d, annan, 'p01', { andra_enheter: true }, 'las_kostnader'), f.id, { satt: 'kort' }));
    expect(e?.status).toBe(404);
    expect(e.message).toBe(fel(() => ekonomi.uthamta(atk(d, annan, 'p01', { andra_enheter: true }, 'las_kostnader'), 999999, { satt: 'kort' })).message);
    const [, b] = ekonomi.uthamta(atk(d, 'adm-kard', 'p01', {}, 'las_kostnader'), f.id, { satt: 'faktura' });
    expect(b.kvitto.satt).toBe('faktura');
    expect(fel(() => d.query('UPDATE hjalpmedel_betalningar SET belopp = 0').run())).toBeTruthy();
    expect(fel(() => d.query('DELETE FROM hjalpmedel_betalningar').run())).toBeTruthy();
  });
});

describe('Ekonomi 1.8: avtal med betalningsmottagare', () => {
  test('ett avtal med en annan region ger rabatt på utomlänsvården i underlaget, och bara ekonomen registrerar avtal', async () => {
    const d = byggSeed();
    // Patient 12 är folkbokförd i Värmland, och demon har ett samverkansavtal med fem procents rabatt.
    const v = vt(d, 'p12');
    const t = ekonomi.transaktioner(d, { vardenhet: 'uso-ort', fran: datumAv(new Date(v.inskriven)), till: datumAv(new Date(v.utskriven ?? Date.now())) });
    const drg = t.find(r => r.typ === 'drg');
    expect(drg.avtal).toMatchObject({ motpart: 'Region Värmland', rabattProcent: 5 });
    expect(drg.belopp).toBe(Math.round(drg.avtal.ordinarie * 0.95));
    expect(drg.avtal.rabatt).toBe(drg.avtal.ordinarie - drg.belopp);
    const eko = await inloggad('eko');
    const lista = (await eko.get('/api/ekonomi/avtal')).data;
    expect(lista.avtal.find(a => a.motpart === 'Region Värmland')).toMatchObject({ status: 'galler' });
    expect((await eko.post('/api/ekonomi/avtal', { motpartTyp: 'region', motpart: '19', giltigFran: addDagar(idag(), -1), rabattProcent: 3, text: 'Avtal' })).status).toBe(400);
    const ny = await eko.post('/api/ekonomi/avtal', { motpartTyp: 'kommun', motpart: 'Karlskoga', giltigFran: addDagar(idag(), 1), dygnspris: 6500, text: 'Överenskommelse om utskrivningsklara' });
    expect(ny.status).toBe(201);
    expect(ny.data).toMatchObject({ motpart: 'Karlskoga kommun', dygnspris: 6500, status: 'kommande' });
    const lak = await inloggad('lak-kard');
    expect((await lak.get('/api/ekonomi/avtal')).status).toBe(403);
    expect((await lak.post('/api/ekonomi/avtal', { motpartTyp: 'kommun', motpart: 'Kumla', giltigFran: idag(), dygnspris: 1, text: 'Prov' })).status).toBe(403);
  });

  test('utan överenskommelse betalar kommunen genomsnittskostnaden i riket enligt 5 kap. 6 §, och med en överenskommelse avtalets pris', () => {
    const d = byggSeed();
    const dag = idag();
    const utan = ekonomi.kommunDygnspris(d, 'Karlskoga', dag);
    expect(utan).toMatchObject({ grund: 'riksgenomsnitt', pris: kommunDygnRiks(dag).belopp });
    expect(utan.text).toContain('5 kap. 6 §');
    d.query("INSERT INTO ekonomiavtal (motpart_typ, motpart, motpart_namn, giltig_fran, dygnspris, text, skapad) VALUES ('kommun', 'Karlskoga', 'Karlskoga kommun', ?, 6100, 'Överenskommelse', ?)").run(addDagar(dag, -10), new Date().toISOString());
    expect(ekonomi.kommunDygnspris(d, 'Karlskoga', dag)).toMatchObject({ grund: 'overenskommelse', pris: 6100 });
    // Ett avtal ändras och raderas inte.
    expect(fel(() => d.query('UPDATE ekonomiavtal SET dygnspris = 1').run())).toBeTruthy();
    expect(fel(() => d.query('DELETE FROM ekonomiavtal').run())).toBeTruthy();
  });
});

describe('Ekonomi 1.8: kostnader per vårdenhet', () => {
  test('verksamhetschefen ser sina vårdenheter per månad utan patientuppgifter, ekonomen ser alla, och läkaren inte alls', async () => {
    const vch = await inloggad('vch-kard');
    const r = await vch.get('/api/ekonomi/kostnader');
    expect(r.status).toBe(200);
    expect(r.data.perioder.length).toBe(6);
    expect(r.data.perioder.at(-1)).toMatchObject({ manad: idag().slice(0, 7), pagar: true });
    expect(r.data.vardenheter.map(v => v.vardenhet.id)).toContain('uso-kard');
    const kard = r.data.vardenheter.find(v => v.vardenhet.id === 'uso-kard');
    expect(kard.summa).toBe(kard.manader.reduce((s, m) => s + m.kostnad, 0));
    for (const m of kard.manader) expect(m.kostnad).toBe(Object.values(m.perTyp).reduce((s, x) => s + x, 0));
    expect(kard.summa).toBeGreaterThan(0);
    const d = db(vch);
    const s = JSON.stringify(r.data);
    for (const p of d.query('SELECT fornamn, efternamn, personnummer FROM patienter').all()) {
      expect(s.includes(p.personnummer)).toBe(false);
      expect(s.includes(`${p.fornamn} ${p.efternamn}`)).toBe(false);
    }
    expect(d.query("SELECT * FROM atkomstlogg WHERE handling = 'ekonomi_oversikt' ORDER BY id DESC").get()).toMatchObject({ patient_id: null, personal_id: 'vch-kard' });
    const eko = await inloggad('eko');
    const alla = (await eko.get('/api/ekonomi/kostnader?manader=3')).data;
    expect(alla.perioder.length).toBe(3);
    expect(alla.vardenheter.length).toBeGreaterThan(r.data.vardenheter.length);
    const lak = await inloggad('lak-kard');
    expect((await lak.get('/api/ekonomi/kostnader')).status).toBe(403);
  }, 30_000);
});
