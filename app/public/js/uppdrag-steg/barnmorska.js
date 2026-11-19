// Runda 19, r2: vägledningen i barnmorskans uppdrag i testinbjudan (testroll barnmorska, demoroll bm-uso). Stegen har
// samma form som i första passet (forsta-pass-steg.js). Rollen har inte Sussas testdata, så stegen pekar på demons
// vanliga förlossningspatienter: Amanda Lindholm, som föder nu, och Nora Sjölin med två barn på BB. Båda läggs in i
// varje ny sandlåda med tider räknade från nu (obstetrik-seed.js), så de finns där vid alla tider på dygnet.
import { meny } from './hjalp.js';

const tillForlossningen = meny('#/forlossning', 'Förlossningen');
const amanda = (id = 'patient') => ({ id, hash: '#/forlossning', text: 'Klicka på Amanda Lindholm, som föder nu.', mal: [{ sel: '#forl-tabell a.patientlank', innehaller: 'Amanda Lindholm' }] });
const nora = (id = 'patient') => ({ id, hash: '#/forlossning', text: 'Klicka på Nora Sjölin under BB.', mal: [{ sel: '#forl a.patientlank', innehaller: 'Nora Sjölin' }] });

export default {
  oversikt: [
    { id: 'meny', text: 'Välj Förlossningen i menyn.', mal: tillForlossningen },
    { ...amanda(), text: 'Här ser du alla som föder och alla på BB. Klicka på Amanda Lindholm, som föder nu.' },
  ],
  ctg: [
    { id: 'meny', text: 'Välj Förlossningen i menyn.', mal: tillForlossningen },
    amanda(),
    { id: 'bekrafta', text: 'Systemet har bedömt CTG:t ur kurvan. Läs bedömningen och välj Bekräfta bedömningen.', mal: [{ sel: '#fp-ctg-bekrafta' }] },
  ],
  partogram: [
    { id: 'meny', text: 'Välj Förlossningen i menyn.', mal: tillForlossningen },
    amanda(),
    { id: 'oppning', text: 'Modermunnen var öppen 7 cm förra gången. Skriv 8 vid Öppning, cm.', mal: [{ sel: '#fp-opp' }], klar: 'varde', gor: { skriv: '8' } },
    { id: 'fosterljud', text: 'Skriv fosterljudet 140.', mal: [{ sel: '#fp-fl' }], klar: 'varde', gor: { skriv: '140' } },
    { id: 'registrera', text: 'Systemet sätter tiden och ritar in värdet i partogrammet. Välj Registrera.', mal: [{ sel: '#fp-part-ny [type="submit"]' }] },
  ],
  smartlindring: [
    { id: 'meny', text: 'Välj Förlossningen i menyn.', mal: tillForlossningen },
    amanda(),
    { id: 'registrera', text: 'Systemet har valt Lustgas under Smärtlindring. Välj Registrera.', mal: [{ sel: '#fp-sm-ny [type="submit"]' }] },
  ],
  fodelse: [
    { id: 'meny', text: 'Välj Förlossningen i menyn.', mal: tillForlossningen },
    amanda(),
    { id: 'vikt', text: 'Systemet har valt Flicka och vaginal förlossning. Ändra om det behövs, och skriv vikten 3540 gram.', mal: [{ sel: '#fp-vikt' }], klar: 'varde', gor: { skriv: '3540' } },
    { id: 'langd', text: 'Skriv längden 51 cm.', mal: [{ sel: '#fp-langd' }], klar: 'varde', gor: { skriv: '51' } },
    { id: 'huvudomfang', text: 'Skriv huvudomfånget 35 cm.', mal: [{ sel: '#fp-hu' }], klar: 'varde', gor: { skriv: '35' } },
    { id: 'apgar1', text: 'Skriv Apgar 9 vid 1 minut.', mal: [{ sel: '#fp-ap1' }], klar: 'varde', gor: { skriv: '9' } },
    { id: 'apgar5', text: 'Skriv Apgar 10 vid 5 minuter.', mal: [{ sel: '#fp-ap5' }], klar: 'varde', gor: { skriv: '10' } },
    { id: 'apgar10', text: 'Skriv Apgar 10 vid 10 minuter.', mal: [{ sel: '#fp-ap10' }], klar: 'varde', gor: { skriv: '10' } },
    { id: 'registrera', text: 'Systemet sätter tiden för födelsen. Välj Registrera födelsen.', mal: [{ sel: '#fp-fodelse [type="submit"]' }] },
  ],
  fodelseanmalan: [
    { id: 'meny', text: 'Välj Förlossningen i menyn.', mal: tillForlossningen },
    nora(),
    { id: 'anmalan', hash: '#/forlossning', text: 'Barnet har inget personnummer än. Välj Skicka födelseanmälan till Skatteverket.', mal: [{ sel: '[data-fp-anmalan]' }] },
  ],
  bb: [
    { id: 'meny', text: 'Välj Förlossningen i menyn.', mal: tillForlossningen },
    nora(),
    { id: 'temp', text: 'Gör en kontroll av modern. Skriv temperaturen 37,2.', mal: [{ sel: '#bm-temp' }], klar: 'varde', gor: { skriv: '37,2' } },
    { id: 'puls', text: 'Skriv pulsen 78.', mal: [{ sel: '#bm-puls' }], klar: 'varde', gor: { skriv: '78' } },
    { id: 'blodtryck', text: 'Skriv blodtrycket 118/72.', mal: [{ sel: '#bm-bt' }], klar: 'varde', gor: { skriv: '118/72' } },
    { id: 'spara', text: 'Systemet varnar om något värde avviker. Välj Spara kontrollen.', mal: [{ sel: '#fp-bb-mor [type="submit"]' }] },
  ],
};
