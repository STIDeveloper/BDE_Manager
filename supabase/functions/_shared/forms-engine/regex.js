// FICHIER GÉNÉRÉ par scripts/build-edge.mjs — ne pas modifier ici (source : src/forms/).
// ============================================================
// Moteur de formulaires — motifs (validation.pattern) sûrs
// ============================================================
// Les motifs viennent de la définition (saisie par un admin) mais sont
// exécutés côté serveur : on refuse les constructions exposées au
// « ReDoS » (quantificateurs imbriqués, références arrière) et on borne
// la longueur. Le motif doit correspondre à TOUTE la réponse.

export const MAX_PATTERN_LENGTH = 200;

const cache = new Map();

/** Détecte un groupe quantifié contenant lui-même un quantificateur : (a+)+, (\w*)*, (a{2,})+ … */
function hasNestedQuantifier(p) {
  const stack = []; // pour chaque groupe ouvert : contient-il un quantificateur ?
  let inClass = false;
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '\\') { i++; continue; }
    if (inClass) { if (c === ']') inClass = false; continue; }
    if (c === '[') { inClass = true; continue; }
    if (c === '(') { stack.push(false); continue; }
    if (c === ')') {
      const inner = stack.pop();
      const q = p[i + 1];
      const quantified = q === '*' || q === '+' || (q === '{' && /^\{\d*,\d*\}|^\{\d+\}/.test(p.slice(i + 1)));
      if (inner && quantified) return true;
      if (stack.length && (inner || quantified)) stack[stack.length - 1] = true;
      continue;
    }
    if ((c === '*' || c === '+' || c === '{') && stack.length) stack[stack.length - 1] = true;
  }
  return false;
}

/**
 * Compile un motif de validation de façon sûre.
 * → { rx: RegExp } ou { error: message français }.
 */
export function safeRegex(pattern) {
  if (typeof pattern !== 'string' || !pattern) return { error: 'Motif vide ou invalide.' };
  const hit = cache.get(pattern);
  if (hit) return hit;
  let res;
  if (pattern.length > MAX_PATTERN_LENGTH) res = { error: `Motif trop long (maximum ${MAX_PATTERN_LENGTH} caractères).` };
  else if (/\\[1-9]|\\k</.test(pattern)) res = { error: 'Les références arrière (\\1, \\k<…>) ne sont pas autorisées dans un motif.' };
  else if (hasNestedQuantifier(pattern)) res = { error: 'Motif refusé : quantificateurs imbriqués (ex. (a+)+), risque de blocage.' };
  else {
    try {
      res = { rx: new RegExp(`^(?:${pattern})$`, 'u') };
    } catch {
      try {
        res = { rx: new RegExp(`^(?:${pattern})$`) };
      } catch {
        res = { error: 'Motif (expression régulière) invalide.' };
      }
    }
  }
  if (cache.size > 500) cache.clear();
  cache.set(pattern, res);
  return res;
}
