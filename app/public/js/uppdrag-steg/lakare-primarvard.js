// Runda 19, r1: vägledningen i uppdragen för läkaren i primärvården (Per Holm, Vårdcentralen Tybble), med Sussas
// testdata. Formatet står överst i forsta-pass-steg.js. Uppdragen och deras id står i src/testinbjudan.js (TESTROLLER).
import { meny, patient, svar, ordination, sokPatient } from './hjalp.js';
import { PASS_STEG } from '../forsta-pass-steg.js';

const ARBETSLISTAN = { id: 'meny', text: 'Välj Arbetslistan i menyn.', mal: meny('#/arbetslista', 'Arbetslistan') };
const fran = (namn, text = `Klicka på ${namn} för att öppna journalen.`) => [
  ARBETSLISTAN,
  { id: 'patient', text, mal: [{ sel: 'a.patientlank', innehaller: namn }, { sel: '#traffar a', innehaller: namn }] },
];
const INKORGEN = { id: 'meny', text: 'Välj Inkorg i menyn.', mal: meny('#/inkorg', 'Inkorg') };
const ALVEDON = { sel: '.lm-tabell', innehaller: 'Alvedon' };

export default {
  '5.6': [
    ARBETSLISTAN,
    { id: 'tidbok', text: 'Välj Min tidbok.', mal: [{ sel: '.snabbval a[href="#/tidbok"]' }, { sel: '#meny-lista a[href="#/tidbok"]' }] },
    svar({ hash: '#/tidbok', nar: { sel: '.tb-bokning', innehaller: 'Incheckad' }, text: 'Patienterna som har kommit står med Incheckad i tidboken. Räkna dem, skriv antalet här och välj Svara.', svar: '5' }),
  ],
  'forsta-patient': [
    ARBETSLISTAN,
    { id: 'patient', text: 'Klicka på en av patienterna som har kommit, till exempel Tomas Vik. Den senaste anteckningen står först i journalen.', mal: patient('Tomas Vik') },
  ],
  '4.2': [
    ...fran('Sara Sandmark'),
    { id: 'matvarde', hash: '#/patient/sus06', text: 'Välj Registrera mätvärde.', mal: [{ sel: '.snabbval a', innehaller: 'Registrera mätvärde' }] },
    { id: 'flera', hash: '#/patient/sus06', text: 'Välj Längd, vikt, blodtryck och puls på en gång.', mal: [{ sel: '[data-flera-ny]' }] },
    { id: 'langd', hash: '#/patient/sus06', text: 'Skriv längden 165.', mal: [{ sel: '#fl-langd' }], klar: 'varde', gor: { skriv: '165' } },
    { id: 'vikt', hash: '#/patient/sus06', text: 'Skriv vikten 75.', mal: [{ sel: '#fl-vikt' }], klar: 'varde', gor: { skriv: '75' } },
    { id: 'blodtryck', hash: '#/patient/sus06', text: 'Skriv blodtrycket 140/90.', mal: [{ sel: '#fl-blodtryck' }], klar: 'varde', gor: { skriv: '140/90' } },
    { id: 'puls', hash: '#/patient/sus06', text: 'Skriv pulsen 83.', mal: [{ sel: '#fl-puls' }], klar: 'varde', gor: { skriv: '83' } },
    { id: 'registrera', hash: '#/patient/sus06', text: 'Systemet sätter tiden och räknar BMI. Välj Registrera.', mal: [{ sel: '#flera-form [type="submit"]' }] },
  ],
  '4.1': PASS_STEG['lakare-primarvard'],
  '1.1': [
    ...fran('Gerda Ström'),
    ...ordination({ pre: 'alvedon', sok: 'alvedon forte', namn: 'Alvedon forte', orsak: 'Värk', typ: 'Vid behov' }),
    ...ordination({ pre: 'ogondroppar', sok: 'kloramfenikol', namn: 'ögondroppar', orsak: 'Infektion', nar: ALVEDON }),
  ],
  '3.1': [
    ...fran('Hamid Burvall'),
    { id: 'bestall', hash: '#/patient/sus19', text: 'Välj Beställ prover.', mal: [{ sel: '.snabbval a', innehaller: 'Beställ prover' }] },
    { id: 'paket', hash: '#/patient/sus19', text: 'Systemet föreslår ett provpaket ur orsaken till besöket, med laboratorium och rör. Välj Beställ vid paketet.', mal: [{ sel: '#pr-forslag [data-bestall-paket="feber"]' }, { sel: '#pr-forslag [data-bestall-paket]' }] },
  ],
  '3.5': [
    ...sokPatient('Inga Strand'),
    { id: 'kontroller', hash: '#/patient/sus14', text: 'Välj Kontroller.', mal: [{ sel: '.snabbval a', innehaller: 'Kontroller' }] },
    { id: 'puls', text: 'Välj Puls.', mal: [{ sel: '#pr-k-puls' }], klar: 'valt' },
    { id: 'blodtryck', text: 'Välj Blodtryck.', mal: [{ sel: '#pr-k-blodtryck' }], klar: 'valt' },
    { id: 'sr', text: 'Välj SR, sänkningsreaktionen.', mal: [{ sel: '#pr-k-sr' }], klar: 'valt' },
    { id: 'temp', text: 'Välj Temperatur.', mal: [{ sel: '#pr-k-temp' }], klar: 'valt' },
    { id: 'vikt', text: 'Välj Vikt.', mal: [{ sel: '#pr-k-vikt' }], klar: 'valt' },
    { id: 'vatskebalans', text: 'Välj Vätskebalans.', mal: [{ sel: '#pr-k-vatskebalans' }], klar: 'valt' },
    { id: 'ordinera', text: 'Systemet har valt klockan 7 och vätskebalansen ett dygn. Välj Ordinera.', mal: [{ sel: '#pr-kform [data-spara-kontroll]' }] },
  ],
  '2.1': [
    ...fran('Mira Axelsson'),
    { id: 'remiss', hash: '#/patient/sus17', text: 'Välj Skicka remiss.', mal: [{ sel: '.snabbval a', innehaller: 'Skicka remiss' }] },
    { id: 'till', text: 'Välj mottagaren Medicinska kliniken USÖ under Till vårdenhet.', mal: [{ sel: '#remissform select[name="tillEnhetId"]' }], klar: 'andrat', gor: { skriv: 'uso-med' } },
    { id: 'fraga', text: 'Skriv frågeställningen: Hudförändring, malignt?', mal: [{ sel: '#remissform textarea[name="fragestallning"]' }], klar: 'varde', gor: { skriv: 'Hudförändring, malignt?' } },
    { id: 'anamnes', text: 'Skriv anamnesen: Pat har en hudförändring på låret som har förändrats snabbt.', mal: [{ sel: '#remissform textarea[name="anamnes"]' }], klar: 'varde', gor: { skriv: 'Pat har en hudförändring på låret som har förändrats snabbt. Är det malignt?' } },
    { id: 'skicka', text: 'Välj Skicka remissen.', mal: [{ sel: '#remissform [type="submit"]' }] },
  ],
  kvittera: [
    INKORGEN,
    { id: 'svar', hash: '#/inkorg', text: 'Välj remissvaret under Okvitterade remissvar.', mal: [{ sel: '#ik-svar ~ ul a' }] },
    { id: 'kvittera', text: 'Läs svaret och välj Kvittera svaret.', mal: [{ sel: '.remiss.markerad [data-remiss-atgard="kvittera"]' }] },
  ],
  '4.4': [
    INKORGEN,
    { id: 'alla', hash: '#/inkorg', text: 'Välj Granska och signera alla.', mal: [{ sel: '[data-signera-alla]' }] },
    { id: 'signera', text: 'Systemet visar alla anteckningar som ska signeras. Välj Signera alla.', mal: [{ sel: 'dialog:modal [data-varde="ok"]' }] },
  ],
};
