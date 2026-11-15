// Runda 16, r3: de nya yrkesrollerna (arbetsterapeut, dietist, logoped, hälso- och sjukvårdskurator, psykolog och
// barnmorska), skötaren som undersköterska med titeln skötare, och studenterna som dokumenterar under handledning.
import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import { ROLLER, HANDLINGAR, kanRoll, prova, BARNMORSKAN_INTE, somYrke, aktivHandledning, LEGITIMATION_FOR_ROLL } from '../src/atkomst.js';
import { byggSeed, datumAv, addDagar } from '../src/db.js';
import * as journal from '../src/journal.js';
import * as yrkesmallar from '../src/mallar-yrken.js';
import { SOKORD } from '../src/fackssprak.js';
import * as handledning from '../src/handledning.js';
import * as preventivmedel from '../src/preventivmedel.js';
import * as obstetrik from '../src/obstetrik.js';
import { provaMotMasterdata, LEGITIMATION } from '../src/inloggningstjanster.js';
import { PERSONAL } from '../src/seed/personal.js';
import { atk, personal, testserver, klient, sandlada } from './hjalp.js';
import { stallKlockan, aterstallKlockan } from './falsk-klocka.js';

const NYA = ['arbetsterapeut', 'dietist', 'logoped', 'kurator', 'psykolog', 'barnmorska'];
const STUDENTER = ['lakarstudent', 'sjukskoterskestudent', 'barnmorskestudent'];
const fel = (fn) => { try { fn(); } catch (e) { return e; } return null; };
const NU = new Date('2026-11-12T10:00:00Z');

let app;
beforeAll(() => { app = testserver(); });
afterAll(() => app.stopp());

describe('Runda 16, r3: rollerna i behörighetsmotorn', () => {
  test('de nya rollerna finns, har utbildningen och har aldrig ordination, nödåtkomst eller läkarens journalskrivning', () => {
    for (const r of [...NYA, ...STUDENTER]) {
      expect(ROLLER[r], r).toBeDefined();
      expect(ROLLER[r], r).toContain('utbildning');
      for (const h of ['ordinera', 'skriv_journal', 'kontrasignera', 'skriv_intyg', 'tvangsvard']) expect(ROLLER[r], `${r} ${h}`).not.toContain(h);
      // Barnmorskan har nödåtkomst som sjuksköterskan, till exempel vid en akut förlossning. Ingen annan ny roll har den.
      if (r !== 'barnmorska') expect(ROLLER[r], `${r} nodatkomst`).not.toContain('nodatkomst');
      for (const h of ROLLER[r]) expect(Object.hasOwn(HANDLINGAR, h), `${r} ${h}`).toBe(true);
    }
    // Paramedicinarna är som fysioterapeuten, med hjälpmedel för arbetsterapeuten och logopeden.
    expect([...ROLLER.dietist].sort()).toEqual([...ROLLER.fysioterapeut].sort());
    for (const r of ['arbetsterapeut', 'logoped']) expect([...ROLLER[r]].sort()).toEqual([...ROLLER.fysioterapeut, 'hjalpmedel'].sort());
    // Kuratorn läser varken läkemedel eller mätvärden, psykologen gör det, och båda ser om patienten vårdas med tvång.
    for (const h of ['las_lakemedel', 'las_matvarden', 'registrera_matvarde', 'ge_lakemedel']) expect(ROLLER.kurator).not.toContain(h);
    for (const h of ['las_lakemedel', 'las_matvarden', 'las_tvangsvard']) expect(ROLLER.psykolog).toContain(h);
    expect(ROLLER.kurator).toContain('las_tvangsvard');
    for (const r of NYA.filter(x => x !== 'barnmorska')) expect(ROLLER[r], r).not.toContain('ge_lakemedel');
  });

  test('barnmorskan har allt som sjuksköterskan har utom barnhälsovården, och förskriver preventivmedel men ordinerar inte', () => {
    // Ett senare tillägg hos sjuksköterskan som inte kommer med hos barnmorskan stoppar bygget här.
    for (const h of ROLLER.sjukskoterska) if (!BARNMORSKAN_INTE.has(h)) expect(ROLLER.barnmorska, h).toContain(h);
    for (const h of BARNMORSKAN_INTE) expect(ROLLER.barnmorska).not.toContain(h);
    for (const h of ['graviditet', 'las_graviditet', 'rapportera_graviditetsregistret', 'ge_lakemedel', 'forskriva_preventivmedel', 'handleda']) expect(ROLLER.barnmorska).toContain(h);
    expect(ROLLER.barnmorska).not.toContain('ordinera');
    for (const r of Object.keys(ROLLER)) if (r !== 'barnmorska') expect(ROLLER[r], r).not.toContain('forskriva_preventivmedel');
    expect(somYrke('barnmorska')).toBe('sjukskoterska');
    expect(somYrke('lakarstudent')).toBe('lakarstudent');
    expect(somYrke('constructor')).toBe('constructor');
  });

  test('studenterna läser det som yrket behöver, skriver bara under handledning och ger, ordinerar och signerar aldrig intyg', () => {
    for (const r of STUDENTER) {
      expect(ROLLER[r]).toContain('skriv_handledd');
      for (const h of ['ge_lakemedel', 'ordinera', 'ordinera_direktiv', 'registrera_muntlig_ordination', 'delegera', 'skriv_omvardnad', 'skriv_observation', 'registrera_matvarde',
        'andra_enheter', 'samtycke_sparr', 'visa_identitet', 'nodatkomst', 'handleda', 'begara_kontrasignering', 'skriv_ut', 'utlamna', 'forskriva_preventivmedel', 'graviditet']) {
        expect(ROLLER[r], `${r} ${h}`).not.toContain(h);
      }
    }
    expect(ROLLER.barnmorskestudent).toContain('las_graviditet');
    expect(ROLLER.lakarstudent).not.toContain('las_graviditet');
    for (const r of Object.keys(ROLLER)) if (!STUDENTER.includes(r)) expect(ROLLER[r], r).not.toContain('skriv_handledd');
  });

  test('skötaren på psykiatrin är undersköterska med titeln skötare och har inget mer än undersköterskan', () => {
    const db = byggSeed();
    const sk = personal(db, 'sk-psyk');
    expect(sk).toMatchObject({ yrke: 'underskoterska', titel: 'Skötare', enhet_id: 'uso-psyk' });
    expect(ROLLER.skotare).toBeUndefined();
    // Skötaren ser tvångsvården och omvårdnaden på psykiatrin men inte läkarnas anteckningar.
    expect(kanRoll(sk, 'las_tvangsvard')).toBe(true);
    expect(kanRoll(sk, 'las_journal')).toBe(false);
  });
});

describe('Runda 16, r3: legitimationen vid inloggning genom en extern tjänst', () => {
  test('varje legitimerad roll kräver koden ur Ineras kodverk, och barnmorskan kräver BM', () => {
    expect(LEGITIMATION).toBe(LEGITIMATION_FOR_ROLL);
    expect(LEGITIMATION).toMatchObject({ lakare: ['LK'], sjukskoterska: ['SJ'], barnmorska: ['BM'], arbetsterapeut: ['AT'], dietist: ['DT'], logoped: ['LG'], kurator: ['HK'], psykolog: ['PS', 'PT'], fysioterapeut: ['FT', 'SG'] });
    for (const r of [...STUDENTER, 'underskoterska']) expect(LEGITIMATION[r], r).toBeUndefined();
  });

  test('den som saknar legitimationen för yrket får inte rollen, och en sjuksköterskelegitimation ger inte barnmorskans roll', () => {
    const db = byggSeed();
    const prov = (id, legitimation) => {
      const p = personal(db, id);
      const u = require('../src/idp.js').uppdragFor(db, p);
      const k = { vardgivareHsaId: u.healthCareProviderHsaId, utfardare: 'x', id: 't', namn: 'Test' };
      const a = { personHsaId: p.hsa_id, uppdragHsaId: u.commissionHsaId, andamal: u.commissionPurpose, vardenhetHsaId: u.healthCareUnitHsaId, vardgivareHsaId: u.healthCareProviderHsaId, legitimation, tillitsniva: null };
      return fel(() => provaMotMasterdata(db, k, a, { iat: 1 }));
    };
    expect(prov('bm-uso', ['SJ'])?.message).toContain('barnmorska');
    expect(prov('bm-uso', ['BM'])).toBeNull();
    expect(prov('ssk-kard', ['BM'])?.message).toContain('sjuksköterska');
    expect(prov('kur-vc', ['PS'])?.message).toContain('hälso- och sjukvårdskurator');
    expect(prov('kur-vc', ['HK'])).toBeNull();
    expect(prov('psy-psyk', ['PT'])).toBeNull();
    expect(prov('log-lind', ['LO'])?.status).toBe(403);
    expect(prov('log-lind', ['LG'])).toBeNull();
    expect(prov('stud-lak', [])).toBeNull();
  });
});

describe('Runda 16, r3: demopersonalen och sandlådan', () => {
  test('den nya personalen finns på rimliga vårdenheter, går att logga in som, och en ny sandlåda fungerar', async () => {
    const k = klient(app);
    const r = await k.get('/api/demo/personal');
    const ids = r.data.map(x => x.id);
    for (const id of ['at-kkoga', 'diet-lind', 'log-lind', 'kur-vc', 'psy-psyk', 'bm-vc', 'bm-uso', 'stud-lak', 'stud-ssk', 'stud-bm']) expect(ids).toContain(id);
    expect(r.data.find(x => x.id === 'bm-uso')).toMatchObject({ yrke: 'barnmorska', yrkeText: 'Barnmorska' });
    for (const id of ['at-kkoga', 'kur-vc', 'psy-psyk', 'bm-vc', 'stud-ssk']) {
      const s = await k.logga(id);
      expect(s.status).toBe(200);
      expect((await k.get('/api/arbetslista')).status).toBe(200);
    }
    // HSA-id:t för de andra ändras inte av den nya personalen.
    const db = byggSeed();
    expect(personal(db, 'lak-kard').hsa_id).toBe('SE2321000164-VKP001');
    expect(personal(db, 'stud-bm').hsa_id).toBe(`SE2321000164-VKP${String(PERSONAL.findIndex(p => p.id === 'stud-bm') + 1).padStart(3, '0')}`);
  }, 30_000);

  test('en sandlåda från före runda 16 får den nya personalen, barnmorskans roll och handledningarna, en gång', () => {
    const db = byggSeed();
    db.query("DELETE FROM personal WHERE id IN ('kur-vc', 'stud-ssk')").run();
    db.query("UPDATE personal SET yrke = 'sjukskoterska' WHERE id = 'bm-uso'").run();
    db.query('DROP TABLE handledda_anteckningar').run();
    db.query('DROP TABLE handledningar').run();
    require('../src/roller-r16r3.js').sakra(db, NU);
    require('../src/roller-r16r3.js').sakra(db, NU);
    expect(personal(db, 'kur-vc')).toMatchObject({ yrke: 'kurator', demo: 1 });
    expect(personal(db, 'bm-uso').yrke).toBe('barnmorska');
    expect(db.query("SELECT count(*) AS n FROM handledningar WHERE student_id = 'stud-ssk'").get().n).toBe(1);
  });

  test('varje ny roll har minst tre övningar och en analys av behov och risker', () => {
    const { OVNINGAR_V1 } = require('../src/seed/ovningar.js');
    const { ANALYS } = require('../src/behorighetsanalys.js');
    for (const r of [...NYA, ...STUDENTER]) {
      expect(OVNINGAR_V1.filter(o => o.roller.includes(r)).length, r).toBeGreaterThanOrEqual(3);
      expect(ANALYS[r], r).toBeDefined();
    }
  });
});

describe('Runda 16, r3: yrkenas mallar', () => {
  test('psykologen, logopeden och barnmorskan har egna mallar, och varje sökord har en Snomed-kod eller en förklaring', () => {
    const db = byggSeed();
    expect(yrkesmallar.mallarForYrke(db, 'psykolog')).toEqual(['Psykologanteckning']);
    expect(yrkesmallar.mallarForYrke(db, 'logoped')).toEqual(['Logopedanteckning']);
    expect(yrkesmallar.mallarForYrke(db, 'barnmorska')[0]).toBe('Barnmorskeanteckning');
    expect(yrkesmallar.mallarForYrke(db, 'arbetsterapeut')).toEqual(['Arbetsterapianteckning']);
    expect(yrkesmallar.mallarForYrke(db, 'kurator')).toEqual(['Kuratorsanteckning']);
    expect(yrkesmallar.mallarForYrke(db, 'dietist')).toEqual(['Dietistanteckning']);
    for (const m of yrkesmallar.MALLAR) for (const s of m.sokord) expect(Object.hasOwn(SOKORD, s), `${m.typ} ${s}`).toBe(true);
    // Ett yrke skriver inte ett annat yrkes mall.
    const psy = atk(db, 'psy-psyk', 'p04', {}, 'skriv_omvardnad');
    expect(fel(() => journal.skapaAnteckning(psy, { typ: 'Logopedanteckning', sokord: [{ sokord: 'Kommunikation', text: 'x' }] }))?.status).toBe(403);
    expect(fel(() => journal.skapaAnteckning(psy, { typ: 'Daganteckning', sokord: [{ sokord: 'Aktuellt', text: 'x' }] }))?.status).toBe(403);
  });

  test('kuratorns och psykologens anteckningar följer reglerna för vårdenhet och spärr: andra vårdenheter ser dem bara efter ett aktivt val', () => {
    const db = byggSeed();
    const a = journal.skapaAnteckning(atk(db, 'psy-psyk', 'p04', {}, 'skriv_omvardnad'), { typ: 'Psykologanteckning', sokord: [{ sokord: 'Bedömning', text: 'Samtal om sömnen.' }] });
    journal.signera(atk(db, 'psy-psyk', 'p04', {}, 'skriv_omvardnad'), db.query('SELECT * FROM anteckningar WHERE id = ?').get(a.id));
    // Läkaren på psykiatrin ser anteckningen. Elin Sandberg har spärrat psykiatrin, så kardiologen ser den inte ens med
    // ett aktivt val, bara med hennes samtycke.
    const syns = (id, val = {}) => journal.synligaAnteckningar(atk(db, id, 'p04', val, 'las_journal')).some(x => x.id === a.id);
    expect(syns('lak-psyk')).toBe(true);
    expect(syns('lak-kard')).toBe(false);
    expect(syns('lak-kard', { andra_enheter: true })).toBe(false);
    expect(syns('lak-kard', { andra_enheter: true, samtycke_sparr: true })).toBe(true);
    // Kuratorn på vårdcentralen har ingen vårdrelation till en patient som inte finns på vårdcentralen.
    expect(prova(db, { personal: personal(db, 'kur-vc'), patient: 'p04', handling: 'las_journal' }).tillaten).toBe(false);
    expect(prova(db, { personal: personal(db, 'kur-vc'), patient: 'p04', handling: 'las_journal', val: { nodatkomst: true } }).tillaten).toBe(false);
    // Kuratorn läser inte läkemedelslistan för en listad patient.
    expect(prova(db, { personal: personal(db, 'kur-vc'), patient: 'p06', handling: 'las_lakemedel' }).tillaten).toBe(false);
    expect(prova(db, { personal: personal(db, 'kur-vc'), patient: 'p06', handling: 'las_journal' }).tillaten).toBe(true);
  });
});

describe('Runda 16, r3: studenterna under handledning', () => {
  beforeEach(() => stallKlockan(NU));
  afterEach(() => aterstallKlockan());

  test('studenten skriver och signerar under handledning, och anteckningen går till handledaren för kontrasignering', async () => {
    const k = klient(app);
    await k.logga('stud-ssk');
    const o = (await k.get('/api/handledning')).data;
    expect(o).toMatchObject({ roll: 'student', handledning: { handledare: { id: 'ssk-kard', namn: 'Johan Ek' } } });
    const s = sandlada(app, k).db;
    expect(yrkesmallar.mallarForYrke(s, 'sjukskoterskestudent')).toEqual(['Omvårdnadsanteckning']);
    expect((await k.post('/api/patient/p01/anteckningar', { typ: 'Daganteckning', sokord: [{ sokord: 'Aktuellt', text: 'x' }] })).status).toBe(403);
    const ny = await k.post('/api/patient/p01/anteckningar', { typ: 'Omvårdnadsanteckning', sokord: [{ sokord: 'Sömn', text: 'Sov gott i natt.' }] });
    expect(ny.status).toBe(201);
    const sign = await k.post(`/api/anteckning/${ny.data.id}/signera`, {});
    expect(sign.status).toBe(200);
    expect(sign.data.handledning).toMatchObject({ student: { id: 'stud-ssk' }, handledare: { id: 'ssk-kard' }, kontrasignerad: null });
    // Handledaren har anteckningen i inkorgen och kontrasignerar den, fast sjuksköterskan inte har handlingen kontrasignera.
    const h = klient(app);
    await h.logga('ssk-kard');
    const hs = sandlada(app, h);
    hs.db = s;
    const ink = (await h.get('/api/inkorg')).data.kontrasigneringar;
    const b = ink.find(x => x.postId === ny.data.id);
    expect(b).toMatchObject({ tillganglig: true, begardAv: { id: 'stud-ssk' } });
    expect((await h.post(`/api/kontrasignering/${b.id}/kontrasignera`, {})).status).toBe(200);
    const efter = journal.anteckningUt(s, s.query('SELECT * FROM anteckningar WHERE id = ?').get(ny.data.id));
    expect(efter.handledning.kontrasignerad).toBeTruthy();
    // En annan sjuksköterska kan inte kontrasignera en vanlig begäran, bara handledaren den egna studentens.
    expect(kanRoll(personal(s, 'ssk-kard'), 'kontrasignera')).toBe(false);
    // En rättelse går också till handledaren, och den rättade versionen kontrasigneras inte.
    const ny2 = await k.post('/api/patient/p01/anteckningar', { typ: 'Omvårdnadsanteckning', sokord: [{ sokord: 'Sömn', text: 'Sov oroligt.' }] });
    await k.post(`/api/anteckning/${ny2.data.id}/signera`, {});
    const ratt = await k.post(`/api/anteckning/${ny2.data.id}/ratta`, { orsak: 'Fel ord', sokord: [{ sokord: 'Sömn', text: 'Sov gott.' }] });
    expect(ratt.status).toBe(201);
    expect(ratt.data.handledning).toMatchObject({ handledare: { id: 'ssk-kard' }, kontrasignerad: null });
    const ink2 = (await h.get('/api/inkorg')).data.kontrasigneringar;
    const gammal = ink2.find(x => x.postId === ny2.data.id);
    expect((await h.post(`/api/kontrasignering/${gammal.id}/kontrasignera`, {})).status).toBe(400);
    const ny2b = ink2.find(x => x.postId === ratt.data.id);
    expect((await h.post(`/api/kontrasignering/${ny2b.id}/kontrasignera`, {})).status).toBe(200);
  }, 30_000);

  test('studenten ordinerar inte, ger inga läkemedel, registrerar inga mätvärden och använder inte nödåtkomst', async () => {
    const k = klient(app);
    await k.logga('stud-lak');
    expect((await k.post('/api/patient/p01/lakemedel', { lakemedelId: 'VK-NPL-0052', dosering: '1 g x 3', ordinationsorsak: 'Smärta', uppfoljningsdatum: '2026-12-01' })).status).toBe(403);
    expect((await k.post('/api/patient/p01/administreringar', { ordinationId: 1, atgard: 'ge' })).status).toBe(403);
    expect((await k.post('/api/patient/p01/matvarden', { typ: 'puls', varde: '70' })).status).toBe(403);
    const db = sandlada(app, k).db;
    expect(prova(db, { personal: personal(db, 'stud-lak'), patient: 'p02', handling: 'las_journal', val: { nodatkomst: true } }).tillaten).toBe(false);
    // Läkarstudenten skriver läkarnas mallar under handledning.
    const ny = await k.post('/api/patient/p01/anteckningar', { typ: 'Daganteckning', sokord: [{ sokord: 'Aktuellt', text: 'Mår bättre.' }] });
    expect(ny.status).toBe(201);
    expect((await k.post('/api/patient/p01/anteckningar', { typ: 'Epikris', sokord: [{ sokord: 'Förlopp', text: 'x' }] })).status).toBe(403);
  }, 30_000);

  test('åtkomsten följer handledningens tid och handledarens vårdenhet, och stängs när något inte går att avgöra', () => {
    const db = byggSeed(NU);
    const st = personal(db, 'stud-ssk');
    const kan = (nu = NU) => prova(db, { personal: st, patient: 'p01', handling: 'las_omvardnad', nu }).tillaten;
    expect(aktivHandledning(db, st, NU)?.handledare_id).toBe('ssk-kard');
    expect(kan()).toBe(true);
    // Efter handledningens slut.
    const h = db.query("SELECT * FROM handledningar WHERE student_id = 'stud-ssk'").get();
    expect(kan(new Date(`${addDagar(h.till, 1)}T10:00:00Z`))).toBe(false);
    expect(prova(db, { personal: st, patient: null, handling: 'utbildning', nu: new Date(`${addDagar(h.till, 1)}T10:00:00Z`) }).tillaten).toBe(true);
    // Handledaren byter vårdenhet.
    db.query("UPDATE personal SET enhet_id = 'uso-med' WHERE id = 'ssk-kard'").run();
    expect(kan()).toBe(false);
    expect(prova(db, { personal: st, patient: 'p01', handling: 'las_omvardnad', nu: NU }).skal).toBe(require('../src/atkomst.js').UTAN_HANDLEDNING);
    db.query("UPDATE personal SET enhet_id = 'uso-kard-72' WHERE id = 'ssk-kard'").run();
    expect(kan()).toBe(true);
    // Handledaren och studenten flyttas båda till en annan vårdenhet: handledningen gäller inte där.
    db.query("UPDATE personal SET enhet_id = 'uso-med' WHERE id IN ('ssk-kard', 'stud-ssk')").run();
    expect(aktivHandledning(db, personal(db, 'stud-ssk'), NU)).toBeNull();
    db.query("UPDATE personal SET enhet_id = 'uso-kard-72' WHERE id IN ('ssk-kard', 'stud-ssk')").run();
    // Handledaren är inte längre aktiv.
    db.query("UPDATE personal SET aktiv = 0 WHERE id = 'ssk-kard'").run();
    expect(kan()).toBe(false);
    db.query("UPDATE personal SET aktiv = 1 WHERE id = 'ssk-kard'").run();
    // Utan tabellen finns ingen handledning.
    db.query('DROP TABLE handledda_anteckningar').run();
    db.query('DROP TABLE handledningar').run();
    expect(kan()).toBe(false);
  });

  test('handledaren registrerar och avslutar en handledning för en student på sin vårdenhet, och bara rätt yrke handleder', () => {
    const db = byggSeed(NU);
    const ssk = personal(db, 'ssk-kard');
    const h = db.query("SELECT * FROM handledningar WHERE student_id = 'stud-ssk'").get();
    expect(fel(() => handledning.registrera(db, ssk, { studentId: 'stud-ssk' }, NU))?.status).toBe(409);
    handledning.avsluta(db, ssk, h.id, NU);
    expect(prova(db, { personal: personal(db, 'stud-ssk'), patient: 'p01', handling: 'las_omvardnad', nu: NU }).tillaten).toBe(false);
    expect(fel(() => handledning.avsluta(db, ssk, h.id, NU))?.status).toBe(400);
    // En annan persons handledning kan inte avslutas.
    expect(fel(() => handledning.avsluta(db, personal(db, 'lak-kard'), db.query("SELECT id FROM handledningar WHERE student_id = 'stud-lak'").get().id, NU))).toBeNull();
    // En student på en annan vårdenhet, en läkarstudent för en sjuksköterska och en student som inte finns ger fel.
    expect(fel(() => handledning.registrera(db, ssk, { studentId: 'stud-bm' }, NU))?.status).toBe(400);
    expect(fel(() => handledning.registrera(db, ssk, { studentId: 'stud-lak' }, NU))?.status).toBe(400);
    expect(fel(() => handledning.registrera(db, ssk, { studentId: 'constructor' }, NU))?.status).toBe(400);
    expect(fel(() => handledning.registrera(db, ssk, { studentId: 'stud-ssk', till: addDagar(datumAv(NU), 400) }, NU))?.status).toBe(400);
    expect(fel(() => handledning.registrera(db, personal(db, 'usk-kard'), { studentId: 'stud-ssk' }, NU))?.status).toBe(403);
    const ny = handledning.registrera(db, ssk, { studentId: 'stud-ssk' }, NU);
    expect(ny).toMatchObject({ student: { id: 'stud-ssk' }, handledare: { id: 'ssk-kard' }, fran: datumAv(NU), till: addDagar(datumAv(NU), handledning.STANDARD_DAGAR) });
    expect(prova(db, { personal: personal(db, 'stud-ssk'), patient: 'p01', handling: 'las_omvardnad', nu: NU }).tillaten).toBe(true);
    // En avslutad handledning ändras inte.
    expect(fel(() => db.query('UPDATE handledningar SET till = ? WHERE id = ?').run('2030-01-01', h.id))).toBeTruthy();
    // Handledarens översikt har studenten och inga patientuppgifter.
    const o = handledning.oversikt(db, ssk, NU);
    expect(o.studenter.map(x => x.student.id)).toEqual(['stud-ssk']);
    expect(JSON.stringify(o)).not.toMatch(/p0\d|Åkesson|personnummer/);
  });

  test('en student utan pågående handledning ser inga patienter i arbetslistan, sökningen eller inkorgen, men når övningarna och handledningen', async () => {
    const k = klient(app);
    await k.logga('stud-ssk');
    const db = sandlada(app, k).db;
    expect((await k.get('/api/arbetslista')).data.length).toBeGreaterThan(0);
    db.query("UPDATE handledningar SET avslutad = ? WHERE student_id = 'stud-ssk'").run(new Date().toISOString());
    for (const v of ['/api/arbetslista', '/api/sok?q=Gunnar', '/api/inkorg', '/api/patient/p01', '/api/patient/p01/anteckningar']) {
      const r = await k.get(v);
      expect({ v, status: r.status }).toEqual({ v, status: 403 });
      expect(JSON.stringify(r.data)).not.toContain('Åkesson');
    }
    // FHIR stoppas på samma sätt.
    const fh = await k.get('/fhir/Patient/p01');
    expect(fh.status).toBe(403);
    expect(JSON.stringify(fh.data)).not.toContain('Åkesson');
    for (const v of ['/api/session', '/api/handledning', '/api/utbildning', '/api/nyheter']) expect({ v, status: (await k.get(v)).status }).toEqual({ v, status: 200 });
    const s = (await k.get('/api/session')).data;
    expect(s.behorigheter).toEqual(['utbildning']);
    expect(s.handledning).toMatchObject({ student: true, pagar: false });
  }, 30_000);

  test('barnmorskestudenten läser graviditetsjournalen på förlossningen men för den inte', () => {
    const db = byggSeed(NU);
    require('../src/obstetrik-seed.js').seeda(db, NU);
    const st = personal(db, 'stud-bm');
    expect(prova(db, { personal: st, patient: 'obs3', handling: 'las_graviditet', nu: NU }).tillaten).toBe(true);
    expect(prova(db, { personal: st, patient: 'obs3', handling: 'graviditet', nu: NU }).tillaten).toBe(false);
    expect(prova(db, { personal: personal(db, 'bm-uso'), patient: 'obs3', handling: 'graviditet', nu: NU }).tillaten).toBe(true);
  });
});

describe('Runda 16, r3: barnmorskan', () => {
  test('barnmorskan på förlossningen har förlossningens och mödrahälsovårdens sidor som förut, och barnmorskan på vårdcentralen mödrahälsovården', () => {
    const db = byggSeed();
    expect(obstetrik.session(db, personal(db, 'bm-uso'))).toEqual({ mhv: false, forlossning: true });
    expect(obstetrik.session(db, personal(db, 'bm-vc'))).toEqual({ mhv: true, forlossning: false });
    expect(obstetrik.session(db, personal(db, 'stud-bm'))).toBeNull();
  });

  test('barnmorskan förskriver preventivmedel, och systemet fyller i orsak, dosering och uppföljning', async () => {
    const k = klient(app);
    await k.logga('bm-vc');
    const f = (await k.get('/api/patient/p11/preventivmedel')).data;
    expect(f.lakemedel.map(x => x.atc)).toContain('G03AC09');
    expect(f.lakemedel.every(x => preventivmedel.arPreventivmedel(x.atc))).toBe(true);
    const r = await k.post('/api/patient/p11/preventivmedel', { lakemedelId: f.lakemedel[0].id, dosering: '3 tabletter dagligen' });
    expect(r.status).toBe(201);
    expect(r.data.ordination).toMatchObject({ ordinationsorsak: 'Antikonception' });
    const db = sandlada(app, k).db;
    const o = db.query('SELECT * FROM ordinationer WHERE id = ?').get(r.data.ordination.id);
    // Doseringen är systemets för produkten, också när klienten skickar en annan text.
    expect(o).toMatchObject({ ordinerad_av: 'bm-vc', orsak: 'Antikonception', uppfoljning: addDagar(o.start, 365), dosering: f.lakemedel[0].dosering });
    expect(db.query("SELECT handling FROM atkomstlogg WHERE personal_id = 'bm-vc' AND patient_id = 'p11' ORDER BY id DESC LIMIT 1").get().handling).toBe('forskriva_preventivmedel');
  }, 30_000);

  test('barnmorskan förskriver inget annat läkemedel och ordinerar inte, och sjuksköterskan förskriver inte preventivmedel', async () => {
    const k = klient(app);
    await k.logga('bm-vc');
    const ej = await k.post('/api/patient/p11/preventivmedel', { lakemedelId: 'VK-NPL-0001' });
    expect(ej.status).toBe(403);
    expect(ej.data.fel).toContain('inte ett preventivmedel');
    expect((await k.post('/api/patient/p11/lakemedel', { lakemedelId: 'VK-NPL-0050', dosering: '1 tablett dagligen', ordinationsorsak: 'Antikonception', uppfoljningsdatum: '2027-11-01' })).status).toBe(403);
    // Utan vårdrelation.
    expect((await k.post('/api/patient/p02/preventivmedel', { lakemedelId: 'VK-NPL-0050' })).status).toBe(403);
    await k.logga('ssk-vc');
    expect((await k.post('/api/patient/p11/preventivmedel', { lakemedelId: 'VK-NPL-0050' })).status).toBe(403);
  }, 30_000);
});
