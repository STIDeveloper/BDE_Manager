// FICHIER GÉNÉRÉ par scripts/build-edge.mjs — ne pas modifier ici (source : src/forms/).
// ============================================================
// Moteur de formulaires — langage de formules
// ============================================================
// Analyseur (parseExpr) + évaluateur sûr (evaluate). Aucune exécution
// de code : l'AST ne contient que des littéraux, des références, des
// opérateurs et des appels aux fonctions de la table FUNCTIONS.
// Bornes : 2 000 caractères, 1 000 lexèmes, profondeur 60. Aucune
// boucle dans le langage → évaluation toujours finie.
// Documentation utilisateur : ./README.md

import {
  hasOwn, isEmpty, toNumber, cleanNumber, truthy, toText, fold, looseEqual,
  compareValues, flatValues, parseDate, ymdToIso, ymdToDays, daysToIso,
  isDateLike, todayIso, MAX_TEXT, isPlainObject,
} from './values.js';

export const MAX_SOURCE_LENGTH = 2000;
export const MAX_TOKENS = 1000;
export const MAX_DEPTH = 60;

/** Erreur de syntaxe d'une formule (message en français, position 0-based dans la source). */
export class ExprError extends Error {
  constructor(message, position = 0) {
    super(`${message} (caractère ${position + 1})`);
    this.name = 'ExprError';
    this.detail = message;
    this.position = position;
  }
}

export const EMAIL_RX = /^[^\s@"<>(),;:\\[\]]+@[^\s@"<>(),;:\\[\]]+\.[a-z]{2,}$/i;
export const isEmail = v => typeof v === 'string' && v.length <= 254 && EMAIL_RX.test(v.trim());

// Segments interdits dans une référence a.b.c (protection des prototypes)
const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor', '__defineGetter__',
  '__defineSetter__', '__lookupGetter__', '__lookupSetter__']);

// ── Lexer ───────────────────────────────────────────────────

const ID_START = /[A-Za-z_À-ɏ]/;
const ID_PART = /[A-Za-z0-9_À-ɏ]/;
const OPS2 = ['<=', '>=', '<>', '!=', '==', '&&', '||'];
const OPS1 = ['=', '<', '>', '+', '-', '*', '/', '%', '&', '!', '(', ')', ';', ',', '.', '≠', '≤', '≥'];
const UNICODE_OPS = { '≠': '<>', '≤': '<=', '≥': '>=' };

function tokenize(src) {
  const tokens = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\u00a0' || c === '\u202f') { i++; continue; }
    if (tokens.length >= MAX_TOKENS) throw new ExprError(`Formule trop longue (plus de ${MAX_TOKENS} éléments)`, i);
    const start = i;
    // Nombre : 12, 12.5, 12,5 (virgule décimale seulement si collée entre deux chiffres)
    if (c >= '0' && c <= '9') {
      while (i < n && src[i] >= '0' && src[i] <= '9') i++;
      if ((src[i] === '.' || src[i] === ',') && src[i + 1] >= '0' && src[i + 1] <= '9') {
        i++;
        while (i < n && src[i] >= '0' && src[i] <= '9') i++;
      }
      if (i < n && ID_START.test(src[i])) throw new ExprError(`Nombre mal formé « ${src.slice(start, i + 1)} »`, start);
      const value = Number(src.slice(start, i).replace(',', '.'));
      tokens.push({ t: 'num', v: value, pos: start });
      continue;
    }
    // Chaîne : "…" ou '…' (guillemet doublé ou \" pour l'échapper)
    if (c === '"' || c === "'" || c === '“' || c === '«') {
      const close = c === '“' ? '”' : c === '«' ? '»' : c;
      i++;
      let out = '';
      let closed = false;
      while (i < n) {
        const ch = src[i];
        if (ch === '\\' && i + 1 < n) {
          const e = src[i + 1];
          out += e === 'n' ? '\n' : e === 't' ? '\t' : e;
          i += 2;
          continue;
        }
        if (ch === close) {
          if (src[i + 1] === close && close === c) { out += ch; i += 2; continue; }
          i++;
          closed = true;
          break;
        }
        out += ch;
        i++;
      }
      if (!closed) throw new ExprError('Texte non terminé : il manque le guillemet fermant', start);
      tokens.push({ t: 'str', v: close === '»' ? out.trim() : out, pos: start });
      continue;
    }
    if (ID_START.test(c)) {
      while (i < n && ID_PART.test(src[i])) i++;
      tokens.push({ t: 'id', v: src.slice(start, i), pos: start });
      continue;
    }
    const two = src.slice(i, i + 2);
    if (OPS2.includes(two)) { tokens.push({ t: 'op', v: two, pos: start }); i += 2; continue; }
    if (OPS1.includes(c)) { tokens.push({ t: 'op', v: UNICODE_OPS[c] || c, pos: start }); i++; continue; }
    if (c === '$' || c === '`' || c === '{' || c === '}' || c === '[' || c === ']') {
      throw new ExprError(`Caractère « ${c} » non autorisé dans une formule`, start);
    }
    throw new ExprError(`Caractère inattendu « ${c} »`, start);
  }
  tokens.push({ t: 'eof', v: '', pos: n });
  return tokens;
}

// ── Fonctions ───────────────────────────────────────────────

const normName = name => fold(name).toUpperCase().replace(/_/g, '');

const num = (ctx, v, fn) => {
  if (isEmpty(v)) return null;
  const n = toNumber(v);
  if (n === null) ctx.diag(`${fn} : « ${toText(v).slice(0, 40)} » n'est pas un nombre`);
  return n;
};

function numbersOf(args) {
  const out = [];
  for (const v of flatValues(args)) {
    if (isEmpty(v)) continue;
    const n = toNumber(v);
    if (n !== null) out.push(n);
  }
  return out;
}

function dateArg(ctx, v, fn) {
  if (isEmpty(v)) return null;
  const p = parseDate(v);
  if (!p) ctx.diag(`${fn} : « ${toText(v).slice(0, 40)} » n'est pas une date valide`);
  return p;
}

function minMax(args, sign) {
  const vals = flatValues(args).filter(v => !isEmpty(v));
  if (!vals.length) return null;
  if (vals.every(v => toNumber(v) === null && isDateLike(v))) {
    const isos = vals.map(v => ymdToIso(parseDate(v))).sort();
    return sign < 0 ? isos[0] : isos[isos.length - 1];
  }
  const nums = numbersOf(vals);
  if (!nums.length) return null;
  return sign < 0 ? Math.min(...nums) : Math.max(...nums);
}

/**
 * Table des fonctions. `lazy` : les arguments sont des AST évalués à la demande.
 * doc : utilisé par l'aide intégrée de l'éditeur (FUNCTION_DOCS).
 */
const FUNCTIONS = {
  SI: {
    min: 2, max: 3, lazy: true,
    sig: 'SI(condition; si_vrai; si_faux)', desc: 'Renvoie si_vrai quand la condition est vraie, sinon si_faux (vide si absent).',
    ex: 'SI(age >= 18; "Majeur"; "Mineur")',
    fn: (ctx, a) => (truthy(ctx.ev(a[0])) ? ctx.ev(a[1]) : a[2] ? ctx.ev(a[2]) : null),
  },
  ET: {
    min: 1, max: 50, lazy: true, sig: 'ET(c1; c2; …)', desc: 'Vrai si toutes les conditions sont vraies.', ex: 'ET(age >= 18; adherent)',
    fn: (ctx, a) => a.every(x => truthy(ctx.ev(x))),
  },
  OU: {
    min: 1, max: 50, lazy: true, sig: 'OU(c1; c2; …)', desc: 'Vrai si au moins une condition est vraie.', ex: 'OU(role = "president"; role = "tresorier")',
    fn: (ctx, a) => a.some(x => truthy(ctx.ev(x))),
  },
  NON: { min: 1, max: 1, sig: 'NON(condition)', desc: 'Inverse une condition.', ex: 'NON(VIDE(email))', fn: (_c, [v]) => !truthy(v) },
  SOMME: {
    min: 1, max: 100, sig: 'SOMME(a; b; …)', desc: 'Somme des nombres (les listes sont additionnées, les vides ignorés).', ex: 'SOMME(note_1; note_2; note_3)',
    fn: (_c, a) => numbersOf(a).reduce((s, x) => s + x, 0),
  },
  MOYENNE: {
    min: 1, max: 100, sig: 'MOYENNE(a; b; …)', desc: 'Moyenne des nombres renseignés (vide si aucun).', ex: 'MOYENNE(note_1; note_2)',
    fn: (_c, a) => { const n = numbersOf(a); return n.length ? n.reduce((s, x) => s + x, 0) / n.length : null; },
  },
  MIN: { min: 1, max: 100, sig: 'MIN(a; b; …)', desc: 'Plus petite valeur (nombres ou dates).', ex: 'MIN(prix_1; prix_2)', fn: (_c, a) => minMax(a, -1) },
  MAX: { min: 1, max: 100, sig: 'MAX(a; b; …)', desc: 'Plus grande valeur (nombres ou dates).', ex: 'MAX(0; budget - depenses)', fn: (_c, a) => minMax(a, 1) },
  ARRONDI: {
    min: 1, max: 2, sig: 'ARRONDI(nombre; décimales)', desc: 'Arrondit au plus proche (0 décimale par défaut).', ex: 'ARRONDI(total / 3; 2)',
    fn: (ctx, [v, d]) => {
      const x = num(ctx, v, 'ARRONDI');
      if (x === null) return null;
      const digits = Math.max(-10, Math.min(10, Math.trunc(toNumber(d) ?? 0)));
      const f = 10 ** digits;
      return Math.sign(x) * Math.round((Math.abs(x) + Number.EPSILON) * f) / f;
    },
  },
  ABS: { min: 1, max: 1, sig: 'ABS(nombre)', desc: 'Valeur absolue.', ex: 'ABS(ecart)', fn: (ctx, [v]) => { const x = num(ctx, v, 'ABS'); return x === null ? null : Math.abs(x); } },
  LONGUEUR: {
    min: 1, max: 1, sig: 'LONGUEUR(texte)', desc: 'Nombre de caractères d\'un texte (ou d\'éléments d\'une liste).', ex: 'LONGUEUR(motivation) >= 200',
    fn: (_c, [v]) => (Array.isArray(v) ? v.length : toText(v).length),
  },
  CONTIENT: {
    min: 2, max: 2, sig: 'CONTIENT(texte_ou_liste; valeur)', desc: 'Vrai si le texte contient la valeur (sans tenir compte de la casse ni des accents) ou si la liste/sélection contient la valeur.',
    ex: 'CONTIENT(activites; "escalade")',
    fn: (_c, [h, nd]) => {
      if (isEmpty(nd) || isEmpty(h)) return false;
      if (Array.isArray(h)) return h.some(x => looseEqual(x, nd));
      if (isPlainObject(h)) return Object.keys(h).some(k => looseEqual(h[k], nd) || (Array.isArray(h[k]) && h[k].some(x => looseEqual(x, nd))));
      return fold(toText(h)).includes(fold(toText(nd)));
    },
  },
  NB: {
    min: 1, max: 1, sig: 'NB(liste)', desc: 'Nombre d\'éléments sélectionnés / renseignés (0 si vide).', ex: 'NB(activites) <= 3',
    fn: (_c, [v]) => {
      if (isEmpty(v)) return 0;
      if (Array.isArray(v)) return v.filter(x => !isEmpty(x)).length;
      if (isPlainObject(v)) return Object.keys(v).filter(k => !isEmpty(v[k])).length;
      return 1;
    },
  },
  VIDE: { min: 1, max: 1, sig: 'VIDE(valeur)', desc: 'Vrai si la valeur n\'est pas renseignée.', ex: 'VIDE(telephone)', fn: (_c, [v]) => isEmpty(v) },
  NONVIDE: { name: 'NON_VIDE', min: 1, max: 1, sig: 'NON_VIDE(valeur)', desc: 'Vrai si la valeur est renseignée.', ex: 'NON_VIDE(allergies)', fn: (_c, [v]) => !isEmpty(v) },
  CONCAT: {
    min: 1, max: 100, sig: 'CONCAT(a; b; …)', desc: 'Met bout à bout des textes (équivaut à a & b).', ex: 'CONCAT(prenom; " "; nom)',
    fn: (_c, a) => a.map(toText).join(''),
  },
  MAJUSCULE: { min: 1, max: 1, sig: 'MAJUSCULE(texte)', desc: 'Met en majuscules.', ex: 'MAJUSCULE(nom)', fn: (_c, [v]) => toText(v).toLocaleUpperCase('fr') },
  MINUSCULE: { min: 1, max: 1, sig: 'MINUSCULE(texte)', desc: 'Met en minuscules.', ex: 'MINUSCULE(email)', fn: (_c, [v]) => toText(v).toLocaleLowerCase('fr') },
  TEXTE: { min: 1, max: 1, sig: 'TEXTE(valeur)', desc: 'Convertit en texte.', ex: 'TEXTE(total) & " €"', fn: (_c, [v]) => toText(v) },
  NOMBRE: { min: 1, max: 1, sig: 'NOMBRE(texte)', desc: 'Convertit en nombre (vide si impossible).', ex: 'NOMBRE(code_postal)', fn: (_c, [v]) => toNumber(v) },
  AUJOURDHUI: { min: 0, max: 0, sig: 'AUJOURDHUI()', desc: 'Date du jour (fuseau Europe/Paris).', ex: 'date_event >= AUJOURDHUI()', fn: ctx => todayIso(ctx.now, ctx.timeZone) },
  ANNEE: { min: 1, max: 1, sig: 'ANNEE(date)', desc: 'Année d\'une date.', ex: 'ANNEE(naissance)', fn: (ctx, [v]) => dateArg(ctx, v, 'ANNEE')?.y ?? null },
  MOIS: { min: 1, max: 1, sig: 'MOIS(date)', desc: 'Mois d\'une date (1 à 12).', ex: 'MOIS(date_arrivee)', fn: (ctx, [v]) => dateArg(ctx, v, 'MOIS')?.m ?? null },
  JOUR: { min: 1, max: 1, sig: 'JOUR(date)', desc: 'Jour du mois d\'une date (1 à 31).', ex: 'JOUR(date_arrivee)', fn: (ctx, [v]) => dateArg(ctx, v, 'JOUR')?.d ?? null },
  AGE: {
    min: 1, max: 2, sig: 'AGE(date_naissance; date_reference)', desc: 'Âge en années révolues (à aujourd\'hui par défaut).', ex: 'AGE(naissance) >= 18',
    fn: (ctx, [v, r]) => {
      const b = dateArg(ctx, v, 'AGE');
      if (!b) return null;
      const ref = r === undefined || isEmpty(r) ? parseDate(todayIso(ctx.now, ctx.timeZone)) : dateArg(ctx, r, 'AGE');
      if (!ref) return null;
      const age = ref.y - b.y - (ref.m < b.m || (ref.m === b.m && ref.d < b.d) ? 1 : 0);
      if (age < 0) { ctx.diag('AGE : la date de naissance est dans le futur'); return null; }
      return age;
    },
  },
  JOURSENTRE: {
    name: 'JOURS_ENTRE', min: 2, max: 2, sig: 'JOURS_ENTRE(date_debut; date_fin)', desc: 'Nombre de jours de date_debut à date_fin (négatif si date_fin est avant).',
    ex: 'JOURS_ENTRE(arrivee; depart)',
    fn: (ctx, [a, b]) => {
      const da = dateArg(ctx, a, 'JOURS_ENTRE'), db = dateArg(ctx, b, 'JOURS_ENTRE');
      return da && db ? ymdToDays(db) - ymdToDays(da) : null;
    },
  },
  DATE: {
    min: 3, max: 3, sig: 'DATE(année; mois; jour)', desc: 'Construit une date.', ex: 'naissance <= DATE(2008; 9; 1)',
    fn: (ctx, [y, m, d]) => {
      const yy = num(ctx, y, 'DATE'), mm = num(ctx, m, 'DATE'), dd = num(ctx, d, 'DATE');
      if (yy === null || mm === null || dd === null) return null;
      const t = Date.UTC(Math.trunc(yy), Math.trunc(mm) - 1, Math.trunc(dd));
      if (!Number.isFinite(t) || yy < 1 || yy > 9999) { ctx.diag('DATE : date hors limites'); return null; }
      return daysToIso(Math.floor(t / 86400000));
    },
  },
  ESTEMAIL: { name: 'EST_EMAIL', min: 1, max: 1, sig: 'EST_EMAIL(texte)', desc: 'Vrai si le texte est une adresse e-mail valide.', ex: 'EST_EMAIL(email_parent)', fn: (_c, [v]) => isEmail(v) },
  CHOIX: {
    min: 3, max: 101, lazy: true, sig: 'CHOIX(valeur; cas1; résultat1; cas2; résultat2; …; défaut)',
    desc: 'Renvoie le résultat associé au cas égal à la valeur (dernier argument facultatif : valeur par défaut).',
    ex: 'CHOIX(formule; "complete"; 45; "soiree"; 20; 0)',
    fn: (ctx, a) => {
      const v = ctx.ev(a[0]);
      let i = 1;
      for (; i + 1 < a.length; i += 2) if (looseEqual(v, ctx.ev(a[i]))) return ctx.ev(a[i + 1]);
      return i < a.length ? ctx.ev(a[i]) : null;
    },
  },
  SCORE: { min: 0, max: 0, sig: 'SCORE()', desc: 'Score courant du quiz (vide si le formulaire n\'est pas noté).', ex: 'SI(SCORE() >= 15; "Admis"; "Refusé")', fn: ctx => ctx.score ?? null },
  NBREPONSES: {
    name: 'NB_REPONSES', min: 0, max: 1, sig: 'NB_REPONSES()', desc: 'Nombre de réponses déjà reçues (connu seulement côté serveur, pour les quotas).',
    ex: 'NB_REPONSES() < 100', fn: ctx => (ctx.stats && typeof ctx.stats.total === 'number' ? ctx.stats.total : null),
  },
  VRAI: { min: 0, max: 0, sig: 'VRAI', desc: 'Valeur logique vraie.', ex: 'adherent = VRAI', fn: () => true },
  FAUX: { min: 0, max: 0, sig: 'FAUX', desc: 'Valeur logique fausse.', ex: 'adherent = FAUX', fn: () => false },
};

// Alias (anglais / Excel)
const ALIASES = {
  IF: 'SI', AND: 'ET', OR: 'OU', NOT: 'NON', SUM: 'SOMME', AVERAGE: 'MOYENNE', ROUND: 'ARRONDI', LEN: 'LONGUEUR',
  CONTAINS: 'CONTIENT', COUNT: 'NB', ISBLANK: 'VIDE', UPPER: 'MAJUSCULE', LOWER: 'MINUSCULE', TODAY: 'AUJOURDHUI',
  YEAR: 'ANNEE', CONCATENER: 'CONCAT', CONCATENATE: 'CONCAT', TRUE: 'VRAI', FALSE: 'FAUX', ESTVIDE: 'VIDE',
};

for (const k of Object.keys(FUNCTIONS)) if (!FUNCTIONS[k].name) FUNCTIONS[k].name = k;
Object.freeze(FUNCTIONS);

function lookupFunction(name) {
  let k = normName(name);
  if (hasOwn(ALIASES, k)) k = ALIASES[k];
  return hasOwn(FUNCTIONS, k) ? FUNCTIONS[k] : null;
}

/** Documentation des fonctions (aide intégrée / autocomplétion de l'éditeur). */
export const FUNCTION_DOCS = Object.freeze(
  Object.values(FUNCTIONS)
    .filter(f => f.name !== 'VRAI' && f.name !== 'FAUX')
    .map(f => Object.freeze({ name: f.name, signature: f.sig, description: f.desc, example: f.ex, minArgs: f.min, maxArgs: f.max })),
);

// ── Parseur ─────────────────────────────────────────────────

const KW = { ET: 'ET', AND: 'ET', OU: 'OU', OR: 'OU', NON: 'NON', NOT: 'NON' };
const LITERALS = { VRAI: true, TRUE: true, FAUX: false, FALSE: false };
const CMP_OPS = new Set(['=', '==', '<>', '!=', '<', '<=', '>', '>=']);

function deepFreeze(node) {
  if (node && typeof node === 'object') {
    for (const k of Object.keys(node)) deepFreeze(node[k]);
    Object.freeze(node);
  }
  return node;
}

class Parser {
  constructor(src) {
    this.src = src;
    this.tokens = tokenize(src);
    this.i = 0;
    this.depth = 0;
  }
  peek(o = 0) { return this.tokens[Math.min(this.i + o, this.tokens.length - 1)]; }
  next() { return this.tokens[this.i++]; }
  isOp(v, o = 0) { const t = this.peek(o); return t.t === 'op' && t.v === v; }
  kw(o = 0) {
    const t = this.peek(o);
    if (t.t !== 'id') return null;
    const k = normName(t.v);
    return hasOwn(KW, k) ? KW[k] : null;
  }
  enter(pos) {
    if (++this.depth > MAX_DEPTH) throw new ExprError('Formule trop imbriquée', pos);
  }
  leave() { this.depth--; }

  parse() {
    if (!this.src.trim()) throw new ExprError('Formule vide', 0);
    const node = this.parseOr();
    const t = this.peek();
    if (t.t !== 'eof') {
      if (t.t === 'op' && t.v === ')') throw new ExprError('Parenthèse fermante en trop', t.pos);
      throw new ExprError(`« ${tokenText(t)} » inattendu : un opérateur manque-t-il ?`, t.pos);
    }
    return node;
  }
  parseOr() {
    let left = this.parseAnd();
    while (this.isOp('||') || this.kw() === 'OU') {
      const t = this.next();
      left = { type: 'logic', op: 'OU', left, right: this.parseAnd(), pos: t.pos };
    }
    return left;
  }
  parseAnd() {
    let left = this.parseNot();
    while (this.isOp('&&') || this.kw() === 'ET') {
      const t = this.next();
      left = { type: 'logic', op: 'ET', left, right: this.parseNot(), pos: t.pos };
    }
    return left;
  }
  parseNot() {
    if (this.isOp('!') || (this.kw() === 'NON' && !this.isOp('(', 1))) {
      const t = this.next();
      this.enter(t.pos);
      const arg = this.parseNot();
      this.leave();
      return { type: 'unary', op: 'NON', arg, pos: t.pos };
    }
    return this.parseCmp();
  }
  parseCmp() {
    let left = this.parseConcat();
    while (this.peek().t === 'op' && CMP_OPS.has(this.peek().v)) {
      const t = this.next();
      const op = t.v === '==' ? '=' : t.v === '!=' ? '<>' : t.v;
      left = { type: 'binary', op, left, right: this.parseConcat(), pos: t.pos };
    }
    return left;
  }
  parseConcat() {
    let left = this.parseAdd();
    while (this.isOp('&')) {
      const t = this.next();
      left = { type: 'binary', op: '&', left, right: this.parseAdd(), pos: t.pos };
    }
    return left;
  }
  parseAdd() {
    let left = this.parseMul();
    while (this.isOp('+') || this.isOp('-')) {
      const t = this.next();
      left = { type: 'binary', op: t.v, left, right: this.parseMul(), pos: t.pos };
    }
    return left;
  }
  parseMul() {
    let left = this.parseUnary();
    while (this.isOp('*') || this.isOp('/') || this.isOp('%')) {
      const t = this.next();
      left = { type: 'binary', op: t.v, left, right: this.parseUnary(), pos: t.pos };
    }
    return left;
  }
  parseUnary() {
    if (this.isOp('-') || this.isOp('+')) {
      const t = this.next();
      this.enter(t.pos);
      const arg = this.parseUnary();
      this.leave();
      return t.v === '-' ? { type: 'unary', op: '-', arg, pos: t.pos } : arg;
    }
    return this.parsePrimary();
  }
  parsePrimary() {
    const t = this.peek();
    if (t.t === 'num') { this.next(); return { type: 'lit', value: t.v, pos: t.pos }; }
    if (t.t === 'str') { this.next(); return { type: 'lit', value: t.v, pos: t.pos }; }
    if (t.t === 'op' && t.v === '(') {
      this.next();
      this.enter(t.pos);
      if (this.isOp(')')) throw new ExprError('Parenthèses vides', t.pos);
      const inner = this.parseOr();
      this.leave();
      if (!this.isOp(')')) throw new ExprError('Parenthèse fermante manquante', this.peek().pos);
      this.next();
      return inner;
    }
    if (t.t === 'id') {
      const isCall = this.isOp('(', 1);
      const k = normName(t.v);
      if (isCall) return this.parseCall();
      if (hasOwn(LITERALS, k)) { this.next(); return { type: 'lit', value: LITERALS[k], pos: t.pos }; }
      if (k === 'VIDE' || k === 'NULL') { this.next(); return { type: 'lit', value: null, pos: t.pos }; }
      if (k === 'NON' || k === 'NOT') {
        this.next();
        this.enter(t.pos);
        const arg = this.parseUnary();
        this.leave();
        return { type: 'unary', op: 'NON', arg, pos: t.pos };
      }
      if (hasOwn(KW, k)) throw new ExprError(`Opérateur ${KW[k]} inattendu : il manque une valeur avant`, t.pos);
      return this.parseRef();
    }
    if (t.t === 'eof') throw new ExprError('Formule incomplète : une valeur est attendue à la fin', t.pos);
    if (t.t === 'op' && t.v === ')') throw new ExprError('Parenthèse fermante inattendue', t.pos);
    if (t.t === 'op' && (t.v === ';' || t.v === ',')) throw new ExprError(`Séparateur « ${t.v} » inattendu (hors d'un appel de fonction)`, t.pos);
    throw new ExprError(`Opérateur « ${t.v} » inattendu : il manque une valeur avant`, t.pos);
  }
  parseRef() {
    const t = this.next();
    const path = [t.v];
    if (FORBIDDEN_SEGMENTS.has(t.v)) throw new ExprError(`Nom « ${t.v} » interdit`, t.pos);
    while (this.isOp('.')) {
      this.next();
      const seg = this.peek();
      if (seg.t !== 'id') throw new ExprError('Nom de champ attendu après « . »', seg.pos);
      if (FORBIDDEN_SEGMENTS.has(seg.v)) throw new ExprError(`Nom « ${seg.v} » interdit`, seg.pos);
      this.next();
      path.push(seg.v);
      if (path.length > 6) throw new ExprError('Référence trop longue', seg.pos);
    }
    return { type: 'ref', name: t.v, path, pos: t.pos };
  }
  parseCall() {
    const t = this.next();
    const def = lookupFunction(t.v);
    if (!def) throw new ExprError(`Fonction inconnue « ${t.v} »`, t.pos);
    this.next(); // (
    this.enter(t.pos);
    const args = [];
    if (!this.isOp(')')) {
      for (;;) {
        if (this.isOp(';') || this.isOp(',') || this.isOp(')')) throw new ExprError(`${def.name} : argument manquant`, this.peek().pos);
        args.push(this.parseOr());
        if (this.isOp(';') || this.isOp(',')) { this.next(); continue; }
        if (this.isOp(')')) break;
        const e = this.peek();
        if (e.t === 'eof') throw new ExprError(`${def.name} : parenthèse fermante manquante`, e.pos);
        throw new ExprError(`${def.name} : « ${tokenText(e)} » inattendu, « ; » ou « ) » attendu`, e.pos);
      }
    }
    this.next(); // )
    this.leave();
    if (args.length < def.min || args.length > def.max) {
      const expected = def.min === def.max ? `${def.min}` : def.max >= 50 ? `au moins ${def.min}` : `${def.min} à ${def.max}`;
      throw new ExprError(`${def.name} attend ${expected} argument${def.max > 1 || def.min > 1 ? 's' : ''} (${args.length} fourni${args.length > 1 ? 's' : ''})`, t.pos);
    }
    return { type: 'call', name: def.name, key: normName(def.name), args, pos: t.pos };
  }
}

function tokenText(t) {
  if (t.t === 'str') return `"${t.v}"`;
  return String(t.v);
}

const parseCache = new Map();

/** Analyse une formule → AST figé. Lève ExprError { message, position } en cas d'erreur. */
export function parseExpr(source) {
  if (typeof source !== 'string') throw new ExprError('La formule doit être un texte', 0);
  if (source.length > MAX_SOURCE_LENGTH) throw new ExprError(`Formule trop longue (maximum ${MAX_SOURCE_LENGTH} caractères)`, MAX_SOURCE_LENGTH);
  const cached = parseCache.get(source);
  if (cached) return cached;
  const ast = deepFreeze(new Parser(source).parse());
  if (parseCache.size >= 2000) parseCache.clear();
  parseCache.set(source, ast);
  return ast;
}

/** Comme parseExpr mais sans exception : { ast, error }. */
export function tryParse(source) {
  try {
    return { ast: parseExpr(source), error: null };
  } catch (e) {
    if (e instanceof ExprError) return { ast: null, error: e };
    return { ast: null, error: new ExprError('Formule invalide', 0) };
  }
}

/** Références utilisées par un AST (premier segment) → Set<string>. */
export function collectRefs(ast, out = new Set()) {
  if (!ast || typeof ast !== 'object') return out;
  switch (ast.type) {
    case 'ref': out.add(ast.name); break;
    case 'unary': collectRefs(ast.arg, out); break;
    case 'binary': case 'logic': collectRefs(ast.left, out); collectRefs(ast.right, out); break;
    case 'call': for (const a of ast.args) collectRefs(a, out); break;
    default: break;
  }
  return out;
}

/** Fonctions appelées par un AST → Set<nom canonique>. */
export function collectCalls(ast, out = new Set()) {
  if (!ast || typeof ast !== 'object') return out;
  if (ast.type === 'call') { out.add(ast.name); for (const a of ast.args) collectCalls(a, out); }
  else if (ast.type === 'unary') collectCalls(ast.arg, out);
  else if (ast.type === 'binary' || ast.type === 'logic') { collectCalls(ast.left, out); collectCalls(ast.right, out); }
  return out;
}

// ── Évaluation ──────────────────────────────────────────────

function readScope(scope, name) {
  if (!scope) return null;
  if (typeof scope === 'function') return scope(name);
  if (scope instanceof Map) return scope.has(name) ? scope.get(name) : null;
  return hasOwn(scope, name) ? scope[name] : null;
}

function getProp(v, seg) {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.map(x => getProp(x, seg));
  if (typeof v === 'object' && hasOwn(v, seg)) return v[seg];
  return null;
}

function normalizeValue(v, ctx) {
  if (v === undefined) return null;
  if (typeof v === 'number') {
    const c = cleanNumber(v);
    if (c === null) ctx.diag('Résultat numérique invalide (division par zéro ?)');
    return c;
  }
  if (typeof v === 'string' && v.length > MAX_TEXT) {
    ctx.diag('Texte trop long : résultat tronqué');
    return v.slice(0, MAX_TEXT);
  }
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === 'function' || typeof v === 'symbol' || typeof v === 'bigint') return null;
  return v;
}

function arith(ctx, op, a, b, pos) {
  // Date ± nombre de jours ; date - date → nombre de jours
  if ((op === '+' || op === '-') && isDateLike(a) && toNumber(a) === null) {
    if (isDateLike(b) && op === '-') return ymdToDays(parseDate(a)) - ymdToDays(parseDate(b));
    const nb = toNumber(b);
    if (nb !== null) return daysToIso(ymdToDays(parseDate(a)) + (op === '+' ? 1 : -1) * Math.trunc(nb));
  }
  const na = isEmpty(a) ? 0 : toNumber(a);
  const nb = isEmpty(b) ? 0 : toNumber(b);
  if (na === null || nb === null) {
    const bad = na === null ? a : b;
    ctx.diag(`« ${toText(bad).slice(0, 40)} » n'est pas un nombre (opérateur ${op})`, pos);
    return null;
  }
  switch (op) {
    case '+': return na + nb;
    case '-': return na - nb;
    case '*': return na * nb;
    case '/':
      if (nb === 0) { ctx.diag('Division par zéro', pos); return null; }
      return na / nb;
    case '%':
      if (nb === 0) { ctx.diag('Division par zéro (modulo)', pos); return null; }
      return na % nb;
    default: return null;
  }
}

function evalNode(node, ctx) {
  switch (node.type) {
    case 'lit': return node.value;
    case 'ref': {
      let v = readScope(ctx.scope, node.name);
      for (let i = 1; i < node.path.length; i++) v = getProp(v, node.path[i]);
      return normalizeValue(v, ctx);
    }
    case 'unary': {
      const v = evalNode(node.arg, ctx);
      if (node.op === 'NON') return !truthy(v);
      if (isEmpty(v)) return null;
      const n = toNumber(v);
      if (n === null) { ctx.diag(`« ${toText(v).slice(0, 40)} » n'est pas un nombre`, node.pos); return null; }
      return -n;
    }
    case 'logic': {
      const l = truthy(evalNode(node.left, ctx));
      if (node.op === 'ET') return l ? truthy(evalNode(node.right, ctx)) : false;
      return l ? true : truthy(evalNode(node.right, ctx));
    }
    case 'binary': {
      const a = evalNode(node.left, ctx);
      const b = evalNode(node.right, ctx);
      switch (node.op) {
        case '=': return looseEqual(a, b);
        case '<>': return !looseEqual(a, b);
        case '<': case '<=': case '>': case '>=': {
          const c = compareValues(a, b);
          if (c === null) return false;
          return node.op === '<' ? c < 0 : node.op === '<=' ? c <= 0 : node.op === '>' ? c > 0 : c >= 0;
        }
        case '&': {
          const s = toText(a) + toText(b);
          return s.length > MAX_TEXT ? normalizeValue(s, ctx) : s;
        }
        default: return normalizeValue(arith(ctx, node.op, a, b, node.pos), ctx);
      }
    }
    case 'call': {
      const def = FUNCTIONS[node.key];
      if (!def) { ctx.diag(`Fonction inconnue « ${node.name} »`, node.pos); return null; }
      const args = def.lazy ? node.args : node.args.map(a => evalNode(a, ctx));
      return normalizeValue(def.fn(ctx, args), ctx);
    }
    default: return null;
  }
}

/**
 * Évalue une formule (texte ou AST) dans un `scope` (objet { clé: valeur },
 * Map, ou fonction (nom) → valeur). Ne lève jamais d'exception : en cas
 * d'erreur renvoie null et ajoute un diagnostic à `options.diagnostics`
 * (tableau) ou appelle `options.onError(diag)`.
 * options : { now: Date, timeZone, score, stats, diagnostics, onError, throwOnError }
 */
export function evaluate(exprOrAst, scope, options = {}) {
  const opts = options || {};
  const diag = (message, position) => {
    const d = position === undefined ? { message } : { message, position };
    if (Array.isArray(opts.diagnostics)) opts.diagnostics.push(d);
    if (typeof opts.onError === 'function') opts.onError(d);
  };
  let ast = exprOrAst;
  if (typeof exprOrAst === 'string') {
    if (!exprOrAst.trim()) return null;
    try {
      ast = parseExpr(exprOrAst);
    } catch (e) {
      if (opts.throwOnError) throw e;
      diag(e.detail || e.message, e.position);
      return null;
    }
  }
  if (!ast || typeof ast !== 'object' || !ast.type) return null;
  const ctx = {
    scope,
    now: opts.now,
    timeZone: opts.timeZone || 'Europe/Paris',
    score: opts.score,
    stats: opts.stats,
    diag,
  };
  ctx.ev = n => evalNode(n, ctx);
  try {
    return normalizeValue(evalNode(ast, ctx), ctx);
  } catch (e) {
    if (opts.throwOnError) throw e;
    diag(`Erreur d'évaluation : ${e && e.message ? e.message : 'inconnue'}`);
    return null;
  }
}
