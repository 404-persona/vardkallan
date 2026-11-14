// Runda 15, r1 (vårt L5 och Sussa 5.2.1.1, beslut från Jonas 2026-11-14): tillitsnivån i personalens inloggning, och om
// inloggningen redan är flerfaktor.
//
// SITHS eID (kortet eller appen i mobilen) med tillitsnivå 3 kräver något man har och något man vet, och tillitsnivå 3 i
// DIGG:s tillitsramverk för Svensk e-legitimation förutsätter flera faktorer. Ineras referensarkitektur för identitet och
// åtkomst (K5 i förfrågningsunderlaget, 5.13.5) säger att begreppet stark autentisering i Socialstyrelsens föreskrifter
// bör likställas med tillitsnivå 3. En sådan inloggning räknas därför som flerfaktor, och Vårdkällan frågar inte efter
// en passkey eller en engångskod efter den.
//
// Systemet avgör nivån själv, och bara ur det som går att lita på: värdet acr i en biljett som är signerad med en nyckel
// som systemförvaltarna har pinnat med fyra ögon (inloggningstjanster.js), eller i biljetten från den simulerade
// autentiseringstjänsten för det simulerade SITHS-kortet (idp.js). Värdet tolkas mot en fast lista med de identifierare
// som Inera (Sambi) och DIGG (Sweden Connect) publicerar. Ett okänt eller saknat värde räknas som en faktor, och amr
// (hur personen loggade in) visas men avgör aldrig.
//
// En inloggning under tillitsnivå 3 ger aldrig åtkomst ensam. Den är en faktor, och Vårdkällan kompletterar den med en
// passkey eller en app för engångskoder innan personen får någon behörighet (HSLF-FS 2016:40 3 kap. 15 §). Vilka lägre
// nivåer som alls får kompletteras bestämmer vårdgivaren per inloggningstjänst (lagstaTillitsniva, fyra ögon).

// Nivån där en inloggning räknas som flerfaktor.
export const FLERFAKTOR_NIVA = 3;
export const STANDARD_LAGSTA = 3;

// Identifierarna för tillitsnivåerna. Sambi används av Ineras IdP (3.3 SAD - IdP - Medarbetare Bas OIDC-Profil), och
// DIGG:s identifierare står i Sweden Connect, Registry for identifiers (version 1.9, 2026-10-22). En självdeklarerad nivå
// (uncertified) räknas ett steg lägre, eftersom den inte är granskad mot tillitsramverket.
const SAMBI = 'Sambi (Ineras IdP)';
const DIGG = 'Myndigheten för digital förvaltning, tillitsramverket för Svensk e-legitimation';
const EIDAS = 'eIDAS genom Myndigheten för digital förvaltning';
export const IDENTIFIERARE = new Map([
  ['http://id.sambi.se/loa/loa1', { niva: 1, ramverk: SAMBI }],
  ['http://id.sambi.se/loa/loa2', { niva: 2, ramverk: SAMBI }],
  ['http://id.sambi.se/loa/loa3', { niva: 3, ramverk: SAMBI }],
  ['http://id.sambi.se/loa/loa4', { niva: 4, ramverk: SAMBI }],
  ['http://id.elegnamnden.se/loa/1.0/loa1', { niva: 1, ramverk: DIGG }],
  ['http://id.elegnamnden.se/loa/1.0/loa2', { niva: 2, ramverk: DIGG }],
  ['http://id.elegnamnden.se/loa/1.0/loa3', { niva: 3, ramverk: DIGG }],
  ['http://id.elegnamnden.se/loa/1.0/loa4', { niva: 4, ramverk: DIGG }],
  ['http://id.swedenconnect.se/loa/1.0/loa2-nonresident', { niva: 2, ramverk: DIGG }],
  ['http://id.swedenconnect.se/loa/1.0/loa3-nonresident', { niva: 3, ramverk: DIGG }],
  ['http://id.swedenconnect.se/loa/1.0/loa4-nonresident', { niva: 4, ramverk: DIGG }],
  ['http://id.swedenconnect.se/loa/1.0/uncertified-loa2', { niva: 1, ramverk: DIGG, sjalvdeklarerad: true }],
  ['http://id.swedenconnect.se/loa/1.0/uncertified-loa3', { niva: 2, ramverk: DIGG, sjalvdeklarerad: true }],
  ['http://id.elegnamnden.se/loa/1.0/eidas-low', { niva: 2, ramverk: EIDAS }],
  ['http://id.elegnamnden.se/loa/1.0/eidas-sub', { niva: 3, ramverk: EIDAS }],
  ['http://id.elegnamnden.se/loa/1.0/eidas-high', { niva: 4, ramverk: EIDAS }],
  ['http://id.elegnamnden.se/loa/1.0/eidas-nf-low', { niva: 2, ramverk: EIDAS }],
  ['http://id.elegnamnden.se/loa/1.0/eidas-nf-sub', { niva: 3, ramverk: EIDAS }],
  ['http://id.elegnamnden.se/loa/1.0/eidas-nf-high', { niva: 4, ramverk: EIDAS }],
]);

// Vad nivåerna betyder, på vanlig svenska.
export const NIVATEXT = {
  1: 'Tillitsnivå 1: ingen eller mycket begränsad tillit, till exempel ett konto som personen har skapat själv.',
  2: 'Tillitsnivå 2: viss tillit, oftast en faktor, till exempel användarnamn och lösenord.',
  3: 'Tillitsnivå 3: hög tillit. Flera faktorer och en säker utfärdning, till exempel SITHS-kortet eller SITHS eID i mobilen med PIN-kod.',
  4: 'Tillitsnivå 4: mycket hög tillit, med kort och personlig utlämning.',
};

// Lägsta tillitsnivå som en inloggningstjänst får ge. Under nivån godtas ingen biljett från tjänsten. Under nivå 3 är
// inloggningen en faktor, och Vårdkällan kräver alltid en passkey eller en app för engångskoder innan personen får
// behörighet.
export const LAGSTA = {
  1: { rubrik: 'Tillitsnivå 1, eller ingen uppgift om nivån', text: 'Alla biljetter från tjänsten godtas, också utan uppgift om nivån. Inloggningen räknas då som en faktor, och personalen bekräftar varje inloggning med en passkey eller en kod från appen. Välj den bara för en tjänst som inte anger tillitsnivå alls.' },
  2: { rubrik: 'Tillitsnivå 2', text: 'Biljetter med tillitsnivå 2 godtas som en faktor, till exempel inloggning med lösenord. Personalen bekräftar då inloggningen med en passkey eller en kod från appen, eftersom åtkomst till patientuppgifter kräver flerfaktor. Biljetter med nivå 3 eller högre räknas som flerfaktor.' },
  3: { rubrik: 'Tillitsnivå 3 (rekommenderas)', text: 'Bara biljetter med tillitsnivå 3 eller högre godtas, till exempel SITHS-kortet eller SITHS eID i mobilen. Inloggningen är redan flerfaktor, så personalen ser inget extra steg. En lägre nivå stoppas med en förklaring.' },
  4: { rubrik: 'Tillitsnivå 4', text: 'Bara biljetter med tillitsnivå 4 godtas. Personal som loggar in med nivå 3, till exempel SITHS eID i mobilen, kommer då inte in genom tjänsten.' },
};

// Prövar en lägsta nivå från ett formulär eller en sparad konfiguration. En äldre konfiguration utan nivå har nivå 3.
export function lagstaNiva(v, { standard = STANDARD_LAGSTA } = {}) {
  if (v === undefined || v === null || v === '') return standard;
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^[1-4]$/.test(v.trim()) ? Number(v.trim()) : NaN;
  return Object.hasOwn(LAGSTA, String(n)) ? n : null;
}

// Tolkar acr. Ger { uri, niva, kand, ramverk, text }. niva är null när värdet saknas eller är okänt, och räknas då som en
// faktor.
export function tolka(acr) {
  const uri = typeof acr === 'string' ? acr.trim().slice(0, 200) : null;
  const k = uri ? IDENTIFIERARE.get(uri) : null;
  if (!k) {
    return { uri, niva: null, kand: false, ramverk: null,
      text: uri ? 'Tillitsnivån i biljetten är okänd för Vårdkällan och räknas som en faktor.' : 'Biljetten anger ingen tillitsnivå, så inloggningen räknas som en faktor.' };
  }
  return { uri, niva: k.niva, kand: true, ramverk: k.ramverk, sjalvdeklarerad: Boolean(k.sjalvdeklarerad),
    text: `${NIVATEXT[k.niva]}${k.sjalvdeklarerad ? ' Nivån är självdeklarerad av tjänsten och inte granskad mot tillitsramverket, så den räknas ett steg lägre.' : ''}` };
}

// Nivån som jämförs med den lägsta: en okänd nivå räknas som nivå 1.
export const jamforbar = (t) => t.niva ?? 1;
export const underLagsta = (t, lagsta) => jamforbar(t) < lagsta;

// Varför en biljett med för låg nivå inte godtas, och vem som kan ändra det.
export function forLagText(t, lagsta, tjanstNamn) {
  const har = t.niva ? `tillitsnivå ${t.niva}` : t.uri ? 'en tillitsnivå som Vårdkällan inte känner igen' : 'ingen uppgift om tillitsnivå';
  return `tillitsnivån räcker inte. Inloggningen hade ${har}, och ${tjanstNamn ?? 'inloggningstjänsten'} är inställd på lägst tillitsnivå ${lagsta}. Logga in med SITHS-kortet eller SITHS eID i mobilen, som ger tillitsnivå 3. Systemförvaltningen kan ändra den lägsta nivån för tjänsten, med fyra ögon.`;
}

// Hur personen loggade in, ur amr (RFC 8176 och SAML-kontext). Bara för visning.
const AMR = { sc: 'kort', pin: 'PIN-kod', pwd: 'lösenord', otp: 'engångskod', hwk: 'nyckel i hårdvara', swk: 'nyckel i programvara', mfa: 'flera faktorer', fpt: 'fingeravtryck', face: 'ansikte' };
export function amrLista(amr) {
  const lista = Array.isArray(amr) ? amr : typeof amr === 'string' ? [amr] : [];
  return lista.filter(x => typeof x === 'string' && x.length <= 120).slice(0, 8);
}
export function amrText(amr) {
  const lista = amrLista(amr);
  if (lista.some(x => /MobileTwoFactor/i.test(x))) return 'e-legitimation i mobilen med två faktorer';
  const ord = lista.map(x => AMR[x]).filter(Boolean);
  return ord.length ? ord.join(' och ') : null;
}

const ANDRA = { passkey: 'passkey', totp: 'kod från appen för engångskoder' };

// Inloggningens nivå för en session, ur medarbetaruppdraget som servern har sparat vid inloggningen. andraFaktor sätts
// när personen har bekräftat inloggningen med en passkey eller en kod. Ger { niva, flerfaktor, metod, text }.
export function forUppdrag(uppdrag) {
  if (!uppdrag) return { niva: null, flerfaktor: false, metod: null, text: 'Ingen inloggning.' };
  const t = tolka(uppdrag.tillitsniva);
  const andra = Object.hasOwn(ANDRA, uppdrag.andraFaktor ?? '') ? uppdrag.andraFaktor : null;
  const forsta = uppdrag.extern
    ? `${uppdrag.tjanstNamn ?? 'Inloggningstjänsten'}${amrText(uppdrag.amr) ? ` med ${amrText(uppdrag.amr)}` : ''}`
    : uppdrag.invanare ? (t.niva >= FLERFAKTOR_NIVA ? 'E-legitimation (simulerad)' : 'Simulerad e-legitimation med lägre tillitsnivå')
    : t.niva >= FLERFAKTOR_NIVA ? 'SITHS-kort med PIN-kod (simulerat)' : 'Simulerad inloggning utan SITHS-kort';
  const flerfaktor = (t.niva ?? 0) >= FLERFAKTOR_NIVA || Boolean(andra);
  const nivaText = t.niva ? `tillitsnivå ${t.niva}` : 'okänd tillitsnivå';
  const metod = andra ? `${forsta}, ${nivaText}, och ${ANDRA[andra]}` : `${forsta}, ${nivaText}`;
  return {
    niva: t.niva, kand: t.kand, flerfaktor, andraFaktor: andra, metod,
    text: (t.niva ?? 0) >= FLERFAKTOR_NIVA
      ? `Du loggade in med ${forsta.charAt(0).toLowerCase()}${forsta.slice(1)}, ${nivaText}. Det är redan flerfaktor, så ingen passkey eller kod behövs.`
      : andra
        ? `Du loggade in med ${nivaText} och bekräftade med en ${ANDRA[andra]}. Tillsammans är det flerfaktor.`
        : `Du loggade in med ${nivaText}. Det är en faktor.`,
  };
}

// Förklaringen när en inloggning under nivå 3 behöver en andra faktor.
export function andraFaktorText(uppdrag, { harFaktor }) {
  const t = tolka(uppdrag?.tillitsniva);
  const har = t.niva ? `tillitsnivå ${t.niva}` : 'en inloggning utan känd tillitsnivå';
  const krav = uppdrag?.invanare ? 'åtkomst till din journal kräver flerfaktor (tillitsnivå 3, till exempel en e-legitimation som BankID)' : 'åtkomst till patientuppgifter kräver flerfaktor (tillitsnivå 3, till exempel SITHS-kortet med PIN-kod)';
  return `Du loggade in med ${har}. Det är en faktor, och ${krav}. ${harFaktor ? 'Bekräfta med din passkey eller en kod från appen.' : 'Registrera en passkey eller en app för engångskoder. Nästa gång räcker det att bekräfta med den.'}`;
}

// Säkerhetsgranskningen efter runda 15: under tillitsnivå 3 räcker inte den första faktorn för att registrera en andra,
// eftersom vem som helst med bara den första faktorn då kunde lägga till en egen. En passkey eller en app för
// engångskoder registreras efter en inloggning med tillitsnivå 3, och bekräftar sedan en inloggning med lägre nivå.
export function utanFaktorText(uppdrag) {
  const t = tolka(uppdrag?.tillitsniva);
  const har = t.niva ? `tillitsnivå ${t.niva}` : 'en inloggning utan känd tillitsnivå';
  return uppdrag?.invanare
    ? `Du loggade in med ${har}. Det är en faktor, och åtkomst till din journal kräver flerfaktor. Du har ingen passkey eller app för engångskoder att bekräfta med, och en sådan kan bara registreras efter en inloggning med tillitsnivå 3. Logga in med en e-legitimation som BankID och registrera den under Flerfaktor, så räcker den lägre nivån nästa gång.`
    : `Du loggade in med ${har}. Det är en faktor, och åtkomst till patientuppgifter kräver flerfaktor. Du har ingen passkey eller app för engångskoder att bekräfta med, och en sådan kan bara registreras efter en inloggning med tillitsnivå 3. Logga in med SITHS-kortet och registrera den under Flerfaktor, så räcker den lägre nivån nästa gång.`;
}

// Det som sessionen och API:t visar om inloggningens nivå.
export const ut = (uppdrag) => {
  const b = forUppdrag(uppdrag);
  return { niva: b.niva, flerfaktor: b.flerfaktor, andraFaktor: b.andraFaktor, metod: b.metod, text: b.text };
};

// Känsliga handlingar kräver att inloggningen är flerfaktor: tillitsnivå 3 eller högre, eller en bekräftad andra faktor.
// Varje vanlig inloggning uppfyller det, så kontrollen är ett lager till för en session som av något skäl saknar nivå
// (till exempel en äldre sparad session). Nödåtkomsten kräver ingen ny bekräftelse i stunden, eftersom den görs när
// patienten behöver vård nu.
export const KANSLIGA = [
  { metod: 'POST', monster: /^\/api\/patient\/[^/]+\/val$/, nar: (body) => ['nodatkomst', 'samtycke_sparr'].includes(body?.typ), text: 'Nödåtkomst och att läsa spärrade uppgifter med samtycke' },
  { metod: 'POST', monster: /^\/api\/ordination\/[^/]+\/avbokad\/nodatkomst$/, text: 'Nödåtkomst' },
  { metod: 'POST', monster: /^\/api\/patient\/[^/]+\/sammanhallen\/hav-sparr$/, text: 'Att häva en spärr' },
  { metod: 'POST', monster: /^\/api\/begaran\/[^/]+\/handlagg$/, text: 'Att häva eller registrera en spärr på patientens begäran' },
  { metod: 'POST', monster: /^\/api\/konfiguration\/[^/]+\/godkann$/, text: 'Att godkänna en ändrad regel eller parameter' },
  { metod: 'POST', monster: /^\/api\/inloggningstjanster\/andring\/[^/]+\/godkann$/, text: 'Att godkänna en ändring av en inloggningstjänst' },
];
export function kanslig(metod, vag, body) {
  return KANSLIGA.find(k => k.metod === metod && k.monster.test(vag) && (!k.nar || k.nar(body))) ?? null;
}
export function kanslighetsText(k, uppdrag) {
  const b = forUppdrag(uppdrag);
  return `${k.text} kräver att inloggningen är flerfaktor: SITHS-kortet med PIN-kod eller en annan inloggning med tillitsnivå 3, eller en bekräftad passkey eller kod från appen. Din inloggning har ${b.niva ? `tillitsnivå ${b.niva}` : 'ingen känd tillitsnivå'} utan andra faktor. Logga ut och logga in igen med SITHS-kortet.`;
}

// Runda 15, r1 (beslut från Jonas): nivåerna som Vårdkällan begär av inloggningstjänsten med acr_values (OpenID Connect
// Core 3.1.2.1), så att tjänsten själv väljer en legitimation som räcker. Nivån i svaret prövas ändå. Har tjänsten angett
// sina nivåer (acr_values_supported) begärs bara de som är kända, granskade och minst den lägsta nivån; annars Ineras och
// DIGG:s identifierare för nivåerna från den lägsta och uppåt. Med lägsta nivå 1 begärs ingen viss nivå. Lägsta nivån
// först, eftersom den räcker och oftast är den som personalen har, till exempel SITHS eID.
const STANDARD_BEGARAN = ['http://id.sambi.se/loa/loa', 'http://id.elegnamnden.se/loa/1.0/loa'];
export function begardaNivaer(lagsta, stodda = null) {
  const min = lagstaNiva(lagsta) ?? STANDARD_LAGSTA;
  if (min <= 1) return null;
  const godkand = (uri) => { const k = IDENTIFIERARE.get(uri); return Boolean(k && !k.sjalvdeklarerad && k.niva >= min); };
  const lista = Array.isArray(stodda) && stodda.length
    ? [...new Set(stodda.filter(u => typeof u === 'string' && godkand(u)))]
    : [2, 3, 4].filter(n => n >= min).flatMap(n => STANDARD_BEGARAN.map(p => p + n));
  lista.sort((a, b) => IDENTIFIERARE.get(a).niva - IDENTIFIERARE.get(b).niva);
  return lista.length ? lista : null;
}
