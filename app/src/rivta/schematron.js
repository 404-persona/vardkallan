// Testspår 2: Ineras Schematron-regler i domänernas testsviter (test-suite/<Kontrakt>/constraints.xml och
// schemas/engagementindex/*_ei_update_constraints.xml) körs som de står, mot Vårdkällans meddelanden och mot Ineras egna
// exempel. Reglerna är skrivna för XSLT 2 (queryBinding xslt2), och här finns den del av XPath 2 som de pinnade filerna
// använder: stegen ., .., *, *:namn, text(), namn med prefix, // och predikat, jämförelser, and, or, + och -, och
// funktionerna count, not, exists, matches, normalize-space, distinct-values, string, contains, starts-with,
// string-length och boolean. Abstrakta mönster med param och let i regler och schemat finns också. Ett uttryck som inte
// ingår ger ett fel när regeln läses, så att en regel aldrig tyst blir svagare än den är. Variabler i schemat räknas
// först när en regel använder dem. Samma motor kör Vårdkällans egna regler ur TKB (app/rivta-regler/<domän>/*.sch), där
// varje assert har regelns id.
//
//   const s = schematron(text);          // text är constraints.xml
//   const fel = s.prova(rot);           // rot är ett element ur xml.js tolka; ger [{ id, test, text, nod }]
import { tolka, barnen, attribut } from './xml.js';

export const ISO = 'http://purl.oclc.org/dsdl/schematron';
export class SchematronFel extends Error {}

// ---------------------------------------------------------------------------------------------------------------
// Noderna. Elementen ur xml.js får förälder och plats i dokumentet; text() är en egen nod.
function forbered(rot) {
  let n = 0;
  const ga = (el, far) => {
    Object.defineProperty(el, 'far', { value: far, enumerable: false, configurable: true });
    Object.defineProperty(el, 'ordning', { value: n++, enumerable: false, configurable: true });
    for (const b of el.barn) ga(b, el);
  };
  ga(rot, null);
  return rot;
}
const varde = (el) => (el.textnod ? el.varde : el.text + el.barn.map(varde).join(''));
const textnod = (el) => ({ textnod: true, varde: el.text, far: el, ordning: el.ordning + 0.5 });
const efterkommande = (el) => el.barn.flatMap(b => [b, ...efterkommande(b)]);

// ---------------------------------------------------------------------------------------------------------------
// Uttrycken tolkas till ett träd och räknas i en kontext { nod, ns, var }.
const TOKEN = /\s*(?:(\d+(?:\.\d+)?)|'([^']*)'|"([^"]*)"|(\*:[A-Za-z_][\w.-]*)|(\/\/|\/|\.\.|\.|\(|\)|\[|\]|,|!=|<=|>=|=|<|>|\+|-|\*|\|)|(\$[A-Za-z_][\w.-]*)|([A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?(?:\(\))?))/y;
function tokens(s) {
  const ut = [];
  TOKEN.lastIndex = 0;
  let i = 0;
  while (i < s.length) {
    if (/^\s*$/.test(s.slice(i))) break;
    TOKEN.lastIndex = i;
    const m = TOKEN.exec(s);
    if (!m) throw new SchematronFel(`Uttrycket ${s} kan inte läsas vid tecken ${i}.`);
    i = TOKEN.lastIndex;
    if (m[1] != null) ut.push({ t: 'tal', v: Number(m[1]) });
    else if (m[2] != null || m[3] != null) ut.push({ t: 'str', v: m[2] ?? m[3] });
    else if (m[4] != null) ut.push({ t: 'namn', v: m[4] });
    else if (m[5] != null) ut.push({ t: 'op', v: m[5] });
    else if (m[6] != null) ut.push({ t: 'var', v: m[6].slice(1) });
    else ut.push({ t: 'namn', v: m[7] });
  }
  return ut;
}

const FUNKTIONER = new Set(['count', 'not', 'exists', 'matches', 'normalize-space', 'distinct-values', 'string', 'contains', 'starts-with', 'string-length', 'boolean', 'format-date', 'current-date']);

function parsa(text) {
  const t = tokens(text);
  let p = 0;
  const titta = () => t[p];
  const ar = (v) => t[p] && t[p].t === 'op' && t[p].v === v;
  const ord = (v) => t[p] && t[p].t === 'namn' && t[p].v === v;
  const ta = (v) => { if (!ar(v)) throw new SchematronFel(`Uttrycket ${text} saknar ${v}.`); p++; };
  const eller = () => { let a = och(); while (ord('or')) { p++; a = { typ: 'or', a, b: och() }; } return a; };
  const och = () => { let a = jamfor(); while (ord('and')) { p++; a = { typ: 'and', a, b: jamfor() }; } return a; };
  const jamfor = () => {
    const a = summa();
    for (const op of ['=', '!=', '<=', '>=', '<', '>']) if (ar(op)) { p++; return { typ: 'jamfor', op, a, b: summa() }; }
    return a;
  };
  const summa = () => {
    let a = union();
    while (ar('+') || ar('-')) { const op = t[p++].v; a = { typ: 'aritm', op, a, b: union() }; }
    return a;
  };
  const union = () => { let a = vag(); while (ar('|')) { p++; a = { typ: 'union', a, b: vag() }; } return a; };
  // En väg: ett primärt uttryck följt av steg, eller bara steg.
  const vag = () => {
    let bas = null;
    const s = titta();
    if (!s) throw new SchematronFel(`Uttrycket ${text} tar slut för tidigt.`);
    if (s.t === 'tal') { p++; return { typ: 'tal', v: s.v }; }
    if (s.t === 'str') { p++; return { typ: 'str', v: s.v }; }
    if (s.t === 'var') { p++; bas = { typ: 'var', namn: s.v }; }
    else if (ar('(')) { p++; bas = eller(); ta(')'); }
    else if (s.t === 'namn' && FUNKTIONER.has(s.v) && t[p + 1]?.t === 'op' && t[p + 1].v === '(') {
      p += 2;
      const arg = [];
      if (!ar(')')) { arg.push(eller()); while (ar(',')) { p++; arg.push(eller()); } }
      ta(')');
      bas = { typ: 'fn', namn: s.v, arg };
    } else if (s.t === 'namn' && /\($/.test(s.v) === false && t[p + 1]?.t === 'op' && t[p + 1].v === '(' && !FUNKTIONER.has(s.v)) {
      throw new SchematronFel(`Funktionen ${s.v} i ${text} finns inte i den del av XPath som tas med.`);
    }
    const steg = [];
    let rot = false;
    if (!bas && ar('/')) { p++; rot = true; }
    if (!bas) steg.push(...stegen());
    else while (ar('/') || ar('//')) steg.push(...stegen());
    if (!bas && !steg.length && !rot) throw new SchematronFel(`Uttrycket ${text} kan inte läsas.`);
    return steg.length || rot ? { typ: 'vag', bas, rot, steg } : bas;
  };
  // Steg åtskilda av / eller //. Ger en lista med { axel, test, pred }.
  const stegen = () => {
    const ut = [];
    let axel = 'barn';
    for (;;) {
      if (ar('//')) { p++; ut.push({ axel: 'efter-eller-själv', test: { typ: 'nod' }, pred: [] }); }
      else if (ar('/') && ut.length) p++;
      const s = titta();
      if (!s) break;
      let steg;
      if (ar('.')) { p++; steg = { axel: 'själv', test: { typ: 'nod' } }; }
      else if (ar('..')) { p++; steg = { axel: 'förälder', test: { typ: 'nod' } }; }
      else if (ar('*')) { p++; steg = { axel, test: { typ: 'namn', namn: '*' } }; }
      else if (s.t === 'namn' && s.v === 'text()') { p++; steg = { axel, test: { typ: 'text' } }; }
      else if (s.t === 'namn' && !['and', 'or'].includes(s.v)) { p++; steg = { axel, test: { typ: 'namn', namn: s.v } }; }
      else break;
      steg.pred = [];
      while (ar('[')) { p++; steg.pred.push(eller()); ta(']'); }
      ut.push(steg);
      if (!(ar('/') || ar('//'))) break;
    }
    return ut;
  };
  const r = eller();
  if (p !== t.length) throw new SchematronFel(`Uttrycket ${text} har något efter slutet: ${t.slice(p).map(x => x.v).join(' ')}.`);
  return r;
}

// ---------------------------------------------------------------------------------------------------------------
const nodlista = (v) => Array.isArray(v);
const strang = (v) => (nodlista(v) ? (v.length ? varde(v[0]) : '') : typeof v === 'boolean' ? String(v) : typeof v === 'number' ? String(v) : v);
const sant = (v) => (nodlista(v) ? v.length > 0 : typeof v === 'string' ? v.length > 0 : typeof v === 'number' ? v !== 0 && !Number.isNaN(v) : Boolean(v));
const tal = (v) => { const s = strang(v).trim(); return s === '' ? NaN : Number(s); };

function namnMatchar(el, namn, ns) {
  if (!el || el.textnod) return false;
  if (namn === '*') return true;
  const i = namn.indexOf(':');
  const prefix = i < 0 ? '' : namn.slice(0, i);
  const lokal = i < 0 ? namn : namn.slice(i + 1);
  // *:namn (XPath 2) matchar namnet i vilken namnrymd som helst.
  if (prefix === '*') return el.lokal === lokal;
  const uri = prefix ? ns[prefix] : '';
  if (prefix && uri == null) throw new SchematronFel(`Prefixet ${prefix} är inte deklarerat i schemat.`);
  return el.lokal === lokal && el.ns === uri;
}

function steg(noder, s, k) {
  let ut = [];
  for (const n of noder) {
    let kand;
    if (s.axel === 'själv') kand = [n];
    else if (s.axel === 'förälder') kand = n.far ? [n.far] : [];
    else if (s.axel === 'efter-eller-själv') kand = n.textnod ? [n] : [n, ...efterkommande(n)];
    else kand = n.textnod ? [] : s.test.typ === 'text' ? (n.text !== '' ? [textnod(n)] : []) : n.barn;
    kand = kand.filter(x => (s.test.typ === 'nod' ? true : s.test.typ === 'text' ? x.textnod : namnMatchar(x, s.test.namn, k.ns)));
    for (const p of s.pred) {
      kand = kand.filter((x, i) => {
        const v = rakna(p, { ...k, nod: x });
        return typeof v === 'number' ? v === i + 1 : sant(v);
      });
    }
    ut.push(...kand);
  }
  // Unika noder i dokumentets ordning.
  ut = [...new Set(ut)].sort((a, b) => a.ordning - b.ordning);
  return ut;
}

function jamforVarden(op, a, b) {
  const lista = (v) => (nodlista(v) ? v.map(varde) : [v]);
  const xs = lista(a);
  const ys = lista(b);
  const numerisk = typeof a === 'number' || typeof b === 'number' || ['<', '>', '<=', '>='].includes(op);
  for (const x of xs) for (const y of ys) {
    const [p, q] = numerisk ? [tal(x), tal(y)] : typeof x === 'boolean' || typeof y === 'boolean' ? [sant(x), sant(y)] : [String(x), String(y)];
    if ((op === '=' && p === q) || (op === '!=' && p !== q) || (op === '<' && p < q) || (op === '>' && p > q) || (op === '<=' && p <= q) || (op === '>=' && p >= q)) return true;
  }
  return false;
}

function rakna(u, k) {
  switch (u.typ) {
    case 'tal': return u.v;
    case 'str': return u.v;
    case 'or': return sant(rakna(u.a, k)) || sant(rakna(u.b, k));
    case 'and': return sant(rakna(u.a, k)) && sant(rakna(u.b, k));
    case 'jamfor': return jamforVarden(u.op, rakna(u.a, k), rakna(u.b, k));
    case 'aritm': { const a = tal(rakna(u.a, k)); const b = tal(rakna(u.b, k)); return u.op === '+' ? a + b : a - b; }
    case 'union': return [...new Set([...rakna(u.a, k), ...rakna(u.b, k)])].sort((x, y) => x.ordning - y.ordning);
    case 'var': {
      if (!Object.hasOwn(k.var, u.namn)) throw new SchematronFel(`Variabeln $${u.namn} finns inte.`);
      return k.var[u.namn](k);
    }
    case 'vag': {
      let noder = u.bas ? rakna(u.bas, k) : u.rot ? [rotAv(k.nod)] : [k.nod];
      if (!nodlista(noder)) throw new SchematronFel('Ett steg efter ett värde som inte är noder.');
      for (const s of u.steg) noder = steg(noder, s, k);
      return noder;
    }
    case 'fn': {
      const a = u.arg.map(x => () => rakna(x, k));
      switch (u.namn) {
        case 'count': return a[0]().length;
        case 'not': return !sant(a[0]());
        case 'exists': return a[0]().length > 0;
        case 'string': return strang(a[0]());
        case 'contains': return strang(a[0]()).includes(strang(a[1]()));
        case 'starts-with': return strang(a[0]()).startsWith(strang(a[1]()));
        case 'string-length': return strang(u.arg.length ? a[0]() : [k.nod]).length;
        case 'boolean': return sant(a[0]());
        case 'normalize-space': return strang(u.arg.length ? a[0]() : [k.nod]).replace(/[ \t\r\n]+/g, ' ').trim();
        case 'matches': return new RegExp(strang(a[1]()), 'u').test(strang(a[0]()));
        case 'distinct-values': return [...new Set(a[0]().map(varde))];
        default: throw new SchematronFel(`Funktionen ${u.namn} kan bara stå i en variabel som ingen regel använder.`);
      }
    }
    default: throw new SchematronFel(`Okänt uttryck ${u.typ}.`);
  }
}
const rotAv = (n) => { let x = n; while (x.far) x = x.far; return x; };

// Ett mönster i en regels context (XSLT-mönster): steg från höger till vänster, med / för förälder och // för en förfader.
function parsaMonster(text) {
  const u = parsa(text);
  if (u.typ !== 'vag' || u.bas || u.rot) throw new SchematronFel(`Regelns context ${text} är inget mönster som tas med.`);
  return u.steg;
}
function matcharMonster(nod, stegen, k) {
  const prova = (n, i) => {
    if (i < 0) return true;
    const s = stegen[i];
    // // mellan två steg: noden här är föräldern till nästa stegs nod, och föregående steg ska matcha den eller en förfader.
    if (s.axel === 'efter-eller-själv') {
      for (let f = n; f; f = f.far) if (prova(f, i - 1)) return true;
      return false;
    }
    if (!n) return false;
    if (s.axel !== 'barn') throw new SchematronFel('Ett mönster med . eller .. tas inte med.');
    if (s.test.typ === 'text' ? !n.textnod : !namnMatchar(n, s.test.namn, k.ns)) return false;
    for (const p of s.pred) if (!sant(rakna(p, { ...k, nod: n }))) return false;
    // Föregående steg gäller föräldern (eller, efter //, föräldern eller en förfader).
    if (i === 0) return true;
    return prova(n.far, i - 1);
  };
  return prova(nod, stegen.length - 1);
}

// ---------------------------------------------------------------------------------------------------------------
// Schemat. Mönster med is-a ersätter $param i context och test med värdena, som ISO Schematron gör.
export function schematron(text) {
  const rot = tolka(text, { element: 200_000 });
  if (rot.lokal !== 'schema' || rot.ns !== ISO) throw new SchematronFel('Filen är inget ISO Schematron-schema.');
  const qb = attribut(rot, 'queryBinding');
  if (qb && !/^xslt2?$/.test(qb)) throw new SchematronFel(`queryBinding ${qb} tas inte med.`);
  const ns = Object.fromEntries(barnen(rot, 'ns', ISO).map(n => [attribut(n, 'prefix'), attribut(n, 'uri')]));
  const letAv = (el) => barnen(el, 'let', ISO).map(l => ({ namn: attribut(l, 'name'), u: parsa(attribut(l, 'value')) }));
  const globala = letAv(rot);
  const monster = barnen(rot, 'pattern', ISO);
  const abstrakta = new Map(monster.filter(m => attribut(m, 'abstract') === 'true').map(m => [attribut(m, 'id'), m]));
  const ersatt = (s, param) => s.replace(/\$([A-Za-z_][\w.-]*)/g, (m, n) => (Object.hasOwn(param, n) ? param[n] : m));
  const instanser = [];
  for (const m of monster) {
    if (attribut(m, 'abstract') === 'true') continue;
    const isA = attribut(m, 'is-a');
    const mall = isA ? abstrakta.get(isA) : m;
    if (!mall) throw new SchematronFel(`Mönstret ${isA} finns inte.`);
    const param = Object.fromEntries(barnen(m, 'param', ISO).map(p => [attribut(p, 'name'), attribut(p, 'value')]));
    const regler = barnen(mall, 'rule', ISO).map(r => {
      if (attribut(r, 'abstract') === 'true' || barnen(r, 'extends', ISO).length) throw new SchematronFel('Abstrakta regler och extends tas inte med.');
      const context = ersatt(attribut(r, 'context'), param);
      return {
        context, monster: parsaMonster(context), let: letAv(r).map(l => ({ ...l, u: parsa(ersatt(attribut(barnen(r, 'let', ISO).find(x => attribut(x, 'name') === l.namn), 'value'), param)) })),
        asserts: [...barnen(r, 'assert', ISO).map(a => ({ typ: 'assert', a })), ...barnen(r, 'report', ISO).map(a => ({ typ: 'report', a }))].map(({ typ, a }) => {
          const test = ersatt(attribut(a, 'test'), param);
          const meddelande = (el) => el.text + el.barn.map(b => (b.lokal === 'name' ? '{nod}' : meddelande(b))).join('');
          return { typ, test, u: parsa(test), text: meddelande(a).replace(/\s+/g, ' ').trim(), id: attribut(a, 'id') };
        }),
      };
    });
    instanser.push({ id: attribut(m, 'id') ?? isA ?? null, regler });
  }
  const antal = instanser.reduce((s, i) => s + i.regler.reduce((t, r) => t + r.asserts.length, 0), 0);
  return {
    ns, antal, monster: instanser,
    // Prövar dokumentet. Varje mönster för sig: en nod prövas av den första regeln i mönstret vars context matchar.
    prova(dokument) {
      const d = forbered(dokument);
      const noder = [d, ...efterkommande(d)];
      const fel = [];
      const variabler = (lista, bas) => {
        const v = { ...bas };
        for (const l of lista) {
          let cache;
          v[l.namn] = (k) => (cache === undefined ? (cache = rakna(l.u, { ...k, var: v })) : cache);
        }
        return v;
      };
      const glob = variabler(globala, {});
      for (const m of instanser) {
        for (const n of noder) {
          const k0 = { nod: n, ns, var: glob };
          const r = m.regler.find(x => matcharMonster(n, x.monster, k0));
          if (!r) continue;
          const k = { nod: n, ns, var: variabler(r.let, glob) };
          for (const a of r.asserts) {
            const ok = sant(rakna(a.u, k));
            if ((a.typ === 'assert' && !ok) || (a.typ === 'report' && ok)) fel.push({ id: a.id, monster: m.id, context: r.context, test: a.test, text: a.text.replace('{nod}', n.lokal), nod: vagTill(n) });
          }
        }
      }
      return fel;
    },
  };
}

const vagTill = (n) => { const d = []; for (let x = n; x; x = x.far) d.unshift(x.lokal); return `/${d.join('/')}`; };
