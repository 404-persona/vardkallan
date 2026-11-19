// Runda 19, r3: vägledningen i systemförvaltarens uppdrag i testinbjudan (testrollen systemforvaltare, demorollen sysf,
// Tomas Lindh). Stegen har samma form som första passet (forsta-pass-steg.js) och pekar på element som redan finns i
// vyerna.
//
// Fyra ögon: ingen ändring gäller förrän en andra systemförvaltare har godkänt den. I testinbjudan föreslår testaren
// ändringar som skickas för godkännande, och uppdraget Godkänn en ändring gäller en ändring som demons andra
// systemförvaltare redan har föreslagit. Stegen leder därför fram till Skicka för godkännande eller Godkänn, aldrig
// förbi regeln.
import { meny } from './hjalp.js';

export default {
  godkann: [
    { id: 'meny', text: 'Välj Regler och parametrar i menyn.', mal: meny('#/regler', 'Regler och parametrar') },
    { id: 'godkann', hash: '#/regler', text: 'Den andra systemförvaltaren har föreslagit en ändring under Att godkänna. Läs vad den gör och välj Godkänn.', mal: [{ sel: '[data-godkann]' }] },
  ],
  // Första passet: ändra påminnelsen före en bokad tid.
  regel: [
    { id: 'meny', text: 'Välj Regler och parametrar i menyn.', mal: meny('#/regler', 'Regler och parametrar') },
    { id: 'andra', hash: '#/regler', text: 'Välj Ändra vid Påminnelse före en bokad tid.', mal: [{ sel: 'tr[data-nyckel="tidbok.paminnelse_timmar"] [data-andra]' }] },
    { id: 'varde', text: 'Skriv det nya värdet 72 timmar.', mal: [{ sel: 'dialog:modal #sf-varde' }], klar: 'andrat', gor: { skriv: '72' } },
    { id: 'motivering', text: 'Skriv varför, till exempel att patienterna hinner boka om en dag tidigare.', mal: [{ sel: 'dialog:modal #sf-motivering' }], klar: 'varde', gor: { skriv: 'Patienterna hinner boka om en dag tidigare.' } },
    { id: 'skicka', text: 'Systemet visar vad ändringen gör. Välj Skicka för godkännande.', mal: [{ sel: 'dialog:modal [data-varde="ok"]' }] },
  ],
  mall: [
    { id: 'meny', text: 'Välj Mallar och mätvärdestyper i menyn.', mal: meny('#/struktur', 'Mallar och mätvärdestyper') },
    { id: 'ny', hash: '#/struktur', text: 'Välj Ny mätvärdestyp.', mal: [{ sel: '[data-ny="mattyp"]' }] },
    { id: 'namn', text: 'Skriv namnet Midjemått.', mal: [{ sel: 'dialog:modal #js-mnamn' }], klar: 'varde', gor: { skriv: 'Midjemått' } },
    { id: 'loinc', text: 'Midjemått har en kod i LOINC. Välj LOINC.', mal: [{ sel: 'dialog:modal #js-kv-loinc' }], klar: 'valt' },
    { id: 'kod', text: 'Skriv koden 8280-0. Systemet kontrollerar att koden är giltig.', mal: [{ sel: 'dialog:modal #js-kod' }], klar: 'varde', gor: { skriv: '8280-0' } },
    { id: 'enhet', text: 'Skriv enheten cm.', mal: [{ sel: 'dialog:modal #js-ucum' }], klar: 'varde', gor: { skriv: 'cm' } },
    { id: 'min', text: 'Skriv det lägsta rimliga värdet, till exempel 40.', mal: [{ sel: 'dialog:modal #js-min' }], klar: 'varde', gor: { skriv: '40' } },
    { id: 'max', text: 'Skriv det högsta rimliga värdet, till exempel 200.', mal: [{ sel: 'dialog:modal #js-max' }], klar: 'varde', gor: { skriv: '200' } },
    { id: 'motivering', text: 'Skriv varför, till exempel att midjemåttet ska följas vid hjärtrehabilitering.', mal: [{ sel: 'dialog:modal #js-motivering' }], klar: 'varde', gor: { skriv: 'Midjemåttet ska följas vid hjärtrehabilitering.' } },
    { id: 'skicka', text: 'Välj Skicka för godkännande. Den andra systemförvaltaren godkänner den.', mal: [{ sel: 'dialog:modal [data-varde="ok"]' }] },
  ],
  formular: [
    { id: 'meny', text: 'Välj Formulär i menyn.', mal: meny('#/formular', 'Formulär') },
    { id: 'nytt', hash: '#/formular', text: 'Välj Nytt formulär.', mal: [{ sel: '[data-nytt]' }] },
    { id: 'namn', hash: '#/formular', text: 'Skriv formulärets namn, till exempel Munhälsa.', mal: [{ sel: '#fb-namn' }], klar: 'varde', gor: { skriv: 'Munhälsa' } },
    { id: 'fraga', hash: '#/formular', text: 'Skriv den första frågan, till exempel Har patienten ont i munnen?', mal: [{ sel: '#fb-0-fraga' }], klar: 'varde', gor: { skriv: 'Har patienten ont i munnen?' } },
    { id: 'foresla', hash: '#/formular', text: 'Systemet har valt svarstyp och sökord och visar hur formuläret ser ut. Välj Föreslå formuläret.', mal: [{ sel: '[data-foresla]' }] },
    { id: 'motivering', text: 'Skriv varför, till exempel att munhälsan dokumenteras likadant på alla avdelningar.', mal: [{ sel: 'dialog:modal #fb-motivering' }], klar: 'varde', gor: { skriv: 'Munhälsan dokumenteras likadant på alla avdelningar.' } },
    { id: 'skicka', text: 'Välj Föreslå. Den andra systemförvaltaren godkänner formuläret.', mal: [{ sel: 'dialog:modal [data-varde="ok"]' }] },
  ],
  kodverk: [
    { id: 'meny', text: 'Välj Kodverk och masterdata i menyn.', mal: meny('#/kodverk', 'Kodverk och masterdata') },
    { id: 'nytt', hash: '#/kodverk', text: 'Välj Nytt lokalt kodverk. Det blir kodverkets första utgåva.', mal: [{ sel: '[data-nytt-lokalt]' }] },
    { id: 'namn', text: 'Skriv kodverkets namn, till exempel Besöksorsaker på mottagningen.', mal: [{ sel: 'dialog:modal #kv-namn' }], klar: 'varde', gor: { skriv: 'Besöksorsaker på mottagningen' } },
    { id: 'koder', text: 'Skriv koderna, en per rad med semikolon mellan kod och text, till exempel B1;Nybesök.', mal: [{ sel: 'dialog:modal #kv-koder' }], klar: 'varde', gor: { skriv: 'B1;Nybesök' } },
    { id: 'motivering', text: 'Skriv varför utgåvan behövs, till exempel att besöken ska kunna följas upp.', mal: [{ sel: 'dialog:modal #kv-motivering' }], klar: 'varde', gor: { skriv: 'Besöken ska kunna följas upp.' } },
    { id: 'skicka', text: 'Systemet har satt versionen och datumet och visar vad utgåvan innehåller. Välj Skicka för godkännande.', mal: [{ sel: 'dialog:modal [data-varde="ok"]' }] },
  ],
  omorganisation: [
    { id: 'meny', text: 'Välj Omorganisation i menyn.', mal: meny('#/omorganisation', 'Omorganisation') },
    { id: 'andra', hash: '#/omorganisation', text: 'Välj Ändra vid Kardiologiska mottagningen.', mal: [{ sel: '[data-forandra="uso-kard-mott"]' }] },
    { id: 'namn', text: 'Systemet har valt namnbyte och den första dagen nästa månad. Skriv det nya namnet, till exempel Hjärtmottagningen.', mal: [{ sel: 'dialog:modal #sf-namn' }], klar: 'andrat', gor: { skriv: 'Hjärtmottagningen' } },
    { id: 'forbered', text: 'Systemet visar vad som flyttas och ändras. Välj Förbered.', mal: [{ sel: 'dialog:modal [data-varde="ok"]' }] },
  ],
  lagring: [
    { id: 'meny', text: 'Välj Lagring i menyn.', mal: meny('#/lagring', 'Lagring') },
    { id: 'prova', hash: '#/lagring', text: 'Välj Pröva säkerhetskopiering och återläsning. Systemet tar en kopia, läser tillbaka den och jämför.', mal: [{ sel: '[data-prova]' }] },
  ],
};
