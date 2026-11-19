// Runda 19, r3: vägledningen i fysioterapeutens uppdrag i testinbjudan (testrollen fysioterapeut, demorollen fys-kard,
// Jenny Holmberg). Stegen har samma form som första passet (forsta-pass-steg.js) och pekar på element som redan finns
// i vyerna. Uppdragen följer Sussas testfall för paramedicinare med Sussas testdata på avdelning 72.
import { meny } from './hjalp.js';

const arbetslistan = (namn, varfor = '') => ({ id: 'meny', text: `Välj Arbetslistan i menyn och leta upp ${namn}${varfor}.`, mal: meny('#/arbetslista', 'Arbetslistan') });
// Avdelningens planering nås från arbetslistan, eftersom fysioterapeuten inte har den i menyn.
const planeringen = (text) => ({ id: 'planering', text, mal: [{ sel: 'main a[href="#/avdelning"]' }, ...meny('#/arbetslista', 'Arbetslistan').map(m => ({ ...m, text: m.text ?? 'Välj Arbetslistan i menyn. Där finns Avdelningens planering.' }))] });

export default {
  // Första passet: svara på remissen från vårdcentralen.
  '2.6': [
    arbetslistan('Sara Sandmark'),
    { id: 'patient', text: 'Klicka på Sara Sandmark för att öppna hennes journal.', mal: [{ sel: 'a.patientlank', innehaller: 'Sara Sandmark' }] },
    { id: 'flik', hash: '#/patient/sus06', text: 'Välj fliken Remisser.', mal: [{ sel: '.flikar a', innehaller: 'Remisser' }] },
    { id: 'svara', hash: '#/patient/sus06', text: 'Välj Svara vid remissen från vårdcentralen.', mal: [{ sel: '[data-remiss-atgard="svara"]' }] },
    { id: 'text', text: 'Skriv svaret: Tack för remissen. Vi har träffat Sara och gett henne rätt behandling.', mal: [{ sel: 'dialog:modal textarea' }], klar: 'varde', gor: { skriv: 'Tack för remissen. Vi har träffat Sara och gett henne rätt behandling.' } },
    { id: 'skicka', text: 'Välj Skicka svaret.', mal: [{ sel: 'dialog:modal [data-varde="ok"]' }] },
  ],
  '7.1': [
    planeringen('Välj Avdelningens planering i arbetslistan. Där står dagens händelser på avdelningen i tidsordning.'),
    { id: 'svar', hash: '#/avdelning', text: 'Läs vilka händelser som står vid klockan 11 och skriv dem i svarsfältet i panelen. Välj sedan Svara.', mal: [{ sel: '#tp-svar' }, { sel: '#testare [data-tp="vaxla"]', text: 'Läs vilka händelser som står vid klockan 11. Öppna panelen med uppdraget och skriv dem i svarsfältet.' }], gor: { skriv: 'provtagning och sjukgymnastik', tangent: 'Enter' } },
  ],
  '2.3': [
    { id: 'meny', text: 'Välj Remisser i menyn.', mal: meny('#/remisser', 'Remisser') },
    { id: 'fordela', hash: '#/remisser', text: 'Välj Fördela vid remissen för Berit Strandhall.', mal: [{ sel: 'article.remiss:has(a[href^="#/patient/sus05/"]) [data-remiss-atgard="fordela"]' }] },
    { id: 'lakare', text: 'Välj bakjouren Göran Malm.', mal: [{ sel: 'dialog:modal [data-varde="ol-kard"]' }] },
  ],
  uppgift: [
    planeringen('Välj Avdelningens planering i arbetslistan.'),
    { id: 'utford', hash: '#/avdelning', text: 'Gångträningen där du, Jenny Holmberg, står som ansvarig är gjord. Välj Utförd på den raden.', mal: [{ sel: 'tr:has(a.av-resurs[href$="/fys-kard"]) [data-utford]' }] },
  ],
  '4.1': [
    arbetslistan('Berit Strandhall'),
    { id: 'patient', text: 'Klicka på Berit Strandhall för att öppna hennes journal.', mal: [{ sel: 'a.patientlank', innehaller: 'Berit Strandhall' }] },
    { id: 'tobak', hash: '#/patient/sus05', text: 'Välj Dokumentera tobaksvanor.', mal: [{ sel: '[data-tobak-ny]' }] },
    { id: 'dagligen', hash: '#/patient/sus05', text: 'Hon röker cigaretter varje dag. Välj Dagligen vid cigaretter.', mal: [{ sel: '#tb-cigaretter-dagligen' }], klar: 'valt' },
    { id: 'antal', hash: '#/patient/sus05', text: 'Skriv 25 cigaretter per dag.', mal: [{ sel: '#tb-antal-cigaretter' }], klar: 'varde', gor: { skriv: '25' } },
    { id: 'stod', hash: '#/patient/sus05', text: 'Systemet föreslår rådgivande samtal om rökavvänjning. Hon tackar ja: välj Erbjudet och accepterat.', mal: [{ sel: '#tb-stod-accepterat' }], klar: 'valt' },
    { id: 'kommentar', hash: '#/patient/sus05', text: 'Skriv en kort kommentar, till exempel att hon vill sluta före sommaren.', mal: [{ sel: '#tb-kommentar' }], klar: 'varde', gor: { skriv: 'Vill sluta före sommaren.' } },
    { id: 'signera', hash: '#/patient/sus05', text: 'Systemet har skrivit anteckningen ur dina svar. Välj Signera.', mal: [{ sel: '.ant-form [data-signera]' }] },
  ],
  matvarde: [
    arbetslistan('Elin Sandberg', ', som du just har tränat med'),
    { id: 'patient', text: 'Klicka på Elin Sandberg för att öppna hennes journal. Det går lika bra med en annan patient.', mal: [{ sel: 'a.patientlank', innehaller: 'Elin Sandberg' }, { sel: 'a.patientlank' }] },
    { id: 'matvarde', hash: '#/patient', text: 'Välj Registrera mätvärde.', mal: [{ sel: 'main a[href$="/matvarden/ny"]' }] },
    { id: 'typ', hash: '#/patient', text: 'Skriv Puls i sökfältet vid Mätvärde, så väljer systemet pulsen.', mal: [{ sel: '.ls-sok:has(+ #mv-typ)' }], klar: 'varde', gor: { skriv: 'Puls' } },
    { id: 'varde', hash: '#/patient', text: 'Skriv pulsen efter träningen, till exempel 96.', mal: [{ sel: '#mv-varde' }], klar: 'varde', gor: { skriv: '96' } },
    { id: 'registrera', hash: '#/patient', text: 'Systemet har satt tiden till nu. Välj Registrera.', mal: [{ sel: 'form:has(#mv-varde) [type="submit"]' }] },
  ],
  '2.1': [
    arbetslistan('Mira Axelsson'),
    { id: 'patient', text: 'Klicka på Mira Axelsson för att öppna hennes journal.', mal: [{ sel: 'a.patientlank', innehaller: 'Mira Axelsson' }] },
    { id: 'remiss', hash: '#/patient/sus17', text: 'Välj Skicka remiss.', mal: [{ sel: '.snabbval a', innehaller: 'Skicka remiss' }] },
    { id: 'mottagare', hash: '#/patient/sus17', text: 'Demon har ingen hudklinik. Skriv Medicinska kliniken USÖ i sökfältet vid Mottagare.', mal: [{ sel: '#remissform .ls-sok:has(+ #rf-till)' }], klar: 'varde', gor: { skriv: 'Medicinska kliniken USÖ' } },
    { id: 'fraga', hash: '#/patient/sus17', text: 'Skriv frågeställningen: Hudförändring, malignt?', mal: [{ sel: '#rf-fraga' }], klar: 'varde', gor: { skriv: 'Hudförändring, malignt?' } },
    { id: 'anamnes', hash: '#/patient/sus17', text: 'Skriv anamnesen: Pat har en hudförändring på låret som har förändrats snabbt. Är det malignt?', mal: [{ sel: '#rf-anamnes' }], klar: 'varde', gor: { skriv: 'Pat har en hudförändring på låret som har förändrats snabbt. Är det malignt?' } },
    { id: 'skicka', hash: '#/patient/sus17', text: 'Välj Skicka remissen.', mal: [{ sel: '#remissform [type="submit"]' }] },
  ],
};
