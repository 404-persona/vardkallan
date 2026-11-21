<?xml version="1.0" encoding="UTF-8"?>
<!-- Vårdkällans regler ur TKB för GetAlertInformation (riv.clinicalprocess.healthcond.description), skrivna som Schematron. Varje assert har id för regeln i
     regelförteckningen bredvid (samma namn, .json). Reglerna körs av app/src/rivta/schematron.js i test/rivta-regler-*.test.js. -->
<iso:schema xmlns:iso="http://purl.oclc.org/dsdl/schematron" queryBinding="xslt2">
  <iso:title>GetAlertInformation (riv.clinicalprocess.healthcond.description)</iso:title>
  <iso:pattern id="GetAlertInformation-svar-patient">
    <iso:rule context="*:alertInformationHeader/*:patientId">
      <iso:assert id="7.3.3-19" test="string-length(*:id) = 12 and not(matches(*:id, '[ -+]'))">Patientens id ska ha tolv tecken utan avskiljare.</iso:assert>
      <iso:assert id="7.3.3-20" test="not(matches(*:id, '^(18|19|20)[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[0-9]{4}$')) or *:type = '1.2.752.129.2.1.3.1'">Ett personnummer ska ha Skatteverkets OID för personnummer.</iso:assert>
      <iso:assert id="7.3.3-21" test="not(matches(*:id, '^(18|19|20)[0-9]{2}(0[1-9]|1[0-2])(6[1-9]|[78][0-9]|9[01])[0-9]{4}$')) or *:type = '1.2.752.129.2.1.3.3'">Ett samordningsnummer ska ha Skatteverkets OID för samordningsnummer.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-vardpersonal">
    <iso:rule context="*:accountableHealthcareProfessional">
      <iso:assert id="7.3.3-22" test="not(*:healthcareProfessionalHSAId) or normalize-space(*:healthcareProfessionalName)">Namnet ska anges när personen är känd.</iso:assert>
      <iso:assert id="7.3.3-28" test="normalize-space(*:healthcareProfessionalOrgUnit/*:orgUnitHSAId) and normalize-space(*:healthcareProfessionalOrgUnit/*:orgUnitName)">Organisationen ska anges med HSA-id (eller lokalt id) och namn.</iso:assert>
      <iso:assert id="Regel 1" test="normalize-space(*:healthcareProfessionalCareUnitHSAId) and normalize-space(*:healthcareProfessionalCareGiverHSAId)">Vårdenhetens och vårdgivarens HSA-id ska anges (Regel 1).</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-befattning">
    <iso:rule context="*:healthcareProfessionalRoleCode/*:codeSystem">
      <iso:assert id="7.3.3-23" test=". = '1.2.752.129.2.2.1.4'">Befattningen ska om möjligt ha KV Befattning (1.2.752.129.2.2.1.4).</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-healthcareProfessionalRoleCode-0">
    <iso:rule context="*:healthcareProfessionalRoleCode">
      <iso:assert id="7.3.3-24" test="not(*:code) or (*:codeSystem and *:displayName)">Om code anges i healthcareProfessionalRoleCode ska också codeSystem och displayName anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-healthcareProfessionalRoleCode-1">
    <iso:rule context="*:healthcareProfessionalRoleCode/*:codeSystem">
      <iso:assert id="7.3.3-25" test="(../*:code and ../*:displayName) and matches(., '^[0-2](\.[0-9]+)+$')">Om codeSystem anges i healthcareProfessionalRoleCode ska också code och displayName anges, och codeSystem ska vara en OID.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-healthcareProfessionalRoleCode-2">
    <iso:rule context="*:healthcareProfessionalRoleCode/*:code">
      <iso:assert id="7.3.3-26" test="normalize-space(../*:displayName)">När code anges i healthcareProfessionalRoleCode ska displayName anges (samma värde som code om klartext saknas).</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-healthcareProfessionalRoleCode-3">
    <iso:rule context="*:healthcareProfessionalRoleCode/*:originalText">
      <iso:assert id="7.3.3-27" test="not(../*:code) and not(../*:codeSystem) and not(../*:codeSystemName) and not(../*:codeSystemVersion) and not(../*:displayName)">Om originalText anges i healthcareProfessionalRoleCode ska inget annat värde anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-ej-alertInformationHeader">
    <iso:rule context="*:alertInformationHeader">
      <iso:assert id="7.3.3-30" test="not(*:documentTitle)">documentTitle ska inte anges (N/A, 0..0 i TKB).</iso:assert>
      <iso:assert id="7.3.3-31" test="not(*:documentTime)">documentTime ska inte anges (N/A, 0..0 i TKB).</iso:assert>
      <iso:assert id="7.3.3-32" test="not(*:nullified)">nullified ska inte anges (N/A, 0..0 i TKB).</iso:assert>
      <iso:assert id="7.3.3-33" test="not(*:nullifiedReason)">nullifiedReason ska inte anges (N/A, 0..0 i TKB).</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-typeOfAlertInformation-0">
    <iso:rule context="*:typeOfAlertInformation">
      <iso:assert id="7.3.3-34" test="not(*:code) or (*:codeSystem and *:displayName)">Om code anges i typeOfAlertInformation ska också codeSystem och displayName anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-typeOfAlertInformation-1">
    <iso:rule context="*:typeOfAlertInformation/*:displayName">
      <iso:assert id="7.3.3-35" test="../*:code and ../*:codeSystem">Om displayName anges i typeOfAlertInformation ska också code och codeSystem anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-typeOfAlertInformation-2">
    <iso:rule context="*:typeOfAlertInformation/*:originalText">
      <iso:assert id="7.3.3-38" test="not(../*:code) and not(../*:codeSystem) and not(../*:codeSystemName) and not(../*:codeSystemVersion) and not(../*:displayName)">Om originalText anges i typeOfAlertInformation ska inget annat värde anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-typeOfAlertInformation-3">
    <iso:rule context="*:typeOfAlertInformation/*:codeSystem">
      <iso:assert id="7.3.3-36" test=". = '1.2.752.129.5.1.49' or . = '1.2.752.129.2.2.2.1'">Typen av uppmärksamhetssignal har KV Uppmärksamhetstyp eller KV Informationstyp som kodsystem.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-typeOfHypersensitivity-0">
    <iso:rule context="*:typeOfHypersensitivity">
      <iso:assert id="7.3.3-44" test="not(*:code) or (*:codeSystem and *:displayName)">Om code anges i typeOfHypersensitivity ska också codeSystem och displayName anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-typeOfHypersensitivity-1">
    <iso:rule context="*:typeOfHypersensitivity/*:codeSystem">
      <iso:assert id="7.3.3-46" test="(../*:code and ../*:displayName) and matches(., '^[0-2](\.[0-9]+)+$')">Om codeSystem anges i typeOfHypersensitivity ska också code och displayName anges, och codeSystem ska vara en OID.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-typeOfHypersensitivity-2">
    <iso:rule context="*:typeOfHypersensitivity/*:displayName">
      <iso:assert id="7.3.3-45" test="../*:code and ../*:codeSystem">Om displayName anges i typeOfHypersensitivity ska också code och codeSystem anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-typeOfHypersensitivity-3">
    <iso:rule context="*:typeOfHypersensitivity/*:originalText">
      <iso:assert id="7.3.3-47" test="not(../*:code) and not(../*:codeSystem) and not(../*:codeSystemName) and not(../*:codeSystemVersion) and not(../*:displayName)">Om originalText anges i typeOfHypersensitivity ska inget annat värde anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-degreeOfSeverity-0">
    <iso:rule context="*:degreeOfSeverity">
      <iso:assert id="7.3.3-50" test="not(*:code) or (*:codeSystem and *:displayName)">Om code anges i degreeOfSeverity ska också codeSystem och displayName anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-degreeOfSeverity-1">
    <iso:rule context="*:degreeOfSeverity/*:codeSystem">
      <iso:assert id="7.3.3-52" test="(../*:code and ../*:displayName) and matches(., '^[0-2](\.[0-9]+)+$')">Om codeSystem anges i degreeOfSeverity ska också code och displayName anges, och codeSystem ska vara en OID.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-degreeOfSeverity-2">
    <iso:rule context="*:degreeOfSeverity/*:displayName">
      <iso:assert id="7.3.3-51" test="../*:code and ../*:codeSystem">Om displayName anges i degreeOfSeverity ska också code och codeSystem anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-degreeOfSeverity-3">
    <iso:rule context="*:degreeOfSeverity/*:originalText">
      <iso:assert id="7.3.3-53" test="not(../*:code) and not(../*:codeSystem) and not(../*:codeSystemName) and not(../*:codeSystemVersion) and not(../*:displayName)">Om originalText anges i degreeOfSeverity ska inget annat värde anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-degreeOfCertainty-0">
    <iso:rule context="*:degreeOfCertainty">
      <iso:assert id="7.3.3-55" test="not(*:code) or (*:codeSystem and *:displayName)">Om code anges i degreeOfCertainty ska också codeSystem och displayName anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-degreeOfCertainty-1">
    <iso:rule context="*:degreeOfCertainty/*:codeSystem">
      <iso:assert id="7.3.3-57" test="(../*:code and ../*:displayName) and matches(., '^[0-2](\.[0-9]+)+$')">Om codeSystem anges i degreeOfCertainty ska också code och displayName anges, och codeSystem ska vara en OID.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-degreeOfCertainty-2">
    <iso:rule context="*:degreeOfCertainty/*:displayName">
      <iso:assert id="7.3.3-56" test="../*:code and ../*:codeSystem">Om displayName anges i degreeOfCertainty ska också code och codeSystem anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-degreeOfCertainty-3">
    <iso:rule context="*:degreeOfCertainty/*:originalText">
      <iso:assert id="7.3.3-58" test="not(../*:code) and not(../*:codeSystem) and not(../*:codeSystemName) and not(../*:codeSystemVersion) and not(../*:displayName)">Om originalText anges i degreeOfCertainty ska inget annat värde anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-pharmaceuticalProductId-0">
    <iso:rule context="*:pharmaceuticalProductId">
      <iso:assert id="7.3.3-66" test="not(*:code) or (*:codeSystem and *:displayName)">Om code anges i pharmaceuticalProductId ska också codeSystem och displayName anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-pharmaceuticalProductId-1">
    <iso:rule context="*:pharmaceuticalProductId/*:codeSystem">
      <iso:assert id="7.3.3-68" test="(../*:code and ../*:displayName) and matches(., '^[0-2](\.[0-9]+)+$')">Om codeSystem anges i pharmaceuticalProductId ska också code och displayName anges, och codeSystem ska vara en OID.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-pharmaceuticalProductId-2">
    <iso:rule context="*:pharmaceuticalProductId/*:displayName">
      <iso:assert id="7.3.3-67" test="../*:code and ../*:codeSystem">Om displayName anges i pharmaceuticalProductId ska också code och codeSystem anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-pharmaceuticalProductId-3">
    <iso:rule context="*:pharmaceuticalProductId/*:originalText">
      <iso:assert id="7.3.3-69" test="not(../*:code) and not(../*:codeSystem) and not(../*:codeSystemName) and not(../*:codeSystemVersion) and not(../*:displayName)">Om originalText anges i pharmaceuticalProductId ska inget annat värde anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-hypersensitivityAgentCode-0">
    <iso:rule context="*:hypersensitivityAgentCode">
      <iso:assert id="7.3.3-71" test="not(*:code) or (*:codeSystem and *:displayName)">Om code anges i hypersensitivityAgentCode ska också codeSystem och displayName anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-hypersensitivityAgentCode-1">
    <iso:rule context="*:hypersensitivityAgentCode/*:codeSystem">
      <iso:assert id="7.3.3-73" test="(../*:code and ../*:displayName) and matches(., '^[0-2](\.[0-9]+)+$')">Om codeSystem anges i hypersensitivityAgentCode ska också code och displayName anges, och codeSystem ska vara en OID.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-hypersensitivityAgentCode-2">
    <iso:rule context="*:hypersensitivityAgentCode/*:displayName">
      <iso:assert id="7.3.3-72" test="../*:code and ../*:codeSystem">Om displayName anges i hypersensitivityAgentCode ska också code och codeSystem anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-hypersensitivityAgentCode-3">
    <iso:rule context="*:hypersensitivityAgentCode/*:originalText">
      <iso:assert id="7.3.3-74" test="not(../*:code) and not(../*:codeSystem) and not(../*:codeSystemName) and not(../*:codeSystemVersion) and not(../*:displayName)">Om originalText anges i hypersensitivityAgentCode ska inget annat värde anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-disease-0">
    <iso:rule context="*:disease">
      <iso:assert id="7.3.3-76" test="not(*:code) or (*:codeSystem and *:displayName)">Om code anges i disease ska också codeSystem och displayName anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-disease-1">
    <iso:rule context="*:disease/*:codeSystem">
      <iso:assert id="7.3.3-78" test="(../*:code and ../*:displayName) and matches(., '^[0-2](\.[0-9]+)+$')">Om codeSystem anges i disease ska också code och displayName anges, och codeSystem ska vara en OID.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-disease-2">
    <iso:rule context="*:disease/*:displayName">
      <iso:assert id="7.3.3-77" test="../*:code and ../*:codeSystem">Om displayName anges i disease ska också code och codeSystem anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-disease-3">
    <iso:rule context="*:disease/*:originalText">
      <iso:assert id="7.3.3-79" test="not(../*:code) and not(../*:codeSystem) and not(../*:codeSystemName) and not(../*:codeSystemVersion) and not(../*:displayName)">Om originalText anges i disease ska inget annat värde anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-treatmentCode-0">
    <iso:rule context="*:treatmentCode">
      <iso:assert id="7.3.3-82" test="not(*:code) or (*:codeSystem and *:displayName)">Om code anges i treatmentCode ska också codeSystem och displayName anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-treatmentCode-1">
    <iso:rule context="*:treatmentCode/*:codeSystem">
      <iso:assert id="7.3.3-84" test="(../*:code and ../*:displayName) and matches(., '^[0-2](\.[0-9]+)+$')">Om codeSystem anges i treatmentCode ska också code och displayName anges, och codeSystem ska vara en OID.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-treatmentCode-2">
    <iso:rule context="*:treatmentCode/*:displayName">
      <iso:assert id="7.3.3-83" test="../*:code and ../*:codeSystem">Om displayName anges i treatmentCode ska också code och codeSystem anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-treatmentCode-3">
    <iso:rule context="*:treatmentCode/*:originalText">
      <iso:assert id="7.3.3-85" test="not(../*:code) and not(../*:codeSystem) and not(../*:codeSystemName) and not(../*:codeSystemVersion) and not(../*:displayName)">Om originalText anges i treatmentCode ska inget annat värde anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-pharmaceuticalTreatment-0">
    <iso:rule context="*:pharmaceuticalTreatment">
      <iso:assert id="7.3.3-87" test="not(*:code) or (*:codeSystem and *:displayName)">Om code anges i pharmaceuticalTreatment ska också codeSystem och displayName anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-pharmaceuticalTreatment-1">
    <iso:rule context="*:pharmaceuticalTreatment/*:codeSystem">
      <iso:assert id="7.3.3-89" test="(../*:code and ../*:displayName) and matches(., '^[0-2](\.[0-9]+)+$')">Om codeSystem anges i pharmaceuticalTreatment ska också code och displayName anges, och codeSystem ska vara en OID.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-pharmaceuticalTreatment-2">
    <iso:rule context="*:pharmaceuticalTreatment/*:displayName">
      <iso:assert id="7.3.3-88" test="../*:code and ../*:codeSystem">Om displayName anges i pharmaceuticalTreatment ska också code och codeSystem anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-pharmaceuticalTreatment-3">
    <iso:rule context="*:pharmaceuticalTreatment/*:originalText">
      <iso:assert id="7.3.3-90" test="not(../*:code) and not(../*:codeSystem) and not(../*:codeSystemName) and not(../*:codeSystemVersion) and not(../*:displayName)">Om originalText anges i pharmaceuticalTreatment ska inget annat värde anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-communicableDiseaseCode-0">
    <iso:rule context="*:communicableDiseaseCode">
      <iso:assert id="7.3.3-92" test="not(*:code) or (*:codeSystem and *:displayName)">Om code anges i communicableDiseaseCode ska också codeSystem och displayName anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-communicableDiseaseCode-1">
    <iso:rule context="*:communicableDiseaseCode/*:codeSystem">
      <iso:assert id="7.3.3-94" test="(../*:code and ../*:displayName) and matches(., '^[0-2](\.[0-9]+)+$')">Om codeSystem anges i communicableDiseaseCode ska också code och displayName anges, och codeSystem ska vara en OID.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-communicableDiseaseCode-2">
    <iso:rule context="*:communicableDiseaseCode/*:displayName">
      <iso:assert id="7.3.3-93" test="../*:code and ../*:codeSystem">Om displayName anges i communicableDiseaseCode ska också code och codeSystem anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-communicableDiseaseCode-3">
    <iso:rule context="*:communicableDiseaseCode/*:originalText">
      <iso:assert id="7.3.3-95" test="not(../*:code) and not(../*:codeSystem) and not(../*:codeSystemName) and not(../*:codeSystemVersion) and not(../*:displayName)">Om originalText anges i communicableDiseaseCode ska inget annat värde anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-routeOfTransmission-0">
    <iso:rule context="*:routeOfTransmission">
      <iso:assert id="7.3.3-97" test="not(*:code) or (*:codeSystem and *:displayName)">Om code anges i routeOfTransmission ska också codeSystem och displayName anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-routeOfTransmission-1">
    <iso:rule context="*:routeOfTransmission/*:codeSystem">
      <iso:assert id="7.3.3-99" test="(../*:code and ../*:displayName) and matches(., '^[0-2](\.[0-9]+)+$')">Om codeSystem anges i routeOfTransmission ska också code och displayName anges, och codeSystem ska vara en OID.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-routeOfTransmission-2">
    <iso:rule context="*:routeOfTransmission/*:displayName">
      <iso:assert id="7.3.3-98" test="../*:code and ../*:codeSystem">Om displayName anges i routeOfTransmission ska också code och codeSystem anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-routeOfTransmission-3">
    <iso:rule context="*:routeOfTransmission/*:originalText">
      <iso:assert id="7.3.3-100" test="not(../*:code) and not(../*:codeSystem) and not(../*:codeSystemName) and not(../*:codeSystemVersion) and not(../*:displayName)">Om originalText anges i routeOfTransmission ska inget annat värde anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-typeOfAlertInformationRelationship-0">
    <iso:rule context="*:typeOfAlertInformationRelationship">
      <iso:assert id="7.3.3-103" test="not(*:code) or (*:codeSystem and *:displayName)">Om code anges i typeOfAlertInformationRelationship ska också codeSystem och displayName anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-typeOfAlertInformationRelationship-1">
    <iso:rule context="*:typeOfAlertInformationRelationship/*:codeSystem">
      <iso:assert id="7.3.3-105" test="(../*:code and ../*:displayName) and matches(., '^[0-2](\.[0-9]+)+$')">Om codeSystem anges i typeOfAlertInformationRelationship ska också code och displayName anges, och codeSystem ska vara en OID.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-typeOfAlertInformationRelationship-2">
    <iso:rule context="*:typeOfAlertInformationRelationship/*:displayName">
      <iso:assert id="7.3.3-104" test="../*:code and ../*:codeSystem">Om displayName anges i typeOfAlertInformationRelationship ska också code och codeSystem anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-typeOfAlertInformationRelationship-3">
    <iso:rule context="*:typeOfAlertInformationRelationship/*:originalText">
      <iso:assert id="7.3.3-106" test="not(../*:code) and not(../*:codeSystem) and not(../*:codeSystemName) and not(../*:codeSystemVersion) and not(../*:displayName)">Om originalText anges i typeOfAlertInformationRelationship ska inget annat värde anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-kropp">
    <iso:rule context="*:alertInformationBody">
      <iso:assert id="7.3.3-40" test="normalize-space(*:validityTimePeriod/*:start)">validityTimePeriod.start ska anges.</iso:assert>
      <iso:assert id="7.3.3-41" test="count(*:hypersensitivity) + count(*:seriousDisease) + count(*:treatment) + count(*:communicableDisease) + count(*:restrictionOfCare) + count(*:unstructuredAlertInformation) = 1">En och endast en av de sex typerna ska anges.</iso:assert>
      <iso:assert id="7.3.3-42" test="count(*:hypersensitivity) + count(*:seriousDisease) + count(*:treatment) + count(*:communicableDisease) + count(*:restrictionOfCare) + count(*:unstructuredAlertInformation) = 1">En och endast en av de sex typerna ska anges.</iso:assert>
      <iso:assert id="7.3.3-80" test="count(*:hypersensitivity) + count(*:seriousDisease) + count(*:treatment) + count(*:communicableDisease) + count(*:restrictionOfCare) + count(*:unstructuredAlertInformation) = 1">En och endast en av de sex typerna ska anges.</iso:assert>
      <iso:assert id="7.3.3-101" test="not(*:typeOfAlertInformation/*:displayName = 'Historisk varningsinformation' or *:typeOfAlertInformation/*:originalText = 'Historisk varningsinformation') or *:unstructuredAlertInformation">Historisk varning ska anges som ostrukturerad uppmärksamhetsinformation.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-atc">
    <iso:rule context="*:atcSubstance">
      <iso:assert id="7.3.3-59" test="not(*:code) or matches(*:code, '^[A-Z][0-9]{2}')">ATC-koden ska vara på minst treställig nivå.</iso:assert>
      <iso:assert id="7.3.3-61" test="*:codeSystem = '1.2.752.129.2.2.3.1.1'">ATC har kodsystemet 1.2.752.129.2.2.3.1.1.</iso:assert>
      <iso:assert id="7.3.3-62" test="not(*:codeSystemName)">codeSystemName används inte för ATC.</iso:assert>
      <iso:assert id="7.3.3-63" test="not(*:codeSystemVersion)">codeSystemVersion används inte för ATC.</iso:assert>
      <iso:assert id="7.3.3-64" test="not(*:originalText)">originalText används inte för ATC.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-ejatc">
    <iso:rule context="*:pharmaceuticalHypersensitivity">
      <iso:assert id="7.3.3-60" test="*:atcSubstance or (normalize-space(*:nonATCSubstance) and normalize-space(*:nonATCSubstanceComment))">Utan ATC-kod ska nonATCSubstance och nonATCSubstanceComment anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-samband">
    <iso:rule context="*:typeOfAlertInformationRelationship/*:codeSystem">
      <iso:assert id="7.3.3-102" test=". = '1.2.752.129.2.2.2.4'">Sambandet har KV Samband (1.2.752.129.2.2.2.4).</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-resultat">
    <iso:rule context="*:GetAlertInformationResponse">
      <iso:assert id="7.3.3-107" test="*:result/*:resultCode and *:result/*:logId">Svaret ska ha result med resultCode och logId.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-resultat-kod">
    <iso:rule context="*:result">
      <iso:assert id="7.3.3-108" test="(*:resultCode = 'ERROR' and *:errorCode) or (*:resultCode != 'ERROR' and not(*:errorCode))">errorCode anges endast när resultCode är ERROR.</iso:assert>
      <iso:assert id="7.3.3-109" test="matches(*:logId, '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')">logId ska vara en UUID.</iso:assert>
      <iso:assert id="4.4.1.1-1" test="*:resultCode != 'ERROR' or *:errorCode = 'INVALID_REQUEST'">Ett logiskt fel har errorCode INVALID_REQUEST.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-tid-authorTime">
    <iso:rule context="*:authorTime">
      <iso:assert id="4.3.2.3-2" test="matches(., '^[0-9]{4}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])([01][0-9]|2[0-3])[0-5][0-9][0-5][0-9]$')">authorTime ska vara en tidpunkt ÅÅÅÅMMDDttmmss utan tidszon.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-tid-signatureTime">
    <iso:rule context="*:signatureTime">
      <iso:assert id="4.3.2.3-2" test="matches(., '^[0-9]{4}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])([01][0-9]|2[0-3])[0-5][0-9][0-5][0-9]$')">signatureTime ska vara en tidpunkt ÅÅÅÅMMDDttmmss utan tidszon.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-tid-documentTime">
    <iso:rule context="*:documentTime">
      <iso:assert id="4.3.2.3-2" test="matches(., '^[0-9]{4}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])([01][0-9]|2[0-3])[0-5][0-9][0-5][0-9]$')">documentTime ska vara en tidpunkt ÅÅÅÅMMDDttmmss utan tidszon.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-tid-verifiedTime">
    <iso:rule context="*:verifiedTime">
      <iso:assert id="4.3.2.3-2" test="matches(., '^[0-9]{4}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])([01][0-9]|2[0-3])[0-5][0-9][0-5][0-9]$')">verifiedTime ska vara en tidpunkt ÅÅÅÅMMDDttmmss utan tidszon.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-tid-obsoleteTime">
    <iso:rule context="*:obsoleteTime">
      <iso:assert id="4.3.2.3-2" test="matches(., '^[0-9]{4}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])([01][0-9]|2[0-3])[0-5][0-9][0-5][0-9]$')">obsoleteTime ska vara en tidpunkt ÅÅÅÅMMDDttmmss utan tidszon.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-datum-*:ascertainedDate">
    <iso:rule context="*:ascertainedDate">
      <iso:assert id="4.3.2.3-1" test="matches(., '^[0-9]{4}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])$')">Ett datum ska vara ÅÅÅÅMMDD.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-datum-*:timePeriod/*:start">
    <iso:rule context="*:timePeriod/*:start">
      <iso:assert id="4.3.2.3-1" test="matches(., '^[0-9]{4}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])$')">Ett datum ska vara ÅÅÅÅMMDD.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-datum-*:timePeriod/*:end">
    <iso:rule context="*:timePeriod/*:end">
      <iso:assert id="4.3.2.3-1" test="matches(., '^[0-9]{4}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])$')">Ett datum ska vara ÅÅÅÅMMDD.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetAlertInformation-giltighet">
    <iso:rule context="*:validityTimePeriod/*:start">
      <iso:assert id="4.3.2.4-1" test="matches(., '^[0-9]{4}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])([01][0-9]|2[0-3])[0-5][0-9][0-5][0-9]$')">Tidpunkter anges utan tidszon.</iso:assert>
    </iso:rule>
  </iso:pattern>
</iso:schema>
