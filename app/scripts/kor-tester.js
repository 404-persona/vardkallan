// Kör bun test, skriver test-resultat.json som /api/krav läser och stoppar bygget om något test är rött
// eller om kravregistret eller Sussa-registret pekar på ett test som inte finns.
import { readFileSync, writeFileSync, unlinkSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { KRAV } from '../src/krav.js';
import { sussaTester } from '../src/sussa/index.js';
import { lasKlientresultat } from '../src/klientresultat.js';
// Runda 11, r1: tolkningen av JUnit-rapporten delas med scripts/klocktest.js.
import { tolkaJunit } from './junit-tolkning.js';

const rot = join(import.meta.dir, '..');
// Runda 20: sviten körs i flera Bun-processer, med --smol, som Bun samlar skräp oftare med. Hela sviten (2405 tester)
// i en process gick över 3 GB och dödades i en container med --memory=3g, som är taket för containrarna på
// testdatorn och i bygget, eftersom modulerna och deras cacheminnen lever kvar tills processen slutar. Filerna delas i
// DELAR lika stora grupper i bokstavsordning, och varje grupp skriver en egen JUnit-rapport som läses ihop.
const DELAR = Math.max(1, Number(process.env.TESTDELAR) || 4);
const filer = readdirSync(join(rot, 'test')).filter(f => /\.test\.js$/.test(f)).sort();
const grupper = Array.from({ length: DELAR }, (_, i) => filer.slice(Math.floor(i * filer.length / DELAR), Math.floor((i + 1) * filer.length / DELAR))).filter(g => g.length);
const tester = [];
const proc = { exitCode: 0 };
for (const [i, grupp] of grupper.entries()) {
  const xml = join(rot, `test-resultat-${i + 1}.xml`);
  console.log(`\nDel ${i + 1} av ${grupper.length}: ${grupp.length} filer (${grupp[0]} till ${grupp.at(-1)})`);
  const p = Bun.spawnSync(['bun', '--smol', 'test', '--reporter=junit', `--reporter-outfile=${xml}`, ...grupp.map(f => `./test/${f}`)], { cwd: rot, stdout: 'inherit', stderr: 'inherit' });
  if (p.exitCode !== 0) proc.exitCode = p.exitCode ?? 1;
  let text = '';
  try { text = readFileSync(xml, 'utf8'); } catch { console.error(`Ingen JUnit-rapport skrevs för del ${i + 1}.`); process.exit(1); }
  tester.push(...tolkaJunit(text));
  try { unlinkSync(xml); } catch { /* ingen fil */ }
}

// Testerna av gränssnittet körs i Playwright före bygget och följer med som klickbudget.json och klienttest-resultat.json.
// Runda 7, r1: och Sussas användbarhetstester som sussa-testfall.json.
const klient = lasKlientresultat({ klickbudget: join(rot, 'klickbudget.json'), klienttester: join(rot, 'klienttest-resultat.json'), sussatestfall: join(rot, 'sussa-testfall.json'),
  // Runda 12, r2: lasttestet och valideringen med HL7:s validator.
  lasttest: join(rot, 'lasttest.json'), fhirvalidering: join(rot, 'fhir-validering.json') });
const namn = new Set([...tester, ...klient.tester].map(t => t.namn));
const inaktuella = klient.tester.filter(t => t.status === 'inaktuell').length;
if (inaktuella) console.warn(`${inaktuella} tester av gränssnittet är inaktuella: public/ har ändrats sedan Playwright-testerna kördes.`);
const saknas = [...new Set(KRAV.flatMap(k => k.tester).filter(t => !namn.has(t)))];
// Samma kontroll för mappningen av Sussas kravspecifikation.
const saknasSussa = sussaTester().filter(t => !namn.has(t));
const resultat = {
  tid: new Date().toISOString(), bun: Bun.version, antal: tester.length,
  godkanda: tester.filter(t => t.status === 'grön').length, misslyckade: tester.filter(t => t.status === 'röd').length,
  hoppade: tester.filter(t => t.status === 'hoppad').length, tester,
};
writeFileSync(join(rot, 'test-resultat.json'), JSON.stringify(resultat, null, 2));
console.log(`\ntest-resultat.json: ${resultat.godkanda} gröna, ${resultat.misslyckade} röda, ${resultat.hoppade} hoppade av ${resultat.antal}`);
if (saknas.length) {
  console.error(`Kravregistret pekar på tester som inte finns:\n  ${saknas.join('\n  ')}`);
  process.exit(1);
}
if (saknasSussa.length) {
  console.error(`Sussa-registret pekar på tester som inte finns:\n  ${saknasSussa.join('\n  ')}`);
  process.exit(1);
}
// Testspår 2: regelförteckningarna för tjänstekontrakten (rivta-regler/<domän>/<Kontrakt>.json) pekar på tester som
// prövar reglerna. Varje sådant test ska finnas och ha körts.
const regelRot = join(rot, 'rivta-regler');
const saknasRegler = [];
for (const d of readdirSync(regelRot)) {
  for (const f of readdirSync(join(regelRot, d)).filter(x => x.endsWith('.json') && !x.endsWith('.data.json') && !x.endsWith('.exempelfel.json'))) {
    for (const r of JSON.parse(readFileSync(join(regelRot, d, f), 'utf8')).regler) if (r.prövas && !namn.has(r.test)) saknasRegler.push(`${f} ${r.id}: ${r.test}`);
  }
}
if (saknasRegler.length) {
  console.error(`Regelförteckningarna pekar på tester som inte finns:\n  ${[...new Set(saknasRegler)].slice(0, 50).join('\n  ')}`);
  process.exit(1);
}
if (proc.exitCode !== 0 || resultat.misslyckade > 0 || resultat.antal === 0) process.exit(1);
