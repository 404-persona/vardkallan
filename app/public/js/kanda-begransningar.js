// Runda 13, r1: kända begränsningar som testarna ser på startsidan för testare (#/testa) och på sidan Om demon (#/om),
// så att de inte lägger tid på att rapportera det som projektet redan vet. Listan är data och uppdateras här.
// Varje post: rubrik (kort) och text (vad som saknas eller är förenklat). Fältet kalla är fynd ur det utforskande testet
// och visas inte. Runda 18, r4: fältet granskad är versionen (major och minor) där posten senast prövades mot koden, och
// testet i app/test/textgranskning.test.js stoppar bygget när en post är granskad i en äldre version än package.json.
import { esc } from './ui.js';

export const KANDA_BEGRANSNINGAR = [
  // Runda 18, r4: listan är prövad mot koden i version 1.8. Det som är löst står inte längre som saknat: sjukintygen finns
  // sedan 1.6 (bara sändningen är simulerad), kassan räknar frikortet och visar kvittonumret, och partogrammet har
  // varnings- och åtgärdslinje, fosterljud och värkar (obstetrik.js).
  { granskad: '1.8', rubrik: 'Nationella tjänster och andra system är simulerade', text: 'Nationell patientöversikt (NPÖ), Nationella läkemedelslistan (NLL), 1177, e-remiss, laboratorierna, Socialstyrelsens register över legitimationer (HOSP), folkbokföringen (PU-tjänsten), samtyckestjänsten, kvalitetsregistren, blodcentralen och den medicintekniska utrustningen är simulerade i demon. Det som skickas dit når ingen riktig mottagare, och det som tas emot kommer inte från någon riktig tjänst.' },
  { granskad: '1.8', rubrik: 'Inloggningen är simulerad', text: 'SITHS-kortet och e-legitimationen är simulerade. Du loggar in som en påhittad person i demon, utan eget konto.' },
  { granskad: '1.8', rubrik: 'Intygen skickas inte till Försäkringskassan', text: 'Intygen, till exempel läkarintyget för sjukpenning, skrivs och signeras i en simulerad intygsapplikation. Inget skickas till Försäkringskassan, och frågor och svar från Försäkringskassan finns inte.', kalla: 'E1-15' },
  { granskad: '1.8', rubrik: 'Recept med uttag och expeditionsintervall', text: 'Läkemedel förskrivs utan antal uttag och expeditionsintervall. Förbrukningsartiklar har antal uttag men inget expeditionsintervall.', kalla: 'E1-13' },
  { granskad: '1.8', rubrik: 'Partogram och födelsens uppgifter', text: 'Partogrammet räknar varnings- och åtgärdslinjen och har fosterljud och värkar, men inte fosterhuvudets nivå, hinnorna eller fostervattnet. Registreringen av födelsen har barnets uppgifter och Apgar men inte blödningsmängd, bristning, moderkakan eller navelsträngsprov.', kalla: 'E2-32, E2-33, E2-35' },
  { granskad: '1.8', rubrik: 'Arbetslista för barnavårdscentralen', text: 'BVC-sjuksköterskan ser i inkorgen de barn vars besök ska bokas nu, men har ingen egen arbetslista med alla barn, nästa besök i programmet och försenade besök och doser.', kalla: 'E2-37' },
  { granskad: '1.8', rubrik: 'Fysioterapins åtgärder och mätvärden', text: 'Fysioterapeuten har en egen anteckningsmall, men åtgärderna får inga KVÅ-koder, och gångtest och Borgs skala finns inte bland mätvärdena.', kalla: 'E2-42' },
  { granskad: '1.8', rubrik: 'Överrapportering för hela avdelningen', text: 'Överrapportering enligt SBAR finns för en patient på intensivvården och från uppvakningen till vårdavdelningen, men det finns ingen rapportvy för hela avdelningen eller teamet inför nästa pass.', kalla: 'E2-52' },
  { granskad: '1.8', rubrik: 'Andra kontroll i cytostatikaberedningen', text: 'En separat kontroll och frisläppning av en andra person innan dosen lämnar beredningen finns inte än. Dubbelkontrollen görs när kuren ges.', kalla: 'E2-27' },
  { granskad: '1.8', rubrik: 'Kontroller före och under transfusion', text: 'Kontrollen vid sängen görs för varje enhet med en andra person i sin egen inloggning, men puls, blodtryck och temperatur före, efter 15 minuter och efter transfusionen registreras inte i transfusionen.', kalla: 'E2-55' },
  { granskad: '1.8', rubrik: 'Incheckning med id och kvitto', text: 'Incheckningen kontrollerar inte patientens identitet eller kontaktuppgifter. Efter betalningen visar kassan kvittonumret, men det finns inget kvitto att skriva ut.', kalla: 'E3-12' },
  { granskad: '1.8', rubrik: 'Arbete när servern inte svarar', text: 'Läskopian har arbetslistan och patienternas journaler men inte vårdadministratörens Dagens arbete och tidbok. Det som går att registrera är doser och mätvärden, som skickas när förbindelsen är tillbaka.', kalla: 'E3-51' },
  { granskad: '1.8', rubrik: 'Avdelningens planering', text: 'Valen i avdelningens planering sparas inte, och en uppgift kan inte upprepas av sig själv.' },
];

// Den ihopfällda listan, som startsidan och sidan Om demon visar.
export const begransningarHtml = (id) => `<details class="ruta kanda" id="${id}"><summary>Kända begränsningar (${KANDA_BEGRANSNINGAR.length})</summary>
  <p class="liten dampad">Det här vet projektet redan om. Du behöver inte rapportera det, men säg gärna till om något av det är extra viktigt i ditt arbete.</p>
  <ul>${KANDA_BEGRANSNINGAR.map(b => `<li><strong>${esc(b.rubrik)}.</strong> ${esc(b.text)}</li>`).join('')}</ul></details>`;
