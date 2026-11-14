// Sussa KD1.2 Kärnsystemets och drifttjänstens tillgänglighet och servicenivå: hur Vårdkällan möter posterna i avsnittet.
// Fälten beskrivs i ../index.js. Status räknas fram från testerna vid varje bygge.

// Runda 14, r5: leverantörens åtaganden, servicenivåerna, utbildningsmaterialet och innovationsrummet (sussa/runda14-r5.js).
import { medR14r5 } from '../runda14-r5.js';
// Runda 15, r3: mellanarkivet för läkemedel, FHIR, läskopian och reservservern (sussa/runda15-r3.js).
import { medR15r3 } from '../runda15-r3.js';

const R14_FORE = [
  { id: 'KD1.2.1.1', kategori: 'leverantor', egna: [], tester: [], avsedd: 'planerat',
    anmarkning: "Gäller leverantörens åtagande, drift eller process och inte systemets funktion." },
  { id: 'KD1.2.1.2', kategori: 'leverantor', egna: [], tester: [], avsedd: 'planerat',
    anmarkning: "Gäller leverantörens åtagande, drift eller process och inte systemets funktion." },
  { id: 'KD1.2.1.3', kategori: 'leverantor', egna: [], tester: [], avsedd: 'planerat',
    anmarkning: "Gäller leverantörens åtagande, drift eller process och inte systemets funktion." },
  { id: 'KD1.2.1.4', kategori: 'leverantor', egna: [], tester: [], avsedd: 'planerat',
    anmarkning: "Gäller leverantörens åtagande, drift eller process och inte systemets funktion." },
  { id: 'KD1.2.1.5', kategori: 'leverantor', egna: [], tester: [], avsedd: 'planerat',
    anmarkning: "Gäller leverantörens åtagande, drift eller process och inte systemets funktion." },
];
export default medR15r3(medR14r5(R14_FORE));
