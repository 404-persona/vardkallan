// Runda 19, r2: vägledningen i sjuksköterskans uppdrag i testinbjudan (testroll sjukskoterska, demoroll ssk-kard på
// avdelning 72). Stegen har samma form som i första passet (forsta-pass-steg.js) och följer klickvägarna i Sussas
// testfall (test/sussa-testfall.cjs) med Sussas testpatienter. Uppdragen görs i tur och ordning i samma sandlåda.
import { meny } from './hjalp.js';

const arbetslistan = (namn) => ({ id: 'meny', text: `Välj Arbetslistan i menyn och leta upp ${namn}.`, mal: meny('#/arbetslista', 'Arbetslistan') });
const oppna = (namn, hans) => ({ id: 'patient', text: `Klicka på ${namn} för att öppna ${hans} journal.`, mal: [{ sel: 'a.patientlank', innehaller: namn }] });
// En patient som testaren väljer själv: systemet föreslår en, men vägledningen följer med till vilken patient som helst.
const valfri = (namn, hans) => ({ id: 'patient', text: `Klicka på ${namn} för att öppna ${hans} journal, eller välj en annan patient på avdelningen.`, mal: [{ sel: 'a.patientlank', innehaller: namn }, { sel: '#lista a.patientlank', text: 'Klicka på en patient på avdelningen för att öppna journalen.' }] });

// Mätvärdena i Sussas testfall 4.2, samma steg som i första passet.
const matvarden = [
  arbetslistan('Sara Sandmark'),
  oppna('Sara Sandmark', 'hennes'),
  { id: 'matvarde', hash: '#/patient/sus06', text: 'Välj Registrera mätvärde.', mal: [{ sel: '.snabbval a', innehaller: 'Registrera mätvärde' }] },
  { id: 'flera', hash: '#/patient/sus06', text: 'Välj Längd, vikt, blodtryck och puls på en gång.', mal: [{ sel: '[data-flera-ny]' }] },
  { id: 'langd', hash: '#/patient/sus06', text: 'Skriv längden 165.', mal: [{ sel: '#fl-langd' }], klar: 'varde', gor: { skriv: '165' } },
  { id: 'vikt', hash: '#/patient/sus06', text: 'Skriv vikten 75.', mal: [{ sel: '#fl-vikt' }], klar: 'varde', gor: { skriv: '75' } },
  { id: 'blodtryck', hash: '#/patient/sus06', text: 'Skriv blodtrycket 140/90.', mal: [{ sel: '#fl-blodtryck' }], klar: 'varde', gor: { skriv: '140/90' } },
  { id: 'puls', hash: '#/patient/sus06', text: 'Skriv pulsen 83.', mal: [{ sel: '#fl-puls' }], klar: 'varde', gor: { skriv: '83' } },
  { id: 'registrera', hash: '#/patient/sus06', text: 'Systemet sätter tiden och räknar BMI. Välj Registrera.', mal: [{ sel: '#flera-form [type="submit"]' }] },
];

export default {
  '7.1': [
    { id: 'meny', text: 'Välj Arbetslistan i menyn.', mal: meny('#/arbetslista', 'Arbetslistan') },
    { id: 'avdelning', hash: '#/arbetslista', text: 'Välj Avdelningens planering.', mal: [{ sel: '.snabbval a[href="#/avdelning"]' }] },
    { id: 'klockan', hash: '#/avdelning', text: 'Systemet visar dagens händelser för hela avdelningen i tidsordning. Läs raderna vid 11.00.', mal: [{ sel: '#av .av-tabell tr[data-klocka="11.00"]' }] },
    { id: 'svar', hash: '#/avdelning', text: 'Skriv vilka händelser som äger rum klockan 11 här i panelen och välj Svara.', mal: [{ sel: '#tp-svar' }] },
  ],
  '6.1': [
    arbetslistan('Mira Axelsson'),
    oppna('Mira Axelsson', 'hennes'),
    { id: 'skriv-in', hash: '#/patient/sus17', text: 'Mira ska läggas in akut. Välj Skriv in under Vårdkontakter.', mal: [{ sel: '[data-vk="skriv-in"]' }] },
    { id: 'orsak', text: 'Skriv orsaken: Feber och frossa.', mal: [{ sel: 'dialog:modal #si-orsak' }], klar: 'varde', gor: { skriv: 'Feber och frossa' } },
    { id: 'plats', text: 'Systemet har valt din avdelning. Skriv sal och säng: Avd 72, sal 5, säng 1.', mal: [{ sel: 'dialog:modal #si-plats' }], klar: 'varde', gor: { skriv: 'Avd 72, sal 5, säng 1' } },
    { id: 'skriv-in-knapp', text: 'Välj Skriv in. Systemet sätter tiden och öppnar vårdtillfället.', mal: [{ sel: 'dialog:modal:has(#si-orsak) [data-varde="ok"]', innehaller: 'Skriv in' }] },
  ],
  '4.2': matvarden,
  news2: [
    arbetslistan('Gunnar Åkesson'),
    valfri('Gunnar Åkesson', 'hans'),
    { id: 'flik', hash: '#/patient', text: 'Välj fliken Mätvärden.', mal: [{ sel: '.flikar a', innehaller: 'Mätvärden' }] },
    { id: 'news2', hash: '#/patient', text: 'Välj Registrera NEWS2-kontroll.', mal: [{ sel: '[data-news2-ny]' }] },
    { id: 'andning', hash: '#/patient', text: 'Skriv andningsfrekvensen 22.', mal: [{ sel: '#n2-andningsfrekvens' }], klar: 'varde', gor: { skriv: '22' } },
    { id: 'saturation', hash: '#/patient', text: 'Skriv syremättnaden 95.', mal: [{ sel: '#n2-saturation' }], klar: 'varde', gor: { skriv: '95' } },
    { id: 'blodtryck', hash: '#/patient', text: 'Skriv blodtrycket 118/72.', mal: [{ sel: '#n2-blodtryck' }], klar: 'varde', gor: { skriv: '118/72' } },
    { id: 'puls', hash: '#/patient', text: 'Skriv pulsen 112.', mal: [{ sel: '#n2-puls' }], klar: 'varde', gor: { skriv: '112' } },
    { id: 'temp', hash: '#/patient', text: 'Skriv temperaturen 38,4.', mal: [{ sel: '#n2-temp' }], klar: 'varde', gor: { skriv: '38,4' } },
    { id: 'vaken', hash: '#/patient', text: 'Patienten är vaken. Välj A, vaken.', mal: [{ sel: '#n2-acvpu-A' }], klar: 'valt' },
    { id: 'registrera', hash: '#/patient', text: 'Systemet räknar poängen och föreslår vad som ska göras. Välj Registrera kontrollen.', mal: [{ sel: '#news2-form [type="submit"]' }] },
  ],
  '1.4': [
    { id: 'meny', text: 'Välj Läkemedel att ge i menyn.', mal: meny('#/administrering', 'Läkemedel att ge') },
    { id: 'ge', hash: '#/administrering', text: 'Systemet visar dosen och instruktionen för Bertil Danielsson. Välj Ge vid Paracetamol.', mal: [{ sel: '[data-adm="ge"][data-namn^="Paracetamol"]' }] },
    { id: 'identitet', text: 'Kontrollera att det är rätt patient och välj Identiteten är kontrollerad.', mal: [{ sel: 'dialog:modal:has(#adm-id) [data-varde="ok"]' }] },
  ],
  '1.3': [
    arbetslistan('Trevis Ljung'),
    oppna('Trevis Ljung', 'hans'),
    { id: 'flik', hash: '#/patient/sus04', text: 'Välj fliken Läkemedel.', mal: [{ sel: '.flikar a', innehaller: 'Läkemedel' }] },
    { id: 'muntlig', hash: '#/patient/sus04', text: 'Läkaren ordinerade per telefon. Välj Muntlig ordination.', mal: [{ sel: '[data-muntlig]' }] },
    { id: 'omedelbar', hash: '#/patient/sus04', text: 'Systemet har föreslagit läkaren. Ändra om någon annan ordinerade, och skriv varför behandlingen inte kan vänta: Svår smärta.', mal: [{ sel: '#ordform input[name="omedelbar"]' }], klar: 'varde', gor: { skriv: 'Svår smärta' } },
    { id: 'sok', hash: '#/patient/sus04', text: 'Skriv alvedon forte vid Läkemedel.', mal: [{ sel: '#lm-sok' }], klar: 'varde', gor: { skriv: 'alvedon forte' } },
    { id: 'traff', hash: '#/patient/sus04', text: 'Välj Alvedon forte i listan. Systemet fyller i doseringen ur läkemedlet.', mal: [{ sel: '#lm-traffar [data-lm]', innehaller: 'Alvedon forte' }], klar: 'valt' },
    { id: 'orsak', hash: '#/patient/sus04', text: 'Skriv ordinationsorsaken: Smärta.', mal: [{ sel: '#ordform input[name="ordinationsorsak"]' }], klar: 'varde', gor: { skriv: 'Smärta' } },
    { id: 'spara', hash: '#/patient/sus04', text: 'Det är en engångsdos: välj engångsdos under Förslag på typ, så sätter systemet typ och slutdatum. Välj sedan Kontrollera och spara.', mal: [{ sel: '#ordform [data-spara]' }] },
  ],
  '3.2': [
    arbetslistan('Laura August'),
    oppna('Laura August', 'hennes'),
    { id: 'bestall', hash: '#/patient/sus18', text: 'Välj Beställ prover.', mal: [{ sel: '.snabbval a', innehaller: 'Beställ prover' }] },
    { id: 'paket', hash: '#/patient/sus18', text: 'Du beställer på uppdrag av läkaren som systemet har valt vid På uppdrag av. Systemet föreslår paketet Feber och frossa ur orsaken till besöket. Välj Beställ vid paketet. Läkaren signerar sedan i sin inkorg.', mal: [{ sel: '#pr-forslag [data-bestall-paket="feber"]' }] },
  ],
  '3.3': [
    { id: 'meny', text: 'Välj Prover och kontroller i menyn.', mal: meny('#/provtagning', 'Prover och kontroller') },
    { id: 'tagen', hash: '#/provtagning', text: 'Systemet visar Trevis Ljungs beställning med blodstatus, B12, folat och urinodling. Välj Tagen vid ett rör i taget när du har tagit provet.', mal: [{ sel: '.pt-patient:has(#pt-p-sus04) [data-tagen]' }] },
  ],
  '4.1': [
    arbetslistan('Berit Strandhall'),
    oppna('Berit Strandhall', 'hennes'),
    { id: 'tobak', hash: '#/patient/sus05', text: 'Välj Dokumentera tobaksvanor.', mal: [{ sel: '[data-tobak-ny]' }] },
    { id: 'dagligen', hash: '#/patient/sus05', text: 'Hon röker cigaretter varje dag. Välj Dagligen vid cigaretter.', mal: [{ sel: '#tb-cigaretter-dagligen' }], klar: 'valt' },
    { id: 'antal', hash: '#/patient/sus05', text: 'Skriv 25 cigaretter per dag.', mal: [{ sel: '#tb-antal-cigaretter' }], klar: 'varde', gor: { skriv: '25' } },
    { id: 'stod', hash: '#/patient/sus05', text: 'Systemet föreslår rådgivande samtal om rökavvänjning. Hon tackar ja: välj Erbjudet och accepterat.', mal: [{ sel: '#tb-stod-accepterat' }], klar: 'valt' },
    { id: 'kommentar', hash: '#/patient/sus05', text: 'Skriv en kort kommentar, till exempel att hon vill sluta före sommaren.', mal: [{ sel: '#tb-kommentar' }], klar: 'varde', gor: { skriv: 'Vill sluta före sommaren.' } },
    { id: 'signera', hash: '#/patient/sus05', text: 'Systemet har skrivit anteckningen ur dina svar. Välj Signera.', mal: [{ sel: '.ant-form [data-signera]' }] },
  ],
  '6.2': [
    arbetslistan('Fatima Baskar'),
    oppna('Fatima Baskar', 'hennes'),
    { id: 'flytta', hash: '#/patient/sus16', text: 'Välj Flytta vid vårdtillfället.', mal: [{ sel: '.vardtillfalle [data-vk="flytta"]' }] },
    { id: 'avdelning', text: 'Skriv orto i sökfältet vid Till, så väljer systemet Ortopediska kliniken USÖ. Hon ska inte ha någon säng än, så lämna sal och säng tomt.', mal: [{ sel: 'dialog:modal .falt:has(select[name="enhetId"]) .ls-sok' }], klar: 'varde', gor: { skriv: 'Ortopediska kliniken USÖ' } },
    { id: 'flytta-knapp', text: 'Välj Flytta. Systemet sätter tiden och flyttar vårdtillfället.', mal: [{ sel: 'dialog:modal:has(#fl-enhet) [data-varde="ok"]', innehaller: 'Flytta' }] },
  ],
  meddelande: [
    { id: 'meny', text: 'Välj Meddelanden i menyn.', mal: meny('#/meddelanden', 'Meddelanden') },
    { id: 'trad', hash: '#/meddelanden', text: 'Gunnar Åkesson har skrivit en fråga till vården. Klicka på meddelandet.', mal: [{ sel: '#md-tabell a[data-md-typ="fraga"]' }, { sel: '#md-tabell a[data-md-trad]', text: 'Klicka på ett meddelande från en patient.' }] },
    { id: 'svar', hash: '#/meddelanden', text: 'Skriv ditt svar, till exempel: Ja, ta dem som vanligt.', mal: [{ sel: '#md-text' }], klar: 'varde', gor: { skriv: 'Ja, ta dem som vanligt.' } },
    { id: 'skicka', hash: '#/meddelanden', text: 'Välj Svara och avsluta. Patienten får svaret i Min journal.', mal: [{ sel: '[data-md="svara-avsluta"]' }, { sel: '[data-md="svara"]', text: 'Välj Skicka svar. Patienten får svaret i Min journal.' }] },
  ],
  utskrivning: [
    arbetslistan('Elin Sandberg'),
    valfri('Elin Sandberg', 'hennes'),
    { id: 'skriv-ut', hash: '#/patient', text: 'Välj Skriv ut vid vårdtillfället.', mal: [{ sel: '.vardtillfalle [data-vk="skriv-ut"]' }] },
    { id: 'skriv-ut-knapp', text: 'Systemet har kontrollerat vårdtillfället och visar om något behöver göras före utskrivningen. Välj Skriv ut.', mal: [{ sel: 'dialog:modal [data-varde="ok"]', innehaller: 'Skriv ut' }] },
  ],
};
