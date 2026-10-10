// ============================================================
// UTILITAIRES PURS — modèles « organisation », « partenariats », « rgpd »
// ============================================================
// Fonctions sans effet de bord, testées dans orgPart_helpers.test.js :
// IBAN (format + clé mod 97), lignes chiffrées (notes de frais, budgets),
// regroupement des membres par pôle, accès Drive d'un pôle.
// ============================================================

import { levelKind, levelRank, POLE_PALETTE } from '../../core/catalog.js';
import { fullName, officialName, formatDateShort, toDate } from '../context.js';

// ------------------------------------------------------------
// Texte
// ------------------------------------------------------------

/** Chaîne nettoyée (jamais « undefined » / « null »). */
export const str = (v) => (v === undefined || v === null ? '' : String(v).trim());

/** Valeur ou ligne à compléter à la main. */
export const orBlank = (v, blank = '____________________') => str(v) || blank;

/** Liste de chaînes non vides (champ 'list'). */
export const cleanList = (items) => (Array.isArray(items) ? items.map(str).filter(Boolean) : []);

// ------------------------------------------------------------
// IBAN
// ------------------------------------------------------------

/** Longueurs officielles des IBAN des pays les plus courants (contrôle léger). */
export const IBAN_LENGTHS = {
  FR: 27, MC: 27, DE: 22, BE: 16, LU: 20, CH: 21, ES: 24, IT: 27, PT: 25,
  NL: 18, GB: 22, IE: 22, AT: 20, PL: 28, RO: 24, GR: 27, FI: 18, SE: 24, DK: 18,
};

/** Supprime espaces et tirets, met en majuscules. */
export function normalizeIban(value) {
  return str(value).replace(/[\s-]+/g, '').toUpperCase();
}

/** « FR76 3000 6000 0112 3456 7890 189 ». */
export function formatIban(value) {
  return normalizeIban(value).replace(/(.{4})(?=.)/g, '$1 ');
}

/** Reste de la division par 97 du nombre formé par l'IBAN réarrangé (ISO 13616). */
export function ibanMod97(iban) {
  const s = normalizeIban(iban);
  const rearranged = s.slice(4) + s.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    // Lettres : A = 10 … Z = 35 ; chiffres : valeur.
    const digits = code >= 65 && code <= 90 ? String(code - 55) : ch;
    for (const d of digits) remainder = (remainder * 10 + Number(d)) % 97;
  }
  return remainder;
}

/**
 * Vérifie un IBAN : format, longueur (pays connus) et clé de contrôle.
 * @returns {{ valid: boolean, normalized: string, error: string }}
 */
export function checkIban(value) {
  const normalized = normalizeIban(value);
  if (!normalized) return { valid: false, normalized, error: 'IBAN non renseigné.' };
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(normalized)) {
    return { valid: false, normalized, error: 'Format d\'IBAN invalide (2 lettres pays, 2 chiffres de clé, puis 11 à 30 caractères alphanumériques).' };
  }
  const expected = IBAN_LENGTHS[normalized.slice(0, 2)];
  if (expected && normalized.length !== expected) {
    return { valid: false, normalized, error: `Un IBAN ${normalized.slice(0, 2)} doit comporter ${expected} caractères (${normalized.length} saisis).` };
  }
  if (ibanMod97(normalized) !== 1) {
    return { valid: false, normalized, error: 'Clé de contrôle de l\'IBAN incorrecte : vérifiez la saisie.' };
  }
  return { valid: true, normalized, error: '' };
}

// ------------------------------------------------------------
// Lignes chiffrées (champ 'lines' : [{ label, amount, date? }])
// ------------------------------------------------------------

/** Montant saisi (« 12,50 », « 1 200 », 12.5) → nombre, ou NaN. */
export function parseAmount(value) {
  if (typeof value === 'number') return value;
  const s = str(value).replace(/[\s\u00a0\u202f\u20ac]/g, '').replace(',', '.');
  if (!s) return NaN;
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

const LEADING_DATE_RX = /^\s*(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})\s*(?:[-–—:|]\s*)?(.*)$/;

/**
 * Sépare une date placée en tête de libellé : « 12/03/2027 – Fournitures »
 * → { date: '12/03/2027', text: 'Fournitures' }. Un champ `date` explicite
 * (extension future du type 'lines') est prioritaire.
 */
export function splitLineDate(line) {
  const label = str(line?.label);
  if (line?.date) {
    const d = formatDateShort(line.date) || str(line.date);
    return { date: d, text: label };
  }
  const m = LEADING_DATE_RX.exec(label);
  if (!m) return { date: '', text: label };
  const raw = m[1];
  const date = /^\d{4}-/.test(raw) ? formatDateShort(raw) : raw;
  return { date, text: str(m[2]) };
}

/**
 * Lignes exploitables : libellé ou montant renseigné. Chaque ligne reçoit
 * `value` (nombre, 0 si invalide) et `invalid` (montant illisible ou négatif).
 */
export function normalizeLines(lines) {
  return (Array.isArray(lines) ? lines : [])
    .filter(l => l && (str(l.label) || str(l.amount)))
    .map(l => {
      const n = parseAmount(l.amount);
      const invalid = !Number.isFinite(n) || n < 0;
      const { date, text } = splitLineDate(l);
      return { label: text, date, value: invalid ? 0 : Math.round(n * 100) / 100, invalid };
    });
}

/** Total arrondi au centime. */
export function sumLines(lines) {
  return Math.round(normalizeLines(lines).reduce((acc, l) => acc + l.value * 100, 0)) / 100;
}

/** Messages d'avertissement pour des lignes chiffrées. */
export function lineWarnings(lines, what = 'ligne') {
  return normalizeLines(lines)
    .map((l, i) => (l.invalid ? `${what.charAt(0).toUpperCase()}${what.slice(1)} ${i + 1}${l.label ? ` (« ${l.label} »)` : ''} : montant manquant ou invalide, compté pour 0.` : ''))
    .filter(Boolean);
}

// ------------------------------------------------------------
// Membres & pôles
// ------------------------------------------------------------

/** Comparaison alphabétique « NOM Prénom ». */
export const byOfficialName = (a, b) => officialName(a).localeCompare(officialName(b), 'fr');

/** Titulaires d'un rôle (triés). */
export function holdersOf(ctx, roleId) {
  return ctx.members.filter(m => m.mainRole === roleId).sort(byOfficialName);
}

/** Rôles d'un pôle, du plus haut niveau au plus bas, puis ordre du catalogue. */
export function rolesOfPoleRanked(ctx, poleId) {
  const list = ctx.roleList.filter(r => r.pole === poleId);
  return list
    .map((r, i) => ({ r, i }))
    .sort((a, b) => levelRank(ctx.catalog, b.r.level) - levelRank(ctx.catalog, a.r.level) || a.i - b.i)
    .map(x => x.r);
}

/** Pôles triés, ceux qui contiennent un rôle de niveau « bureau » en premier. */
export function polesBureauFirst(ctx) {
  const hasBureau = (p) => ctx.roleList.some(r => r.pole === p.id && levelKind(ctx.catalog, r.level) === 'bureau');
  return [...ctx.poleList].sort((a, b) => Number(hasBureau(b)) - Number(hasBureau(a)));
}

/** Membres sans rôle du catalogue (rôle vide, supprimé ou ancien texte libre). */
export function membersWithoutCatalogRole(ctx) {
  return ctx.members.filter(m => !m.mainRole || !ctx.catalog.roles[m.mainRole]).sort(byOfficialName);
}

/** Libellé d'un pôle avec son emoji. */
export const poleTitle = (pole) => [str(pole?.emoji), str(pole?.label)].filter(Boolean).join(' ');

export const NEUTRAL_COLOR = POLE_PALETTE.zinc;

/** Membre affiché « Prénom Nom » (repli : « Membre sans nom »). */
export const displayName = (m) => fullName(m) || 'Membre sans nom';

// ------------------------------------------------------------
// Drive
// ------------------------------------------------------------

const LEVEL_ORDER = { reader: 1, commenter: 2, editor: 3 };
export const DRIVE_LEVEL_LABELS = { reader: 'Lecteur', commenter: 'Commentateur', editor: 'Éditeur' };

/**
 * Union des presets Drive des rôles d'un pôle : pour chaque dossier, le
 * niveau le plus élevé et les rôles qui y ont accès (ordre des dossiers).
 * @returns {{ folder, level, levelLabel, roles: string[] }[]}
 */
export function poleDriveAccess(ctx, poleId) {
  const roles = rolesOfPoleRanked(ctx, poleId);
  return ctx.folders
    .map(f => {
      let best = null;
      const holders = [];
      roles.forEach(r => {
        const lvl = ctx.rolePresets[r.id]?.[f.id];
        if (!LEVEL_ORDER[lvl]) return;
        holders.push(r.label);
        if (!best || LEVEL_ORDER[lvl] > LEVEL_ORDER[best]) best = lvl;
      });
      return best ? { folder: `${str(f.code)} ${str(f.name)}`.trim(), level: best, levelLabel: DRIVE_LEVEL_LABELS[best], roles: holders } : null;
    })
    .filter(Boolean);
}

/** Membres disposant d'au moins un accès Drive explicite. */
export function membersWithDrivePermissions(ctx) {
  return ctx.members.filter(m => Object.values(ctx.drivePermissions[m.id] || {}).some(v => LEVEL_ORDER[v]));
}

// ------------------------------------------------------------
// Dates
// ------------------------------------------------------------

/** Âge en années révolues à une date donnée (NaN si date inconnue). */
export function ageAt(birthDate, at) {
  const b = toDate(birthDate); const d = toDate(at);
  if (!b || !d) return NaN;
  let age = d.getFullYear() - b.getFullYear();
  if (d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate())) age--;
  return age;
}

/** Fin de l'année universitaire en cours (31 août). */
export function academicYearEnd(value) {
  const d = toDate(value) || new Date();
  const y = d.getMonth() >= 8 ? d.getFullYear() + 1 : d.getFullYear();
  return `${y}-08-31`;
}

/** Le modèle a-t-il déjà été émis depuis la date donnée (registre) ? */
export function issuedSince(ctx, templateId, since) {
  const s = toDate(since);
  return (ctx.documentLog || []).some(e => e?.templateId === templateId && (!s || (toDate(e.createdAt) || new Date(0)) >= s));
}

// ------------------------------------------------------------
// RGPD — durées de conservation par défaut (modifiables dans les formulaires)
// ------------------------------------------------------------

export const RGPD_RETENTION_DEFAULTS = {
  members: 'Pendant la durée de l\'adhésion, puis un an à compter de sa fin (archivage limité aux informations nécessaires), sauf obligation légale de conservation plus longue.',
  candidates: 'Jusqu\'à la fin de la campagne de recrutement, et au plus tard six mois après le dépôt de la candidature.',
  drive: 'Pendant la durée des fonctions ; les accès sont retirés au plus tard lors de la passation.',
  image: 'Pendant la durée prévue par l\'autorisation, et jusqu\'au retrait du consentement.',
  finance: 'Pendant la durée nécessaire au respect des obligations comptables et fiscales de l\'association.',
  documents: 'Pendant la durée nécessaire à la preuve des documents émis (le registre de l\'application conserve au plus les 1 000 dernières entrées).',
  vault: 'Tant que les comptes de l\'association sont actifs ; les identifiants sont modifiés à chaque passation.',
};
