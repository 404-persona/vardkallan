T = 'Affärsreglerna i TKB, journalens kontrakt'
SCH_TEST = {k: f'{T} > {k}: Vårdkällans svar följer fältreglerna i TKB för alla demons patienter' for k in ['GetDiagnosis', 'GetCareDocumentation', 'GetAlertInformation', 'GetCareContacts']}
KONS = f'{T}, Vårdkällan som konsument > Vårdkällans begäran och den simulerade aggregerande tjänstens svar följer reglerna i TKB och Ineras Schematron'
SCH_BEGARAN = {
  'GetDiagnosis': KONS, 'GetDiagnosis:id': {'7.2.3-2', '7.2.3-3', '7.2.3-4', '7.2.3-12', '4.3.2.3-1'},
  'GetCareDocumentation': KONS, 'GetCareDocumentation:id': {'7.1.4-2', '7.1.4-3', '7.1.4-4', '7.1.4-12', '7.1.4-17', '4.3.2.3-1'},
  'GetCareContacts': KONS, 'GetCareContacts:id': {'6.1.2-2', '6.1.2-3', '6.1.2-4', '6.1.2-10', '4.3.2.2-1'},
}
RESERV = 'Vårdkällan följer inte regeln: producenterna lämnar inte ut uppgifter på reservnummer. Vårdkällans reservnummer är lokala och har inte tolv tecken, och säkerhetsgranskningen av runda 14 beslutade att patientens identitet i tjänstekontrakten ska vara ett personnummer eller samordningsnummer. Avvikelsen redovisas i rapporten och är en fråga till Jonas.'
PATIENT = 'Vårdkällan följer inte regeln fullt ut: det finns ingen regel i Vårdkällan för vilka uppgifter som får visas för patienten i nationella e-tjänster, så approvedForPatient är alltid false. Avvikelsen redovisas i rapporten och är en fråga till Jonas.'
TGP = 'Vårdkällan följer inte rekommendationen: AssertCareEngagement svarar med Vårdkällans egen regel för vårdrelation (atkomst.js, 90 dagar efter en vårdkontakt eller ett kvitterat remissvar, och listning), inte med 14 dagar efter en bokning eller remiss som TKB rekommenderar i 4.3.1. TKB säger att reglerna är en rekommendation och att vårdgivaren ansvarar för vilka regler som införs. Avvikelsen redovisas i rapporten och är en fråga till Jonas.'
AVVIKELSER = {
  ('GetDiagnosis', '7.2.3-5'): RESERV, ('GetCareDocumentation', '7.1.4-5'): RESERV, ('GetAlertInformation', '7.3.3-5'): RESERV, ('GetCareContacts', '6.1.2-5'): RESERV,
  ('GetDiagnosis', '4.2.2-1'): PATIENT, ('GetCareDocumentation', '4.2.2-1'): PATIENT, ('GetAlertInformation', '4.2.2-1'): PATIENT, ('GetCareContacts', '4.2.2-1'): PATIENT,
  ('GetDiagnosis', '7.2.3-29'): PATIENT, ('GetCareDocumentation', '7.1.4-31'): PATIENT, ('GetAlertInformation', '7.3.3-29'): PATIENT, ('GetCareContacts', '6.1.2-26'): PATIENT, ('GetCareContacts', 'Regel 3'): PATIENT,
  ('GetAlertInformation', 'Regel 2'): 'Vårdkällan följer inte regeln: typen av uppmärksamhetsinformation skickas som text (originalText), eftersom koderna i KV Informationstyp och KV Uppmärksamhetstyp inte finns bland de pinnade filerna och Vårdkällans egna typer inte har någon OID. Det följer CVType men inte regeln för NPÖ. Avvikelsen redovisas i rapporten.',
  ('AssertCareEngagement', '4.3.1.2-1'): TGP, ('AssertCareEngagement', '4.3.1.2-3'): TGP, ('AssertCareEngagement', 'p1'): TGP, ('AssertCareEngagement', 'P1'): TGP, ('AssertCareEngagement', '5.1-1'): TGP,
}
MRC = 'Vårdkällan följer inte regeln fullt ut: mostRecentContent räknas fram ur uppgifternas kliniska tid och minskar aldrig, men när en av flera uppgifter tas bort uppdateras posten inte med tiden för borttaget. Vårdkällan sparar inte tiden för borttag av en enskild uppgift. Avvikelsen redovisas i rapporten.'
ADR_SPARR = 'Vårdkällan följer inte regeln: alla anrop till spärrtjänsten går till den simulerade nationella adressen, också GetBlocksForPatient och hävningarna, som enligt tabellen i 2.7 ska adresseras till vårdgivaren. Att ändra adresseringen kräver ett beslut om hur hävningen av en annan vårdgivares spärr ska gå till (se rapporten).'
ADR_SAMTYCKE = 'Vårdkällan följer inte regeln: alla anrop till samtyckestjänsten går till den simulerade nationella adressen, inte till vårdgivarens HSA-id som tabellen i 2.7 anger. Avvikelsen redovisas i rapporten.'
EJ_ANROPAT = 'Vårdkällan anropar inte kontraktet: det finns bara en simulerad producent, fast tabellen i docs/rivta.md säger att Vårdkällan är konsument. Avvikelsen redovisas i rapporten och är en fråga till Jonas.'
for k, i in [('Update', '4.1-11'), ('Update', '4.1-30'), ('GetDiagnosis', '4.1-10'), ('GetCareDocumentation', '4.1-10'), ('GetAlertInformation', '4.1-10'), ('GetCareContacts', '4.1-10')]: AVVIKELSER[(k, i)] = MRC
for k in ['CheckBlocks', 'GetAllBlocksForPatient', 'GetBlocksForPatient', 'RegisterTemporaryExtendedRevoke', 'CancelTemporaryExtendedRevoke']:
    for i in ['2.7-3', '2.7-5']: AVVIKELSER[(k, i)] = ADR_SPARR
for k in ['CheckConsent', 'RegisterExtendedConsent', 'CancelExtendedConsent', 'GetExtendedConsentsForPatient']:
    for i in ['2.7-3', '2.7-5']: AVVIKELSER[(k, i)] = ADR_SAMTYCKE
AVVIKELSER[('GetAllBlocksForPatient', '19.1.4-3')] = AVVIKELSER[('GetBlocksForPatient', '19.1.4-3')] = 'Den simulerade spärrtjänsten följer inte regeln: spärrarna hos den andra vårdgivaren är yttre spärrar med vårdenhet, eftersom demon har en spärr per spärrad uppgift. Avvikelsen redovisas i rapporten.'
AVVIKELSER[('RegisterTemporaryExtendedRevoke', '17.4-5')] = 'Vårdkällan följer inte regeln: hävningen skickas utan RevokeReasonText, som TKB beskriver som obligatorisk fast schemat har 0..1. Avvikelsen redovisas i rapporten.'
AVVIKELSER[('GetMedicationHistory', '7.2.3-iiRoot-1')] = AVVIKELSER[('GetMedicationHistory', '7.2.3-iiExt-1')] = AVVIKELSER[('GetMedicationHistory', '7.2.3-prescriptionId-1')] = 'Den simulerade aggregerande tjänsten följer inte regeln: ordinationens id har vårdgivarens HSA-id som root, inte en UUID eller OID, och extension är inte documentId. Avvikelsen redovisas i rapporten.'
import json as _j
for _f, _k in [('riv.ehr.patientconsent', 'CheckConsent'), ('riv.ehr.blocking', 'CancelTemporaryExtendedRevoke')]:
    for _r in _j.load(open(f'/home/darkstar/Projekt/vk-ts2/app/rivta-regler/{_f}/{_k}.json', encoding='utf-8'))['regler']:
        if _r['gäller'] in ('konsument', 'båda') and (_k, _r['id']) not in AVVIKELSER: AVVIKELSER[(_k, _r['id'])] = EJ_ANROPAT
