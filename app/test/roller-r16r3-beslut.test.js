// Runda 16, r3: Jonas beslut 2026-11-15 om rollerna. A: barnmorskans roll kräver både barnmorskans och sjuksköterskans
// legitimation. B: undersköterskan läser inte kuratorns och psykologens anteckningar. C: kuratorn upprättar samordnade
// individuella planer (SIP).
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { ROLLER, kanRoll, prova, LEGITIMATION_ALLA } from '../src/atkomst.js';
import { byggSeed } from '../src/db.js';
import * as journal from '../src/journal.js';
import * as yrkesmallar from '../src/mallar-yrken.js';
import { provaMotMasterdata } from '../src/inloggningstjanster.js';
import * as ovning from '../src/ovningstjanst-oidc.js';
import { atk, personal, testserver, klient, sandlada, somPerson } from './hjalp.js';

const fel = (fn) => { try { fn(); } catch (e) { return e; } return null; };
let app;
beforeAll(() => { app = testserver(); });
afterAll(() => app.stopp());

describe('Runda 16, r3, beslut A: barnmorskans legitimation', () => {
  const prov = (db, id, legitimation) => {
    const p = personal(db, id);
    const u = require('../src/idp.js').uppdragFor(db, p);
    const k = { vardgivareHsaId: u.healthCareProviderHsaId, utfardare: 'x', id: 't', namn: 'Test' };
    const a = { personHsaId: p.hsa_id, uppdragHsaId: u.commissionHsaId, andamal: u.commissionPurpose, vardenhetHsaId: u.healthCareUnitHsaId, vardgivareHsaId: u.healthCareProviderHsaId, legitimation, tillitsniva: null };
    return fel(() => provaMotMasterdata(db, k, a, { iat: 1 }));
  };

  test('barnmorskans roll kräver både barnmorskans och sjuksköterskans legitimation, och bara den ena nekas med en förklaring', () => {
    const db = byggSeed();
    expect(LEGITIMATION_ALLA.barnmorska).toEqual(['BM', 'SJ']);
    expect(prov(db, 'bm-uso', ['BM', 'SJ'])).toBeNull();
    expect(prov(db, 'bm-vc', ['SJ', 'BM', 'LK'])).toBeNull();
    const baraBm = prov(db, 'bm-uso', ['BM']);
    expect(baraBm?.status).toBe(403);
    expect(baraBm.message).toContain('sjuksköterska');
    expect(baraBm.message).toContain('både');
    const baraSj = prov(db, 'bm-uso', ['SJ']);
    expect(baraSj?.status).toBe(403);
    expect(baraSj.message).toContain('barnmorska');
    expect(prov(db, 'bm-uso', [])?.status).toBe(403);
    // Sjuksköterskans roll kräver fortfarande bara SJ.
    expect(prov(db, 'ssk-kard', ['SJ'])).toBeNull();
    // Barnmorskan behåller sjuksköterskans generella direktiv.
    expect(ROLLER.barnmorska).toContain('ordinera_direktiv');
  });

  test('den simulerade inloggningstjänsten ger demobarnmorskorna både barnmorskans och sjuksköterskans legitimation', () => {
    const db = byggSeed();
    for (const id of ['bm-uso', 'bm-vc']) {
      const a = ovning.attributFor(db, personal(db, id), 'ratt');
      expect(a.healthcareProfessionalLicense.sort()).toEqual(['BM', 'SJ']);
      expect(prov(db, id, a.healthcareProfessionalLicense)).toBeNull();
    }
    expect(ovning.attributFor(db, personal(db, 'ssk-kard'), 'ratt').healthcareProfessionalLicense).toEqual(['SJ']);
    expect(ovning.attributFor(db, personal(db, 'bm-uso'), 'saknar_legitimation').healthcareProfessionalLicense).toBeUndefined();
  });
});

describe('Runda 16, r3, beslut B: kuratorns och psykologens anteckningar', () => {
  const TEXT = 'Unik psykologtext om sömnen 4711';
  const skriv = (db) => {
    const a = journal.skapaAnteckning(atk(db, 'psy-psyk', 'p04', {}, 'skriv_omvardnad'), { typ: 'Psykologanteckning', sokord: [{ sokord: 'Bedömning', text: TEXT }] });
    journal.signera(atk(db, 'psy-psyk', 'p04', {}, 'skriv_omvardnad'), db.query('SELECT * FROM anteckningar WHERE id = ?').get(a.id));
    return a.id;
  };

  test('undersköterskan läser inte psykologens anteckning, men läkaren, sjuksköterskan och psykologen gör det', () => {
    const db = byggSeed();
    const id = skriv(db);
    const rad = db.query('SELECT * FROM anteckningar WHERE id = ?').get(id);
    expect(journal.lasHandling(rad)).toBe('las_journal');
    expect(journal.lasHandling('omvardnad')).toBe('las_omvardnad');
    const syns = (pid) => journal.synligaAnteckningar(atk(db, pid, 'p04', {}, 'las_omvardnad')).some(x => x.id === id);
    expect(syns('sk-psyk')).toBe(false);
    for (const p of ['lak-psyk', 'ssk-psyk', 'psy-psyk', 'pt-psyk']) expect({ p, syns: syns(p) }).toEqual({ p, syns: true });
    // Undersköterskan läser fortfarande andra omvårdnadsanteckningar.
    const omv = journal.skapaAnteckning(atk(db, 'ssk-psyk', 'p04', {}, 'skriv_omvardnad'), { typ: 'Omvårdnadsanteckning', sokord: [{ sokord: 'Sömn', text: 'Sov gott.' }] });
    journal.signera(atk(db, 'ssk-psyk', 'p04', {}, 'skriv_omvardnad'), db.query('SELECT * FROM anteckningar WHERE id = ?').get(omv.id));
    expect(syns('sk-psyk')).toBe(false);
    expect(journal.synligaAnteckningar(atk(db, 'sk-psyk', 'p04', {}, 'las_omvardnad')).some(x => x.id === omv.id)).toBe(true);
    // Att öppna anteckningen direkt nekas.
    expect(fel(() => journal.hamtaAnteckning(atk(db, 'sk-psyk', 'p04', {}, 'las_omvardnad'), rad))?.status).toBe(403);
  });

  test('undersköterskan ser inte anteckningen i journalen, sökningen, översikten, FHIR eller utskriften, och läkaren gör det', async () => {
    const k = klient(app);
    await k.logga('lak-psyk');
    const s = sandlada(app, k);
    const id = skriv(s.db);
    const vagar = [`/api/patient/p04/anteckningar`, `/api/patient/p04/sok?q=${encodeURIComponent('psykologtext')}`, '/api/patient/p04/oversikt', '/fhir/Composition?patient=p04'];
    const hamta = async () => {
      const ut = {};
      for (const v of vagar) ut[v] = JSON.stringify((await k.get(v)).data);
      ut.anteckning = (await k.get(`/api/anteckning/${id}`)).status;
      ut.utskrift = JSON.stringify((await k.post('/api/patient/p04/utskrift', { syfte: 'Underlag vid vårdplanering', delar: ['anteckningar'] })).data);
      return ut;
    };
    const lak = await hamta();
    for (const v of vagar.filter(x => !x.includes('oversikt'))) expect({ v, syns: lak[v].includes('Psykologanteckning') }).toEqual({ v, syns: true });
    expect(lak.anteckning).toBe(200);
    somPerson(s, 'sk-psyk');
    const usk = await hamta();
    for (const [v, t] of Object.entries(usk)) if (typeof t === 'string') expect({ v, lacker: t.includes(TEXT) || t.includes('Psykologanteckning') }).toEqual({ v, lacker: false });
    expect(usk.anteckning).toBe(403);
  }, 30_000);

  test('kuratorn och psykologen skriver bara med sina egna mallar, så att ingen av deras anteckningar läses av undersköterskan', () => {
    const db = byggSeed();
    for (const yrke of ['kurator', 'psykolog']) {
      const par = yrkesmallar.yrkesparameter(yrke);
      expect(par.provaLista(['Omvårdnadsanteckning'], { db })).toContain('undersköterskan');
      expect(par.provaLista([yrke === 'kurator' ? 'Kuratorsanteckning' : 'Psykologanteckning'], { db })).toBeNull();
    }
    const kur = personal(db, 'kur-vc');
    expect(yrkesmallar.far(db, kur, { typ: 'Fallriskbedömning', kategori: 'omvardnad', formular: true })).toBe(false);
    expect(yrkesmallar.far(db, kur, { typ: 'Egen mall', kategori: 'omvardnad', egen: true })).toBe(false);
  });
});

describe('Runda 16, r3, beslut C: kuratorn och SIP', () => {
  test('kuratorn upprättar en samordnad individuell plan med samma handling som läkaren och sjuksköterskan, men inget inskrivningsmeddelande', async () => {
    expect(ROLLER.kurator).toContain('samordna');
    for (const r of ['lakare', 'sjukskoterska']) expect(ROLLER[r]).toContain('samordna');
    const k = klient(app);
    await k.logga('kur-vc');
    const sip = await k.post('/api/patient/p06/samordning', { typ: 'sip', samtycke: true, insatser: [{ text: 'Samtalsstöd', huvudman: 'region' }, { text: 'Hemtjänst', huvudman: 'kommun' }] });
    expect(sip.status).toBe(201);
    expect((await k.post('/api/patient/p06/samordning', { typ: 'spu', behov: { socialtjanst: true } })).status).toBe(403);
    expect((await k.post('/api/patient/p06/samordning', { typ: 'lpt7a', samtycke: true, insatser: [{ text: 'x', huvudman: 'kommun' }] })).status).toBe(403);
    // Utan vårdrelation går det inte.
    expect((await k.post('/api/patient/p04/samordning', { typ: 'sip', samtycke: true, insatser: [{ text: 'x', huvudman: 'kommun' }] })).status).toBe(403);
    const db = sandlada(app, k).db;
    expect(kanRoll(personal(db, 'kur-vc'), 'samordna')).toBe(true);
    expect(prova(db, { personal: personal(db, 'kur-vc'), patient: 'p06', handling: 'samordna' }).tillaten).toBe(true);
  }, 30_000);

  test('kuratorn ändrar, upprättar och avslutar bara samordnade individuella planer, aldrig en annan samordnad planering, och nekandet loggas', async () => {
    const l = klient(app);
    await l.logga('lak-vc');
    const s = sandlada(app, l);
    const vard = await l.post('/api/patient/p06/samordning', { typ: 'lpt7a', samtycke: true, insatser: [{ text: 'Boendestöd', huvudman: 'kommun' }] });
    expect(vard.status).toBe(201);
    const k = klient(app);
    await k.logga('kur-vc');
    sandlada(app, k).db = s.db;
    for (const [atgard, body] of [['beraknad', { datum: '2099-01-01' }], ['plan', { samtycke: true, insatser: [{ text: 'x', huvudman: 'kommun' }] }], ['avsluta', {}], ['fast-vardkontakt', {}], ['kallelse', {}]]) {
      const r = await k.post(`/api/samordning/${vard.data.id}/${atgard}`, body);
      expect({ atgard, status: r.status }).toEqual({ atgard, status: 403 });
    }
    const nekade = s.db.query(`SELECT count(*) AS n FROM atkomstlogg WHERE personal_id = 'kur-vc' AND resultat = 'nekad' AND resurs LIKE 'samordning:${vard.data.id}:%'`).get().n;
    expect(nekade).toBeGreaterThanOrEqual(5);
    // Kuratorns egen SIP går att ändra och avsluta.
    const sip = await k.post('/api/patient/p06/samordning', { typ: 'sip', samtycke: true, insatser: [{ text: 'Samtalsstöd', huvudman: 'region' }] });
    expect((await k.post(`/api/samordning/${sip.data.id}/plan`, { samtycke: true, insatser: [{ text: 'Samtalsstöd varannan vecka', huvudman: 'region' }] })).status).toBe(200);
    expect((await k.post(`/api/samordning/${sip.data.id}/avsluta`, {})).status).toBe(200);
  }, 30_000);
});

describe('Runda 16, r3, beslut B: bilder och media till kuratorns och psykologens anteckningar', () => {
  test('en bild som kuratorn eller psykologen har laddat upp, eller som hör till deras anteckning, läses inte av undersköterskan', async () => {
    const bilder = require('../src/bilder.js');
    const db = byggSeed();
    bilder.sakra(db);
    const png = { namn: 'bild.png', typ: 'image/png', buf: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') };
    const nu = new Date();
    const a = journal.skapaAnteckning(atk(db, 'psy-psyk', 'p04', {}, 'skriv_omvardnad'), { typ: 'Psykologanteckning', sokord: [{ sokord: 'Bedömning', text: 'Teckning från samtalet.' }] });
    const avPsykolog = bilder.spara(db, { patientId: 'p04', enhetId: 'uso-psyk', kategori: 'omvardnad', fil: png, kalla: 'uppladdning', tagen: nu.toISOString(), nu, av: 'psy-psyk' });
    const tillAnteckning = bilder.spara(db, { patientId: 'p04', enhetId: 'uso-psyk', anteckningId: a.id, kategori: 'omvardnad', fil: png, kalla: 'uppladdning', tagen: nu.toISOString(), nu, av: 'ssk-psyk' });
    const vanlig = bilder.spara(db, { patientId: 'p04', enhetId: 'uso-psyk', kategori: 'omvardnad', fil: png, kalla: 'uppladdning', tagen: nu.toISOString(), nu, av: 'ssk-psyk' });
    const rad = (id) => db.query('SELECT * FROM media WHERE id = ?').get(id.id ?? id);
    for (const m of [avPsykolog, tillAnteckning]) {
      expect(bilder.lasHandlingFor(rad(m))).toBe('las_journal');
      expect(fel(() => bilder.kravFil(atk(db, 'sk-psyk', 'p04', {}, 'las_omvardnad'), rad(m)))?.status).toBe(403);
      expect(fel(() => bilder.kravFil(atk(db, 'ssk-psyk', 'p04', {}, 'las_journal'), rad(m)))).toBeNull();
    }
    expect(bilder.lasHandlingFor(rad(vanlig))).toBe('las_omvardnad');
    // Listan med patientens bilder.
    const uskLista = JSON.stringify(bilder.forPatient(atk(db, 'sk-psyk', 'p04', {}, 'las_omvardnad')));
    for (const m of [avPsykolog, tillAnteckning]) expect(uskLista).not.toContain(`/api/media/${m.id ?? m}/fil`);
    expect(uskLista).toContain(`/api/media/${vanlig.id ?? vanlig}/fil`);
  });
});
