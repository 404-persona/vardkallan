// Fentons prematurkurvor 2025 för barn som är födda före vecka 37: z-värde, percentil och storlek för
// gestationsåldern vid födelsen, och mellanhanden mot fentongrowth.ca som ritar kurvan.
//
// Licensen: Tanis Fenton har gett Vårdkällan tillstånd att använda kurvdatan i den öppna demon med påhittade patienter,
// under CC BY-NC-ND 4.0 och med villkoren att användarna inte får se datan och att den inte delas med andra sjukhus
// eller organisationer. Därför finns inga värden ur kurvdatan i repot, i avbilden, i testernas fixturer eller i något
// som skickas till webbläsaren. Servern läser datan vid start från filen i FENTON_DATA (gjord med
// scripts/fenton-data.py) och lämnar bara ut resultat: z-värde, percentil och SGA, AGA eller LGA. LMS-värdena och
// percentillinjerna lämnas aldrig ut. Saknas filen visar systemet att kurvan inte finns, som före tillståndet.
//
// Mellanhanden: nyckeln till fentongrowth.ca läses från FENTON_API_KEY och skickas bara från servern. Den är på bara
// när FENTON_MELLANHAND=demo och barnet har ett av Skatteverkets testpersonnummer, så att en skarp installation aldrig
// skickar något. Bara kön, gestationsålder vid födelsen, födelsedatum och mätvärden skickas, aldrig namn eller
// personnummer. Varje anrop loggas utan mätvärden, och ett anrop som inte får svar avbryts efter en tidsgräns.
import { readFileSync } from 'node:fs';
import TESTPERSONNUMMER from './seed/testpersonnummer.json' with { type: 'json' };

export const KALLA = 'Fenton TR, Elmrayed S, Alshaikh BN. Fenton third-generation growth charts of preterm infants without abnormal fetal growth. Paediatr Perinat Epidemiol 2025;39:543-555. doi:10.1111/ppe.70035';
export const DOI = '10.1111/ppe.70035';
export const NAMN = 'Fenton 2025 Preterm Growth Chart';
export const LICENS = 'CC BY-NC-ND 4.0. Värdena används med tillstånd av Tanis Fenton för den här demon med påhittade patienter och visas inte.';
export const WEBB = 'https://fentongrowth.ca';
// Gestationsåldern för barn som räknas på kurvan: födda före vecka 37, och kurvan går till 50 veckor.
export const FODD_FORE = 37;
export const SLUT_VECKOR = 50;
export const SGA_TILL = 36;
const DAG = 86400_000;
const MATT = ['vikt', 'langd', 'huvudomfang'];

// ---------------------------------------------------------------------------------------------------------------
// Kurvdatan. Ligger bara i modulens minne.
let data = null;
let laddad = false;
let laddfel = null;

function provaData(d) {
  if (d?.format !== 'vardkallan-fenton-1' || typeof d.matt !== 'object') throw new Error('Okänt format');
  for (const m of MATT) for (const k of ['K', 'M']) {
    const t = d.matt[m]?.[k];
    if (!t || !Number.isInteger(t.fran) || !Array.isArray(t.lms) || !t.lms.length) throw new Error(`${m} ${k} saknas`);
    if (!t.lms.every(r => Array.isArray(r) && r.length === 3 && r.every(Number.isFinite) && r[1] > 0 && r[2] > 0)) throw new Error(`${m} ${k} har fel värden`);
  }
  return d;
}

// Läser datafilen en gång. Felet loggas utan innehåll.
export function ladda(sokvag = process.env.FENTON_DATA) {
  laddad = true;
  data = null;
  laddfel = null;
  if (!sokvag) return false;
  try {
    data = provaData(JSON.parse(readFileSync(sokvag, 'utf8')));
  } catch (e) {
    laddfel = e?.code ?? e?.message ?? 'fel';
    console.warn(`[fenton] Kurvdatan kunde inte läsas (${laddfel}). Kurvan visas inte.`);
  }
  return Boolean(data);
}
// För testerna: data som ett objekt i samma format, eller null.
export function anvandData(d) { laddad = true; laddfel = null; data = d ? provaData(d) : null; }
// För testerna: glöm datan, så att nästa anrop läser FENTON_DATA igen.
export function aterstall() { laddad = false; data = null; laddfel = null; }
export function tillganglig() { if (!laddad) ladda(); return Boolean(data); }

// L, M och S för en hel dag efter 22+0. null utanför kurvan.
function lmsFor(matt, kon, dag) {
  if (!tillganglig()) return null;
  const t = data.matt[matt]?.[kon === 'kvinna' ? 'K' : 'M'];
  if (!t || !Number.isInteger(dag)) return null;
  return t.lms[dag - t.fran] ?? null;
}

// z-värde enligt LMS med WHO:s SD23-korrektion utanför 3 SD, så som Fenton beskriver den (SD23 method): för L nära 0
// lognormalt, för L lika med 1 normalt, och annars Box-Cox med korrektionen under -3 och över +3.
export function zLms(x, L, M, S) {
  if (!(x > 0)) return null;
  if (Math.abs(L) < 1e-10) return Math.log(x / M) / S;
  if (Math.abs(L - 1) < 1e-10) return (x - M) / (M * S);
  const z = ((x / M) ** L - 1) / (L * S);
  const vid = (sd) => M * (1 + L * S * sd) ** (1 / L);
  if (z < -3) { const sd3 = vid(-3); return -3 + (x - sd3) / (vid(-2) - sd3); }
  if (z > 3) { const sd3 = vid(3); return 3 + (x - sd3) / (sd3 - vid(2)); }
  return z;
}

// Normalfördelningen, med felfunktionen enligt Abramowitz och Stegun 7.1.26 (fel under 1,5e-7).
export function normalfordelning(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}
// Percentilen avrundad till ett heltal, och med en decimal under 1 och över 99.
export function percentil(z) {
  if (z == null) return null;
  const p = normalfordelning(z) * 100;
  if (p < 1 || p > 99) return Math.round(p * 10) / 10;
  return Math.round(p);
}

// Gestationsålder i dagar efter 22+0 vid en tidpunkt. gv är veckor och gd dagar vid födelsen.
export const dagVidFodsel = (gv, gd = 0) => (gv - 22) * 7 + (gd ?? 0);
const lokaltDatum = (t) => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
export function dagarSedanFodsel(fodd, tid) {
  return Math.round((Date.parse(`${lokaltDatum(Date.parse(tid))}T00:00:00Z`) - Date.parse(`${fodd}T00:00:00Z`)) / DAG);
}
export const veckaText = (dag) => `${22 + Math.floor(dag / 7)}+${((dag % 7) + 7) % 7}`;

// z-värde för ett mått. varde i journalens enhet: kg för vikt och cm för längd och huvudomfång.
export function zVarde(matt, kon, dag, varde) {
  const p = lmsFor(matt, kon, dag);
  if (!p || !(varde > 0)) return null;
  return zLms(matt === 'vikt' ? varde * 1000 : varde, ...p);
}

// Storlek för gestationsåldern vid födelsen ur födelsevikten: under 10:e percentilen SGA och över 90:e LGA.
const Z10 = -1.2815515655446004;
export const STORLEK = {
  SGA: 'Liten för gestationsåldern (SGA), under 10:e percentilen',
  AGA: 'Normal storlek för gestationsåldern (AGA), mellan 10:e och 90:e percentilen',
  LGA: 'Stor för gestationsåldern (LGA), över 90:e percentilen',
};
export function storlek(kon, gv, gd, fodelsevikt) {
  if (!(gv < FODD_FORE) || gv > SGA_TILL || !(fodelsevikt > 0)) return null;
  const z = zVarde('vikt', kon, dagVidFodsel(gv, gd), fodelsevikt);
  if (z == null) return null;
  const klass = z < Z10 ? 'SGA' : z > -Z10 ? 'LGA' : 'AGA';
  return { klass, text: STORLEK[klass], z: Math.round(z * 100) / 100, percentil: percentil(z) };
}

// Barnets punkter på Fentons kurva. punkter: { vikt: [{ tid, varde, kalla, vantar }], ... }. Bara punkter före 50+0
// räknas, och bara de bekräftade.
export function kurva(kon, fodd, gv, gd, punkter) {
  const slut = dagVidFodsel(SLUT_VECKOR, 0);
  const start = dagVidFodsel(gv, gd);
  return MATT.map(matt => {
    const lista = (punkter[matt] ?? []).filter(p => !p.vantar).map(p => {
      const dag = start + Math.max(0, dagarSedanFodsel(fodd, p.tid));
      if (dag > slut) return null;
      const z = zVarde(matt, kon, dag, p.varde);
      return { tid: p.tid, varde: p.varde, kalla: p.kalla, dag, vecka: veckaText(dag), z: z == null ? null : Math.round(z * 100) / 100, percentil: percentil(z), utanfor: z == null };
    }).filter(Boolean).sort((a, b) => a.dag - b.dag || a.tid.localeCompare(b.tid));
    return { matt, punkter: lista };
  });
}

// Det som tillväxtvyn får för ett barn. null när barnet inte är fött före vecka 37.
export function forBarn(p, { gv, gd = null, punkter, fodelsevikt = null, mellanhand = null }) {
  if (!(gv > 0) || gv >= FODD_FORE) return null;
  const bas = { namn: NAMN, kalla: KALLA, doi: DOI, licens: LICENS, webb: WEBB, slutVeckor: SLUT_VECKOR, gestationsalder: veckaText(dagVidFodsel(gv, gd ?? 0)), dagarSaknas: gd == null, mellanhand };
  if (!tillganglig()) return { ...bas, tillganglig: false, text: 'Fentons kurvdata finns inte på den här servern, så barnet räknas med korrigerad ålder på WHO:s kurvor.' };
  return {
    ...bas, tillganglig: true,
    storlek: storlek(p.kon, gv, gd ?? 0, fodelsevikt),
    kurvor: kurva(p.kon, p.fodd, gv, gd ?? 0, punkter),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Mellanhanden mot fentongrowth.ca.
export const TIDSGRANS_MS = 15_000;
export const MAX_BILD = 4 * 1024 * 1024;

// Spärren. Ger skälet till att mellanhanden är avstängd, eller null när den får användas för patienten.
export function sparr(p = null, env = process.env) {
  if (!env.FENTON_API_KEY) return 'Nyckeln till fentongrowth.ca finns inte på servern.';
  if (env.FENTON_MELLANHAND !== 'demo') return 'Mellanhanden är avstängd, eftersom systemet inte körs som demo.';
  if (p && !TESTPERSONNUMMER.includes(p.personnummer)) return 'Barnet har inte ett av Skatteverkets testpersonnummer, så inget skickas.';
  return null;
}

// Datumet som tjänsten vill ha det, med månadens engelska förkortning (till exempel 25-Apr-25).
const engelsktDatum = (d) => `${d.slice(8, 10)}-${new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }).slice(0, 3)}-${d.slice(2, 4)}`;
const gaText = (dag) => `${22 + Math.floor(dag / 7)} ${dag % 7}/7`;
const csvTal = (v, d) => (v == null ? '' : String(Math.round(v * 10 ** d) / 10 ** d));

// CSV-filen i Fentons format. Titel och nummer lämnas tomma, så att inget namn eller personnummer skickas.
export function csv(p, gv, gd, punkter) {
  const start = dagVidFodsel(gv, gd ?? 0);
  const slut = dagVidFodsel(SLUT_VECKOR, 0);
  const rader = new Map();
  for (const [matt, kol] of [['vikt', 0], ['huvudomfang', 1], ['langd', 2]]) {
    for (const q of (punkter[matt] ?? []).filter(x => !x.vantar)) {
      const dag = start + Math.max(0, dagarSedanFodsel(p.fodd, q.tid));
      if (dag > slut) continue;
      const r = rader.get(dag) ?? ['', '', ''];
      r[kol] = matt === 'vikt' ? csvTal(q.varde * 1000, 0) : csvTal(q.varde, 1);
      rader.set(dag, r);
    }
  }
  const sorterade = [...rader.entries()].sort((a, b) => a[0] - b[0]);
  const text = ['Title:,,,', 'Number,,,', `Date of birth,${engelsktDatum(p.fodd)},,`, `GA at birth:,${gaText(start)},,`, `Sex:,${p.kon === 'kvinna' ? 'F' : 'M'},,`, 'Language,English,,', 'Data Type ,Growth,,', 'GA (weeks),Weight (g),Head (cm),Length (cm)',
    ...sorterade.map(([dag, r]) => `${gaText(dag)},${r.join(',')}`)].join('\n') + '\n';
  return { text, antal: sorterade.length };
}

// Tolkar svaret från ClientDownloadCsv till z-värden per gestationsålder.
export function tolkaZ(text) {
  const rader = String(text).replace(/^﻿/, '').split(/\r?\n/);
  const i = rader.findIndex(r => r.startsWith('Date,GA_weeks'));
  if (i < 0) return [];
  const kol = rader[i].split(',');
  const tal = (v) => (v === '' || v === '~' || v == null ? null : Number(v));
  return rader.slice(i + 1).filter(r => r.trim()).map(r => {
    const f = Object.fromEntries(r.split(',').map((v, j) => [kol[j], v]));
    const ga = tal(f.GA_weeks);
    return { dag: ga == null ? null : Math.round((ga - 22) * 7), vikt: tal(f.W_Z), huvudomfang: tal(f.H_Z), langd: tal(f.L_Z), viktPercentil: tal(f['W_%']), huvudomfangPercentil: tal(f['H_%']), langdPercentil: tal(f['L_%']) };
  });
}

const logg = (rad) => console.info(`[fenton] ${JSON.stringify(rad)}`);

// Skickar barnets mätningar till fentongrowth.ca och hämtar kurvan som JPG och tjänstens z-värden. Kastar aldrig: ett
// fel ger { ok: false, text }. hamta kan bytas i testerna.
export async function rita({ patientId, csvText, antal }, { env = process.env, hamta = fetch, tidsgrans = TIDSGRANS_MS } = {}) {
  const t0 = Date.now();
  const bas = WEBB;
  const form = () => { const f = new FormData(); f.append('file', new Blob([csvText], { type: 'text/csv' }), 'vardkallan.csv'); return f; };
  const huvud = { 'X-API-Key': env.FENTON_API_KEY };
  const resultat = { patientId, rader: antal };
  try {
    const [bildSvar, zSvar] = await Promise.all([
      hamta(`${bas}/api/Fenton/ClientPlotPoints`, { method: 'POST', headers: huvud, body: (() => { const f = form(); f.append('runMode', 'jpg'); return f; })(), redirect: 'error', signal: AbortSignal.timeout(tidsgrans) }),
      hamta(`${bas}/api/Fenton/ClientDownloadCsv`, { method: 'POST', headers: huvud, body: form(), redirect: 'error', signal: AbortSignal.timeout(tidsgrans) }).catch(() => null),
    ]);
    resultat.status = bildSvar.status;
    if (!bildSvar.ok) throw new Error(`svar ${bildSvar.status}`);
    const j = await bildSvar.json();
    if (!j?.ok || typeof j.contentUrl !== 'string') throw new Error('svaret saknar bild');
    const url = new URL(j.contentUrl, `${bas}/`);
    if (url.origin !== new URL(bas).origin) throw new Error('bilden ligger på en annan adress');
    const bild = await hamta(url.toString(), { redirect: 'error', signal: AbortSignal.timeout(tidsgrans) });
    if (!bild.ok || !String(bild.headers.get('content-type') ?? '').startsWith('image/jpeg')) throw new Error(`bilden gav ${bild.status}`);
    const bytes = new Uint8Array(await bild.arrayBuffer());
    if (bytes.length > MAX_BILD) throw new Error('bilden är för stor');
    const z = zSvar?.ok ? tolkaZ(await zSvar.text()) : [];
    logg({ ...resultat, ok: true, ms: Date.now() - t0, bildKb: Math.round(bytes.length / 1024), zRader: z.length });
    return { ok: true, bild: `data:image/jpeg;base64,${Buffer.from(bytes).toString('base64')}`, z, raderat: 'Tjänsten raderar uppgifterna efter en timme.' };
  } catch (e) {
    const timeout = e?.name === 'TimeoutError' || e?.name === 'AbortError';
    logg({ ...resultat, ok: false, ms: Date.now() - t0, fel: timeout ? 'tidsgräns' : String(e?.message ?? 'fel').slice(0, 80) });
    return { ok: false, text: timeout ? 'fentongrowth.ca svarade inte i tid. Kurvan i Vårdkällan gäller ändå.' : 'fentongrowth.ca kunde inte rita kurvan just nu. Kurvan i Vårdkällan gäller ändå.' };
  }
}
