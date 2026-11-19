// Lagringen för äldre uppgifter (runda 18, r3, Sussa KD1.1.3.5): filinnehållet i avslutade vårdkontakter och äldre
// handlingar flyttas enligt lagringsklassen till en egen databas och läses därifrån med samma behörighet, loggning och
// gallring som förut. Tiden skickas in (nu), och testerna räknar bara de rader de själva har lagt in.
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { createHash } from 'node:crypto';
import * as aldre from '../src/lagring-aldre.js';
import * as lagring from '../src/lagring.js';
import * as bilder from '../src/bilder.js';
import * as arkiv from '../src/arkiv.js';
import { slaSamman } from '../src/identitet.js';
import * as sakerhetskopior from '../src/sakerhetskopior.js';
import * as miljoer from '../src/miljoer.js';
import { nyDb, atk, personal, testserver, klient, sandlada } from './hjalp.js';

const AR = 365.25 * 86400_000;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const fil = (namn, extra = '') => ({ namn, typ: 'image/png', buf: Buffer.concat([PNG, Buffer.from(extra)]) });
const sysf = (db) => personal(db, 'sysf');
const fel = (fn) => { try { fn(); } catch (e) { return e; } return null; };
const text = async (r) => Buffer.from(await r.arrayBuffer());

// En avslutad vårdkontakt för patienten på vårdenheten som slutade för ar år sedan, och en bild i den.
function gammalBild(db, { nu, ar = 4, pid = 'p01', enhet = 'uso-med', namn = 'gammal.png', pagaende = false } = {}) {
  const start = new Date(nu.getTime() - ar * AR - 3 * 86400_000).toISOString();
  const slut = pagaende ? null : new Date(nu.getTime() - ar * AR).toISOString();
  const vk = db.query(`INSERT INTO vardkontakter (patient_id, enhet_id, typ, start, slut, kalla, planerad, automatisk, ger_vardrelation)
    VALUES (?, ?, 'besok', ?, ?, 'vardkallan', 0, 0, 1) RETURNING id`).get(pid, enhet, start, slut).id;
  const m = bilder.spara(db, { patientId: pid, enhetId: enhet, vardkontaktId: vk, kategori: 'journal', fil: fil(namn, namn), kalla: 'fil', tagen: start, nu: new Date(start), av: 'lak-med' });
  return { vk, m };
}
const mediaRad = (db, id) => db.query('SELECT * FROM media WHERE id = ?').get(id);
const iAldre = (db, id) => db.query("SELECT * FROM aldre.filinnehall WHERE tabell = 'media' AND rad_id = ?").get(id);

describe('Lagringen för äldre uppgifter', () => {
  test('filer äldre än lagringsklassens gräns flyttas till en egen databas och läses därifrån med samma innehåll', async () => {
    const db = nyDb();
    const nu = new Date();
    const g = gammalBild(db, { nu });
    const ny = gammalBild(db, { nu, ar: 1, namn: 'ny.png' });
    const pagar = gammalBild(db, { nu, namn: 'pagar.png', pagaende: true });
    const original = Buffer.from(mediaRad(db, g.m.id).data);
    // Den äldre databasen är en egen databas, kopplad till sandlådan.
    expect(db.query('PRAGMA database_list').all().map(d => d.name)).toContain('aldre');
    expect(aldre.kandidater(db, nu).media).toEqual(expect.arrayContaining([g.m.id]));
    const r = aldre.flytta(db, sysf(db), { nu });
    expect(r.filer).toBeGreaterThanOrEqual(1);
    expect(r.flyttEfterAr).toBe(3);
    // Innehållet ligger nu bara i den äldre databasen, och raden om filen står kvar i den aktiva.
    expect(mediaRad(db, g.m.id).data.length).toBe(0);
    expect(mediaRad(db, g.m.id)).toMatchObject({ namn: 'gammal.png', storlek: original.length, status: 'journal' });
    expect(Buffer.from(iAldre(db, g.m.id).data).equals(original)).toBe(true);
    // En fil från förra året och en fil i en pågående vårdkontakt flyttas inte.
    expect(mediaRad(db, ny.m.id).data.length).toBeGreaterThan(0);
    expect(mediaRad(db, pagar.m.id).data.length).toBeGreaterThan(0);
    expect(iAldre(db, ny.m.id)).toBeNull();
    expect(iAldre(db, pagar.m.id)).toBeNull();
    // Läkaren på vårdenheten läser filen som förut, med samma innehåll, och läsningen loggas som förut.
    const f = bilder.fil(atk(db, 'lak-med', 'p01', {}, 'las_journal'), mediaRad(db, g.m.id));
    expect((await text(f)).equals(original)).toBe(true);
    expect(db.query('SELECT count(*) AS n FROM atkomstlogg WHERE resurs = ?').get(`media:${g.m.id}`).n).toBe(1);
    // Listan i journalen ser likadan ut som före flytten: samma rad med samma namn, storlek och kontrollsumma.
    expect(bilder.mediaUt(db, mediaRad(db, g.m.id))).toMatchObject({ namn: 'gammal.png', sha256: g.m.sha256 });
    const l = aldre.lage(db, nu);
    expect(l.filer).toBeGreaterThanOrEqual(1);
    expect(l.databas.byte).toBeGreaterThan(0);
    expect(l.klass).toMatchObject({ id: 'aldre', flyttEfterAr: 3 });
  });

  test('flytten går att köra igen utan dubbletter, och inget försvinner', () => {
    const db = nyDb();
    const nu = new Date();
    const a = gammalBild(db, { nu, namn: 'a.png' });
    const b = gammalBild(db, { nu, namn: 'b.png', ar: 6 });
    const summor = () => [a.m.id, b.m.id].map(id => createHash('sha256').update(aldre.lasData(db, 'media', mediaRad(db, id))).digest('hex'));
    const fore = summor();
    aldre.flytta(db, sysf(db), { nu });
    const antal = db.query('SELECT count(*) AS n FROM aldre.filinnehall').get().n;
    const igen = aldre.flytta(db, sysf(db), { nu });
    expect(igen.filer).toBe(0);
    expect(db.query('SELECT count(*) AS n FROM aldre.filinnehall').get().n).toBe(antal);
    expect(summor()).toEqual(fore);
    expect(fore).toEqual([a.m.sha256, b.m.sha256]);
  });

  test('regeln och kontrollsumman prövas på varje rad, och en rad som inte stämmer stoppar hela flytten', () => {
    const db = nyDb();
    const nu = new Date();
    const ok = gammalBild(db, { nu, namn: 'ok.png' });
    const trasig = gammalBild(db, { nu, namn: 'trasig.png' });
    // En fil vars innehåll inte stämmer med kontrollsumman.
    db.exec('DROP TRIGGER media_andras_ej');
    db.query("UPDATE media SET sha256 = 'aaaa' WHERE id = ?").run(trasig.m.id);
    const e = fel(() => aldre.flytta(db, sysf(db), { nu }));
    expect(e?.status).toBe(409);
    expect(e.message).toBe('Flytten stoppades eftersom en fil inte kunde kontrolleras. Inget flyttades. Kontakta systemförvaltningen.');
    // Inget flyttades, inte heller den fil som stämde.
    expect(mediaRad(db, ok.m.id).data.length).toBeGreaterThan(0);
    expect(db.query('SELECT count(*) AS n FROM aldre.filinnehall').get().n).toBe(0);
  });

  test('behörighet och loggning: bara systemförvaltningen flyttar, och en flyttad fil prövas som förut', async () => {
    const db = nyDb();
    const nu = new Date();
    const g = gammalBild(db, { nu });
    expect(fel(() => aldre.flytta(db, personal(db, 'lak-med'), { nu }))?.status).toBe(403);
    aldre.flytta(db, sysf(db), { nu });
    // Läkaren på en annan vårdenhet behöver ett aktivt val, som innan filen flyttades.
    const utan = fel(() => bilder.fil(atk(db, 'lak-kard', 'p01', {}, 'las_journal'), mediaRad(db, g.m.id)));
    expect(utan?.status).toBe(403);
    const med = bilder.fil(atk(db, 'lak-kard', 'p01', { andra_enheter: true }, 'las_journal'), mediaRad(db, g.m.id));
    expect((await text(med)).length).toBe(g.m.storlek);
    // Flytten loggas utan patient och utan innehåll.
    const logg = db.query("SELECT * FROM atkomstlogg WHERE resurs = 'lagring:flytt' ORDER BY id DESC").get();
    expect(logg).toMatchObject({ personal_id: 'sysf', handling: 'lagring', patient_id: null });
    // Ett innehåll som inte stämmer med kontrollsumman lämnas aldrig ut.
    db.exec('DROP TRIGGER aldre.filinnehall_andras_ej');
    db.query("UPDATE aldre.filinnehall SET data = X'00' WHERE tabell = 'media' AND rad_id = ?").run(g.m.id);
    expect(fel(() => aldre.lasData(db, 'media', mediaRad(db, g.m.id)))?.status).toBe(503);
  });

  test('gallring och radering tar bort filen också i lagringen för äldre uppgifter', () => {
    const db = nyDb();
    const nu = new Date();
    const g = gammalBild(db, { nu, pid: 'p20' });
    aldre.flytta(db, sysf(db), { nu });
    expect(iAldre(db, g.m.id)).not.toBeNull();
    arkiv.radera(db, 'p20', { hela: true });
    expect(mediaRad(db, g.m.id)).toBeNull();
    expect(iAldre(db, g.m.id)).toBeNull();
  });

  test('sammanslagning av journaler: en flyttad fil följer med och går att läsa i den gällande journalen', async () => {
    const db = nyDb();
    const nu = new Date();
    const g = gammalBild(db, { nu, pid: 'p17', enhet: 'uso-kard' });
    aldre.flytta(db, sysf(db), { nu });
    slaSamman(db, { fran: 'p17', till: 'p16', personal: personal(db, 'adm-kard'), grund: 'samma_namn_fodd' });
    expect(mediaRad(db, g.m.id).patient_id).toBe('p16');
    const f = bilder.fil(atk(db, 'lak-kard', 'p16', {}, 'las_journal'), mediaRad(db, g.m.id));
    expect(createHash('sha256').update(await text(f)).digest('hex')).toBe(g.m.sha256);
  });

  test('säkerhetskopian, provåterläsningen, en ny miljö och uttaget per huvudman tar med den äldre databasen', () => {
    const db = nyDb();
    const nu = new Date();
    const g = gammalBild(db, { nu });
    aldre.flytta(db, sysf(db), { nu });
    // Ögonblicksbilden läses in i en ny databas där den äldre är en egen databas igen.
    const kopia = lagring.aterlas(lagring.sakerhetskopiera(db));
    try {
      expect(kopia.query('PRAGMA database_list').all().map(d => d.name)).toContain('aldre');
      expect(kopia.query("SELECT name FROM sqlite_master WHERE name = 'lagring_aldre_bild'").get()).toBeNull();
      expect(aldre.lasData(kopia, 'media', mediaRad(kopia, g.m.id)).length).toBe(g.m.storlek);
      const j = lagring.jamfor(db, kopia);
      expect(j.kontroller.find(k => k.id === 'aldre')).toMatchObject({ ok: true });
      expect(j.ok).toBe(true);
    } finally { kopia.close(); }
    expect(lagring.provaAterlasning(db, sysf(db), nu).ok).toBe(true);
    // Kopielagret skriver ögonblicksbilden med den äldre databasen.
    const lager = sakerhetskopior.skapaKopielager();
    const k = lager.ta('prov', db, { nu });
    const tillbaka = aldre.ny(lager.las('prov', k.id).data);
    try { expect(aldre.lasData(tillbaka, 'media', mediaRad(tillbaka, g.m.id)).length).toBe(g.m.storlek); } finally { tillbaka.close(); }
    // En acceptanstestmiljö är en kopia av produktionen, med den äldre databasen.
    const m = miljoer.skapa(db, 'acceptanstest', { nu });
    try { expect(aldre.lasData(m.db, 'media', mediaRad(m.db, g.m.id)).length).toBe(g.m.storlek); } finally { m.db.close(); }
    // Uttaget per huvudman har hela filen.
    const u = lagring.uttag(db, 'rol');
    try { expect(Buffer.from(u.db.query('SELECT data FROM media WHERE id = ?').get(g.m.id).data).length).toBe(g.m.storlek); } finally { u.db.close(); }
  });
});

describe('Lagringen för äldre uppgifter i API:t', () => {
  let app;
  beforeAll(() => { app = testserver(); });
  afterAll(() => app.stopp());

  test('API: systemförvaltaren ser lagringen för äldre uppgifter på sidan Lagring och flyttar, och svaret har inga patientuppgifter', async () => {
    const k = klient(app);
    await k.logga('sysf');
    const db = sandlada(app, k).db;
    gammalBild(db, { nu: new Date() });
    const fore = await k.get('/api/lagring');
    expect(fore.status).toBe(200);
    expect(fore.data.aldre.vantar.filer).toBeGreaterThanOrEqual(1);
    const r = await k.post('/api/lagring/flytt', {});
    expect(r.status).toBe(200);
    expect(r.data.filer).toBeGreaterThanOrEqual(1);
    const efter = await k.get('/api/lagring');
    expect(efter.data.aldre.vantar.filer).toBe(0);
    expect(efter.data.aldre.filer).toBeGreaterThanOrEqual(1);
    const svar = JSON.stringify([r.data, efter.data.aldre]);
    for (const p of db.query('SELECT fornamn, efternamn, personnummer FROM patienter').all()) {
      expect(svar.includes(p.personnummer)).toBe(false);
      expect(svar.includes(`${p.fornamn} ${p.efternamn}`)).toBe(false);
    }
    const lak = klient(app);
    await lak.logga('lak-kard');
    expect((await lak.post('/api/lagring/flytt', {})).status).toBe(403);
  });
});
