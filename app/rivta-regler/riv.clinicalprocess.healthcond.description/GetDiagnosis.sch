<?xml version="1.0" encoding="UTF-8"?>
<!-- Vårdkällans regler ur TKB för GetDiagnosis (riv.clinicalprocess.healthcond.description), skrivna som Schematron. Varje assert har id för regeln i
     regelförteckningen bredvid (samma namn, .json). Reglerna körs av app/src/rivta/schematron.js i test/rivta-regler-*.test.js. -->
<iso:schema xmlns:iso="http://purl.oclc.org/dsdl/schematron" queryBinding="xslt2">
  <iso:title>GetDiagnosis (riv.clinicalprocess.healthcond.description)</iso:title>
  <iso:pattern id="GetDiagnosis-begaran-patient">
    <iso:rule context="*:GetDiagnosis/*:patientId">
      <iso:assert id="7.2.3-2" test="string-length(*:id) = 12 and not(matches(*:id, '[ -+]'))">Patientens id ska ha tolv tecken utan avskiljare.</iso:assert>
      <iso:assert id="7.2.3-3" test="not(matches(*:id, '^(18|19|20)[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[0-9]{4}$')) or *:type = '1.2.752.129.2.1.3.1'">Ett personnummer ska ha Skatteverkets OID för personnummer.</iso:assert>
      <iso:assert id="7.2.3-4" test="not(matches(*:id, '^(18|19|20)[0-9]{2}(0[1-9]|1[0-2])(6[1-9]|[78][0-9]|9[01])[0-9]{4}$')) or *:type = '1.2.752.129.2.1.3.3'">Ett samordningsnummer ska ha Skatteverkets OID för samordningsnummer.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetDiagnosis-kallsystem">
    <iso:rule context="*:GetDiagnosis">
      <iso:assert id="7.2.3-12" test="not(*:careContactId) or normalize-space(*:sourceSystemHSAId)">sourceSystemHSAId ska anges om careContactId anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetDiagnosis-svar-patient">
    <iso:rule context="*:diagnosisHeader/*:patientId">
      <iso:assert id="7.2.3-19" test="string-length(*:id) = 12 and not(matches(*:id, '[ -+]'))">Patientens id ska ha tolv tecken utan avskiljare.</iso:assert>
      <iso:assert id="7.2.3-20" test="not(matches(*:id, '^(18|19|20)[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[0-9]{4}$')) or *:type = '1.2.752.129.2.1.3.1'">Ett personnummer ska ha Skatteverkets OID för personnummer.</iso:assert>
      <iso:assert id="7.2.3-21" test="not(matches(*:id, '^(18|19|20)[0-9]{2}(0[1-9]|1[0-2])(6[1-9]|[78][0-9]|9[01])[0-9]{4}$')) or *:type = '1.2.752.129.2.1.3.3'">Ett samordningsnummer ska ha Skatteverkets OID för samordningsnummer.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetDiagnosis-vardpersonal">
    <iso:rule context="*:accountableHealthcareProfessional">
      <iso:assert id="7.2.3-22" test="not(*:healthcareProfessionalHSAId) or normalize-space(*:healthcareProfessionalName)">Namnet ska anges när personen är känd.</iso:assert>
      <iso:assert id="7.2.3-28" test="normalize-space(*:healthcareProfessionalOrgUnit/*:orgUnitHSAId) and normalize-space(*:healthcareProfessionalOrgUnit/*:orgUnitName)">Organisationen ska anges med HSA-id (eller lokalt id) och namn.</iso:assert>
      <iso:assert id="Regel 1" test="normalize-space(*:healthcareProfessionalCareUnitHSAId) and normalize-space(*:healthcareProfessionalCareGiverHSAId)">Vårdenhetens och vårdgivarens HSA-id ska anges (Regel 1).</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetDiagnosis-befattning">
    <iso:rule context="*:healthcareProfessionalRoleCode/*:codeSystem">
      <iso:assert id="7.2.3-23" test=". = '1.2.752.129.2.2.1.4'">Befattningen ska om möjligt ha KV Befattning (1.2.752.129.2.2.1.4).</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetDiagnosis-healthcareProfessionalRoleCode-0">
    <iso:rule context="*:healthcareProfessionalRoleCode">
      <iso:assert id="7.2.3-24" test="not(*:code) or (*:codeSystem and *:displayName)">Om code anges i healthcareProfessionalRoleCode ska också codeSystem och displayName anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetDiagnosis-healthcareProfessionalRoleCode-1">
    <iso:rule context="*:healthcareProfessionalRoleCode/*:codeSystem">
      <iso:assert id="7.2.3-25" test="(../*:code and ../*:displayName) and matches(., '^[0-2](\.[0-9]+)+$')">Om codeSystem anges i healthcareProfessionalRoleCode ska också code och displayName anges, och codeSystem ska vara en OID.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetDiagnosis-healthcareProfessionalRoleCode-2">
    <iso:rule context="*:healthcareProfessionalRoleCode/*:code">
      <iso:assert id="7.2.3-26" test="normalize-space(../*:displayName)">När code anges i healthcareProfessionalRoleCode ska displayName anges (samma värde som code om klartext saknas).</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetDiagnosis-healthcareProfessionalRoleCode-3">
    <iso:rule context="*:healthcareProfessionalRoleCode/*:originalText">
      <iso:assert id="7.2.3-27" test="not(../*:code) and not(../*:codeSystem) and not(../*:codeSystemName) and not(../*:codeSystemVersion) and not(../*:displayName)">Om originalText anges i healthcareProfessionalRoleCode ska inget annat värde anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetDiagnosis-ej-diagnosisHeader">
    <iso:rule context="*:diagnosisHeader">
      <iso:assert id="7.2.3-30" test="not(*:documentTitle)">documentTitle ska inte anges (N/A, 0..0 i TKB).</iso:assert>
      <iso:assert id="7.2.3-31" test="not(*:documentTime)">documentTime ska inte anges (N/A, 0..0 i TKB).</iso:assert>
      <iso:assert id="7.2.3-32" test="not(*:nullified)">nullified ska inte anges (N/A, 0..0 i TKB).</iso:assert>
      <iso:assert id="7.2.3-33" test="not(*:nullifiedReason)">nullifiedReason ska inte anges (N/A, 0..0 i TKB).</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetDiagnosis-diagnosisCode-0">
    <iso:rule context="*:diagnosisCode">
      <iso:assert id="7.2.3-35" test="not(*:code) or (*:codeSystem and *:displayName)">Om code anges i diagnosisCode ska också codeSystem och displayName anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetDiagnosis-diagnosisCode-1">
    <iso:rule context="*:diagnosisCode/*:codeSystem">
      <iso:assert id="7.2.3-37" test="(../*:code and ../*:displayName) and matches(., '^[0-2](\.[0-9]+)+$')">Om codeSystem anges i diagnosisCode ska också code och displayName anges, och codeSystem ska vara en OID.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetDiagnosis-diagnosisCode-2">
    <iso:rule context="*:diagnosisCode/*:displayName">
      <iso:assert id="7.2.3-36" test="../*:code and ../*:codeSystem">Om displayName anges i diagnosisCode ska också code och codeSystem anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetDiagnosis-diagnosisCode-3">
    <iso:rule context="*:diagnosisCode/*:originalText">
      <iso:assert id="7.2.3-39" test="not(../*:code) and not(../*:codeSystem) and not(../*:codeSystemName) and not(../*:codeSystemVersion) and not(../*:displayName)">Om originalText anges i diagnosisCode ska inget annat värde anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetDiagnosis-relaterad">
    <iso:rule context="*:relatedDiagnosis/*:documentId">
      <iso:assert id="7.2.3-40" test=". = /*:Envelope/*:Body/*:GetDiagnosisResponse/*:diagnosis/*:diagnosisHeader/*:documentId">relatedDiagnosis ska peka på en diagnos i svaret.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetDiagnosis-resultat">
    <iso:rule context="*:GetDiagnosisResponse">
      <iso:assert id="7.2.3-41" test="*:result/*:resultCode and *:result/*:logId">Svaret ska ha result med resultCode och logId.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetDiagnosis-resultat-kod">
    <iso:rule context="*:result">
      <iso:assert id="7.2.3-42" test="(*:resultCode = 'ERROR' and *:errorCode) or (*:resultCode != 'ERROR' and not(*:errorCode))">errorCode anges endast när resultCode är ERROR.</iso:assert>
      <iso:assert id="7.2.3-43" test="matches(*:logId, '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')">logId ska vara en UUID.</iso:assert>
      <iso:assert id="4.4.1.1-1" test="*:resultCode != 'ERROR' or *:errorCode = 'INVALID_REQUEST'">Ett logiskt fel har errorCode INVALID_REQUEST.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetDiagnosis-tid-authorTime">
    <iso:rule context="*:authorTime">
      <iso:assert id="4.3.2.3-2" test="matches(., '^[0-9]{4}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])([01][0-9]|2[0-3])[0-5][0-9][0-5][0-9]$')">authorTime ska vara en tidpunkt ÅÅÅÅMMDDttmmss utan tidszon.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetDiagnosis-tid-signatureTime">
    <iso:rule context="*:signatureTime">
      <iso:assert id="4.3.2.3-2" test="matches(., '^[0-9]{4}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])([01][0-9]|2[0-3])[0-5][0-9][0-5][0-9]$')">signatureTime ska vara en tidpunkt ÅÅÅÅMMDDttmmss utan tidszon.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetDiagnosis-tid-documentTime">
    <iso:rule context="*:documentTime">
      <iso:assert id="4.3.2.3-2" test="matches(., '^[0-9]{4}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])([01][0-9]|2[0-3])[0-5][0-9][0-5][0-9]$')">documentTime ska vara en tidpunkt ÅÅÅÅMMDDttmmss utan tidszon.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetDiagnosis-tid-diagnosisTime">
    <iso:rule context="*:diagnosisTime">
      <iso:assert id="4.3.2.3-2" test="matches(., '^[0-9]{4}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])([01][0-9]|2[0-3])[0-5][0-9][0-5][0-9]$')">diagnosisTime ska vara en tidpunkt ÅÅÅÅMMDDttmmss utan tidszon.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetDiagnosis-datum-*:timePeriod/*:start">
    <iso:rule context="*:timePeriod/*:start">
      <iso:assert id="4.3.2.3-1" test="matches(., '^[0-9]{4}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])$')">Ett datum ska vara ÅÅÅÅMMDD.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetDiagnosis-datum-*:timePeriod/*:end">
    <iso:rule context="*:timePeriod/*:end">
      <iso:assert id="4.3.2.3-1" test="matches(., '^[0-9]{4}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])$')">Ett datum ska vara ÅÅÅÅMMDD.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetDiagnosis-tidszon">
    <iso:rule context="*:diagnosisBody/*:diagnosisTime">
      <iso:assert id="4.3.2.4-1" test="not(matches(., '[TZ+]'))">Tidpunkter anges utan tidszon.</iso:assert>
    </iso:rule>
  </iso:pattern>
</iso:schema>
