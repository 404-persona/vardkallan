// Runda 19, r1: gemensamma hjälpare för vägledningens steg, i första passet (forsta-pass-steg.js) och i uppdragen
// (uppdrag-steg/<testroll>.js). Formatet för ett steg står överst i forsta-pass-steg.js.

// Ett menyval som fungerar både med den breda menyn och med den ihopfällda menyn på en smal skärm.
export const meny = (href, namn) => [
  { sel: `#meny-lista a[href="${href}"]` },
  { sel: '.menyknapp', text: `Öppna Meny och välj ${namn}.` },
];

// En patient i en lista. Vägledningen föreslår namnet, men följer med om testaren väljer en annan patient i listan.
export const patient = (namn, sel = 'a.patientlank') => [{ sel, innehaller: namn }, { sel }];

// En flik i patientens journal eller i en vy.
export const flik = (namn) => [{ sel: '.flikar a', innehaller: namn }, { sel: '.min-flikar a', innehaller: namn }];

// Svarsfältet i panelen för ett uppdrag med en fråga. nar är elementet där svaret står: steget gäller först när det syns.
// svar är det rätta svaret som testet av vägledningen skriver.
export const svar = ({ id = 'svar', text, nar, hash, svar: varde }) => ({
  id, text, ...(hash ? { hash } : {}), nar, mal: [{ sel: '#tp-svar' }], gor: { skriv: varde, tangent: 'Enter' },
});

// Ordinationsformuläret i patientens journal. pre skiljer två ordinationer åt, och nar (frivilligt) är det som måste
// synas för att varvet ska gälla, till exempel den förra ordinationen i listan.
export const VALT = { sel: '#ordform #o-forslag' };
export function ordination({ pre, sok, namn, orsak, typ = null, nar = null }) {
  const med = (x) => (nar ? [].concat(nar, x) : x);
  return [
    { id: `${pre}-ordinera`, text: 'Välj Ordinera.', mal: [{ sel: '.snabbval a', innehaller: 'Ordinera' }, { sel: 'button[data-ny]' }], ...(nar ? { nar } : {}) },
    { id: `${pre}-sok`, text: `Skriv ${sok} i fältet Läkemedel.`, mal: [{ sel: '#ordform #lm-sok' }], klar: 'varde', gor: { skriv: sok }, ...(nar ? { nar } : {}) },
    { id: `${pre}-valj`, text: `Välj ${namn} i listan.`, mal: [{ sel: '#lm-traffar [data-lm]', innehaller: namn }, { sel: '#lm-traffar [data-lm]' }], ...(nar ? { nar } : {}) },
    ...(typ ? [{ id: `${pre}-typ`, nar: med(VALT), text: `Systemet har fyllt i dosen ur produkten. Välj ${typ} under Typ.`, mal: [{ sel: '#ordform #o-typ' }], klar: 'andrat', gor: { skriv: typ } }] : []),
    { id: `${pre}-orsak`, nar: med(VALT), text: `${typ ? '' : 'Systemet har fyllt i doseringen ur produkten. '}Skriv orsaken under Ordinationsorsak: ${orsak}.`, mal: [{ sel: '#ordform #o-orsak' }], klar: 'varde', gor: { skriv: orsak } },
    { id: `${pre}-spara`, nar: med(VALT), text: 'Välj Kontrollera och spara.', mal: [{ sel: '#ordform [data-spara]' }] },
  ];
}

// En patient som söks fram, när den inte står i arbetslistan.
export const sokPatient = (namn) => [
  { id: 'sok-meny', text: 'Välj Sök patient i menyn.', mal: meny('#/sok', 'Sök patient') },
  { id: 'sok', text: `Skriv ${namn} och tryck Enter.`, mal: [{ sel: '#sokfalt' }], gor: { skriv: namn, tangent: 'Enter' } },
  { id: 'traff', text: `Välj ${namn} bland träffarna.`, mal: [{ sel: '#traffar a', innehaller: namn }] },
];
