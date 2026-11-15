// Runda 16, r2: stödet vid sjukskrivning. Sjukfallen räknas ur patientens sjukintyg, Socialstyrelsens
// försäkringsmedicinska beslutsstöd jämförs med den sammanlagda sjukskrivningen, och en sjukskrivning förlängs med ett
// klick.
//
// Varifrån uppgifterna kommer: när läkaren signerar ett Läkarintyg för sjukpenning (FK 7804) i intygsapplikationen
// skickar den statusuppdateringen CertificateStatusUpdateForCare med intygets svar, som en riktig intygsapplikation gör.
// Journalen sparar det som sjukskrivningen bygger på (diagnos, sysselsättning, perioder med sjukskrivningsnivå och
// motiveringen till beslutsstödet) i tabellen sjukskrivningar, och ändrar status när intyget skickas eller makuleras.
// Ett makulerat intyg räknas aldrig.
//
// Sjukfallet följer regeln i Rehabstöd och Webcert (Inera): intyg som följer på varandra med högst 5 dagars uppehåll
// mellan ett intygs slutdatum och nästa intygs startdatum hör till samma sjukfall. Sjukskrivningslängden är antalet dagar
// som har ett intyg; dagar mellan intygen räknas inte. Nuvarande intyg är det som gäller i dag, och när två gäller samtidigt
// det som signerades senast. Uppskattad dag i sjukfallet räknas från sjukfallets första dag.
//
// Rehabiliteringskedjan (socialförsäkringsbalken 27 kap. 46 till 48 §§): systemet visar när patienten närmar sig dag 90,
// 180 och 365 och vad som händer med bedömningen av arbetsförmågan efter gränsen.
//
// Behörigheten är densamma som för intygen: intyg från en annan vårdenhet räknas bara in när läkaren får se dem (aktivt
// val, samtycke till en spärr), och allt som räknas fram, som antal dagar, en summa eller en varning, räknas bara på de
// intyg som syns. Översikten för läkaren och vårdenhetens översikt räknar bara på den egna vårdenheten.
import { randomUUID } from 'node:crypto';
import { Fel, iso, idag, addDagar } from './db.js';
import * as IT from './intygstyper.js';
import { kanRoll, vardenhetFor, prova, visningsnamn, visningsPnr, alder, Atkomst } from './atkomst.js';
import * as beslutsstodUtkast from './intygsapplikation-beslutsstod-simulerad.js';
import { loggaRad } from './logg.js';
import * as lakarintyg from './lakarintyg.js';
import * as fmb from './fmb.js';
import { lasSvar, NIVAER, nivaForGrad, SYSSELSATTNINGAR, perioderUrSimSvar, simSvar } from './sjukfall-intygssvar.js';

// Intygen som räknas till sjukfallet. Intyg till arbetsgivaren räknas inte, som i Rehabstöd.
export const SJUKINTYG = new Set(['LISJP']);
// Högsta antal dagar mellan två intyg i samma sjukfall (grundinställningen i Rehabstöd och regeln i Webcert).
export const DAGAR_MELLAN = 5;
// Så många dagar före en gräns i rehabiliteringskedjan som systemet säger att patienten närmar sig den.
export const NARA_GRANS = 14;

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS sjukskrivningar (
  id INTEGER PRIMARY KEY, patient_id TEXT NOT NULL, enhet_id TEXT NOT NULL, intygs_id TEXT NOT NULL UNIQUE, lakarintyg_id INTEGER,
  typ TEXT NOT NULL, personal_id TEXT, personal_namn TEXT, signerad TEXT NOT NULL, status TEXT NOT NULL,
  diagnos_kod TEXT, diagnos_text TEXT, sysselsattning TEXT, perioder TEXT NOT NULL, fmb_motivering TEXT,
  kalla TEXT NOT NULL, mottagen TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_sjukskrivningar_patient ON sjukskrivningar (patient_id);
CREATE INDEX IF NOT EXISTS ix_sjukskrivningar_enhet ON sjukskrivningar (enhet_id);
CREATE TRIGGER IF NOT EXISTS sjukskrivning_raderas_ej BEFORE DELETE ON sjukskrivningar BEGIN SELECT RAISE(ABORT, 'En sjukskrivning raderas inte'); END;
`;
export const sakra = (db) => db.exec(SCHEMA);

export const KALLOR = {
  statusuppdatering: 'Signerat i intygsapplikationen',
  demo: 'Utfärdat på vårdenheten före demons start (demodata)',
};

// ---------------------------------------------------------------------------------------------------------------
// Uppgifterna ur statusuppdateringen. Anropas av producenten för CertificateStatusUpdateForCare i lakarintyg.js när
// en händelse har tagits emot och prövats.
// ---------------------------------------------------------------------------------------------------------------
export function efterStatus(db, rad, { kod, intyg }) {
  if (!SJUKINTYG.has(rad.typ) || !rad.intygs_id) return;
  sakra(db);
  if (kod === 'SIGNAT') {
    const s = lasSvar(intyg?.svar);
    if (!s.perioder.length) return;
    const hsa = intyg?.skapadAv?.['personal-id']?.extension ?? null;
    const pers = hsa ? db.query('SELECT id, namn FROM personal WHERE hsa_id = ?').get(hsa) : null;
    const signerad = intyg?.signeringstidpunkt ?? iso();
    db.query(`INSERT INTO sjukskrivningar (patient_id, enhet_id, intygs_id, lakarintyg_id, typ, personal_id, personal_namn, signerad, status,
        diagnos_kod, diagnos_text, sysselsattning, perioder, fmb_motivering, kalla, mottagen)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'signerat', ?, ?, ?, ?, ?, 'statusuppdatering', ?)
      ON CONFLICT (intygs_id) DO NOTHING`)
      .run(rad.patient_id, rad.enhet_id, rad.intygs_id, rad.id, rad.typ, pers?.id ?? null, pers?.namn ?? intyg?.skapadAv?.fullstandigtNamn ?? null,
        signerad, s.diagnosKod, s.diagnosText, s.sysselsattning, JSON.stringify(s.perioder), s.motivering, iso());
  } else if (kod === 'SKICKA') {
    db.query("UPDATE sjukskrivningar SET status = 'skickat' WHERE intygs_id = ? AND status = 'signerat'").run(rad.intygs_id);
  } else if (kod === 'MAKULE') {
    db.query("UPDATE sjukskrivningar SET status = 'makulerat' WHERE intygs_id = ?").run(rad.intygs_id);
  }
}
lakarintyg.EFTER_STATUS.push(efterStatus);

// ---------------------------------------------------------------------------------------------------------------
// Demons sjukskrivningar: läkarintyg för sjukpenning som läkaren på vårdcentralen och läkaren på kardiologen har signerat
// före demons start, relativt till i dag, så att översikterna och fliken Sjukskrivning har något att visa och en
// sjukskrivning går att förlänga genom förnyelsen. Intygen läggs in i den simulerade intygsapplikationen och i journalen
// med samma händelser som om de hade skrivits där (som intyg-seed.js), och sjukskrivningen som om statusuppdateringen hade
// kommit. Allt är påhittat och märkt som demodata. Läggs bara in i demons mall (db.js mallen), en gång.
// ---------------------------------------------------------------------------------------------------------------
const DEMO = [
  // Lumbago-ischias som snart når dag 90 och är längre än rekommendationen, med motivering. Intyget går ut om 6 dagar.
  { pid: 'p18', kod: 'M544', text: 'Lumbago-ischias', yrke: 'Lagerarbetare, tunga lyft och truckkörning.',
    funk: 'Smärta i ländryggen med utstrålning i vänster ben och nedsatt rörlighet vid framåtböjning.', akt: 'Kan inte lyfta tunga saker eller sitta längre stunder.',
    intyg: [[-88, -61, 100], [-60, -33, 100], [-32, 6, 50, 'Väntar på bedömning av ryggkirurg. Arbetet innebär tunga lyft som inte går att ordna bort.']] },
  // Utmattningssyndrom hos en patient med skyddade personuppgifter, som snart når dag 180, med trappad grad.
  { pid: 'p03', kod: 'F438', text: 'Utmattningssyndrom', yrke: 'Handläggare på ett försäkringsbolag.',
    funk: 'Nedsatt koncentration, minne och psykisk uthållighet.', akt: 'Klarar inte att arbeta mer än några timmar i taget med uppgifter som kräver koncentration.',
    intyg: [[-170, -111, 100], [-110, -51, 75], [-50, 10, 50]] },
  // Kardiologen: efter hjärtinfarkt och vid kärlkramp, för vårdenhetens översikt.
  { pid: 'p04', kod: 'I214', text: 'Akut subendokardiell hjärtinfarkt', enhet: 'uso-kard', pers: 'lak-kard', yrke: 'Snickare.',
    funk: 'Nedsatt fysisk uthållighet efter hjärtinfarkten.', akt: 'Klarar inte tunga lyft eller fysiskt krävande arbete.', intyg: [[-20, 9, 100]] },
  { pid: 'p05', kod: 'I209', text: 'Angina pectoris, ospecificerad', enhet: 'uso-kard', pers: 'lak-kard', yrke: 'Busschaufför.',
    funk: 'Bröstsmärta vid ansträngning.', akt: 'Klarar inte arbete med fysisk ansträngning.', intyg: [[-12, 2, 100], [3, 16, 50]] },
];
const NIVA_KOD = { 100: 'HELT_NEDSATT', 75: 'TRE_FJARDEDEL', 50: 'HALFTEN', 25: 'EN_FJARDEDEL' };

// kalla anges bara av testerna, som lägger in samma sjukskrivningar vid en fast dag.
export function seedaDemo(db, dag = idag(), { kalla = 'demo' } = {}) {
  sakra(db);
  if (db.query('SELECT count(*) AS n FROM sjukskrivningar WHERE kalla = ?').get(kalla).n) return;
  const harSim = Boolean(db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sim_intygsapplikation'").get());
  const ins = db.query(`INSERT INTO sjukskrivningar (patient_id, enhet_id, intygs_id, lakarintyg_id, typ, personal_id, personal_namn, signerad, status, diagnos_kod, diagnos_text,
    sysselsattning, perioder, fmb_motivering, kalla, mottagen) VALUES (?, ?, ?, ?, 'LISJP', ?, ?, ?, 'skickat', ?, ?, 'nuvarande_arbete', ?, ?, ?, ?)`);
  for (const d of DEMO) {
    const lak = db.query('SELECT id, namn, hsa_id FROM personal WHERE id = ?').get(d.pers ?? 'lak-vc');
    const enhet = db.query('SELECT id FROM enheter WHERE id = ?').get(d.enhet ?? 'vc-tybble');
    const p = db.query('SELECT id, personnummer FROM patienter WHERE id = ?').get(d.pid);
    if (!lak || !enhet || !p) continue;
    d.intyg.forEach(([fran, till, grad, motivering], i) => {
      // Ett intyg som börjar i framtiden har signerats i dag.
      const start = addDagar(dag, fran);
      const slut = addDagar(dag, till);
      const signeradDag = fran > 0 ? dag : start;
      const signerad = `${signeradDag}T09:00:00.000Z`;
      // Intygets id är ett UUID, som intygsapplikationen kräver.
      const intygsId = randomUUID();
      let lakarintygId = null;
      if (harSim && p.personnummer) {
        const version = IT.aktuell('LISJP', new Date(signerad))?.version ?? '2.0';
        const svar = {
          '1': { FYSISKUNDERSOKNING: signeradDag }, '28': ['NUVARANDE_ARBETE'], '29': d.yrke, '6': [{ kod: d.kod, text: d.text }], '35': d.funk, '17': d.akt,
          '32': [{ kod: NIVA_KOD[grad], fran: start, till: slut }], ...(grad < 100 ? { '33': false } : {}), '39': 'STOR_SANNOLIKHET', ...(motivering ? { '37': motivering } : {}),
        };
        const ms = (x) => x.slice(0, 23);
        const handelser = [{ kod: 'SKAPAT', tid: ms(signerad) }, { kod: 'SIGNAT', tid: ms(signerad) }, { kod: 'SKICKA', tid: ms(signerad) }];
        const ref = `VK-INTYG-${kalla.toUpperCase()}-${randomUUID()}`;
        db.query(`INSERT INTO sim_intygsapplikation (intygs_id, patient_id, enhet_id, typ, version, personnummer, personal_hsa, personal_namn, ref, status, skapad, signerad, signerad_av, skickad, svar, kallor, handelser)
          VALUES (?, ?, ?, 'LISJP', ?, ?, ?, ?, ?, 'skickat', ?, ?, ?, ?, ?, '{}', ?)`)
          .run(intygsId, p.id, enhet.id, version, p.personnummer, lak.hsa_id, lak.namn, ref, signerad, signerad, lak.hsa_id, signerad, JSON.stringify(svar), JSON.stringify(handelser));
        lakarintygId = Number(db.query(`INSERT INTO lakarintyg (patient_id, enhet_id, typ, version, intygs_id, ref, skapad_av, skapad_tid, status, signerad_tid, skickad_tid, andrad_tid)
          VALUES (?, ?, 'LISJP', ?, ?, ?, ?, ?, 'skickat', ?, ?, ?)`).run(p.id, enhet.id, version, intygsId, ref, lak.id, signerad, ms(signerad), ms(signerad), signerad).lastInsertRowid);
        for (const h of handelser) db.query("INSERT INTO lakarintyg_handelser (intyg_id, patient_id, enhet_id, kod, tid, mottagen_tid, kalla) VALUES (?, ?, ?, ?, ?, ?, 'seed')").run(lakarintygId, p.id, enhet.id, h.kod, h.tid, h.tid);
      }
      ins.run(d.pid, enhet.id, intygsId, lakarintygId, lak.id, lak.namn, signerad, d.kod, d.text, JSON.stringify([{ fran: start, till: slut, grad }]), motivering ?? null, kalla, iso());
    });
  }
  // De signerade sjukintyg som redan finns i demon (intyg-seed.js) får sin sjukskrivning, som om statusuppdateringen
  // hade kommit med svaren.
  if (kalla === 'demo' && harSim) {
    for (const r of db.query("SELECT s.*, l.id AS lid FROM sim_intygsapplikation s JOIN lakarintyg l ON l.intygs_id = s.intygs_id WHERE s.typ = 'LISJP' AND s.status IN ('signerat', 'skickat')").all()) {
      if (db.query('SELECT 1 FROM sjukskrivningar WHERE intygs_id = ?').get(r.intygs_id)) continue;
      const sv = simSvar(JSON.parse(r.svar || '{}'));
      const perioder = perioderUrSimSvar(JSON.parse(r.svar || '{}'), dag);
      if (!perioder.length) continue;
      const pers = db.query('SELECT id, namn FROM personal WHERE hsa_id = ?').get(r.personal_hsa);
      db.query(`INSERT INTO sjukskrivningar (patient_id, enhet_id, intygs_id, lakarintyg_id, typ, personal_id, personal_namn, signerad, status, diagnos_kod, diagnos_text,
        sysselsattning, perioder, fmb_motivering, kalla, mottagen) VALUES (?, ?, ?, ?, 'LISJP', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'demo', ?)`)
        .run(r.patient_id, r.enhet_id, r.intygs_id, r.lid, pers?.id ?? null, pers?.namn ?? r.personal_namn, r.signerad, r.status, sv.diagnosKod, sv.diagnosText, sv.sysselsattning, JSON.stringify(perioder), sv.motiveringFmb, iso());
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Sjukfallen: rena funktioner över intygen.
// ---------------------------------------------------------------------------------------------------------------
const dagNr = (d) => Math.round(Date.parse(`${d}T12:00:00Z`) / 86_400_000);
export const dagarMellan = (fran, till) => dagNr(till) - dagNr(fran);
export const antalDagar = (fran, till) => dagarMellan(fran, till) + 1;

// Intygets rader ur databasen som intyg för beräkningen.
export function somIntyg(r) {
  const perioder = (() => { try { return JSON.parse(r.perioder); } catch { return []; } })().filter(p => p?.fran && p?.till && p.till >= p.fran);
  return {
    id: r.id, intygsId: r.intygs_id, lakarintygId: r.lakarintyg_id ?? null, enhetId: r.enhet_id, personalId: r.personal_id, personalNamn: r.personal_namn,
    signerad: r.signerad, status: r.status, diagnosKod: r.diagnos_kod, diagnosText: r.diagnos_text, sysselsattning: r.sysselsattning,
    motivering: r.fmb_motivering, kalla: r.kalla, perioder,
    start: perioder.reduce((m, p) => (!m || p.fran < m ? p.fran : m), null),
    slut: perioder.reduce((m, p) => (!m || p.till > m ? p.till : m), null),
  };
}

// Rehabiliteringskedjan. Texterna är Vårdkällans sammanfattning av socialförsäkringsbalken 27 kap. 46 till 48 §§.
export const GRANSER = [
  { dag: 90, text: 'Efter dag 90 bedöms arbetsförmågan mot alla arbeten hos arbetsgivaren, inte bara det vanliga arbetet.' },
  { dag: 180, text: 'Efter dag 180 bedöms arbetsförmågan mot ett arbete som är normalt förekommande på arbetsmarknaden, om det inte finns särskilda skäl eller är oskäligt.' },
  { dag: 365, text: 'Efter dag 365 bedöms arbetsförmågan mot ett arbete som är normalt förekommande på arbetsmarknaden, och undantagen är färre.' },
];
export function rehabkedjan(dagISjukfallet) {
  if (!Number.isFinite(dagISjukfallet) || dagISjukfallet < 1) return null;
  const nasta = GRANSER.find(g => g.dag >= dagISjukfallet) ?? null;
  const passerade = GRANSER.filter(g => g.dag < dagISjukfallet).map(g => g.dag);
  const kvar = nasta ? nasta.dag - dagISjukfallet : null;
  const nara = kvar != null && kvar <= NARA_GRANS;
  let text;
  if (nasta && nara) text = kvar === 0 ? `I dag är dag ${nasta.dag} i rehabiliteringskedjan. ${nasta.text}` : `Dag ${nasta.dag} i rehabiliteringskedjan om ${kvar} ${kvar === 1 ? 'dag' : 'dagar'}. ${nasta.text}`;
  else if (nasta) text = `Nästa gräns i rehabiliteringskedjan är dag ${nasta.dag}, om ${kvar} dagar.`;
  else text = `Sjukfallet har passerat dag 365 i rehabiliteringskedjan. ${GRANSER[2].text}`;
  return { dag: dagISjukfallet, nastaGrans: nasta?.dag ?? null, kvar, nara, passerade, text };
}

// Graden dag för dag: det intyg som gäller dagen och som signerades senast bestämmer graden.
function gradPa(intyg, d) {
  let bast = null;
  for (const i of intyg) {
    for (const p of i.perioder) {
      if (p.fran <= d && d <= p.till && (!bast || i.signerad > bast.intyg.signerad || (i.signerad === bast.intyg.signerad && i.id > bast.intyg.id))) bast = { intyg: i, grad: p.grad };
    }
  }
  return bast;
}

// Bygger sjukfallen ur intygen (somIntyg). dag är dagens datum (ÅÅÅÅ-MM-DD).
export function byggSjukfall(intyg, { dag = idag(), mellan = DAGAR_MELLAN } = {}) {
  const lista = intyg.filter(i => i.status !== 'makulerat' && i.start && i.slut)
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.signerad < b.signerad ? -1 : 1));
  const grupper = [];
  for (const i of lista) {
    const g = grupper.at(-1);
    if (g && dagarMellan(g.slut, i.start) - 1 <= mellan) { g.intyg.push(i); if (i.slut > g.slut) g.slut = i.slut; } else grupper.push({ start: i.start, slut: i.slut, intyg: [i] });
  }
  return grupper.map(g => {
    // Graden över tiden, som sammanhängande avsnitt. Säkerhetsgranskningen: räknas över intervallen mellan periodernas
    // gränser, aldrig dag för dag, så att tiden beror på antalet perioder och inte på hur långa de är.
    const tidslinje = [];
    let dagar = 0;
    const granser = [...new Set(g.intyg.flatMap(i => i.perioder.flatMap(p => [p.fran, addDagar(p.till, 1)])))].sort();
    for (let k = 0; k < granser.length - 1; k++) {
      const fran = granser[k];
      const till = addDagar(granser[k + 1], -1);
      const x = gradPa(g.intyg, fran);
      if (!x) continue;
      dagar += antalDagar(fran, till);
      const sista = tidslinje.at(-1);
      if (sista && sista.grad === x.grad && sista.intygId === x.intyg.id && addDagar(sista.till, 1) === fran) sista.till = till;
      else tidslinje.push({ fran, till, grad: x.grad, intygId: x.intyg.id });
    }
    const idagX = dag >= g.start && dag <= g.slut ? gradPa(g.intyg, dag) : null;
    const senaste = [...g.intyg].sort((a, b) => (a.slut < b.slut ? 1 : a.slut > b.slut ? -1 : a.signerad < b.signerad ? 1 : -1))[0];
    const nuvarande = idagX?.intyg ?? senaste;
    const pagaende = dag >= g.start && dag <= g.slut;
    const uppskattadDag = pagaende ? dagarMellan(g.start, dag) + 1 : null;
    const r = fmb.forDiagnos(nuvarande.diagnosKod);
    const max = r?.rekommenderadMaxDagar ?? null;
    const motivering = [...g.intyg].reverse().find(i => i.motivering)?.motivering ?? null;
    return {
      start: g.start, slut: g.slut, dagar, antalIntyg: g.intyg.length, pagaende, avslutat: g.slut < dag, kommande: g.start > dag,
      uppskattadDag, kvarDagar: pagaende ? dagarMellan(dag, g.slut) : null,
      aktuellGrad: idagX?.grad ?? null,
      grader: nuvarande.perioder.map(p => p.grad),
      diagnos: nuvarande.diagnosKod ? { kod: nuvarande.diagnosKod, text: nuvarande.diagnosText } : null,
      sysselsattning: nuvarande.sysselsattning,
      nuvarandeIntygId: nuvarande.id, senasteIntygId: senaste.id,
      tidslinje,
      rehabkedjan: pagaende ? rehabkedjan(uppskattadDag) : null,
      fmb: max != null ? { maxDagar: max, maxText: r.rekommenderadMaxText, over: dagar > max, motiverat: Boolean(motivering) } : null,
      motivering,
      intyg: g.intyg,
    };
  }).sort((a, b) => (a.start < b.start ? 1 : -1));
}

// Diagnosen med punkt, som i journalen (intygsapplikationen skickar koden utan punkt).
export const medPunkt = (kod) => {
  const k = fmb.normalisera(kod);
  return k.length > 3 ? `${k.slice(0, 3)}.${k.slice(3)}` : k;
};

// Bedömningen mot beslutsstödet för ett intyg som skrivs: den sammanlagda sjukskrivningen med det nya intyget, räknad
// på de tidigare intyg som syns, och rekommendationen för diagnosen. Texten är vanlig svenska.
export function bedom(tidigare, { diagnosKod, perioder, intygsId = null }, { dag = idag() } = {}) {
  const beslutsstod = diagnosKod ? fmb.forDiagnos(diagnosKod) : null;
  const ny = perioder.length ? { id: 0, intygsId: intygsId ?? 'nytt', signerad: '9999', status: 'utkast', diagnosKod, perioder,
    start: perioder.reduce((m, p) => (!m || p.fran < m ? p.fran : m), null), slut: perioder.reduce((m, p) => (!m || p.till > m ? p.till : m), null) } : null;
  const ovriga = tidigare.filter(i => i.intygsId !== intygsId);
  let sjukfall = null;
  if (ny) sjukfall = byggSjukfall([...ovriga, ny], { dag }).find(s => s.intyg.includes(ny)) ?? null;
  const tidigareDagar = sjukfall ? byggSjukfall(sjukfall.intyg.filter(i => i !== ny), { dag }).reduce((n, s) => n + s.dagar, 0) : 0;
  const total = sjukfall?.dagar ?? 0;
  const max = beslutsstod?.rekommenderadMaxDagar ?? null;
  const over = max != null && total > max;
  const motivering = sjukfall ? [...sjukfall.intyg].reverse().find(i => i.motivering)?.motivering ?? null : null;
  let varning = null;
  if (over) {
    varning = `Den sammanlagda sjukskrivningen blir ${total} dagar med det här intyget${tidigareDagar ? ` (${tidigareDagar} dagar i tidigare intyg i sjukfallet)` : ''}. `
      + `Socialstyrelsens försäkringsmedicinska beslutsstöd rekommenderar för ${IT.iMening(beslutsstod.diagnosrubrik)} som längst ${beslutsstod.rekommenderadMaxText} (${max} dagar). `
      + 'Skriv i intyget varför patienten behöver en längre sjukskrivning. Motiveringen följer med i intyget och i förlängningar.';
  }
  return {
    beslutsstod, total, tidigareDagar, over, varning, motivering,
    sjukfallStart: sjukfall?.start ?? null, uppskattadDag: sjukfall ? dagarMellan(sjukfall.start, ny.start) + 1 : null,
    rehabkedjan: sjukfall ? rehabkedjan(dagarMellan(sjukfall.start, ny.slut) + 1) : null,
    // Gränserna i rehabiliteringskedjan som det nya intyget sträcker sig över.
    passerar: sjukfall ? GRANSER.filter(g => dagarMellan(sjukfall.start, ny.start) + 1 <= g.dag && dagarMellan(sjukfall.start, ny.slut) + 1 >= g.dag)
      .map(g => ({ dag: g.dag, text: `Intyget sträcker sig över dag ${g.dag} i rehabiliteringskedjan. ${g.text}` })) : [],
    utanDiagnos: !diagnosKod ? 'Välj en diagnos i intyget, så visar systemet Socialstyrelsens rekommendation för den.' : null,
    utanRekommendation: diagnosKod && !beslutsstod ? 'Socialstyrelsens försäkringsmedicinska beslutsstöd har ingen rekommendation för diagnosen.' : null,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Patientens sjukskrivning i journalen.
// ---------------------------------------------------------------------------------------------------------------
const enhetsnamn = (db, id) => db.query('SELECT namn FROM enheter WHERE id = ?').get(id)?.namn ?? null;

function synligaIntyg(atk) {
  sakra(atk.db);
  const rader = atk.db.query("SELECT * FROM sjukskrivningar WHERE patient_id = ? AND status != 'makulerat' ORDER BY signerad, id").all(atk.patientId);
  return atk.filtrera(rader, 'las_intyg').map(somIntyg);
}

const sysselText = (s) => (Object.hasOwn(SYSSELSATTNINGAR, s ?? '') ? SYSSELSATTNINGAR[s].text : null);
const gradText = (g) => `${g} %`;

function intygUt(db, i, minEnhet) {
  return {
    id: i.id, lakarintygId: i.lakarintygId, vardenhet: enhetsnamn(db, i.enhetId), egenEnhet: vardenhetFor(db, i.enhetId) === minEnhet,
    lakare: i.personalNamn, signerad: i.signerad, status: i.status,
    diagnos: i.diagnosKod ? { kod: medPunkt(i.diagnosKod), text: i.diagnosText } : null,
    sysselsattning: sysselText(i.sysselsattning),
    perioder: i.perioder.map(p => ({ fran: p.fran, till: p.till, grad: p.grad, text: `${p.fran} till ${p.till}, ${gradText(p.grad)}` })),
    motivering: i.motivering, kalla: KALLOR[i.kalla] ?? i.kalla,
  };
}

function sjukfallUt(db, s, minEnhet) {
  return {
    start: s.start, slut: s.slut, dagar: s.dagar, antalIntyg: s.antalIntyg, pagaende: s.pagaende, avslutat: s.avslutat,
    uppskattadDag: s.uppskattadDag, kvarDagar: s.kvarDagar, aktuellGrad: s.aktuellGrad, grader: s.grader,
    diagnos: s.diagnos ? { kod: medPunkt(s.diagnos.kod), text: s.diagnos.text } : null,
    sysselsattning: sysselText(s.sysselsattning),
    tidslinje: s.tidslinje.map(t => ({ fran: t.fran, till: t.till, grad: t.grad, dagar: antalDagar(t.fran, t.till) })),
    rehabkedjan: s.rehabkedjan, fmb: s.fmb, motivering: s.motivering,
    senasteIntygId: s.senasteIntygId,
    intyg: [...s.intyg].sort((a, b) => (a.start < b.start ? 1 : -1)).map(i => intygUt(db, i, minEnhet)),
  };
}

export function forPatient(atk, p, dag = idag()) {
  atk.krav('las_intyg');
  // Sjukskrivningen visar diagnoser och sjukfall och är för vårdpersonal som ser diagnoserna, inte för
  // vårdadministratörens begränsade vy av intygen.
  atk.krav('las_diagnoser');
  const db = atk.db;
  const minEnhet = vardenhetFor(db, atk.personal.enhet_id);
  const sjukfall = byggSjukfall(synligaIntyg(atk), { dag });
  const pagaende = sjukfall.filter(s => s.pagaende || s.kommande);
  const tidigare = sjukfall.filter(s => s.avslutat);
  const aktuellt = pagaende[0] ?? null;
  const senaste = sjukfall[0] ?? null;
  // Förlängning: från det senaste sjukfallet, om det pågår eller tog slut för högst 5 dagar sedan.
  const kanSkriva = kanRoll(atk.personal, 'skriv_intyg');
  const forlangbart = senaste && dagarMellan(senaste.slut, dag) - 1 <= DAGAR_MELLAN ? senaste : null;
  const beslutsstod = aktuellt?.diagnos ? fmb.forDiagnos(aktuellt.diagnos.kod) : null;
  return {
    pagaende: pagaende.map(s => sjukfallUt(db, s, minEnhet)),
    tidigare: tidigare.map(s => sjukfallUt(db, s, minEnhet)),
    beslutsstod,
    forlangning: kanSkriva && forlangbart ? forslagForlangning(forlangbart, dag) : null,
    kanSkriva,
    regel: `Intyg med högst ${DAGAR_MELLAN} dagars uppehåll hör till samma sjukfall. Dagar mellan intygen räknas inte i sjukskrivningslängden.`,
    dolda: atk.doldaVal > 0 ? { kraverVal: true, text: 'Det finns intyg från andra vårdenheter. Gör ett aktivt val för att räkna in dem i sjukfallet.' } : null,
    simulerat: 'Intygen kommer från den simulerade intygsapplikationen och från demodata. Inget skickas till Försäkringskassan.',
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Förlängning: ett klick skapar ett utkast med perioden som börjar dagen efter förra intyget och med det som inte har
// ändrats. Utkastet skapas med CreateDraftCertificate och förifyllnaden i kontraktet, som annars.
// ---------------------------------------------------------------------------------------------------------------
// Vad som följer med när förra intyget förnyas. Vilka svar det är avgör intygstypernas överföring (intygstyper.js overfor):
// svaren på frågor som inte har ändrats följer med, och det läkaren ska bedöma på nytt följer aldrig med.
export const FORLANGNING_TEXT = 'Förra intyget förnyas. Svaren som inte har ändrats följer med, också motiveringen till beslutsstödet. Grad, period, underlag och prognos tar du ställning till på nytt, och systemet föreslår perioden.';

function forslagForlangning(s, dag) {
  const senaste = s.intyg.find(i => i.id === s.senasteIntygId);
  const sista = [...senaste.perioder].sort((a, b) => (a.till < b.till ? 1 : -1))[0];
  // Perioden börjar dagen efter förra intyget, eller i dag om förra intyget redan har gått ut.
  const efter = addDagar(s.slut, 1);
  const fran = efter < dag ? dag : efter;
  const langd = antalDagar(sista.fran, sista.till);
  const till = addDagar(fran, langd - 1);
  return {
    franIntyg: senaste.id, fran, till, grad: sista.grad, dagar: langd,
    text: `Förlängningen börjar ${fran} och föreslås till ${till} (${langd} dagar, ${gradText(sista.grad)}, som förra perioden). Du ändrar perioden i intyget om det behövs.`,
    foljerMed: FORLANGNING_TEXT,
  };
}

export async function forlang(atk, p, body = {}, dag = idag()) {
  atk.krav('skriv_intyg');
  const db = atk.db;
  const sjukfall = byggSjukfall(synligaIntyg(atk), { dag });
  const senaste = sjukfall[0] ?? null;
  if (!senaste) throw new Fel(400, 'Patienten har ingen sjukskrivning att förlänga. Skriv ett nytt sjukintyg från fliken Intyg.', 'ogiltig');
  if (dagarMellan(senaste.slut, dag) - 1 > DAGAR_MELLAN) throw new Fel(400, `Förra sjukintyget gick ut ${senaste.slut}, mer än ${DAGAR_MELLAN} dagar sedan. Då är det ett nytt sjukfall: skriv ett nytt sjukintyg från fliken Intyg.`, 'ogiltig');
  const f = forslagForlangning(senaste, dag);
  const forra = senaste.intyg.find(i => i.id === f.franIntyg);
  // Förlängningen går genom intygens egna vägar, som prövar behörigheten och reglerna (provaRegler): när förra intyget
  // finns i journalen på den egna vårdenheten förnyas det (lakarintyg.fornya), och svaren som får följa med följer med
  // (intygstyper.overfor), också motiveringen i fråga 37. Grad och period tar läkaren ställning till på nytt, med
  // systemets förslag i beslutsstödet. Annars skapas ett nytt sjukintyg med journalens förifyllnad (lakarintyg.skapa).
  const rad = forra.lakarintygId ? db.query("SELECT id, status, enhet_id FROM lakarintyg WHERE id = ? AND patient_id = ? AND typ = 'LISJP'").get(forra.lakarintygId, p.id) : null;
  const egen = rad && vardenhetFor(db, rad.enhet_id) === vardenhetFor(db, atk.personal.enhet_id) && ['signerat', 'skickat'].includes(rad.status);
  const r = egen ? await lakarintyg.fornya(atk, p, rad.id) : await lakarintyg.skapa(atk, p, { typ: 'LISJP' }, dag);
  return {
    oppna: r.oppna, forslag: { fran: f.fran, till: f.till, grad: f.grad, dagar: f.dagar },
    text: `Utkastet till förlängningen är skapat i intygsapplikationen. ${egen ? `${r.meddelande ?? ''} ` : ''}${f.text}`.replace(/\s+/g, ' ').trim(),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Beslutsstödet i intygsapplikationen medan läkaren skriver: intygets diagnos och perioder jämförs med Socialstyrelsens
// rekommendation, med de tidigare intyg som läkaren får se.
// ---------------------------------------------------------------------------------------------------------------
export function forUtkast(atk, utkast, dag = idag()) {
  atk.krav('las_intyg');
  // Beslutsstödet räknar på patientens sjukintyg och diagnoser och visas för den som signerar sjukintyget, inte i
  // vårdadministratörens begränsade vy.
  if (!kanRoll(atk.personal, 'skriv_intyg')) return { sjukintyg: SJUKINTYG.has(utkast.typ), begransad: true };
  const perioder = perioderUrSimSvar(utkast.svar ?? {});
  const sv = simSvar(utkast.svar ?? {});
  const tidigare = synligaIntyg(atk);
  const b = bedom(tidigare, { diagnosKod: sv.diagnosKod, perioder, intygsId: utkast.intygsId }, { dag });
  // Förslaget till perioden när utkastet saknar en: från dagen efter förra intyget i ett sjukfall som pågår eller tog
  // slut för högst 5 dagar sedan, lika lång och med samma nivå som förra perioden. Det visas bara och sparas först när
  // läkaren fyller i det och sparar.
  const senaste = !perioder.length ? byggSjukfall(tidigare.filter(i => i.intygsId !== utkast.intygsId), { dag })[0] ?? null : null;
  const fp = senaste && dagarMellan(senaste.slut, dag) - 1 <= DAGAR_MELLAN ? forslagForlangning(senaste, dag) : null;
  return {
    ...b,
    sjukintyg: SJUKINTYG.has(utkast.typ),
    motiveringIIntyget: sv.motiveringFmb,
    forslagPeriod: fp && SJUKINTYG.has(utkast.typ) && utkast.status === 'utkast' ? { kod: NIVAER[nivaForGrad(fp.grad)].kod, fran: fp.fran, till: fp.till, dagar: fp.dagar, text: `${fp.fran} till ${fp.till}, ${gradText(fp.grad)}, som förra perioden` } : null,
    kanMotivera: utkast.status === 'utkast' && kanRoll(atk.personal, 'skriv_intyg'),
    dolda: atk.doldaVal > 0 ? { kraverVal: true, text: 'Det finns intyg från andra vårdenheter. Gör ett aktivt val i journalen för att räkna in dem.' } : null,
  };
}

// Beslutsstödet för ett utkast genom API:t. Det som står i formuläret men inte är sparat räknas med, bara för bedömningen
// och bara i ett utkast: perioderna i fråga 32 (som JSON, högst fyra), diagnoskoden och om fråga 37 har en motivering.
// Datum och nivå prövas som de sparade svaren, och inget sparas. Läsningen av patientens sjukintyg loggas med den
// starkaste grund som användes, till exempel ett aktivt val för intyg från en annan vårdenhet. Motiveringarnas text
// skickas inte tillbaka, bara att de finns: den står i intyget och i fliken Sjukskrivning.
export function beslutsstodForUtkast(db, personal, intygsId, val = {}, q = new URLSearchParams(), dag = idag()) {
  const u = beslutsstodUtkast.utkastFor(db, personal, intygsId, val);
  if (u.status === 'utkast' || u.status === 'klart_for_signering') {
    const per = q.get('perioder');
    if (typeof per === 'string' && per.length <= 600) {
      try { const l = JSON.parse(per); if (Array.isArray(l)) u.svar['32'] = l.slice(0, 4).filter(x => x && typeof x === 'object').map(x => ({ kod: String(x.kod ?? ''), fran: String(x.fran ?? ''), till: String(x.till ?? '') })); } catch { /* ogiltigt räknas inte */ }
    }
    const d = q.get('diagnos');
    if (typeof d === 'string' && /^[A-Za-z]\d{2}(\.?\w{0,4})$/.test(d)) u.svar['6'] = [{ kod: d.replace('.', '').toUpperCase(), text: null }];
    const m = q.get('motivering');
    if (m === '1' && !simSvar(u.svar).motiveringFmb) u.svar['37'] = 'ifylld';
    if (m === '0') delete u.svar['37'];
  }
  const atk = new Atkomst(db, personal, u.patientId, val, 'las_intyg');
  const svar = forUtkast(atk, u, dag);
  if (!svar.begransad) atk.logga('las_intyg', atk.grund(), `sjukfall:beslutsstod:${u.intygsId}`);
  return { ...svar, motivering: svar.motivering ? true : null, motiveringIIntyget: svar.motiveringIIntyget ? true : null };
}

// ---------------------------------------------------------------------------------------------------------------
// Läkarens översikt: mina pågående sjukfall, där jag har signerat det nuvarande intyget, på min vårdenhet (som i
// Rehabstöd). Varje patient prövas för sig med behörighetsmotorn, och den som inte får ses tas inte med. Varje patient
// som visas loggas.
// ---------------------------------------------------------------------------------------------------------------
export function minaSjukfall(db, personal, val = () => ({}), dag = idag()) {
  if (!kanRoll(personal, 'sjukfall_mina')) throw new Fel(403, 'Översikten över sjukskrivningar är för läkare.', 'nekad');
  sakra(db);
  const minEnhet = vardenhetFor(db, personal.enhet_id);
  const patienter = new Set(db.query("SELECT DISTINCT patient_id FROM sjukskrivningar WHERE personal_id = ? AND status != 'makulerat'").all(personal.id).map(r => r.patient_id));
  const ut = [];
  for (const pid of patienter) {
    const rader = db.query("SELECT * FROM sjukskrivningar WHERE patient_id = ? AND status != 'makulerat'").all(pid).filter(r => vardenhetFor(db, r.enhet_id) === minEnhet);
    if (!rader.length) continue;
    // Behörigheten prövas mot patienten och den egna vårdenheten, varje gång (fail closed).
    const pr = prova(db, { personal, patient: pid, handling: 'las_intyg', resurs: { enhet_id: minEnhet }, val: val(pid) });
    if (!pr.tillaten) continue;
    const s = byggSjukfall(rader.map(somIntyg), { dag }).find(x => x.pagaende);
    if (!s) continue;
    const nuvarande = s.intyg.find(i => i.id === s.nuvarandeIntygId);
    if (nuvarande.personalId !== personal.id) continue;
    const p = db.query('SELECT * FROM patienter WHERE id = ?').get(pid);
    if (!p) continue;
    const visad = Boolean(val(pid).visa_identitet);
    ut.push({
      patientId: pid, namn: visningsnamn(p, visad), personnummer: visningsPnr(p, visad), skyddad: Boolean(p.skyddad), alder: alder(p.fodd, dag),
      diagnos: s.diagnos ? { kod: medPunkt(s.diagnos.kod), text: s.diagnos.text } : null,
      start: s.start, slut: s.slut, dagar: s.dagar, uppskattadDag: s.uppskattadDag, kvarDagar: s.kvarDagar,
      aktuellGrad: s.aktuellGrad, grader: s.grader, antalIntyg: s.antalIntyg,
      rehabkedjan: s.rehabkedjan, fmb: s.fmb,
      gaarUtSnart: s.kvarDagar != null && s.kvarDagar <= 7,
    });
    loggaRad(db, { personal_id: personal.id, enhet_id: personal.enhet_id, patient_id: pid, handling: 'las_intyg', resurs: 'sjukfall:oversikt', grund: pr.grund, resultat: 'tillaten' });
  }
  ut.sort((a, b) => (a.slut < b.slut ? -1 : a.slut > b.slut ? 1 : 0));
  return {
    sjukfall: ut,
    vardenhet: enhetsnamn(db, minEnhet),
    regel: `Sjukfall där du har signerat det nuvarande intyget, på din vårdenhet. Intyg med högst ${DAGAR_MELLAN} dagars uppehåll hör till samma sjukfall.`,
    simulerat: 'Intygen kommer från den simulerade intygsapplikationen och från demodata.',
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Vårdenhetens översikt för verksamhetschefen: antal, utan patientuppgifter. Patienter med skyddade personuppgifter
// räknas inte. Antal mellan 1 och 4 visas som färre än 5, och när bara en ruta i en fördelning skulle döljas döljs också
// den näst minsta (analys.js skydda). Översikten loggas utan patient.
// ---------------------------------------------------------------------------------------------------------------
export const MINSTA = 5;
const KAPITEL = [
  ['A', 'B', 'Infektionssjukdomar'], ['C', 'D', 'Tumörer och blodsjukdomar'], ['E', 'E', 'Endokrina sjukdomar'], ['F', 'F', 'Psykiska sjukdomar och syndrom'],
  ['G', 'G', 'Sjukdomar i nervsystemet'], ['H', 'H', 'Sjukdomar i ögon och öron'], ['I', 'I', 'Cirkulationsorganens sjukdomar'], ['J', 'J', 'Andningsorganens sjukdomar'],
  ['K', 'K', 'Matsmältningsorganens sjukdomar'], ['L', 'L', 'Hudens sjukdomar'], ['M', 'M', 'Sjukdomar i muskler, skelett och bindväv'], ['N', 'N', 'Urin- och könsorganens sjukdomar'],
  ['O', 'O', 'Graviditet och förlossning'], ['R', 'R', 'Symtom och sjukdomstecken'], ['S', 'T', 'Skador och förgiftningar'],
];
export const kapitelFor = (kod) => {
  const b = fmb.normalisera(kod)[0];
  return KAPITEL.find(([fran, till]) => b >= fran && b <= till)?.[2] ?? 'Övriga';
};
const LANGDER = [['Högst 14 dagar', 0, 14], ['15 till 90 dagar', 15, 90], ['91 till 180 dagar', 91, 180], ['181 till 365 dagar', 181, 365], ['Mer än 365 dagar', 366, Infinity]];

// Döljer små antal i en fördelning så att de inte går att räkna fram (säkerhetsgranskningen av runda 16). Antal mellan 1
// och 4 döljs, och sedan döljs fler rutor, minsta först, så länge de dolda rutornas summa (totalen minus de synliga)
// skulle avslöja deras värden: när bara en ruta är dold, eller när summan är lika med antalet dolda rutor (alla är 1).
// Nollor visas, och alla dolda rutor har samma text, så att det inte syns vilka som döljs för att skydda andra.
export function skyddaFordelning(rader, totalt) {
  const ut = rader.map(r => ({ namn: r.namn, varde: r.varde, dolt: r.varde > 0 && r.varde < MINSTA }));
  const avslojar = () => {
    const dolda = ut.filter(r => r.dolt);
    if (!dolda.length) return false;
    const summa = totalt - ut.filter(r => !r.dolt).reduce((n, r) => n + r.varde, 0);
    return dolda.length === 1 || summa === dolda.length;
  };
  while (avslojar()) {
    const nasta = ut.filter(r => !r.dolt && r.varde > 0).sort((a, b) => a.varde - b.varde)[0];
    if (!nasta) break;
    nasta.dolt = true;
  }
  // Går det inte att skydda genom fler dolda rutor döljs hela fördelningen.
  const allt = avslojar();
  return ut.map(r => (r.dolt || (allt && r.varde > 0) ? { namn: r.namn, antal: null, text: 'dolt' } : { namn: r.namn, antal: r.varde, text: String(r.varde) }));
}

export function enhetensSjukfall(db, personal, dag = idag()) {
  if (!kanRoll(personal, 'sjukfall_enhet')) throw new Fel(403, 'Vårdenhetens översikt över sjukskrivningar är för verksamhetschefen.', 'nekad');
  sakra(db);
  const enhet = vardenhetFor(db, personal.enhet_id);
  const rader = db.query(`SELECT s.* FROM sjukskrivningar s JOIN patienter p ON p.id = s.patient_id
    WHERE s.status != 'makulerat' AND coalesce(p.skyddad, 0) = 0`).all().filter(r => vardenhetFor(db, r.enhet_id) === enhet);
  const perPatient = new Map();
  for (const r of rader) { if (!perPatient.has(r.patient_id)) perPatient.set(r.patient_id, []); perPatient.get(r.patient_id).push(somIntyg(r)); }
  const pagaende = [];
  for (const intyg of perPatient.values()) { const s = byggSjukfall(intyg, { dag }).find(x => x.pagaende); if (s) pagaende.push(s); }
  const rakna = (namn, villkor) => ({ namn, varde: pagaende.filter(villkor).length });
  const fordelning = (lista) => skyddaFordelning(lista, totalt);
  const totalt = pagaende.length;
  const ut = {
    vardenhet: enhetsnamn(db, enhet),
    totalt: totalt > 0 && totalt < MINSTA ? null : totalt,
    totaltText: totalt > 0 && totalt < MINSTA ? 'färre än 5' : String(totalt),
    grad: fordelning([100, 75, 50, 25].map(g => rakna(`${g} %`, s => s.aktuellGrad === g))),
    langd: fordelning(LANGDER.map(([n, a, b]) => rakna(n, s => s.dagar >= a && s.dagar <= b))),
    // Alla kapitel visas, också de utan sjukfall, så att listan inte röjer vilka kapitel som förekommer.
    diagnoskapitel: fordelning([...new Set(KAPITEL.map(k => k[2]).concat('Övriga'))].map(k => rakna(k, s => kapitelFor(s.diagnos?.kod) === k))),
    rehabkedjan: fordelning(GRANSER.map(g => rakna(`Närmar sig dag ${g.dag}`, s => s.rehabkedjan?.nara && s.rehabkedjan.nastaGrans === g.dag))),
    overFmb: fordelning([rakna('Längre än beslutsstödets rekommendation', s => s.fmb?.over), rakna('Inom rekommendationen eller utan rekommendation', s => !s.fmb?.over)]),
    regel: 'Pågående sjukfall på vårdenheten i dag. Patienter med skyddade personuppgifter räknas inte. Antal mellan 1 och 4 visas inte, och när de dolda antalen skulle gå att räkna fram ur totalen döljs fler.',
  };
  loggaRad(db, { personal_id: personal.id, enhet_id: personal.enhet_id, patient_id: null, handling: 'sjukfall_enhet', resurs: 'sjukfall:enhet', grund: 'administrativ', resultat: 'tillaten' });
  return ut;
}
