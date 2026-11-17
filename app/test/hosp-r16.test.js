// HOSP: legitimation och förskrivningsrätt ur Socialstyrelsens register (GetHospPersonForPublicHealthCare 1.1), och de två
// kontrakt som pinnades 2026-11-17 (licensetopractice och ProcessActivityOrder). Vårdkällan är konsument av en simulerad
// HOSP-tjänst. Systemet är experten: det hämtar uppgifterna själv, säger på vanlig svenska om legitimationen saknas eller
// är återkallad, och låter förskrivningsrätten och behörighetsbegränsningarna styra vad förskrivningen erbjuder.
import { describe, test, expect, afterEach } from 'bun:test';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { nyDb, atk, personal, testserver, klient, sandlada } from './hjalp.js';
import { idag, addDagar, iso } from '../src/db.js';
import * as rivta from '../src/rivta/index.js';
import * as plattform from '../src/rivta/plattform.js';
import { tolka, skriv } from '../src/rivta/xml.js';
import { Schemaset } from '../src/rivta/xsd.js';
import { prova } from '../src/atkomst.js';
import * as hosp from '../src/hosp.js';
import * as lakemedel from '../src/lakemedel.js';
import * as dosandring from '../src/dosandring.js';
import * as forbrukning from '../src/forbrukning.js';
import * as preventivmedel from '../src/preventivmedel.js';
import * as masterdata from '../src/masterdata.js';
import * as idp from '../src/idp.js';
import { PERSONNUMMER } from '../src/seed/hosp.js';

const T = 'HOSP, legitimation och förskrivningsrätt > ';
const LTP = 'riv.masterdata.organisationalresources.licensetopractice';
const fel = (fn) => { try { fn(); } catch (e) { return e; } return null; };
const anrop = (db, kontrakt = 'GetHospPersonForPublicHealthCare') => rivta.anropslogg(db).filter(a => a.kontrakt === kontrakt);
// Ger personen vårdrelation till patienten på sin vårdenhet med ett besök i dag.
const besok = (db, pid, enhet) => db.query("INSERT INTO vardkontakter (patient_id, enhet_id, typ, start, kalla) VALUES (?, ?, 'besok', ?, 'test')").run(pid, enhet, iso());
const ordination = (lakemedelId, orsak = 'Smärta') => ({ lakemedelId, dosering: '1 tablett vid behov', dos: 1, dosEnhet: 'tablett', typ: 'vid_behov', vidBehov: true, ordinationsorsak: orsak, start: idag(), uppfoljningsdatum: addDagar(idag(), 14) });
// Allvarliga varningar för patienten kvitteras, så att det som prövas är förskrivningsrätten.
function sparaKvitterad(a, kropp, opts) {
  try { return lakemedel.spara(a, kropp, opts); } catch (e) {
    if (!e.extra?.kraverKvittens) throw e;
    return lakemedel.spara(a, { ...kropp, kvitteradeVarningar: e.extra.kraverKvittens.map(regel => ({ regel, motivering: 'Bedömt i testet' })) }, opts);
  }
}
const OXIKODON = 'VK-NPL-0030';
const ALVEDON = 'VK-NPL-0026';
const DESOGESTREL = 'VK-NPL-0050';

afterEach(() => rivta.nationella.satt(null));

describe('HOSP, legitimation och förskrivningsrätt', () => {
  test('kontrakten GetHospPersonForPublicHealthCare, GetHospPersonForIvo och ProcessActivityOrder läses ur sina WSDL och schemana valideras', () => {
    const h = rivta.kontrakt(LTP, 'GetHospPersonForPublicHealthCare', '1.1');
    expect(h).toMatchObject({ soapAction: 'urn:riv:infrastructure:directory:licensetopractice:GetHospPersonForPublicHealthCareResponder:1:GetHospPersonForPublicHealthCare', vag: '/GetHospPersonForPublicHealthCare/1/rivtabp21', logiskAdressIHuvud: true, profil: 'RIVTABP21' });
    expect(rivta.kontrakt(LTP, 'GetHospPersonForIvo', '1.0').vag).toBe('/GetHospPersonForIvo/1/rivtabp21');
    // Domänen med en leverantörs namn efter riv- (riv-telia) läses som de andra.
    const o = rivta.kontrakt('riv-telia.clinicalprocess.activity.order', 'ProcessActivityOrder', '1.0');
    expect(o).toMatchObject({ vag: '/ProcessActivityOrder/1/rivtabp21', logiskAdressIHuvud: true, kalla: { tagg: 'clinicalprocess_activity_order_1.0' } });
    for (const d of [h, o]) expect(() => new Schemaset(rivta.RIVTA_ROT).las(d.schemaFil).kompileraAllt()).not.toThrow();
    expect(() => rivta.kontrakt('riv-Telia.x', 'ProcessActivityOrder', '1.0')).toThrow('Okänt tjänstekontrakt');
    // Ett svar byggs i schemats ordning och valideras: fixed för OID:erna och kodlistan för legitimerat yrke.
    const s = h.schema.bygg(h.svar.ns, h.svar.lokal, { hospPerson: [hosp.exempelPost()] });
    expect(h.schema.validera(s)).toEqual([]);
    const x = skriv(s);
    expect(h.schema.validera(tolka(x.replace('1.2.752.116.3.1.1', '9.9')))[0]).toContain('värdet ska vara 1.2.752.116.3.1.1');
    expect(h.schema.validera(tolka(x.replace('>LK<', '>XX<')))[0]).toContain('ska vara ett av AP, AT');
    expect(h.schema.validera(tolka(x.replace('>20250901<', '>2025-09-01<')))[0]).toContain('mönster');
    expect(h.schema.lasUt(tolka(x)).hospPerson[0].legitimation[0]).toMatchObject({ giltigLegitimation: true, forskrivningsratt: true, legitimeratYrke: { code: 'LK' } });
  });

  const xmllint = Bun.which('xmllint');
  test.skipIf(!xmllint)('valideringen av HOSP-svaret ger samma svar som xmllint', () => {
    const h = hosp.HOSP;
    const katalog = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'hosp-xmllint-'));
    try {
      const x = skriv(h.schema.bygg(h.svar.ns, h.svar.lokal, { hospPerson: [hosp.exempelPost()] }));
      const fall = [x, x.replace('1.2.752.116.3.1.1', '9.9'), x.replace('>LK<', '>XX<'), x.replace('>20250901<', '>2025-09-01<'), x.replace('<ns2:giltigLegitimation>true', '<ns2:giltigLegitimation>ja'),
        skriv(h.schema.bygg(h.begaran.ns, h.begaran.lokal, { personId: { extension: '191212121212', root: '1.2.752.129.2.1.3.1' } })),
        skriv(h.schema.bygg(h.begaran.ns, h.begaran.lokal, { personId: { extension: '191212121212', root: '1.2.752.129.2.1.3.1' } })).replace('191212121212', '1912121212')];
      const xsd = join(rivta.RIVTA_ROT, h.schemaFil);
      for (const [i, f] of fall.entries()) {
        const fil = join(katalog, `${i}.xml`);
        writeFileSync(fil, f);
        const lint = Bun.spawnSync([xmllint, '--noout', '--nonet', '--schema', xsd, fil], { stderr: 'pipe' }).exitCode === 0;
        expect([i, h.schema.validera(tolka(f)).length === 0]).toEqual([i, lint]);
      }
    } finally { rmSync(katalog, { recursive: true, force: true }); }
  });

  test('den simulerade HOSP-tjänsten ger legitimationen för demopersonalen, och anropet loggas utan personnummer', () => {
    const db = nyDb();
    const b = hosp.hamta(db, personal(db, 'lak-kard'));
    expect(b).toMatchObject({ status: 'ok', gammal: false });
    expect(b.legitimationer).toEqual([expect.objectContaining({ kod: 'LK', namn: 'Läkare', giltig: true, forskrivningsratt: true, begransningar: [] })]);
    // Innan uppgifterna är hämtade är de okända.
    expect(hosp.bedom(db, personal(db, 'bm-uso')).status).toBe('okand');
    expect(hosp.hamta(db, personal(db, 'bm-uso')).status).toBe('ok');
    expect(hosp.bedom(db, personal(db, 'bm-uso')).legitimationer.map(l => l.kod).sort()).toEqual(['BM', 'SJ']);
    expect(anrop(db).at(-1)).toMatchObject({ riktning: 'ut', resultat: 'ok', organisation: rivta.nationella.NATIONELL });
    // Personnumret används bara i begäran och sparas varken i loggen eller i uppgifterna.
    const pnr = PERSONNUMMER['lak-kard'];
    expect(JSON.stringify(rivta.anropslogg(db))).not.toContain(pnr);
    expect(JSON.stringify(db.query('SELECT * FROM hosp_uppgifter').all())).not.toContain(pnr);
    // Kuratorns legitimation finns inte i kontraktets kodverk, och studenter och undersköterskor har ingen legitimation.
    expect(hosp.hamta(db, personal(db, 'kur-vc')).status).toBe('ej_i_hosp');
    expect(hosp.bedom(db, personal(db, 'usk-kard')).status).toBe('ej_krav');
    // En person som inte har något personnummer i HSA-katalogen kan inte slås upp, och det står varför.
    db.query("INSERT INTO personal (id, namn, yrke, titel, enhet_id, hsa_id, demo, aktiv) VALUES ('lak-ny', 'Ny Läkare', 'lakare', 'Läkare', 'uso-kard', 'SE2321000164-VKNY01', 0, 1)").run();
    expect(hosp.hamta(db, personal(db, 'lak-ny'))).toMatchObject({ status: 'okand', text: expect.stringContaining('personnummer') });
  });

  test('avvikelserna i demon: begränsad förskrivningsrätt, sjuksköterska utan förskrivningsrätt och återkallad legitimation', () => {
    const db = nyDb();
    const ane = hosp.hamta(db, personal(db, 'lak-ane-ort'));
    expect(ane.status).toBe('ok');
    expect(ane.legitimationer[0].begransningar).toEqual([{ typ: '003', namn: 'Begränsad förskrivningsrätt', from: '20250901', tom: null, text: 'Förskrivningsrätten omfattar inte narkotiska läkemedel.' }]);
    const ssk = hosp.hamta(db, personal(db, 'ssk-ane-ort'));
    expect(ssk).toMatchObject({ status: 'ok' });
    expect(ssk.legitimationer[0]).toMatchObject({ kod: 'SJ', forskrivningsratt: false });
    const kk = hosp.hamta(db, personal(db, 'lak-kk'));
    expect(kk.status).toBe('aterkallad');
    expect(kk.text).toContain('återkallad');
    expect(kk.text).toContain('2025-10-20');
    expect(kk.text).not.toMatch(/[—–…]/);
  });

  test('en läkare med begränsad förskrivningsrätt ordinerar inte narkotiska läkemedel, i något flöde, och systemet säger varför', () => {
    const db = nyDb();
    besok(db, 'p01', 'uso-ane');
    const a = atk(db, 'lak-ane-ort', 'p01', {}, 'ordinera');
    const e = fel(() => lakemedel.spara(a, ordination(OXIKODON)));
    expect(e?.status).toBe(403);
    expect(e.message).toContain('Förskrivningsrätten omfattar inte narkotiska läkemedel.');
    expect(e.message).toContain('narkotiskt läkemedel');
    expect(e.message).toContain('Socialstyrelsens register (HOSP)');
    expect(db.query("SELECT count(*) AS n FROM ordinationer WHERE ordinerad_av = 'lak-ane-ort'").get().n).toBe(0);
    // Andra läkemedel ordinerar läkaren som vanligt.
    expect(sparaKvitterad(a, ordination(ALVEDON)).ordination.lakemedel.id).toBe(ALVEDON);
    // Katalogen visar narkotika som inte valbart, med förklaringen, och allt annat som vanligt.
    const lista = hosp.markeraKatalog(db, personal(db, 'lak-ane-ort'), lakemedel.sokKatalog(db, 'oxikodon').concat(lakemedel.sokKatalog(db, 'alvedon')));
    expect(lista.find(l => l.id === OXIKODON).ejForskrivning).toContain('narkotiskt');
    expect(lista.find(l => l.id === ALVEDON).ejForskrivning).toBeUndefined();
    expect(hosp.markeraKatalog(db, personal(db, 'lak-kard'), lakemedel.sokKatalog(db, 'oxikodon')).every(l => l.ejForskrivning === undefined)).toBe(true);
    // Samma regel när läkaren är ordinatör för en muntlig ordination som sjuksköterskan registrerar.
    const m = fel(() => lakemedel.spara(atk(db, 'ssk-ane-ort', 'p01', {}, 'registrera_muntlig_ordination'), ordination(OXIKODON), { handling: 'registrera_muntlig_ordination', ordineradAv: 'lak-ane-ort', nll: false, nllStatus: 'vantar_signering' }));
    expect(m?.status).toBe(403);
    expect(m.message).toContain('narkotiskt läkemedel');
    // Och vid en dosändring av en narkotisk ordination som en annan läkare har gjort.
    const ox = sparaKvitterad(atk(db, 'lak-kard', 'p01', {}, 'ordinera'), ordination(OXIKODON)).ordination;
    const d = fel(() => dosandring.andra(a, lakemedel.hamtaRad(db, ox.id), { dosering: '2 tabletter vid behov', dos: 2, orsak: 'Otillräcklig effekt' }));
    expect(d?.status).toBe(403);
    expect(d.message).toContain('narkotiskt läkemedel');
  });

  test('den fasta regeln ger inte längre förskrivningsrätt för förbrukningsartiklar till en sjuksköterska som saknar den i HOSP', () => {
    const db = nyDb();
    besok(db, 'p01', 'uso-ane');
    const a = atk(db, 'ssk-ane-ort', 'p01', {}, 'forskriva_forbrukning');
    // Rollen har fortfarande handlingen, men förskrivningsrätten kommer ur HOSP.
    expect(prova(db, { personal: personal(db, 'ssk-ane-ort'), patient: 'p01', handling: 'forskriva_forbrukning' }).tillaten).toBe(true);
    const k = forbrukning.kanForskriva(a);
    expect(k.kan).toBe(false);
    expect(k.varfor).toContain('förskrivningsrätt');
    expect(k.varfor).toContain('Socialstyrelsens register (HOSP)');
    const e = fel(() => forbrukning.forskriv(a, { artikelId: 'VK-FA-0001', orsak: 'Test' }));
    expect(e?.status).toBe(403);
    expect(e.message).toBe(k.varfor);
    expect(db.query("SELECT count(*) AS n FROM forbrukningsforskrivningar WHERE forskriven_av = 'ssk-ane-ort'").get().n).toBe(0);
    // En sjuksköterska med förskrivningsrätt i HOSP förskriver som förut, och läkaren likaså.
    expect(forbrukning.kanForskriva(atk(db, 'ssk-kard', 'p01', {}, 'forskriva_forbrukning')).kan).toBe(true);
    expect(forbrukning.kanForskriva(atk(db, 'lak-kard', 'p01', {}, 'forskriva_forbrukning')).kan).toBe(true);
  });

  test('barnmorskans förskrivning av preventivmedel kräver förskrivningsrätt som barnmorska i HOSP', () => {
    const db = nyDb();
    const a = atk(db, 'bm-vc', 'p11', {}, 'forskriva_preventivmedel');
    expect(preventivmedel.forslag(a)).toMatchObject({ kan: true });
    // Utan förskrivningsrätt som barnmorska i registret visar dialogen inga preventivmedel och säger varför.
    hosp.hamta(db, personal(db, 'bm-vc'));
    const rad = db.query("SELECT uppgifter FROM hosp_uppgifter WHERE personal_id = 'bm-vc'").get();
    const u = JSON.parse(rad.uppgifter);
    u.legitimationer.find(l => l.kod === 'BM').forskrivningsratt = false;
    db.query("UPDATE hosp_uppgifter SET uppgifter = ? WHERE personal_id = 'bm-vc'").run(JSON.stringify(u));
    const f = preventivmedel.forslag(a);
    expect(f).toMatchObject({ kan: false, lakemedel: [] });
    expect(f.varfor).toContain('förskrivningsrätt som barnmorska');
    const e = fel(() => preventivmedel.forskriv(a, { lakemedelId: DESOGESTREL }));
    expect(e?.status).toBe(403);
    expect(e.message).toBe(f.varfor);
  });

  test('en återkallad legitimation tar bort handlingarna som kräver den och stoppar inloggningen', async () => {
    const db = nyDb();
    const kk = personal(db, 'lak-kk');
    // Innan uppgifterna är hämtade gäller rollen som vanligt.
    expect(prova(db, { personal: kk, patient: 'p01', handling: 'las_journal' }).skal).not.toContain('återkallad');
    hosp.hamta(db, kk);
    const r = prova(db, { personal: kk, patient: 'p01', handling: 'las_journal' });
    expect(r).toMatchObject({ tillaten: false, grund: 'nekad' });
    expect(r.skal).toContain('återkallad');
    for (const h of ['ordinera', 'skriva_journal', 'nodatkomst']) expect([h, prova(db, { personal: kk, patient: 'p01', handling: h, val: { nodatkomst: true } }).tillaten]).toEqual([h, false]);
    // Övningarna gör personen ändå, och de andra läkarna påverkas inte.
    expect(prova(db, { personal: kk, handling: 'utbildning' }).tillaten).toBe(true);
    expect(prova(db, { personal: personal(db, 'lak-kard'), patient: 'p01', handling: 'las_journal' }).tillaten).toBe(true);
    // Inloggningen stoppas med en förklaring på vanlig svenska.
    const app = testserver();
    try {
      const k = klient(app);
      await k.logga('lak-kard');
      const s = sandlada(app, k);
      const k2 = klient(app);
      await k2.get('/api/session');
      const svar = await k2.post('/api/login/biljett', { biljett: idp.autentisera(s.db, personal(s.db, 'lak-kk')) });
      expect(svar.status).toBe(403);
      expect(svar.data.fel).toContain('återkallad');
      expect(svar.data.fel).toContain('Socialstyrelsens register (HOSP)');
      // Inloggningen hämtade själv uppgifterna för läkaren som loggade in först.
      expect(s.db.query("SELECT hamtad FROM hosp_uppgifter WHERE personal_id = 'lak-kard'").get()?.hamtad).toBeTruthy();
    } finally { app.stopp(); }
  });

  test('regeln: uppgifterna hämtas om vid inloggning och förskrivning när de är äldre än ett dygn', () => {
    const db = nyDb();
    const p = personal(db, 'lak-kard');
    const t0 = new Date('2026-11-10T08:00:00Z');
    hosp.aktuell(db, p, t0);
    expect(anrop(db)).toHaveLength(1);
    hosp.aktuell(db, p, new Date(t0.getTime() + 23 * 3600_000));
    expect(anrop(db)).toHaveLength(1);
    hosp.aktuell(db, p, new Date(t0.getTime() + 25 * 3600_000));
    expect(anrop(db)).toHaveLength(2);
    expect(hosp.REGEL).toContain('äldre än ett dygn');
  });

  test('svarar tjänsten inte gäller de senast hämtade uppgifterna, och det syns för systemförvaltningen', () => {
    const db = nyDb();
    const t0 = new Date('2026-11-10T08:00:00Z');
    const t1 = new Date(t0.getTime() + 2 * 86400_000);
    hosp.aktuell(db, personal(db, 'lak-ane-ort'), t0);
    rivta.nationella.satt(() => { throw new Error('ingen förbindelse'); });
    const b = hosp.aktuell(db, personal(db, 'lak-ane-ort'), t1);
    expect(b).toMatchObject({ status: 'ok', gammal: true, fel: expect.stringContaining('svarar inte') });
    // Begränsningen gäller fortfarande, eftersom de senast hämtade uppgifterna gäller.
    expect(hosp.forskrivning(db, personal(db, 'lak-ane-ort'), { typ: 'lakemedel', lm: { atc: 'N02AA05', namn: 'Oxikodon' }, nu: t1 }).kan).toBe(false);
    // Har uppgifterna aldrig kunnat hämtas stoppas förskrivningen (fail closed) med en förklaring.
    const f = hosp.forskrivning(db, personal(db, 'lak-vc'), { typ: 'lakemedel', lm: { atc: 'N02BE01', namn: 'Alvedon' }, nu: t1 });
    expect(f.kan).toBe(false);
    expect(f.varfor).toContain('svarar inte');
    // Systemförvaltningen ser vilka uppgifter som är gamla och varför.
    const l = hosp.lista(db, personal(db, 'sysf'), t1);
    expect(l.personal.find(x => x.id === 'lak-ane-ort')).toMatchObject({ gammal: true, fel: expect.stringContaining('svarar inte') });
    expect(l.personal.find(x => x.id === 'lak-vc')).toMatchObject({ status: 'okand' });
    expect(l.text).toContain('svarar inte');
    // När tjänsten svarar igen hämtar systemförvaltaren om uppgifterna.
    rivta.nationella.satt(null);
    const om = hosp.hamtaOm(db, personal(db, 'sysf'), {}, t1);
    expect(om.personal.find(x => x.id === 'lak-vc')).toMatchObject({ status: 'ok', gammal: false, fel: null });
  });

  test('när systemförvaltningen ger någon en roll som kräver legitimation hämtar systemet uppgifterna och säger om den saknas', () => {
    const db = nyDb();
    hosp.hamta(db, personal(db, 'lak-kard'));
    const poster = db.query("SELECT * FROM personal WHERE yrke <> 'systemkonto'").all().map(p => ({ id: p.id, namn: p.namn, yrke: p.id === 'usk-kard' ? 'sjukskoterska' : p.yrke, titel: p.titel, enhetId: p.enhet_id, hsaId: p.hsa_id, aktiv: Boolean(p.aktiv) }));
    const r = masterdata.synkronisera(db, 'personal', { namn: 'Testkälla', personal: () => poster });
    expect(r.andrade).toContain('usk-kard');
    expect(r.legitimation).toEqual([{ id: 'usk-kard', namn: 'Amira Haddad', status: 'saknas', text: expect.stringContaining('ingen legitimation som sjuksköterska') }]);
    // Och personen kan inte arbeta i rollen förrän legitimationen finns.
    expect(prova(db, { personal: personal(db, 'usk-kard'), patient: 'p01', handling: 'las_journal' }).skal).toContain('ingen legitimation som sjuksköterska');
  });

  test('bara systemförvaltningen och personen själv ser uppgifterna ur HOSP', async () => {
    const app = testserver();
    try {
      const k = klient(app);
      await k.logga('lak-kard');
      expect((await k.get('/api/hosp')).status).toBe(403);
      expect((await k.post('/api/hosp/hamta', {})).status).toBe(403);
      const mig = await k.get('/api/hosp/mig');
      expect(mig.status).toBe(200);
      expect(mig.data).toMatchObject({ status: 'ok', legitimationer: [expect.objectContaining({ kod: 'LK' })], regel: hosp.REGEL });
      expect(JSON.stringify((await k.get('/api/session')).data)).not.toContain('forskrivningsratt');
      await k.logga('sysf');
      const l = await k.get('/api/hosp');
      expect(l.status).toBe(200);
      // Listan hämtar själv det som saknas, så att systemförvaltaren ser läget nu.
      expect(l.data.personal.find(x => x.id === 'lak-kk')).toMatchObject({ namn: 'Johanna Rehn', status: 'aterkallad' });
      expect(l.data.text).toContain('1 person saknar giltig legitimation');
      const om = await k.post('/api/hosp/hamta', { personalId: 'lak-kk' });
      expect(om.data.personal.find(x => x.id === 'lak-kk')).toMatchObject({ status: 'aterkallad' });
      expect((await k.post('/api/hosp/hamta', { personalId: 'finns-inte' })).status).toBe(404);
      expect((await k.post('/api/hosp/hamta', { personalId: 42 })).status).toBe(400);
      const db = sandlada(app, k).db;
      expect(db.query("SELECT count(*) AS n FROM atkomstlogg WHERE personal_id = 'sysf' AND resurs LIKE 'hosp:%'").get().n).toBeGreaterThanOrEqual(2);
      // Systemförvaltaren har ingen egen legitimation att visa.
      expect((await k.get('/api/hosp/mig')).data).toMatchObject({ status: 'ej_krav' });
    } finally { app.stopp(); }
  });

  test('anropet till HOSP går genom den lokala tjänsteplattformen med ömsesidig TLS', async () => {
    const db = nyDb();
    const ca = rivta.testCa();
    const VG = rivta.konsumenter.vardgivare(db);
    const vkCert = ca.utfarda({ hsaId: VG, cn: 'Vårdkällan' });
    const simCert = ca.utfarda({ hsaId: rivta.nationella.NATIONELL, cn: 'Simulerade nationella tjänster' });
    const vpCert = ca.utfarda({ hsaId: 'SE0000000000-LOKALVP', cn: 'Lokal tjänsteplattform' });
    const sim = await rivta.tls.starta({ cert: simCert.cert, key: simCert.key, ca: ca.cert, plattformar: [vpCert.fingeravtryck], hantera: rivta.tls.tjanstHanterare(rivta.nationella.tjanst, { db }) });
    const N = rivta.nationella.NATIONELL;
    const tak = { anropsbehorigheter: [{ konsument: VG, kontrakt: hosp.HOSP.begaran.ns, logiskAdress: N }], vagval: [{ kontrakt: hosp.HOSP.begaran.ns, logiskAdress: N, adress: `https://127.0.0.1:${sim.port}` }] };
    const vp = await plattform.starta({ cert: vpCert.cert, key: vpCert.key, ca: ca.cert, tak });
    try {
      const svar = await rivta.anropa(hosp.HOSP, { logiskAdress: N, begaran: { personId: { extension: PERSONNUMMER['lak-ane-ort'], root: '1.2.752.129.2.1.3.1' } }, transport: rivta.https({ bas: `https://127.0.0.1:${vp.port}`, cert: vkCert.cert, key: vkCert.key, ca: ca.cert }), db });
      expect(svar.hospPerson[0].legitimation[0].behorighetsbegransning[0].typAvBehorighetsbegransning.code).toBe('003');
    } finally { await vp.stopp(); await sim.stopp(); }
  });
});
