// FICHIER GÉNÉRÉ par scripts/build-edge.mjs — ne pas modifier ici (source : src/forms/).
// ============================================================
// Moteur de formulaires — compilation et contrôle de la définition
// ============================================================
// compileForm(definition) analyse UNE fois la définition (mise en cache
// par identité d'objet : les définitions sont immuables) : liste des
// questions, formules pré-analysées, dépendances, ordre de calcul des
// variables, et problèmes détectés (issues) pour l'éditeur / la publication.

import { KEY_RX, QUESTION_TYPE_IDS } from '../schema.js';
import { tryParse, collectRefs } from './expr.js';
import { safeRegex } from './regex.js';
import { isPlainObject, parseDate } from './values.js';

/** Noms réservés du langage de formules : interdits comme clés. */
export const RESERVED_KEYS = new Set([
  'et', 'ou', 'non', 'and', 'or', 'not', 'vrai', 'faux', 'true', 'false', 'vide', 'null', 'membre', 'params',
]);

/** Types de questions dont les réponses sont choisies parmi `options`. */
export const OPTION_TYPES = new Set(['single_choice', 'multiple_choice', 'dropdown', 'image_choice', 'ranking', 'matrix', 'slots']);
/** Types sans réponse saisie par le répondant. */
export const NON_INPUT_TYPES = new Set(['calculated', 'hidden']);

const ITEM_KINDS = new Set(['section', 'columns', 'content', 'question']);
const PREFILL_RX = /^(member\.(email|firstName|lastName|phone)|url:[A-Za-z0-9_.-]{1,60})$/;
const SLUG_RX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const isExprObject = v => isPlainObject(v) && typeof v.expr === 'string';
const hasExpr = v => typeof v === 'string' && v.trim() !== '';

/**
 * Parcourt tous les éléments (pages → sections → colonnes) dans l'ordre du document.
 * → [{ item, pageId, pageIndex, parentId, path: [pageId, …ancêtres, item.id], repeatKey?, ancestors: Item[] }]
 */
export function flattenItems(definition) {
  const out = [];
  const pages = Array.isArray(definition?.pages) ? definition.pages : [];
  const walk = (items, ctx, guard) => {
    if (!Array.isArray(items) || guard > 20) return;
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const path = [...ctx.path, item.id];
      out.push({ item, pageId: ctx.pageId, pageIndex: ctx.pageIndex, parentId: ctx.parentId, path, repeatKey: ctx.repeatKey, ancestors: ctx.ancestors });
      const inner = {
        pageId: ctx.pageId, pageIndex: ctx.pageIndex, parentId: item.id, path,
        repeatKey: ctx.repeatKey ?? (item.kind === 'section' && item.repeat ? item.key || item.id : undefined),
        ancestors: [...ctx.ancestors, item],
      };
      if (item.kind === 'section') walk(item.items, inner, guard + 1);
      else if (item.kind === 'columns' && Array.isArray(item.columns)) for (const col of item.columns) walk(col, inner, guard + 1);
    }
  };
  pages.forEach((page, pageIndex) => {
    if (!page || typeof page !== 'object') return;
    walk(page.items, { pageId: page.id, pageIndex, parentId: null, path: [page.id], repeatKey: undefined, ancestors: [] }, 0);
  });
  return out;
}

function levenshtein(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

const cache = new WeakMap();

/**
 * Compile une définition. Résultat mis en cache (ne pas muter la définition).
 * → { questions, keys, answerKeys, variables, dependencies, issues, … (structures internes) }
 */
export function compileForm(definition) {
  if (definition && typeof definition === 'object') {
    const hit = cache.get(definition);
    if (hit) return hit;
  }
  const compiled = doCompile(definition && typeof definition === 'object' ? definition : {});
  if (definition && typeof definition === 'object') cache.set(definition, compiled);
  return compiled;
}

function doCompile(def) {
  const issues = [];
  const err = (message, extra = {}) => issues.push({ level: 'error', message, ...extra });
  const warn = (message, extra = {}) => issues.push({ level: 'warning', message, ...extra });

  // ── En-tête ──
  if (!String(def.title ?? '').trim()) err('Le formulaire n\'a pas de titre.');
  if (def.slug !== undefined && def.slug !== null && def.slug !== '' && !SLUG_RX.test(String(def.slug))) {
    err(`Lien court « ${def.slug} » invalide : minuscules, chiffres et tirets uniquement.`);
  }

  // ── Pages ──
  const pagesIn = Array.isArray(def.pages) ? def.pages : [];
  if (!pagesIn.length) err('Le formulaire doit contenir au moins une page.');
  const pageIndex = new Map();
  pagesIn.forEach((p, i) => {
    if (!p || typeof p !== 'object') { err(`La page n°${i + 1} est invalide.`); return; }
    if (p.id === undefined || p.id === null || p.id === '') err(`La page n°${i + 1} n'a pas d'identifiant.`);
    else if (pageIndex.has(p.id)) err(`Identifiant de page en double « ${p.id} ».`, { pageId: p.id });
    else pageIndex.set(p.id, i);
  });

  // ── Éléments ──
  const entries = flattenItems(def);
  const itemIds = new Set();
  const questions = [];
  const byKey = new Map();
  const keys = new Set();
  const answerKeys = new Set();
  const repeatGroups = new Map();

  for (const e of entries) {
    const { item } = e;
    const at = { itemId: item.id, pageId: e.pageId };
    if (item.id === undefined || item.id === null || item.id === '') err('Un élément n\'a pas d\'identifiant.', at);
    else if (itemIds.has(item.id) || pageIndex.has(item.id)) err(`Identifiant d'élément en double « ${item.id} ».`, at);
    else itemIds.add(item.id);
    if (!ITEM_KINDS.has(item.kind)) { err(`Type de bloc inconnu « ${item.kind} ».`, at); continue; }

    if (item.kind === 'columns' && !Array.isArray(item.columns)) err('Bloc colonnes sans colonnes.', at);
    if (item.kind === 'section' && item.repeat) {
      if (e.repeatKey !== undefined) err('Une section répétable ne peut pas être imbriquée dans une autre section répétable.', at);
      else if (!item.key || !KEY_RX.test(item.key)) err('Une section répétable doit avoir une clé valide (minuscules, chiffres, _), sous laquelle ses réponses sont enregistrées.', at);
      else if (keys.has(item.key)) err(`Clé en double « ${item.key} ».`, { ...at, key: item.key });
      else if (RESERVED_KEYS.has(item.key)) err(`La clé « ${item.key} » est un mot réservé des formules.`, { ...at, key: item.key });
      else {
        keys.add(item.key);
        answerKeys.add(item.key);
        repeatGroups.set(item.key, { item, entry: e, childKeys: [] });
      }
      checkRepeat(item.repeat, at, err);
    }
    if (item.kind !== 'question') continue;

    const key = item.key;
    const qat = { ...at, key };
    if (!key || typeof key !== 'string') { err(`La question « ${item.label || item.id} » n'a pas de clé.`, qat); continue; }
    if (!KEY_RX.test(key)) { err(`Clé « ${key} » invalide : elle doit commencer par une lettre minuscule et ne contenir que a-z, 0-9 et _ (50 caractères max).`, qat); continue; }
    if (RESERVED_KEYS.has(key)) { err(`La clé « ${key} » est un mot réservé des formules : choisis-en une autre.`, qat); continue; }
    if (keys.has(key)) { err(`Clé en double « ${key} » : chaque question doit avoir une clé unique.`, qat); continue; }
    if (!QUESTION_TYPE_IDS.has(item.type)) err(`Type de question inconnu « ${item.type} ».`, qat);
    if (!String(item.label ?? '').trim() && item.type !== 'hidden') warn('Question sans intitulé.', qat);

    const inRepeat = e.repeatKey !== undefined && repeatGroups.has(e.repeatKey) ? e.repeatKey : undefined;
    const q = { key, type: item.type, id: item.id, pageId: e.pageId, path: e.path, item, entry: e, repeatKey: inRepeat };
    questions.push(q);
    byKey.set(key, q);
    keys.add(key);
    if (inRepeat) repeatGroups.get(inRepeat).childKeys.push(key);
    else answerKeys.add(key);

    checkQuestionStatic(item, def, qat, err, warn);
  }

  // ── Variables ──
  const varsIn = Array.isArray(def.variables) ? def.variables : [];
  const variables = [];
  const varKeys = new Set();
  for (const v of varsIn) {
    if (!v || typeof v !== 'object') continue;
    const at = { key: v.key };
    if (!v.key || !KEY_RX.test(v.key)) { err(`Nom de variable « ${v.key ?? ''} » invalide (minuscules, chiffres, _).`, at); continue; }
    if (RESERVED_KEYS.has(v.key)) { err(`La variable « ${v.key} » porte un nom réservé.`, at); continue; }
    if (keys.has(v.key) || varKeys.has(v.key)) { err(`Nom de variable « ${v.key} » déjà utilisé par une question ou une variable.`, at); continue; }
    varKeys.add(v.key);
    variables.push({ key: v.key, label: v.label, type: v.type || 'text', expr: v.expr, ast: null, def: v });
  }

  // ── Formules ──
  const known = new Set([...keys, ...varKeys, 'membre', 'params']);
  const suggest = name => {
    let best = null;
    for (const k of known) if (levenshtein(name, k) <= 2) { best = k; break; }
    return best ? ` Voulais-tu dire « ${best} » ?` : '';
  };
  const compileExpr = (src, where, at, selfKey) => {
    if (!hasExpr(src)) {
      if (src !== undefined && src !== null && src !== '' && typeof src !== 'string') err(`${where} : la formule doit être un texte.`, at);
      return null;
    }
    const { ast, error } = tryParse(src);
    if (error) { err(`${where} : ${error.detail} (caractère ${error.position + 1}).`, { ...at, position: error.position, expr: src }); return null; }
    for (const ref of collectRefs(ast)) {
      if (!known.has(ref)) err(`${where} : référence inconnue « ${ref} ».${suggest(ref)}`, { ...at, expr: src });
      else if (selfKey && ref === selfKey) warn(`${where} : la question fait référence à elle-même.`, at);
    }
    return ast;
  };

  const pages = [];
  pagesIn.forEach((p, i) => {
    if (!p || typeof p !== 'object') return;
    const at = { pageId: p.id };
    const label = `Page « ${p.title || i + 1} »`;
    const logic = isPlainObject(p.logic) ? p.logic : {};
    const showIf = compileExpr(logic.showIf, `${label}, condition d'affichage`, at);
    const next = [];
    (Array.isArray(logic.next) ? logic.next : []).forEach((rule, r) => {
      if (!rule || typeof rule !== 'object') return;
      const where = `${label}, règle de saut n°${r + 1}`;
      const when = compileExpr(rule.when, where, at);
      if (hasExpr(rule.when) && !when) return;
      const goTo = rule.goTo;
      if (goTo !== 'submit' && !pageIndex.has(goTo)) { err(`${where} : la page cible « ${goTo ?? ''} » n'existe pas.`, at); return; }
      if (goTo === p.id) { err(`${where} : une page ne peut pas sauter vers elle-même.`, at); return; }
      if (goTo !== 'submit' && pageIndex.get(goTo) < i) warn(`${where} : saut vers une page précédente (risque de boucle).`, at);
      next.push({ when, goTo });
    });
    pages.push({ id: p.id, index: i, page: p, showIf, next });
  });

  // Formules des éléments (y compris blocs non-questions qui portent un showIf)
  const itemMeta = new Map(); // itemId → { showIf, readOnlyIf, required, requiredAst, defaultAst, calcAst, optionShowIf: Map }
  for (const e of entries) {
    const { item } = e;
    if (!ITEM_KINDS.has(item.kind)) continue;
    const q = item.kind === 'question' && byKey.get(item.key)?.item === item ? byKey.get(item.key) : null;
    const name = item.kind === 'question' ? `Question « ${item.label || item.key || item.id} »` : `Bloc « ${item.title || item.id} »`;
    const at = { itemId: item.id, pageId: e.pageId, key: q ? item.key : undefined };
    const selfKey = q ? q.key : undefined;
    const meta = {
      showIf: compileExpr(item.showIf, `${name}, condition d'affichage`, at, selfKey),
      readOnlyIf: null, required: false, requiredAst: null, defaultAst: null, calcAst: null, optionShowIf: null,
    };
    if (q) {
      meta.readOnlyIf = compileExpr(item.readOnlyIf, `${name}, condition de lecture seule`, at, selfKey);
      if (typeof item.required === 'string') meta.requiredAst = compileExpr(item.required, `${name}, condition d'obligation`, at, selfKey);
      else meta.required = item.required === true || (item.type === 'consent' && item.required !== false);
      if (isExprObject(item.default)) meta.defaultAst = compileExpr(item.default.expr, `${name}, valeur par défaut`, at, selfKey);
      if (item.type === 'calculated') {
        const src = typeof item.expr === 'string' ? item.expr : isExprObject(item.default) ? item.default.expr : null;
        if (!hasExpr(src)) err(`${name} : le champ calculé n'a pas de formule.`, at);
        else meta.calcAst = typeof item.expr === 'string' ? compileExpr(item.expr, `${name}, formule`, at, selfKey) : meta.defaultAst;
      }
      if (Array.isArray(item.options)) {
        item.options.forEach((o, i) => {
          if (o && hasExpr(o.showIf)) {
            meta.optionShowIf ??= new Map();
            const ast = compileExpr(o.showIf, `${name}, condition de l'option n°${i + 1}`, at);
            if (ast) meta.optionShowIf.set(String(o.value), ast);
          }
        });
      }
      if (item.amount !== undefined && isExprObject(item.amount)) meta.amountAst = compileExpr(item.amount.expr, `${name}, montant`, at, selfKey);
    }
    itemMeta.set(item, meta);
  }

  for (const v of variables) {
    v.ast = compileExpr(v.expr, `Variable « ${v.key} »`, { key: v.key });
    if (!hasExpr(v.expr)) err(`La variable « ${v.key} » n'a pas de formule.`, { key: v.key });
  }

  // Quotas
  const settings = isPlainObject(def.settings) ? def.settings : {};
  const quotas = [];
  (Array.isArray(settings.quotas) ? settings.quotas : []).forEach((qt, i) => {
    if (!qt || typeof qt !== 'object') return;
    const where = `Quota n°${i + 1}`;
    const ast = hasExpr(qt.expr) ? compileExpr(qt.expr, where, {}) : null;
    if (!Number.isInteger(qt.max) || qt.max < 0) err(`${where} : le maximum doit être un entier positif.`);
    quotas.push({ index: i, ast, expr: qt.expr, max: qt.max, message: qt.message });
  });
  checkSettings(def, settings, err, warn);

  // ── Dépendances ──
  const dependencies = new Map();
  const addDeps = (key, ...asts) => {
    let set = dependencies.get(key);
    if (!set) { set = new Set(); dependencies.set(key, set); }
    for (const a of asts) if (a) for (const r of collectRefs(a)) if (r !== key && (keys.has(r) || varKeys.has(r))) set.add(r);
  };
  const pageById = new Map(pages.map(p => [p.id, p]));
  for (const q of questions) {
    const m = itemMeta.get(q.item);
    const anc = q.entry.ancestors.map(a => itemMeta.get(a)?.showIf);
    const opt = m.optionShowIf ? [...m.optionShowIf.values()] : [];
    addDeps(q.key, m.showIf, m.readOnlyIf, m.requiredAst, m.defaultAst, m.calcAst, m.amountAst, pageById.get(q.pageId)?.showIf, ...anc, ...opt);
  }
  for (const v of variables) addDeps(v.key, v.ast);

  // ── Ordre de calcul (variables + champs calculés) et cycles ──
  const computedNodes = new Map();
  for (const v of variables) computedNodes.set(v.key, { kind: 'variable', key: v.key, ast: v.ast, type: v.type });
  for (const q of questions) {
    const m = itemMeta.get(q.item);
    if (q.type === 'calculated' && m.calcAst && !q.repeatKey) computedNodes.set(q.key, { kind: 'calculated', key: q.key, ast: m.calcAst, type: q.item.valueType || 'auto' });
  }
  const computedOrder = [];
  const cyclic = new Set();
  const state = new Map(); // 1 = en cours, 2 = fait
  const stack = [];
  const reported = new Set();
  const visit = k => {
    const st = state.get(k);
    if (st === 2) return;
    if (st === 1) {
      const cyc = stack.slice(stack.indexOf(k));
      cyc.forEach(c => cyclic.add(c));
      const sig = [...cyc].sort().join('|');
      if (!reported.has(sig)) {
        reported.add(sig);
        err(`Calcul circulaire : ${[...cyc, k].join(' → ')}.`, { key: k });
      }
      return;
    }
    state.set(k, 1);
    stack.push(k);
    const node = computedNodes.get(k);
    if (node.ast) for (const r of collectRefs(node.ast)) if (computedNodes.has(r)) visit(r);
    stack.pop();
    state.set(k, 2);
    computedOrder.push(node);
  };
  for (const k of computedNodes.keys()) visit(k);
  const order = computedOrder.filter(n => !cyclic.has(n.key));

  // ── Contrôles globaux ──
  if (!questions.length && pagesIn.length) warn('Le formulaire ne contient aucune question.');
  if (def.kind === 'quiz' && !questions.some(q => isPlainObject(q.item.score))) warn('Quiz sans question notée : ajoute une bonne réponse ou des points aux questions.');
  if (def.kind === 'booking' && !questions.some(q => q.type === 'slots')) warn('Formulaire de réservation sans question « Créneaux ».');

  return {
    questions,
    keys,
    answerKeys,
    variables,
    dependencies,
    issues,
    // Structures internes utilisées par l'évaluation
    pages,
    pageIndex,
    pagePos: new Map(pages.map((p, i) => [p.id, i])),
    entries,
    itemMeta,
    byKey,
    repeatGroups,
    computedOrder: order,
    cyclic,
    quotas,
    settings,
  };
}

function checkRepeat(repeat, at, err) {
  if (!isPlainObject(repeat)) return;
  const { min, max } = repeat;
  if (min !== undefined && (!Number.isInteger(min) || min < 0)) err('Répétition : le minimum doit être un entier positif.', at);
  if (max !== undefined && (!Number.isInteger(max) || max < 1 || max > 200)) err('Répétition : le maximum doit être un entier entre 1 et 200.', at);
  if (Number.isInteger(min) && Number.isInteger(max) && min > max) err('Répétition : le minimum dépasse le maximum.', at);
}

function checkQuestionStatic(item, def, at, err, warn) {
  const type = item.type;
  const opts = item.options;
  if (OPTION_TYPES.has(type) && !item.source) {
    if (!Array.isArray(opts) || !opts.length) err(`La question « ${item.label || item.key} » n'a aucune option.`, at);
  }
  if (Array.isArray(opts)) checkOptions(opts, 'Option', at, err, warn);
  if (type === 'matrix') {
    if (!Array.isArray(item.columns) || !item.columns.length) err(`Le tableau « ${item.label || item.key} » n'a aucune colonne.`, at);
    else checkOptions(item.columns, 'Colonne', at, err, warn);
  }
  if (item.prefillFrom !== undefined && item.prefillFrom !== null && item.prefillFrom !== '' && !PREFILL_RX.test(String(item.prefillFrom))) {
    warn(`Préremplissage « ${item.prefillFrom} » non reconnu (member.email, member.firstName, member.lastName, member.phone ou url:<paramètre>).`, at);
  }
  if (item.repeat) checkRepeat(item.repeat, at, err);
  const v = item.validation;
  if (isPlainObject(v)) {
    const pairs = [['min', 'max'], ['minLength', 'maxLength'], ['minSelected', 'maxSelected']];
    for (const [a, b] of pairs) {
      if (v[a] !== undefined && v[b] !== undefined && v[a] !== null && v[b] !== null) {
        const da = parseDate(v[a]), db = parseDate(v[b]);
        const lt = da && db ? `${v[a]}` > `${v[b]}` : Number(v[a]) > Number(v[b]);
        if (lt) err(`Validation : ${a} est supérieur à ${b}.`, at);
      }
    }
    for (const k of ['minLength', 'maxLength', 'minSelected', 'maxSelected', 'maxFiles']) {
      if (v[k] !== undefined && v[k] !== null && (!Number.isInteger(v[k]) || v[k] < 0)) err(`Validation : ${k} doit être un entier positif.`, at);
    }
    if (v.maxFileSizeMb !== undefined && v.maxFileSizeMb !== null && !(Number(v.maxFileSizeMb) > 0)) err('Validation : la taille maximale de fichier doit être positive.', at);
    if (v.pattern) {
      const r = safeRegex(v.pattern);
      if (r.error) err(`Validation : ${r.error}`, at);
    }
    if (v.accept !== undefined && !Array.isArray(v.accept)) warn('Validation : « accept » doit être une liste de types (ex. ["application/pdf", "image/*"]).', at);
  }
  if (isPlainObject(item.score)) {
    const s = item.score;
    if (s.points !== undefined && typeof s.points !== 'number') err('Score : les points doivent être un nombre.', at);
    if (isPlainObject(s.perOption) && Array.isArray(opts)) {
      const values = new Set(opts.map(o => String(o?.value)));
      for (const k of Object.keys(s.perOption)) if (!values.has(k)) warn(`Score : l'option « ${k} » n'existe pas.`, at);
    }
    if (s.correct === undefined && !isPlainObject(s.perOption)) warn('Score : ni bonne réponse ni points par option.', at);
  }
  if (type === 'payment' && item.amount !== undefined && !isExprObject(item.amount) && !(Number(item.amount) > 0)) {
    err('Paiement : le montant doit être un nombre positif.', at);
  }
  if ((type === 'rating' || type === 'scale') && item.max !== undefined && !(Number.isInteger(item.max) && item.max >= 1 && item.max <= 100)) {
    err('La valeur maximale doit être un entier entre 1 et 100.', at);
  }
  if (def.kind === 'vote' && item.sensitive === false) warn('Vote : les réponses devraient être marquées sensibles.', at);
}

function checkOptions(opts, label, at, err, warn) {
  const seen = new Set();
  opts.forEach((o, i) => {
    if (!o || typeof o !== 'object') { err(`${label} n°${i + 1} invalide.`, at); return; }
    if (o.value === undefined || o.value === null || String(o.value).trim() === '') { err(`${label} n°${i + 1} (« ${o.label ?? ''} ») sans valeur.`, at); return; }
    if (typeof o.value === 'object') { err(`${label} n°${i + 1} : la valeur doit être un texte ou un nombre.`, at); return; }
    const k = String(o.value);
    if (seen.has(k)) err(`${label} en double : valeur « ${k} ».`, at);
    seen.add(k);
    if (!String(o.label ?? '').trim()) warn(`${label} « ${k} » sans libellé.`, at);
    if (o.capacity !== undefined && o.capacity !== null && (!Number.isInteger(o.capacity) || o.capacity < 0)) err(`${label} « ${k} » : la capacité doit être un entier positif.`, at);
    if (o.price !== undefined && o.price !== null && !(typeof o.price === 'number' && o.price >= 0)) err(`${label} « ${k} » : le prix doit être un nombre positif.`, at);
  });
}

function checkSettings(def, s, err, warn) {
  const toTime = v => {
    if (!v) return null;
    const t = new Date(v).getTime();
    return Number.isNaN(t) ? undefined : t;
  };
  const o = toTime(s.opensAt), c = toTime(s.closesAt);
  if (o === undefined) err('Date d\'ouverture invalide.');
  if (c === undefined) err('Date de fermeture invalide.');
  if (o && c && o >= c) err('La date d\'ouverture doit précéder la date de fermeture.');
  if (s.maxResponses !== undefined && s.maxResponses !== null && (!Number.isInteger(s.maxResponses) || s.maxResponses < 1)) {
    err('Le nombre maximal de réponses doit être un entier supérieur à 0.');
  }
  if (s.confirmation?.redirectUrl && !/^https:\/\//i.test(String(s.confirmation.redirectUrl))) {
    warn('L\'adresse de redirection devrait commencer par https://.');
  }
  if (def.kind === 'vote' && s.identity === 'anonymous') warn('Vote : une identification est nécessaire pour garantir un seul bulletin par électeur.');
}

/** Problèmes de la définition (éditeur, publication : refusée s'il y a des erreurs). */
export function validateDefinition(definition) {
  return compileForm(definition).issues.map(i => ({ ...i }));
}
