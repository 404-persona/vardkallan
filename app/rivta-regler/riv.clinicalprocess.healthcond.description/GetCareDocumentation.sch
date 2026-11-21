<?xml version="1.0" encoding="UTF-8"?>
<!-- Vårdkällans regler ur TKB för GetCareDocumentation (riv.clinicalprocess.healthcond.description), skrivna som Schematron. Varje assert har id för regeln i
     regelförteckningen bredvid (samma namn, .json). Reglerna körs av app/src/rivta/schematron.js i test/rivta-regler-*.test.js. -->
<iso:schema xmlns:iso="http://purl.oclc.org/dsdl/schematron" queryBinding="xslt2">
  <iso:title>GetCareDocumentation (riv.clinicalprocess.healthcond.description)</iso:title>
  <iso:pattern id="GetCareDocumentation-begaran-patient">
    <iso:rule context="*:GetCareDocumentation/*:patientId">
      <iso:assert id="7.1.4-2" test="string-length(*:id) = 12 and not(matches(*:id, '[ -+]'))">Patientens id ska ha tolv tecken utan avskiljare.</iso:assert>
      <iso:assert id="7.1.4-3" test="not(matches(*:id, '^(18|19|20)[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[0-9]{4}$')) or *:type = '1.2.752.129.2.1.3.1'">Ett personnummer ska ha Skatteverkets OID för personnummer.</iso:assert>
      <iso:assert id="7.1.4-4" test="not(matches(*:id, '^(18|19|20)[0-9]{2}(0[1-9]|1[0-2])(6[1-9]|[78][0-9]|9[01])[0-9]{4}$')) or *:type = '1.2.752.129.2.1.3.3'">Ett samordningsnummer ska ha Skatteverkets OID för samordningsnummer.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetCareDocumentation-kallsystem">
    <iso:rule context="*:GetCareDocumentation">
      <iso:assert id="7.1.4-12" test="not(*:careContactId) or normalize-space(*:sourceSystemHSAid) or normalize-space(*:sourceSystemHSAId)">sourceSystemHSAId ska anges om careContactId anges.</iso:assert>
      <iso:assert id="7.1.4-17" test="not(*:careContactId) or normalize-space(*:sourceSystemHSAid) or normalize-space(*:sourceSystemHSAId)">sourceSystemHSAId måste anges om careContactId anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetCareDocumentation-svar-patient">
    <iso:rule context="*:careDocumentationHeader/*:patientId">
      <iso:assert id="7.1.4-20" test="string-length(*:id) = 12 and not(matches(*:id, '[ -+]'))">Patientens id ska ha tolv tecken utan avskiljare.</iso:assert>
      <iso:assert id="7.1.4-21" test="not(matches(*:id, '^(18|19|20)[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[0-9]{4}$')) or *:type = '1.2.752.129.2.1.3.1'">Ett personnummer ska ha Skatteverkets OID för personnummer.</iso:assert>
      <iso:assert id="7.1.4-22" test="not(matches(*:id, '^(18|19|20)[0-9]{2}(0[1-9]|1[0-2])(6[1-9]|[78][0-9]|9[01])[0-9]{4}$')) or *:type = '1.2.752.129.2.1.3.3'">Ett samordningsnummer ska ha Skatteverkets OID för samordningsnummer.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetCareDocumentation-vardpersonal">
    <iso:rule context="*:accountableHealthcareProfessional">
      <iso:assert id="7.1.4-23" test="not(*:healthcareProfessionalHSAId) or normalize-space(*:healthcareProfessionalName)">Namnet ska anges när personen är känd.</iso:assert>
      <iso:assert id="7.1.4-29" test="normalize-space(*:healthcareProfessionalOrgUnit/*:orgUnitHSAId) and normalize-space(*:healthcareProfessionalOrgUnit/*:orgUnitName)">Organisationen ska anges med HSA-id (eller lokalt id) och namn.</iso:assert>
      <iso:assert id="Regel 1" test="normalize-space(*:healthcareProfessionalCareUnitHSAId) and normalize-space(*:healthcareProfessionalCareGiverHSAId)">Vårdenhetens och vårdgivarens HSA-id ska anges (Regel 1).</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetCareDocumentation-befattning">
    <iso:rule context="*:healthcareProfessionalRoleCode/*:codeSystem">
      <iso:assert id="7.1.4-24" test=". = '1.2.752.129.2.2.1.4'">Befattningen ska om möjligt ha KV Befattning (1.2.752.129.2.2.1.4).</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetCareDocumentation-org">
    <iso:rule context="*:accountableHealthcareProfessional/*:healthcareProfessionalOrgUnit">
      <iso:assert id="7.1.4-30" test="normalize-space(*:orgUnitHSAId)">orgUnitHSAId ska anges (lokalt id om HSA-id saknas).</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetCareDocumentation-healthcareProfessionalRoleCode-0">
    <iso:rule context="*:healthcareProfessionalRoleCode">
      <iso:assert id="7.1.4-25" test="not(*:code) or (*:codeSystem and *:displayName)">Om code anges i healthcareProfessionalRoleCode ska också codeSystem och displayName anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetCareDocumentation-healthcareProfessionalRoleCode-1">
    <iso:rule context="*:healthcareProfessionalRoleCode/*:codeSystem">
      <iso:assert id="7.1.4-26" test="(../*:code and ../*:displayName) and matches(., '^[0-2](\.[0-9]+)+$')">Om codeSystem anges i healthcareProfessionalRoleCode ska också code och displayName anges, och codeSystem ska vara en OID.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetCareDocumentation-healthcareProfessionalRoleCode-2">
    <iso:rule context="*:healthcareProfessionalRoleCode/*:code">
      <iso:assert id="7.1.4-27" test="normalize-space(../*:displayName)">När code anges i healthcareProfessionalRoleCode ska displayName anges (samma värde som code om klartext saknas).</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetCareDocumentation-healthcareProfessionalRoleCode-3">
    <iso:rule context="*:healthcareProfessionalRoleCode/*:originalText">
      <iso:assert id="7.1.4-28" test="not(../*:code) and not(../*:codeSystem) and not(../*:codeSystemName) and not(../*:codeSystemVersion) and not(../*:displayName)">Om originalText anges i healthcareProfessionalRoleCode ska inget annat värde anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetCareDocumentation-ej-careDocumentationHeader">
    <iso:rule context="*:careDocumentationHeader">
      <iso:assert id="7.1.4-32" test="not(*:nullified)">nullified ska inte anges (N/A, 0..0 i TKB).</iso:assert>
      <iso:assert id="7.1.4-33" test="not(*:nullifiedReason)">nullifiedReason ska inte anges (N/A, 0..0 i TKB).</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetCareDocumentation-anteckningstyp">
    <iso:rule context="*:clinicalDocumentNote">
      <iso:assert id="7.1.4-34" test="*:clinicalDocumentNoteCode or *:clinicalDocumentTypeCode">clinicalDocumentNoteCode är obligatorisk när clinicalDocumentTypeCode saknas.</iso:assert>
      <iso:assert id="7.1.4-35" test="not(*:clinicalDocumentNoteCode and *:clinicalDocumentTypeCode)">clinicalDocumentNoteCode och clinicalDocumentTypeCode får inte anges samtidigt.</iso:assert>
      <iso:assert id="7.1.4-36" test="not(*:clinicalDocumentTypeCode)">clinicalDocumentTypeCode används inte (0..0).</iso:assert>
      <iso:assert id="7.1.4-37" test="count(*:clinicalDocumentNoteText) + count(*:multimediaEntry) = 1">Innehållet skickas antingen som clinicalDocumentNoteText eller som multimediaEntry.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetCareDocumentation-multimedia">
    <iso:rule context="*:multimediaEntry">
      <iso:assert id="7.1.4-38" test="not(*:id)">multimediaEntry.id används inte (0..0).</iso:assert>
      <iso:assert id="7.1.4-39" test="count(*:value) + count(*:reference) = 1">Ett och endast ett av value och reference ska anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetCareDocumentation-avvikande">
    <iso:rule context="*:dissentingOpinion/*:personId">
      <iso:assert id="7.1.4-42" test="string-length(*:id) = 12 and not(matches(*:id, '[ -+]'))">Personens id ska ha tolv tecken utan avskiljare.</iso:assert>
      <iso:assert id="7.1.4-43" test="not(matches(*:id, '^(18|19|20)[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[0-9]{4}$')) or *:type = '1.2.752.129.2.1.3.1'">Ett personnummer ska ha Skatteverkets OID.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetCareDocumentation-resultat">
    <iso:rule context="*:GetCareDocumentationResponse">
      <iso:assert id="7.1.4-44" test="*:result/*:resultCode and *:result/*:logId">Svaret ska ha result med resultCode och logId.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetCareDocumentation-resultat-kod">
    <iso:rule context="*:result">
      <iso:assert id="7.1.4-45" test="(*:resultCode = 'ERROR' and *:errorCode) or (*:resultCode != 'ERROR' and not(*:errorCode))">errorCode anges endast när resultCode är ERROR.</iso:assert>
      <iso:assert id="7.1.4-46" test="matches(*:logId, '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')">logId ska vara en UUID.</iso:assert>
      <iso:assert id="4.4.1.1-1" test="*:resultCode != 'ERROR' or *:errorCode = 'INVALID_REQUEST'">Ett logiskt fel har errorCode INVALID_REQUEST.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetCareDocumentation-tid-authorTime">
    <iso:rule context="*:authorTime">
      <iso:assert id="4.3.2.3-2" test="matches(., '^[0-9]{4}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])([01][0-9]|2[0-3])[0-5][0-9][0-5][0-9]$')">authorTime ska vara en tidpunkt ÅÅÅÅMMDDttmmss utan tidszon.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetCareDocumentation-tid-signatureTime">
    <iso:rule context="*:signatureTime">
      <iso:assert id="4.3.2.3-2" test="matches(., '^[0-9]{4}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])([01][0-9]|2[0-3])[0-5][0-9][0-5][0-9]$')">signatureTime ska vara en tidpunkt ÅÅÅÅMMDDttmmss utan tidszon.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetCareDocumentation-tid-documentTime">
    <iso:rule context="*:documentTime">
      <iso:assert id="4.3.2.3-2" test="matches(., '^[0-9]{4}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])([01][0-9]|2[0-3])[0-5][0-9][0-5][0-9]$')">documentTime ska vara en tidpunkt ÅÅÅÅMMDDttmmss utan tidszon.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetCareDocumentation-datum-*:timePeriod/*:start">
    <iso:rule context="*:timePeriod/*:start">
      <iso:assert id="4.3.2.3-1" test="matches(., '^[0-9]{4}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])$')">Ett datum ska vara ÅÅÅÅMMDD.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetCareDocumentation-datum-*:timePeriod/*:end">
    <iso:rule context="*:timePeriod/*:end">
      <iso:assert id="4.3.2.3-1" test="matches(., '^[0-9]{4}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])$')">Ett datum ska vara ÅÅÅÅMMDD.</iso:assert>
    </iso:rule>
  </iso:pattern>
</iso:schema>
