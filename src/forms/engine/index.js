// ============================================================
// STUDIO FORMULAIRES — moteur de règles (API publique)
// ============================================================
// JavaScript pur (ESM, aucune dépendance, aucune API navigateur) :
// exécuté dans l'app (Vite) ET dans la fonction serveur d'envoi (Deno)
// pour revalider les réponses. Langage de formules : ./README.md
// Ne mute jamais `definition` ni `answers` (compilation mise en cache par
// identité d'objet : toujours remplacer une définition modifiée).

export { parseExpr, tryParse, evaluate, ExprError, collectRefs, collectCalls, FUNCTION_DOCS, isEmail } from './expr.js';
export { compileForm, validateDefinition, flattenItems, RESERVED_KEYS, OPTION_TYPES } from './compile.js';
export { evaluateForm, computeScore, quotaStatus, coerceType } from './runtime.js';
export { validateAnswers, normalizePhone, normalizeUrl } from './validate.js';
export { summarizeAnswers, formatAnswer, formatMoneyFr } from './summary.js';
export { slugify, newKeyFromLabel } from './utils.js';
export { safeRegex } from './regex.js';
export { isEmpty, truthy, looseEqual, toNumber, toText, parseDate, todayIso, formatDateFr } from './values.js';
