// Runda 19, r3: vägledningen i vårdadministratörens uppdrag i testinbjudan (testrollen vardadministrator, demorollen
// adm-kard, Karin Berg). Stegen har samma form som första passet (forsta-pass-steg.js) och pekar på element som redan
// finns i vyerna. Uppdragen följer Sussas testfall 5.1 till 5.8, 2.2, 2.4 och 2.5 med Sussas testdata, och kassans två
// egna uppdrag.
//
// Vägledningen visar det sista steget vars element syns. När flera handlingar görs på samma sida (som i remisslistan)
// leder stegen därför fram till den första handling som gör uppdraget klart.
import { meny } from './hjalp.js';

const idag = meny('#/idag', 'Dagens arbete');
const sokPatient = (namn) => [
  { id: 'meny-sok', text: `Välj Sök patient i menyn för att hitta ${namn}.`, mal: meny('#/sok', 'Sök patient') },
  { id: 'sok', hash: '#/sok', text: `Skriv ${namn} och tryck Enter.`, mal: [{ sel: '#sokfalt' }], gor: { skriv: namn, tangent: 'Enter' } },
  { id: 'traff', hash: '#/sok', text: `Klicka på ${namn} för att öppna journalen.`, mal: [{ sel: '#traffar a', innehaller: namn }] },
];

export default {
  // Första passet: ett återbesök hos läkaren som patienten har träffat förut.
  '5.1': [
    { id: 'meny', text: 'Välj Dagens arbete i menyn.', mal: idag },
    { id: 'boka', hash: '#/idag', text: 'Välj Boka besök.', mal: [{ sel: '#idag [data-atgard="r8_fri"]' }] },
    { id: 'sok', text: 'Skriv Helene Lund och tryck Enter.', mal: [{ sel: 'dialog:modal #r8-sok' }], gor: { skriv: 'Helene Lund', tangent: 'Enter' } },
    { id: 'tid', text: 'Systemet har valt ett återbesök hos läkaren som hon har träffat förut och föreslår de lämpligaste tiderna. Välj den första tiden. Kallelsen skickas av sig själv.', mal: [{ sel: 'dialog:modal .forslag-knapp' }] },
  ],
  '5.5': [
    { id: 'meny', text: 'Välj Dagens arbete i menyn.', mal: idag },
    { id: 'checka-in', hash: '#/idag', text: 'Sofia Andersson har en tid i dag hos läkaren. Välj Checka in på hennes rad.', mal: [{ sel: '#idag-dagens tr:has(a[href="#/patient/sus21"]) [data-atgard="checka_in"]' }] },
  ],
  '5.7': [
    ...sokPatient('Gerda Ström'),
    { id: 'registrera', hash: '#/patient/sus02', text: 'Välj Registrera vårdkontakt.', mal: [{ sel: '[data-vk="registrera"]' }] },
    { id: 'orsak', text: 'Skriv orsaken till besöket, till exempel Akut besök, oplanerat. Har systemet fyllt i orsaken ur hennes remiss kan den stå kvar.', mal: [{ sel: 'dialog:modal input[name="orsak"]' }], klar: 'varde', gor: { skriv: 'Akut besök, oplanerat' } },
    { id: 'spara', text: 'Systemet har fyllt i mottagningen, tiden och vårdgivaren. Välj Registrera.', mal: [{ sel: 'dialog:modal [data-varde="ok"]' }] },
  ],
  '5.2': [
    { id: 'meny', text: 'Välj Dagens arbete i menyn.', mal: idag },
    { id: 'team', hash: '#/idag', text: 'Välj Boka teambesök.', mal: [{ sel: '#idag [data-atgard="r8_team"]' }] },
    { id: 'sok', text: 'Skriv Sven Markström och tryck Enter.', mal: [{ sel: 'dialog:modal #r8-sok' }], gor: { skriv: 'Sven Markström', tangent: 'Enter' } },
    { id: 'tid', text: 'Systemet har valt läkaren och sjuksköterskan och föreslår tider då båda är lediga i 60 minuter. Välj den första tiden. Kallelsen skickas av sig själv.', mal: [{ sel: 'dialog:modal .forslag-knapp' }] },
  ],
  '5.3': [
    { id: 'meny', text: 'Välj Dagens arbete i menyn.', mal: idag },
    { id: 'grupp', hash: '#/idag', text: 'Välj Lägg till patient vid Hjärtrehabilitering i grupp.', mal: [{ sel: '#idag-grupper [data-atgard="r8_grupp"]' }] },
    { id: 'sok', text: 'Skriv Sven Markström och tryck Enter.', mal: [{ sel: 'dialog:modal #r8-sok' }], gor: { skriv: 'Sven Markström', tangent: 'Enter' } },
    { id: 'patient', text: 'Välj Sven Markström. Lägg sedan till fler patienter på samma sätt.', mal: [{ sel: 'dialog:modal [data-r8-patient]', innehaller: 'Sven Markström' }] },
  ],
  '5.4': [
    ...sokPatient('Susanne Svedin'),
    { id: 'avboka', hash: '#/patient/sus13', text: 'Välj Avboka vid hennes tid.', mal: [{ sel: '.ov-tider [data-tider="avboka"]' }] },
    { id: 'orsak', text: 'Skriv orsaken, till exempel Vill boka om, inga lediga tider.', mal: [{ sel: 'dialog:modal #ab-orsak' }], klar: 'varde', gor: { skriv: 'Vill boka om, inga lediga tider' } },
    { id: 'spara', text: 'Välj Avboka. Systemet sätter henne på väntelistan med samma prioritet som tiden hade.', mal: [{ sel: 'dialog:modal [data-varde="ok"]' }] },
  ],
  '5.8': [
    { id: 'meny', text: 'Välj Väntelista i menyn och leta upp Jonas Brun.', mal: meny('#/vantelista', 'Väntelista') },
    { id: 'boka', text: 'Välj Boka tid på raden för Jonas Brun.', mal: [{ sel: '#vl-lista tr:has(a[href="#/patient/sus20"]) [data-vl="boka"]' }, { sel: '#idag-vantelista tr:has(a[href="#/patient/sus20"]) [data-atgard="boka"]' }] },
    { id: 'tid', text: 'Systemet föreslår tider som passar det han väntar på. Välj den första tiden. Kallelsen skickas av sig själv.', mal: [{ sel: 'dialog:modal .forslag-knapp' }] },
  ],
  '2.2': [
    ...sokPatient('Mira Axelsson'),
    { id: 'uppdrag', hash: '#/patient/sus17', text: 'Välj Remiss på uppdrag.', mal: [{ sel: '.snabbval a', innehaller: 'Remiss på uppdrag' }] },
    { id: 'mottagare', hash: '#/patient/sus17', text: 'Systemet har valt Sara Lindqvist som uppdragsgivare. Skriv Ortopediska kliniken USÖ i sökfältet vid Till vårdenhet.', mal: [{ sel: '#uppdragform .ls-sok:has(+ #ru-till)' }], klar: 'varde', gor: { skriv: 'Ortopediska kliniken USÖ' } },
    { id: 'fraga', hash: '#/patient/sus17', text: 'Skriv frågeställningen: Hudförändring, malignt?', mal: [{ sel: '#ru-fraga' }], klar: 'varde', gor: { skriv: 'Hudförändring, malignt?' } },
    { id: 'anamnes', hash: '#/patient/sus17', text: 'Skriv anamnesen: Pat har en hudförändring på låret som har förändrats snabbt. Är det malignt?', mal: [{ sel: '#ru-anamnes' }], klar: 'varde', gor: { skriv: 'Pat har en hudförändring på låret som har förändrats snabbt. Är det malignt?' } },
    { id: 'skicka', hash: '#/patient/sus17', text: 'Välj Skicka till läkaren för signering. Remissen går i väg när läkaren har signerat.', mal: [{ sel: '#uppdragform [type="submit"]' }] },
  ],
  '2.4': [
    { id: 'meny', text: 'Välj Remisser i menyn.', mal: meny('#/remisser', 'Remisser') },
    { id: 'fordela', hash: '#/remisser', text: 'Välj Fördela vid remissen för Bertil Danielsson.', mal: [{ sel: 'article.remiss:has(a[href^="#/patient/sus01/"]) [data-remiss-atgard="fordela"]' }] },
    { id: 'lakare', text: 'Välj bakjouren Göran Malm.', mal: [{ sel: 'dialog:modal [data-varde="ol-kard"]' }] },
  ],
  '2.5': [
    { id: 'meny', text: 'Välj Remisser i menyn.', mal: meny('#/remisser', 'Remisser') },
    { id: 'registrera', hash: '#/remisser', text: 'En pappersremiss har skannats in. Välj Registrera vid den.', mal: [{ sel: '.r8-skannade [data-skann]' }] },
    { id: 'patient', text: 'Skriv Trevis Ljung, som står på remissen. Systemet hittar honom.', mal: [{ sel: 'dialog:modal #ex-patient' }], klar: 'varde', gor: { skriv: 'Trevis Ljung' } },
    { id: 'enhet', text: 'Skriv avsändaren: Behandlingshemmet Löparen.', mal: [{ sel: 'dialog:modal #ex-enhet' }], klar: 'varde', gor: { skriv: 'Behandlingshemmet Löparen' } },
    { id: 'fraga', text: 'Skriv frågeställningen: Psykossjukdom.', mal: [{ sel: 'dialog:modal #ex-fraga' }], klar: 'varde', gor: { skriv: 'Psykossjukdom' } },
    { id: 'anamnes', text: 'Skriv anamnesen från remissen: Har bott här två år. Nu flyttar han hem och behöver följas upp.', mal: [{ sel: 'dialog:modal #ex-anamnes' }], klar: 'varde', gor: { skriv: 'Har bott här två år. Nu flyttar han hem och behöver följas upp.' } },
    { id: 'spara', text: 'Välj Registrera. Remissen hamnar bland de inkommande.', mal: [{ sel: 'dialog:modal [data-varde="ok"]' }] },
  ],
  betala: [
    { id: 'meny', text: 'Välj Dagens arbete i menyn.', mal: idag },
    { id: 'betala', hash: '#/idag', text: 'Systemet har räknat ut avgiften för patienten som har checkat in. Välj Ta betalt.', mal: [{ sel: '#idag-dagens [data-atgard="betala"]' }] },
    { id: 'kort', text: 'Patienten betalar med kort. Välj Betalt med kort.', mal: [{ sel: 'dialog:modal [data-varde="kort"]' }] },
  ],
  dagsavslut: [
    { id: 'meny', text: 'Välj Kassa i menyn.', mal: meny('#/kassa', 'Kassa') },
    { id: 'avslut', hash: '#/kassa', text: 'Välj Gör dagsavslut.', mal: [{ sel: '#kassa-avslut' }] },
    { id: 'avsluta', hash: '#/kassa', text: 'Systemet har räknat ihop dagens betalningar. Det finns inga kontanter att räkna. Välj Stäm av och avsluta.', mal: [{ sel: '#kassa-avsluta-ok' }] },
  ],
};
