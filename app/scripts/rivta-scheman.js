// Runda 14, r2: hämtar tjänstekontraktens scheman (RIVTA) till app/rivta/<domän>/ från en pinnad version i
// https://bitbucket.org/rivta-domains, och skriver KALLA.json med källan, taggen, commit och sha256 för varje fil.
// Schemana är licensierade under Apache License 2.0 (se huvudet i varje fil). Bara schemafilerna, WSDL och XML-filerna
// (exempel och villkoren för engagemangsindex) i katalogen schemas/ tas med, utan HL7 CDA, som inget av kontrakten här
// använder. Filerna är data: de läses av valideringen i src/rivta/xsd.js och körs aldrig.
//
//   node scripts/rivta-scheman.js          hämtar alla domäner och skriver om KALLA.json
//   node scripts/rivta-scheman.js --prova  kontrollerar bara att filerna stämmer med KALLA.json
//   node scripts/rivta-scheman.js --tkb    hämtar TKB, texten och testsvitens filer utan licens till app/rivta-tkb/
//
// Testspår 2 (2026-11-20): för de byggda kontrakten hämtas också tjänstekontraktsbeskrivningen (TKB) under docs/ och
// testsvitens filer under test-suite/ ur samma arkiv (DOKUMENT nedan), med sha256 i KALLA.json under dokument. TKB görs
// om till text i en container (pandoc, och LibreOffice först för en TKB i det gamla formatet .doc), och texten pinnas
// under text med verktygens avbilder. Texten är det som testerna läser (test/rivta-regler.test.js). Hämtningen kräver
// docker; --prova gör det inte.
//
// Runda 20 (1.9.0): TKB anger ingen licens, och inte heller testsvitens HTML-filer. De ligger därför inte i förrådet
// utan hämtas med --tkb till app/rivta-tkb/<domän>/ (TKB_ROT), som git och Docker inte tar med. KALLA.json har kvar
// sha256 för dem och räknar upp dem under utanförRepo, och --tkb kräver att varje fil och texten har samma sha256 som
// där. Testsvitens XML-filer och exemplen ligger kvar under app/rivta/<domän>/ med domänens licens, Apache License 2.0.
// Testerna som behöver TKB:s text hoppas över med ett meddelande när filerna inte är hämtade.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, rmSync, existsSync, mkdtempSync, cpSync } from 'node:fs';
import { join, relative, dirname, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const ROT = join(dirname(new URL(import.meta.url).pathname), '..', 'rivta');
// Runda 20: TKB, texten och testsvitens filer utan licens (KALLA.json, utanförRepo). Står i .gitignore och .dockerignore.
export const TKB_ROT = join(dirname(new URL(import.meta.url).pathname), '..', 'rivta-tkb');

// Domän, tagg och commit. Commit är det som pinnar; taggen står med för att kunna läsas av människor.
export const DOMANER = [
  ['riv.clinicalprocess.healthcond.description', '2.1.19', '9ad620ea8cddde2e02c5a1da69e9102b1b959914'],
  ['riv.clinicalprocess.logistics.logistics', '2.0.7', '42851358d799b89756fc55fbf64c7ee01c067a3d'],
  ['riv.clinicalprocess.healthcond.basic', '1.2.3', '55a953227545bf0500cb7976f01152773b0f6bec'],
  ['riv.clinicalprocess.activity.actions', '1.3.6', '02b15bdee612ae4c9998678edf5c31453a6a3d71'],
  ['riv.clinicalprocess.healthcond.actoutcome', '3.1.10', '7c07a857587fbf8e4484f586d045d2c366a9ace6'],
  ['riv.clinicalprocess.activityprescription.actoutcome', '2.2.2', 'a0f633712d0bdd3a65edf7b8972704dad24a9663'],
  ['riv.itintegration.engagementindex', '1.0.10', 'feef3879647a74344c55b62bead12ce2748aa841'],
  ['riv.ehr.blocking', 'ehr_blocking_3.2.2', '558d8574eefc7e5e2d0d342d882de15424d72690'],
  ['riv.ehr.patientconsent', 'ehr_patientconsent_1.0.1_RC1', '70440f0fcd082825826b9bc9acd4f6144df07ba7'],
  ['riv.infrastructure.directory.employee', '4.0.1', '0f9fd6418f2b0d7cde44e4cc6a61db856c8a861e'],
  ['riv.population.residentmaster', 'population_residentmaster_1.2', '9c8dd64e666fc9d474f622db2c8b041a20a414ef'],
  ['riv.ehr.accesscontrol', '1.0.6', '4167090fb46b9c24f13b83ecfdf4e95efcc0e86f'],
];
// Runda 14, r3: intyg, e-remiss, remisstatus, Infektionsverktyget, NKRR, formulär, 1177 och dos.
DOMANER.push(
  ['riv.clinicalprocess.healthcond.certificate', '4.0.5', '277a809399ecc9d7bee85ef1792c00c0c7e41076'],
  ['riv.clinicalprocess.activity.request', '2.3', '3fc7315e4628d7468d6c5be80ce8dcf987315dc9'],
  ['riv.crm.requeststatus', '2.0.2', 'd487f21af1b21e446210a36324aadaca7263f652'],
  ['riv.processdevelopment.infections', '1.0.2', '869d30d9a0f8adc676e052edb3f7e2141dc6aeb0'],
  ['riv.followup.qualityregistry.nkrr', '1.2.2', 'edc9ed9be6295303470de067aa8bd7518993137f'],
  ['riv.infrastructure.eservicesupply.forminteraction', '2.1.1', '3dbee167710a60606e6560bbf6d3e6d320dbf128'],
  ['riv-application.infrastructure.eservicesupply.patientportal', '2.0', '444af395016bd6c97d1b6ca26014c5890359f0e7'],
  ['riv.druglogistics.dosedispensing', 'TD_DRUGLOGISTICS_DOSEDISPENSING_1_1_0', 'ff5de62545f2bee995c5361272027758b504de91'],
);
// 2026-11-17: två domäner som finns i tjänsteplattformen under andra namn än på Bitbucket (svar från Inera i ärende
// CS0384328). Tjänsteplattformen har major 1 av båda, så de senaste fastställda versionerna med major 1 pinnas:
// infrastructure:directory:licensetopractice 1.1 (Socialstyrelsens HOSP-register) och clinicalprocess:activity:order 1.0.
DOMANER.push(
  ['riv.masterdata.organisationalresources.licensetopractice', 'Infrastructure.directory.licensetopractice_1.1', '17c1407d8e780033cc81bea2bd5f4dd124399717'],
  ['riv-telia.clinicalprocess.activity.order', 'clinicalprocess_activity_order_1.0', 'd20bc9f205eab02aa04822d4c584d6f8eee90826'],
);
// Testspår 2: TKB och testsvitens kataloger för de byggda kontrakten i docs/rivta.md, per domän. Ur testsvitens
// kataloger tas allt utom .gitignore. Filerna är data och körs aldrig: testsvitens SoapUI-projekt läses som XML.
export const DOKUMENT = {
  'riv.clinicalprocess.healthcond.description': { tkb: 'docs/TKB_clinicalprocess_healthcond_description.docx',
    testsvit: ['GetCareDocumentation', 'GetCareDocumentationMock', 'GetDiagnosis', 'GetDiagnosisMock', 'GetAlertInformation', 'GetAlertInformationMock'] },
  'riv.clinicalprocess.logistics.logistics': { tkb: 'docs/TKB_clinicalprocess_logistics_logistics.docx', testsvit: ['GetCareContacts', 'GetCareContactsMock'] },
  'riv.clinicalprocess.activityprescription.actoutcome': { tkb: 'docs/TKB_clinicalprocess_activityprescription_actoutcome.docx', testsvit: ['GetMedicationHistory', 'GetMedicationHistoryMock'] },
  'riv.ehr.accesscontrol': { tkb: 'docs/TKB_ehr_accesscontrol.docx', testsvit: ['AssertCareEngagement', 'AssertCareEngagementMock'] },
  'riv.ehr.blocking': { tkb: 'docs/TKB_ehr_blocking_3.2.2.docx', testsvit: [] },
  'riv.ehr.patientconsent': { tkb: 'docs/TKB_ehr_patientconsent_1.0.1_RC1.docx', testsvit: [] },
  'riv.infrastructure.directory.employee': { tkb: 'docs/TKB_infrastructure_directory_employee.docx', testsvit: ['GetEmployeeIncludingProtectedPerson', 'GetEmployeeIncludingProtectedPersonMock'] },
  'riv.population.residentmaster': { tkb: 'docs/TKB_population_residentmaster.doc', testsvit: [] },
  'riv.itintegration.engagementindex': { tkb: 'docs/TKB_itintegration_engagementindex.docx', testsvit: ['UpdateEI', 'UpdateMock'] },
  'riv.masterdata.organisationalresources.licensetopractice': { tkb: 'docs/TKB_infrastructure_directory_licensetopractice.docx', testsvit: [] },
};
// Verktygen som gör om TKB till text, pinnade med sin digest. Filtret numrerar rubrikerna som i TKB och skriver
// tabellerna med en rad per tabellrad (scripts/rivta-tkb-text.lua).
export const PANDOC = 'pandoc/minimal:3.5@sha256:5453a022e3200c8f777792b2636b65d8a1622c072d35b2e95ea975e156712444';
export const LIBREOFFICE = 'gotenberg/gotenberg@sha256:ac61457a1e889ef1ca256a9afc117cff8caf517f19e66ea23cede3feb22f69a5';
const FILTER = join(dirname(new URL(import.meta.url).pathname), 'rivta-tkb-text.lua');
// Licensen per domän (runda 20, kontrollerad fil för fil i alla 22 domäner). Domänerna på Bitbucket har ingen
// licensfil; licensen står i huvudet i schemafilerna och i de flesta av testsvitens filer.
export const LICENS = 'Apache License 2.0 (huvudet i schemafilerna)';
export const DOKUMENTLICENS = 'Testsvitens SoapUI-projekt och de flesta XML-filer har huvudet med Apache License 2.0, och testsvitens XML-filer utan huvud följer domänens licens. TKB och testsvitens HTML-filer anger ingen licens: de står under utanförRepo, ligger inte i förrådet och hämtas till app/rivta-tkb/<domän>/ med node scripts/rivta-scheman.js --tkb.';
export const textFor = (tkb) => tkb.replace(/\.docx?$/, '.txt');
// Runda 20: filerna som inte ligger i förrådet. TKB och dess text, och testsvitens filer utan licens som inte är XML
// (HTML-filerna som SoapUI skriver). Testsvitens XML-filer följer domänens licens och ligger kvar.
export const utanforRepo = (kalla) => kalla?.utanförRepo ?? [];
const utanforFran = (d, utanLicens) => [d.tkb, textFor(d.tkb), ...utanLicens.filter(f => f !== d.tkb && !/\.xml$/.test(f))];
// Var en dokumentfil för en domän ligger: under app/rivta-tkb/ om den står i utanförRepo, annars under app/rivta/.
export function dokumentVag(domän, fil) {
  const kalla = JSON.parse(readFileSync(join(ROT, domän, 'KALLA.json'), 'utf8'));
  return join(utanforRepo(kalla).includes(fil) ? TKB_ROT : ROT, domän, fil);
}
// Filerna i utanförRepo som inte är hämtade till app/rivta-tkb/. Tom när alla finns.
export function tkbSaknas() {
  const ut = [];
  for (const domän of Object.keys(DOKUMENT)) {
    const kalla = JSON.parse(readFileSync(join(ROT, domän, 'KALLA.json'), 'utf8'));
    for (const f of utanforRepo(kalla)) if (!existsSync(join(TKB_ROT, domän, f))) ut.push(`${domän}/${f}`);
  }
  return ut;
}
export const TKB_MEDDELANDE = 'TKB och testsvitens filer utan licens är inte hämtade till app/rivta-tkb/. Hämta dem med: node scripts/rivta-scheman.js --tkb';

// Runda 14, r3: --doman <namn> hämtar bara den domänen (kan anges flera gånger), så att de andra domänerna står kvar.
const VALDA = process.argv.flatMap((a, i, l) => (a === '--doman' && l[i + 1] ? [l[i + 1]] : []));

const sha = (b) => createHash('sha256').update(b).digest('hex');
function filer(k) {
  const ut = [];
  const ga = (d) => { for (const n of readdirSync(d).sort()) { const f = join(d, n); if (statSync(f).isDirectory()) ga(f); else ut.push(f); } };
  if (existsSync(k)) ga(k);
  return ut;
}

export function prova() {
  const fel = [];
  for (const [domän] of DOMANER) {
    const k = join(ROT, domän);
    const kalla = JSON.parse(readFileSync(join(k, 'KALLA.json'), 'utf8'));
    const finns = filer(join(k, 'schemas')).map(f => relative(k, f));
    for (const [f, h] of Object.entries(kalla.filer)) {
      if (!finns.includes(f)) fel.push(`${domän}: ${f} saknas`);
      else if (sha(readFileSync(join(k, f))) !== h) fel.push(`${domän}: ${f} har ändrats`);
    }
    for (const f of finns) if (!Object.hasOwn(kalla.filer, f)) fel.push(`${domän}: ${f} står inte i KALLA.json`);
    // Testspår 2: TKB, texten och testsvitens filer. Runda 20: filerna i utanförRepo prövas under app/rivta-tkb/ när
    // de är hämtade och får aldrig ligga under app/rivta/.
    if (!DOKUMENT[domän]) continue;
    const dok = { ...(kalla.dokument ?? {}), ...Object.fromEntries(Object.entries(kalla.text ?? {}).map(([f, t]) => [f, t.sha256])) };
    if (!kalla.dokument || !kalla.text) fel.push(`${domän}: KALLA.json saknar dokument och text`);
    const utanfor = utanforRepo(kalla);
    if (!utanfor.includes(DOKUMENT[domän].tkb) || !utanfor.includes(textFor(DOKUMENT[domän].tkb))) fel.push(`${domän}: TKB och texten står inte under utanförRepo i KALLA.json`);
    for (const f of utanforFran(DOKUMENT[domän], kalla.utanLicensuppgift ?? [])) if (!utanfor.includes(f)) fel.push(`${domän}: ${f} saknar licens och står inte under utanförRepo`);
    const dokFinns = [...filer(join(k, 'docs')), ...filer(join(k, 'test-suite'))].map(f => relative(k, f));
    for (const [f, h] of Object.entries(dok)) {
      if (utanfor.includes(f)) {
        if (dokFinns.includes(f)) fel.push(`${domän}: ${f} saknar licens och får inte ligga under app/rivta/`);
        const v = join(TKB_ROT, domän, f);
        if (existsSync(v) && sha(readFileSync(v)) !== h) fel.push(`${domän}: ${f} under app/rivta-tkb/ har ändrats`);
      } else if (!dokFinns.includes(f)) fel.push(`${domän}: ${f} saknas`);
      else if (sha(readFileSync(join(k, f))) !== h) fel.push(`${domän}: ${f} har ändrats`);
    }
    for (const f of dokFinns) if (!Object.hasOwn(dok, f)) fel.push(`${domän}: ${f} står inte i KALLA.json`);
    if (!Object.hasOwn(kalla.text ?? {}, textFor(DOKUMENT[domän].tkb))) fel.push(`${domän}: texten för ${DOKUMENT[domän].tkb} saknas i KALLA.json`);
  }
  return fel;
}

// Testspår 2: gör om TKB till text i en container utan nätverk. En TKB i formatet .doc görs först om till .docx med
// LibreOffice. Ger texten.
function tkbText(fil) {
  const arbete = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'rivta-tkb-'));
  try {
    const anv = `${process.getuid()}:${process.getgid()}`;
    const kor = (bild, ...arg) => execFileSync('docker', ['run', '--rm', '--memory=2g', '--network=none', '--user', anv, '-v', `${arbete}:/w`, ...arg.slice(0, -1), bild, ...arg.at(-1)], { stdio: ['ignore', 'pipe', 'inherit'] });
    cpSync(fil, join(arbete, basename(fil)));
    cpSync(FILTER, join(arbete, 'filter.lua'));
    let docx = basename(fil);
    if (fil.endsWith('.doc')) {
      mkdirSync(join(arbete, 'hem'));
      kor(LIBREOFFICE, '-e', 'HOME=/w/hem', '--entrypoint', 'soffice', ['-env:UserInstallation=file:///w/hem/lo', '--headless', '--convert-to', 'docx', '--outdir', '/w', `/w/${docx}`]);
      docx += 'x';
    }
    kor(PANDOC, [`/w/${docx}`, '-t', 'markdown-smart-raw_html', '--wrap=none', '--lua-filter=/w/filter.lua', '-o', '/w/ut.txt']);
    return readFileSync(join(arbete, 'ut.txt'));
  } finally { rmSync(arbete, { recursive: true, force: true }); }
}

// Runda 20: licensen fil för fil för det som ligger i förrådet: hur många filer som har huvudet med Apache License 2.0
// och vilka som inte har det. Filerna utan huvud kommer ur samma arkiv och följer domänens licens.
export function licenskontroll(mal, filerna) {
  const utan = filerna.filter(f => !/Apache License/i.test(readFileSync(join(mal, f), 'latin1'))).sort();
  return { medHuvud: filerna.length - utan.length, utanHuvud: utan };
}

// Hämtar arkivet för en domän, prövar sha256 mot KALLA.json när commit är densamma och packar upp det i ut. Ger arkivet.
async function hamtaArkiv(domän, commit, arbete) {
  const url = `https://bitbucket.org/rivta-domains/${domän}/get/${commit}.tar.gz`;
  const svar = await fetch(url);
  if (!svar.ok) throw new Error(`${url}: ${svar.status}`);
  const arkiv = Buffer.from(await svar.arrayBuffer());
  // Testspår 2: samma commit ska ge samma arkiv som när domänen pinnades.
  const fore = existsSync(join(ROT, domän, 'KALLA.json')) ? JSON.parse(readFileSync(join(ROT, domän, 'KALLA.json'), 'utf8')) : null;
  if (fore?.commit === commit && fore.arkivSha256 && fore.arkivSha256 !== sha(arkiv)) throw new Error(`${url}: arkivet har inte samma sha256 som när domänen pinnades.`);
  const ut = join(arbete, domän);
  mkdirSync(ut, { recursive: true });
  writeFileSync(join(arbete, `${domän}.tar.gz`), arkiv);
  execFileSync('tar', ['-xzf', join(arbete, `${domän}.tar.gz`), '-C', ut, '--strip-components=1']);
  return { url, arkiv, ut };
}

async function hamta() {
  const arbete = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'rivta-'));
  try {
    for (const [domän, tagg, commit] of DOMANER) {
      if (VALDA.length && !VALDA.includes(domän)) continue;
      const { url, arkiv, ut } = await hamtaArkiv(domän, commit, arbete);
      const mal = join(ROT, domän);
      rmSync(join(mal, 'schemas'), { recursive: true, force: true });
      mkdirSync(mal, { recursive: true });
      cpSync(join(ut, 'schemas'), join(mal, 'schemas'), { recursive: true, filter: (f) => !/[\\/]hl7cda([\\/]|$)/.test(f) && (statSync(f).isDirectory() || /\.(xsd|wsdl|xml)$/.test(f)) });
      const lista = Object.fromEntries(filer(join(mal, 'schemas')).map(f => [relative(mal, f), sha(readFileSync(f))]));
      // Testspår 2: TKB, texten och testsvitens filer för de byggda kontrakten.
      const d = DOKUMENT[domän];
      const extra = {};
      if (d) {
        rmSync(join(mal, 'docs'), { recursive: true, force: true });
        rmSync(join(mal, 'test-suite'), { recursive: true, force: true });
        mkdirSync(join(mal, 'docs'), { recursive: true });
        cpSync(join(ut, d.tkb), join(mal, d.tkb));
        for (const t of d.testsvit) cpSync(join(ut, 'test-suite', t), join(mal, 'test-suite', t), { recursive: true, filter: (f) => basename(f) !== '.gitignore' });
        const text = tkbText(join(mal, d.tkb));
        writeFileSync(join(mal, textFor(d.tkb)), text);
        extra.dokument = Object.fromEntries([join(mal, d.tkb), ...filer(join(mal, 'test-suite'))].map(f => [relative(mal, f), sha(readFileSync(f))]));
        extra.text = { [textFor(d.tkb)]: { från: d.tkb, sha256: sha(text), verktyg: d.tkb.endsWith('.doc') ? [LIBREOFFICE, PANDOC] : [PANDOC], filter: 'scripts/rivta-tkb-text.lua', filterSha256: sha(readFileSync(FILTER)) } };
        // Licensen står i huvudet i de flesta av testsvitens filer. Filerna utan en sådan uppgift räknas upp, och TKB är en av dem.
        extra.dokumentlicens = DOKUMENTLICENS;
        extra.utanLicensuppgift = Object.keys(extra.dokument).filter(f => !/Apache License/i.test(readFileSync(join(mal, f), 'latin1')));
        // Runda 20: filerna utan licens flyttas till app/rivta-tkb/<domän>/.
        extra.utanförRepo = utanforFran(d, extra.utanLicensuppgift);
        rmSync(join(TKB_ROT, domän), { recursive: true, force: true });
        for (const f of extra.utanförRepo) { mkdirSync(dirname(join(TKB_ROT, domän, f)), { recursive: true }); cpSync(join(mal, f), join(TKB_ROT, domän, f)); rmSync(join(mal, f)); }
        for (const k of ['docs', 'test-suite']) if (existsSync(join(mal, k)) && !filer(join(mal, k)).length) rmSync(join(mal, k), { recursive: true });
      }
      const iRepo = [...Object.keys(lista), ...Object.keys(extra.dokument ?? {}).filter(f => !(extra.utanförRepo ?? []).includes(f))];
      writeFileSync(join(mal, 'KALLA.json'), `${JSON.stringify({
        domän, källa: `https://bitbucket.org/rivta-domains/${domän}`, tagg, commit, arkiv: url, arkivSha256: sha(arkiv),
        licens: LICENS, licenskontroll: licenskontroll(mal, iRepo), hämtat: new Date().toISOString().slice(0, 10), filer: lista, ...extra,
      }, null, 2)}\n`);
      console.log(`${domän} ${tagg}: ${Object.keys(lista).length} filer${d ? `, ${Object.keys(extra.dokument).length} dokument och texten` : ''}`);
    }
  } finally { rmSync(arbete, { recursive: true, force: true }); }
}

// Runda 20: --tkb hämtar bara filerna i utanförRepo till app/rivta-tkb/<domän>/, ur samma arkiv, och gör om TKB till
// text. Varje fil och texten ska ha samma sha256 som i KALLA.json, annars stannar skriptet och inget skrivs för domänen.
// KALLA.json ändras inte. En domän där alla filer redan finns och stämmer hämtas inte igen.
async function hamtaTkb() {
  const arbete = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'rivta-tkb-'));
  try {
    for (const [domän, , commit] of DOMANER) {
      if (!DOKUMENT[domän] || (VALDA.length && !VALDA.includes(domän))) continue;
      const kalla = JSON.parse(readFileSync(join(ROT, domän, 'KALLA.json'), 'utf8'));
      const vantat = { ...kalla.dokument, ...Object.fromEntries(Object.entries(kalla.text).map(([f, t]) => [f, t.sha256])) };
      const lista = utanforRepo(kalla);
      const stammer = (f) => existsSync(join(TKB_ROT, domän, f)) && sha(readFileSync(join(TKB_ROT, domän, f))) === vantat[f];
      if (lista.every(stammer)) { console.log(`${domän}: redan hämtade (${lista.length} filer)`); continue; }
      if (commit !== kalla.commit) throw new Error(`${domän}: commit i DOMANER är inte den i KALLA.json. Kör hela hämtningen.`);
      const { ut } = await hamtaArkiv(domän, commit, arbete);
      const ny = {};
      const tkb = DOKUMENT[domän].tkb;
      for (const f of lista) if (f !== textFor(tkb)) ny[f] = readFileSync(join(ut, f));
      ny[textFor(tkb)] = tkbText(join(ut, tkb));
      const fel = Object.entries(ny).filter(([f, b]) => sha(b) !== vantat[f]).map(([f]) => f);
      if (fel.length) throw new Error(`${domän}: sha256 stämmer inte med KALLA.json för ${fel.join(', ')}`);
      for (const [f, b] of Object.entries(ny)) { mkdirSync(dirname(join(TKB_ROT, domän, f)), { recursive: true }); writeFileSync(join(TKB_ROT, domän, f), b); }
      console.log(`${domän}: ${lista.length} filer hämtade till app/rivta-tkb/ och prövade mot KALLA.json`);
    }
  } finally { rmSync(arbete, { recursive: true, force: true }); }
}

if (import.meta.main ?? process.argv[1]?.endsWith('rivta-scheman.js')) {
  if (process.argv.includes('--prova')) {
    const fel = prova();
    console.log(fel.length ? fel.join('\n') : 'Alla scheman stämmer med KALLA.json.');
    const saknas = tkbSaknas();
    if (saknas.length) console.log(`${TKB_MEDDELANDE} (${saknas.length} filer saknas)`);
    process.exit(fel.length ? 1 : 0);
  } else if (process.argv.includes('--tkb')) await hamtaTkb();
  else await hamta();
}
