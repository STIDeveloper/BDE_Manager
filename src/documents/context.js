// ============================================================
// STUDIO DOCUMENTS — CONTEXTE DE GÉNÉRATION ET UTILITAIRES
// ============================================================
// Les modèles sont des fonctions PURES : elles reçoivent un contexte
// (instantané des données de l'application) et des valeurs de formulaire,
// et renvoient un document (voir model.js). Aucun accès direct au store.
//
// ── Contrat d'un modèle (src/documents/templates/*.js) ──────
// {
//   id: 'attestation-adhesion',           // unique, stable (utilisé par le registre)
//   category: 'membres' | 'gouvernance' | 'organisation' | 'partenariats' | 'rgpd',
//   title: 'Attestation d\'adhésion',
//   description: 'Une phrase.',
//   icon: 'BadgeCheck',                    // nom d'icône lucide-react
//   tags?: string[],                       // mots-clés de recherche
//   scope: 'member' | 'organization',      // 'member' → un document par membre sélectionné
//   memberFilter?: (member, ctx) => bool,  // membres proposés par défaut (scope 'member')
//   fields: Field[],                       // formulaire
//   legal?: { note: string, references?: string[] },
//   requires?: ('organization.address' | 'organization.rna' | ...)[], // champs du profil requis
//   suggest?: (ctx) => Suggestion[],       // suggestions intelligentes (voir plus bas)
//   warnings?: (ctx, values, member?) => string[], // contrôles affichés avant émission
//                                          // (ex. délai de convocation trop court, IBAN invalide)
//   build: (ctx, values, member /* scope 'member' */) => Document,
// }
//
// Field = { key, label, type, default?, required?, help?, options?, min?, max?, placeholder? }
//   type : 'text' | 'textarea' | 'date' | 'time' | 'number' | 'money' | 'select'
//        | 'checkbox' | 'member' (id d'un membre) | 'members' (ids) | 'role' (id de rôle)
//        | 'list' (string[] : une ligne par élément)
//        | 'resolutions' ([{ title, text, for, against, abstention }])
//        | 'lines' ([{ label, amount, date? }] : lignes chiffrées, ex. note de frais)
//   options (select) : string[] | {value,label}[] | (ctx) => {value,label}[]
//   default : valeur ou fonction (ctx, member) => valeur
//
// Suggestion = { id, title, reason, priority: 'high'|'medium'|'low',
//                templateId, memberIds?: string[], values?: object }
//
// ── Champs administratifs OPTIONNELS d'un membre (fiche membre) ──
//   phone, joinedAt ('AAAA-MM-JJ', date d'adhésion), mandateStart / mandateEnd
//   (début / fin de fonctions), program (formation, ex. « BUT Informatique »),
//   year (« BUT 2 »), profession (défaut « Étudiant(e) »), nationality,
//   address (adresse postale complète), birthDate ('AAAA-MM-JJ'),
//   feePaidAt ('AAAA-MM-JJ'), feeAmount (nombre), imageConsent ('oui'|'non'|'').
//   Tout modèle DOIT fonctionner sans ces champs (valeur de repli ou ligne omise).
// ============================================================

import {
  listRoles, listPoles, listLevels, levelKind, poleColorHex,
} from '../core/catalog.js';

// ------------------------------------------------------------
// Dates & nombres (français)
// ------------------------------------------------------------

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/** Accepte Date, timestamp ou 'AAAA-MM-JJ' (interprété en date locale). */
export function toDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string' && value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** « 1er octobre 2026 », « 12 mars 2027 ». Renvoie '' si date invalide. */
export function formatDateLong(value, { weekday = false } = {}) {
  const d = toDate(value);
  if (!d) return '';
  const day = d.getDate() === 1 ? '1er' : String(d.getDate());
  const base = `${day} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  return weekday ? `${WEEKDAYS[d.getDay()]} ${base}` : base;
}

/** « 12/03/2027 ». */
export function formatDateShort(value) {
  const d = toDate(value);
  if (!d) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** 'AAAA-MM-JJ' (valeur d'un <input type="date">). */
export function isoDate(value = new Date()) {
  const d = toDate(value) || new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** « 18 h 30 » à partir de '18:30'. */
export function formatTime(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!m) return '';
  return m[2] === '00' ? `${Number(m[1])} h` : `${Number(m[1])} h ${m[2]}`;
}

/** Nombre de jours entiers entre deux dates (b - a). */
export function daysBetween(a, b) {
  const da = toDate(a); const db = toDate(b);
  if (!da || !db) return NaN;
  const ua = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
  const ub = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate());
  return Math.round((ub - ua) / 86400000);
}

/** Année universitaire « 2026-2027 » (bascule au 1er septembre). */
export function academicYear(value = new Date()) {
  const d = toDate(value) || new Date();
  const y = d.getFullYear();
  return d.getMonth() >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

/**
 * Montant en euros, « 12,50 € » — espaces normales (les espaces fines
 * insécables d'Intl ne sont pas supportées par les polices PDF standard).
 */
export function formatMoney(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '';
  const [int, dec] = Math.abs(n).toFixed(2).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${n < 0 ? '-' : ''}${grouped},${dec} €`;
}

/** Montant en toutes lettres (reçus) : « douze euros et cinquante centimes ». */
export function amountInWords(amount) {
  const n = Math.round(Number(amount) * 100);
  if (!Number.isFinite(n) || n < 0 || n >= 1e11) return '';
  const euros = Math.floor(n / 100);
  const cents = n % 100;
  const e = `${numberToFrench(euros)} euro${euros > 1 ? 's' : ''}`;
  return cents ? `${e} et ${numberToFrench(cents)} centime${cents > 1 ? 's' : ''}` : e;
}

const UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
const TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

/** Nombre entier en lettres (orthographe traditionnelle). */
export function numberToFrench(num) {
  const n = Math.floor(Number(num));
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 17) return UNITS[n];
  if (n < 20) return `dix-${UNITS[n - 10]}`;
  if (n < 70) {
    const t = Math.floor(n / 10); const u = n % 10;
    if (u === 0) return TENS[t];
    if (u === 1) return `${TENS[t]} et un`;
    return `${TENS[t]}-${UNITS[u]}`;
  }
  if (n < 80) return n === 71 ? 'soixante et onze' : `soixante-${numberToFrench(n - 60)}`;
  if (n < 100) return n === 80 ? 'quatre-vingts' : `quatre-vingt-${numberToFrench(n - 80)}`;
  if (n < 1000) {
    const h = Math.floor(n / 100); const r = n % 100;
    const head = h === 1 ? 'cent' : `${UNITS[h]} cent${r === 0 ? 's' : ''}`;
    return r ? `${head} ${numberToFrench(r)}` : head;
  }
  if (n < 1e6) {
    const k = Math.floor(n / 1000); const r = n % 1000;
    const head = k === 1 ? 'mille' : `${numberToFrench(k).replace(/cents$/, 'cent')} mille`;
    return r ? `${head} ${numberToFrench(r)}` : head;
  }
  const m = Math.floor(n / 1e6); const r = n % 1e6;
  const head = `${numberToFrench(m)} million${m > 1 ? 's' : ''}`;
  return r ? `${head} ${numberToFrench(r)}` : head;
}

// ------------------------------------------------------------
// Texte
// ------------------------------------------------------------

/** « A », « A et B », « A, B et C ». */
export function joinFr(items) {
  const list = (items || []).filter(Boolean);
  if (list.length <= 1) return list[0] || '';
  return `${list.slice(0, -1).join(', ')} et ${list.at(-1)}`;
}

export const plural = (n, singular, pluralForm = `${singular}s`) => `${n} ${n > 1 ? pluralForm : singular}`;

export function fullName(member) {
  if (!member) return '';
  return [member.firstName, member.lastName].map(s => String(s || '').trim()).filter(Boolean).join(' ');
}

/** « NOM Prénom » (listes officielles). */
export function officialName(member) {
  if (!member) return '';
  const last = String(member.lastName || '').trim().toUpperCase();
  const first = String(member.firstName || '').trim();
  return [last, first].filter(Boolean).join(' ');
}

/** Civilité neutre : « Madame, Monsieur » / accord « né(e) ». */
export const neutral = (word) => `${word}(e)`;

// ------------------------------------------------------------
// Contexte
// ------------------------------------------------------------

/**
 * Construit le contexte de génération à partir de l'état des stores.
 * @param {object} s       état du store principal (useStore.getState())
 * @param {object} [extra] { candidates, scenario, vaultEntryLabels, today }
 */
/**
 * Fiche « fantôme » représentant un poste à pourvoir (ex. « [Poste vacant] »
 * du seed historique) : ce n'est pas une personne, elle ne doit figurer dans
 * aucun document (listes officielles, attestations, registre RGPD…).
 */
export function isPlaceholderMember(m) {
  const first = String(m?.firstName || '').trim();
  return /^\[.*\]$/.test(first) || /\bposte\s+vacant\b/i.test(`${first} ${m?.lastName || ''}`);
}

export function buildContext(s, extra = {}) {
  const catalog = { poles: s.poles || {}, levels: s.levels || {}, roles: s.roles || {} };
  const allMembers = Array.isArray(s.members) ? s.members : [];
  const members = allMembers.filter(m => !isPlaceholderMember(m));
  const today = extra.today ? toDate(extra.today) : new Date();
  const ctx = {
    organization: { ...DEFAULT_ORGANIZATION, ...(s.organization || {}) },
    members,
    // Fiches « poste vacant » écartées (utile pour l'organigramme des postes à pourvoir).
    placeholderMembers: allMembers.filter(isPlaceholderMember),
    columns: s.columns || [],
    catalog,
    roleList: listRoles(catalog),
    poleList: listPoles(catalog),
    levelList: listLevels(catalog),
    folders: s.folders || [],
    rolePresets: s.rolePresets || {},
    drivePermissions: s.drivePermissions || {},
    documentLog: s.documentLog || [],
    candidates: extra.candidates || [],
    scenario: extra.scenario || null,
    // Libellés (jamais les valeurs) des entrées du coffre, si déverrouillé.
    vaultEntryLabels: extra.vaultEntryLabels || null,
    today,
  };
  return ctx;
}

export const DEFAULT_ORGANIZATION = {
  name: 'Bureau des Étudiants',
  shortName: '',
  legalForm: 'Association loi 1901',
  rna: '',
  siren: '',
  address: '',
  postalCode: '',
  city: '',
  email: '',
  phone: '',
  website: '',
  school: '',
  object: '',              // objet statutaire (« favoriser la vie étudiante… »)
  prefecture: '',          // préfecture / sous-préfecture de déclaration
  statutesDate: '',        // date des statuts en vigueur (AAAA-MM-JJ)
  membershipFee: '',       // montant de la cotisation (texte ou nombre)
  agNoticeDays: 15,        // délai de convocation à l'AG prévu par les statuts
  agQuorumPercent: 25,     // quorum (% des membres) — à adapter aux statuts
  logo: null,              // dataURL (PNG/JPEG compressé)
  stamp: null,             // tampon / cachet (dataURL)
  signatures: {},          // { [memberId]: dataURL }
  accentColor: '#4f81f5',
  footerNote: '',          // mention libre en pied de page
};

/** Rôle (objet) d'un membre, ou null. */
export const roleOf = (ctx, member) => (member?.mainRole ? ctx.catalog.roles[member.mainRole] || null : null);

/** Libellé du rôle d'un membre (rôle du catalogue, ancien texte libre, ou « Membre »). */
export function roleLabelOf(ctx, member, fallback = 'Membre') {
  const role = roleOf(ctx, member);
  if (role) return role.label;
  return member?.mainRole || member?.legacyMainRole || fallback;
}

export function poleOf(ctx, member) {
  const role = roleOf(ctx, member);
  return role ? ctx.catalog.poles[role.pole] || null : null;
}

/** Premier membre occupant l'un des rôles donnés (ordre de la liste). */
export function memberWithRole(ctx, roleIds) {
  for (const id of [].concat(roleIds)) {
    const m = ctx.members.find(x => x.mainRole === id);
    if (m) return m;
  }
  return null;
}

/** Membres dont le rôle est de niveau « bureau » (au sens moteur). */
export function bureauMembers(ctx) {
  return ctx.members.filter(m => {
    const r = roleOf(ctx, m);
    return r && levelKind(ctx.catalog, r.level) === 'bureau';
  });
}

/**
 * Signataire : membre choisi, sinon titulaire du premier rôle trouvé
 * (président par défaut). Inclut l'image de signature si enregistrée.
 * @returns {{ member, name, role, image }|null}
 */
export function signatory(ctx, memberId, fallbackRoles = ['president', 'vice_president']) {
  const member = (memberId && ctx.members.find(m => m.id === memberId)) || memberWithRole(ctx, fallbackRoles);
  if (!member) return null;
  return {
    member,
    name: fullName(member),
    role: roleLabelOf(ctx, member),
    image: ctx.organization.signatures?.[member.id] || null,
  };
}

/** Bloc de signature prêt à l'emploi. */
export function signatureSlot(sig, label, extra = {}) {
  return {
    label,
    name: sig?.name || '',
    role: sig?.role || '',
    ...(sig?.image ? { image: sig.image } : {}),
    ...extra,
  };
}

/** « BDE IUT de Montreuil, association loi 1901 dont le siège est situé … ». */
export function organizationLegalLine(org) {
  const form = org.legalForm || 'Association loi 1901';
  const name = `${org.name}${org.shortName && org.shortName !== org.name ? ` (${org.shortName})` : ''}`;
  let line = `${name}, ${form.charAt(0).toLowerCase()}${form.slice(1)}`;
  const addr = [org.address, [org.postalCode, org.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  if (addr) line += `, dont le siège est situé ${addr}`;
  if (org.rna) line += `, enregistrée sous le numéro RNA ${org.rna}`;
  return line;
}

/** Ville pour « Fait à … » (repli : ville de l'établissement ou '…'). */
export const cityOf = (org) => org.city || '__________';

/** Accès Drive d'un membre (permissions effectives, sinon preset de son rôle). */
export function driveAccessOf(ctx, member) {
  const LEVEL = { reader: 'Lecteur', commenter: 'Commentateur', editor: 'Éditeur' };
  const perms = ctx.drivePermissions[member?.id] || ctx.rolePresets[member?.mainRole] || {};
  return ctx.folders
    .filter(f => perms[f.id] && perms[f.id] !== 'none')
    .map(f => ({ folder: `${f.code} ${f.name}`, level: LEVEL[perms[f.id]] || perms[f.id] }));
}

export { poleColorHex, levelKind };
