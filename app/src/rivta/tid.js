// Testspår 2: tider i spärr- och samtyckestjänsternas kontrakt (riv.ehr.blocking 2.6 och riv.ehr.patientconsent 2.6) är
// svensk tid utan tidszon, på formen ÅÅÅÅ-MM-DDTtt:mm:ss. Förut skickades UTC-tiden utan Z, som då lästes som svensk tid
// och blev en eller två timmar fel (och fel dag strax efter midnatt).
const delar = (d) => new Date(d).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' }).replace(' ', 'T');

// En tidpunkt (Date eller ISO-text) som svensk tid utan tidszon.
export const svenskTid = (d) => (d == null || d === '' ? null : delar(d).slice(0, 19));

// En svensk tid utan tidszon som en Date. Sommartiden räknas med, också vid övergångarna.
export function franSvenskTid(lokal) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(String(lokal ?? ''));
  if (!m) return null;
  const som = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  let t = som;
  for (let i = 0; i < 2; i++) t += som - Date.parse(`${delar(t)}Z`);
  return new Date(t);
}

// Sista sekunden på dagen i Sverige.
export const slutPaDagen = (nu = new Date()) => `${svenskTid(nu).slice(0, 10)}T23:59:59`;
