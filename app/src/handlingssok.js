// Runda 18, r2: att hitta rätt. Sökrutan "Vad vill du göra?" tar emot egna ord, till exempel "sjukskriv", "skriv remiss",
// "ge dos" eller "boka tid", och svarar med de handlingar som passar. Ordlistan "Jag letar efter" kopplar ord som
// vårdpersonal använder i andra journalsystem och i vardagen till Vårdkällans namn och vy.
//
// Katalogen (KATALOG) är en post per handling med namn, ord att söka på, vart handlingen leder och vad den kräver av
// behörigheten. Vilka poster den inloggade får avgörs på servern: rollens handlingar i sessionen (atkomst.js, med
// delegering och handledning), och för en öppen patient behörighetsmotorns prova() för just den patienten. Matchningen
// tål stavfel, böjningar och sammansatta ord och använder inga externa tjänster.
//
// Fälten i en post:
//   id          unikt id, används av gränssnittet, klickbudgeten och ordlistan.
//   namn        vad handlingen heter i Vårdkällan.
//   vy          var den finns, i vanliga ord.
//   ord         ord och fraser som personalen kan skriva.
//   href        adressen för en handling utan patient.
//   mal         { flik, sub } för en handling i en patients journal. Adressen byggs med patientens id när patienten är
//               öppen; annars ber gränssnittet användaren öppna patienten först.
//   klicka      knappar som gränssnittet trycker på efter att vyn har öppnats, när handlingen bara öppnar ett formulär
//               eller en dialog. Aldrig något som sparar.
//   fokus       fältet som får fokus efter att vyn har öppnats.
//   kraver      handlingar (atkomst.js) som alla krävs.
//   nagon       handlingar där minst en krävs.
//   inte        handlingar som rollen inte får ha (till exempel ger läkaren doser från journalen och inte från listan).
//   session     ett villkor på sessionen (vårdenhet med intensivvård, operation och liknande).
//   journal     true när rollen ska läsa journalen (arbetslistan och inkorgen).
//   vem         vem som gör handlingen, när det inte följer av en yrkesroll.
//   vanlig      yrkesroller som ser posten när rutan öppnas utan fråga.
//   alder       [från, till] för patientens ålder när fliken bara finns för en del av patienterna.
import { ROLLER, prova, HANDLINGAR, UTAN_HANDLEDNING } from './atkomst.js';

// Rollerna som läser journalen, som i gränssnittets utanJournal (app.js).
export const UTAN_JOURNAL = new Set(['logggranskare', 'arkivarie', 'uppfoljning', 'kommun', 'verksamhetschef', 'ekonom', 'systemforvaltare', 'rehabkoordinator']);

const KL = ['lakare'];
const SSK = ['sjukskoterska', 'barnmorska'];
const VARD = ['lakare', 'sjukskoterska', 'barnmorska', 'underskoterska'];
const SKRIVA = ['skriv_journal', 'skriv_omvardnad', 'skriv_observation', 'skriv_handledd'];

export const KATALOG = [
  // Journalen för en öppen patient.
  { id: 'ny-anteckning', namn: 'Skriva en anteckning', vy: 'Ny anteckning i journalen', mal: { flik: 'journal', sub: 'ny' }, nagon: SKRIVA,
    ord: ['anteckning', 'ny anteckning', 'anteckna', 'dokumentera', 'journalföra', 'journalanteckning', 'skriva i journalen', 'daganteckning', 'omvårdnadsanteckning', 'notat', 'journaltext'],
    vanlig: [...VARD, 'fysioterapeut', 'arbetsterapeut', 'dietist', 'logoped', 'kurator', 'psykolog', 'lakarstudent', 'sjukskoterskestudent', 'barnmorskestudent'] },
  { id: 'diktera', namn: 'Diktera en anteckning', vy: 'Ny anteckning i journalen, med knappen Diktera', mal: { flik: 'journal', sub: 'ny' }, nagon: SKRIVA,
    ord: ['diktera', 'diktat', 'diktering', 'tala in', 'röst', 'röstinmatning'] },
  { id: 'epikris', namn: 'Skriva en epikris', vy: 'Epikrisen i journalen', mal: { flik: 'journal', sub: 'epikris' }, kraver: ['skriv_journal'],
    ord: ['epikris', 'utskrivningsanteckning', 'slutanteckning', 'sammanfattning vid utskrivning'] },
  { id: 'tobak', namn: 'Dokumentera tobaksvanor', vy: 'Mallen för tobaksvanor i journalen', mal: { flik: 'journal', sub: 'tobak' }, kraver: ['skriv_journal'],
    ord: ['tobak', 'tobaksvanor', 'rökning', 'snus', 'levnadsvanor'] },
  { id: 'oversikt', namn: 'Patientens översikt', vy: 'Första fliken i journalen', mal: { flik: 'oversikt' }, nagon: ['las_oversikt', 'las_admin'],
    ord: ['översikt', 'patientöversikt', 'journalöversikt', 'sammanfattning', 'vårdtillfälle', 'inskrivning', 'utskrivning', 'aktivt val'] },
  { id: 'las-journal', namn: 'Läsa journalen', vy: 'Fliken Journal', mal: { flik: 'journal' }, nagon: ['las_journal', 'las_omvardnad'],
    ord: ['läsa journalen', 'journal', 'anteckningar', 'tidigare anteckningar', 'journaltext'] },
  { id: 'sok-journal', namn: 'Söka i journalen', vy: 'Sökfältet bredvid flikarna i journalen', mal: { flik: 'oversikt' }, fokus: '#jsok-falt', kraver: ['las_oversikt'],
    ord: ['söka i journalen', 'sök i journalen', 'hitta i journalen', 'journalsök', 'leta i journalen'] },
  { id: 'ordinera', namn: 'Ordinera ett läkemedel', vy: 'Ordinera på fliken Läkemedel', mal: { flik: 'lakemedel', sub: 'ny' }, kraver: ['ordinera'],
    ord: ['ordinera', 'ordination', 'ny ordination', 'sätta in läkemedel', 'insätta', 'förskriva', 'skriva recept', 'recept', 'e-recept', 'ny medicin', 'läkemedel'], vanlig: KL },
  { id: 'andra-dos', namn: 'Ändra dos', vy: 'Ändra dos på läkemedlets rad under fliken Läkemedel', mal: { flik: 'lakemedel' }, kraver: ['ordinera'],
    ord: ['ändra dos', 'dosändring', 'öka dosen', 'minska dosen', 'justera dos', 'trappa ned', 'trappa upp', 'ny dos'], vanlig: KL },
  { id: 'satt-ut', namn: 'Sätta ut ett läkemedel', vy: 'Sätt ut på läkemedlets rad under fliken Läkemedel', mal: { flik: 'lakemedel' }, kraver: ['ordinera'],
    ord: ['sätta ut', 'sätt ut', 'utsättning', 'avsluta läkemedel', 'sluta med läkemedel', 'avsluta behandling'] },
  { id: 'lakemedelslista', namn: 'Läkemedelslistan', vy: 'Fliken Läkemedel', mal: { flik: 'lakemedel' }, kraver: ['las_lakemedel'],
    ord: ['läkemedelslista', 'medicinlista', 'mediciner', 'läkemedel', 'aktuella läkemedel', 'vidimera'], vanlig: ['farmaceut'] },
  { id: 'lakemedelsgenomgang', namn: 'Fördjupad läkemedelsgenomgång', vy: 'Fliken Läkemedel', mal: { flik: 'lakemedel' }, kraver: ['lakemedelsgenomgang'],
    ord: ['läkemedelsgenomgång', 'fördjupad läkemedelsgenomgång', 'genomgång av läkemedel', 'läkemedelsberättelse'], vanlig: ['farmaceut'] },
  { id: 'ge-dos-patient', namn: 'Ge en dos till patienten', vy: 'Ge på läkemedlets rad under fliken Läkemedel', mal: { flik: 'lakemedel' }, kraver: ['ordinera', 'ge_lakemedel'],
    ord: ['ge dos', 'ge läkemedel', 'administrera', 'ge medicin', 'given dos', 'vid behov'] },
  { id: 'matvarde', namn: 'Registrera ett mätvärde', vy: 'Registrera mätvärde under fliken Mätvärden. Blodtryck är förvalt', mal: { flik: 'matvarden', sub: 'ny' }, kraver: ['registrera_matvarde'],
    ord: ['mätvärde', 'registrera mätvärde', 'blodtryck', 'puls', 'vikt', 'längd', 'temperatur', 'temp', 'saturation', 'syremättnad', 'vitalparametrar', 'vitala parametrar', 'mäta', 'kontroller', 'andningsfrekvens'],
    vanlig: [...VARD, 'fysioterapeut'] },
  { id: 'news2', namn: 'Registrera en NEWS2-kontroll', vy: 'Registrera NEWS2-kontroll under fliken Mätvärden', mal: { flik: 'matvarden' }, klicka: ['[data-news2-ny]'], kraver: ['registrera_matvarde'],
    ord: ['news2', 'news', 'news-poäng', 'tidig varning', 'vitalparametrar'] },
  { id: 'matvarden', namn: 'Se mätvärden och kurvor', vy: 'Fliken Mätvärden', mal: { flik: 'matvarden' }, kraver: ['las_matvarden'],
    ord: ['mätvärden', 'kurva', 'kurvor', 'trend', 'blodtryckskurva'] },
  { id: 'prover', namn: 'Beställa prover', vy: 'Beställ prover under fliken Prover', mal: { flik: 'prover', sub: 'ny' }, nagon: ['bestalla_prov', 'bestalla_prov_uppdrag'],
    ord: ['beställa prover', 'beställ prov', 'provbeställning', 'labb', 'lab', 'blodprov', 'prover', 'analys', 'remiss till labb'], vanlig: KL },
  { id: 'kontroller', namn: 'Ordinera kontroller', vy: 'Kontroller under fliken Prover', mal: { flik: 'prover', sub: 'kontroller' }, kraver: ['ordinera_kontroll'],
    ord: ['ordinera kontroller', 'kontroller', 'kontroll var fjärde timme', 'övervakning'] },
  { id: 'provsvar', namn: 'Läsa provsvar', vy: 'Fliken Prover', mal: { flik: 'prover' }, kraver: ['las_prover'],
    ord: ['provsvar', 'labbsvar', 'svar på prover', 'analyssvar', 'resultat'] },
  { id: 'remiss', namn: 'Skicka en remiss', vy: 'Skicka remiss under fliken Remisser', mal: { flik: 'remisser', sub: 'ny' }, kraver: ['remittera'],
    ord: ['remiss', 'skriva remiss', 'skicka remiss', 'remittera', 'konsultation', 'konsultremiss', 'remiss till specialist'], vanlig: KL },
  { id: 'remiss-uppdrag', namn: 'Skriva en remiss på uppdrag', vy: 'Remiss på uppdrag under fliken Remisser', mal: { flik: 'remisser', sub: 'uppdrag' }, kraver: ['remittera_pa_uppdrag'],
    ord: ['remiss på uppdrag', 'skriva remiss', 'remiss', 'remittera'] },
  { id: 'remisser-patient', namn: 'Patientens remisser', vy: 'Fliken Remisser', mal: { flik: 'remisser' }, nagon: ['las_remiss', 'las_remiss_status'],
    ord: ['remissvar', 'remisser', 'remisstatus', 'svar på remiss'] },
  { id: 'eremiss', namn: 'Skicka en e-remiss till en annan vårdgivare', vy: 'Skicka e-remiss under fliken Remisser', mal: { flik: 'remisser' }, klicka: ['[data-eremiss]'], kraver: ['remittera'],
    ord: ['e-remiss', 'eremiss', 'remiss till annan vårdgivare', 'privat vårdgivare'] },
  { id: 'intyg', namn: 'Skriva ett intyg', vy: 'Fliken Intyg. Systemet föreslår intyget', mal: { flik: 'intyg' }, kraver: ['las_intyg'], nagon: ['skriv_intyg', 'utkast_intyg', 'intyg_graviditet', 'intyg_tfp'],
    ord: ['intyg', 'läkarintyg', 'skriva intyg', 'körkortsintyg', 'intyg till försäkringskassan', 'fk-intyg', 'graviditetsintyg'], vanlig: KL },
  { id: 'sjukskriv', namn: 'Sjukskriva', vy: 'Läkarintyg för sjukpenning under fliken Intyg', mal: { flik: 'intyg' }, kraver: ['las_intyg', 'skriv_intyg'],
    ord: ['sjukskriv', 'sjukskrivning', 'sjukskriva', 'sjukintyg', 'sjukpenning', 'läkarintyg för sjukpenning', 'fk-intyg'], vanlig: KL },
  { id: 'forlang-sjukskrivning', namn: 'Förlänga en sjukskrivning', vy: 'Förläng sjukskrivningen under fliken Sjukskrivning', mal: { flik: 'sjukskrivning' }, kraver: ['las_intyg', 'las_diagnoser', 'skriv_intyg'], alder: [16, 70],
    ord: ['förlänga sjukskrivning', 'förläng', 'sjukskrivning', 'sjukfall', 'fortsatt sjukskrivning'] },
  { id: 'aterbesok', namn: 'Planera ett återbesök', vy: 'Återbesök i översikten', mal: { flik: 'oversikt' }, klicka: ['[data-aterbesok]'], kraver: ['skriv_journal'],
    ord: ['återbesök', 'boka återbesök', 'ny tid', 'uppföljning', 'kalla tillbaka'] },
  { id: 'utskrift', namn: 'Skriva ut journalen', vy: 'Skriv ut i översikten. Systemet föreslår syftet och delarna', mal: { flik: 'oversikt' }, klicka: ['[data-utskrift]'], kraver: ['skriv_ut'],
    ord: ['skriva ut', 'utskrift', 'journalkopia', 'kopia av journalen', 'pdf', 'utlämnande'] },
  { id: 'overkanslighet', namn: 'Registrera en överkänslighet', vy: 'Uppmärksamhetsinformationen i patienthuvudet', mal: { flik: 'oversikt' }, klicka: ['.patientband .signal-um summary', '[data-ok-ny]'], kraver: ['registrera_overkanslighet'],
    ord: ['överkänslighet', 'allergi', 'läkemedelsallergi', 'registrera allergi', 'varning', 'uppmärksamhetsinformation', 'uppmärksamhetssignal', 'varningssymbol'] },
  { id: 'vaccinera', namn: 'Vaccinera', vy: 'Fliken Vaccinationer', mal: { flik: 'vaccinationer' }, kraver: ['las_oversikt', 'vaccinera'],
    ord: ['vaccinera', 'vaccination', 'vaccin', 'spruta', 'influensavaccin', 'vaccinationsprogram'] },
  { id: 'vardplan', namn: 'Vårdplan', vy: 'Fliken Planer', mal: { flik: 'planer' }, nagon: ['las_vardplan', 'samordna'],
    ord: ['vårdplan', 'omvårdnadsplan', 'samordnad planering', 'sip', 'planer', 'åtgärder'] },
  { id: 'logglista', namn: 'Vem har läst journalen', vy: 'Fliken Logglista', mal: { flik: 'logglista' }, nagon: ['las_oversikt', 'las_admin'],
    ord: ['logglista', 'vem har läst', 'loggutdrag', 'åtkomstlogg', 'logg'] },
  { id: 'identitet', namn: 'Patientens identitet', vy: 'Fliken Identitet', mal: { flik: 'identitet' }, nagon: ['las_oversikt', 'las_admin'],
    ord: ['identitet', 'personnummer', 'reservnummer', 'samordningsnummer', 'byta personnummer', 'dubblett'] },
  { id: 'bilder', namn: 'Bilder och foton', vy: 'Fliken Bilder', mal: { flik: 'bilder' }, nagon: ['las_journal', 'las_omvardnad'],
    ord: ['bild', 'bilder', 'foto', 'fotografera', 'sårfoto', 'sår', 'röntgenbild'] },

  // Utan patient.
  { id: 'arbetslista', namn: 'Arbetslistan', vy: 'Arbetslista i menyn', href: '#/arbetslista', journal: true,
    ord: ['arbetslista', 'patientlista', 'mina patienter', 'min lista', 'avdelningslista', 'avdelningsöversikt', 'patientöversikt', 'arbetsöversikt'] },
  { id: 'inkorg', namn: 'Inkorgen', vy: 'Inkorg i menyn', href: '#/inkorg', journal: true,
    ord: ['inkorg', 'att göra', 'att göra-lista', 'uppgifter', 'osignerat', 'signera', 'signera anteckningar', 'kvittera', 'kvittera svar', 'larm', 'händelser', 'bevakningar'], vanlig: [...VARD, 'farmaceut', 'fysioterapeut', 'arbetsterapeut', 'dietist', 'logoped', 'kurator', 'psykolog'] },
  { id: 'sok-patient', namn: 'Söka en patient', vy: 'Sök patient i menyn', href: '#/sok', kraver: ['sok'],
    ord: ['sök patient', 'söka patient', 'hitta patient', 'patientsök', 'personsök', 'slå upp patient', 'personnummer'], vanlig: [...VARD, 'vardadministrator', 'farmaceut', 'logggranskare', 'fysioterapeut', 'arbetsterapeut', 'dietist', 'logoped', 'kurator', 'psykolog'] },
  { id: 'nodatkomst', namn: 'Nödåtkomst', vy: 'Sök patient i menyn. Nödåtkomst finns när journalen inte går att öppna', href: '#/sok', kraver: ['nodatkomst'],
    ord: ['nödåtkomst', 'nödöppning', 'bryta förseglingen', 'akut åtkomst', 'nödläge', 'utan vårdrelation'] },
  { id: 'registrera-patient', namn: 'Registrera en ny patient', vy: 'Registrera ny patient under Sök patient', href: '#/sok', klicka: ['[data-ny-patient]'], kraver: ['registrera_patient'],
    ord: ['ny patient', 'registrera patient', 'okänd patient', 'reservnummer', 'patient utan personnummer', 'okänd identitet'], vanlig: ['vardadministrator'] },
  { id: 'ge-dos', namn: 'Ge en dos', vy: 'Läkemedel att ge i menyn', href: '#/administrering', kraver: ['ge_lakemedel'], inte: ['ordinera'],
    ord: ['ge dos', 'ge läkemedel', 'ge medicin', 'administrera', 'administrering', 'dela ut', 'läkemedelsrunda', 'medicinrunda', 'dosering', 'vid behov', 'läkemedel att ge'],
    vanlig: ['sjukskoterska', 'barnmorska', 'underskoterska'] },
  { id: 'provtagning', namn: 'Ta prover och kontroller', vy: 'Prover och kontroller i menyn', href: '#/provtagning', kraver: ['ta_prov'], inte: ['bestalla_prov'],
    ord: ['ta prov', 'provtagning', 'provtagningslista', 'provtagningsrunda', 'kontroller i dag', 'blodprov'], vanlig: ['sjukskoterska', 'underskoterska'] },
  { id: 'boka', namn: 'Boka en tid', vy: 'Dagens arbete i menyn. Boka på raden och välj en av tiderna som systemet föreslår', href: '#/idag', kraver: ['boka'],
    ord: ['boka', 'boka tid', 'bokning', 'boka om', 'avboka', 'kallelse', 'kalla', 'ny tid', 'tidsbokning'], vanlig: ['vardadministrator'] },
  { id: 'tidbok', namn: 'Tidboken', vy: 'Tidbok i menyn', href: '#/tidbok', kraver: ['las_tidbok'],
    ord: ['tidbok', 'tidboken', 'kalender', 'schema', 'mina tider', 'dagens tider', 'bokningar'], vanlig: ['vardadministrator'] },
  { id: 'vantelista', namn: 'Väntelistan', vy: 'Väntelista i menyn', href: '#/vantelista', kraver: ['vantelista'],
    ord: ['väntelista', 'kö', 'vårdgaranti', 'bevakningslista', 'planeringslista', 'väntande'], vanlig: ['vardadministrator'] },
  { id: 'incheckning', namn: 'Checka in en patient', vy: 'Incheckningsskärmen', href: '#/incheckning', kraver: ['checka_in'],
    ord: ['checka in', 'incheckning', 'ankomst', 'ankomstregistrering', 'patienten har kommit'], vanlig: ['vardadministrator'] },
  { id: 'kassa', namn: 'Kassan', vy: 'Kassa i menyn', href: '#/kassa', kraver: ['kassa'],
    ord: ['kassa', 'betalning', 'patientavgift', 'avgift', 'kvitto', 'ta betalt', 'dagsavslut'] },
  { id: 'delegeringar', namn: 'Delegeringar', vy: 'Delegeringar i menyn', href: '#/delegeringar', nagon: ['delegera'], yrken: ['underskoterska'],
    ord: ['delegering', 'delegera', 'delegeringar', 'delegeringsbeslut', 'min delegering'] },
  { id: 'remisser', namn: 'Remisser till och från vårdenheten', vy: 'Remisser i menyn', href: '#/remisser', nagon: ['las_remiss', 'las_remiss_status'],
    ord: ['remisser', 'inkommande remisser', 'utgående remisser', 'remissvar', 'remisskorg', 'bedöma remiss', 'fördela remiss'] },
  { id: 'vantrum', namn: 'Väntrummet på akuten', vy: 'Väntrum (akuten) i menyn', href: '#/vantrum', kraver: ['vantrum'],
    ord: ['väntrum', 'akuten', 'akuttavla', 'tavlan', 'akutliggare', 'liggaren', 'triage', 'prioritering'] },
  { id: 'sjukskrivningar', namn: 'Mina sjukskrivningar', vy: 'Sjukskrivningar i menyn', href: '#/sjukskrivningar', kraver: ['sjukfall_mina'],
    ord: ['mina sjukskrivningar', 'sjukskrivningar', 'sjukfall', 'pågående sjukskrivningar'] },
  { id: 'meddelanden', namn: 'Meddelanden från invånare', vy: 'Meddelanden i menyn', href: '#/meddelanden', kraver: ['meddelande_invanare'],
    ord: ['meddelanden', 'meddelande', 'e-tjänst', 'ärenden från patienter', 'förnya recept', 'receptförnyelse', 'invånare'] },
  { id: 'begaran', namn: 'Begäranden om spärr och loggutdrag', vy: 'Begäranden i menyn', href: '#/begaran', nagon: ['registrera_sparr', 'las_logg'],
    ord: ['spärr', 'spärra', 'begäran', 'loggutdrag', 'begäran om spärr'], vanlig: ['logggranskare'] },
  { id: 'logg', namn: 'Logguppföljning', vy: 'Logguppföljning i menyn', href: '#/logg', kraver: ['las_logg'],
    ord: ['logguppföljning', 'loggranskning', 'granska loggar', 'åtkomstlogg', 'logg'], vanlig: ['logggranskare'] },
  { id: 'avdelning', namn: 'Avdelningens planering', vy: 'Avdelningens planering från arbetslistan', href: '#/avdelning', kraver: ['las_planering'],
    ord: ['avdelningens planering', 'planering', 'dagens händelser', 'aktiviteter', 'uppgifter i dag'] },
  { id: 'lakemedelsstod', namn: 'Generella direktiv', vy: 'Direktiv och uppföljning i menyn', href: '#/lakemedelsstod', nagon: ['faststalla_direktiv', 'ordinera_direktiv'],
    ord: ['generella direktiv', 'direktiv', 'ordinera enligt direktiv', 'stående ordination'] },
  { id: 'iva', namn: 'Intensivvården', vy: 'Intensivvård i menyn', href: '#/iva', session: (s) => Boolean(s.iva), vem: 'personalen på en vårdenhet med intensivvårdsavdelning',
    ord: ['intensivvård', 'iva', 'övervakning', 'ventilator', 'monitor'] },
  { id: 'operation', namn: 'Operationsavdelningen', vy: 'Operation i menyn', href: '#/operation', session: (s) => Boolean(s.operation), vem: 'personalen på en vårdenhet som opererar',
    ord: ['operation', 'operera', 'operationsplanering', 'op', 'opsal', 'anestesi'] },
  { id: 'bhv', namn: 'Barnhälsovården', vy: 'Barnhälsovård i menyn', href: '#/bhv', session: (s) => Boolean(s.bhv), vem: 'personalen på en barnavårdscentral',
    ord: ['barnhälsovård', 'bvc', 'barnavårdscentral', 'tillväxtkurva'] },
  { id: 'modrahalsovard', namn: 'Mödrahälsovården', vy: 'Mödrahälsovård i menyn', href: '#/modrahalsovard', session: (s) => Boolean(s.obstetrik?.mhv), vem: 'personalen inom mödrahälsovården',
    ord: ['mödrahälsovård', 'mvc', 'graviditet', 'barnmorskemottagning'] },
  { id: 'forlossning', namn: 'Förlossningen', vy: 'Förlossningen i menyn', href: '#/forlossning', session: (s) => Boolean(s.obstetrik?.forlossning), vem: 'personalen på förlossningen',
    ord: ['förlossning', 'partogram', 'ctg', 'bb', 'förlossningsjournal'] },
  { id: 'cytostatika', namn: 'Cytostatika', vy: 'Cytostatika i menyn', href: '#/cytostatika', session: (s) => Boolean(s.r11r4?.cytostatika), vem: 'personalen på en vårdenhet som ger cytostatika',
    ord: ['cytostatika', 'cellgift', 'kur', 'regim', 'onkologi'] },
  { id: 'beredning', namn: 'Beredningen', vy: 'Beredning i menyn', href: '#/beredning', session: (s) => Boolean(s.r11r4?.beredning), vem: 'farmaceuten på beredningsenheten',
    ord: ['beredning', 'bereda', 'blanda', 'cytostatikaberedning'] },
  { id: 'utbildning', namn: 'Övningar och intyg', vy: 'Utbildning i menyn', href: '#/utbildning', kraver: ['utbildning'],
    ord: ['utbildning', 'övning', 'öva', 'lära mig', 'kurs', 'intyg om utbildning', 'övningsmiljö'] },
  { id: 'nyheter', namn: 'Nyheter i versionen', vy: 'Nyheter', href: '#/nyheter',
    ord: ['nyheter', 'vad är nytt', 'nytt i versionen', 'ändringar'] },
  { id: 'ordlista', namn: 'Jag letar efter', vy: 'Ordlistan med ord från andra journalsystem', href: '#/ordlista',
    ord: ['ordlista', 'jag letar efter', 'hitta', 'vad heter', 'var finns', 'hjälp'] },
  { id: 'flerfaktor', namn: 'Inloggning och flerfaktor', vy: 'Flerfaktor i sidhuvudet', href: '#/flerfaktor',
    ord: ['flerfaktor', 'tvåfaktor', 'passkey', 'säkerhetsnyckel', 'engångskod', 'inloggning'] },
  { id: 'reservkod', namn: 'Reservkod för läsning vid avbrott', vy: 'Reservkod i sidhuvudet', href: null, klicka: ['[data-a="reservkod"]'], journal: true,
    ord: ['reservkod', 'avbrott', 'reservrutin', 'driftstopp', 'avbrottsrutin', 'systemet är nere', 'läsläge'] },
  { id: 'regler', namn: 'Regler och parametrar', vy: 'Regler och parametrar i menyn', href: '#/regler', kraver: ['konfigurera'],
    ord: ['regler', 'parametrar', 'inställningar', 'konfigurera', 'konfiguration'], vanlig: ['systemforvaltare'] },
  { id: 'kodverk', namn: 'Kodverk och masterdata', vy: 'Kodverk och masterdata i menyn', href: '#/kodverk', kraver: ['konfigurera'],
    ord: ['kodverk', 'masterdata', 'icd', 'kvå', 'snomed', 'koder'], vanlig: ['systemforvaltare'] },
  { id: 'mallar', namn: 'Mallar och mätvärdestyper', vy: 'Mallar och mätvärdestyper i menyn', href: '#/struktur', kraver: ['konfigurera'],
    ord: ['mallar', 'journalmall', 'sökord', 'mätvärdestyp', 'ny mall'], vanlig: ['systemforvaltare'] },
  { id: 'formular', namn: 'Formulär', vy: 'Formulär i menyn', href: '#/formular', kraver: ['konfigurera'],
    ord: ['formulär', 'bygga formulär', 'blankett', 'skattningsskala'], vanlig: ['systemforvaltare'] },
  { id: 'lagring', namn: 'Lagring', vy: 'Lagring i menyn', href: '#/lagring', kraver: ['lagring'],
    ord: ['lagring', 'säkerhetskopia', 'backup', 'diskutrymme'], vanlig: ['systemforvaltare'] },
  { id: 'ekonomi', namn: 'Faktureringsunderlag', vy: 'Faktureringsunderlag i menyn', href: '#/ekonomi', kraver: ['faktureringsunderlag'],
    ord: ['faktureringsunderlag', 'fakturering', 'faktura', 'debitering', 'ekonomi'], vanlig: ['ekonom'] },
  { id: 'prislistor', namn: 'Prislistor', vy: 'Prislistor i menyn', href: '#/prislistor', kraver: ['prislista'],
    ord: ['prislista', 'prislistor', 'priser', 'taxa', 'avgifter'], vanlig: ['ekonom'] },
  { id: 'arkiv', namn: 'E-arkiv och gallring', vy: 'E-arkiv och gallring i menyn', href: '#/arkiv', nagon: ['registrera_arkivbeslut', 'godkanna_gallring'],
    ord: ['arkiv', 'e-arkiv', 'gallra', 'gallring', 'radera', 'arkivering'], vanlig: ['arkivarie', 'verksamhetschef'] },
  { id: 'datauttag', namn: 'Datauttag', vy: 'Datauttag i menyn', href: '#/datauttag', kraver: ['datauttag'],
    ord: ['datauttag', 'uttag', 'statistikuttag', 'export'], vanlig: ['uppfoljning'] },
  { id: 'analys', namn: 'Analys och statistik', vy: 'Analys och statistik i menyn', href: '#/analys', nagon: ['patientgrupp', 'statistik', 'statistik_region'],
    ord: ['analys', 'statistik', 'patientgrupp', 'rapport', 'uppföljning', 'ledtider'], vanlig: ['uppfoljning'] },
  { id: 'lakemedelsansvar', namn: 'Läkemedelsansvar', vy: 'Läkemedelsansvar i menyn', href: '#/lakemedelsansvar', kraver: ['lakemedelsansvar'],
    ord: ['läkemedelsansvar', 'läkemedelsansvarig', 'uppdrag', 'utse'], vanlig: ['verksamhetschef'] },
  { id: 'signeringslista', namn: 'Signeringslista', vy: 'Signeringslista i menyn', href: '#/signeringslista', kraver: ['signeringslista'],
    ord: ['signeringslista', 'signaturer', 'vem har signerat'], vanlig: ['verksamhetschef'] },
  { id: 'rehabkoordinator', namn: 'Sjukfall och REKO-status', vy: 'Sjukfall i menyn', href: '#/rehabkoordinator', kraver: ['sjukfall_reko'],
    ord: ['reko', 'rehabkoordinering', 'koordineringsinsats', 'sjukfall', 'rehabkoordinator'], vanlig: ['rehabkoordinator'] },
  { id: 'sjukskrivningar-enhet', namn: 'Sjukskrivningar på vårdenheten', vy: 'Sjukskrivningar på vårdenheten i menyn', href: '#/sjukskrivningar/enhet', kraver: ['sjukfall_enhet'],
    ord: ['sjukskrivningar på vårdenheten', 'sjukskrivningar', 'sjukfall', 'långa sjukskrivningar'], vanlig: ['verksamhetschef'] },
  { id: 'flyttar', namn: 'Flyttar till rätt patient', vy: 'Flyttar till rätt patient i menyn', href: '#/flyttar', kraver: ['godkanna_flytt'],
    ord: ['flytta', 'flytt', 'fel patient', 'feljournalföring', 'flytta anteckning', 'godkänna flytt'] },
  { id: 'samverkan', namn: 'Samordnad planering med kommunen', vy: 'Samverkan i menyn', href: '#/samverkan', kraver: ['samverkan'],
    ord: ['samverkan', 'samordnad planering', 'utskrivningsklar', 'kommunen', 'biståndsbeslut', 'hemtjänst'], vanlig: ['kommun'] },
];

// Ord som vårdpersonal använder i andra journalsystem och i vardagen. Formuleringen beskriver bara var funktionen finns
// här, utan jämförelser i sak och utan namn på andra system. handling är id i KATALOG, så att länken följer behörigheten.
export const ORDLISTA = [
  { ord: ['läkemedelskurva', 'kurvan', 'läkemedelsutdelning', 'utdelningslista', 'medicinrunda'], heter: 'Läkemedel att ge', handling: 'ge-dos', forklaring: 'Dagens doser för vårdenhetens patienter i tidsordning, med Ge på varje dos.' },
  { ord: ['medicinlista', 'läkemedelsmodul', 'läkemedelsjournal'], heter: 'Fliken Läkemedel', handling: 'lakemedelslista', forklaring: 'Patientens läkemedelslista med ordinationer, dosändringar och utsättningar.' },
  { ord: ['ordinationsverktyg', 'läkemedelsordination', 'receptförskrivning'], heter: 'Ordinera', handling: 'ordinera', forklaring: 'Knappen Ordinera i översikten och under fliken Läkemedel.' },
  { ord: ['patientöversikt', 'journalöversikt', 'sammanfattning', 'patientsammanfattning'], heter: 'Översikten', handling: 'oversikt', forklaring: 'Första fliken när en patient öppnas: läkemedel, diagnoser, mätvärden och de senaste anteckningarna.' },
  { ord: ['arbetsöversikt', 'avdelningsöversikt', 'patientlista', 'min lista'], heter: 'Arbetslista', handling: 'arbetslista', forklaring: 'Patienterna med vårdrelation på din vårdenhet.' },
  { ord: ['att göra-lista', 'uppgiftslista', 'osignerat', 'signeringskorg', 'händelselista'], heter: 'Inkorg', handling: 'inkorg', forklaring: 'Det som väntar på dig: osignerade anteckningar, svar att kvittera, larm och påminnelser.' },
  { ord: ['vitalparametrar', 'vitala parametrar', 'parametrar', 'vitalkurva'], heter: 'Mätvärden', handling: 'matvarde', forklaring: 'Registrera mätvärde under fliken Mätvärden. Blodtryck är förvalt, och NEWS2 räknas av systemet.' },
  { ord: ['tidig varning', 'varningspoäng'], heter: 'NEWS2-kontroll', handling: 'news2', forklaring: 'Registrera NEWS2-kontroll under fliken Mätvärden.' },
  { ord: ['labb', 'lab', 'labbsvar', 'kemsvar', 'analyssvar'], heter: 'Prover', handling: 'provsvar', forklaring: 'Fliken Prover med beställningar, provtagning och svar.' },
  { ord: ['provbeställning', 'labbremiss', 'analysbeställning'], heter: 'Beställ prover', handling: 'prover', forklaring: 'Beställ prover i översikten eller under fliken Prover.' },
  { ord: ['provtagningslista', 'provtagningsrunda', 'rörlista'], heter: 'Prover och kontroller', handling: 'provtagning', forklaring: 'Rören att ta och kontrollerna i dag för vårdenhetens patienter.' },
  { ord: ['konsultremiss', 'konsultation', 'remisskorg'], heter: 'Remisser', handling: 'remiss', forklaring: 'Skicka remiss i översikten eller under fliken Remisser.' },
  { ord: ['notat', 'journaltext', 'journalföring', 'dagsanteckning'], heter: 'Ny anteckning', handling: 'ny-anteckning', forklaring: 'Ny anteckning i översikten. Mallen väljs efter situationen och kan bytas.' },
  { ord: ['diktering', 'diktat', 'röststyrning', 'taligenkänning'], heter: 'Diktera', handling: 'diktera', forklaring: 'Knappen Diktera i en ny anteckning.' },
  { ord: ['utskrivningsanteckning', 'slutanteckning'], heter: 'Epikris', handling: 'epikris', forklaring: 'Skriv epikris vid vårdtillfället. Systemet skriver orsaken till vården ur vårdtillfället och diagnoserna.' },
  { ord: ['sjukintyg', 'fk-intyg', 'sjukpenningintyg'], heter: 'Läkarintyg för sjukpenning', handling: 'sjukskriv', forklaring: 'Fliken Intyg, där systemet föreslår intyget, och fliken Sjukskrivning för att förlänga.' },
  { ord: ['intygsmodul', 'intygstjänst'], heter: 'Intyg', handling: 'intyg', forklaring: 'Fliken Intyg i journalen.' },
  { ord: ['bokningsunderlag', 'bokningskalender', 'mottagningslista'], heter: 'Tidbok', handling: 'tidbok', forklaring: 'Tidbok i menyn, med ditt eget schema förvalt.' },
  { ord: ['tidsbokning', 'bokningsöversikt'], heter: 'Dagens arbete', handling: 'boka', forklaring: 'Remisser som väntar på tid, med förslag på tider.' },
  { ord: ['kö', 'bevakningslista', 'planeringslista', 'väntelistan'], heter: 'Väntelista', handling: 'vantelista', forklaring: 'Patienter som väntar på tid, med dagar kvar mot vårdgarantin.' },
  { ord: ['akuttavla', 'tavlan', 'akutliggare', 'liggaren', 'spårningstavla'], heter: 'Väntrum (akuten)', handling: 'vantrum', forklaring: 'Akutens patienter med prioritet och väntetid.' },
  { ord: ['nödöppning', 'bryta förseglingen', 'nödläge'], heter: 'Nödåtkomst', handling: 'nodatkomst', forklaring: 'Under Sök patient, när journalen inte går att öppna på vanligt sätt. Syftet krävs och åtkomsten granskas.' },
  { ord: ['sammanhållen journalföring', 'andra vårdgivare', 'andra vårdenheter', 'inre sekretess'], heter: 'Aktivt val', handling: 'oversikt', forklaring: 'Knappen i raden under patienthuvudet när det finns uppgifter från andra vårdenheter.' },
  { ord: ['varningssymbol', 'uppmärksamhetssignal', 'varningar', 'allergi'], heter: 'Uppmärksamhetsinformation', handling: 'overkanslighet', forklaring: 'Symbolen i patienthuvudet med överkänslighet och annat som alla ska se.' },
  { ord: ['loggutdrag', 'vem har läst', 'åtkomstlogg'], heter: 'Logglista', handling: 'logglista', forklaring: 'Fliken Logglista i journalen.' },
  { ord: ['journalkopia', 'utlämnande', 'kopia av journal'], heter: 'Skriv ut', handling: 'utskrift', forklaring: 'Skriv ut i översikten. Systemet föreslår syftet och delarna.' },
  { ord: ['inskrivning', 'utskrivning', 'intagning', 'vårdtillfälle'], heter: 'Vårdtillfället i översikten', handling: 'oversikt', forklaring: 'Läkare och sjuksköterskor skriver in, flyttar och skriver ut patienten från översikten.' },
  { ord: ['patientsök', 'personsök', 'slå upp'], heter: 'Sök patient', handling: 'sok-patient', forklaring: 'Sök på namn eller personnummer i valfritt format.' },
  { ord: ['reservrutin', 'driftstopp', 'avbrottsrutin'], heter: 'Reservkod', handling: 'reservkod', forklaring: 'Reservkoden i sidhuvudet gör att du kan läsa dina patienters journaler på datorn vid ett avbrott.' },
  { ord: ['delegeringslista', 'delegeringsbeslut'], heter: 'Delegeringar', handling: 'delegeringar', forklaring: 'Delegeringar i menyn för den som delegerar, och den egna delegeringen för undersköterskan.' },
  { ord: ['e-tjänst', 'invånarärenden', 'ärenden från patienter', 'receptförnyelse'], heter: 'Meddelanden', handling: 'meddelanden', forklaring: 'Meddelanden och begäranden från invånare till vårdenheten.' },
  { ord: ['patientavgift', 'kvitto', 'betalning'], heter: 'Kassa', handling: 'kassa', forklaring: 'Kassan för vårdadministratören, med dagsavslut.' },
  { ord: ['e-learning', 'övningsmiljö', 'kurs'], heter: 'Utbildning', handling: 'utbildning', forklaring: 'Övningar för din roll och intyg med giltighetstid.' },
  { ord: ['versionsnyheter', 'vad är nytt'], heter: 'Nyheter', handling: 'nyheter', forklaring: 'Det som är nytt för din roll i den här versionen.' },
  { ord: ['vaccinationsmodul', 'vaccinationsjournal'], heter: 'Vaccinationer', handling: 'vaccinera', forklaring: 'Fliken Vaccinationer i journalen.' },
  { ord: ['omvårdnadsplan', 'sip', 'samordnad individuell plan'], heter: 'Planer', handling: 'vardplan', forklaring: 'Fliken Planer med vårdplaner och samordnad planering.' },
];

// Namn på andra journalsystem och nationella tjänster som inte ska stå i ordlistan. Används av testerna.
export const FORBJUDNA_NAMN = ['Cosmic', 'Cambio', 'Melior', 'TakeCare', 'Take Care', 'PMO', 'NCS', 'Obstetrix', 'Epic', 'Millennium', 'Journal III', 'ProReNata', 'Treserva', 'Lifecare',
  'Webcert', 'Pascal', 'NPÖ', 'Rehabstöd', 'Inera', '1177', 'Procapita', 'Medidoc', 'Profdoc', 'Asynja', 'Orbit', 'Cosmic Link'];

// Utfyllnadsord som inte säger något om handlingen.
const STOPP = new Set(['jag', 'vill', 'ska', 'skulle', 'kan', 'kunna', 'en', 'ett', 'att', 'pa', 'for', 'till', 'om', 'i', 'och', 'den', 'det', 'de', 'min', 'mitt', 'mina',
  'av', 'med', 'som', 'var', 'hur', 'gor', 'man', 'nagot', 'nagon', 'patienten', 'patientens', 'har', 'behover', 'mig', 'du', 'nu', 'idag', 'gora', 'hjalp', 'tack', 'snalla', 'vad']);

// Gemener, å, ä och ö som a, a och o, och bara bokstäver och siffror. Ord med en bokstav tas bort.
export function normalisera(text) {
  return String(text ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(o => o.length > 1);
}

// Svenska böjningsändelser, längst först. Stammen blir minst tre tecken, och ett andra varv (minst fyra tecken) gör att
// remisserna och remiss får en gemensam stam.
const ANDELSER = ['ningarna', 'ningar', 'ningen', 'erna', 'arna', 'orna', 'ning', 'ande', 'ade', 'are', 'ar', 'er', 'or', 'en', 'et', 'na', 'a', 'e', 'n', 's', 't'];
const ettVarv = (o, minst) => { for (const a of ANDELSER) if (o.length - a.length >= minst && o.endsWith(a)) return o.slice(0, -a.length); return o; };
export const stam = (o) => ettVarv(o, 3);
// Stammen efter ett och två varv. Två ord har samma stam när någon av dem är lika.
const stammar = (o) => { const a = ettVarv(o, 3); return [a, ettVarv(a, 4)]; };

// Damerau-Levenshtein med en gräns, så att jämförelsen avbryts när avståndet blir för stort.
function avstand(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let radMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const k = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + k);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      radMin = Math.min(radMin, d[i][j]);
    }
    if (radMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

// Hur väl ordet q i frågan stämmer med ordet t i en post: 0 är ingen likhet och 3 är samma ord. Ett längre gemensamt
// ord väger tyngre, så att läkemedelskurvan går före läkemedel.
export function likhet(q, t) {
  if (q === t) return 3;
  if (q.length <= 2 || t.length <= 2) return 0;
  const [sq, sq2] = stammar(q);
  const [st, st2] = stammar(t);
  if (sq === st || sq === st2 || sq2 === st || sq2 === st2) return 2.8;
  // Användaren skriver fortfarande, eller skriver en kortare form (sjukskriv, remiss).
  if (q.length >= 3 && t.startsWith(q)) return 2 + 0.5 * (q.length / t.length);
  if (t.length >= 4 && q.startsWith(t)) return 1.5 + 0.7 * (t.length / q.length);
  // Sammansatta ord: intyg i läkarintyg, remiss i konsultremiss.
  if (q.length >= 4 && t.endsWith(q)) return 1.5 + 0.5 * (q.length / t.length);
  if (t.length >= 4 && q.endsWith(t)) return 1.3 + 0.5 * (t.length / q.length);
  // Stavfel: en bokstav fel, saknad, för mycket eller omkastad, två i längre ord.
  const kortast = Math.min(sq.length, st.length);
  const max = kortast >= 7 ? 2 : kortast >= 4 ? 1 : 0;
  if (max && avstand(sq, st, max) <= max) return 1.5;
  if (q.length >= 4 && avstand(q, t, 1) <= 1) return 1.5;
  if (q.length >= 6 && t.length >= 6 && avstand(q, t, 2) <= 2) return 1.3;
  // Stavfel medan ordet skrivs: jämför med början av ordet i posten.
  if (q.length >= 5 && t.length > q.length && avstand(q, t.slice(0, q.length), 1) <= 1) return 1.2;
  return 0;
}

// Orden i en post, en gång, med var de kommer ifrån. Ordlistans ord märks så att svaret kan säga vad ordet heter här.
const ORDLISTA_FOR = new Map();
for (const o of ORDLISTA) {
  if (!ORDLISTA_FOR.has(o.handling)) ORDLISTA_FOR.set(o.handling, []);
  ORDLISTA_FOR.get(o.handling).push(o);
}
const fraserCache = new WeakMap();
function fraser(post) {
  let f = fraserCache.get(post);
  if (f) return f;
  f = [{ ord: normalisera(post.namn), text: post.namn, via: null }, ...(post.ord ?? []).map(t => ({ ord: normalisera(t), text: t, via: null }))];
  for (const o of ORDLISTA_FOR.get(post.id) ?? []) for (const t of o.ord) f.push({ ord: normalisera(t), text: t, via: o });
  fraserCache.set(post, f);
  return f;
}

// Poängen för en post: summan av det bästa ordet för varje ord i frågan. Alla ord i frågan med minst tre tecken måste
// stämma med något i posten. En fras i posten som frågan täcker helt ger extra poäng, så att "ge dos" går före "ändra
// dos" och remmis går före en post där remiss bara är ett av flera ord.
function poang(fragaOrd, post) {
  const f = fraser(post);
  let summa = 0;
  let via = null;
  let viaPoang = 0;
  for (const q of fragaOrd) {
    let basta = 0;
    let bastaVia = null;
    for (const fr of f) for (const t of fr.ord) {
      const l = likhet(q, t);
      if (l > basta || (l === basta && bastaVia && !fr.via)) { basta = l; bastaVia = fr.via; }
    }
    if (!basta && q.length >= 3) return { poang: 0 };
    summa += basta;
    if (bastaVia && basta > viaPoang) { via = bastaVia; viaPoang = basta; }
    if (!bastaVia && basta >= viaPoang) { via = null; viaPoang = basta; }
  }
  let bonus = 0;
  let bonusVia = null;
  for (const fr of f) {
    const p = fr.ord.filter(o => !STOPP.has(o));
    if (!p.length) continue;
    const per = p.map(t => Math.max(...fragaOrd.map(q => likhet(q, t))));
    if (per.some(x => x === 0)) {
      // Frågan med flera ord är början av frasen.
      if (fragaOrd.length > 1 && p.length > fragaOrd.length && per.slice(0, fragaOrd.length).every(x => x > 0)) {
        const b = per.slice(0, fragaOrd.length).reduce((a, x) => a + x, 0) / fragaOrd.length / 2;
        if (b > bonus) { bonus = b; bonusVia = fr.via; }
      }
      continue;
    }
    if (p.length !== fragaOrd.length) continue;
    const b = per.reduce((a, x) => a + x, 0) / p.length;
    if (b > bonus || (b === bonus && bonusVia && !fr.via)) { bonus = b; bonusVia = fr.via; }
  }
  if (bonus) via = bonusVia ?? (viaPoang > bonus ? via : null);
  return { poang: summa + bonus, via };
}

// Matchar frågan mot posterna. Svarar med de poster som stämmer, bäst först, och för ett ord ur ordlistan vad det heter
// här. Poster med mindre än hälften av den bästa poängen tas inte med.
export function matcha(fraga, poster) {
  const ord = normalisera(fraga).filter(o => !STOPP.has(o));
  if (!ord.length) return [];
  const traffar = [];
  poster.forEach((post, ordning) => {
    const p = poang(ord, post);
    if (p.poang > 0) traffar.push({ post, poang: p.poang, ordning, via: p.via ? `Det du kallar ${p.via.ord.find(o => normalisera(o).some(x => ord.some(q => likhet(q, x) > 0))) ?? p.via.ord[0]} heter ${p.via.heter} här.` : null });
  });
  if (!traffar.length) return [];
  const basta = Math.max(...traffar.map(t => t.poang));
  return traffar.filter(t => t.poang >= basta / 2).sort((a, b) => b.poang - a.poang || a.ordning - b.ordning);
}

// Rollens namn med obestämd artikel, för "Det gör en läkare".
const ROLLNAMN = {
  lakare: 'en läkare', sjukskoterska: 'en sjuksköterska', barnmorska: 'en barnmorska', underskoterska: 'en undersköterska', vardadministrator: 'en vårdadministratör',
  farmaceut: 'en farmaceut', fysioterapeut: 'en fysioterapeut', arbetsterapeut: 'en arbetsterapeut', dietist: 'en dietist', logoped: 'en logoped', kurator: 'en kurator',
  psykolog: 'en psykolog', verksamhetschef: 'verksamhetschefen', systemforvaltare: 'en systemförvaltare', ekonom: 'en ekonom', arkivarie: 'en arkivarie',
  logggranskare: 'en logggranskare', uppfoljning: 'en analytiker för uppföljning', rehabkoordinator: 'en rehabkoordinator',
};
// Rollens namn i bestämd form utan artikel, för "din roll som sjuksköterska".
const ROLL_KORT = Object.fromEntries(Object.entries(ROLLNAMN).map(([k, v]) => [k, v.replace(/^en /, '').replace(/^verksamhetschefen$/, 'verksamhetschef')]));

const uppfyller = (post, har) => (post.kraver ?? []).every(har) && (!post.nagon || post.nagon.some(har) || (post.yrken ?? []).some(y => har(`yrke:${y}`)))
  && !(post.inte ?? []).some(har);

// Om rollen (yrket) i sig kan göra handlingen, utan hänsyn till sessionen.
function yrketKan(post, yrke) {
  if (post.session) return false;
  if (post.journal && UTAN_JOURNAL.has(yrke)) return false;
  const lista = ROLLER[yrke] ?? [];
  return uppfyller(post, (h) => (h.startsWith('yrke:') ? h === `yrke:${yrke}` : lista.includes(h)));
}

// Om den inloggade får posten just nu. sess är sessionens svar (server.js sessionUt) med behörigheterna efter
// delegering och handledning.
function sessionenKan(post, sess) {
  const yrke = sess.personal?.yrke;
  if (post.journal && UTAN_JOURNAL.has(yrke)) return false;
  if (post.mal && UTAN_JOURNAL.has(yrke)) return false;
  if (post.session && !post.session(sess)) return false;
  const beh = new Set(sess.behorigheter ?? []);
  return uppfyller(post, (h) => (h.startsWith('yrke:') ? h === `yrke:${yrke}` : beh.has(h)));
}

const eller = (l) => (l.length <= 1 ? l.join('') : `${l.slice(0, -1).join(', ')} eller ${l.at(-1)}`);

// Varför den inloggade inte får en handling, utan patientuppgifter.
function saknasText(post, sess) {
  const yrke = sess.personal?.yrke;
  const egen = ROLL_KORT[yrke] ? `din roll som ${ROLL_KORT[yrke]}` : 'din roll';
  // Rollen har handlingen men inte nu: undersköterskan utan giltig delegering, studenten utan handledning.
  if (yrketKan(post, yrke)) {
    if (sess.handledning?.student && !sess.handledning.pagar) return UTAN_HANDLEDNING;
    if ((post.kraver ?? []).includes('ge_lakemedel')) return 'Att ge läkemedel kräver en giltig delegering i dag. Delegeringen registreras av en sjuksköterska eller läkare, och din delegering står under Delegeringar.';
    return `${post.namn} ingår i ${egen}, men inte på din vårdenhet just nu.`;
  }
  if (post.vem) return `${post.namn} görs av ${post.vem}. Det ingår inte i ${egen}.`;
  const vem = Object.keys(ROLLNAMN).filter(y => y !== yrke && yrketKan(post, y)).map(y => ROLLNAMN[y]);
  if (!vem.length) return null;
  return `${post.namn} görs av ${eller(vem.slice(0, 3))}. Det ingår inte i ${egen}.`;
}

const patientHref = (pid, mal) => `#/patient/${encodeURIComponent(pid)}${mal.flik === 'oversikt' && !mal.sub ? '' : `/${mal.flik}`}${mal.sub ? `/${mal.sub}` : ''}`;

// En post som svar. Adressen till en flik i journalen byggs bara när patienten är öppen och får ses.
function ut(post, { pid = null, via = null, forklaring = null } = {}) {
  const r = { id: post.id, namn: post.namn, vy: post.vy, kraverPatient: Boolean(post.mal), href: post.mal ? (pid ? patientHref(pid, post.mal) : null) : post.href ?? null };
  if (post.mal) r.mal = { ...post.mal };
  if (post.klicka) r.klicka = [...post.klicka];
  if (post.fokus) r.fokus = post.fokus;
  if (via) r.via = via;
  if (forklaring) r.forklaring = forklaring;
  return r;
}

export const MAX_FRAGA = 80;
const MAX_TRAFFAR = 8;
const MAX_SAKNAS = 3;

// Sökningen för den inloggade. patient är den patient som är öppen i gränssnittet. Den räknas bara när den har öppnats i
// sessionen (oppnade) och behörighetsmotorn tillåter att patientens översikt läses. Annars blir svaret detsamma som
// utan patient, så att inget röjer om patienten finns eller får ses.
//   sess      sessionens svar (sessionUt) för den inloggade.
//   personal  raden ur personal.
//   val       de aktiva valen för patienten (valFor).
//   patient   { id, fodd } för en öppnad patient, annars null.
export function sok(db, { sess, personal, val = {}, patient = null, fraga = '', nu = new Date() }) {
  const text = String(fraga ?? '').trim();
  let pid = null;
  let alder = null;
  if (patient) {
    const las = ['las_oversikt', 'las_admin'].find(h => (ROLLER[personal.yrke] ?? []).includes(h));
    if (las && prova(db, { personal, patient: patient.id, handling: las, val, nu }).tillaten) {
      pid = patient.id;
      alder = patient.fodd ? Math.floor((nu - new Date(patient.fodd)) / (365.2425 * 86400_000)) : null;
    }
  }
  // Får den inloggade handlingen för den öppna patienten? Varje krävd handling prövas i behörighetsmotorn.
  const forPatient = (post) => {
    if (!post.mal || !pid) return { ok: true };
    const har = (h) => (h.startsWith('yrke:') ? h === `yrke:${personal.yrke}` : prova(db, { personal, patient: pid, handling: h, val, nu }).tillaten || ['utbildning'].includes(h));
    if (!uppfyller(post, har)) return { ok: false, text: `${post.namn} går inte för den här patienten med din behörighet.` };
    if (post.alder && alder != null && (alder < post.alder[0] || alder >= post.alder[1])) return { ok: false, text: `${post.namn} gäller patienter från ${post.alder[0]} till ${post.alder[1] - 1} år.` };
    return { ok: true };
  };
  const tillatna = KATALOG.filter(p => sessionenKan(p, sess));
  const svar = { fraga: text, patient: Boolean(pid), traffar: [], saknas: [], vanliga: false };

  if (!normalisera(text).filter(o => !STOPP.has(o)).length) {
    // Utan fråga: det vanligaste för rollen, och med en öppen patient det som rör patienten först.
    const yrke = personal.yrke;
    const vanliga = tillatna.filter(p => (p.vanlig ?? []).includes(yrke));
    const lista = (vanliga.length ? vanliga : tillatna).filter(p => !pid || forPatient(p).ok);
    const ordnad = pid ? [...lista.filter(p => p.mal), ...lista.filter(p => !p.mal)] : lista;
    svar.vanliga = true;
    svar.traffar = ordnad.slice(0, 6).map(p => ut(p, { pid }));
    return svar;
  }

  const traffar = matcha(text, tillatna);
  for (const t of traffar.slice(0, MAX_TRAFFAR)) {
    const fp = forPatient(t.post);
    svar.traffar.push(ut(t.post, { pid: fp.ok ? pid : null, via: t.via, forklaring: fp.ok ? null : fp.text }));
    if (!fp.ok) svar.traffar.at(-1).href = null;
  }
  svar.vanliga = false;

  // Handlingar som andra roller gör och som stämmer bättre än det bästa rollen får.
  const alla = matcha(text, KATALOG);
  const basta = traffar[0]?.poang ?? 0;
  const tillatnaId = new Set(tillatna.map(p => p.id));
  for (const t of alla) {
    if (svar.saknas.length >= MAX_SAKNAS) break;
    // Bara när det rollen får passar sämre, så att en lika bra träff inte får en rad om en annan roll.
    if (tillatnaId.has(t.post.id) || (traffar.length ? t.poang <= basta : false)) continue;
    const s = saknasText(t.post, sess);
    if (s) svar.saknas.push({ id: t.post.id, namn: t.post.namn, text: s });
  }

  // Ett nummer, ett namn eller ett ord som inte är en handling: sök patienten, eller sök i den öppna journalen.
  const beh = new Set(sess.behorigheter ?? []);
  const nummer = /\d{6}/.test(text.replace(/[\s-]/g, ''));
  const lag = (!traffar.length && !svar.saknas.length) || nummer;
  const extra = [];
  if (lag && beh.has('sok') && text.length >= 2) extra.push({ id: 'sok-patient-fraga', namn: `Sök patient: ${text}`, vy: 'Sök patient i menyn', kraverPatient: false, href: `#/sok?q=${encodeURIComponent(text)}` });
  if (lag && pid && !nummer && beh.has('las_oversikt') && text.length >= 2) extra.push({ id: 'sok-journal-fraga', namn: `Sök i journalen: ${text}`, vy: 'Sökträffar i patientens journal', kraverPatient: true, href: `${patientHref(pid, { flik: 'sok' })}?q=${encodeURIComponent(text)}` });
  svar.traffar = nummer ? [...extra, ...svar.traffar] : [...svar.traffar, ...extra];

  if (!svar.traffar.length) {
    svar.inget = svar.saknas.length
      ? 'Menade du något annat, pröva andra ord eller öppna Jag letar efter.'
      : 'Inget passar de orden. Pröva ett annat ord, till exempel ett verb som skriva, boka eller ge, eller öppna Jag letar efter för ord som vårdpersonal använder.';
  }
  return svar;
}

// Ordlistan för sidan Jag letar efter. En länk finns bara för den inloggade personalen när rollen får handlingen och
// den inte kräver en patient.
export function ordlista(sess) {
  return {
    poster: ORDLISTA.map(o => {
      const post = KATALOG.find(k => k.id === o.handling);
      const far = Boolean(sess?.personal && post && sessionenKan(post, sess));
      return { ord: [...o.ord], heter: o.heter, forklaring: o.forklaring, handling: o.handling, vy: post?.vy ?? '', kraverPatient: Boolean(post?.mal),
        href: far && !post.mal && post.href ? post.href : null };
    }),
  };
}

// Kontroll vid start: varje handling i katalogen finns i behörighetsmotorn, och varje id är unikt.
export function kontrolleraKatalog() {
  const fel = [];
  const sedda = new Set();
  for (const p of KATALOG) {
    if (sedda.has(p.id)) fel.push(`dubblett: ${p.id}`);
    sedda.add(p.id);
    for (const h of [...(p.kraver ?? []), ...(p.nagon ?? []), ...(p.inte ?? [])]) if (!HANDLINGAR[h] && !Object.values(ROLLER).some(l => l.includes(h))) fel.push(`${p.id}: okänd handling ${h}`);
  }
  return fel;
}
