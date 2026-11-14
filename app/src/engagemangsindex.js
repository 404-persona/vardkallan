// Runda 15, r2: engagemangsindex som uppdateras av sig självt (Sussa 2.2.1.10 och 2.5.1.2).
//
// Vårdkällan anmäler till engagemangsindex att det finns uppgifter om en patient, så att en aggregerande tjänst hos en
// annan vårdgivare vet att den ska fråga Vårdkällan. Ingen person behöver göra något: varje ändring i de tabeller som
// producenterna läser märker patienten (triggrar i databasen), och systemet räknar fram indexposterna på nytt, jämför
// dem med det som redan är anmält och skickar skillnaden i omgångar med Update 1.0 (riv.itintegration.engagementindex).
//
// Reglerna är Ineras (TKB itintegration:engagementindex 1.0.9 och tjänstedomänernas regler för engagemangsindex):
//   - en post per patient, tjänstedomän och kategori, med källsystemet som logisk adress (systemadressering) och
//     businessObjectInstanceIdentifier och clinicalProcessInterestId satta till NA;
//   - kategorierna är de som Vårdkällan är producent för: voo, dia och upp (healthcond:description), vko
//     (logistics:logistics) och caa-gvh (activityprescription:actoutcome). E-remissens domän använder inte
//     engagemangsindex, så en remiss blir ingen egen post;
//   - posten skapas när den första uppgiften av sitt slag finns och tas bort (deleteFlag) när den sista försvinner;
//   - owner, creationTime och updateTime sätts av indexet och skickas aldrig;
//   - person- eller samordningsnummer; ett lokalt reservnummer anmäls inte, men när journalen får ett nationellt nummer
//     skapas posterna för det (kR4);
//   - högst 1000 poster per anrop (den nationella instansen), inställbart, och omsändning när indexet inte svarar.
//
// Vårdkällans egna regler, som är strängare: en post finns bara när den aggregerande tjänstens systemkonto skulle få
// minst en uppgift av kategorin genom producenten, alltså aldrig för skyddade personuppgifter, spärrade uppgifter eller
// det som systemförvaltningen har undantagit från nationella tjänster. Beräkningen går genom FHIR-API:t med kontot,
// som producenterna, inom en savepoint som rullas tillbaka, så att den inte lämnar några spår. mostRecentContent räknas
// bara på det kontot får se och minskar aldrig, så att en spärr eller makulering inte syns som en ändring bakåt i tiden.
import { iso, installning } from './db.js';
import { datumRiv } from './tjanstekontrakt.js';

export const KATEGORIER = [
  { doman: 'riv:clinicalprocess:healthcond:description', kategori: 'voo', kontrakt: 'GetCareDocumentation', typer: ['Composition'], text: 'journalanteckningar' },
  { doman: 'riv:clinicalprocess:healthcond:description', kategori: 'dia', kontrakt: 'GetDiagnosis', typer: ['Condition'], text: 'diagnoser' },
  { doman: 'riv:clinicalprocess:healthcond:description', kategori: 'upp', kontrakt: 'GetAlertInformation', typer: ['Flag', 'AllergyIntolerance'], text: 'uppmärksamhetsinformation' },
  { doman: 'riv:clinicalprocess:logistics:logistics', kategori: 'vko', kontrakt: 'GetCareContacts', typer: ['Encounter'], text: 'vårdkontakter' },
  { doman: 'riv:clinicalprocess:activityprescription:actoutcome', kategori: 'caa-gvh', kontrakt: 'GetVaccinationHistory', typer: ['Immunization'], text: 'vaccinationer' },
];

// Standardvärden. Systemförvaltaren kan ändra dem i installningar (nycklarna nedan).
export const STANDARD = { posterPerAnrop: 1000, fordrojningSekunder: 60, patienterPerOmgang: 20 };
export const MAX_POSTER_PER_ANROP = 1000;
const NYCKEL = { posterPerAnrop: 'engagemangsindex.poster_per_anrop', fordrojningSekunder: 'engagemangsindex.fordrojning_sekunder', patienterPerOmgang: 'engagemangsindex.patienter_per_omgang' };
export function installningar(db) {
  const tal = (k) => { const r = installning(db, NYCKEL[k]); const v = r == null || r === '' ? NaN : Number(r); return Number.isInteger(v) && v >= 0 ? v : STANDARD[k]; };
  return { posterPerAnrop: Math.min(MAX_POSTER_PER_ANROP, Math.max(1, tal('posterPerAnrop'))), fordrojningSekunder: tal('fordrojningSekunder'), patienterPerOmgang: Math.max(1, tal('patienterPerOmgang')) };
}

// ---------------------------------------------------------------------------------------------------------------
// Tabellerna. ei_poster är det som Vårdkällan har anmält till indexet, och följer patienten vid en sammanslagning.
// ei_markerade är patienter vars poster ska räknas om. ei_omgangar är omgångarna, utan patientuppgifter.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS ei_poster (
  patient_id TEXT NOT NULL, personid TEXT NOT NULL, doman TEXT NOT NULL, kategori TEXT NOT NULL, senast TEXT, skickad TEXT NOT NULL,
  UNIQUE (personid, doman, kategori));
CREATE INDEX IF NOT EXISTS ix_ei_poster_patient ON ei_poster (patient_id);
CREATE TABLE IF NOT EXISTS ei_markerade (id INTEGER PRIMARY KEY, patient_id TEXT NOT NULL, markerad TEXT);
CREATE INDEX IF NOT EXISTS ix_ei_markerade_patient ON ei_markerade (patient_id);
CREATE TABLE IF NOT EXISTS ei_omgangar (id INTEGER PRIMARY KEY, tid TEXT NOT NULL, anrop INTEGER NOT NULL, poster INTEGER NOT NULL, resultat TEXT NOT NULL, fel TEXT);
CREATE TABLE IF NOT EXISTS ei_status (nyckel TEXT PRIMARY KEY, varde TEXT);
`;

// Tabellerna som producenterna läser, och det som avgör vad som får lämnas ut. En ändring i någon av dem märker
// patienten. En sammanslagning flyttar raderna med triggrarna för UPDATE borttagna (identitet.js), och märks i stället
// genom patienten, som får sammanslagen_till.
const TABELLER = ['anteckningar', 'diagnoser', 'uppmarksamhet', 'overkanslighet', 'vardkontakter', 'vardtillfallen', 'vaccinationer', 'sparrar', 'remisser'];
const markera = (uttryck) => `INSERT INTO ei_markerade (patient_id) SELECT ${uttryck} WHERE ${uttryck} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ei_markerade WHERE patient_id = ${uttryck} AND markerad IS NULL);`;
function triggrar(db) {
  const finns = new Set(db.query("SELECT name FROM sqlite_master WHERE type IN ('table', 'trigger')").all().map(r => r.name));
  const ut = [];
  for (const t of TABELLER) {
    if (!finns.has(t)) continue;
    ut.push([`ei_mark_${t}_ny`, `CREATE TRIGGER IF NOT EXISTS ei_mark_${t}_ny AFTER INSERT ON ${t} BEGIN ${markera('NEW.patient_id')} END`]);
    ut.push([`ei_mark_${t}_andrad`, `CREATE TRIGGER IF NOT EXISTS ei_mark_${t}_andrad AFTER UPDATE ON ${t} BEGIN ${markera('OLD.patient_id')} ${markera('NEW.patient_id')} END`]);
    ut.push([`ei_mark_${t}_bort`, `CREATE TRIGGER IF NOT EXISTS ei_mark_${t}_bort AFTER DELETE ON ${t} BEGIN ${markera('OLD.patient_id')} END`]);
  }
  ut.push(['ei_mark_patienter_andrad', `CREATE TRIGGER IF NOT EXISTS ei_mark_patienter_andrad AFTER UPDATE ON patienter BEGIN ${markera('NEW.id')} ${markera('NEW.sammanslagen_till')} END`]);
  ut.push(['ei_mark_patienter_ny', `CREATE TRIGGER IF NOT EXISTS ei_mark_patienter_ny AFTER INSERT ON patienter BEGIN ${markera('NEW.id')} END`]);
  // Ett beslutat undantag från nationella tjänster gäller en anteckning.
  if (finns.has('undantag_begaranden')) {
    ut.push(['ei_mark_undantag', `CREATE TRIGGER IF NOT EXISTS ei_mark_undantag AFTER UPDATE ON undantag_begaranden BEGIN ${markera('(SELECT patient_id FROM anteckningar WHERE id = NEW.anteckning_id)')} END`]);
  }
  return ut.filter(([namn]) => !finns.has(namn));
}

// Säkrar tabellerna och triggrarna. Tabeller som skapas senare får sina triggrar inom en minut.
const sakrad = new WeakMap();
export function sakra(db) {
  const nu = Date.now();
  if (sakrad.has(db) && nu - sakrad.get(db) < 60_000) return;
  db.exec(SCHEMA);
  for (const [, sql] of triggrar(db)) db.exec(sql);
  sakrad.set(db, nu);
}

const status = (db, nyckel, varde) => {
  if (varde === undefined) return db.query('SELECT varde FROM ei_status WHERE nyckel = ?').get(nyckel)?.varde ?? null;
  if (varde === null) db.query('DELETE FROM ei_status WHERE nyckel = ?').run(nyckel);
  else db.query('INSERT INTO ei_status (nyckel, varde) VALUES (?, ?) ON CONFLICT (nyckel) DO UPDATE SET varde = excluded.varde').run(nyckel, String(varde));
};

// Märker patienter för omräkning. Utan lista: alla patienter (grundladdning och avstämning).
export function markeraPatienter(db, patientIds = null) {
  sakra(db);
  const ids = patientIds ?? db.query('SELECT id FROM patienter WHERE sammanslagen_till IS NULL ORDER BY id').all().map(r => r.id);
  const ins = db.query('INSERT INTO ei_markerade (patient_id) SELECT ? WHERE NOT EXISTS (SELECT 1 FROM ei_markerade WHERE patient_id = ? AND markerad IS NULL)');
  db.transaction(() => { for (const id of ids) ins.run(id, id); })();
  return ids.length;
}

// ---------------------------------------------------------------------------------------------------------------
// De poster som ska finnas för patienten: { personid, poster: [{ doman, kategori, senast }] }. personid är null när
// patienten inte ska finnas i indexet alls.
const ID_TYPER = ['personnummer', 'samordningsnummer'];
const tidFor = (r) => r.date ?? r.recordedDate ?? r.period?.start ?? r.occurrenceDateTime ?? r.effectiveDateTime ?? r.performedDateTime ?? r.authoredOn ?? null;
function aggregerandeKonto(db) {
  const k = require('./rivta/konsumenter.js');
  return k.prova(db, { hsaId: k.SJF }, { namn: 'GetCareDocumentation' }).konsument ?? null;
}
export function onskat(db, patientId) {
  const p = db.query('SELECT id, personnummer, id_typ, skyddad, sammanslagen_till FROM patienter WHERE id = ?').get(patientId);
  if (!p || p.sammanslagen_till || p.skyddad || !ID_TYPER.includes(p.id_typ) || !/^\d{12}$/.test(String(p.personnummer ?? ''))) return { personid: null, poster: [] };
  const konto = aggregerandeKonto(db);
  if (!konto) return { personid: null, poster: [] };
  const { fhirResurser } = require('./tjanstekontrakt.js');
  const { Fel } = require('./db.js');
  const extra = `&_konsument=${encodeURIComponent(konto.hsaId)}`;
  const poster = [];
  db.exec('SAVEPOINT ei_berakning');
  try {
    for (const k of KATEGORIER) {
      let res;
      try { res = fhirResurser({ db, personal: konto.personal }, k.kontrakt, p.id, { typer: k.typer, extra }); } catch (e) {
        if (e instanceof Fel && [403, 404].includes(e.status)) continue;
        throw e;
      }
      const tider = res.filter(r => r.status !== 'entered-in-error').map(tidFor).filter(Boolean).map(datumRiv).filter(Boolean);
      if (!res.some(r => r.status !== 'entered-in-error')) continue;
      poster.push({ doman: k.doman, kategori: k.kategori, senast: tider.length ? tider.sort().at(-1).padEnd(14, '0') : null });
    }
  } finally {
    db.exec('ROLLBACK TO ei_berakning');
    db.exec('RELEASE ei_berakning');
  }
  return { personid: String(p.personnummer), poster };
}

// Skillnaden mot det som redan är anmält, som transaktioner i Update. Ger { transaktioner, andringar }.
function skillnad(db, patientId, vg, nu) {
  const { personid, poster } = onskat(db, patientId);
  const anmalda = db.query('SELECT * FROM ei_poster WHERE patient_id = ?').all(patientId);
  const nyckel = (pid, d, k) => `${pid}|${d}|${k}`;
  const finns = new Map(anmalda.map(r => [nyckel(r.personid, r.doman, r.kategori), r]));
  const onskade = new Set();
  const transaktioner = [];
  const andringar = [];
  const post = (pid, doman, kategori, senast) => ({
    registeredResidentIdentification: pid, serviceDomain: doman, categorization: kategori, logicalAddress: vg, businessObjectInstanceIdentifier: 'NA',
    clinicalProcessInterestId: 'NA', ...(senast ? { mostRecentContent: senast } : {}), sourceSystem: vg, dataController: vg,
  });
  for (const x of poster) {
    const n = nyckel(personid, x.doman, x.kategori);
    onskade.add(n);
    const r = finns.get(n);
    const senast = [r?.senast, x.senast].filter(Boolean).sort().at(-1) ?? null;
    if (r && r.senast === senast) continue;
    transaktioner.push({ deleteFlag: false, engagement: post(personid, x.doman, x.kategori, senast) });
    andringar.push({ typ: r ? 'andrad' : 'ny', patientId, personid, doman: x.doman, kategori: x.kategori, senast });
  }
  for (const r of anmalda) {
    if (onskade.has(nyckel(r.personid, r.doman, r.kategori))) continue;
    transaktioner.push({ deleteFlag: true, engagement: post(r.personid, r.doman, r.kategori, null) });
    andringar.push({ typ: 'bort', patientId, personid: r.personid, doman: r.doman, kategori: r.kategori });
  }
  void nu;
  return { transaktioner, andringar };
}

function tillampa(db, andringar, nu) {
  const t = iso(nu);
  for (const a of andringar) {
    if (a.typ === 'bort') db.query('DELETE FROM ei_poster WHERE personid = ? AND doman = ? AND kategori = ?').run(a.personid, a.doman, a.kategori);
    else db.query(`INSERT INTO ei_poster (patient_id, personid, doman, kategori, senast, skickad) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (personid, doman, kategori) DO UPDATE SET patient_id = excluded.patient_id, senast = excluded.senast, skickad = excluded.skickad`).run(a.patientId, a.personid, a.doman, a.kategori, a.senast ?? null, t);
  }
}

// Väntetiden till nästa försök efter ett misslyckat: 1, 2, 4, 8, 16 och sedan 30 minuter.
export const vantetidMs = (forsok) => Math.min(30, 2 ** Math.max(0, forsok - 1)) * 60_000;

// ---------------------------------------------------------------------------------------------------------------
// Skickar det som väntar. tvinga: utan att vänta på fördröjningen eller nästa försök. patientId: bara den patienten.
// Ger { skickade, poster, fel } där fel är en text när indexet inte tog emot omgången.
export function skicka(db, { nu = new Date(), tvinga = false, patientId = null, maxPatienter = null } = {}) {
  sakra(db);
  const inst = installningar(db);
  const t = iso(nu);
  db.query('UPDATE ei_markerade SET markerad = ? WHERE markerad IS NULL').run(t);
  const nasta = status(db, 'nasta_forsok');
  if (!tvinga && nasta && nasta > t) return { skickade: 0, poster: 0, fel: null, vantar: true };
  const grans = new Date(nu.getTime() - inst.fordrojningSekunder * 1000).toISOString();
  const urval = patientId
    ? db.query('SELECT patient_id, min(id) AS forsta FROM ei_markerade WHERE patient_id = ? GROUP BY patient_id').all(patientId)
    : tvinga ? db.query('SELECT patient_id, min(id) AS forsta FROM ei_markerade GROUP BY patient_id ORDER BY forsta').all()
      : db.query('SELECT patient_id, min(id) AS forsta FROM ei_markerade WHERE markerad <= ? GROUP BY patient_id ORDER BY forsta LIMIT ?').all(grans, Math.min(inst.patienterPerOmgang, maxPatienter ?? Infinity));
  if (patientId && !urval.length) urval.push({ patient_id: patientId });
  if (!urval.length) return { skickade: 0, poster: 0, fel: null };
  const vg = require('./rivta/konsumenter.js').vardgivare(db);
  if (!vg) return { skickade: 0, poster: 0, fel: 'Vårdgivaren saknar HSA-id.' };
  // Markeringarna som räknas med i den här omgången. Nya som kommer under tiden ligger kvar till nästa.
  const maxId = db.query('SELECT max(id) AS m FROM ei_markerade').get().m ?? 0;
  const paket = urval.map(u => ({ patientId: u.patient_id, ...skillnad(db, u.patient_id, vg, nu) }));
  // Anropen: patienternas transaktioner i följd, högst posterPerAnrop i varje anrop, utan att dela en patient.
  const anrop = [];
  let aktuellt = { transaktioner: [], andringar: [], patienter: [] };
  for (const p of paket) {
    if (aktuellt.transaktioner.length && aktuellt.transaktioner.length + p.transaktioner.length > inst.posterPerAnrop) { anrop.push(aktuellt); aktuellt = { transaktioner: [], andringar: [], patienter: [] }; }
    aktuellt.transaktioner.push(...p.transaktioner);
    aktuellt.andringar.push(...p.andringar);
    aktuellt.patienter.push(p.patientId);
  }
  anrop.push(aktuellt);
  const { anropaSynk } = require('./rivta/klient.js');
  const nat = require('./rivta/nationella.js');
  const { EI } = require('./rivta/register.js');
  let skickade = 0;
  let poster = 0;
  let antalAnrop = 0;
  let fel = null;
  for (const a of anrop) {
    if (a.transaktioner.length) {
      try {
        const svar = anropaSynk(EI, { logiskAdress: nat.NATIONELL, begaran: { engagementTransaction: a.transaktioner }, transport: nat.transport(db), db });
        if (svar.ResultCode === 'ERROR') throw Object.assign(new Error(`Engagemangsindex tog inte emot uppdateringen: ${svar.comment ?? 'okänt fel'}`), { kod: 'resultat' });
      } catch (e) {
        if (!e?.kod) throw e;
        fel = e.kod === 'resultat' ? e.message : 'Engagemangsindex svarade inte.';
        break;
      }
      antalAnrop++;
      poster += a.transaktioner.length;
    }
    db.transaction(() => {
      tillampa(db, a.andringar, nu);
      const del = db.query('DELETE FROM ei_markerade WHERE patient_id = ? AND id <= ?');
      for (const pid of a.patienter) del.run(pid, maxId);
    })();
    skickade += a.patienter.length;
  }
  if (poster || fel) db.query('INSERT INTO ei_omgangar (tid, anrop, poster, resultat, fel) VALUES (?, ?, ?, ?, ?)').run(t, antalAnrop, poster, fel ? 'fel' : 'ok', fel);
  db.query('DELETE FROM ei_omgangar WHERE id <= (SELECT max(id) - 50 FROM ei_omgangar)').run();
  if (fel) {
    const forsok = Number(status(db, 'forsok') ?? 0) + 1;
    status(db, 'forsok', forsok);
    if (!status(db, 'fel_sedan')) status(db, 'fel_sedan', t);
    status(db, 'senaste_fel', fel);
    status(db, 'nasta_forsok', new Date(nu.getTime() + vantetidMs(forsok)).toISOString());
  } else {
    for (const k of ['forsok', 'fel_sedan', 'senaste_fel', 'nasta_forsok']) status(db, k, null);
    if (poster) status(db, 'senast_skickad', t);
  }
  return { skickade, poster, fel };
}

// Körs vid varje anrop med en sandlåda och av en timer, och skickar när det är dags. Ett fel stoppar aldrig anropet.
// maxPatienter begränsar hur mycket ett anrop från en användare får räkna, så att svarstiden inte märks.
// avstamning: grundladdningen och den dagliga avstämningen, som bara timern gör, så att ett anrop från en användare
// aldrig räknar om hela indexet.
export function efterTid(db, nu = new Date(), { maxPatienter = null, avstamning = false } = {}) {
  try {
    sakra(db);
    const dag = iso(nu).slice(0, 10);
    if (avstamning && status(db, 'avstamd') !== dag) { markeraPatienter(db); status(db, 'avstamd', dag); }
    return skicka(db, { nu, maxPatienter });
  } catch (e) {
    console.error('Engagemangsindex:', e.message);
    return null;
  }
}

const klockslag = (t) => {
  const d = new Date(t);
  const dag = d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm', day: 'numeric', month: 'long' });
  const kl = d.toLocaleTimeString('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit' }).replace(':', '.');
  return `den ${dag} klockan ${kl}`;
};
// Läget för systemförvaltaren. Inga patientuppgifter: bara antal, tider och resultat.
export function lage(db, nu = new Date()) {
  sakra(db);
  const inst = installningar(db);
  const vantar = db.query('SELECT count(DISTINCT patient_id) AS n FROM ei_markerade').get().n;
  const forsta = db.query('SELECT min(markerad) AS t FROM ei_markerade').get().t;
  const felSedan = status(db, 'fel_sedan');
  // En markering som ingen omgång har sett än har ingen tid, och skickas en fördröjning efter nästa omgång.
  const nasta = status(db, 'nasta_forsok') ?? new Date(Date.parse(forsta ?? iso(nu)) + inst.fordrojningSekunder * 1000).toISOString();
  const omgangar = db.query('SELECT tid, anrop, poster, resultat, fel FROM ei_omgangar ORDER BY id DESC LIMIT 10').all();
  const ejFramme = Boolean(felSedan) && (Number(status(db, 'forsok') ?? 0) >= 3 || nu.getTime() - Date.parse(felSedan) >= 15 * 60_000);
  return {
    vantar, nastaSandning: vantar ? nasta : null, felSedan, senasteFel: status(db, 'senaste_fel'), forsok: Number(status(db, 'forsok') ?? 0), ejFramme,
    senastSkickad: status(db, 'senast_skickad'), avstamd: status(db, 'avstamd'), omgangar, installningar: inst,
    text: felSedan ? `Engagemangsindex har inte tagit emot uppdateringarna sedan ${klockslag(felSedan)}. Systemet försöker igen av sig självt och skickar allt som väntar när indexet svarar.`
      : vantar ? 'Ändringar väntar och skickas i nästa omgång.' : 'Engagemangsindex har allt som ska finnas där.',
  };
}
