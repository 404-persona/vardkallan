// Runda 14, r2: Vårdkällan som producent av journaluppgifter för NPÖ, Journalen och sammanhållen journalföring
// (Sussa 2.2.1.7, 2.2.1.8 och 2.2.1.10), mot de pinnade tjänstekontrakten i RIVTA. Varje producent läser genom
// FHIR-API:t med den anropande organisationens systemkonto (konsumenter.js), så att behörighetsmotorn prövar varje
// uppgift: bara de vårdenheter och informationsmängder som organisationen är ansluten för, aldrig patienter med
// skyddade personuppgifter, aldrig spärrade uppgifter och aldrig det som systemförvaltningen har undantagit från
// nationella tjänster. Varje läsning loggas på patienten med kontraktet och organisationen i loggens resurs.
//
// En patient som inte finns och en patient som organisationen inte får se ger samma svar: inga poster och resultatet OK.
import { randomUUID } from 'node:crypto';
import { kontrakt } from './kontrakt.js';
import { SoapFel } from './soap.js';
import { vardkallan } from './tjanst.js';
import { vardgivare } from './konsumenter.js';
import { fhirResurser, enhetAv, datumRiv } from '../tjanstekontrakt.js';
import { tolka as tolkaIdentitet, hittaPaIdentitet } from '../identitet.js';
import { loggaRad } from '../logg.js';
import { Fel } from '../db.js';
import { harVardrelation, vardenhetFor, prova, aktivaSparrar } from '../atkomst.js';

export const OID = { personnummer: '1.2.752.129.2.1.3.1', samordningsnummer: '1.2.752.129.2.1.3.3', icd10se: '1.2.752.116.1.1.1', kva: '1.2.752.116.1.3.2.1.4', atc: '1.2.752.129.2.2.3.1.1' };

// Testspår 2: logId ska vara en UUID (TKB clinicalprocess:healthcond:description, fältet result.logId).
const logId = () => randomUUID();
const datum = (ts) => (ts ? ts.slice(0, 8) : null);

// Patienten i begäran. Ger { pid, patientId } eller { fel } med ett resultat enligt kontraktet.
function patientI(db, begaran) {
  const id = String(begaran.patientId?.id ?? '');
  const typ = begaran.patientId?.type;
  if (!/^\d{12}$/.test(id) || ![OID.personnummer, OID.samordningsnummer].includes(typ)) {
    return { fel: 'Patientens identitet ska vara ett personnummer eller samordningsnummer med tolv siffror och ha OID:n för sin typ.' };
  }
  return { pid: patientFranPersonId(db, id, typ), patientId: { id, type: typ } };
}

// Säkerhetsgranskningen av runda 14: samma uppslag av patienten i alla kontrakt. Bara exakt tolv siffror, och bara som
// personnummer eller samordningsnummer (med rätt typ när den anges). Allt annat ger ingen patient.
export function patientFranPersonId(db, id, typOid = null) {
  const s = String(id ?? '');
  if (!/^\d{12}$/.test(s)) return null;
  const t = tolkaIdentitet(s);
  if (!t?.ok || !['personnummer', 'samordningsnummer'].includes(t.typ)) return null;
  if (typOid && typOid !== (t.typ === 'personnummer' ? OID.personnummer : OID.samordningsnummer)) return null;
  return hittaPaIdentitet(db, t)?.patientId ?? null;
}

// Läser resurserna för kontraktet med organisationens systemkonto. Ger [] för en patient som inte finns eller som
// organisationen inte får se, och loggar uppslaget som nekat.
function resurser(db, k, konsument, pid, typer) {
  const personal = konsument.personal;
  const extra = `&_konsument=${encodeURIComponent(konsument.hsaId)}`;
  if (!pid) {
    loggaRad(db, { personal_id: personal.id, enhet_id: personal.enhet_id, handling: 'las_oversikt', resurs: `rivta/${k.namn}/${k.version}?_konsument=${konsument.hsaId}`, grund: 'nekad', resultat: 'nekad' });
    return [];
  }
  try { return fhirResurser({ db, personal }, k.namn, pid, { typer, extra }); } catch (e) {
    if (e instanceof Fel && e.status === 403) return [];
    throw e;
  }
}

// Huvudet för en post (PatientSummaryHeaderType och CPatientSummaryHeaderType har samma fält utom källsystemets namn).
// Testspår 2: fälten som TKB anger som N/A (kardinalitet 0..0) skickas aldrig: documentTitle och documentTime i
// GetDiagnosis och GetAlertInformation, och nullified och nullifiedReason i alla tre kontrakten i
// clinicalprocess:healthcond:description (dokument: true ger documentTitle och documentTime, för GetCareDocumentation).
function huvud(db, r, patientId, { kallsystemNamn = 'sourceSystemHSAId', titel = null, dokument = false } = {}) {
  const e = enhetAv(db, r);
  const tid = datumRiv(r.date ?? r.recordedDate ?? r.period?.start ?? r.effectiveDateTime ?? r.performedDateTime ?? r.authoredOn ?? null);
  const forfattare = r.author?.find?.(a => a.reference?.startsWith('Practitioner/')) ?? (r.recorder?.reference?.startsWith('Practitioner/') ? r.recorder : null);
  const hsa = forfattare ? db.query('SELECT hsa_id FROM personal WHERE id = ?').get(forfattare.reference.slice(13))?.hsa_id ?? null : null;
  const vg = vardgivare(db);
  return {
    documentId: `${r.resourceType}/${r.id}`, [kallsystemNamn]: vg, ...(dokument ? { documentTitle: titel, documentTime: tid } : {}), patientId,
    accountableHealthcareProfessional: {
      authorTime: tid, healthcareProfessionalHSAId: hsa, healthcareProfessionalName: forfattare?.display ?? null,
      healthcareProfessionalOrgUnit: e ? { orgUnitHSAId: e.hsa_id, orgUnitName: e.namn } : null,
      healthcareProfessionalCareUnitHSAId: e?.hsa_id ?? null, healthcareProfessionalCareGiverHSAId: vg,
    },
    approvedForPatient: false, careContactId: r.encounter?.reference?.split('/')[1] ?? null,
  };
}

// Filtren i begäran: vårdenheter, period, källsystem och vårdkontakter. tider(post) ger postens tidpunkter för
// perioden enligt kontraktets TKB: posten kommer med när någon av dem ligger i perioden (GetCareDocumentation och
// GetDiagnosis). intervall(post) ger i stället { start, slut } för ett intervall som ska överlappa perioden
// (GetAlertInformation och GetCareContacts).
function filtrera(poster, begaran, huvudNamn, { tider = null, intervall = null } = {}) {
  const enheter = new Set(begaran.careUnitHSAId ?? begaran.careUnitHSAid ?? []);
  const kontakter = new Set(begaran.careContactId ?? []);
  const start = begaran.timePeriod?.start ?? null;
  const slut = begaran.timePeriod?.end ?? null;
  return poster.filter(p => {
    const h = p[huvudNamn];
    if (enheter.size && !enheter.has(h.accountableHealthcareProfessional?.healthcareProfessionalCareUnitHSAId)) return false;
    if (kontakter.size && !kontakter.has(h.careContactId)) return false;
    if (!start && !slut) return true;
    if (intervall) {
      const i = intervall(p);
      if (!i.start) return false;
      return (!slut || datum(i.start) <= slut) && (!start || !i.slut || datum(i.slut) >= start);
    }
    return tider(p).filter(Boolean).some(t => (!start || datum(t) >= start) && (!slut || datum(t) <= slut));
  });
}

// Testspår 2: källsystemet i begäran ska vara samma som den logiska adressen, och ska anges när vårdkontakter anges
// (TKB clinicalprocess:healthcond:description, fältet sourceSystemHSAId). Annars är svaret bara ett resultat med
// INVALID_REQUEST. Ger felets text eller null.
function kallsystemFel(begaran, logiskAdress) {
  const kalla = begaran.sourceSystemHSAId ?? begaran.sourceSystemHSAid ?? null;
  if (kalla && kalla !== logiskAdress) return `Källsystemet ${kalla} i begäran är inte samma som den logiska adressen ${logiskAdress}.`;
  if ((begaran.careContactId ?? []).length && !kalla) return 'Källsystemet ska anges när vårdkontakter anges i begäran.';
  return null;
}

const ogiltig = (text) => ({ resultCode: 'ERROR', errorCode: 'INVALID_REQUEST', logId: logId(), message: text });
const ok = () => ({ resultCode: 'OK', logId: logId() });

// ---------------------------------------------------------------------------------------------------------------
// GetDiagnosis 2.0 (riv.clinicalprocess.healthcond.description): diagnoser ur FHIR Condition med ICD-10-SE. Perioden
// gäller authorTime, signatureTime och diagnosisTime (TKB, fältet timePeriod).
export const GET_DIAGNOSIS = kontrakt('riv.clinicalprocess.healthcond.description', 'GetDiagnosis', '2.0');
vardkallan.registrera(GET_DIAGNOSIS, (ctx, { begaran, konsument, def, logiskAdress }) => {
  const { db } = ctx;
  const p = patientI(db, begaran);
  if (p.fel) return { result: ogiltig(p.fel) };
  const k = kallsystemFel(begaran, logiskAdress);
  if (k) return { result: ogiltig(k) };
  const poster = resurser(db, def, konsument, p.pid, ['Condition']).map(r => {
    const c = r.code?.coding?.[0];
    // Testspår 2: en kod skickas bara med kodsystem och klartext; annars står diagnosen som text (CVType).
    const kod = c?.code ? { code: c.code, codeSystem: OID.icd10se, displayName: c.display ?? r.code?.text ?? c.code } : { originalText: r.code?.text ?? c?.display ?? 'Diagnos utan kod' };
    return {
      diagnosisHeader: huvud(db, r, p.patientId),
      diagnosisBody: {
        typeOfDiagnosis: r.category?.[0]?.text === 'Huvuddiagnos' ? 'Huvuddiagnos' : 'Bidiagnos',
        diagnosisTime: datumRiv(r.recordedDate),
        diagnosisCode: kod,
      },
    };
  });
  return { diagnosis: filtrera(poster, begaran, 'diagnosisHeader', { tider: (x) => [x.diagnosisHeader.accountableHealthcareProfessional.authorTime, x.diagnosisHeader.legalAuthenticator?.signatureTime, x.diagnosisBody.diagnosisTime] }), result: ok() };
});

// ---------------------------------------------------------------------------------------------------------------
// GetCareDocumentation 2.1: journalanteckningar ur FHIR Composition som ostrukturerad text. Testspår 2: typen av
// anteckning (clinicalDocumentNoteCode, KV Anteckningstyp) är obligatorisk när clinicalDocumentTypeCode saknas, och
// clinicalDocumentTypeCode används inte (kardinalitet 0..0), så varje anteckning får en typ. Den läses ur rubriken, och en
// rubrik som inte säger något om typen blir en besöksanteckning (bes), eller en slutenvårdsanteckning (sva) när
// anteckningen hör till ett vårdtillfälle. Perioden gäller documentTime, authorTime och signatureTime.
export const GET_CARE_DOCUMENTATION = kontrakt('riv.clinicalprocess.healthcond.description', 'GetCareDocumentation', '2.1');
const avHtml = (div) => String(div ?? '').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
export function anteckningsKod(titel, { vardtillfalle = false } = {}) {
  const t = String(titel ?? '').toLowerCase();
  if (/inskrivning|intagning/.test(t)) return 'ins';
  if (/epikris|slutanteckning|utskrivning/.test(t)) return 'slu';
  if (/telefon|video|distans/.test(t)) return 'auf';
  if (/utredning/.test(t)) return 'utr';
  if (/behandling|åtgärd|operation/.test(t)) return 'atb';
  if (/sammanfattning/.test(t)) return 'sam';
  if (/samordning|vårdplan/.test(t)) return 'sao';
  if (/daganteckning|slutenvård|avdelning/.test(t)) return 'sva';
  return vardtillfalle ? 'sva' : 'bes';
}
const iVardtillfalle = (db, r) => {
  const id = r.encounter?.reference?.split('/')[1];
  if (!id) return false;
  if (/^vt-/.test(id)) return true;
  return /^\d+$/.test(id) && Boolean(db.query('SELECT vardtillfalle_id FROM vardkontakter WHERE id = ?').get(Number(id))?.vardtillfalle_id);
};
vardkallan.registrera(GET_CARE_DOCUMENTATION, (ctx, { begaran, konsument, def, logiskAdress }) => {
  const { db } = ctx;
  const p = patientI(db, begaran);
  if (p.fel) return { result: ogiltig(p.fel) };
  const k = kallsystemFel(begaran, logiskAdress);
  if (k) return { result: ogiltig(k) };
  const poster = resurser(db, def, konsument, p.pid, ['Composition']).map(r => {
    const h = huvud(db, r, p.patientId, { kallsystemNamn: 'sourceSystemHSAid', titel: r.title ?? null, dokument: true });
    return {
      careDocumentationHeader: h,
      careDocumentationBody: {
        clinicalDocumentNote: {
          clinicalDocumentNoteCode: anteckningsKod(r.title, { vardtillfalle: iVardtillfalle(db, r) }), clinicalDocumentNoteTitle: r.title ?? null,
          clinicalDocumentNoteText: (r.section ?? []).map(s => `${s.title}: ${avHtml(s.text?.div)}`).join('\n'),
        },
      },
    };
  });
  return { careDocumentation: filtrera(poster, begaran, 'careDocumentationHeader', { tider: (x) => [x.careDocumentationHeader.documentTime, x.careDocumentationHeader.accountableHealthcareProfessional.authorTime, x.careDocumentationHeader.legalAuthenticator?.signatureTime] }), result: ok() };
});

// ---------------------------------------------------------------------------------------------------------------
// GetAlertInformation 2.0: överkänslighet ur FHIR AllergyIntolerance och övrig uppmärksamhetsinformation ur Flag.
// Testspår 2: typen av uppmärksamhetsinformation, typen av överkänslighet och allvarlighetsgraden står som text
// (originalText i CVType), eftersom Vårdkällans egna koder inte har någon OID och en kod bara får skickas med sitt
// kodsystem. Uppmärksamhetsinformation som inte är överkänslighet skickas som ostrukturerad
// (unstructuredAlertInformation), eftersom exakt en av de sex typerna ska anges. Perioden är giltighetstiden, som ska
// överlappa den efterfrågade.
export const GET_ALERT_INFORMATION = kontrakt('riv.clinicalprocess.healthcond.description', 'GetAlertInformation', '2.0');
vardkallan.registrera(GET_ALERT_INFORMATION, (ctx, { begaran, konsument, def, logiskAdress }) => {
  const { db } = ctx;
  const p = patientI(db, begaran);
  if (p.fel) return { result: ogiltig(p.fel) };
  const k = kallsystemFel(begaran, logiskAdress);
  if (k) return { result: ogiltig(k) };
  const text = (t) => ({ originalText: t });
  const poster = resurser(db, def, konsument, p.pid, ['Flag', 'AllergyIntolerance']).map(r => {
    const h = huvud(db, r, p.patientId);
    if (r.resourceType === 'AllergyIntolerance') {
      const atc = r.code?.coding?.find(c => /atc/i.test(c.system ?? ''));
      const lakemedel = r.category?.[0] === 'medication';
      return {
        alertInformationHeader: h,
        alertInformationBody: {
          typeOfAlertInformation: text('Överkänslighet'),
          validityTimePeriod: { start: datumRiv(r.recordedDate), end: r.clinicalStatus?.coding?.[0]?.code === 'inactive' ? datumRiv(r.note?.[0]?.time) : null },
          alertInformationComment: r.code?.text ?? null,
          hypersensitivity: {
            typeOfHypersensitivity: text(lakemedel ? 'Läkemedel' : 'Annat'),
            degreeOfSeverity: text(r.criticality === 'high' ? 'Allvarlig' : 'Mindre allvarlig'),
            pharmaceuticalHypersensitivity: lakemedel ? (atc ? { atcSubstance: { code: atc.code, codeSystem: OID.atc, displayName: atc.display ?? atc.code } } : { nonATCSubstance: r.code?.text ?? 'Okänt läkemedel', nonATCSubstanceComment: 'Substansen saknar ATC-kod i Vårdkällan.' }) : null,
            otherHypersensitivity: lakemedel ? null : { hypersensitivityAgent: r.code?.text ?? null },
          },
        },
      };
    }
    const typ = r.category?.[0]?.text ?? 'Uppmärksamhetsinformation';
    return {
      alertInformationHeader: h,
      alertInformationBody: {
        typeOfAlertInformation: text(typ),
        validityTimePeriod: { start: datumRiv(r.period?.start), end: datumRiv(r.period?.end) },
        alertInformationComment: r.code?.text ?? null,
        unstructuredAlertInformation: { unstructuredAlertInformationHeading: typ, unstructuredAlertInformationContent: r.code?.text ?? typ },
      },
    };
  });
  return { alertInformation: filtrera(poster, begaran, 'alertInformationHeader', { intervall: (x) => ({ start: x.alertInformationBody.validityTimePeriod.start, slut: x.alertInformationBody.obsoleteTime ?? x.alertInformationBody.validityTimePeriod.end }) }), result: ok() };
});

// ---------------------------------------------------------------------------------------------------------------
// GetCareContacts 2.0 (riv.clinicalprocess.logistics.logistics): vårdkontakter ur FHIR Encounter. Svaret har inget
// resultat. Kodverken i kontraktet: typ 1 besök, 2 telefon, 3 vårdtillfälle, 4 dagsjukvård och 5 annan; status 1 ej
// påbörjad, 2 inställd, 3 pågående, 4 avbruten och 5 avslutad.
// Testspår 2, efter TKB och Ineras testsvit:
// - documentId är vårdkontaktens id, samma id som careContactId i journalens andra kontrakt och i begäran;
// - den ansvariga hälso- och sjukvårdspersonen anges när den finns (Regel 1 och 4: vårdenheten, vårdgivaren och
//   organisationen behövs för spärrar och loggning i sammanhållen journalföring), annars bara tiden och enheten;
// - ett källsystem som inte är den logiska adressen, och vårdkontakter utan källsystem, är fel i begäran (SOAP Fault,
//   eftersom svaret inte har något resultat; testfallen 1.10 och 1.11);
// - perioden är vårdkontaktens tid, som ska överlappa den efterfrågade.
export const GET_CARE_CONTACTS = kontrakt('riv.clinicalprocess.logistics.logistics', 'GetCareContacts', '2.0');
const KONTAKTTYP = { IMP: 3, VR: 2, AMB: 1 };
const KONTAKTSTATUS = { planned: 1, cancelled: 2, 'in-progress': 3, arrived: 3, finished: 5 };
vardkallan.registrera(GET_CARE_CONTACTS, (ctx, { begaran, konsument, def, logiskAdress }) => {
  const { db } = ctx;
  const k = kallsystemFel(begaran, logiskAdress);
  if (k) throw new SoapFel('Client', k);
  const p = patientI(db, begaran);
  if (p.fel) return {};
  const vg = vardgivare(db);
  const poster = [];
  for (const r of resurser(db, def, konsument, p.pid, ['Encounter'])) {
    const e = enhetAv(db, r);
    const tid = datumRiv(r.period?.start);
    if (!e || !tid) continue;
    // Testspår 2 (TKB 6.1.2): typen utelämnas när den är okänd. En planerad kontakt och ett pågående vårdtillfälle har
    // ingen sluttid, och för ett besök är sluttiden samma som starttiden.
    const kod = r.class?.code ? (KONTAKTTYP[r.class.code] ?? 5) : null;
    const status = KONTAKTSTATUS[r.status] ?? null;
    const slutet = status === 1 || (kod === 3 && status === 3) ? null : kod === 1 ? tid : datumRiv(r.period?.end);
    const ansvarig = r.participant?.find(x => x.individual?.reference?.startsWith('Practitioner/'))?.individual ?? null;
    const hsa = ansvarig ? db.query('SELECT hsa_id FROM personal WHERE id = ?').get(ansvarig.reference.slice(13))?.hsa_id ?? null : null;
    poster.push({
      careContactHeader: {
        documentId: String(r.id), sourceSystemHSAId: vg, patientId: p.patientId,
        accountableHealthcareProfessional: {
          authorTime: tid, healthcareProfessionalHSAId: hsa ?? e.hsa_id, healthcareProfessionalName: ansvarig?.display ?? e.namn,
          healthcareProfessionalOrgUnit: { orgUnitHSAId: e.hsa_id, orgUnitName: e.namn },
          healthcareProfessionalCareUnitHSAId: e.hsa_id, healthcareProfessionalCareGiverHSAId: vg,
        },
        approvedForPatient: false, nullified: false,
      },
      careContactBody: {
        careContactCode: kod, careContactReason: r.reasonCode?.[0]?.text ?? null,
        careContactOrgUnit: { orgUnitHSAId: e.hsa_id, orgUnitName: e.namn },
        careContactTimePeriod: { start: tid, end: slutet },
        careContactStatus: status,
      },
    });
  }
  const filtrerade = filtrera(poster.map(x => ({ ...x, careContactHeader: { ...x.careContactHeader, careContactId: x.careContactHeader.documentId } })), begaran, 'careContactHeader',
    { intervall: (x) => ({ start: x.careContactBody.careContactTimePeriod.start, slut: x.careContactBody.careContactTimePeriod.end ?? x.careContactBody.careContactTimePeriod.start }) });
  return { careContact: filtrerade.map(x => { const { careContactId, ...h } = x.careContactHeader; void careContactId; return { ...x, careContactHeader: h }; }) };
});

// ---------------------------------------------------------------------------------------------------------------
// AssertCareEngagement 1.0 (riv.ehr.accesscontrol, Tillgänglig patient): har en viss person på en viss vårdenhet en
// vårdrelation till patienten? Säkerhetsgranskningen av runda 14: frågan prövas först i behörighetsmotorn med den
// anropande organisationens systemkonto och vårdenheten som resurs, som för de andra kontrakten. Svaret är nej när
// åtkomsten nekas: en vårdenhet som kontot inte omfattar, en vårdenhet som patienten har spärrat (ett systemkonto kan
// inte fråga patienten om samtycke, så ett samtycke ändrar inte svaret), skyddade personuppgifter, fel vårdgivare eller en
// identitet som inte är ett personnummer eller samordningsnummer med tolv siffror. Bara när åtkomsten är tillåten räknas
// vårdrelationen med samma regel som för all åtkomst i Vårdkällan (harVardrelation). Frågan loggas på patienten med det
// verkliga utfallet, tillåten eller nekad.
export const ASSERT_CARE_ENGAGEMENT = kontrakt('riv.ehr.accesscontrol', 'AssertCareEngagement', '1.0');
// Testspår 2 (TKB 3.2): adresseringen är verksamhetsbaserad, och konsumenten anropar med den sammansatta adressen
// VårdgivarensHSA-id#VårdenhetensHSA-id för medarbetarens uppdrag. Vårdgivarens HSA-id ensamt tas också emot, som i Ineras
// testsvit. En sammansatt adress som inte stämmer med vårdgivaren och vårdenheten i begäran är ett fel i begäran.
const adresserTgp = (db) => {
  const vg = vardgivare(db);
  return [...require('./konsumenter.js').egnaAdresser(db), ...db.query("SELECT hsa_id FROM enheter WHERE typ = 'vardenhet' AND hsa_id IS NOT NULL").all().map(r => `${vg}#${r.hsa_id}`)];
};
vardkallan.registrera(ASSERT_CARE_ENGAGEMENT, (ctx, { begaran, konsument, logiskAdress }) => {
  const { db } = ctx;
  if (logiskAdress?.includes('#') && logiskAdress !== `${begaran.careGiverHsaIdentity}#${begaran.careUnitHsaIdentity}`) {
    throw new SoapFel('Client', `Den logiska adressen ${logiskAdress} stämmer inte med vårdgivaren och vårdenheten i begäran.`);
  }
  const pid = patientFranPersonId(db, begaran.subjectOfCareId);
  if (!pid) return { HasCareEngagement: false };
  const enhet = db.query("SELECT id FROM enheter WHERE hsa_id = ? AND typ = 'vardenhet'").get(begaran.careUnitHsaIdentity);
  const person = db.query("SELECT id, enhet_id FROM personal WHERE hsa_id = ? AND aktiv = 1 AND yrke <> 'systemkonto'").get(begaran.performer);
  const konto = require('../systemkonton.js').kontoFor(db, konsument.personal.id);
  const atkomst = enhet && begaran.careGiverHsaIdentity === vardgivare(db) && konto?.vardenheter.includes(enhet.id)
    ? prova(db, { personal: konsument.personal, patient: pid, handling: 'las_admin', resurs: { enhet_id: enhet.id } }) : { tillaten: false };
  const tillaten = atkomst.tillaten && !aktivaSparrar(db, pid).includes(enhet.id);
  const svar = Boolean(tillaten && person && vardenhetFor(db, person.enhet_id) === enhet.id && harVardrelation(db, pid, enhet.id, ctx.nu ?? new Date()));
  loggaRad(db, { personal_id: konsument.personal.id, enhet_id: konsument.personal.enhet_id, patient_id: pid, handling: 'las_admin',
    resurs: `rivta/AssertCareEngagement/1.0?_konsument=${konsument.hsaId}`, grund: tillaten ? 'systemkonto' : 'nekad', resultat: tillaten ? 'tillaten' : 'nekad' });
  return { HasCareEngagement: svar };
}, { adresser: adresserTgp });
