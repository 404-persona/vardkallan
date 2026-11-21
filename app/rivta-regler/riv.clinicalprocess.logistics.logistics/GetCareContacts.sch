<?xml version="1.0" encoding="UTF-8"?>
<!-- Vårdkällans regler ur TKB för GetCareContacts (riv.clinicalprocess.logistics.logistics), skrivna som Schematron. Varje assert har id för regeln i
     regelförteckningen bredvid (samma namn, .json). Reglerna körs av app/src/rivta/schematron.js i test/rivta-regler-*.test.js. -->
<iso:schema xmlns:iso="http://purl.oclc.org/dsdl/schematron" queryBinding="xslt2">
  <iso:title>GetCareContacts (riv.clinicalprocess.logistics.logistics)</iso:title>
  <iso:pattern id="GetCareContacts-begaran-patient">
    <iso:rule context="*:GetCareContacts/*:patientId">
      <iso:assert id="6.1.2-2" test="string-length(*:id) = 12 and not(matches(*:id, '[ -+]'))">Patientens id ska ha tolv tecken utan avskiljare.</iso:assert>
      <iso:assert id="6.1.2-3" test="not(matches(*:id, '^(18|19|20)[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[0-9]{4}$')) or *:type = '1.2.752.129.2.1.3.1'">Ett personnummer ska ha Skatteverkets OID för personnummer.</iso:assert>
      <iso:assert id="6.1.2-4" test="not(matches(*:id, '^(18|19|20)[0-9]{2}(0[1-9]|1[0-2])(6[1-9]|[78][0-9]|9[01])[0-9]{4}$')) or *:type = '1.2.752.129.2.1.3.3'">Ett samordningsnummer ska ha Skatteverkets OID för samordningsnummer.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetCareContacts-kallsystem">
    <iso:rule context="*:GetCareContacts">
      <iso:assert id="6.1.2-10" test="not(*:careContactId) or normalize-space(*:sourceSystemHSAId)">sourceSystemHSAId är tvingande om careContactId anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetCareContacts-svar-patient">
    <iso:rule context="*:careContactHeader/*:patientId">
      <iso:assert id="6.1.2-14" test="string-length(*:id) = 12 and not(matches(*:id, '[ -+]'))">Patientens id ska ha tolv tecken utan avskiljare.</iso:assert>
      <iso:assert id="6.1.2-15" test="not(matches(*:id, '^(18|19|20)[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[0-9]{4}$')) or *:type = '1.2.752.129.2.1.3.1'">Ett personnummer ska ha Skatteverkets OID för personnummer.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetCareContacts-ansvarig">
    <iso:rule context="*:careContactHeader">
      <iso:assert id="6.1.2-16" test="*:accountableHealthcareProfessional">Den ansvariga hälso- och sjukvårdspersonen ska anges om den finns.</iso:assert>
      <iso:assert id="Regel 2" test="normalize-space(*:accountableHealthcareProfessional/*:authorTime)">authorTime ska anges (Regel 2).</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetCareContacts-vardpersonal">
    <iso:rule context="*:accountableHealthcareProfessional">
      <iso:assert id="6.1.2-18" test="not(*:healthcareProfessionalHSAId) or normalize-space(*:healthcareProfessionalName)">Namnet ska anges när personen är känd.</iso:assert>
      <iso:assert id="Regel 4" test="normalize-space(*:healthcareProfessionalOrgUnit/*:orgUnitHSAId) and normalize-space(*:healthcareProfessionalOrgUnit/*:orgUnitName)">Organisationen ska anges med HSA-id (eller lokalt id) och namn.</iso:assert>
      <iso:assert id="Regel 1" test="normalize-space(*:healthcareProfessionalCareUnitHSAId) and normalize-space(*:healthcareProfessionalCareGiverHSAId)">Vårdenhetens och vårdgivarens HSA-id ska anges (Regel 1).</iso:assert>
      <iso:assert id="6.1.2-24" test="normalize-space(*:healthcareProfessionalCareUnitHSAId)">Vårdenhetens HSA-id ska anges.</iso:assert>
      <iso:assert id="6.1.2-25" test="normalize-space(*:healthcareProfessionalCareGiverHSAId)">Vårdgivarens HSA-id ska anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetCareContacts-befattning">
    <iso:rule context="*:healthcareProfessionalRoleCode/*:codeSystem">
      <iso:assert id="6.1.2-19" test=". = '1.2.752.129.2.2.1.4'">Befattningen ska om möjligt ha KV Befattning (1.2.752.129.2.2.1.4).</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetCareContacts-healthcareProfessionalRoleCode-0">
    <iso:rule context="*:healthcareProfessionalRoleCode">
      <iso:assert id="6.1.2-20" test="not(*:code) or (*:codeSystem and *:displayName)">Om code anges i healthcareProfessionalRoleCode ska också codeSystem och displayName anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetCareContacts-healthcareProfessionalRoleCode-1">
    <iso:rule context="*:healthcareProfessionalRoleCode/*:codeSystem">
      <iso:assert id="6.1.2-21" test="(../*:code and ../*:displayName) and matches(., '^[0-2](\.[0-9]+)+$')">Om codeSystem anges i healthcareProfessionalRoleCode ska också code och displayName anges, och codeSystem ska vara en OID.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetCareContacts-healthcareProfessionalRoleCode-2">
    <iso:rule context="*:healthcareProfessionalRoleCode/*:code">
      <iso:assert id="6.1.2-22" test="normalize-space(../*:displayName)">När code anges i healthcareProfessionalRoleCode ska displayName anges (samma värde som code om klartext saknas).</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetCareContacts-healthcareProfessionalRoleCode-3">
    <iso:rule context="*:healthcareProfessionalRoleCode/*:originalText">
      <iso:assert id="6.1.2-23" test="not(../*:code) and not(../*:codeSystem) and not(../*:codeSystemName) and not(../*:codeSystemVersion) and not(../*:displayName)">Om originalText anges i healthcareProfessionalRoleCode ska inget annat värde anges.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetCareContacts-tid">
    <iso:rule context="*:careContactBody">
      <iso:assert id="6.1.2-29" test="not(*:careContactCode = '1') or *:careContactStatus = '1' or *:careContactTimePeriod/*:end = *:careContactTimePeriod/*:start">För besök är sluttiden samma som starttiden.</iso:assert>
      <iso:assert id="6.1.2-30" test="not(*:careContactStatus = '1') or not(*:careContactTimePeriod/*:end)">En planerad vårdkontakt har ingen sluttid.</iso:assert>
      <iso:assert id="6.1.2-31" test="not(*:careContactCode = '3' and *:careContactStatus = '3') or not(*:careContactTimePeriod/*:end)">Ett pågående vårdtillfälle har ingen sluttid.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetCareContacts-tid-authorTime">
    <iso:rule context="*:authorTime">
      <iso:assert id="4.3.2.2-2" test="matches(., '^[0-9]{4}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])([01][0-9]|2[0-3])[0-5][0-9][0-5][0-9]$')">authorTime ska vara en tidpunkt ÅÅÅÅMMDDttmmss utan tidszon.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetCareContacts-datum-*:GetCareContacts/*:timePeriod/*:start">
    <iso:rule context="*:GetCareContacts/*:timePeriod/*:start">
      <iso:assert id="4.3.2.2-1" test="matches(., '^[0-9]{4}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])$')">Ett datum ska vara ÅÅÅÅMMDD.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetCareContacts-datum-*:GetCareContacts/*:timePeriod/*:end">
    <iso:rule context="*:GetCareContacts/*:timePeriod/*:end">
      <iso:assert id="4.3.2.2-1" test="matches(., '^[0-9]{4}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])$')">Ett datum ska vara ÅÅÅÅMMDD.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetCareContacts-kontakttid">
    <iso:rule context="*:careContactTimePeriod/*">
      <iso:assert id="4.3.2.2-2" test="matches(., '^[0-9]{4}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])([01][0-9]|2[0-3])[0-5][0-9][0-5][0-9]$')">Tidpunkter anges ÅÅÅÅMMDDttmmss.</iso:assert>
      <iso:assert id="4.3.2.3-1" test="not(matches(., '[TZ+]'))">Tidszon anges inte.</iso:assert>
    </iso:rule>
  </iso:pattern>
  <iso:pattern id="GetCareContacts-svar-sam-patient">
    <iso:rule context="*:careContactHeader/*:patientId">
      <iso:assert id="4.3.2.4-2" test="not(matches(*:id, '^(18|19|20)[0-9]{2}(0[1-9]|1[0-2])(6[1-9]|[78][0-9]|9[01])[0-9]{4}$')) or *:type = '1.2.752.129.2.1.3.3'">Ett samordningsnummer ska ha Skatteverkets OID för samordningsnummer.</iso:assert>
    </iso:rule>
  </iso:pattern>
</iso:schema>
