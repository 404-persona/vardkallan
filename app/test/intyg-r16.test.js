// Runda 16, r1: alla intyg som finns i Webcert i dag, med giltighet i tid, frågor och svarsalternativ, överföringen
// mellan versioner, vem som får skapa och signera, och hur intyget når mottagaren. Intygsapplikationen är simulerad och
// inget lämnar demon. Testerna skickar in en fast tid där giltigheten prövas.
import { describe, test, expect } from 'bun:test';
import { iso, idag } from '../src/db.js';
import * as intyg from '../src/lakarintyg.js';
import * as app from '../src/intygsapplikation-simulerad.js';
import * as IT from '../src/intygstyper.js';
import { seeda as obstetrik } from '../src/obstetrik-seed.js';
import { atk, personal } from './hjalp.js';
import { nyDbSomStangs } from './r14r3-hjalp.js';

const nyDb = nyDbSomStangs();
const T = 'Intyg r16 > ';
const pat = (db, id) => db.query('SELECT * FROM patienter WHERE id = ?').get(id);
const fel = async (fn) => { try { await fn(); } catch (e) { return e; } return null; };
const diagnos = (db, pid, enhet, kod, text, datum = idag()) => db.query("INSERT INTO diagnoser (patient_id, enhet_id, kod, text, typ, datum) VALUES (?, ?, ?, ?, 'huvud', ?)").run(pid, enhet, kod, text, datum);
const iid = (r) => r.oppna.split('/').pop();
const mojliga = (db, p, nu, personalId = null) => intyg.typerFor(db, p, new Date(nu), personalId ? { personal: personal(db, personalId) } : {}).filter(t => t.mojlig).map(t => t.kod);
const skapa = (db, pers, pid, typ, val = {}) => intyg.skapa(atk(db, pers, pid, val, 'skriv_intyg'), pat(db, pid), { typ });
const DAG = idag();
const SJUKPENNING = { '1': { FYSISKUNDERSOKNING: DAG }, '28': ['NUVARANDE_ARBETE'], '29': 'Lagerarbetare', '35': 'Feber och hosta.', '17': 'Kan inte arbeta fysiskt.', '32': [{ kod: 'HELT_NEDSATT', fran: DAG, till: DAG }], '39': 'STOR_SANNOLIKHET' };

describe('Intygen i Webcert, runda 16', () => {
  test(`${T}TSTRK1007 kan skapas till 31 januari 2025 kl. 13, och TS8071 från 3 februari 2025 kl. 07.30`, () => {
    const db = nyDb();
    const p = pat(db, 'p11');
    expect(mojliga(db, p, '2025-01-31T11:59:00Z')).toContain('TSTRK1007');
    expect(mojliga(db, p, '2025-01-31T12:00:00Z')).not.toContain('TSTRK1007');
    // Mellan bytena går inget av dem att skapa, och systemet säger vad som ersatte det gamla.
    expect(mojliga(db, p, '2025-02-01T10:00:00Z')).not.toContain('TS8071');
    const ersatt = intyg.typerFor(db, p, new Date('2025-02-01T10:00:00Z')).find(t => t.kod === 'TSTRK1007');
    expect(ersatt.mojlig).toBe(false);
    expect(ersatt.skal).toContain('TS 8071');
    expect(ersatt.skal).toContain('Transportstyrelsen');
    expect(mojliga(db, p, '2025-02-03T06:30:00Z')).toContain('TS8071');
    expect(mojliga(db, p, '2025-02-03T06:29:00Z')).not.toContain('TS8071');
  });

  test(`${T}version 2 av FK 7804 och AG7804 gäller från 20 november 2025 kl. 18, och bytet är en ändring av en rad`, () => {
    expect(IT.aktuell('LISJP', new Date('2025-11-20T16:59:00Z')).version).toBe('1.0');
    expect(IT.aktuell('LISJP', new Date('2025-11-20T17:00:00Z')).version).toBe('2.0');
    expect(IT.aktuell('AG7804', new Date('2025-11-20T17:00:00Z')).version).toBe('2.0');
    // Varje kod har högst en rad som gäller vid varje tidpunkt.
    for (const nu of ['2024-06-01T10:00:00Z', '2025-01-31T12:00:00Z', '2025-11-20T17:00:00Z', '2026-11-16T00:00:00Z']) {
      for (const kod of IT.KODER) expect(IT.INTYGSTYPER.filter(t => t.kod === kod && IT.galler(t, new Date(nu))).length).toBeLessThanOrEqual(1);
    }
    // Alla koder är Intygstjänstens koder i kodverket för intygstyper.
    expect(IT.KV_INTYGSTYP).toBe('b64ea353-e8f6-4832-b563-fc7d46f29548');
    for (const kod of ['LISJP', 'AG7804', 'AG1-14', 'LUSE', 'LUAE_NA', 'LUAE_FS', 'LUMEK', 'LU_OMV_MEK', 'LUAS', 'LUNSP', 'IGRAV', 'ITFP', 'LU_TFP_ASB18', 'LU_TFP_B12_16', 'TS8071', 'TSTRK1007', 'TSTRK1031', 'TSTRK1009', 'DB', 'DOI']) expect(IT.KODER).toContain(kod);
  });

  test(`${T}vid förnyelse från version 1 till 2 följer bara svaren på oförändrade frågor, och aldrig det läkaren ska ta ställning till på nytt`, () => {
    const v1 = IT.typFor('LISJP', '1.0');
    const v2 = IT.typFor('LISJP', '2.0');
    const svar = {
      '27': true, '1': { UNDERSOKNING: '2025-11-10' }, '28': ['NUVARANDE_ARBETE'], '29': 'Lagerarbetare', '6': [{ kod: 'M545', text: 'Lumbago' }],
      '35': 'Smärta.', '17': 'Kan inte lyfta.', '19': 'Smärtlindring.', '20': 'Fysioterapi.', '32': [{ kod: 'HALFTEN', fran: '2025-11-10', till: '2025-11-20' }],
      '37': 'Komplikation.', '39': 'STOR_SANNOLIKHET', '40': ['ARBETSTRANING'], '25': 'Övrigt.', '26': true,
    };
    const o = IT.overfor(v1, v2, svar);
    expect(o.foljde.sort()).toEqual(['17', '25', '27', '29', '35', '37', '6'].sort());
    const skal = Object.fromEntries(o.foljdeInte.map(x => [x.fraga, x.skal]));
    // Sjukskrivningens perioder, underlaget, prognosen och kontakten tar läkaren ställning till på nytt.
    for (const id of ['1', '32', '39', '26']) expect(skal[id]).toBe('Du tar ställning till frågan på nytt.');
    // Sysselsättningens alternativ och behandlingsfrågan har ändrats, och åtgärderna med kodverket finns inte i version 2.
    expect(skal['28']).toBe('Frågan har ändrats i den nya versionen.');
    expect(skal['19']).toBe('Frågan har ändrats i den nya versionen.');
    expect(skal['40']).toBe('Frågan finns inte i den nya versionen.');
    expect(o.svar['32']).toBeUndefined();
    // Inom samma version följer allt med utom det som tas ställning till på nytt.
    const samma = IT.overfor(v2, v2, { '28': ['STUDIER'], '32': svar['32'], '39': 'PROGNOS_OKLAR' });
    expect(samma.foljde).toEqual(['28']);
  });

  test(`${T}ett signerat intyg i version 1 förnyas som version 2, och journalen får det nya utkastet med relationen`, async () => {
    const db = nyDb();
    const lak = atk(db, 'lak-vc', 'p14', {}, 'skriv_intyg');
    const lista = intyg.forPatient(lak, pat(db, 'p14'));
    const v1 = lista.intyg.find(i => i.typ === 'LISJP');
    expect(v1.version).toBe('1.0');
    expect(v1.status).toBe('skickat');
    expect(v1.kanFornyas).toBe(true);
    expect(v1.fornyasMed.text).toBe('Förnya med version 2.0');
    const r = await intyg.fornya(lak, pat(db, 'p14'), v1.id);
    expect(r.version).toBe('2.0');
    expect(r.foljde).toEqual(expect.arrayContaining(['6', '29', '35', '17']));
    expect(r.foljde).not.toContain('32');
    expect(r.meddelande).toContain('på nytt');
    const ny = db.query('SELECT * FROM lakarintyg WHERE intygs_id = ?').get(iid(r));
    expect(ny).toMatchObject({ typ: 'LISJP', version: '2.0', status: 'utkast', relation_typ: 'FRLANG', relation_id: v1.id, patient_id: 'p14' });
    const sim = db.query('SELECT * FROM sim_intygsapplikation WHERE intygs_id = ?').get(iid(r));
    expect(JSON.parse(sim.svar)['32']).toBeUndefined();
    expect(JSON.parse(sim.svar)['6'][0].kod).toBe('M545');
  });

  test(`${T}ett ersatt TSTRK1007 läses med rätt namn och status och byts mot TS8071, och ett utkast av det kan inte signeras`, async () => {
    const db = nyDb();
    const lak = atk(db, 'lak-vc', 'p14', {}, 'skriv_intyg');
    const gammal = intyg.forPatient(lak, pat(db, 'p14')).intyg.find(i => i.typ === 'TSTRK1007');
    expect(gammal.text).toBe('Läkarintyg för högre körkortsbehörigheter');
    expect(gammal.statusText).toBe('Signerat och skickat');
    expect(gammal.ersatt).toContain('TS 8071');
    expect(gammal.fornyasMed.text).toBe('Skriv TS 8071 i stället');
    const sim = db.query('SELECT * FROM sim_intygsapplikation WHERE intygs_id = (SELECT intygs_id FROM lakarintyg WHERE id = ?)').get(gammal.id);
    const vy = app.visa(db, personal(db, 'lak-vc'), sim.intygs_id);
    expect(vy.giltighet).toContain('TS 8071');
    expect(vy.kan.fornya).toBe(true);
    const r = await intyg.fornya(lak, pat(db, 'p14'), gammal.id);
    expect(r.typ).toBe('TS8071');
    expect(db.query('SELECT relation_typ FROM lakarintyg WHERE intygs_id = ?').get(iid(r)).relation_typ).toBe('KOPIA');
    // Ett utkast av TSTRK1007 som blev kvar: signeringen stoppas och utkastet byts.
    const utkastId = crypto.randomUUID();
    db.query("INSERT INTO sim_intygsapplikation (intygs_id, patient_id, enhet_id, typ, version, personnummer, personal_hsa, personal_namn, status, skapad, svar, kallor, handelser) VALUES (?, 'p14', 'vc-tybble', 'TSTRK1007', '1.0', ?, ?, 'Per Holm', 'utkast', ?, ?, '{}', '[]')")
      .run(utkastId, pat(db, 'p14').personnummer, personal(db, 'lak-vc').hsa_id, '2025-01-20T10:00:00.000Z', JSON.stringify({ '2': 'IDK3' }));
    db.query("INSERT INTO lakarintyg (patient_id, enhet_id, typ, version, intygs_id, ref, skapad_av, skapad_tid, status, andrad_tid) VALUES ('p14', 'vc-tybble', 'TSTRK1007', '1.0', ?, 'VK-INTYG-TEST-UTKAST', 'lak-vc', ?, 'utkast', ?)").run(utkastId, '2025-01-20T10:00:00.000Z', '2025-01-20T10:00:00.000Z');
    const s = await fel(() => app.atgard(db, personal(db, 'lak-vc'), utkastId, 'signera'));
    expect(s.status).toBe(409);
    expect(s.message).toContain('kan inte signeras längre');
    expect(app.visa(db, personal(db, 'lak-vc'), utkastId).kan.byt).toBe(true);
    const b = await app.atgard(db, personal(db, 'lak-vc'), utkastId, 'byt');
    expect(b.typ).toBe('TS8071');
    expect(b.foljde).toEqual([]);
    expect(db.query('SELECT status FROM sim_intygsapplikation WHERE intygs_id = ?').get(utkastId).status).toBe('raderat');
    expect(db.query('SELECT status FROM lakarintyg WHERE intygs_id = ?').get(utkastId).status).toBe('raderat');
    expect(db.query('SELECT typ FROM lakarintyg WHERE intygs_id = ?').get(b.intygsId).typ).toBe('TS8071');
  });

  test(`${T}vårdadministratören skapar och fyller i ett utkast och markerar det klart för signering, men signerar aldrig`, async () => {
    const db = nyDb();
    diagnos(db, 'p01', 'uso-kard-72', 'I48.9', 'Förmaksflimmer och förmaksfladder, ospecificerat');
    const adm = atk(db, 'adm-kard', 'p01', {}, 'utkast_intyg');
    const u = intyg.forPatient(adm, pat(db, 'p01'));
    expect(u.kanSkriva).toBe(true);
    expect(u.typer.find(t => t.kod === 'LUNSP')).toMatchObject({ mojlig: true, kanSignera: false });
    const r = await intyg.skapa(adm, pat(db, 'p01'), { typ: 'LUNSP' });
    // Vårdadministratören läser inte diagnoser, så ingen diagnos fylls i av det den inte får se.
    expect(r.forifyllt.join()).not.toContain('I48');
    const id = iid(r);
    expect(JSON.parse(db.query('SELECT svar FROM sim_intygsapplikation WHERE intygs_id = ?').get(id).svar)['58']).toBeUndefined();
    const ap = personal(db, 'adm-kard');
    await app.spara(db, ap, id, { svar: { '52': 'ENDAST_PALLIATIV', '52.2': DAG } });
    const s = await fel(() => app.atgard(db, ap, id, 'signera'));
    expect(s.status).toBe(403);
    expect(s.message).toContain('Läkaren signerar');
    expect(app.visa(db, ap, id).kan).toMatchObject({ andra: true, klar: true, signera: false });
    await app.atgard(db, ap, id, 'klar');
    expect(db.query('SELECT status FROM lakarintyg WHERE intygs_id = ?').get(id).status).toBe('klart_for_signering');
    // Läkaren öppnar utkastet från journalen. Inget sparas för att det öppnas; diagnosen står som förslag med källa.
    const lak = atk(db, 'lak-kard', 'p01', {}, 'las_intyg');
    await intyg.oppna(lak, r.intyg.id);
    expect(JSON.parse(db.query('SELECT svar FROM sim_intygsapplikation WHERE intygs_id = ?').get(id).svar)['58']).toBeUndefined();
    const vy = app.visa(db, personal(db, 'lak-kard'), id);
    expect(vy.forslag.svar['58'][0].kod).toBe('I489');
    expect(vy.forslag.kallor['58']).toContain('I48.9');
    expect(vy.kan.signera).toBe(true);
    // Läkaren sparar förslaget, som då får sin källa.
    await app.spara(db, personal(db, 'lak-kard'), id, { svar: { '58': vy.forslag.svar['58'] } });
    const svar = JSON.parse(db.query('SELECT svar FROM sim_intygsapplikation WHERE intygs_id = ?').get(id).svar);
    expect(svar['58'][0].kod).toBe('I489');
    expect(svar['52']).toBe('ENDAST_PALLIATIV');
    expect(app.visa(db, personal(db, 'lak-kard'), id).kallor['58']).toContain('I48.9');
  });

  test(`${T}vårdadministratören ser aldrig diagnoser, läkemedel eller journaltext i ett utkast, inte heller efter att läkaren har öppnat och sparat det`, async () => {
    const db = nyDb();
    diagnos(db, 'p01', 'uso-kard-72', 'I48.9', 'Förmaksflimmer och förmaksfladder, ospecificerat');
    db.query("INSERT INTO anteckningar (patient_id, enhet_id, typ, kategori, sokord, forfattare_id, skapad, status, signerad_tid, signerad_av) VALUES ('p01', 'uso-kard-72', 'Daganteckning', 'lakare', ?, 'lak-kard', ?, 'signerad', ?, 'lak-kard')")
      .run(JSON.stringify({ Status: 'Ödem i båda underbenen till knäna.' }), iso(), iso());
    const lmNamn = db.query("SELECT k.namn FROM ordinationer o JOIN katalog k ON k.id = o.lakemedel_id WHERE o.patient_id = 'p01' AND o.status = 'aktiv' AND o.enhet_id LIKE 'uso-kard%'").all().map(x => x.namn);
    const ap = personal(db, 'adm-kard');
    const lp = personal(db, 'lak-kard');
    const adm = atk(db, 'adm-kard', 'p01', {}, 'utkast_intyg');
    const luas = iid(await intyg.skapa(adm, pat(db, 'p01'), { typ: 'LUAS' }));
    const ts = iid(await intyg.skapa(atk(db, 'adm-kard', 'p01', {}, 'utkast_intyg'), pat(db, 'p01'), { typ: 'TS8071' }));
    await app.spara(db, ap, luas, { svar: { '3': false } });
    // Läkaren öppnar båda och sparar alla förslag.
    for (const id of [luas, ts]) {
      await intyg.oppna(atk(db, 'lak-kard', 'p01', {}, 'las_intyg'), db.query('SELECT id FROM lakarintyg WHERE intygs_id = ?').get(id).id);
      const f = app.visa(db, lp, id).forslag;
      await app.spara(db, lp, id, { svar: f.svar });
      // Det läkaren skrev finns kvar i utkastet.
      expect(Object.keys(JSON.parse(db.query('SELECT svar FROM sim_intygsapplikation WHERE intygs_id = ?').get(id).svar)).length).toBeGreaterThan(1);
    }
    expect(JSON.parse(db.query('SELECT svar FROM sim_intygsapplikation WHERE intygs_id = ?').get(luas).svar)['8']).toContain('Ödem');
    const hemligt = ['I48', 'I489', 'Förmaksflimmer', 'Ödem i båda underbenen', ...lmNamn];
    for (const [id, tomma] of [[luas, { '58': null, '8': null }], [ts, { '21.2': null, '11': null }]]) {
      const text = JSON.stringify(app.visa(db, ap, id));
      for (const h of hemligt) expect(text).not.toContain(h);
      // Vårdadministratörens eget svar syns, och det som är dolt kan personen inte ändra.
      await app.spara(db, ap, id, { svar: tomma });
    }
    expect(app.visa(db, ap, luas).svar['3']).toBe(false);
    expect(JSON.parse(db.query('SELECT svar FROM sim_intygsapplikation WHERE intygs_id = ?').get(luas).svar)['58'][0].kod).toBe('I489');
    expect((await fel(() => app.utskrift(db, ap, luas))).status).toBe(403);
    // Ett utkast som någon annan har skapat når vårdadministratören inte alls.
    const annat = iid(await skapa(db, 'lak-kard', 'p01', 'LUNSP'));
    const a = await fel(() => app.visa(db, ap, annat));
    expect(a.status).toBe(404);
    expect(intyg.forPatient(adm, pat(db, 'p01')).intyg.find(i => i.id === db.query('SELECT id FROM lakarintyg WHERE intygs_id = ?').get(annat).id).kanOppnas).toBe(false);
  });

  test(`${T}ett nytt utkast ur ett intyg prövas med samma regler som när ett utkast skapas`, async () => {
    const db = nyDb();
    // Ett signerat intyg läggs in direkt i journalen och intygsapplikationen, som om det hade skrivits tidigare.
    const signerat = (pid, enhet, lakId, typ, version, svar = {}) => {
      const id = crypto.randomUUID();
      const p = pat(db, pid);
      const l = personal(db, lakId);
      db.query("INSERT INTO sim_intygsapplikation (intygs_id, patient_id, enhet_id, typ, version, personnummer, personal_hsa, personal_namn, status, skapad, signerad, svar, kallor, handelser) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'signerat', ?, ?, ?, '{}', '[]')")
        .run(id, pid, enhet, typ, version, p.personnummer, l.hsa_id, l.namn, '2024-11-20T10:00:00.000Z', '2024-11-20T10:30:00.000Z', JSON.stringify(svar));
      const jid = Number(db.query("INSERT INTO lakarintyg (patient_id, enhet_id, typ, version, intygs_id, ref, skapad_av, skapad_tid, status, signerad_tid, andrad_tid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'signerat', ?, ?)")
        .run(pid, enhet, typ, version, id, `VK-INTYG-TEST-${id}`, lakId, '2024-11-20T10:00:00.000Z', '2024-11-20T10:30:00.000Z', '2024-11-20T10:30:00.000Z').lastInsertRowid);
      return { id, jid };
    };
    const antal = () => db.query('SELECT count(*) AS n FROM lakarintyg').get().n;
    // Skyddade personuppgifter: TS8071, som ersatte TSTRK1007, kan inte skrivas för patienten.
    const s = signerat('p03', 'vc-tybble', 'lak-vc', 'TSTRK1007', '1.0', { '2': 'IDK3' });
    const fore = antal();
    const f1 = await fel(() => app.atgard(db, personal(db, 'lak-vc'), s.id, 'fornya'));
    expect(f1.status).toBe(400);
    expect(f1.message).toContain('skyddade personuppgifter');
    // Ålder: läkarintyget för sjukpenning gäller till 69 år.
    const g = signerat('p01', 'uso-kard', 'lak-kard', 'LISJP', '2.0', { '6': [{ kod: 'I489', text: 'Förmaksflimmer' }] });
    const f2 = await fel(() => app.atgard(db, personal(db, 'lak-kard'), g.id, 'fornya'));
    expect(f2.status).toBe(400);
    expect(f2.message).toContain('mellan 16 och 69 år');
    expect((await fel(() => app.atgard(db, personal(db, 'lak-kard'), g.id, 'arbetsgivare'))).message).toContain('mellan 16 och 69 år');
    // Avliden: ett läkarintyg för sjukpenning förnyas inte för en avliden patient.
    const d = signerat('p11', 'vc-tybble', 'lak-vc', 'LISJP', '2.0');
    db.query("INSERT INTO avlidna (patient_id, datum, registrerad, registrerad_av) VALUES ('p11', ?, ?, 'lak-vc')").run(DAG, iso());
    const f3 = await fel(() => app.atgard(db, personal(db, 'lak-vc'), d.id, 'fornya'));
    expect(f3.message).toContain('avliden');
    expect(antal()).toBe(fore + 2);
    // Skyddade personuppgifter och den som inte signerar: vårdadministratören når inte intyget alls.
    expect((await fel(() => app.atgard(db, personal(db, 'adm-kard'), s.id, 'fornya'))).status).toBe(404);
    // Graviditeten och åldern prövas av samma funktion som listan och utkastet.
    const t = IT.aktuell('IGRAV');
    expect(intyg.provaRegler(db, pat(db, 'p11'), t, personal(db, 'lak-vc'))).toContain('avliden');
    expect(intyg.provaRegler(db, pat(db, 'p14'), t, personal(db, 'lak-vc'))).toContain('graviditet');
    expect(intyg.provaRegler(db, pat(db, 'p14'), t, personal(db, 'adm-kard'))).toContain('ser graviditetsjournalen');
  });

  test(`${T}för en patient med skyddade personuppgifter skapar bara den som signerar intyget, och vårdadministratören når inte utkastet`, async () => {
    const db = nyDb();
    const s = pat(db, 'p03');
    const typer = intyg.typerFor(db, s, DAG, { personal: personal(db, 'adm-kard') });
    expect(typer.filter(t => t.mojlig)).toEqual([]);
    expect(typer.find(t => t.kod === 'LISJP').skal).toContain('den som signerar');
    // Ett utkast på samma vårdenhet för en patient med skyddade personuppgifter ger samma svar som ett som inte finns.
    const id = crypto.randomUUID();
    db.query("INSERT INTO sim_intygsapplikation (intygs_id, patient_id, enhet_id, typ, version, personnummer, personal_hsa, personal_namn, status, skapad, svar, kallor, handelser) VALUES (?, 'p03', 'uso-kard', 'LISJP', '2.0', ?, 'X', 'X', 'utkast', ?, '{}', '{}', '[]')").run(id, s.personnummer, iso());
    const a = await fel(() => app.visa(db, personal(db, 'adm-kard'), id));
    const b = await fel(() => app.visa(db, personal(db, 'adm-kard'), '00000000-0000-0000-0000-000000000000'));
    expect(a.status).toBe(404);
    expect(a.message).toBe(b.message);
  });

  test(`${T}sjuksköterskan på mödrahälsovården skriver och signerar intyg om graviditet, med beräknad förlossning ur graviditetsjournalen`, async () => {
    const db = nyDb();
    obstetrik(db, new Date());
    const ssk = atk(db, 'ssk-vc', 'obs1', {}, 'intyg_graviditet');
    const g = db.query("SELECT bpd FROM graviditeter WHERE patient_id = 'obs1'").get();
    const u = intyg.forPatient(ssk, pat(db, 'obs1'));
    expect(u.kanSkriva).toBe(true);
    expect(u.forslag.kod).toBe('IGRAV');
    expect(u.typer.filter(t => t.mojlig).map(t => t.kod)).toEqual(['IGRAV']);
    const r = await intyg.skapa(ssk, pat(db, 'obs1'), { typ: 'IGRAV' });
    const id = iid(r);
    const vy = app.visa(db, personal(db, 'ssk-vc'), id);
    expect(vy.svar['54']).toBe(g.bpd);
    expect(vy.kallor['54']).toContain('Graviditetsjournalen');
    expect(vy.kan.signera).toBe(true);
    await app.atgard(db, personal(db, 'ssk-vc'), id, 'signera');
    await app.atgard(db, personal(db, 'ssk-vc'), id, 'skicka', {}, { samrad: true });
    expect(db.query('SELECT status FROM lakarintyg WHERE intygs_id = ?').get(id).status).toBe('skickat');
    // Utan graviditet i journalen går intyget inte att skriva, och systemet säger varför.
    const lak = intyg.typerFor(db, pat(db, 'p11'), DAG, { personal: personal(db, 'lak-vc'), atk: atk(db, 'lak-vc', 'p11') }).find(t => t.kod === 'IGRAV');
    expect(lak.mojlig).toBe(false);
    expect(lak.skal).toContain('graviditetsjournalen');
    // Från 16 november 2026 varnar intyget när dagens datum anges som beräknat födelsedatum.
    const t = IT.typFor('IGRAV');
    expect(IT.varningar(t, { '54': '2026-11-16' }, new Date('2026-11-16T10:00:00Z'), '2026-11-16').length).toBe(1);
    expect(IT.varningar(t, { '54': '2026-11-15' }, new Date('2026-11-15T10:00:00Z'), '2026-11-15').length).toBe(0);
  });

  test(`${T}intyg till arbetsgivaren skrivs bara ut, och patienten kan dölja diagnosen på utskriften`, async () => {
    const db = nyDb();
    diagnos(db, 'p11', 'vc-tybble', 'J06.9', 'Akut övre luftvägsinfektion');
    const lak = personal(db, 'lak-vc');
    const r = await skapa(db, 'lak-vc', 'p11', 'AG7804');
    const id = iid(r);
    await app.spara(db, lak, id, { svar: { ...SJUKPENNING, '100': true } });
    await app.atgard(db, lak, id, 'signera');
    const s = await fel(() => app.atgard(db, lak, id, 'skicka', {}, { samrad: true }));
    expect(s.status).toBe(409);
    expect(s.message).toContain('kan inte skickas digitalt');
    expect(app.visa(db, lak, id).kan.skicka).toBe(false);
    const med = app.utskrift(db, lak, id);
    expect(JSON.stringify(med.rader)).toContain('J069');
    const utan = app.utskrift(db, lak, id, { doljDiagnos: true });
    expect(utan.diagnosDold).toBe(true);
    expect(JSON.stringify(utan.rader)).not.toContain('J069');
    // Har patienten sagt nej till att förmedla diagnosen finns den aldrig med.
    const r2 = await skapa(db, 'lak-vc', 'p11', 'AG7804');
    await app.spara(db, lak, iid(r2), { svar: { ...SJUKPENNING, '100': false } });
    await app.atgard(db, lak, iid(r2), 'signera');
    expect(JSON.stringify(app.utskrift(db, lak, iid(r2)).rader)).not.toContain('J069');
  });

  test(`${T}ett läkarintyg till arbetsgivaren skapas ur läkarintyget för sjukpenning med de svar som är desamma`, async () => {
    const db = nyDb();
    diagnos(db, 'p11', 'vc-tybble', 'J06.9', 'Akut övre luftvägsinfektion');
    const lak = personal(db, 'lak-vc');
    const r = await skapa(db, 'lak-vc', 'p11', 'LISJP');
    await app.spara(db, lak, iid(r), { svar: SJUKPENNING });
    await app.atgard(db, lak, iid(r), 'signera');
    expect(app.visa(db, lak, iid(r)).kan.arbetsgivare).toBe(true);
    const ag = await app.atgard(db, lak, iid(r), 'arbetsgivare');
    expect(ag.typ).toBe('AG7804');
    expect(ag.foljde).toEqual(expect.arrayContaining(['6', '28', '29', '35', '17']));
    expect(ag.foljde).not.toContain('32');
    expect(ag.meddelande).toContain('diagnosen');
    const rad = db.query('SELECT * FROM lakarintyg WHERE intygs_id = ?').get(ag.intygsId);
    expect(rad).toMatchObject({ typ: 'AG7804', relation_typ: 'KOPIA', status: 'utkast', patient_id: 'p11' });
    // Frågan om diagnosen till arbetsgivaren är obesvarad, så att patienten själv tar ställning.
    expect(app.visa(db, lak, ag.intygsId).svar['100']).toBeUndefined();
  });

  test(`${T}dödsbeviset skickas när det signeras, och övriga intyg skickas bara i samråd med patienten`, async () => {
    const db = nyDb();
    db.query("INSERT INTO avlidna (patient_id, datum, registrerad, registrerad_av) VALUES ('p10', ?, ?, 'lak-vc')").run(DAG, iso());
    const a = atk(db, 'lak-vc', 'p10', {}, 'skriv_intyg');
    expect(intyg.forslag(a, pat(db, 'p10')).kod).toBe('DB');
    const r = await intyg.skapa(a, pat(db, 'p10'), { typ: 'DB' });
    const lak = personal(db, 'lak-vc');
    expect(app.visa(db, lak, iid(r)).svar['2.2']).toBe(DAG);
    await app.spara(db, lak, iid(r), { svar: { '1': 'IDK4', '2': true, '3': 'Örebro', '4': 'SJUKHUS', '5': false, '6': 'JA', '7': false } });
    await app.atgard(db, lak, iid(r), 'signera');
    expect(db.query('SELECT status FROM lakarintyg WHERE intygs_id = ?').get(iid(r)).status).toBe('skickat');
    expect(intyg.forslag(atk(db, 'lak-vc', 'p10', {}, 'skriv_intyg'), pat(db, 'p10')).kod).toBe('DOI');
    // Ett läkarintyg för sjukpenning skickas inte utan att patienten vill det.
    diagnos(db, 'p11', 'vc-tybble', 'J06.9', 'Akut övre luftvägsinfektion');
    const l = await skapa(db, 'lak-vc', 'p11', 'LISJP');
    await app.spara(db, lak, iid(l), { svar: SJUKPENNING });
    await app.atgard(db, lak, iid(l), 'signera');
    expect((await fel(() => app.atgard(db, lak, iid(l), 'skicka'))).message).toContain('samråd');
    // Läkarens anmälan till Transportstyrelsen är inget intyg i Webcert: den skrivs ut och skickas med post.
    const a1009 = await skapa(db, 'lak-vc', 'p11', 'TSTRK1009');
    await app.spara(db, lak, iid(a1009), { svar: { '2': 'IDK4', '46': 'OLAMPLIGHET', '1': ['B'], '47': 'Demens med nedsatt omdöme.', '48': DAG } });
    await app.atgard(db, lak, iid(a1009), 'signera');
    expect((await fel(() => app.atgard(db, lak, iid(a1009), 'skicka', {}, { samrad: true }))).message).toContain('med post');
    expect(db.query('SELECT status FROM lakarintyg WHERE intygs_id = ?').get(iid(a1009)).status).toBe('signerat');
    expect(app.utskrift(db, lak, iid(a1009)).rader.length).toBeGreaterThan(3);
  });

  test(`${T}systemet föreslår intyget för barnets sjukdom efter ålder och allvar, och körkortsintyget när besöket gäller körkortet`, async () => {
    const db = nyDb();
    const leo = atk(db, 'lak-vc', 'p09', {}, 'skriv_intyg');
    expect(intyg.forslag(leo, pat(db, 'p09')).kod).toBe('ITFP');
    diagnos(db, 'p09', 'vc-tybble', 'C91.0', 'Akut lymfatisk leukemi');
    expect(intyg.forslag(atk(db, 'lak-vc', 'p09', {}, 'skriv_intyg'), pat(db, 'p09')).kod).toBe('LU_TFP_ASB18');
    // Körkortet: kontaktorsaken säger det, och läkemedelsbehandlad diabetes ger diabetesintyget.
    db.query("INSERT INTO vardkontakter (patient_id, enhet_id, typ, start, plats, orsak) VALUES ('p11', 'vc-tybble', 'oppenvard', ?, 'Mottagning', 'Läkarintyg för körkort')").run(iso());
    expect(intyg.forslag(atk(db, 'lak-vc', 'p11', {}, 'skriv_intyg'), pat(db, 'p11')).kod).toBe('TS8071');
    diagnos(db, 'p11', 'vc-tybble', 'E11.9', 'Diabetes mellitus typ 2 utan komplikationer', '2019-03-01');
    db.query("INSERT INTO ordinationer (patient_id, enhet_id, lakemedel_id, dosering, typ, orsak, uppfoljning, start, ordinerad_av, skapad) VALUES ('p11', 'vc-tybble', 'VK-NPL-0023', '10 enheter kl 22', 'staende', 'Diabetes', '2027-01-01', ?, 'lak-vc', ?)").run(DAG, iso());
    const a = atk(db, 'lak-vc', 'p11', {}, 'skriv_intyg');
    expect(intyg.forslag(a, pat(db, 'p11')).kod).toBe('TSTRK1031');
    const f = intyg.forifyllnad(a, IT.aktuell('TSTRK1031'), pat(db, 'p11'));
    expect(f.svar).toMatchObject({ '35': 2019, '18': 'DIABETES_TYP_2', '207': true, '208': true, '209': ['INSULIN'] });
    expect(f.kallor['209']).toContain('A10AE04');
  });

  test(`${T}förifyllnaden räknas bara på det läkaren får se: en diagnos på en spärrad vårdenhet ändrar ingenting`, () => {
    const med = nyDb();
    const utan = nyDb();
    for (const d of [med, utan]) d.query("INSERT INTO sparrar (patient_id, enhet_id, registrerad, aktiv) VALUES ('p11', 'uso-kard', ?, 1)").run(iso());
    diagnos(med, 'p11', 'uso-kard', 'G40.9', 'Epilepsi, ospecificerad');
    const ts = IT.aktuell('TS8071');
    const svar = (db, val) => JSON.stringify({ f: intyg.forifyllnad(atk(db, 'lak-vc', 'p11', val, 'skriv_intyg'), ts, pat(db, 'p11')), s: intyg.forslag(atk(db, 'lak-vc', 'p11', val, 'skriv_intyg'), pat(db, 'p11')) });
    expect(svar(med, { andra_enheter: true })).toBe(svar(utan, { andra_enheter: true }));
    expect(svar(med, {})).toBe(svar(utan, {}));
    // Hela fliken Intyg är densamma, också rutan om dolda intyg från andra vårdenheter.
    const flik = (db, val) => JSON.stringify(intyg.forPatient(atk(db, 'lak-vc', 'p11', val, 'las_intyg'), pat(db, 'p11')));
    expect(flik(med, {})).toBe(flik(utan, {}));
    expect(flik(med, { andra_enheter: true })).toBe(flik(utan, { andra_enheter: true }));
    // En diagnos på en annan vårdenhet utan spärr säger inte att det finns dolda intyg.
    diagnos(utan, 'p11', 'uso-med', 'I48.9', 'Förmaksflimmer');
    expect(intyg.forPatient(atk(utan, 'lak-vc', 'p11', {}, 'las_intyg'), pat(utan, 'p11')).dolda).toBeNull();
    // Med patientens samtycke till den spärrade vårdenheten sparas diagnosen ändå aldrig i utkastet, men den kan visas
    // som förslag med källa och källans vårdenhet.
    const val = { andra_enheter: true, samtycke_sparr: true };
    expect(intyg.forifyllnad(atk(med, 'lak-vc', 'p11', val, 'skriv_intyg'), ts, pat(med, 'p11')).svar['14']).toBeUndefined();
    const s = intyg.forifyllnad(atk(med, 'lak-vc', 'p11', val, 'skriv_intyg'), ts, pat(med, 'p11'), new Date(), { endastEgen: false });
    expect(s.svar['14']).toBe(true);
    expect(s.svar['14.2']).toContain('G40.9');
    expect(s.meta['14'].enheter).toEqual(['uso-kard']);
  });

  test(`${T}en diagnos som läkaren ser genom aktivt val eller samtycke hamnar aldrig i det sparade utkastet, och en annan läsare ser den inte`, async () => {
    const db = nyDb();
    diagnos(db, 'p11', 'uso-med', 'G40.9', 'Epilepsi, ospecificerad');
    db.query("INSERT INTO sparrar (patient_id, enhet_id, registrerad, aktiv) VALUES ('p11', 'uso-kard', ?, 1)").run(iso());
    diagnos(db, 'p11', 'uso-kard', 'G47.3', 'Sömnapné');
    const val = { andra_enheter: true, samtycke_sparr: true };
    const lak = personal(db, 'lak-vc');
    const r = await intyg.skapa(atk(db, 'lak-vc', 'p11', val, 'skriv_intyg'), pat(db, 'p11'), { typ: 'TS8071' });
    const sparat = () => db.query('SELECT svar, kallor FROM sim_intygsapplikation WHERE intygs_id = ?').get(iid(r));
    for (const h of ['G40', 'G47', 'Epilepsi, ospecificerad', 'Sömnapné', 'uso-med', 'uso-kard']) expect(JSON.stringify(sparat())).not.toContain(h);
    // Läkaren ser förslagen med sitt aktiva val och samtycket, och sparar dem själv. De sparas med källornas vårdenheter.
    const f = app.visa(db, lak, iid(r), val).forslag;
    expect(f.svar['14']).toBe(true);
    expect(f.svar['17']).toBe(true);
    await app.spara(db, lak, iid(r), { svar: { '14': true, '14.2': f.svar['14.2'], '17': true, '17.2': f.svar['17.2'] } }, val);
    expect(JSON.parse(sparat().kallor)._meta['14'].enheter).toEqual(['uso-med']);
    expect(app.visa(db, lak, iid(r), val).svar['14.2']).toContain('G40.9');
    // En annan läsare utan aktivt val och samtycke, och läkaren själv utan dem, ser varken svaren eller källorna.
    for (const [p, v] of [[personal(db, 'ssk-vc'), {}], [lak, {}]]) {
      const text = JSON.stringify(app.visa(db, p, iid(r), v));
      for (const h of ['G40', 'G47', 'Epilepsi, ospecificerad', 'Sömnapné', 'uso-med', 'uso-kard']) expect(text).not.toContain(h);
      // Svaret är detsamma som om frågorna inte hade besvarats: inget säger att det finns något dolt.
      expect(JSON.parse(text).dolda).toEqual([]);
      expect(JSON.parse(text).saknas.map(x => x.fraga)).toEqual(expect.arrayContaining(['14', '17']));
    }
    // Med aktivt val men utan samtycke syns diagnosen från den andra vårdenheten, men inte den spärrade.
    const ssk = JSON.stringify(app.visa(db, personal(db, 'ssk-vc'), iid(r), { andra_enheter: true }));
    expect(ssk).toContain('G40.9');
    expect(ssk).not.toContain('G47');
  });

  test(`${T}åldersgränsen för FK 7809 gäller från 16 november 2026 kl. 00.01 och hänvisar till FK 3221 för barn`, () => {
    const db = nyDb();
    const leo = pat(db, 'p09');
    expect(mojliga(db, leo, '2026-11-15T22:00:00Z')).toContain('LUMEK');
    expect(mojliga(db, leo, '2026-11-15T23:01:00Z')).not.toContain('LUMEK');
    expect(intyg.typerFor(db, leo, new Date('2026-11-15T23:01:00Z')).find(t => t.kod === 'LUMEK').skal).toContain('FK 3221');
    expect(mojliga(db, leo, '2026-11-15T23:01:00Z')).toContain('LU_OMV_MEK');
  });

  test(`${T}ett svar som inte passar frågan, eller en fråga som inte finns, ger ett fel på svenska och ändrar ingenting`, async () => {
    const db = nyDb();
    const r = await skapa(db, 'lak-vc', 'p11', 'LISJP');
    const lak = personal(db, 'lak-vc');
    const fore = db.query('SELECT svar FROM sim_intygsapplikation WHERE intygs_id = ?').get(iid(r)).svar;
    for (const svar of [{ '999': 'x' }, { '28': ['HITTEPA'] }, { '32': [{ kod: 'HALFTEN', fran: '2026-11-20', till: '2026-11-10' }] }, { '39.4': 'mycket' }, { '6': [{ kod: 'inte en kod' }] }, { '27': 'ja' }]) {
      const f = await fel(() => app.spara(db, lak, iid(r), { svar }));
      expect(f.status).toBe(400);
    }
    expect(db.query('SELECT svar FROM sim_intygsapplikation WHERE intygs_id = ?').get(iid(r)).svar).toBe(fore);
    // Signeringen säger var något saknas, med rubrikerna i blanketten.
    const s = await fel(() => app.atgard(db, lak, iid(r), 'signera'));
    expect(s.message).toMatch(/^Fyll i det som saknas under .*sysselsättning/);
  });
});
