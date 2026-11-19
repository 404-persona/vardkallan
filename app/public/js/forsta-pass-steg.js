// Runda 18, r1: vägledningen i första passet, som gränssnittet (forsta-pass.js) och servern (src/forsta-pass.js) delar.
// Varje yrkesroll i testinbjudan har ett pass med en uppgift. Stegen pekar på element som redan finns i vyerna; lagret
// ändrar inga vyer.
//
// Ett steg:
//   id     sparas i mätningen (aldrig sidans text eller adress), och servern tar bara emot de id som står här.
//   text   en kort mening om vad som ska göras, som läses upp för skärmläsare.
//   mal    elementet som pekas ut, som alternativ: det första som syns används. innehaller kräver att elementet har
//          texten. Ett alternativ med egen text ersätter stegets text, till exempel när menyn är ihopfälld på en smal skärm.
//   hash   (frivilligt) steget gäller bara när adressen börjar så, till exempel journalen för rätt patient.
//   klar   (frivilligt) ett fält eller val som är gjort: varde (fältet har ett värde), andrat (fältet har ändrats från
//          det systemet fyllde i) eller valt (rutan eller valet är markerat).
//   gor    (frivilligt) vad testet av passet gör i steget: skriv och tangent. Utan gor klickar testet på elementet.
//
// Vilket steg som gäller räknas fram ur det som syns: det sista steget vars element syns, och före det det första
// fältet i samma formulär som inte är klart. Gör testaren något annat som också leder fram, följer vägledningen med.

const meny = (href, namn) => [
  { sel: `#meny-lista a[href="${href}"]` },
  { sel: '.menyknapp', text: `Öppna Meny och välj ${namn}.` },
];

export const PASS_STEG = {
  'lakare-sjukhus': [
    { id: 'meny', text: 'Välj Arbetslistan i menyn och leta upp Hamid Burvall.', mal: meny('#/arbetslista', 'Arbetslistan') },
    { id: 'patient', text: 'Klicka på Hamid Burvall för att öppna hans journal.', mal: [{ sel: 'a.patientlank', innehaller: 'Hamid Burvall' }] },
    { id: 'bestall', hash: '#/patient/sus19', text: 'Välj Beställ prover.', mal: [{ sel: '.snabbval a', innehaller: 'Beställ prover' }] },
    { id: 'paket', hash: '#/patient/sus19', text: 'Systemet föreslår paketet Feber och frossa ur orsaken till besöket. Det har alla fyra proverna. Välj Beställ vid paketet.', mal: [{ sel: '#pr-forslag [data-bestall-paket="feber"]' }] },
  ],
  'lakare-primarvard': [
    { id: 'meny', text: 'Välj Arbetslistan i menyn och leta upp Berit Strandhall.', mal: meny('#/arbetslista', 'Arbetslistan') },
    { id: 'patient', text: 'Klicka på Berit Strandhall för att öppna hennes journal.', mal: [{ sel: 'a.patientlank', innehaller: 'Berit Strandhall' }] },
    { id: 'tobak', hash: '#/patient/sus05', text: 'Välj Dokumentera tobaksvanor.', mal: [{ sel: '[data-tobak-ny]' }] },
    { id: 'dagligen', hash: '#/patient/sus05', text: 'Hon röker cigaretter varje dag. Välj Dagligen vid cigaretter.', mal: [{ sel: '#tb-cigaretter-dagligen' }], klar: 'valt' },
    { id: 'antal', hash: '#/patient/sus05', text: 'Skriv 25 cigaretter per dag.', mal: [{ sel: '#tb-antal-cigaretter' }], klar: 'varde', gor: { skriv: '25' } },
    { id: 'stod', hash: '#/patient/sus05', text: 'Systemet föreslår rådgivande samtal om rökavvänjning. Hon tackar ja: välj Erbjudet och accepterat.', mal: [{ sel: '#tb-stod-accepterat' }], klar: 'valt' },
    { id: 'kommentar', hash: '#/patient/sus05', text: 'Skriv en kort kommentar, till exempel att hon vill sluta före sommaren.', mal: [{ sel: '#tb-kommentar' }], klar: 'varde', gor: { skriv: 'Vill sluta före sommaren.' } },
    { id: 'signera', hash: '#/patient/sus05', text: 'Systemet har skrivit anteckningen ur dina svar. Välj Signera.', mal: [{ sel: '.ant-form [data-signera]' }] },
  ],
  sjukskoterska: matvarden(),
  underskoterska: matvarden(),
  vardadministrator: [
    { id: 'meny', text: 'Välj Dagens arbete i menyn.', mal: meny('#/idag', 'Dagens arbete') },
    { id: 'boka', hash: '#/idag', text: 'Välj Boka besök.', mal: [{ sel: '#idag [data-atgard="r8_fri"]' }] },
    { id: 'sok', text: 'Skriv Helene Lund och tryck Enter.', mal: [{ sel: 'dialog:modal #r8-sok' }], gor: { skriv: 'Helene Lund', tangent: 'Enter' } },
    { id: 'tid', text: 'Systemet har valt ett återbesök hos läkaren som hon har träffat förut och föreslår de lämpligaste tiderna. Välj den första tiden. Kallelsen skickas av sig själv.', mal: [{ sel: 'dialog:modal .forslag-knapp' }] },
  ],
  fysioterapeut: [
    { id: 'meny', text: 'Välj Arbetslistan i menyn och leta upp Sara Sandmark.', mal: meny('#/arbetslista', 'Arbetslistan') },
    { id: 'patient', text: 'Klicka på Sara Sandmark för att öppna hennes journal.', mal: [{ sel: 'a.patientlank', innehaller: 'Sara Sandmark' }] },
    { id: 'flik', hash: '#/patient/sus06', text: 'Välj fliken Remisser.', mal: [{ sel: '.flikar a', innehaller: 'Remisser' }] },
    { id: 'svara', hash: '#/patient/sus06', text: 'Välj Svara vid remissen från vårdcentralen.', mal: [{ sel: '[data-remiss-atgard="svara"]' }] },
    { id: 'text', text: 'Skriv svaret: Tack för remissen. Vi har träffat Sara och gett henne rätt behandling.', mal: [{ sel: 'dialog:modal textarea' }], klar: 'varde', gor: { skriv: 'Tack för remissen. Vi har träffat Sara och gett henne rätt behandling.' } },
    { id: 'skicka', text: 'Välj Skicka svaret.', mal: [{ sel: 'dialog:modal [data-varde="ok"]' }] },
  ],
  barnmorska: [
    { id: 'meny', text: 'Välj Förlossning i menyn.', mal: meny('#/forlossning', 'Förlossning') },
    { id: 'patient', hash: '#/forlossning', text: 'Klicka på Amanda Lindholm, som föder nu.', mal: [{ sel: '#forl-tabell a.patientlank', innehaller: 'Amanda Lindholm' }] },
    { id: 'bekrafta', text: 'Systemet har bedömt CTG:t ur kurvan. Läs bedömningen och välj Bekräfta bedömningen.', mal: [{ sel: '#fp-ctg-bekrafta' }] },
  ],
  systemforvaltare: [
    { id: 'meny', text: 'Välj Regler och parametrar i menyn.', mal: meny('#/regler', 'Regler och parametrar') },
    { id: 'andra', hash: '#/regler', text: 'Välj Ändra vid Påminnelse före en bokad tid.', mal: [{ sel: 'tr[data-nyckel="tidbok.paminnelse_timmar"] [data-andra]' }] },
    { id: 'varde', text: 'Skriv det nya värdet 72 timmar.', mal: [{ sel: 'dialog:modal #sf-varde' }], klar: 'andrat', gor: { skriv: '72' } },
    { id: 'motivering', text: 'Skriv varför, till exempel att patienterna hinner boka om en dag tidigare.', mal: [{ sel: 'dialog:modal #sf-motivering' }], klar: 'varde', gor: { skriv: 'Patienterna hinner boka om en dag tidigare.' } },
    { id: 'skicka', text: 'Systemet visar vad ändringen gör. Välj Skicka för godkännande.', mal: [{ sel: 'dialog:modal [data-varde="ok"]' }] },
  ],
  patient: [
    { id: 'meny', text: 'Gå till Min journal.', mal: [{ sel: '.min-flikar a', innehaller: 'Översikt' }, { sel: 'a[href="#/min"]' }] },
    { id: 'flik', text: 'Välj Egna mätningar.', mal: [{ sel: '.min-flikar a', innehaller: 'Egna mätningar' }] },
    { id: 'varde', text: 'Skriv blodtrycket 138/86.', mal: [{ sel: '#min-egen-varde' }], klar: 'varde', gor: { skriv: '138/86' } },
    { id: 'skicka', text: 'Välj Skicka.', mal: [{ sel: '#min-egen [type=submit]' }] },
  ],
};

// Sjuksköterskan och undersköterskan registrerar samma mätvärden som i Sussas testfall 4.2.
function matvarden() {
  return [
    { id: 'meny', text: 'Välj Arbetslistan i menyn och leta upp Sara Sandmark.', mal: meny('#/arbetslista', 'Arbetslistan') },
    { id: 'patient', text: 'Klicka på Sara Sandmark för att öppna hennes journal.', mal: [{ sel: 'a.patientlank', innehaller: 'Sara Sandmark' }] },
    { id: 'matvarde', hash: '#/patient/sus06', text: 'Välj Registrera mätvärde.', mal: [{ sel: '.snabbval a', innehaller: 'Registrera mätvärde' }] },
    { id: 'flera', hash: '#/patient/sus06', text: 'Välj Längd, vikt, blodtryck och puls på en gång.', mal: [{ sel: '[data-flera-ny]' }] },
    { id: 'langd', hash: '#/patient/sus06', text: 'Skriv längden 165.', mal: [{ sel: '#fl-langd' }], klar: 'varde', gor: { skriv: '165' } },
    { id: 'vikt', hash: '#/patient/sus06', text: 'Skriv vikten 75.', mal: [{ sel: '#fl-vikt' }], klar: 'varde', gor: { skriv: '75' } },
    { id: 'blodtryck', hash: '#/patient/sus06', text: 'Skriv blodtrycket 140/90.', mal: [{ sel: '#fl-blodtryck' }], klar: 'varde', gor: { skriv: '140/90' } },
    { id: 'puls', hash: '#/patient/sus06', text: 'Skriv pulsen 83.', mal: [{ sel: '#fl-puls' }], klar: 'varde', gor: { skriv: '83' } },
    { id: 'registrera', hash: '#/patient/sus06', text: 'Systemet sätter tiden och räknar BMI. Välj Registrera.', mal: [{ sel: '#flera-form [type="submit"]' }] },
  ];
}

export const stegFor = (testroll) => (Object.hasOwn(PASS_STEG, testroll) ? PASS_STEG[testroll] : []);
export const stegIdFor = (testroll) => stegFor(testroll).map(s => s.id);

// Ett steg räknas som att testaren fastnade när det tog minst så här lång tid, när testaren kom tillbaka till steget
// eller när testaren öppnade hjälpen eller sökte i steget.
export const FASTNAR_S = 60;

// Frågan om mätning före passet, och det som mäts. Visas i panelen, på sidan Om demon och i docs/anvandartest.md.
export const MATNING_FRAGA = 'Får vi mäta hur ditt första pass går?';
export const MATNING_TEXT = 'Systemet räknar tiden, klicken och fältbytena och noterar vid vilket steg du stannar, går tillbaka, öppnar hjälpen eller söker. Det visar var nya användare fastnar. Inga namn, ingen adress, inget du skriver och inga uppgifter om patienterna sparas. Allt fungerar likadant om du svarar nej, men då mäts ingenting.';
export const MATNING_SPARAS = [
  'Om du har sagt ja till mätningen: hur lång tid passet tog och tiden till din första handling, antalet klick, fältbyten och tangenter, och för varje steg i vägledningen hur länge du var där, om du kom tillbaka till det och om du öppnade hjälpen eller sökte. Om du avbröt passet eller hoppade över det.',
  'Om vägledningen var på eller avstängd, och vilken yrkesroll och uppgift passet gällde.',
  'Om du svarar på de tio påståendena efter passet: dina svar och poängen som servern räknar.',
  'Stegen sparas med namn som "patient" eller "registrera", aldrig med sidans text, adress eller något om demons patienter.',
];
