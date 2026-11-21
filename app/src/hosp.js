// HOSP: legitimation, förskrivningsrätt och behörighetsbegränsningar ur Socialstyrelsens register över legitimerad
// hälso- och sjukvårdspersonal, med tjänstekontraktet GetHospPersonForPublicHealthCare 1.1
// (riv.masterdata.organisationalresources.licensetopractice, namnrymd urn:riv:infrastructure:directory:licensetopractice).
// Vårdkällan är konsument. Tjänsten är simulerad i demon (registreras här på de simulerade nationella tjänsterna) och
// svarar med påhittade uppgifter. Grunden är densamma som för de andra kontrakten: begäran och svaret valideras mot det
// pinnade schemat (klient.js), anropet loggas i rivta_anrop utan personuppgifter, och tjänsten har samma kuvert och fel
// som en riktig producent.
//
// Systemet är experten: ingen behöver slå upp något i registret själv.
//   - När systemförvaltningen ger någon en roll som kräver legitimation (personalkatalogen i masterdata.js) hämtar
//     systemet uppgifterna och säger på vanlig svenska om legitimationen saknas eller är återkallad.
//   - Saknas eller är legitimationen återkallad tar behörighetsmotorn bort rollens handlingar (atkomst.js prova), utom
//     övningarna, och inloggningen stoppas med en förklaring.
//   - Förskrivningsrätten och behörighetsbegränsningarna styr vad förskrivningen erbjuder (forskrivning), i stället för
//     fasta regler per yrke, och förklarar varför något inte går. Alla förskrivningsflöden anropar samma funktion.
//
// Regeln för hämtningen (REGEL): uppgifterna hämtas när någon får en roll som kräver legitimation, vid inloggning, före
// en förskrivning och när systemförvaltaren öppnar listan, om de är äldre än ett dygn, och när systemförvaltaren hämtar
// om dem. Svarar tjänsten inte gäller de senast hämtade uppgifterna, och systemet försöker igen med allt längre mellan
// försöken och högst fem gånger (testspår 2). Har uppgifterna aldrig kunnat hämtas stoppas förskrivningen (en kontroll som inte kan avgöras släpper aldrig igenom), men inloggningen prövas som
// förut mot legitimationen i HSA-katalogen, så att ett avbrott i en nationell tjänst inte stänger ute all personal.
//
// Bara det som behövs sparas (hosp_uppgifter): legitimationerna med förskrivningsrätt, specialistbevis och begränsningar,
// och tiden för hämtningen. Personnumret, namnet och folkbokföringen i svaret sparas inte. Uppgifterna visas bara för
// systemförvaltningen och för personen själv.
import { kontrakt } from './rivta/kontrakt.js';
import { anropaSynk, RivtaFel } from './rivta/klient.js';
import { tjanst, transport, NATIONELL } from './rivta/nationella.js';
import { Fel } from './db.js';
import { LEGITIMATION_FOR_ROLL, LEGITIMATION_ALLA, kanRoll, markeraHospTabell } from './atkomst.js';
import { loggaRad } from './logg.js';
import { YRKEN } from './seed/personal.js';
import { PERSONNUMMER, LEGITIMATIONER, EXTRA, AVVIKELSER } from './seed/hosp.js';

export const HOSP = kontrakt('riv.masterdata.organisationalresources.licensetopractice', 'GetHospPersonForPublicHealthCare', '1.1');
const PNR_OID = '1.2.752.129.2.1.3.1';
export const DYGN_MS = 24 * 3600_000;
const NYTT_FORSOK_MS = 5 * 60_000;
// Testspår 2 (TKB licensetopractice 4.3.2): omsändning bara vid tekniska fel, med ett ökande intervall (5, 10, 20, 40 och
// 80 minuter) och ett begränsat antal försök. Efter det sista försöket, och efter ett svar som inte gick att använda,
// försöker systemet inte igen av sig självt förrän nästa dygn. Systemförvaltaren kan alltid hämta om.
export const MAX_FORSOK = 5;
export const vantetidHosp = (antal) => (antal >= MAX_FORSOK ? DYGN_MS : NYTT_FORSOK_MS * 2 ** Math.max(0, antal - 1));
export const REGEL = 'Uppgifterna ur Socialstyrelsens register (HOSP) hämtas när någon får en roll som kräver legitimation, vid inloggning, före en förskrivning och när systemförvaltaren öppnar listan, om de är äldre än ett dygn, och när systemförvaltaren hämtar om dem. Svarar tjänsten inte gäller de senast hämtade uppgifterna.';
export const SIMULERAT = 'HOSP-tjänsten är simulerad i demon och svarar med påhittade uppgifter. Inget lämnar demon.';
const REGISTRET = 'Socialstyrelsens register (HOSP)';

// Kodverket för legitimerat yrke i kontraktet (1.2.752.116.3.1.3), med namnen ur schemat.
export const YRKESNAMN = {
  AP: 'Apotekare', AT: 'Arbetsterapeut', AU: 'Audionom', BA: 'Biomedicinsk analytiker', BM: 'Barnmorska', DT: 'Dietist', FT: 'Fysioterapeut',
  KP: 'Kiropraktor', LG: 'Logoped', LK: 'Läkare', NA: 'Naprapat', OP: 'Optiker', OT: 'Ortopedingenjör', PS: 'Psykolog', PT: 'Psykoterapeut',
  RC: 'Receptarie', RS: 'Röntgensjuksköterska', SF: 'Sjukhusfysiker', SG: 'Sjukgymnast', SJ: 'Sjuksköterska', TH: 'Tandhygienist', TL: 'Tandläkare',
};
const NAMN_I_TEXT = { ...Object.fromEntries(Object.entries(YRKESNAMN).map(([k, v]) => [k, v.toLowerCase()])), HK: 'hälso- och sjukvårdskurator' };
// Typ av behörighetsbegränsning (1.2.752.116.3.1.5).
export const BEGRANSNING = { '001': 'Återkallad legitimation', '002': 'Prövotid', '003': 'Begränsad förskrivningsrätt' };
// Förskrivningsrätten följer legitimationen för läkare och tandläkare. Sjuksköterskor och barnmorskor har den efter ett
// eget beslut, som står i fältet forskrivningsratt.
const MED_LEGITIMATIONEN = new Set(['LK', 'TL']);

// Narkotiska läkemedel efter ATC, för behörighetsbegränsningar som gäller narkotika. En förenkling i demon:
// Läkemedelsverkets förteckning över narkotika gäller substanser, inte ATC-grupper. Här räknas opioider (N01AH, N02A och
// N07BC), bensodiazepiner (N03AE, N05BA och N05CD), z-preparat (N05CF) och centralstimulantia (N06BA).
export const NARKOTIKA_ATC = ['N01AH', 'N02A', 'N03AE', 'N05BA', 'N05CD', 'N05CF', 'N06BA', 'N07BC'];
export const arNarkotika = (atc) => typeof atc === 'string' && NARKOTIKA_ATC.some(a => atc.startsWith(a));

// Legitimationen som en roll kräver: koderna och om alla krävs (barnmorskan) eller en av dem.
export function kravFor(yrke) {
  if (Object.hasOwn(LEGITIMATION_ALLA, yrke ?? '')) return { koder: LEGITIMATION_ALLA[yrke], alla: true };
  if (Object.hasOwn(LEGITIMATION_FOR_ROLL, yrke ?? '')) return { koder: LEGITIMATION_FOR_ROLL[yrke], alla: false };
  return null;
}
const iText = (koder, binder = 'eller') => koder.map(k => NAMN_I_TEXT[k] ?? k).join(` ${binder} `);
const datumText = (d) => (d && d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : d ?? '');
const dagRiv = (nu) => nu.toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' }).replaceAll('-', '');
const aktiv = (b, dag) => (!b.from || b.from <= dag) && (!b.tom || b.tom >= dag);

// ---------------------------------------------------------------------------------------------------------------
// Tabellen med de hämtade uppgifterna. sparr_fran är dagen (ÅÅÅÅMMDD) från vilken personen saknar giltig legitimation för
// rollen, och sparr_text förklaringen. Behörighetsmotorn läser dem för yrket som uppgifterna hämtades för.
function sakra(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS hosp_uppgifter (personal_id TEXT PRIMARY KEY, yrke TEXT, hamtad TEXT, forsok TEXT, fel TEXT,
    uppgifter TEXT, sparr_fran TEXT, sparr_text TEXT)`);
  if (!db.query('PRAGMA table_info(hosp_uppgifter)').all().some(k => k.name === 'fel_antal')) db.exec('ALTER TABLE hosp_uppgifter ADD COLUMN fel_antal INTEGER');
  markeraHospTabell(db);
}
const lasRad = (db, id) => { sakra(db); return db.query('SELECT * FROM hosp_uppgifter WHERE personal_id = ?').get(id); };

// ---------------------------------------------------------------------------------------------------------------
// Den simulerade HOSP-tjänsten. Den har en egen kopia av registret i sandlådan, tagen första gången den används, med en
// post för varje person i personalkatalogen vars yrke har en legitimation, och avvikelserna i seed/hosp.js.
function sakraSim(db) {
  db.exec('CREATE TABLE IF NOT EXISTS rivta_sim_hosp (personnummer TEXT PRIMARY KEY, post TEXT NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS rivta_sim_status (nyckel TEXT PRIMARY KEY, varde TEXT)');
  if (db.query("SELECT 1 FROM rivta_sim_status WHERE nyckel = 'hosp'").get()) return;
  const ins = db.query('INSERT OR IGNORE INTO rivta_sim_hosp (personnummer, post) VALUES (?, ?)');
  let i = 0;
  for (const p of db.query("SELECT * FROM personal WHERE yrke <> 'systemkonto' ORDER BY rowid").all()) {
    i++;
    if (!Object.hasOwn(PERSONNUMMER, p.id)) continue;
    const post = simuleradPost(p, PERSONNUMMER[p.id], i);
    if (post) ins.run(PERSONNUMMER[p.id], JSON.stringify(post));
  }
  db.query("INSERT INTO rivta_sim_status (nyckel, varde) VALUES ('hosp', ?)").run(new Date().toISOString());
}

const kod = (code, codeSystem, displayName) => ({ code, codeSystem, displayName });
function simuleradPost(p, pnr, nr) {
  const leg = [...(LEGITIMATIONER[p.yrke] ?? []), ...(EXTRA[p.id] ?? [])];
  if (!leg.length) return null;
  const av = Object.hasOwn(AVVIKELSER, p.id) ? AVVIKELSER[p.id] : {};
  const [fornamn, ...efter] = String(p.namn).split(' ');
  const ar = String(Number(pnr.slice(0, 4)) + 26);
  const fr = (l) => (l.forskrivningsratt == null ? null : (av.forskrivningsratt ?? l.forskrivningsratt));
  return {
    hospId: { extension: 900000 + nr, root: '1.2.752.116.3.1.1' },
    personId: { extension: pnr, root: PNR_OID },
    efternamn: efter.join(' ') || fornamn, samtligaFornamn: [fornamn], tilltalsnamn: fornamn, fodelsedatum: pnr.slice(0, 8),
    ...(leg.some(l => fr(l)) ? { forskrivarkod: { extension: 9100000 + nr, root: '1.2.752.116.3.1.2' } } : {}),
    legitimation: leg.map(l => {
      const begr = [...(av.aterkallad ? [{ typ: '001', fromDatum: av.aterkallad }] : []), ...(MED_LEGITIMATIONEN.has(l.kod) || fr(l) ? av.begransningar ?? [] : [])];
      return {
        // Testspår 2: datumen anges ÅÅÅÅMMDD (TKB 6.1.2), inte bara ett årtal.
        legitimeratYrke: kod(l.kod, '1.2.752.116.3.1.3', YRKESNAMN[l.kod]), giltigLegitimation: !av.aterkallad, legitimationsDatum: `${ar}${pnr.slice(4, 8)}`,
        ...(fr(l) == null ? {} : { forskrivningsratt: fr(l) }),
        ...(begr.length ? { behorighetsbegransning: begr.map(b => ({ typAvBehorighetsbegransning: kod(b.typ, '1.2.752.116.3.1.5', BEGRANSNING[b.typ]), fromDatum: b.fromDatum, ...(b.text ? { begransadForskrivningsrattText: b.text } : {}) })) } : {}),
      };
    }),
  };
}
// En påhittad post i kontraktets form, för testerna av schemat.
export const exempelPost = () => simuleradPost({ id: 'lak-ane-ort', namn: 'Exempel Exempelsson', yrke: 'lakare' }, '191212121212', 1);

tjanst.registrera(HOSP, ({ db }, { begaran }) => {
  sakraSim(db);
  const pnr = begaran.personId?.extension;
  let poster = [];
  if (pnr) poster = db.query('SELECT post FROM rivta_sim_hosp WHERE personnummer = ?').all(pnr).map(r => JSON.parse(r.post));
  else if (begaran.efternamn && begaran.fodelsedatum) {
    // Sökning på namn och födelsedatum, som kontraktet också tillåter.
    poster = db.query('SELECT post FROM rivta_sim_hosp').all().map(r => JSON.parse(r.post))
      .filter(h => h.efternamn === begaran.efternamn && h.fodelsedatum === begaran.fodelsedatum && (begaran.fornamn ?? []).every(f => h.samtligaFornamn.includes(f)));
  }
  return { hospPerson: poster };
});

// ---------------------------------------------------------------------------------------------------------------
// Konsumenten.

// Det som sparas ur svaret: bara legitimationerna.
function tolkaSvar(svar, pnr) {
  const h = (svar.hospPerson ?? []).find(x => x.personId?.extension === pnr);
  if (!h) return { finns: false, legitimationer: [] };
  // Testspår 2 (TKB 6.1.3): för en person med skyddad identitet har registret bara personnummer, födelsedatum, avliden och
  // en upplysning om att kontakta Socialstyrelsen, så tjänsten kan inte användas för att kontrollera legitimationen.
  if (h.skyddadIdentitet === true) return { finns: true, skyddad: true, legitimationer: [] };
  return {
    finns: true,
    legitimationer: (h.legitimation ?? []).map(l => ({
      kod: l.legitimeratYrke.code, namn: l.legitimeratYrke.displayName, giltig: l.giltigLegitimation === true, datum: l.legitimationsDatum ?? null,
      forskrivningsratt: typeof l.forskrivningsratt === 'boolean' ? l.forskrivningsratt : null,
      specialister: (l.specialistbevis ?? []).map(s => ({ kod: s.specialistinriktning.code, namn: s.specialistinriktning.displayName })),
      begransningar: (l.behorighetsbegransning ?? []).map(b => ({ typ: b.typAvBehorighetsbegransning.code, namn: BEGRANSNING[b.typAvBehorighetsbegransning.code] ?? b.typAvBehorighetsbegransning.displayName,
        from: b.fromDatum, tom: b.tomDatum ?? null, text: b.begransadForskrivningsrattText ?? null })),
    })),
  };
}

// Legitimationen är återkallad (giltig är falskt, eller en begränsning av typ 001 gäller den dagen).
const aterkalladFran = (l) => (!l.giltig ? '00000000' : l.begransningar.filter(b => b.typ === '001').map(b => b.from ?? '00000000').sort()[0] ?? null);

// Bedömningen av uppgifterna för personens roll, utan att hämta något.
export function bedom(db, p, nu = new Date()) {
  const krav = kravFor(p?.yrke);
  if (!krav) return { status: 'ej_krav', text: 'Rollen kräver ingen legitimation.' };
  const koder = krav.koder.filter(k => Object.hasOwn(YRKESNAMN, k));
  if (!koder.length) return { status: 'ej_i_hosp', text: `Legitimationen som ${iText(krav.koder)} finns inte i kodverket i HOSP-kontraktet (version 1.1), så den kan inte hämtas därifrån. Den prövas mot HSA-katalogen vid inloggning.` };
  const rad = lasRad(db, p.id);
  const gammal = Boolean(rad?.hamtad) && (nu.getTime() - new Date(rad.hamtad).getTime() > DYGN_MS);
  const bas = { hamtad: rad?.hamtad ?? null, forsok: rad?.forsok ?? null, fel: rad?.fel ?? null, gammal };
  if (!rad?.uppgifter || rad.yrke !== p.yrke) {
    return { ...bas, status: 'okand', text: rad?.fel ? `Uppgifterna ur ${REGISTRET} har inte kunnat hämtas. ${rad.fel}` : `Uppgifterna ur ${REGISTRET} är inte hämtade än.` };
  }
  const u = JSON.parse(rad.uppgifter);
  if (u.skyddad) return { ...bas, status: 'skyddad', legitimationer: [], text: `Personen har skyddad identitet, och ${REGISTRET} lämnar då inga uppgifter om legitimationen. Legitimationen prövas mot HSA-katalogen, och förskrivningsrätten kan inte kontrolleras här. Systemförvaltaren kontaktar Socialstyrelsen.` };
  const dag = dagRiv(nu);
  const per = koder.map(k => ({ kod: k, leg: u.legitimationer.find(l => l.kod === k) ?? null }));
  const arAterkallad = (l) => { const f = aterkalladFran(l); return f !== null && f <= dag; };
  let status;
  let saknas = [];
  let aterkallade = [];
  if (krav.alla) {
    saknas = per.filter(x => !x.leg).map(x => x.kod);
    aterkallade = per.filter(x => x.leg && arAterkallad(x.leg));
  } else if (!per.some(x => x.leg && !arAterkallad(x.leg))) {
    aterkallade = per.filter(x => x.leg);
    if (!aterkallade.length) saknas = koder;
  }
  let text;
  if (aterkallade.length) {
    status = 'aterkallad';
    const fran = aterkallade.flatMap(x => x.leg.begransningar.filter(b => b.typ === '001').map(b => b.from)).filter(Boolean).sort()[0];
    text = `Legitimationen som ${iText(aterkallade.map(x => x.kod), 'och')} är återkallad enligt ${REGISTRET}${fran ? ` sedan ${datumText(fran)}` : ''}, och rollen kräver legitimation.`;
  } else if (saknas.length) {
    status = 'saknas';
    text = `${REGISTRET} har ingen legitimation som ${iText(saknas, krav.alla ? 'och' : 'eller')}, och rollen kräver det.`;
  } else {
    status = 'ok';
    const begr = per.flatMap(x => x.leg?.begransningar ?? []).filter(b => b.typ !== '001' && aktiv(b, dag));
    text = `Legitimationen som ${iText(per.filter(x => x.leg).map(x => x.kod), 'och')} är giltig enligt ${REGISTRET}.${begr.map(b => ` ${b.namn}${b.text ? `: ${b.text}` : '.'}`).join('')}`;
  }
  return { ...bas, status, text, legitimationer: u.legitimationer };
}

// När personen saknar giltig legitimation för rollen (ÅÅÅÅMMDD), eller null. Används av behörighetsmotorn.
function sparrFran(db, p, b, nu) {
  if (b.status === 'saknas') return '00000000';
  if (b.status !== 'ok' && b.status !== 'aterkallad') return null;
  const krav = kravFor(p.yrke);
  const koder = krav.koder.filter(k => Object.hasOwn(YRKESNAMN, k));
  const fran = koder.map(k => { const l = b.legitimationer.find(x => x.kod === k); return l ? aterkalladFran(l) : null; });
  if (krav.alla) return fran.filter(Boolean).sort()[0] ?? null;
  // En av legitimationerna räcker: spärren börjar när den sista giltiga återkallas.
  return fran.every(Boolean) ? fran.sort().at(-1) : null;
}
const sparrText = (p, b) => `${b.status === 'saknas' ? b.text : `Legitimationen som ${iText(kravFor(p.yrke).koder.filter(k => Object.hasOwn(YRKESNAMN, k)))} är återkallad enligt ${REGISTRET}.`} Därför går det inte att arbeta i rollen. Kontakta din chef om uppgiften är fel.`;

// Hämtar uppgifterna ur HOSP och sparar dem. Ger bedömningen. Ett fel i tjänsten sparas, och de förra uppgifterna gäller.
export function hamta(db, p, nu = new Date()) {
  sakra(db);
  const krav = kravFor(p.yrke);
  if (!krav || !krav.koder.some(k => Object.hasOwn(YRKESNAMN, k))) return bedom(db, p, nu);
  // tekniskt: ett tekniskt fel (tjänsten svarar inte eller svarar med ett fel), som räknas som ett försök till. Ett svar
  // som inte gick att använda, eller ett personnummer som saknas, ger inga nya försök förrän nästa dygn.
  const sparaFel = (felText, tekniskt = false) => {
    const antal = tekniskt ? (lasRad(db, p.id)?.fel_antal ?? 0) + 1 : MAX_FORSOK;
    db.query(`INSERT INTO hosp_uppgifter (personal_id, forsok, fel, fel_antal) VALUES (?, ?, ?, ?)
      ON CONFLICT (personal_id) DO UPDATE SET forsok = excluded.forsok, fel = excluded.fel, fel_antal = excluded.fel_antal`).run(p.id, nu.toISOString(), felText, antal);
    return bedom(db, p, nu);
  };
  // I verkligheten kommer personnumret från HSA-katalogen. I demon står det i den simulerade katalogen (seed/hosp.js).
  const pnr = Object.hasOwn(PERSONNUMMER, p.id) ? PERSONNUMMER[p.id] : null;
  if (!pnr) return sparaFel('Personen har inget personnummer i HSA-katalogen, så registret kan inte frågas. Den som administrerar HSA lägger in personnumret.');
  let svar;
  try {
    svar = anropaSynk(HOSP, { logiskAdress: NATIONELL, begaran: { personId: { extension: pnr, root: PNR_OID } }, transport: transport(db), db });
  } catch (e) {
    if (!(e instanceof RivtaFel)) throw e;
    const tekniskt = e.kod === 'transport' || e.kod === 'fault';
    return sparaFel(tekniskt ? 'Tjänsten svarar inte just nu.' : 'Svaret från tjänsten kunde inte användas.', tekniskt);
  }
  const u = tolkaSvar(svar, pnr);
  db.query(`INSERT INTO hosp_uppgifter (personal_id, yrke, hamtad, forsok, fel, uppgifter) VALUES (?, ?, ?, ?, NULL, ?)
    ON CONFLICT (personal_id) DO UPDATE SET yrke = excluded.yrke, hamtad = excluded.hamtad, forsok = excluded.forsok, fel = NULL, fel_antal = NULL, uppgifter = excluded.uppgifter`)
    .run(p.id, p.yrke, nu.toISOString(), nu.toISOString(), JSON.stringify(u));
  const b = bedom(db, p, nu);
  const fran = sparrFran(db, p, b, nu);
  db.query('UPDATE hosp_uppgifter SET sparr_fran = ?, sparr_text = ? WHERE personal_id = ?').run(fran, fran ? sparrText(p, b) : null, p.id);
  return b;
}

// Uppgifterna enligt regeln: hämtas om när de saknas, gäller ett annat yrke eller är äldre än ett dygn. Efter ett fel
// väntar systemet allt längre mellan försöken (vantetidHosp).
export function aktuell(db, p, nu = new Date()) {
  const krav = kravFor(p?.yrke);
  if (!krav || !krav.koder.some(k => Object.hasOwn(YRKESNAMN, k))) return bedom(db, p, nu);
  const rad = lasRad(db, p.id);
  const behover = !rad?.uppgifter || rad.yrke !== p.yrke || nu.getTime() - new Date(rad.hamtad).getTime() > DYGN_MS;
  const nyssFel = rad?.fel && rad.forsok && nu.getTime() - new Date(rad.forsok).getTime() < vantetidHosp(rad.fel_antal ?? 1);
  return behover && !nyssFel ? hamta(db, p, nu) : bedom(db, p, nu);
}

// Vid inloggning: uppgifterna hämtas enligt regeln, och den som saknar giltig legitimation för rollen loggas inte in.
export function vidInloggning(db, p, nu = new Date()) {
  const b = aktuell(db, p, nu);
  if (b.status === 'aterkallad' || b.status === 'saknas') {
    throw new Fel(403, `Du kan inte logga in som ${(YRKEN[p.yrke] ?? p.yrke).toLowerCase()}. ${b.text} Kontakta din chef om uppgiften är fel.`, 'nekad');
  }
  return b;
}

// ---------------------------------------------------------------------------------------------------------------
// Förskrivningsrätten. typ är 'lakemedel' (ordination och förskrivning av läkemedel), 'forbrukning' (förbrukningsartiklar)
// eller 'preventivmedel' (barnmorskans förskrivning). lm är läkemedlet när det är känt. Ger { kan, varfor, begransning }.
export function forskrivning(db, p, { typ = 'lakemedel', lm = null, nu = new Date() } = {}) {
  const b = aktuell(db, p, nu);
  const nej = (varfor) => ({ kan: false, varfor, hosp: true });
  if (b.status === 'ej_krav' || b.status === 'ej_i_hosp') return { kan: true, varfor: null, begransning: null };
  if (b.status === 'okand') {
    return nej(`Systemet har inte kunnat hämta din legitimation och förskrivningsrätt ur ${REGISTRET}.${b.fel ? ` ${b.fel}` : ''} En förskrivning kräver att systemet vet att du har förskrivningsrätt, så den är stoppad tills uppgifterna har hämtats. Försök igen om en stund, eller kontakta systemförvaltningen.`);
  }
  if (b.status !== 'ok') return nej(`${b.text} Därför kan du inte förskriva.`);
  const dag = dagRiv(nu);
  const krav = kravFor(p.yrke);
  const koder = typ === 'preventivmedel' ? ['BM'] : krav.koder;
  const harRatt = (l) => (MED_LEGITIMATIONEN.has(l.kod) ? l.forskrivningsratt !== false : l.forskrivningsratt === true);
  const legs = b.legitimationer.filter(l => koder.includes(l.kod) && l.giltig && harRatt(l));
  if (!legs.length) {
    const vem = typ === 'preventivmedel' ? 'barnmorska' : iText(koder.filter(k => Object.hasOwn(YRKESNAMN, k)));
    const vad = typ === 'forbrukning' ? ' Förbrukningsartiklar förskrivs av läkare och av sjuksköterskor med förskrivningsrätt. Be en kollega med förskrivningsrätt förskriva.'
      : typ === 'preventivmedel' ? ' Barnmorskan förskriver preventivmedel efter beslut om förskrivningsrätt. Be en läkare förskriva.' : ' Be en kollega med förskrivningsrätt ordinera.';
    return nej(`Du har ingen förskrivningsrätt som ${vem} enligt ${REGISTRET}.${vad}`);
  }
  // Begränsningarna (typ 003) för den legitimation som ger rätten. Är någon av dem utan begränsning gäller den.
  const begr = (l) => l.begransningar.filter(x => x.typ === '003' && aktiv(x, dag));
  if (legs.some(l => !begr(l).length)) return { kan: true, varfor: null, begransning: null };
  const alla = legs.flatMap(begr);
  const okanda = alla.filter(x => !arBegransningTillNarkotika(x.text));
  if (okanda.length) {
    return nej(`Din förskrivningsrätt är begränsad enligt ${REGISTRET}: ${okanda.map(x => x.text ?? 'beslutet har ingen text').join(' ')} Systemet kan inte avgöra vad begränsningen omfattar, så förskrivningen stoppas. Be en kollega förskriva, och kontakta systemförvaltningen.`);
  }
  const text = alla.map(x => x.text).join(' ');
  if (typ === 'lakemedel' && lm && arNarkotika(lm.atc)) {
    return { ...nej(`Din förskrivningsrätt är begränsad enligt ${REGISTRET}: ${text} ${lm.namn ?? 'Läkemedlet'} är ett narkotiskt läkemedel. Be en kollega med full förskrivningsrätt ordinera det.`), begransning: { narkotika: true, text } };
  }
  return { kan: true, varfor: null, begransning: { narkotika: true, text } };
}

// Version 1.7.1: en begränsning räknas som en begränsning till narkotika bara när texten, med stora och små bokstäver,
// mellanrum och avslutande punkt utjämnade, är en av de kända formuleringarna. All annan text är en begränsning som
// systemet inte kan tolka, och då stoppas förskrivningen.
export const NARKOTIKA_BEGRANSNINGAR = ['förskrivningsrätten omfattar inte narkotiska läkemedel'];
const normalisera = (t) => t.toLowerCase().replace(/\s+/g, ' ').trim().replace(/\.$/, '').trim();
export const arBegransningTillNarkotika = (text) => typeof text === 'string' && NARKOTIKA_BEGRANSNINGAR.includes(normalisera(text));

// Samma regel som ett fel, för flödena som sparar.
export function kravForskrivning(db, p, opts = {}) {
  const f = forskrivning(db, p, opts);
  if (!f.kan) throw new Fel(403, f.varfor, 'nekad', { hosp: true });
  return f;
}

// Katalogen i ordinationen: läkemedel som personen inte får förskriva får fältet ejForskrivning med förklaringen.
export function markeraKatalog(db, p, lista) {
  if (!kanRoll(p, 'ordinera') || !lista.length) return lista;
  const f = forskrivning(db, p, { typ: 'lakemedel' });
  if (!f.kan) return lista.map(l => ({ ...l, ejForskrivning: f.varfor }));
  if (!f.begransning?.narkotika) return lista;
  return lista.map(l => (arNarkotika(l.atc) ? { ...l, ejForskrivning: forskrivning(db, p, { typ: 'lakemedel', lm: l }).varfor } : l));
}

// ---------------------------------------------------------------------------------------------------------------
// När personalkatalogen ger någon en ny roll, eller en ny person kommer in, hämtar systemet uppgifterna. Ger det som
// systemförvaltningen behöver veta: de som saknar giltig legitimation för sin roll, eller vars uppgifter inte gick att hämta.
export function efterNyRoll(db, ids, nu = new Date()) {
  const ut = [];
  for (const id of ids) {
    const p = db.query('SELECT * FROM personal WHERE id = ? AND aktiv = 1').get(id);
    if (!p || !kravFor(p.yrke)) continue;
    const b = hamta(db, p, nu);
    if (['saknas', 'aterkallad', 'okand'].includes(b.status)) ut.push({ id: p.id, namn: p.namn, status: b.status, text: b.text });
  }
  return ut;
}

// ---------------------------------------------------------------------------------------------------------------
// Systemförvaltningen och personen själv.
function kravForvaltare(p) {
  if (!kanRoll(p, 'forvalta_api')) throw new Fel(403, 'Bara systemförvaltaren ser personalens uppgifter ur HOSP.', 'nekad');
}
const legUt = (l) => ({ kod: l.kod, namn: l.namn, giltig: l.giltig, datum: l.datum, forskrivningsratt: l.forskrivningsratt, specialister: l.specialister,
  begransningar: l.begransningar.map(b => ({ typ: b.typ, namn: b.namn, from: datumText(b.from), tom: b.tom ? datumText(b.tom) : null, text: b.text })) });

export function lista(db, personal, nu = new Date(), { logga = true } = {}) {
  kravForvaltare(personal);
  const rader = db.query("SELECT p.*, e.namn AS enhet_namn FROM personal p LEFT JOIN enheter e ON e.id = p.enhet_id WHERE p.aktiv = 1 AND p.yrke <> 'systemkonto' ORDER BY p.namn").all()
    .filter(p => kravFor(p.yrke))
    .map(p => {
      // Systemet hämtar själv det som saknas eller är äldre än ett dygn, så att listan visar läget nu.
      const b = aktuell(db, p, nu);
      return { id: p.id, namn: p.namn, yrke: YRKEN[p.yrke] ?? p.yrke, enhet: p.enhet_namn ?? null, status: b.status, text: b.text, hamtad: b.hamtad ?? null, fel: b.fel ?? null,
        gammal: Boolean(b.gammal), legitimationer: (b.legitimationer ?? []).map(legUt) };
    });
  if (logga) loggaRad(db, { personal_id: personal.id, enhet_id: personal.enhet_id, handling: 'forvalta_api', resurs: 'hosp:lista', grund: 'administrativ' });
  const avvikelser = rader.filter(r => r.status === 'saknas' || r.status === 'aterkallad').length;
  const ejHamtade = rader.filter(r => r.status === 'okand').length;
  const gamla = rader.filter(r => r.gammal && r.fel).length;
  const delar = [];
  if (avvikelser) delar.push(`${avvikelser} ${avvikelser === 1 ? 'person saknar' : 'personer saknar'} giltig legitimation för sin roll och kan inte arbeta i den. Se orsaken i listan nedan.`);
  if (gamla) delar.push(`Tjänsten svarar inte, så de senast hämtade uppgifterna gäller för ${gamla} ${gamla === 1 ? 'person' : 'personer'}.`);
  if (ejHamtade) delar.push(`För ${ejHamtade} ${ejHamtade === 1 ? 'person' : 'personer'} har uppgifterna inte kunnat hämtas, eftersom tjänsten inte svarar eller personnumret saknas i HSA-katalogen. Systemet försöker igen av sig självt.`);
  return { regel: REGEL, simulerat: SIMULERAT, personal: rader, avvikelser, text: delar.length ? delar.join(' ') : 'Alla som har en roll som kräver legitimation har giltig legitimation enligt registret.' };
}

export function hamtaOm(db, personal, { personalId } = {}, nu = new Date()) {
  kravForvaltare(personal);
  if (personalId !== undefined && typeof personalId !== 'string') throw new Fel(400, 'Välj personen.', 'ogiltig', { falt: ['personalId'] });
  const p = personalId ? db.query("SELECT * FROM personal WHERE id = ? AND aktiv = 1 AND yrke <> 'systemkonto'").get(personalId) : null;
  if (personalId && (!p || !kravFor(p.yrke))) throw new Fel(404, 'Personen finns inte bland dem som har en roll som kräver legitimation.', 'saknas');
  const alla = p ? [p] : db.query("SELECT * FROM personal WHERE aktiv = 1 AND yrke <> 'systemkonto'").all().filter(x => kravFor(x.yrke));
  for (const x of alla) hamta(db, x, nu);
  loggaRad(db, { personal_id: personal.id, enhet_id: personal.enhet_id, handling: 'forvalta_api', resurs: p ? `hosp:hamta:${p.id}` : 'hosp:hamta', grund: 'administrativ' });
  return lista(db, personal, nu, { logga: false });
}

// Personens egna uppgifter.
export function mig(db, personal, nu = new Date()) {
  const b = aktuell(db, personal, nu);
  return { status: b.status, text: b.text, hamtad: b.hamtad ?? null, fel: b.fel ?? null, gammal: Boolean(b.gammal), legitimationer: (b.legitimationer ?? []).map(legUt), regel: REGEL, simulerat: SIMULERAT };
}
