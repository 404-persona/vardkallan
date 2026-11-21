import sys
sys.path.insert(0, '/home/darkstar/tmp/ts2/verktyg')
from sch import *

D = 'riv.clinicalprocess.healthcond.description'
L = 'riv.clinicalprocess.logistics.logistics'
GEMENSAMT_TS = ['authorTime', 'signatureTime', 'documentTime']


def diagnos(s):
    n = 'GetDiagnosis'
    patient(s, n + '-begaran', '*:GetDiagnosis/*:patientId', '7.2.3-2', '7.2.3-3', '7.2.3-4')
    s.m(n + '-kallsystem', [('*:GetDiagnosis', [('7.2.3-12', 'not(*:careContactId) or normalize-space(*:sourceSystemHSAId)', 'sourceSystemHSAId ska anges om careContactId anges.')])])
    patient(s, n + '-svar', '*:diagnosisHeader/*:patientId', '7.2.3-19', '7.2.3-20', '7.2.3-21')
    vardpersonal(s, n, '7.2.3-22', '7.2.3-23', '7.2.3-28', 'Regel 1')
    cv(s, n, 'healthcareProfessionalRoleCode', code='7.2.3-24', codeSystem='7.2.3-25', dnKrav='7.2.3-26', originalText='7.2.3-27')
    finnsInte(s, n, 'diagnosisHeader', [('documentTitle', '7.2.3-30'), ('documentTime', '7.2.3-31'), ('nullified', '7.2.3-32'), ('nullifiedReason', '7.2.3-33')])
    cv(s, n, 'diagnosisCode', code='7.2.3-35', displayName='7.2.3-36', codeSystem='7.2.3-37', originalText='7.2.3-39')
    s.m(n + '-relaterad', [('*:relatedDiagnosis/*:documentId', [('7.2.3-40', '. = /*:Envelope/*:Body/*:GetDiagnosisResponse/*:diagnosis/*:diagnosisHeader/*:documentId', 'relatedDiagnosis ska peka på en diagnos i svaret.')])])
    resultat(s, n, 'GetDiagnosisResponse', '7.2.3-41', '7.2.3-42', '7.2.3-43', '4.4.1.1-1')
    tider(s, n, GEMENSAMT_TS + ['diagnosisTime'], '4.3.2.3-2', '4.3.2.3-1', ['*:timePeriod/*:start', '*:timePeriod/*:end'])
    s.m(n + '-tidszon', [('*:diagnosisBody/*:diagnosisTime', [('4.3.2.4-1', "not(matches(., '[TZ+]'))", 'Tidpunkter anges utan tidszon.')])])


def dokumentation(s):
    n = 'GetCareDocumentation'
    patient(s, n + '-begaran', '*:GetCareDocumentation/*:patientId', '7.1.4-2', '7.1.4-3', '7.1.4-4')
    s.m(n + '-kallsystem', [('*:GetCareDocumentation', [('7.1.4-12', 'not(*:careContactId) or normalize-space(*:sourceSystemHSAid) or normalize-space(*:sourceSystemHSAId)', 'sourceSystemHSAId ska anges om careContactId anges.'),
                                                       ('7.1.4-17', 'not(*:careContactId) or normalize-space(*:sourceSystemHSAid) or normalize-space(*:sourceSystemHSAId)', 'sourceSystemHSAId måste anges om careContactId anges.')])])
    patient(s, n + '-svar', '*:careDocumentationHeader/*:patientId', '7.1.4-20', '7.1.4-21', '7.1.4-22')
    vardpersonal(s, n, '7.1.4-23', '7.1.4-24', '7.1.4-29', 'Regel 1')
    s.m(n + '-org', [('*:accountableHealthcareProfessional/*:healthcareProfessionalOrgUnit', [('7.1.4-30', 'normalize-space(*:orgUnitHSAId)', 'orgUnitHSAId ska anges (lokalt id om HSA-id saknas).')])])
    cv(s, n, 'healthcareProfessionalRoleCode', code='7.1.4-25', codeSystem='7.1.4-26', dnKrav='7.1.4-27', originalText='7.1.4-28')
    finnsInte(s, n, 'careDocumentationHeader', [('nullified', '7.1.4-32'), ('nullifiedReason', '7.1.4-33')])
    s.m(n + '-anteckningstyp', [('*:clinicalDocumentNote', [
        ('7.1.4-34', '*:clinicalDocumentNoteCode or *:clinicalDocumentTypeCode', 'clinicalDocumentNoteCode är obligatorisk när clinicalDocumentTypeCode saknas.'),
        ('7.1.4-35', 'not(*:clinicalDocumentNoteCode and *:clinicalDocumentTypeCode)', 'clinicalDocumentNoteCode och clinicalDocumentTypeCode får inte anges samtidigt.'),
        ('7.1.4-36', 'not(*:clinicalDocumentTypeCode)', 'clinicalDocumentTypeCode används inte (0..0).'),
        ('7.1.4-37', 'count(*:clinicalDocumentNoteText) + count(*:multimediaEntry) = 1', 'Innehållet skickas antingen som clinicalDocumentNoteText eller som multimediaEntry.')])])
    s.m(n + '-multimedia', [('*:multimediaEntry', [('7.1.4-38', 'not(*:id)', 'multimediaEntry.id används inte (0..0).'),
                                                   ('7.1.4-39', 'count(*:value) + count(*:reference) = 1', 'Ett och endast ett av value och reference ska anges.')])])
    s.m(n + '-avvikande', [('*:dissentingOpinion/*:personId', [('7.1.4-42', "string-length(*:id) = 12 and not(matches(*:id, '[ -+]'))", 'Personens id ska ha tolv tecken utan avskiljare.'),
                                                               ('7.1.4-43', f"not(matches(*:id, '{PNR}')) or *:type = '{PNR_OID}'", 'Ett personnummer ska ha Skatteverkets OID.')])])
    resultat(s, n, 'GetCareDocumentationResponse', '7.1.4-44', '7.1.4-45', '7.1.4-46', '4.4.1.1-1')
    tider(s, n, GEMENSAMT_TS, '4.3.2.3-2', '4.3.2.3-1', ['*:timePeriod/*:start', '*:timePeriod/*:end'])


CV_UPP = [  # fält, code, displayName, codeSystem, originalText
    ('typeOfHypersensitivity', '7.3.3-44', '7.3.3-45', '7.3.3-46', '7.3.3-47'),
    ('degreeOfSeverity', '7.3.3-50', '7.3.3-51', '7.3.3-52', '7.3.3-53'),
    ('degreeOfCertainty', '7.3.3-55', '7.3.3-56', '7.3.3-57', '7.3.3-58'),
    ('pharmaceuticalProductId', '7.3.3-66', '7.3.3-67', '7.3.3-68', '7.3.3-69'),
    ('hypersensitivityAgentCode', '7.3.3-71', '7.3.3-72', '7.3.3-73', '7.3.3-74'),
    ('disease', '7.3.3-76', '7.3.3-77', '7.3.3-78', '7.3.3-79'),
    ('treatmentCode', '7.3.3-82', '7.3.3-83', '7.3.3-84', '7.3.3-85'),
    ('pharmaceuticalTreatment', '7.3.3-87', '7.3.3-88', '7.3.3-89', '7.3.3-90'),
    ('communicableDiseaseCode', '7.3.3-92', '7.3.3-93', '7.3.3-94', '7.3.3-95'),
    ('routeOfTransmission', '7.3.3-97', '7.3.3-98', '7.3.3-99', '7.3.3-100'),
    ('typeOfAlertInformationRelationship', '7.3.3-103', '7.3.3-104', '7.3.3-105', '7.3.3-106'),
]


def uppmarksamhet(s):
    n = 'GetAlertInformation'
    patient(s, n + '-svar', '*:alertInformationHeader/*:patientId', '7.3.3-19', '7.3.3-20', '7.3.3-21')
    vardpersonal(s, n, '7.3.3-22', '7.3.3-23', '7.3.3-28', 'Regel 1')
    cv(s, n, 'healthcareProfessionalRoleCode', code='7.3.3-24', codeSystem='7.3.3-25', dnKrav='7.3.3-26', originalText='7.3.3-27')
    finnsInte(s, n, 'alertInformationHeader', [('documentTitle', '7.3.3-30'), ('documentTime', '7.3.3-31'), ('nullified', '7.3.3-32'), ('nullifiedReason', '7.3.3-33')])
    cv(s, n, 'typeOfAlertInformation', code='7.3.3-34', displayName='7.3.3-35', originalText='7.3.3-38',
       oid=('7.3.3-36', ['1.2.752.129.5.1.49', '1.2.752.129.2.2.2.1'], 'Typen av uppmärksamhetssignal har KV Uppmärksamhetstyp eller KV Informationstyp som kodsystem.'))
    for falt, c, d, k, o in CV_UPP:
        cv(s, n, falt, code=c, displayName=d, codeSystem=k, originalText=o)
    s.m(n + '-kropp', [('*:alertInformationBody', [
        ('7.3.3-40', 'normalize-space(*:validityTimePeriod/*:start)', 'validityTimePeriod.start ska anges.'),
        ('7.3.3-41', 'count(*:hypersensitivity) + count(*:seriousDisease) + count(*:treatment) + count(*:communicableDisease) + count(*:restrictionOfCare) + count(*:unstructuredAlertInformation) = 1', 'En och endast en av de sex typerna ska anges.'),
        ('7.3.3-42', 'count(*:hypersensitivity) + count(*:seriousDisease) + count(*:treatment) + count(*:communicableDisease) + count(*:restrictionOfCare) + count(*:unstructuredAlertInformation) = 1', 'En och endast en av de sex typerna ska anges.'),
        ('7.3.3-80', 'count(*:hypersensitivity) + count(*:seriousDisease) + count(*:treatment) + count(*:communicableDisease) + count(*:restrictionOfCare) + count(*:unstructuredAlertInformation) = 1', 'En och endast en av de sex typerna ska anges.'),
        ('7.3.3-101', "not(*:typeOfAlertInformation/*:displayName = 'Historisk varningsinformation' or *:typeOfAlertInformation/*:originalText = 'Historisk varningsinformation') or *:unstructuredAlertInformation", 'Historisk varning ska anges som ostrukturerad uppmärksamhetsinformation.')])])
    s.m(n + '-atc', [('*:atcSubstance', [
        ('7.3.3-59', "not(*:code) or matches(*:code, '^[A-Z][0-9]{2}')", 'ATC-koden ska vara på minst treställig nivå.'),
        ('7.3.3-61', "*:codeSystem = '1.2.752.129.2.2.3.1.1'", 'ATC har kodsystemet 1.2.752.129.2.2.3.1.1.'),
        ('7.3.3-62', 'not(*:codeSystemName)', 'codeSystemName används inte för ATC.'),
        ('7.3.3-63', 'not(*:codeSystemVersion)', 'codeSystemVersion används inte för ATC.'),
        ('7.3.3-64', 'not(*:originalText)', 'originalText används inte för ATC.')])])
    s.m(n + '-ejatc', [('*:pharmaceuticalHypersensitivity', [('7.3.3-60', '*:atcSubstance or (normalize-space(*:nonATCSubstance) and normalize-space(*:nonATCSubstanceComment))', 'Utan ATC-kod ska nonATCSubstance och nonATCSubstanceComment anges.')])])
    s.m(n + '-samband', [('*:typeOfAlertInformationRelationship/*:codeSystem', [('7.3.3-102', ". = '1.2.752.129.2.2.2.4'", 'Sambandet har KV Samband (1.2.752.129.2.2.2.4).')])])
    resultat(s, n, 'GetAlertInformationResponse', '7.3.3-107', '7.3.3-108', '7.3.3-109', '4.4.1.1-1')
    tider(s, n, GEMENSAMT_TS + ['verifiedTime', 'obsoleteTime'], '4.3.2.3-2', '4.3.2.3-1', ['*:ascertainedDate', '*:timePeriod/*:start', '*:timePeriod/*:end'])
    s.m(n + '-giltighet', [('*:validityTimePeriod/*:start', [('4.3.2.4-1', f"matches(., '{TS}')", 'Tidpunkter anges utan tidszon.')])])


def kontakter(s):
    n = 'GetCareContacts'
    patient(s, n + '-begaran', '*:GetCareContacts/*:patientId', '6.1.2-2', '6.1.2-3', '6.1.2-4')
    s.m(n + '-kallsystem', [('*:GetCareContacts', [('6.1.2-10', 'not(*:careContactId) or normalize-space(*:sourceSystemHSAId)', 'sourceSystemHSAId är tvingande om careContactId anges.')])])
    patient(s, n + '-svar', '*:careContactHeader/*:patientId', '6.1.2-14', '6.1.2-15', None)
    s.m(n + '-ansvarig', [('*:careContactHeader', [('6.1.2-16', '*:accountableHealthcareProfessional', 'Den ansvariga hälso- och sjukvårdspersonen ska anges om den finns.'),
                                                  ('Regel 2', 'normalize-space(*:accountableHealthcareProfessional/*:authorTime)', 'authorTime ska anges (Regel 2).')])])
    vardpersonal(s, n, '6.1.2-18', '6.1.2-19', 'Regel 4', 'Regel 1', '6.1.2-24', '6.1.2-25')
    cv(s, n, 'healthcareProfessionalRoleCode', code='6.1.2-20', codeSystem='6.1.2-21', dnKrav='6.1.2-22', originalText='6.1.2-23')
    s.m(n + '-tid', [('*:careContactBody', [
        ('6.1.2-29', "not(*:careContactCode = '1') or *:careContactStatus = '1' or *:careContactTimePeriod/*:end = *:careContactTimePeriod/*:start", 'För besök är sluttiden samma som starttiden.'),
        ('6.1.2-30', "not(*:careContactStatus = '1') or not(*:careContactTimePeriod/*:end)", 'En planerad vårdkontakt har ingen sluttid.'),
        ('6.1.2-31', "not(*:careContactCode = '3' and *:careContactStatus = '3') or not(*:careContactTimePeriod/*:end)", 'Ett pågående vårdtillfälle har ingen sluttid.')])])
    tider(s, n, ['authorTime'], '4.3.2.2-2', '4.3.2.2-1', ['*:GetCareContacts/*:timePeriod/*:start', '*:GetCareContacts/*:timePeriod/*:end'])
    s.m(n + '-kontakttid', [('*:careContactTimePeriod/*', [('4.3.2.2-2', f"matches(., '{TS}')", 'Tidpunkter anges ÅÅÅÅMMDDttmmss.'), ('4.3.2.3-1', "not(matches(., '[TZ+]'))", 'Tidszon anges inte.')])])
    patient(s, n + '-svar-sam', '*:careContactHeader/*:patientId', None, None, '4.3.2.4-2')


for doman, kontrakt, f in [(D, 'GetDiagnosis', diagnos), (D, 'GetCareDocumentation', dokumentation), (D, 'GetAlertInformation', uppmarksamhet), (L, 'GetCareContacts', kontakter)]:
    skriv(doman, kontrakt, f)
