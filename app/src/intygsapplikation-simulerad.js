// Runda 14, r3: en simulerad intygsapplikation i integrerat läge, för demon (Sussa 2.2.1.9). Den står för den del som
// Webcert och Intygstjänsten har i verkligheten: den tar emot CreateDraftCertificate, låter läkaren skriva och signera
// intyget, skickar det till mottagaren (simulerat, inget lämnar demon) och meddelar journalen varje händelse med
// CertificateStatusUpdateForCare. Den svarar också på ListCertificatesForCareWithQA.
//
// Runda 16, r1: alla intyg som finns i Webcert i dag, med frågorna och svarsalternativen ur intygstyper.js. Läkaren
// signerar, och barnmorskan och sjuksköterskan signerar de intyg som de får utfärda (intyg om graviditet och intyg om
// tillfällig föräldrapenning). Vårdadministratören skapar och fyller i utkast och markerar dem klara för signering, men
// signerar aldrig. Intyg till arbetsgivaren skrivs bara ut, och patienten kan välja att dölja diagnosen. Dödsbevis,
// dödsorsaksintyg skickas när de signeras, läkarens anmälan till Transportstyrelsen skrivs ut och skickas med post, och
// övriga skickas i samråd med patienten. Ett utkast
// av en version eller blankett som inte längre gäller kan inte signeras; systemet byter det mot den som gäller och tar med
// de svar som får följa med. Ett signerat intyg förnyas med den version som gäller nu.
//
// Den är inte Webcert och inte Ineras tjänst. Den kör i samma process och sandlåda som Vårdkällan och tar bara emot
// meddelanden genom samma kontrakt, kuvert och validering som en riktig intygsapplikation (src/rivta/). Reglerna för vilka intyg som får skrivas
// följer de regler som Webcert tillämpar för skyddade personuppgifter och avlidna, så att journalen kan visa samma sak.
// Personuppgifterna slås upp i sandlådans patienter, som en intygsapplikation slår upp dem i PU-tjänsten.
import { randomUUID } from 'node:crypto';
import { el } from './rivta/xml.js';
import { Fel, iso, datumAv } from './db.js';
import { vardenhetFor, prova, visningsnamn, visningsPnr, kanRoll, Atkomst } from './atkomst.js';
import { loggaRad } from './logg.js';
import * as r3 from './rivta-r3.js';
import * as IT from './intygstyper.js';
import { KV, NS, LOGISK_ADRESS_INTYGSAPPLIKATION, DEF, personId, sattTransport, sattFornya, behorighet, delsvarId, provaRegler, forslagForUtkast, synligForLasare } from './lakarintyg.js';
// Runda 16, r2: sjukskrivningens svar (fråga 28, 32 och 37 i FK 7804) i statusuppdateringen, så att journalen kan räkna
// sjukfallet (sjukfall-intygssvar.js och sjukfall.js).
import { sjukskrivningSvar, provaPeriod } from './sjukfall-intygssvar.js';

export const NAMN = 'Intygsapplikation (simulerad, inte Webcert)';
// Påhittade värden som kontraktet kräver men som demon inte har. Märkta som demo.
const ARBETSPLATSKOD = 'DEMO0000';
const TELEFON = '000-000 00 00 (demo)';

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS sim_intygsapplikation (
  intygs_id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, enhet_id TEXT NOT NULL, typ TEXT NOT NULL, personnummer TEXT NOT NULL,
  personal_hsa TEXT NOT NULL, personal_namn TEXT NOT NULL, ref TEXT, status TEXT NOT NULL, skapad TEXT NOT NULL,
  signerad TEXT, signerad_av TEXT, skickad TEXT, makulerad TEXT, svar TEXT NOT NULL, handelser TEXT NOT NULL
);
`;
// Runda 16, r1: version, relation till ett tidigare intyg, källorna för förifyllnaden och orsaken vid makulering.
export function sakra(db) {
  db.exec(SCHEMA);
  const k = new Set(db.query("SELECT name FROM pragma_table_info('sim_intygsapplikation')").all().map(x => x.name));
  for (const [namn, typ] of [['version', "TEXT NOT NULL DEFAULT '1.0'"], ['relation_typ', 'TEXT'], ['relation_intygs_id', 'TEXT'], ['kallor', "TEXT NOT NULL DEFAULT '{}'"], ['makulerad_orsak', 'TEXT']]) {
    if (!k.has(namn)) db.exec(`ALTER TABLE sim_intygsapplikation ADD COLUMN ${namn} ${typ}`);
  }
}

const svaraSkapa = (kod, resultText = null, errorId = null, intygsId = null, rot = null) => ({ 'intygs-id': intygsId ? { root: rot, extension: intygsId } : null, result: { resultCode: kod, resultText, errorId } });

const enhetPaHsa = (db, hsa) => db.query("SELECT id, hsa_id, namn FROM enheter WHERE hsa_id = ?").get(hsa);
const vardgivare = (db, enhetId) => {
  let id = enhetId;
  for (let i = 0; i < 8 && id; i++) {
    const r = db.query('SELECT id, hsa_id, namn, typ, forald_id FROM enheter WHERE id = ?').get(id);
    if (!r) return null;
    if (r.typ === 'vardgivare') return r;
    id = r.forald_id;
  }
  return null;
};

// Svaren som de sparas. Utkast från runda 14 hade egna fält för sjukpenningen; de läses som frågorna i blanketten.
const SYSS = { nuvarande_arbete: 'NUVARANDE_ARBETE', arbetssokande: 'ARBETSSOKANDE', foraldraledighet: 'FORALDRALEDIG', studier: 'STUDIER' };
const NEDS = { heltid: 'HELT_NEDSATT', tre_fjardedelar: 'TRE_FJARDEDEL', halften: 'HALFTEN', en_fjardedel: 'EN_FJARDEDEL' };
export function lasSvar(r) {
  const s = JSON.parse(r.svar || '{}');
  if (!('diagnosKod' in s || 'sysselsattning' in s || 'nedsattning' in s || 'fran' in s || 'ovrigt' in s)) return s;
  const ut = Object.fromEntries(Object.entries(s).filter(([k]) => !['diagnosKod', 'diagnosText', 'sysselsattning', 'nedsattning', 'fran', 'till', 'ovrigt'].includes(k)));
  if (s.diagnosKod) ut['6'] = [{ kod: s.diagnosKod, text: s.diagnosText ?? s.diagnosKod }];
  if (s.sysselsattning && SYSS[s.sysselsattning]) ut['28'] = [SYSS[s.sysselsattning]];
  if (s.nedsattning && NEDS[s.nedsattning] && s.fran && s.till) ut['32'] = [{ kod: NEDS[s.nedsattning], fran: s.fran, till: s.till }];
  if (s.ovrigt) ut['25'] = s.ovrigt;
  return ut;
}
const typAv = (r) => IT.typFor(r.typ, r.version);

// Förifyllnaden ur CreateDraftCertificate: diagnoser som cv, övriga svar som demons element. Varje svar prövas mot
// frågan som om det kom från ett formulär, och ett svar som inte passar tas inte med.
// Källornas vårdenheter och läsrätt för ett förifyllt svar, så att varje läsare prövas mot dem (synligForLasare).
const rensaMeta = (m) => ({
  enheter: Array.isArray(m?.enheter) ? m.enheter.filter(x => typeof x === 'string').slice(0, 20) : [],
  krav: Array.isArray(m?.krav) ? m.krav.filter(x => typeof x === 'string').slice(0, 5) : [],
});
function lasForifyllnad(t, f) {
  const svar = {};
  const kallor = {};
  const fragor = new Map(IT.fragorFor(t).map(q => [q.id, q]));
  const diagnoser = new Map();
  const meta = {};
  for (const sv of f?.svar ?? []) {
    for (const ds of sv.delsvar ?? []) {
      const id = ds['@id'] ?? '';
      // Delsvaret hör till frågan med samma id, annars till svarets fråga (diagnoserna och värdet i id.1 eller id.0).
      const q = fragor.get(id) ?? (delsvarId(t, sv['@id']) === id || fragor.get(sv['@id'])?.typ === 'diagnoser' ? fragor.get(sv['@id']) : null);
      if (!q) continue;
      try {
        if (q.typ === 'diagnoser') {
          const cv = (ds.$any ?? []).find(x => x.lokal === 'cv');
          if (!cv) continue;
          const v = (n) => cv.barn.find(x => x.lokal === n)?.text ?? null;
          diagnoser.set(q.id, [...(diagnoser.get(q.id) ?? []), { kod: v('code')?.slice(0, 10) ?? '', text: v('displayName')?.slice(0, 200) ?? '' }]);
          const k = (ds.$any ?? []).find(x => x.lokal === 'kalla' && x.ns === NS.demo)?.text;
          if (typeof k === 'string' && k && k.length < 5000) {
            const o = JSON.parse(k);
            if (typeof o.kalla === 'string') kallor[q.id] = o.kalla.slice(0, 300);
            if (o.meta) meta[q.id] = rensaMeta(o.meta);
          }
        } else {
          const e = (ds.$any ?? []).find(x => x.lokal === 'varde' && x.ns === NS.demo);
          if (!e || String(e.text ?? '').length > 20_000) continue;
          const { v, kalla, meta: m } = JSON.parse(e.text);
          const n = IT.normaliseraSvar(q, v);
          if (n != null) { svar[q.id] = n; if (typeof kalla === 'string') kallor[q.id] = kalla.slice(0, 300); if (m) meta[q.id] = rensaMeta(m); }
        }
      } catch { /* ett svar som inte passar frågan tas inte med */ }
    }
  }
  // Underlaget bredvid frågorna, som journalen skickar efter svaren.
  const u = (f?.$any ?? []).find(x => x.lokal === 'underlag' && x.ns === NS.demo);
  if (u && String(u.text ?? '').length < 5000) { try { const l = JSON.parse(u.text); if (Array.isArray(l)) kallor._underlag = l.slice(0, 5).map(x => ({ text: String(x?.text ?? '').slice(0, 300), ...rensaMeta(x) })); } catch { /* tas inte med */ } }
  for (const [id, d] of diagnoser) { try { const n = IT.normaliseraSvar(fragor.get(id), d.slice(0, 3)); if (n) svar[id] = n; } catch { /* tas inte med */ } }
  kallor._meta = Object.fromEntries(Object.entries(meta).filter(([id]) => Object.hasOwn(svar, id)));
  return { svar, kallor };
}

// CreateDraftCertificate 3.3. Samma kontroller som en intygsapplikation: patient, läkare och vårdenhet ska finnas,
// intygstypen ska stödjas och gälla nu, och reglerna för skyddade personuppgifter och avlidna gäller.
function skapaUtkast(ctx, { begaran: m }) {
  const { db } = ctx;
  const i = m.intyg;
  const typ = i.typAvIntyg?.code;
  const pnr = i.patient?.['person-id']?.extension;
  const enhetHsa = i.skapadAv?.enhet?.['enhets-id']?.extension;
  const personalHsa = i.skapadAv?.['personal-id']?.extension;
  const personalNamn = i.skapadAv?.fullstandigtNamn;
  const t = IT.KODER.includes(typ ?? '') ? IT.aktuell(typ) : null;
  if (!IT.KODER.includes(typ ?? '') || i.typAvIntyg.codeSystem !== KV.intygstyp) return svaraSkapa('ERROR', `Intygstypen ${typ ?? ''} stöds inte.`, 'VALIDATION_ERROR');
  if (!t) return svaraSkapa('ERROR', `Intygstypen ${typ} kan inte utfärdas längre.`, 'APPLICATION_ERROR');
  if (!i.patient.fornamn || !i.patient.efternamn) return svaraSkapa('ERROR', 'Patientens förnamn och efternamn krävs.', 'VALIDATION_ERROR');
  if (!personalHsa || !personalNamn) return svaraSkapa('ERROR', 'Läkarens HSA-id och namn krävs.', 'VALIDATION_ERROR');
  const enhet = enhetHsa ? enhetPaHsa(db, enhetHsa) : null;
  if (!enhet) return svaraSkapa('ERROR', 'Vårdenheten finns inte.', 'VALIDATION_ERROR');
  // Personen ska ha ett uppdrag på vårdenheten, som medarbetaruppdraget i en intygsapplikation, och få skapa intygstypen.
  const pers = db.query('SELECT * FROM personal WHERE hsa_id = ? AND aktiv = 1').get(personalHsa);
  if (!pers || vardenhetFor(db, pers.enhet_id) !== enhet.id) return svaraSkapa('ERROR', 'Personen har inget uppdrag på vårdenheten.', 'VALIDATION_ERROR');
  // Personuppgifterna, som en intygsapplikation hämtar dem ur PU-tjänsten.
  const p = db.query('SELECT * FROM patienter WHERE personnummer = ?').get(pnr);
  if (!p) return svaraSkapa('ERROR', 'Personuppgiftstjänsten känner inte till personen.', 'APPLICATION_ERROR');
  // Samma regler som journalen och de nya utkasten ur ett intyg (provaRegler i lakarintyg.js).
  const skal = provaRegler(db, p, t, pers);
  if (skal) return svaraSkapa('ERROR', skal, 'APPLICATION_ERROR');
  const intygsId = randomUUID();
  const f = lasForifyllnad(t, i.forifyllnad);
  const tid = iso();
  db.query("INSERT INTO sim_intygsapplikation (intygs_id, patient_id, enhet_id, typ, version, personnummer, personal_hsa, personal_namn, ref, status, skapad, svar, kallor, handelser) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'utkast', ?, ?, ?, '[]')")
    .run(intygsId, p.id, enhet.id, typ, t.version, pnr, personalHsa, personalNamn, i.ref ?? null, tid, JSON.stringify(f.svar), JSON.stringify(f.kallor));
  // Statusuppdateringen om det nya utkastet skickas efter svaret, som från en riktig intygsapplikation.
  r3.ko(db, () => handelse(db, intygsId, 'SKAPAT'));
  return svaraSkapa('OK', null, null, intygsId, enhet.hsa_id);
}

const ms = (d = new Date()) => d.toISOString().slice(0, 23);
const sek = (s) => (s ? s.slice(0, 19) : null);

const hsa = (x) => ({ root: KV.hsa, extension: x });
const kv = (code, codeSystem, displayName = null) => ({ code, codeSystem, displayName });
function intygObjekt(db, r, { med } = {}) {
  const p = db.query('SELECT * FROM patienter WHERE id = ?').get(r.patient_id);
  const enhet = db.query('SELECT id, hsa_id, namn FROM enheter WHERE id = ?').get(r.enhet_id);
  const vg = vardgivare(db, r.enhet_id);
  const t = typAv(r);
  const svar = lasSvar(r);
  const status = [];
  if (r.signerad) status.push({ part: kv('HSVARD', KV.part), status: kv('RECEIV', KV.status), tidpunkt: sek(r.signerad) });
  if (r.skickad) status.push({ part: kv(t.part, KV.part), status: kv('SENTTO', KV.status), tidpunkt: sek(r.skickad) });
  if (r.makulerad) status.push({ part: kv('HSVARD', KV.part), status: kv('CANCEL', KV.status), tidpunkt: sek(r.makulerad) });
  const dq = IT.fragorFor(t).find(q => q.typ === 'diagnoser');
  const d = dq ? svar[dq.id]?.[0] : null;
  return {
    'intygs-id': { root: enhet.hsa_id, extension: r.intygs_id },
    mottagare: r.skickad ? [kv(t.part, KV.part)] : null,
    typ: kv(t.kod, KV.intygstyp, t.text), version: r.version ?? t.version,
    signeringstidpunkt: sek(r.signerad), skickatTidpunkt: sek(r.skickad),
    patient: { 'person-id': personId(p), fornamn: p.fornamn, efternamn: p.efternamn, postadress: p.skyddad ? '' : (p.adress ?? ''), postnummer: p.skyddad ? '' : (p.postnr ?? ''), postort: p.skyddad ? '' : (p.ort ?? '') },
    skapadAv: {
      // Runda 16, r2 (säkerhetsgranskningen): ett signerat intyg är utfärdat av den som signerade det, som i Intygstjänsten,
      // också när en vårdadministratör skapade utkastet. Journalens sjukskrivning hör då till rätt läkare.
      'personal-id': hsa(r.signerad_av ?? r.personal_hsa),
      fullstandigtNamn: r.signerad_av ? (db.query('SELECT namn FROM personal WHERE hsa_id = ?').get(r.signerad_av)?.namn ?? r.personal_namn) : r.personal_namn,
      enhet: {
        'enhets-id': hsa(enhet.hsa_id), arbetsplatskod: { root: '1.2.752.29.4.71', extension: ARBETSPLATSKOD }, enhetsnamn: enhet.namn,
        postadress: '', postnummer: '', postort: '', telefonnummer: TELEFON,
        vardgivare: { 'vardgivare-id': hsa(vg?.hsa_id ?? enhet.hsa_id), vardgivarnamn: vg?.namn ?? enhet.namn },
      },
    },
    // Runda 16, r1: relationen till det intyg som förnyades eller byttes.
    relation: r.relation_typ ? [{ typ: kv(r.relation_typ, KV.relation, IT.RELATIONER[r.relation_typ] ?? null), 'intygs-id': { root: enhet.hsa_id, extension: r.relation_intygs_id } }] : null,
    status: status.length ? status : null,
    // Runda 16, r2: för sjukintyget följer sjukskrivningens svar med diagnosen (sjukskrivningSvar).
    svar: sjukskrivningSvar(t.kod, med, svar, med && d ? [{ '@id': dq.id, delsvar: [{ '@id': `${dq.id}.2`, $any: [el(NS.types, 'cv', [el(NS.types, 'code', d.kod), el(NS.types, 'codeSystem', KV.icd10), el(NS.types, 'displayName', d.text)])] }] }] : null),
  };
}
const arenden = () => ({ totalt: 0, ejBesvarade: 0, besvarade: 0, hanterade: 0 });

// En händelse: statusen sparas hos intygsapplikationen och CertificateStatusUpdateForCare skickas till den vårdenhet som
// äger intyget. Ger journalens svar.
export async function handelse(db, intygsId, kod, nu = new Date()) {
  const r = db.query('SELECT * FROM sim_intygsapplikation WHERE intygs_id = ?').get(intygsId);
  if (!r) return null;
  const h = JSON.parse(r.handelser);
  const tid = ms(nu);
  h.push({ kod, tid });
  db.query('UPDATE sim_intygsapplikation SET handelser = ? WHERE intygs_id = ?').run(JSON.stringify(h), intygsId);
  const enhet = db.query('SELECT hsa_id FROM enheter WHERE id = ?').get(r.enhet_id);
  const rad = db.query('SELECT * FROM sim_intygsapplikation WHERE intygs_id = ?').get(intygsId);
  const begaran = { intyg: intygObjekt(db, rad, { med: true }), handelse: { handelsekod: kv(kod, KV.handelse), tidpunkt: tid }, skickadeFragor: arenden(), mottagnaFragor: arenden(), ref: r.ref };
  try {
    return await r3.anropa(db, DEF.status(), { logiskAdress: enhet.hsa_id, begaran, transport: r3.tillVardkallan(db, LOGISK_ADRESS_INTYGSAPPLIKATION) });
  } catch (x) {
    if (x instanceof r3.RivtaFel) return { fel: x.message };
    throw x;
  }
}

// ListCertificatesForCareWithQA 3.3: patientens intyg på de angivna vårdenheterna, med händelserna.
function lista(ctx, { begaran: m }) {
  const { db } = ctx;
  const pnr = m['person-id']?.extension;
  const ids = (m['enhets-id'] ?? []).map(x => enhetPaHsa(db, x.extension)?.id).filter(Boolean);
  if (!ids.length) return { list: { item: [] } };
  const rader = db.query(`SELECT * FROM sim_intygsapplikation WHERE personnummer = ? AND status != 'raderat' AND enhet_id IN (${ids.map(() => '?').join(',')})`).all(pnr, ...ids);
  return { list: { item: rader.map(r => ({
    intyg: intygObjekt(db, r),
    handelser: { handelse: JSON.parse(r.handelser).map(h => ({ handelsekod: kv(h.kod, KV.handelse), tidpunkt: h.tid })) },
    skickadeFragor: arenden(), mottagnaFragor: arenden(), ref: r.ref,
  })) } };
}

// ---------------------------------------------------------------------------------------------------------------
// Gränssnittet för den simulerade intygsapplikationen. Den inloggade är inloggad i Vårdkällan, som i integrerat läge där
// inloggningen följer med. Bara personal på den vårdenhet som äger intyget kommer åt det, och varje läsning loggas på
// patienten som i journalen. Handlingen som prövas beror på intygstypen och vad personen ska göra.
// ---------------------------------------------------------------------------------------------------------------
const vemSignerar = (t) => (t.utfardare.includes('intyg_graviditet') ? 'Läkare, barnmorska eller sjuksköterska signerar.' : t.utfardare.includes('intyg_tfp') ? 'Läkare eller sjuksköterska signerar.' : 'Läkaren signerar.');
const NEKAD = 'Intyget finns inte, eller så har du inget uppdrag på den vårdenhet som äger det.';
// Säkerhetsgranskningen av runda 16: den som får skriva utkast men inte signera, och som inte läser diagnoser och
// journaltext (vårdadministratören), har en begränsad vy. Personen når bara de utkast och intyg som den själv har
// skapat, ser bara de svar som den själv har skrivit, inga källor och inget underlag ur journalen, och kan inte skriva
// ut. Svar som någon annan har skrivit eller som journalen har fyllt i ur den som signerar visas aldrig för personen,
// och ändras inte när personen sparar. Vem som skrev varje svar sparas i kallor._av.
export const begransad = (personal, t) => {
  const b = behorighet(personal, t);
  return !b.signera && !(kanRoll(personal, 'las_diagnoser') && kanRoll(personal, 'las_journal'));
};
const forfattare = (r) => JSON.parse(r.kallor || '{}')._av ?? {};
// Frågorna med ett svar som personen inte får se: i den begränsade vyn allt som någon annan har skrivit, och för alla
// läsare de förifyllda svar vars källor läsaren inte får se, prövat med läsarens egen Atkomst (läsrätt, spärr, aktivt
// val och samtycke som i journalen).
const lasare = (db, personal, r, val) => new Atkomst(db, personal, r.patient_id, val ?? {}, 'las_intyg');
function doldaFor(db, r, personal, t, val = {}) {
  const k = JSON.parse(r.kallor || '{}');
  const av = k._av ?? {};
  const meta = k._meta ?? {};
  const ids = Object.keys(lasSvar(r));
  if (begransad(personal, t)) return ids.filter(id => av[id] !== personal.id || (meta[id] && !synligForLasare(lasare(db, personal, r, val), meta[id])));
  const atk = lasare(db, personal, r, val);
  return ids.filter(id => meta[id] && !synligForLasare(atk, meta[id]));
}
function hamta(db, personal, intygsId, vilken = 'las') {
  if (!personal) throw new Fel(401, 'Logga in först.', 'ej_inloggad');
  const r = typeof intygsId === 'string' && /^[0-9a-f-]{36}$/.test(intygsId) ? db.query('SELECT * FROM sim_intygsapplikation WHERE intygs_id = ?').get(intygsId) : null;
  const t = r ? typAv(r) : null;
  const b = t ? behorighet(personal, t) : { signera: null, utkast: null };
  const p = r ? db.query('SELECT skyddad FROM patienter WHERE id = ?').get(r.patient_id) : null;
  // Läsa: den som får signera eller skriva utkast, annars den som får se intyg. Ändra: den som får skriva. Signera:
  // bara den som får signera. För en patient med skyddade personuppgifter når bara den som signerar intyget (Webcert).
  const handling = vilken === 'signera' ? b.signera : vilken === 'skriv' ? (b.signera ?? b.utkast) : (b.signera ?? b.utkast ?? (kanRoll(personal, 'las_intyg') ? 'las_intyg' : null));
  const skyddadSparr = Boolean(p?.skyddad && !b.signera);
  const egenSparr = Boolean(r && t && begransad(personal, t) && r.personal_hsa !== personal.hsa_id);
  const pr = r && handling && !skyddadSparr && !egenSparr ? prova(db, { personal, patient: r.patient_id, handling, resurs: { enhet_id: r.enhet_id } }) : null;
  const paEnheten = r && vardenhetFor(db, personal.enhet_id) === r.enhet_id;
  // Den som får skriva utkast men inte signera får ett svar som säger vad den kan göra i stället. Det röjer inget, eftersom
  // personen får öppna utkastet.
  if (r && paEnheten && vilken === 'signera' && !b.signera && b.utkast && !skyddadSparr && !egenSparr) {
    const skriva = prova(db, { personal, patient: r.patient_id, handling: b.utkast, resurs: { enhet_id: r.enhet_id } });
    if (skriva.tillaten) {
      loggaRad(db, { personal_id: personal.id, enhet_id: personal.enhet_id, patient_id: r.patient_id, handling: b.utkast, resurs: `intygsapplikation:${r.intygs_id}:signera`, grund: 'nekad', resultat: 'nekad' });
      throw new Fel(403, `${vemSignerar(t)} Markera utkastet klart för signering i stället.`, 'nekad');
    }
  }
  if (!r || !pr?.tillaten || !paEnheten) {
    loggaRad(db, { personal_id: personal.id, enhet_id: personal.enhet_id, patient_id: r && pr?.tillaten === false ? r.patient_id : null, handling: handling ?? 'las_intyg', resurs: 'intygsapplikation', grund: 'nekad', resultat: 'nekad' });
    throw new Fel(404, NEKAD, 'saknas');
  }
  return { r, t, b, grund: pr.grund, handling };
}
const STATUS = { utkast: 'Utkast', klart_for_signering: 'Klart för signering', signerat: 'Signerat', skickat: 'Signerat och skickat', makulerat: 'Makulerat', raderat: 'Raderat' };
const UTKAST = ['utkast', 'klart_for_signering'];
const SIGNERAT = ['signerat', 'skickat'];
const SANDNING = {
  samrad: 'Skickas till mottagaren i samråd med patienten. Patienten kan också skicka intyget själv.',
  utskrift: 'Kan inte skickas digitalt. Intyget skrivs ut och patienten lämnar det till arbetsgivaren. Patienten kan välja att dölja diagnosen på utskriften.',
  vid_signering: 'Skickas till mottagaren när intyget signeras.',
  post: 'Skrivs ut när det är signerat och skickas med post till mottagaren. Det är inget intyg i Webcert.',
};
const efterfoljare = (t, nu = new Date()) => {
  if (IT.galler(t, nu)) return null;
  let n = t;
  for (let i = 0; i < 5 && n?.ersattsAv; i++) {
    n = IT.typFor(n.ersattsAv.kod, n.ersattsAv.version);
    if (n && IT.galler(n, nu)) return n;
  }
  return IT.aktuell(t.kod, nu);
};
function ut(db, r, personal, val = {}, nu = new Date()) {
  const visad = Boolean(val?.visa_identitet);
  const p = db.query('SELECT * FROM patienter WHERE id = ?').get(r.patient_id);
  const t = typAv(r);
  const b = behorighet(personal, t);
  const svar = lasSvar(r);
  const galler = IT.galler(t, nu);
  const ny = efterfoljare(t, nu);
  const skriva = Boolean(b.signera || b.utkast);
  const dolda = doldaFor(db, r, personal, t, val);
  const synligaSvar = Object.fromEntries(Object.entries(svar).filter(([id]) => !dolda.includes(id)));
  // Det som saknas räknas på det läsaren ser, så att svaret är detsamma som om de dolda frågorna inte hade besvarats.
  const saknasNu = UTKAST.includes(r.status) ? IT.saknas(t, synligaSvar) : [];
  const kallorAlla = JSON.parse(r.kallor || '{}');
  const kallor = begransad(personal, t) ? {} : Object.fromEntries(Object.entries(kallorAlla).filter(([k]) => !k.startsWith('_') && !dolda.includes(k)));
  const lasA = lasare(db, personal, r, val);
  const underlag = begransad(personal, t) ? [] : (kallorAlla._underlag ?? []).filter(u => typeof u === 'object' && synligForLasare(lasA, u)).map(u => u.text);
  // Förslagen ur journalen för den som signerar, räknade på det personen ser just nu, för de frågor som är tomma.
  const forslag = UTKAST.includes(r.status) && behorighet(personal, t).signera ? forslagForUtkast(db, personal, r.intygs_id, val, IT.fragorFor(t).map(q => q.id).filter(id => !Object.hasOwn(svar, id))) : null;
  return {
    intygsId: r.intygs_id, typ: r.typ, version: r.version ?? t.version, blankett: t.blankett, text: t.text, mottagare: t.mottagare, status: r.status, statusText: STATUS[r.status] ?? r.status,
    patient: { namn: visningsnamn(p, visad), personnummer: visningsPnr(p, visad), skyddad: Boolean(p.skyddad) },
    skapadAv: r.personal_namn, skapad: r.skapad, signerad: r.signerad, skickad: r.skickad, makulerad: r.makulerad,
    vardenhet: db.query('SELECT namn FROM enheter WHERE id = ?').get(r.enhet_id)?.namn ?? null,
    kategorier: t.fragor.map(k => ({ rubrik: k.rubrik, fragor: k.fragor.map(q => ({ id: q.id, typ: q.typ, text: q.text, alt: q.alt ?? null, krav: Boolean(q.krav), visas: q.visas ?? null, dold: q.dold ?? null, min: q.min ?? null, max: q.max ?? null, maxDagar: q.maxDagar ?? null })) })),
    svar: synligaSvar, kallor, underlag, dolda: begransad(personal, t) ? dolda : [], forslag: forslag ? { svar: forslag.svar, kallor: forslag.kallor } : null,
    patientId: r.patient_id, saknas: saknasNu, varningar: UTKAST.includes(r.status) ? IT.varningar(t, synligaSvar, nu, datumAv(nu)) : [],
    sandning: { typ: t.sandning, text: SANDNING[t.sandning] },
    giltighet: galler ? null : (IT.giltighetText(t) ?? 'Intygstypen gäller inte längre.'),
    relation: r.relation_typ ? { typ: r.relation_typ, text: IT.RELATIONER[r.relation_typ] ?? r.relation_typ } : null,
    kan: {
      andra: UTKAST.includes(r.status) && skriva,
      klar: r.status === 'utkast' && Boolean(b.utkast) && !b.signera,
      signera: UTKAST.includes(r.status) && Boolean(b.signera) && galler,
      byt: UTKAST.includes(r.status) && skriva && !galler && Boolean(ny),
      skicka: r.status === 'signerat' && t.sandning === 'samrad' && skriva,
      skrivUt: SIGNERAT.includes(r.status) && !begransad(personal, t),
      makulera: SIGNERAT.includes(r.status) && Boolean(b.signera),
      radera: UTKAST.includes(r.status) && skriva,
      fornya: SIGNERAT.includes(r.status) && skriva && Boolean(ny ? true : t.fornyas),
      arbetsgivare: r.typ === 'LISJP' && ['utkast', 'klart_for_signering', 'signerat', 'skickat'].includes(r.status) && Boolean(IT.aktuell('AG7804', nu) && (behorighet(personal, IT.aktuell('AG7804', nu)).signera || behorighet(personal, IT.aktuell('AG7804', nu)).utkast)),
    },
    byttMot: ny && !galler ? { kod: ny.kod, version: ny.version, blankett: ny.blankett, text: ny.text } : null,
    vemSignerar: vemSignerar(t),
    simulerad: 'Simulerad intygsapplikation i demon. Den är inte Webcert, och inget intyg lämnar demon.',
  };
}
export function visa(db, personal, intygsId, val = {}) {
  const { r, grund, handling } = hamta(db, personal, intygsId);
  loggaRad(db, { personal_id: personal.id, enhet_id: personal.enhet_id, patient_id: r.patient_id, handling, resurs: `intygsapplikation:${r.intygs_id}`, grund, resultat: 'tillaten' });
  return ut(db, r, personal, val);
}

// Svaren ur ett formulär. Svaren ligger i body.svar som { frågans id: värde }. Fälten från runda 14 (sysselsattning,
// nedsattning, fran, till och ovrigt) tas emot för sjukpenningen som förut. En fråga som inte finns i intygstypen, eller
// ett svar som inte passar frågan, ger ett fel med en förklaring och ändrar ingenting.
function nyaSvar(t, gamla, body) {
  const svar = { ...gamla };
  const in_ = body && typeof body.svar === 'object' && body.svar && !Array.isArray(body.svar) ? body.svar : {};
  const legacy = {};
  if (['LISJP', 'AG7804'].includes(t.kod)) {
    if (typeof body.sysselsattning === 'string') { if (!SYSS[body.sysselsattning]) throw new Fel(400, 'Välj ett av alternativen.', 'ogiltig'); legacy['28'] = [SYSS[body.sysselsattning]]; }
    const neds = typeof body.nedsattning === 'string' ? NEDS[body.nedsattning] : undefined;
    if (body.nedsattning != null && body.nedsattning !== '' && !neds) throw new Fel(400, 'Välj ett av alternativen.', 'ogiltig');
    if (neds || body.fran || body.till) {
      const forra = (gamla['32'] ?? [])[0] ?? {};
      legacy['32'] = [{ kod: neds ?? forra.kod, fran: body.fran ?? forra.fran, till: body.till ?? forra.till }];
    }
    if (body.ovrigt !== undefined) legacy['25'] = body.ovrigt;
  }
  const fragor = new Map(IT.fragorFor(t).map(q => [q.id, q]));
  for (const [id, v] of Object.entries({ ...legacy, ...in_ })) {
    if (!fragor.has(id)) throw new Fel(400, 'Frågan finns inte i intyget.', 'ogiltig');
    const q = fragor.get(id);
    if (q.typ === 'perioder' && Array.isArray(v) && v.some(x => !x?.kod || !x?.fran || !x?.till)) {
      // En period som inte är ifylld än sparas inte, så att läkaren kan fylla i grad och datum i valfri ordning.
      const hela = v.filter(x => x?.kod && x?.fran && x?.till);
      if (hela.length !== v.length && v.some(x => x?.fran && x?.till && !x?.kod)) throw new Fel(400, `${q.text}: välj hur mycket arbetsförmågan är nedsatt.`, 'ogiltig');
      svar[id] = hela.length ? IT.normaliseraSvar(q, hela) : null;
      continue;
    }
    try { svar[id] = IT.normaliseraSvar(q, v); } catch (x) {
      if (x instanceof IT.SvarsFel) throw new Fel(400, x.message, 'ogiltig', { falt: [`q-${x.fraga}`] });
      throw x;
    }
  }
  for (const k of Object.keys(svar)) if (svar[k] == null) delete svar[k];
  return svar;
}
export async function spara(db, personal, intygsId, body = {}, val = {}) {
  const { r, t, grund, handling } = hamta(db, personal, intygsId, 'skriv');
  if (!UTKAST.includes(r.status)) throw new Fel(409, 'Ett signerat intyg kan inte ändras. Makulera det och skriv ett nytt.', 'konflikt');
  const gamla = lasSvar(r);
  const dolda = doldaFor(db, r, personal, t, val);
  const ny0 = nyaSvar(t, gamla, body);
  // Runda 16, r2 (säkerhetsgranskningen): sjukskrivningens perioder ska vara rimliga, inom två år från i dag och högst ett
  // år långa (provaPeriod i sjukfall-intygssvar.js), så att ett orimligt intervall aldrig sparas.
  // FK 7804 har en period per sjukskrivningsnivå (25, 50, 75 och 100 procent), alltså högst fyra.
  const per32 = IT.fragorFor(t).some(q => q.id === '32' && q.typ === 'perioder') && Array.isArray(ny0['32']) ? ny0['32'] : [];
  if (per32.length > 4 || new Set(per32.map(x => x.kod)).size !== per32.length) throw new Fel(400, 'Fråga 32 har en period per nivå, högst fyra. Ange varje nivå en gång.', 'ogiltig', { falt: ['q-32'] });
  for (const per of per32) {
    const periodFel = provaPeriod(per.fran, per.till);
    if (periodFel) throw new Fel(400, periodFel, 'ogiltig', { falt: ['q-32'] });
  }
  // Ett svar som personen inte får se ändras inte av personen, hur anropet än ser ut.
  const ny = { ...Object.fromEntries(Object.entries(ny0).filter(([id]) => !dolda.includes(id))), ...Object.fromEntries(dolda.filter(id => Object.hasOwn(gamla, id)).map(id => [id, gamla[id]])) };
  const kallor = JSON.parse(r.kallor || '{}');
  const av = { ...(kallor._av ?? {}) };
  const meta = { ...(kallor._meta ?? {}) };
  // Förslagen som personen ser just nu. Ett sparat svar som är detsamma som förslaget får förslagets källa och källornas
  // vårdenheter, så att varje läsare sedan prövas mot dem. Annars är svaret personens eget, utan källa.
  const f = behorighet(personal, t).signera ? forslagForUtkast(db, personal, r.intygs_id, val) : null;
  for (const id of new Set([...Object.keys(gamla), ...Object.keys(ny)])) {
    if (dolda.includes(id) || JSON.stringify(gamla[id] ?? null) === JSON.stringify(ny[id] ?? null)) continue;
    delete kallor[id];
    delete meta[id];
    if (ny[id] == null) { delete av[id]; continue; }
    av[id] = personal.id;
    if (f && Object.hasOwn(f.svar, id) && JSON.stringify(IT.normaliseraSvar(IT.fragorFor(t).find(q => q.id === id), f.svar[id])) === JSON.stringify(ny[id])) {
      kallor[id] = f.kallor[id];
      meta[id] = f.meta[id];
    }
  }
  kallor._av = av;
  kallor._meta = meta;
  db.query('UPDATE sim_intygsapplikation SET svar = ?, kallor = ? WHERE intygs_id = ?').run(JSON.stringify(ny), JSON.stringify(kallor), r.intygs_id);
  loggaRad(db, { personal_id: personal.id, enhet_id: personal.enhet_id, patient_id: r.patient_id, handling, resurs: `intygsapplikation:${r.intygs_id}`, grund, resultat: 'tillaten' });
  await handelse(db, r.intygs_id, 'ANDRAT');
  return ut(db, db.query('SELECT * FROM sim_intygsapplikation WHERE intygs_id = ?').get(r.intygs_id), personal, val);
}
// Vad som saknas innan intyget kan signeras, på vanlig svenska.
export function saknas(r) {
  return IT.saknas(typAv(r), lasSvar(r)).map(x => x.text.charAt(0).toLowerCase() + x.text.slice(1));
}

// Ett nytt utkast ur ett intyg: förnyelse eller förlängning av ett signerat intyg (FRLANG), och byte från ett ersatt
// intyg eller ett utkast av en version som inte gäller längre (KOPIA). Svaren som får följa med tas med (overfor), och
// journalen får det nya utkastet med en statusuppdatering som har relationen. Ett utkast som byts raderas.
async function nyttUr(db, personal, r, t, relation, nu = new Date(), mal = null) {
  const till = mal ?? efterfoljare(t, nu) ?? (IT.galler(t, nu) ? t : null);
  if (!till) throw new Fel(409, 'Det finns ingen version av intyget som gäller nu.', 'konflikt');
  const b = behorighet(personal, till);
  if (!b.signera && !b.utkast) throw new Fel(403, 'Du får inte skriva det nya intyget.', 'nekad');
  // Säkerhetsgranskningen av runda 16: samma regler som när ett utkast skapas (skyddade personuppgifter, avliden, ålder och
  // graviditet), prövade för det nya intyget och den som skapar det.
  const p = db.query('SELECT * FROM patienter WHERE id = ?').get(r.patient_id);
  const skal = provaRegler(db, p, till, personal, { nu });
  if (skal) throw new Fel(400, `${till.text} kan inte skrivas: ${skal}`, 'ogiltig');
  const o = IT.overfor(t, till, lasSvar(r));
  const intygsId = randomUUID();
  const tid = iso();
  const pers = db.query('SELECT hsa_id, namn FROM personal WHERE id = ?').get(personal.id);
  const kallor = JSON.parse(r.kallor || '{}');
  db.query("INSERT INTO sim_intygsapplikation (intygs_id, patient_id, enhet_id, typ, version, personnummer, personal_hsa, personal_namn, ref, status, skapad, svar, kallor, handelser, relation_typ, relation_intygs_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'utkast', ?, ?, ?, '[]', ?, ?)")
    .run(intygsId, r.patient_id, r.enhet_id, till.kod, till.version, r.personnummer, pers.hsa_id, pers.namn, tid, JSON.stringify(o.svar), JSON.stringify({ ...Object.fromEntries(o.foljde.filter(id => typeof kallor[id] === 'string').map(id => [id, kallor[id]])), _meta: Object.fromEntries(o.foljde.filter(id => kallor._meta?.[id]).map(id => [id, kallor._meta[id]])), _av: Object.fromEntries(o.foljde.filter(id => kallor._av?.[id]).map(id => [id, kallor._av[id]])) }), relation, r.intygs_id);
  const svar = await handelse(db, intygsId, 'SKAPAT');
  if (svar?.result?.resultCode !== 'OK') {
    db.query("UPDATE sim_intygsapplikation SET status = 'raderat' WHERE intygs_id = ?").run(intygsId);
    throw new Fel(502, 'Journalen tog inte emot det nya utkastet.', 'motpart');
  }
  return { intygsId, oppna: `#/intygsapplikation/${encodeURIComponent(intygsId)}`, typ: till.kod, version: till.version, text: till.text, foljde: o.foljde, foljdeInte: o.foljdeInte };
}

export async function fornya(db, personal, intygsId, nu = new Date()) {
  const { r, t, b, grund, handling } = hamta(db, personal, intygsId);
  if (!b.signera && !b.utkast) throw new Fel(404, NEKAD, 'saknas');
  if (!SIGNERAT.includes(r.status)) throw new Fel(409, 'Bara ett signerat intyg kan förnyas. Ett utkast byts mot den version som gäller.', 'konflikt');
  const ny = efterfoljare(t, nu);
  if (!ny && !t.fornyas) throw new Fel(409, `${t.text} förnyas inte. Skriv ett nytt intyg.`, 'konflikt');
  const u = await nyttUr(db, personal, r, t, ny && ny.kod !== t.kod ? 'KOPIA' : 'FRLANG', nu);
  loggaRad(db, { personal_id: personal.id, enhet_id: personal.enhet_id, patient_id: r.patient_id, handling, resurs: `intygsapplikation:${r.intygs_id}:fornya`, grund, resultat: 'tillaten' });
  return { ...u, meddelande: forklaring(t, u) };
}
const forklaring = (fran, u) => {
  const delar = [`Utkastet till ${IT.iMening(u.text)}${u.version !== fran.version || u.typ !== fran.kod ? ` (version ${u.version})` : ''} är skapat.`];
  if (u.foljde.length) delar.push(`${u.foljde.length} ${u.foljde.length === 1 ? 'svar följde' : 'svar följde'} med.`);
  const andrade = u.foljdeInte.filter(x => x.skal.includes('ändrats') || x.skal.includes('finns inte')).length;
  const nyBed = u.foljdeInte.filter(x => x.skal.includes('på nytt')).length;
  if (andrade) delar.push(`${andrade} ${andrade === 1 ? 'fråga har' : 'frågor har'} ändrats och fylls i på nytt.`);
  if (nyBed) delar.push(`${nyBed} ${nyBed === 1 ? 'fråga' : 'frågor'} tar du ställning till på nytt.`);
  return delar.join(' ');
};

// Runda 16, r1: ett läkarintyg till arbetsgivaren (AG7804) ur ett läkarintyg för sjukpenning, som Intygstjänsten
// erbjuder för version 2. Svaren på frågor som är desamma i båda följer med, och frågan om diagnosen till arbetsgivaren
// besvarar läkaren tillsammans med patienten. Patienten slipper berätta allt två gånger.
export async function arbetsgivarintyg(db, personal, intygsId, nu = new Date()) {
  const { r, t, grund, handling } = hamta(db, personal, intygsId);
  if (r.typ !== 'LISJP') throw new Fel(409, 'Ett läkarintyg till arbetsgivaren skapas ur ett läkarintyg för sjukpenning.', 'konflikt');
  if (!['utkast', 'klart_for_signering', 'signerat', 'skickat'].includes(r.status)) throw new Fel(409, 'Intyget är makulerat eller raderat.', 'konflikt');
  const mal = IT.aktuell('AG7804', nu);
  if (!mal) throw new Fel(409, 'Läkarintyget till arbetsgivaren kan inte skrivas just nu.', 'konflikt');
  const u = await nyttUr(db, personal, r, t, 'KOPIA', nu, mal);
  loggaRad(db, { personal_id: personal.id, enhet_id: personal.enhet_id, patient_id: r.patient_id, handling, resurs: `intygsapplikation:${r.intygs_id}:arbetsgivare`, grund, resultat: 'tillaten' });
  return { ...u, meddelande: `${forklaring(t, u)} Fråga patienten om diagnosen ska förmedlas till arbetsgivaren.` };
}

// Utskriften av ett signerat intyg. För ett intyg till arbetsgivaren kan patienten välja att dölja diagnosen, och om
// patienten har sagt nej till att förmedla diagnosen finns den aldrig med. För en patient med skyddade personuppgifter
// står bara personnumret på utskriften, aldrig namnet (som i Webcert).
export function utskrift(db, personal, intygsId, { doljDiagnos = false, val = {} } = {}) {
  const { r, t, grund, handling } = hamta(db, personal, intygsId);
  if (begransad(personal, t)) throw new Fel(403, 'Intyget skrivs ut av den som har signerat det.', 'nekad');
  if (!SIGNERAT.includes(r.status)) throw new Fel(409, 'Bara ett signerat intyg kan skrivas ut.', 'konflikt');
  const p = db.query('SELECT * FROM patienter WHERE id = ?').get(r.patient_id);
  const svar = lasSvar(r);
  const nekat = t.diagnosFraga && svar[t.diagnosFraga] === false;
  const dolj = nekat || (t.sandning === 'utskrift' && doljDiagnos);
  const rader = [];
  const dolda = doldaFor(db, r, personal, t, val);
  for (const k of t.fragor) {
    for (const q of k.fragor) {
      if (!IT.synlig(t, q, svar) || svar[q.id] == null || dolda.includes(q.id)) continue;
      if (q.typ === 'diagnoser' && dolj) continue;
      rader.push({ rubrik: k.rubrik, fraga: q.text, svar: svarText(q, svar[q.id]) });
    }
  }
  loggaRad(db, { personal_id: personal.id, enhet_id: personal.enhet_id, patient_id: r.patient_id, handling, resurs: `intygsapplikation:${r.intygs_id}:utskrift`, grund, resultat: 'tillaten' });
  return {
    rubrik: `${t.blankett}: ${t.text}`, version: r.version, personnummer: visningsPnr(p, true), namn: p.skyddad ? null : visningsnamn(p, true),
    vardenhet: db.query('SELECT namn FROM enheter WHERE id = ?').get(r.enhet_id)?.namn ?? null, signerad: r.signerad, signeradAv: r.personal_namn,
    rader, diagnosDold: dolj, kanDolja: t.sandning === 'utskrift' && !nekat,
    simulerad: 'Utskrift ur den simulerade intygsapplikationen. Intyget är inte giltigt utanför demon.',
  };
}
export function svarText(q, v) {
  if (v == null) return '';
  switch (q.typ) {
    case 'kryss': return 'Ja';
    case 'ja_nej': return v ? 'Ja' : 'Nej';
    case 'val': return q.alt[v] ?? v;
    case 'flerval': return v.map(k => q.alt[k] ?? k).join(', ');
    case 'underlag': return Object.entries(v).map(([k, d]) => `${q.alt[k] ?? k} ${d}`).join(', ');
    case 'period': return `${v.fran} till ${v.till}`;
    case 'perioder': return v.map(x => `${q.alt[x.kod] ?? x.kod} ${x.fran} till ${x.till}`).join(', ');
    case 'diagnoser': return v.map(x => `${x.kod} ${x.text}`).join(', ');
    default: return String(v);
  }
}

export async function atgard(db, personal, intygsId, atgardNamn, val = {}, body = {}) {
  const VILKEN = { signera: 'signera', skicka: 'skriv', makulera: 'signera', radera: 'skriv', klar: 'skriv', byt: 'skriv', fornya: 'las', arbetsgivare: 'las' };
  if (!Object.hasOwn(VILKEN, atgardNamn)) throw new Fel(404, 'Åtgärden finns inte.', 'saknas');
  if (atgardNamn === 'fornya') return fornya(db, personal, intygsId);
  if (atgardNamn === 'arbetsgivare') return arbetsgivarintyg(db, personal, intygsId);
  const { r, t, b, grund, handling } = hamta(db, personal, intygsId, VILKEN[atgardNamn]);
  const tid = iso();
  let extra = {};
  if (atgardNamn === 'signera') {
    if (!UTKAST.includes(r.status)) throw new Fel(409, 'Intyget är redan signerat.', 'konflikt');
    if (!IT.galler(t)) {
      const ny = efterfoljare(t);
      throw new Fel(409, `${t.blankett} kan inte signeras längre. ${IT.giltighetText(t) ?? ''} Byt utkastet mot ${ny ? `${ny.blankett}, ${IT.iMening(ny.text)}` : 'det intyg som gäller'}; de svar som får följa med tas med.`.replace(/\s+/g, ' '), 'konflikt');
    }
    const doldaNu = doldaFor(db, r, personal, t, val);
    const f = IT.saknas(t, Object.fromEntries(Object.entries(lasSvar(r)).filter(([id]) => !doldaNu.includes(id))));
    if (f.length) throw new Fel(400, IT.saknasText(f), 'ogiltig', { saknas: f.map(x => x.fraga), falt: f.map(x => `q-${x.fraga}`) });
    db.query("UPDATE sim_intygsapplikation SET status = 'signerat', signerad = ?, signerad_av = ? WHERE intygs_id = ?").run(tid, personal.hsa_id, r.intygs_id);
    await handelse(db, r.intygs_id, 'SIGNAT');
    // Dödsbevis och dödsorsaksintyg skickas när de signeras (simulerat).
    if (t.sandning === 'vid_signering') {
      db.query("UPDATE sim_intygsapplikation SET status = 'skickat', skickad = ? WHERE intygs_id = ?").run(iso(), r.intygs_id);
      await handelse(db, r.intygs_id, 'SKICKA');
    }
  } else if (atgardNamn === 'klar') {
    if (r.status !== 'utkast') throw new Fel(409, 'Bara ett utkast kan markeras klart för signering.', 'konflikt');
    if (b.signera) throw new Fel(409, 'Du signerar intyget själv.', 'konflikt');
    db.query("UPDATE sim_intygsapplikation SET status = 'klart_for_signering' WHERE intygs_id = ?").run(r.intygs_id);
    await handelse(db, r.intygs_id, 'KFSIGN');
  } else if (atgardNamn === 'skicka') {
    if (t.sandning === 'utskrift') throw new Fel(409, 'Intyget kan inte skickas digitalt. Skriv ut det, så lämnar patienten det till arbetsgivaren.', 'konflikt');
    if (t.sandning === 'post') throw new Fel(409, 'Anmälan skickas inte digitalt. Skriv ut den och skicka den med post till Transportstyrelsen.', 'konflikt');
    if (t.sandning === 'vid_signering') throw new Fel(409, 'Intyget skickades när det signerades.', 'konflikt');
    if (r.status !== 'signerat') throw new Fel(409, 'Bara ett signerat intyg som inte är skickat kan skickas.', 'konflikt');
    if (body?.samrad !== true) throw new Fel(400, 'Intyget skickas i samråd med patienten. Bekräfta att patienten vill att intyget skickas.', 'ogiltig', { falt: ['samrad'] });
    db.query("UPDATE sim_intygsapplikation SET status = 'skickat', skickad = ? WHERE intygs_id = ?").run(tid, r.intygs_id);
    await handelse(db, r.intygs_id, 'SKICKA');
  } else if (atgardNamn === 'makulera') {
    if (!SIGNERAT.includes(r.status)) throw new Fel(409, 'Bara ett signerat intyg kan makuleras. Ett utkast raderas.', 'konflikt');
    const orsak = typeof body?.orsak === 'string' ? body.orsak.trim().slice(0, 500) : '';
    if (!orsak) throw new Fel(400, 'Ange varför intyget makuleras, till exempel att det är utfärdat på fel patient.', 'ogiltig', { falt: ['orsak'] });
    db.query("UPDATE sim_intygsapplikation SET status = 'makulerat', makulerad = ?, makulerad_orsak = ? WHERE intygs_id = ?").run(tid, orsak, r.intygs_id);
    await handelse(db, r.intygs_id, 'MAKULE');
  } else if (atgardNamn === 'byt') {
    if (!UTKAST.includes(r.status)) throw new Fel(409, 'Bara ett utkast byts. Ett signerat intyg förnyas.', 'konflikt');
    if (IT.galler(t)) throw new Fel(409, 'Utkastet gäller redan den version som gäller nu.', 'konflikt');
    const u = await nyttUr(db, personal, r, t, 'KOPIA');
    db.query("UPDATE sim_intygsapplikation SET status = 'raderat' WHERE intygs_id = ?").run(r.intygs_id);
    await handelse(db, r.intygs_id, 'RADERA');
    extra = { ...u, meddelande: forklaring(t, u) };
  } else {
    if (!UTKAST.includes(r.status)) throw new Fel(409, 'Ett signerat intyg raderas inte. Makulera det i stället.', 'konflikt');
    db.query("UPDATE sim_intygsapplikation SET status = 'raderat' WHERE intygs_id = ?").run(r.intygs_id);
    await handelse(db, r.intygs_id, 'RADERA');
  }
  loggaRad(db, { personal_id: personal.id, enhet_id: personal.enhet_id, patient_id: r.patient_id, handling, resurs: `intygsapplikation:${r.intygs_id}:${atgardNamn}`, grund, resultat: 'tillaten' });
  return { ...ut(db, db.query('SELECT * FROM sim_intygsapplikation WHERE intygs_id = ?').get(r.intygs_id), personal, val), ...extra };
}

// Underlaget för en sjukskrivning ur ett signerat läkarintyg för sjukpenning: diagnosen och perioderna med grad. För
// stödet vid sjukskrivning (runda 16, r2), som räknar sjukfallet ur intygen. Ger null för andra intyg.
export function sjukskrivning(db, intygsId) {
  const r = db.query('SELECT * FROM sim_intygsapplikation WHERE intygs_id = ?').get(intygsId);
  if (!r || !['LISJP', 'AG7804'].includes(r.typ)) return null;
  const s = lasSvar(r);
  return { typ: r.typ, version: r.version, status: r.status, diagnoser: s['6'] ?? [], perioder: s['32'] ?? [], motivering: s['37'] ?? null };
}

// Den simulerade intygsapplikationen: en egen tjänst med samma kuvert, validering och fel som en riktig, som tar emot
// CreateDraftCertificate och ListCertificatesForCareWithQA från Vårdkällan. Journalen når den genom transporten i samma
// process.
export const tjanst = r3.simuleradTjanst(NAMN, [LOGISK_ADRESS_INTYGSAPPLIKATION]);
tjanst.registrera(DEF.skapa(), skapaUtkast);
tjanst.registrera(DEF.lista(), lista);
sattTransport((db) => r3.tillMotpart(db, tjanst));
sattFornya((db, personal, intygsId) => fornya(db, personal, intygsId));
