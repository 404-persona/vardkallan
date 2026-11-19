// Runda 19, r2: vägledningen i undersköterskans uppdrag i testinbjudan (testroll underskoterska, demoroll usk-kard på
// avdelning 72). Stegen har samma form som i första passet (forsta-pass-steg.js) och följer klickvägarna i Sussas
// testfall (test/sussa-testfall.cjs) med Sussas testpatienter. Uppdragen görs i tur och ordning i samma sandlåda.
import { meny, svar } from './hjalp.js';

const arbetslistan = (namn) => ({ id: 'meny', text: `Välj Arbetslistan i menyn och leta upp ${namn}.`, mal: meny('#/arbetslista', 'Arbetslistan') });
const oppna = (namn, hans) => ({ id: 'patient', text: `Klicka på ${namn} för att öppna ${hans} journal.`, mal: [{ sel: 'a.patientlank', innehaller: namn }] });
const valfri = (namn, hans) => ({ id: 'patient', text: `Klicka på ${namn} för att öppna ${hans} journal, eller välj en annan patient på avdelningen.`, mal: [{ sel: 'a.patientlank', innehaller: namn }, { sel: '#lista a.patientlank', text: 'Klicka på en patient på avdelningen för att öppna journalen.' }] });
const markera = (id, namn) => ({ id: `markera-${id}`, hash: '#/avdelning', text: `Markera ${namn}.`, mal: [{ sel: `#av-patienter input[value="${id}"]` }], klar: 'valt' });

export default {
  '7.2': [
    { id: 'meny', text: 'Välj Arbetslistan i menyn.', mal: meny('#/arbetslista', 'Arbetslistan') },
    { id: 'avdelning', hash: '#/arbetslista', text: 'Välj Avdelningens planering.', mal: [{ sel: '.snabbval a[href="#/avdelning"]' }] },
    { ...markera('sus02', 'Gerda Ström'), text: 'Markera de fyra patienterna, så visar systemet bara deras händelser. Börja med Gerda Ström.' },
    markera('sus03', 'Elin Arnström'),
    markera('sus04', 'Trevis Ljung'),
    markera('sus05', 'Berit Strandhall'),
    svar({ hash: '#/avdelning', nar: [...['sus02', 'sus03', 'sus04', 'sus05'].map(id => ({ sel: `#av-patienter input[value="${id}"]:checked` })), { sel: '#av .av-tabell tr[data-klocka="11.00"]' }], text: 'Systemet visar bara de fyra patienternas händelser. Händelserna klockan 11 står på raderna 11.00. Skriv vilka de är här och välj Svara.', svar: 'dricka kontrast, börja fasta, såromläggning och teamrond' }),
  ],
  '4.2': [
    arbetslistan('Sara Sandmark'),
    oppna('Sara Sandmark', 'hennes'),
    { id: 'matvarde', hash: '#/patient/sus06', text: 'Välj Registrera mätvärde.', mal: [{ sel: '.snabbval a', innehaller: 'Registrera mätvärde' }] },
    { id: 'flera', hash: '#/patient/sus06', text: 'Välj Längd, vikt, blodtryck och puls på en gång.', mal: [{ sel: '[data-flera-ny]' }] },
    { id: 'langd', hash: '#/patient/sus06', text: 'Skriv längden 165.', mal: [{ sel: '#fl-langd' }], klar: 'varde', gor: { skriv: '165' } },
    { id: 'vikt', hash: '#/patient/sus06', text: 'Skriv vikten 75.', mal: [{ sel: '#fl-vikt' }], klar: 'varde', gor: { skriv: '75' } },
    { id: 'blodtryck', hash: '#/patient/sus06', text: 'Skriv blodtrycket 140/90.', mal: [{ sel: '#fl-blodtryck' }], klar: 'varde', gor: { skriv: '140/90' } },
    { id: 'puls', hash: '#/patient/sus06', text: 'Skriv pulsen 83.', mal: [{ sel: '#fl-puls' }], klar: 'varde', gor: { skriv: '83' } },
    { id: 'registrera', hash: '#/patient/sus06', text: 'Systemet sätter tiden och räknar BMI. Välj Registrera.', mal: [{ sel: '#flera-form [type="submit"]' }] },
  ],
  vatskebalans: [
    arbetslistan('Gunnar Åkesson'),
    valfri('Gunnar Åkesson', 'hans'),
    { id: 'flik', hash: '#/patient', text: 'Välj fliken Mätvärden.', mal: [{ sel: '.flikar a', innehaller: 'Mätvärden' }] },
    { id: 'intag', hash: '#/patient', text: 'Välj Registrera intag under Vätskebalans.', mal: [{ sel: '[data-vatska="in"]' }] },
    { id: 'volym', text: 'Systemet har valt Dryck och tiden nu. Skriv hur mycket patienten har druckit, till exempel 200 ml.', mal: [{ sel: 'dialog:modal #vb-ml' }], klar: 'varde', gor: { skriv: '200' } },
    { id: 'registrera', text: 'Välj Registrera. Systemet räknar ihop dygnets vätskebalans.', mal: [{ sel: 'dialog:modal:has(#vb-ml) [data-varde="ok"]' }] },
  ],
  dos: [
    { id: 'meny', text: 'Välj Läkemedel att ge i menyn.', mal: meny('#/administrering', 'Läkemedel att ge') },
    { id: 'ge', hash: '#/administrering', text: 'Systemet visar bara de tabletter som din delegering gäller. Gunnar Åkesson har ont: välj Ge vid Alvedon.', mal: [{ sel: '[data-adm="ge"][data-pid="p01"][data-namn^="Alvedon"]' }, { sel: '[data-adm="ge"]', text: 'Välj Ge vid en tablett som en patient ska ha nu.' }] },
    { id: 'identitet', text: 'Kontrollera att det är rätt patient och välj Identiteten är kontrollerad.', mal: [{ sel: 'dialog:modal:has(#adm-id) [data-varde="ok"]' }] },
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
  '3.4': [
    arbetslistan('Bertil Danielsson'),
    oppna('Bertil Danielsson', 'hans'),
    { id: 'flik', hash: '#/patient/sus01', text: 'Välj fliken Mätvärden.', mal: [{ sel: '.flikar a', innehaller: 'Mätvärden' }] },
    { id: 'andra', hash: '#/patient/sus01/matvarden', text: 'Provet togs på vårdcentralen. Välj Visa uppgifter från andra vårdenheter.', mal: [{ sel: '[data-val="andra_enheter"]' }] },
    { id: 'syfte', text: 'Välj ett av förslagen på syfte, till exempel Bedöma aktuellt vårdbehov, eller skriv syftet här.', mal: [{ sel: 'dialog:modal #dlg-syfte' }], klar: 'varde', gor: { skriv: 'Bedöma aktuellt vårdbehov' } },
    { id: 'visa', text: 'Välj Visa uppgifterna. Åtkomsten loggas med syftet.', mal: [{ sel: 'dialog:modal:has(#dlg-syfte) [data-varde="ok"]', innehaller: 'Visa uppgifterna' }] },
    svar({ hash: '#/patient/sus01/matvarden', nar: { sel: 'tr', innehaller: 'kl. 11:36' }, text: 'Systemet visar nu också provsvaren från vårdcentralen. PK-provet står i raden PK (INR), taget klockan 11.36. Skriv värdet här och välj Svara.', svar: '0,9 INR' }),
  ],
};
