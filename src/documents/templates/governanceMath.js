// ============================================================
// STUDIO DOCUMENTS — CALCULS DE GOUVERNANCE (module PUR)
// ============================================================
// Quorum, majorités, délais de convocation, comparaison de la composition
// du bureau, analyse des lignes « Action — Responsable — Échéance ».
// Aucune dépendance au store ni au DOM : testable sous Node.
//
// Rappel : les règles réelles (quorum, majorité, délai) sont fixées par les
// statuts de chaque association. Ce module applique les paramètres qu'on lui
// donne ; il ne présume d'aucune règle légale générale.
// ============================================================

/** Entier positif ou nul (valeurs vides / invalides → 0). */
export function toCount(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** « 25 % », « 33,33 % » (espace normale : compatible polices PDF standard). */
export function formatPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const rounded = Math.round(n * 100) / 100;
  return `${String(rounded).replace('.', ',')} %`;
}

/** Accord simple : « 1 abstention », « 2 abstentions », « 0 abstention ». */
export const countLabel = (n, singular, pluralForm = `${singular}s`) => `${n} ${n > 1 ? pluralForm : singular}`;

// ------------------------------------------------------------
// QUORUM
// ------------------------------------------------------------

/**
 * Calcule le quorum d'une assemblée.
 * @param {{ present:number, represented:number, total:number, percent:number }} p
 *   present     membres présents
 *   represented membres représentés (pouvoirs)
 *   total       nombre total de membres pris en compte pour le quorum
 *   percent     quorum statutaire en % du total (0 = pas de quorum)
 * @returns {{ present, represented, counted, total, percent, required, reached, ratio, noQuorum }}
 *   required = nombre minimal de membres présents ou représentés (arrondi
 *   à l'entier supérieur : « au moins 25 % »).
 */
export function computeQuorum({ present = 0, represented = 0, total = 0, percent = 0 } = {}) {
  const pr = toCount(present);
  const rep = toCount(represented);
  const counted = pr + rep;
  let tot = toCount(total);
  if (tot === 0) tot = counted; // total inconnu : on raisonne sur les seuls participants
  const pct = Math.min(100, Math.max(0, Number(percent) || 0));
  const noQuorum = pct === 0;
  // Petite tolérance pour éviter qu'un produit flottant (ex. 0,3 × 10) ne soit arrondi au-dessus.
  const required = noQuorum ? 0 : Math.ceil((tot * pct) / 100 - 1e-9);
  const reached = noQuorum ? counted > 0 : counted >= required && counted > 0;
  const ratio = tot > 0 ? (counted / tot) * 100 : 0;
  return { present: pr, represented: rep, counted, total: tot, percent: pct, required, reached, ratio, noQuorum };
}

// ------------------------------------------------------------
// MAJORITÉS
// ------------------------------------------------------------

export const MAJORITY_OPTIONS = [
  { value: 'simple', label: 'Majorité simple (suffrages exprimés)' },
  { value: 'absolue', label: 'Majorité absolue (présents et représentés)' },
  { value: 'deux_tiers', label: 'Majorité des deux tiers (suffrages exprimés)' },
];

const MAJORITY_PHRASE = {
  simple: 'à la majorité',
  absolue: 'à la majorité absolue',
  deux_tiers: 'à la majorité des deux tiers',
};

/** Normalise le type de majorité (valeur inconnue → 'simple'). */
export const normalizeMajority = (m) => (MAJORITY_PHRASE[m] ? m : 'simple');

/**
 * Phrase décrivant la règle de majorité appliquée (insérée dans le PV).
 * @param {string} majority 'simple' | 'absolue' | 'deux_tiers'
 * @param {number} voters   membres présents ou représentés (pour la majorité absolue)
 */
export function majorityRuleText(majority, voters = 0) {
  const m = normalizeMajority(majority);
  if (m === 'absolue') {
    const v = toCount(voters);
    const needed = v > 0 ? ` (soit au moins ${countLabel(Math.floor(v / 2) + 1, 'voix', 'voix')} sur ${v} membres présents ou représentés)` : '';
    return `Règle de majorité appliquée : majorité absolue des membres présents ou représentés. Une résolution est adoptée lorsqu'elle recueille plus de la moitié des voix des membres présents ou représentés${needed} ; les abstentions produisent donc le même effet qu'un vote contre.`;
  }
  if (m === 'deux_tiers') {
    return 'Règle de majorité appliquée : majorité des deux tiers des suffrages exprimés. Une résolution est adoptée lorsque les voix « pour » représentent au moins les deux tiers des voix exprimées (pour et contre) ; les abstentions ne sont pas comptées comme des suffrages exprimés.';
  }
  return 'Règle de majorité appliquée : majorité simple des suffrages exprimés. Une résolution est adoptée lorsque le nombre de voix « pour » est supérieur au nombre de voix « contre » ; les abstentions ne sont pas comptées comme des suffrages exprimés et, en cas d\'égalité, la résolution n\'est pas adoptée.';
}

/**
 * Résultat d'un vote.
 * @param {{ for?, against?, abstention? }} votes
 * @param {string} majority 'simple' | 'absolue' | 'deux_tiers'
 * @param {{ voters?: number }} [opts] voters = présents + représentés (majorité absolue)
 * @returns {{
 *   for, against, abstention, expressed, cast, required, adopted,
 *   unanimous: boolean,            // aucune voix contre ni abstention
 *   unanimousExpressed: boolean,   // aucune voix contre, mais des abstentions
 *   tie: boolean, noVotes: boolean, // égalité / aucun suffrage exprimé
 *   label: 'Adoptée'|'Rejetée',
 *   detail: string,                // « 12 pour, 2 contre, 1 abstention »
 *   sentence: string,              // phrase complète pour le PV
 * }}
 */
export function resolutionOutcome(votes = {}, majority = 'simple', { voters = 0 } = {}) {
  const m = normalizeMajority(majority);
  const pour = toCount(votes.for);
  const contre = toCount(votes.against);
  const abst = toCount(votes.abstention);
  const expressed = pour + contre;
  const cast = expressed + abst;
  let base; let required; let adopted;

  if (m === 'absolue') {
    base = toCount(voters) || cast;
    required = base > 0 ? Math.floor(base / 2) + 1 : 1;
    adopted = base > 0 && pour >= required;
  } else if (m === 'deux_tiers') {
    base = expressed;
    required = expressed > 0 ? Math.ceil((expressed * 2) / 3 - 1e-9) : 1;
    adopted = expressed > 0 && pour * 3 >= expressed * 2;
  } else {
    base = expressed;
    required = Math.floor(expressed / 2) + 1;
    adopted = pour > contre;
  }

  const tie = expressed > 0 && pour === contre;
  const noVotes = expressed === 0;
  const unanimous = adopted && contre === 0 && abst === 0;
  const unanimousExpressed = adopted && contre === 0 && abst > 0;
  const detail = `${pour} pour, ${contre} contre, ${countLabel(abst, 'abstention')}`;

  let sentence;
  if (adopted) {
    let how = MAJORITY_PHRASE[m];
    if (unanimous) how = 'à l\'unanimité';
    else if (unanimousExpressed) how = 'à l\'unanimité des suffrages exprimés';
    sentence = `Cette résolution est adoptée ${how} (${detail}).`;
  } else if (noVotes && m !== 'absolue') {
    sentence = `Aucun suffrage n'ayant été exprimé (${detail}), cette résolution n'est pas adoptée.`;
  } else if (m === 'simple' && tie) {
    sentence = `Cette résolution est rejetée, faute de majorité, les voix « pour » et « contre » étant à égalité (${detail}).`;
  } else if (m === 'absolue') {
    sentence = `Cette résolution est rejetée, faute d'avoir recueilli la majorité absolue des membres présents ou représentés, soit ${countLabel(required, 'voix', 'voix')} (${detail}).`;
  } else if (m === 'deux_tiers') {
    sentence = `Cette résolution est rejetée, faute d'avoir recueilli les deux tiers des suffrages exprimés, soit ${countLabel(required, 'voix', 'voix')} (${detail}).`;
  } else {
    sentence = `Cette résolution est rejetée (${detail}).`;
  }

  return {
    for: pour, against: contre, abstention: abst, expressed, cast, base, required, adopted,
    unanimous, unanimousExpressed, tie, noVotes,
    label: adopted ? 'Adoptée' : 'Rejetée',
    detail, sentence,
  };
}

/** « Première », « Deuxième »… (au-delà de 20 : « Résolution n° 21 »). */
const ORDINALS = ['Première', 'Deuxième', 'Troisième', 'Quatrième', 'Cinquième', 'Sixième', 'Septième', 'Huitième', 'Neuvième', 'Dixième',
  'Onzième', 'Douzième', 'Treizième', 'Quatorzième', 'Quinzième', 'Seizième', 'Dix-septième', 'Dix-huitième', 'Dix-neuvième', 'Vingtième'];
export function resolutionOrdinal(index) {
  return ORDINALS[index] ? `${ORDINALS[index]} résolution` : `Résolution n° ${index + 1}`;
}

// ------------------------------------------------------------
// DÉLAI DE CONVOCATION
// ------------------------------------------------------------

/**
 * Vérifie le délai entre l'envoi de la convocation et l'assemblée.
 * @param {number} days        jours entre l'envoi et l'AG (peut être NaN)
 * @param {number} noticeDays  délai statutaire
 * @returns {string|null} avertissement, ou null si le délai est respecté
 */
export function noticeWarning(days, noticeDays) {
  const required = toCount(noticeDays);
  if (!Number.isFinite(days)) return null;
  if (days < 0) return 'La date de l\'assemblée générale est antérieure à la date d\'envoi de la convocation.';
  if (days < required) {
    const sent = days === 0 ? 'le jour même de l\'AG' : `${countLabel(days, 'jour')} avant l'AG`;
    return `La convocation est envoyée ${sent} alors que les statuts prévoient ${countLabel(required, 'jour')}.`;
  }
  return null;
}

// ------------------------------------------------------------
// COMPOSITION DU BUREAU
// ------------------------------------------------------------

/**
 * Compare deux compositions du bureau.
 * @param {string[]} previousIds identifiants de la dernière liste émise
 * @param {string[]} currentIds  identifiants actuels
 * @param {object} [previousRoles] { memberId: roleId } (facultatif)
 * @param {object} [currentRoles]  { memberId: roleId } (facultatif)
 * @returns {{ added: string[], removed: string[], roleChanged: string[], changed: boolean }}
 */
export function compareComposition(previousIds = [], currentIds = [], previousRoles = null, currentRoles = null) {
  const prev = new Set((previousIds || []).filter(Boolean));
  const cur = new Set((currentIds || []).filter(Boolean));
  const added = [...cur].filter(id => !prev.has(id));
  const removed = [...prev].filter(id => !cur.has(id));
  const roleChanged = previousRoles && currentRoles
    ? [...cur].filter(id => prev.has(id) && previousRoles[id] && currentRoles[id] && previousRoles[id] !== currentRoles[id])
    : [];
  return { added, removed, roleChanged, changed: added.length + removed.length + roleChanged.length > 0 };
}

// ------------------------------------------------------------
// ACTIONS À MENER
// ------------------------------------------------------------

/**
 * Analyse une ligne « Action — Responsable — Échéance ».
 * Séparateurs acceptés : « — », « – », « | », « ; » ou « - » entouré d'espaces.
 * Les parties manquantes restent vides : « Réserver la salle — Léa » est valide.
 * @returns {{ action: string, owner: string, due: string }}
 */
export function parseActionLine(line) {
  const parts = String(line || '')
    .split(/\s*[—–|;]\s*|\s+-\s+/)
    .map(s => s.trim());
  const [action = '', owner = '', ...rest] = parts;
  return { action, owner, due: rest.filter(Boolean).join(' ') };
}
