// Runda 19, r1: vägledningen i uppdragen för läkaren på sjukhus (Sara Lindqvist, kardiologiska kliniken), med Sussas
// testdata. Formatet står överst i forsta-pass-steg.js. Uppdragen och deras id står i src/testinbjudan.js (TESTROLLER).
import { meny, patient, flik, svar, ordination, sokPatient, VALT } from './hjalp.js';
import { PASS_STEG } from '../forsta-pass-steg.js';

const ARBETSLISTAN = { id: 'meny', text: 'Välj Arbetslistan i menyn.', mal: meny('#/arbetslista', 'Arbetslistan') };
const fran = (namn, text = `Klicka på ${namn} för att öppna journalen.`) => [
  ARBETSLISTAN,
  { id: 'patient', text, mal: [{ sel: 'a.patientlank', innehaller: namn }, { sel: '#traffar a', innehaller: namn }] },
];
const AVDELNINGEN = { id: 'avdelning', text: 'Välj Avdelningens planering.', mal: [{ sel: '.snabbval a[href="#/avdelning"]' }, { sel: '#meny-lista a[href="#/avdelning"]' }] };

const PARACETAMOL = { sel: '.lm-tabell', innehaller: 'Paracetamol Fresenius' };

export default {
  'forsta-patient': [
    ARBETSLISTAN,
    { id: 'patient', text: 'Klicka på en av dina patienter, till exempel Bertil Danielsson. Den senaste anteckningen står först i journalen.', mal: patient('Bertil Danielsson') },
  ],
  '3.4': [
    ...fran('Bertil Danielsson'),
    { id: 'flik', hash: '#/patient/sus01', text: 'Välj fliken Mätvärden. Provsvaren står där.', mal: flik('Mätvärden') },
    { id: 'andra', hash: '#/patient/sus01/matvarden', text: 'PK-provet togs på vårdcentralen. Välj Visa uppgifter från andra vårdenheter.', mal: [{ sel: '[data-val="andra_enheter"]' }] },
    { id: 'syfte', text: 'Välj ett av de vanliga syftena, eller skriv varför du behöver uppgifterna.', mal: [{ sel: 'dialog:modal #dlg-syfte' }], klar: 'varde', gor: { skriv: 'Uppföljning av provsvar' } },
    { id: 'visa', text: 'Välj Visa uppgifterna.', mal: [{ sel: 'dialog:modal [data-varde="ok"]' }] },
    svar({ hash: '#/patient/sus01', nar: { sel: 'tr', innehaller: 'Vårdcentralen Tybble' }, text: 'PK-provet från vårdcentralen står i raden PK (INR), taget klockan 11.36. Skriv värdet här och välj Svara.', svar: '0,9' }),
  ],
  '1.2': [
    ...fran('Elin Arnström'),
    ...ordination({ pre: 'paracetamol', sok: 'paracetamol fresenius', namn: 'Paracetamol Fresenius Kabi', orsak: 'Smärta' }),
    ...ordination({ pre: 'stesolid', sok: 'stesolid', namn: 'Stesolid 10', orsak: 'Premedicinering inför röntgen', nar: PARACETAMOL }),
  ],
  varning: [
    ...sokPatient('Gunnar Åkesson'),
    ...ordination({ pre: 'ibuprofen', sok: 'ibuprofen', namn: 'Ibuprofen', orsak: 'Smärta', typ: 'Vid behov' }),
    { id: 'motivering', nar: VALT, text: 'Systemet varnar för blödning, eftersom han har Waran. Skriv varför ordinationen ska göras ändå, eller välj Avbryt.', mal: [{ sel: '#ordform [data-motivering]' }], klar: 'varde', gor: { skriv: 'Kort behandling, följer blödningsrisken.' } },
    { id: 'spara-igen', nar: [VALT, { sel: '#ordform [data-motivering]' }], text: 'Välj Kontrollera och spara igen. Varningen och din motivering sparas med ordinationen.', mal: [{ sel: '#ordform [data-spara]' }] },
  ],
  '3.1': PASS_STEG['lakare-sjukhus'],
  '2.3': [
    { id: 'meny', text: 'Välj Remisser i menyn.', mal: meny('#/remisser', 'Remisser') },
    { id: 'fordela', hash: '#/remisser', text: 'Välj Fördela vid remissen för Berit Strandhall.', mal: [{ sel: '[data-remiss-atgard="fordela"]', rad: 'article.remiss', innehaller: 'Berit Strandhall' }, { sel: '[data-remiss-atgard="fordela"]' }] },
    { id: 'lakare', text: 'Välj bakjouren Göran Malm.', mal: [{ sel: 'dialog:modal [data-varde="ol-kard"]' }] },
  ],
  '2.6': [
    ...fran('Sara Sandmark'),
    { id: 'flik', hash: '#/patient/sus06', text: 'Välj fliken Remisser.', mal: flik('Remisser') },
    { id: 'svara', hash: '#/patient/sus06', text: 'Välj Svara vid remissen från vårdcentralen.', mal: [{ sel: '[data-remiss-atgard="svara"]' }] },
    { id: 'text', text: 'Skriv svaret: Tack för remissen. Vi har träffat Sara och gett henne rätt behandling.', mal: [{ sel: 'dialog:modal textarea' }], klar: 'varde', gor: { skriv: 'Tack för remissen. Vi har träffat Sara och gett henne rätt behandling.' } },
    { id: 'skicka', text: 'Välj Skicka svaret.', mal: [{ sel: 'dialog:modal [data-varde="ok"]' }] },
  ],
  '2.1': [
    ...fran('Mira Axelsson'),
    { id: 'remiss', hash: '#/patient/sus17', text: 'Välj Skicka remiss.', mal: [{ sel: '.snabbval a', innehaller: 'Skicka remiss' }] },
    { id: 'till', text: 'Välj mottagaren Medicinska kliniken USÖ under Till vårdenhet.', mal: [{ sel: '#remissform select[name="tillEnhetId"]' }], klar: 'andrat', gor: { skriv: 'uso-med' } },
    { id: 'fraga', text: 'Skriv frågeställningen: Hudförändring, malignt?', mal: [{ sel: '#remissform textarea[name="fragestallning"]' }], klar: 'varde', gor: { skriv: 'Hudförändring, malignt?' } },
    { id: 'anamnes', text: 'Skriv anamnesen: Pat har en hudförändring på låret som har förändrats snabbt.', mal: [{ sel: '#remissform textarea[name="anamnes"]' }], klar: 'varde', gor: { skriv: 'Pat har en hudförändring på låret som har förändrats snabbt. Är det malignt?' } },
    { id: 'skicka', text: 'Välj Skicka remissen.', mal: [{ sel: '#remissform [type="submit"]' }] },
  ],
  '7.3': [
    ARBETSLISTAN,
    AVDELNINGEN,
    { id: 'plan', hash: '#/avdelning', text: 'Välj Planering vid Bertil Danielsson.', mal: [{ sel: '#av-patienter a.av-plan', rad: 'li', innehaller: 'Bertil Danielsson' }] },
    svar({ hash: '#/avdelning/patient', nar: { sel: '.av-dag.av-idag tr[data-klocka="15.00"]' }, text: 'Dagen i dag är markerad. Händelsen klockan 15 står på raden 15.00. Skriv vad den heter här och välj Svara.', svar: 'EKG' }),
  ],
  '6.3': [
    ...fran('Bertil Danielsson'),
    { id: 'sok', hash: '#/patient/sus01', text: 'Skriv epikris i sökfältet i journalen och tryck Enter.', mal: [{ sel: '#jsok-falt' }], gor: { skriv: 'epikris', tangent: 'Enter' } },
    { id: 'traff', hash: '#/patient/sus01', text: 'Välj epikrisen från vårdtillfället 2016.', mal: [{ sel: '.jsok-traff a[data-traff="anteckning"]', innehaller: 'Epikris' }] },
    svar({ hash: '#/patient/sus01', nar: { sel: '.anteckning .ant-huvud h2', innehaller: 'Epikris' }, text: 'Huvuddiagnosen står i epikrisen, med sin kod. Skriv diagnosen här och välj Svara.', svar: 'Sepsis' }),
  ],
  '4.3': [
    ...fran('Anna Karlsson'),
    { id: 'epikris', hash: '#/patient/sus07', text: 'Välj Skriv epikris vid vårdtillfället.', mal: [{ sel: '.vardtillfalle [data-epikris]' }] },
    { id: 'forlopp', hash: '#/patient/sus07', text: 'Systemet har skrivit orsaken och diagnosen ur vårdtillfället. Skriv förloppet, till exempel att hon blev bättre av antibiotika.', mal: [{ sel: 'textarea[data-sokord="Förlopp"]' }], klar: 'varde', gor: { skriv: 'Inkom med feber och frossa. Sepsis, behandlad med antibiotika. Avsevärt förbättrad.' } },
    { id: 'uppfoljning', hash: '#/patient/sus07', text: 'Skriv uppföljningen, till exempel ett återbesök om tre veckor.', mal: [{ sel: 'textarea[data-sokord="Uppföljning"]' }], klar: 'varde', gor: { skriv: 'Återbesök om 3 veckor.' } },
    { id: 'signera', hash: '#/patient/sus07', text: 'Välj Signera.', mal: [{ sel: '.ant-form [data-signera]' }] },
  ],
  '7.4': [
    ARBETSLISTAN,
    AVDELNINGEN,
    { id: 'resurs', hash: '#/avdelning', text: 'Välj läkaren Göran Malm vid en av händelserna.', mal: [{ sel: '#av a.av-resurs', innehaller: 'Göran Malm' }] },
    svar({ hash: '#/avdelning/resurs', nar: { sel: '.av-dag.av-idag tr[data-klocka="11.00"]' }, text: 'Dagen i dag är markerad. Läkarens uppgift klockan 11 står på raden 11.00. Skriv vad den heter här och välj Svara.', svar: 'Infektionskonsult' }),
  ],
};
