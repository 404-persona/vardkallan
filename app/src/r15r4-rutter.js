// Runda 15, r4: API för anteckningsvyn: mallen med underlag och varianter för en patient, utkastet som sparas av sig
// självt och personens egna fraser och ordning på sökorden. Behörigheten prövas i modulerna av behörighetsmotorn, och
// varje anrop som rör en patient loggas på patienten (medPatient).
import { Fel } from './db.js';
import * as konfiguration from './konfiguration.js';
import { mallarFor as strukturMallar } from './journalstruktur.js';
import { mallarFor as formularMallar } from './formularmotor.js';
import * as journal from './journal.js';
import * as anteckningsmall from './anteckningsmall.js';
import * as utkast from './anteckningsutkast.js';
import * as fraser from './egna-fraser.js';
// Säkerhetsgranskningen efter runda 15: bara de mallar som yrket skriver med (r5, mallar-yrken.js).
import { mallarForPerson as yrkesMallar } from './mallar-yrken.js';

// Mallarna som den inloggade får använda, med vårdenhetens anpassning (samma som GET /api/mallar).
export const mallarForPerson = (c) => yrkesMallar(c.db, c.personal, [...strukturMallar(c.db, c.personal, konfiguration.mallar(c.db)), ...formularMallar(c.db, c.personal)]);
const mallFor = (c, typ) => (typeof typ === 'string' ? mallarForPerson(c).find(m => m.typ === typ) ?? null : null);
const heltal = (v) => (v == null || v === '' ? null : /^\d{1,9}$/.test(String(v)) ? Number(v) : NaN);

export function registreraRutter({ rutt, kravInloggad, medPatient }) {
  rutt('GET', '/api/patient/:id/anteckningsmall', (c, id) => {
    kravInloggad(c);
    const mall = mallFor(c, c.url.searchParams.get('typ'));
    if (!mall) throw new Fel(404, 'Mallen finns inte eller får inte användas av din yrkesroll.', 'saknas');
    const utkastId = heltal(c.url.searchParams.get('utkast'));
    if (Number.isNaN(utkastId)) throw new Fel(400, 'Ogiltigt utkast.', 'ogiltig', { falt: ['utkast'] });
    return medPatient(c, id, journal.skrivHandling(mall.kategori, c.personal), (atk) => anteckningsmall.forPatient(atk, mall, { utkastId }));
  });
  rutt('PUT', '/api/patient/:id/anteckningsutkast', (c, id) => {
    kravInloggad(c);
    // Säkerhetsgranskningen efter runda 15: ett utkast slås upp bara bland personens egna, så att svaret för någon annans
    // anteckning är detsamma som för en som inte finns.
    const kat = utkast.kategori(c.db, id, c.body ?? {}, c.personal);
    if (!kat && (c.body ?? {}).anteckningId != null) throw new Fel(404, 'Utkastet finns inte.', 'saknas');
    if (!kat) throw new Fel(400, 'Okänd anteckningstyp.', 'ogiltig', { falt: ['typ'] });
    return medPatient(c, id, journal.skrivHandling(kat, c.personal), (atk) => utkast.spara(atk, c.body ?? {}));
  });
  rutt('DELETE', '/api/patient/:id/anteckningsutkast/:aid', (c, id, aid) => {
    kravInloggad(c);
    const nr = heltal(aid);
    if (!Number.isInteger(nr)) throw new Fel(404, 'Utkastet finns inte.', 'saknas');
    const kat = utkast.kategori(c.db, id, { anteckningId: nr }, c.personal);
    if (!kat) throw new Fel(404, 'Utkastet finns inte.', 'saknas');
    return medPatient(c, id, journal.skrivHandling(kat, c.personal), (atk) => utkast.taBort(atk, nr));
  });
  rutt('GET', '/api/egna-fraser', (c) => fraser.lista(c.db, kravInloggad(c)));
  rutt('POST', '/api/egna-fraser', (c) => [201, fraser.lagg(c.db, kravPersonal(c), c.body ?? {})]);
  rutt('DELETE', '/api/egna-fraser/:fid', (c, fid) => fraser.taBort(c.db, kravPersonal(c), fid));
  rutt('PUT', '/api/egna-fraser/ordning', (c) => {
    const p = kravPersonal(c);
    const mall = mallFor(c, c.body?.typ);
    if (!mall) throw new Fel(400, 'Välj en mall som du får använda.', 'ogiltig', { falt: ['typ'] });
    return fraser.sattOrdning(c.db, p, mall, c.body?.ordning ?? null);
  });

  // Demo (klickbudgeten och användartestet): Gunnar Åkessons journal fylls till 30 anteckningar som den inloggade får se,
  // där de tre senaste är omvårdnadsanteckningar utan bedömning. Bara i den egna sandlådan, och med den inloggades
  // behörighet, så att inget skrivs som personen inte själv får skriva.
  rutt('POST', '/api/demo/journal-30', (c) => {
    kravInloggad(c);
    return medPatient(c, 'p01', 'skriv_journal', (atk) => {
      const antal = () => journal.listaAnteckningar(atk).anteckningar.length;
      let i = 0;
      while (antal() < 27 && i < 40) {
        i += 1;
        const a = journal.skapaAnteckning(atk, { typ: 'Daganteckning', sokord: [{ sokord: 'Aktuellt', text: `Rond dag ${i}.` }, { sokord: 'Bedömning', text: `Bedömning nummer ${i}, stabil.` }] });
        journal.signera(atk, journal.hamtaAnteckningRad(atk.db, a.id));
      }
      for (let n = antal(), k = 0; n < 30 && k < 10; n = antal(), k++) {
        const a = journal.skapaAnteckning(atk, { typ: 'Omvårdnadsanteckning', sokord: [{ sokord: 'Sömn', text: `Sov gott, natt ${n}.` }] });
        journal.signera(atk, journal.hamtaAnteckningRad(atk.db, a.id));
      }
      return { antal: antal(), senasteBedomning: journal.listaAnteckningar(atk).senasteBedomning?.text ?? null };
    });
  });

  // Bara den som skriver i journalen har fraser och egen ordning.
  function kravPersonal(c) {
    const p = kravInloggad(c);
    // Runda 16, r3: också den som skriver med yrkets mallar (skriv_observation) eller under handledning (skriv_handledd).
    if (!['skriv_journal', 'skriv_omvardnad', 'skriv_observation', 'skriv_handledd'].some(h => require('./atkomst.js').kanRoll(p, h))) throw new Fel(403, 'Egna fraser finns för den som skriver i journalen.', 'nekad');
    return p;
  }
}
