// Runda 19, r3: vägledningen i patientens uppdrag i testinbjudan (testrollen patient, invånaren Gunnar Åkesson i Min
// journal). Stegen har samma form som första passet (forsta-pass-steg.js) och pekar på element som redan finns i
// invånarens vy. Min journal har flikar i stället för personalens meny, och flikarna syns också på en smal skärm, där
// de flesta invånare använder Min journal.
const flik = (vag, namn) => [{ sel: `.min-flikar a[href$="/${vag}"]` }, { sel: 'a[href="#/min"]', text: `Gå till Min journal och välj ${namn}.` }];
// Det nya meddelandet när ett visst ärende är valt under Det gäller.
const nytt = (typ, sel) => `#min-nytt:has(#mn-typ option[value="${typ}"]:checked) ${sel}`;

export default {
  las: [
    { id: 'oversikt', text: 'Gå till Översikt i Min journal.', mal: [{ sel: '.min-flikar a', innehaller: 'Översikt' }, { sel: 'a[href="#/min"]' }] },
    { id: 'anteckning', hash: '#/min', text: 'Den senaste anteckningen står överst under Senaste anteckningar. Klicka på den.', mal: [{ sel: 'a[href^="#/min/"][href*="/anteckningar/"]' }] },
  ],
  logglista: [
    { id: 'flik', text: 'Välj Vem har läst. Där står varje vårdenhet som har läst din journal och när.', mal: flik('logglista', 'Vem har läst') },
  ],
  // Första passet: blodtrycket som patienten har mätt hemma.
  egenmatning: [
    { id: 'meny', text: 'Gå till Min journal.', mal: [{ sel: '.min-flikar a', innehaller: 'Översikt' }, { sel: 'a[href="#/min"]' }] },
    { id: 'flik', text: 'Välj Egna mätningar.', mal: [{ sel: '.min-flikar a', innehaller: 'Egna mätningar' }] },
    { id: 'varde', text: 'Skriv blodtrycket 138/86.', mal: [{ sel: '#min-egen-varde' }], klar: 'varde', gor: { skriv: '138/86' } },
    { id: 'skicka', text: 'Välj Skicka.', mal: [{ sel: '#min-egen [type=submit]' }] },
  ],
  meddelande: [
    { id: 'flik', text: 'Välj Meddelanden.', mal: flik('meddelanden', 'Meddelanden') },
    { id: 'text', hash: '#/min', text: 'Systemet har valt En fråga till vården och din mottagning. Skriv din fråga, till exempel om du kan ta medicinen på kvällen.', mal: [{ sel: nytt('fraga', '#mn-text') }], klar: 'varde', gor: { skriv: 'Kan jag ta blodtrycksmedicinen på kvällen i stället för på morgonen?' } },
    { id: 'skicka', hash: '#/min', text: 'Välj Skicka. Systemet skickar frågan till rätt mottagning.', mal: [{ sel: nytt('fraga', '[type=submit]') }] },
  ],
  recept: [
    { id: 'flik', text: 'Välj Meddelanden.', mal: flik('meddelanden', 'Meddelanden') },
    { id: 'typ', hash: '#/min', text: 'Välj Förnya ett recept i listan Det gäller.', mal: [{ sel: '#min-nytt #mn-typ' }], gor: { skriv: 'Förnya', tangent: 'Enter' } },
    { id: 'text', hash: '#/min', text: 'Systemet visar dina läkemedel och skickar begäran till den som ordinerade det du väljer. Skriv en kort rad, till exempel att tabletterna snart är slut.', mal: [{ sel: nytt('recept', '#mn-text') }], klar: 'varde', gor: { skriv: 'Tabletterna tar slut om en vecka.' } },
    { id: 'skicka', hash: '#/min', text: 'Välj Skicka.', mal: [{ sel: nytt('recept', '[type=submit]') }] },
  ],
  tid: [
    { id: 'flik', text: 'Välj Tider.', mal: flik('tider', 'Tider') },
    { id: 'boka', hash: '#/min', text: 'Under Boka en ny tid: välj Visa lediga tider vid återbesök hos läkaren på Vårdcentralen Tybble.', mal: [{ sel: '[data-min="boka"][data-nyckel="vc-tybble:aterbesok:lakare"]' }, { sel: '[data-min="boka"]', text: 'Under Boka en ny tid: välj Visa lediga tider vid den tid du vill boka.' }] },
    { id: 'tid', text: 'Systemet visar de första lediga tiderna. Välj en av dem.', mal: [{ sel: 'dialog:modal .forslag-knapp' }] },
  ],
  begaran: [
    { id: 'flik', text: 'Välj Vem har läst.', mal: flik('logglista', 'Vem har läst') },
    { id: 'loggutdrag', hash: '#/min', text: 'Välj Begär loggutdrag med namn. Då får du veta vilka personer som har läst, inte bara vilka vårdenheter.', mal: [{ sel: '[data-loggutdrag]' }] },
  ],
};
