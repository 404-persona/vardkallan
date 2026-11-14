// Beslut 2026-11-14 (runda 15, r3, Sussa 5.4.2.2): statistik, rapporter, datauttaget för uppföljning, kvalitetsregistren
// och infektionsverktyget räknar likadant oavsett om en uppgift ligger i den aktiva journalen eller i mellanarkivet.
// Testnamnen står i src/sussa/runda15-r3.js.
import { describe, test, expect, afterEach } from 'bun:test';
import { personal } from './hjalp.js';
import { nyDbSomStangs } from './r14r3-hjalp.js';
import { stallKlockan, aterstallKlockan } from './falsk-klocka.js';
import * as mellanarkiv from '../src/mellanarkiv.js';
import * as analys from '../src/analys.js';
import * as datauttag from '../src/datauttag.js';
import * as lakemedelsstatistik from '../src/lakemedelsstatistik.js';
import * as myndighetsrapport from '../src/myndighetsrapport.js';
import * as infektion from '../src/rivta-infektion.js';
import * as ekonomi from '../src/ekonomi.js';
import * as lakemedelsuppfoljning from '../src/lakemedelsuppfoljning.js';
import * as utfallsstod from '../src/utfallsstod.js';

const nyDb = nyDbSomStangs();
afterEach(() => aterstallKlockan());
const FORE = '2016-01-01';
const NU = '2026-11-14T10:00:00.000Z';

// En avslutad kontakt 2012 med en tillfällig infektionsdiagnos och en besvarad remiss, och en slutenvårdskontakt 2012.
function gamlaUppgifter(d) {
  const vk = Number(d.query("INSERT INTO vardkontakter (patient_id, enhet_id, typ, start, slut, plats, orsak) VALUES ('p01', 'vc-tybble', 'oppenvard', '2012-02-01T09:00:00.000Z', '2012-02-01T09:30:00.000Z', 'Mottagningen', 'Halsont och feber') RETURNING id").get().id);
  const dia = Number(d.query("INSERT INTO diagnoser (patient_id, enhet_id, vardkontakt_id, kod, text, typ, datum) VALUES ('p01', 'vc-tybble', ?, 'J06.9', 'Akut övre luftvägsinfektion', 'huvud', '2012-02-01') RETURNING id").get(vk).id);
  const rem = Number(d.query(`INSERT INTO remisser (patient_id, fran_enhet_id, till_enhet_id, avsandare_id, fragestallning, anamnes, prioritet, svar_senast, status, skickad_tid, mottagen_tid, bedomd_tid, beslut, besvarad_tid, svar, svar_kvitterat_tid, vardkontakt_id)
    VALUES ('p01', 'vc-tybble', 'uso-kard', 'lak-vc', 'Bedömning av återkommande halsfluss', 'Tre episoder i år.', 'normal', '2012-03-01', 'svar_kvitterat', '2012-02-01T10:00:00.000Z', '2012-02-02T10:00:00.000Z', '2012-02-03T10:00:00.000Z', 'accepterad',
    '2012-02-20T10:00:00.000Z', 'Ingen åtgärd behövs.', '2012-02-21T10:00:00.000Z', ?) RETURNING id`).get(vk).id);
  return { vk, dia, rem };
}
const overfor = (d) => {
  const b = d.query(`INSERT INTO arkivbeslut (typ, beslutsfattare, diarienummer, beslutsdatum, lagrum, omfattning, registrerad, registrerad_av)
    VALUES ('leverans', 'Vårdgivarens arkivansvarige', 'RS 2026-701', '2026-11-14', 'Arkivlagen', ?, '2026-11-14', 'ark') RETURNING id`).get(JSON.stringify({ urval: 'mellanarkiv', ar: 5, fore: FORE })).id;
  return mellanarkiv.overfor(d, personal(d, 'ark'), d.query('SELECT * FROM arkivbeslut WHERE id = ?').get(b)).resultat;
};
const PERIOD = { fran: '2010-01-01', till: '2026-12-31' };

// Allt som räknar på vårdkontakter, diagnoser, ordinationer och mätvärden, vid fasta tider.
function allaResultat(d) {
  const uppf = personal(d, 'uppf');
  stallKlockan(new Date(NU));
  const statistik = {};
  for (const [matt, def] of Object.entries(analys.MATT)) for (const grupp of def.grupper) statistik[`${matt}/${grupp}`] = analys.statistik(d, uppf, { matt, grupp, period: PERIOD });
  const uttag = datauttag.bygg(d, { pseudonymnyckel: 'fast-nyckel-for-testet' });
  // Läkemedelsuppföljningen räknar bakåt från i dag, och rapporterna avser månaderna före, så klockan ställs i perioden.
  stallKlockan(new Date('2012-04-15T10:00:00.000Z'));
  const lakemedel = lakemedelsstatistik.vardgivarniva(d, uppf, { dagar: 365 });
  const rapporter = Object.fromEntries(Object.keys(myndighetsrapport.RAPPORTER).map(id => [id, myndighetsrapport.sammanstall(d, id, { nu: new Date('2012-04-15T10:00:00.000Z') })]));
  // Ekonomins poster för perioden, läkemedelsuppföljningen på vårdenheten och det kunskapsgenererande stödet.
  const poster = ekonomi.transaktioner(d, { vardenhet: 'vc-tybble', fran: '2010-01-01', till: '2016-12-31', nu: Date.parse(NU) });
  stallKlockan(new Date(NU));
  const lakare = personal(d, 'lak-vc');
  const uppfoljning = lakemedelsuppfoljning.patientgrupp(d, lakare);
  const stod = utfallsstod.substans(d, lakare, 'N02BE01', Date.parse('2012-06-01T10:00:00.000Z'));
  return { statistik, uttag, lakemedel, rapporter, poster, uppfoljning, stod };
}

describe('Statistik och rapporter med mellanarkivet', () => {
  test('statistiken, analysen, datauttaget för uppföljning, läkemedelsuppföljningen och rapporterna till register ger samma resultat före och efter en överföring', () => {
    const d = nyDb();
    const { vk, dia, rem } = gamlaUppgifter(d);
    const fore = JSON.stringify(allaResultat(d));
    stallKlockan(new Date(NU));
    const r = overfor(d);
    expect(r.vardkontakter).toBeGreaterThan(0);
    expect(r.diagnoser).toBeGreaterThan(0);
    expect(r.remisser).toBeGreaterThan(0);
    for (const [t, id] of [['vardkontakter', vk], ['diagnoser', dia], ['remisser', rem]]) expect(d.query(`SELECT 1 FROM ${t} WHERE id = ?`).get(id)).toBeNull();
    const efter = JSON.stringify(allaResultat(d));
    expect(efter).toBe(fore);
    // Kontrollen: utan mellanarkivet hade resultatet blivit ett annat, så jämförelsen prövar något.
    expect(fore).toContain('J06');
    const utan = d.query("SELECT count(*) AS n FROM diagnoser WHERE kod = 'J06.9' AND datum = '2012-02-01'").get().n;
    expect(utan).toBe(0);
    expect(d.query(`SELECT count(*) AS n FROM ${mellanarkiv.vy(d, 'diagnoser')} WHERE id = ?`).get(dia).n).toBe(1);
  });

  test('vyn har samma rader och kolumner som tabellen hade, med patientens gällande id, och ordinationerna och doserna i seedens mellanarkiv räknas', () => {
    const d = nyDb();
    const { vk, dia, rem } = gamlaUppgifter(d);
    const rader = (t, id) => d.query(`SELECT * FROM ${mellanarkiv.vy(d, t)} WHERE id = ?`).get(id);
    const fore = { vk: rader('vardkontakter', vk), dia: rader('diagnoser', dia), rem: rader('remisser', rem) };
    stallKlockan(new Date(NU));
    overfor(d);
    expect({ vk: rader('vardkontakter', vk), dia: rader('diagnoser', dia), rem: rader('remisser', rem) }).toEqual(fore);
    // Ordinationen och doserna som seeden för över till mellanarkivet finns i vyerna.
    const seedOrd = d.query("SELECT referens FROM mellanarkiv_handlingar WHERE slag = 'ordination'").all().map(x => Number(x.referens.split('/').pop()));
    expect(seedOrd.length).toBeGreaterThan(0);
    for (const id of seedOrd) expect(rader('ordinationer', id)).toMatchObject({ id, patient_id: expect.any(String) });
    const seedAdm = d.query("SELECT count(*) AS n FROM mellanarkiv_handlingar WHERE slag = 'administrering' AND rad IS NOT NULL").get().n;
    expect(seedAdm).toBeGreaterThan(0);
    // Vyn är tillfällig och sparas aldrig i databasen.
    expect(d.query("SELECT 1 FROM sqlite_master WHERE name LIKE 'alla_%'").get()).toBeNull();
  });

  test('en infektionsdiagnos som förs till mellanarkivet tas inte bort ur infektionsverktyget', async () => {
    const d = nyDb();
    const { dia } = gamlaUppgifter(d);
    const forsta = await infektion.overfor(d);
    expect(forsta.tillstand).toBeGreaterThan(0);
    expect(d.query("SELECT 1 FROM infektion_overforingar WHERE slag = 'tillstand' AND kalla_id = ? AND resultat = 'ok'").get(String(dia))).toBeTruthy();
    stallKlockan(new Date(NU));
    overfor(d);
    aterstallKlockan();
    const andra = await infektion.overfor(d);
    expect(andra.borttagna).toBe(0);
    expect(d.query("SELECT 1 FROM infektion_overforingar WHERE slag = 'borttagen' AND kalla_id = ?").get(String(dia))).toBeNull();
  });
});
