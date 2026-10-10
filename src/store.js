import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createSilenceableStorage, onExternalStorageChange } from './core/crossTabSync.js';
import {
  setupVault,
  unlockVault,
  encryptEntries,
} from './core/crypto.js';
import {
  createDefaultCatalog, normalizeCatalog, makeUniqueId, setActiveCatalog,
  listRoles, listPoles, listLevels, CATALOG_LIMITS, LEVEL_KINDS, POLE_PALETTE,
} from './core/catalog.js';
import { migrateMainStore, STORE_VERSION } from './core/migrations.js';
import { migrateMemberRole, migratePresets, resolveRoleId } from './core/roleAliases.js';

const DEFAULT_BADGES = [
  'Accès Insta', 'Accès TikTok', 'Accès Facebook', 'Accès Twitter/X',
  'Accès Drive', 'Accès Banque',
  'Membre Com', 'Membre Event', 'Membre Projet',
  'Membre Actif', 'Ancien Membre', 'En Pause',
  'Créateur de contenu', 'Photographe', 'Monteur Vidéo', 'Graphiste', 'DJ',
];

const DEFAULT_ROLES = [
  'president', 'vice_president', 'tresorier', 'secretaire',
  'responsable_communication', 'responsable_communication_interne',
  'responsable_projets', 'responsable_sport', 'responsable_esport', 'responsable_partenariats',
  'membre_communication', 'membre_communication_interne',
  'membre_projets', 'membre_sport', 'membre_esport', 'membre_partenariats',
];

export const ENTRY_TYPES = [
  { id: 'login', label: 'Login / Identifiant', icon: '👤', sensitive: false },
  { id: 'password', label: 'Mot de passe', icon: '🔑', sensitive: true },
  { id: 'wifi', label: 'Mot de passe WiFi', icon: '📶', sensitive: true },
  { id: 'computer', label: 'Mot de passe Ordinateur', icon: '💻', sensitive: true },
  { id: 'bank', label: 'Info Bancaire', icon: '🏦', sensitive: true },
  { id: 'note', label: 'Note privée', icon: '📝', sensitive: false },
  { id: 'reminder', label: 'Rappel', icon: '⏰', sensitive: false, hasDate: true },
  { id: 'link', label: 'Lien / URL', icon: '🔗', sensitive: false },
  { id: 'other', label: 'Autre', icon: '📦', sensitive: false },
];

export const PERMISSION_LEVELS = [
  { id: 'none',      label: 'Aucun',        short: '',  icon: '🚫', color: 'zinc',    bg: 'bg-transparent',    text: 'text-dim',         hover: 'hover:bg-elevated' },
  { id: 'reader',    label: 'Lecteur',      short: 'L', icon: '👁', color: 'blue',    bg: 'bg-blue-500/20',    text: 'text-blue-500',    hover: 'hover:bg-blue-500/30' },
  { id: 'commenter', label: 'Commentateur', short: 'C', icon: '💬', color: 'amber',   bg: 'bg-amber-500/20',   text: 'text-amber-500',   hover: 'hover:bg-amber-500/30' },
  { id: 'editor',    label: 'Éditeur',      short: 'E', icon: '✏️', color: 'emerald', bg: 'bg-emerald-500/20', text: 'text-emerald-500', hover: 'hover:bg-emerald-500/30' },
];

export const FOLDER_COLORS = [
  { id: 'red',     label: 'Rouge',    dot: 'bg-red-500',     accent: 'bg-red-500/10 text-red-500 border-red-500/30' },
  { id: 'blue',    label: 'Bleu',     dot: 'bg-blue-500',    accent: 'bg-blue-500/10 text-blue-500 border-blue-500/30' },
  { id: 'purple',  label: 'Violet',   dot: 'bg-purple-500',  accent: 'bg-purple-500/10 text-purple-500 border-purple-500/30' },
  { id: 'amber',   label: 'Ambre',    dot: 'bg-amber-500',   accent: 'bg-amber-500/10 text-amber-500 border-amber-500/30' },
  { id: 'emerald', label: 'Émeraude', dot: 'bg-emerald-500', accent: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' },
  { id: 'zinc',    label: 'Neutre',   dot: 'bg-zinc-500',    accent: 'bg-elevated text-dim border-line' },
];

export const DEFAULT_FOLDER_TAGS = [
  { id: 'confidential', label: '🔒 Confidentiel', color: 'red' },
  { id: 'public',       label: '🌍 Public',       color: 'blue' },
  { id: 'inter-poles',  label: '📢 Inter-pôles',  color: 'purple' },
  { id: 'temporary',    label: '⏱ Temporaire',    color: 'amber' },
  { id: 'archive',      label: '📦 Archive',      color: 'zinc' },
];

const DEFAULT_FOLDERS = [
  { id: 'f00', code: '00', name: 'Bureau & Stratégie', parent: null, color: 'red', tags: ['confidential'] },
  { id: 'f00.1', code: '00.1', name: 'AG et Comptes-rendus', parent: 'f00', color: 'red', tags: ['confidential'] },
  { id: 'f00.2', code: '00.2', name: 'Trésorerie & Budget', parent: 'f00', color: 'red', tags: ['confidential'] },
  { id: 'f00.3', code: '00.3', name: 'Gouvernance & Passations', parent: 'f00', color: 'red', tags: ['confidential'] },
  { id: 'f01', code: '01', name: 'Pôle Communication', parent: null, color: 'blue', tags: ['inter-poles'] },
  { id: 'f01.1', code: '01.1', name: 'Gestion & Briefs', parent: 'f01', color: 'blue', tags: [] },
  { id: 'f01.2', code: '01.2', name: 'Com Interne & IUT', parent: 'f01', color: 'blue', tags: [] },
  { id: 'f01.3', code: '01.3', name: 'Réseaux Sociaux', parent: 'f01', color: 'blue', tags: [] },
  { id: 'f01.3.1', code: '01.3.1', name: 'Instagram', parent: 'f01.3', color: 'blue', tags: [] },
  { id: 'f01.3.2', code: '01.3.2', name: 'TikTok', parent: 'f01.3', color: 'blue', tags: [] },
  { id: 'f01.4', code: '01.4', name: 'Ressources Transverses & Rebranding', parent: 'f01', color: 'blue', tags: ['public'] },
  { id: 'f01.5', code: '01.5', name: 'Data & Web', parent: 'f01', color: 'blue', tags: [] },
  { id: 'f02', code: '02', name: 'Pôle Événementiel', parent: null, color: 'purple', tags: ['inter-poles'] },
  { id: 'f02.1', code: '02.1', name: 'Week-N Days (WED)', parent: 'f02', color: 'purple', tags: [] },
  { id: 'f02.2', code: '02.2', name: 'Projets en cours', parent: 'f02', color: 'purple', tags: [] },
  { id: 'f02.3', code: '02.3', name: 'Projets terminés / Bilans', parent: 'f02', color: 'purple', tags: ['archive'] },
  { id: 'f03', code: '03', name: 'Pôle Partenariat', parent: null, color: 'amber', tags: ['inter-poles'] },
  { id: 'f03.1', code: '03.1', name: 'Fiches Contacts', parent: 'f03', color: 'amber', tags: ['confidential'] },
  { id: 'f03.2', code: '03.2', name: 'Conventions & Contrats', parent: 'f03', color: 'amber', tags: ['confidential'] },
  { id: 'f03.3', code: '03.3', name: 'Démarchage', parent: 'f03', color: 'amber', tags: [] },
  { id: 'f04', code: '04', name: 'Logistique & Inventaire', parent: null, color: 'emerald', tags: [] },
];

export const DEFAULT_ROLE_PRESETS = {
  president: {
    'f00': 'editor', 'f00.1': 'editor', 'f00.2': 'editor', 'f00.3': 'editor',
    'f01': 'editor', 'f01.1': 'editor', 'f01.2': 'editor', 'f01.3': 'editor',
    'f01.3.1': 'editor', 'f01.3.2': 'editor', 'f01.4': 'editor', 'f01.5': 'editor',
    'f02': 'editor', 'f02.1': 'editor', 'f02.2': 'editor', 'f02.3': 'editor',
    'f03': 'editor', 'f03.1': 'editor', 'f03.2': 'editor', 'f03.3': 'editor',
    'f04': 'editor',
  },
  vice_president: {
    'f00': 'editor', 'f00.1': 'editor', 'f00.3': 'editor',
    'f01': 'reader', 'f02': 'reader', 'f03': 'reader', 'f04': 'reader',
  },
  tresorier: {
    'f00': 'editor', 'f00.1': 'editor', 'f00.2': 'editor', 'f00.3': 'editor',
    'f01': 'reader', 'f02': 'reader', 'f03': 'reader', 'f04': 'reader',
  },
  secretaire: {
    'f00': 'editor', 'f00.1': 'editor', 'f00.3': 'editor',
    'f01': 'reader', 'f02': 'reader', 'f03': 'reader', 'f04': 'reader',
  },
  responsable_communication: {
    'f01': 'editor', 'f01.1': 'editor', 'f01.2': 'editor', 'f01.3': 'editor',
    'f01.3.1': 'editor', 'f01.3.2': 'editor', 'f01.4': 'editor', 'f01.5': 'editor',
    'f02': 'reader', 'f03': 'reader', 'f04': 'reader',
  },
  responsable_communication_interne: {
    'f01': 'reader', 'f01.2': 'editor', 'f01.4': 'editor',
    'f02': 'reader', 'f03': 'reader', 'f04': 'reader',
  },
  responsable_projets: {
    'f02': 'editor', 'f02.1': 'editor', 'f02.2': 'editor', 'f02.3': 'editor',
    'f01': 'reader', 'f03': 'reader', 'f04': 'editor',
  },
  responsable_sport: {
    'f02': 'editor', 'f02.1': 'editor', 'f02.2': 'editor', 'f02.3': 'editor',
    'f04': 'editor',
  },
  responsable_esport: {
    'f02': 'editor', 'f02.1': 'editor', 'f02.2': 'editor', 'f02.3': 'editor',
  },
  responsable_partenariats: {
    'f03': 'editor', 'f03.1': 'editor', 'f03.2': 'editor', 'f03.3': 'editor',
    'f00': 'reader', 'f01': 'reader', 'f02': 'reader',
  },
  membre_communication: {
    'f01': 'reader', 'f01.4': 'reader',
  },
  membre_communication_interne: {
    'f01': 'reader', 'f01.2': 'reader',
  },
  membre_projets: {
    'f02': 'reader',
  },
  membre_sport: {
    'f02': 'reader',
  },
  membre_esport: {
    'f02': 'reader',
  },
  membre_partenariats: {
    'f03': 'reader',
  },
};

// ============================================================
// HISTORIQUE (undo / redo)
// ============================================================
// Chaque snapshot ne contient que des RÉFÉRENCES (les mises à jour sont
// immuables) : le coût mémoire reste négligeable.
const HISTORY_KEYS = [
  'members', 'columns',
  'drivePermissions', 'permissionNotes', 'rolePresets',
  'folders', 'folderTags',
  'poles', 'levels', 'roles',
];
const HISTORY_LIMIT = 30;
const snapshotOf = (s) => Object.fromEntries(HISTORY_KEYS.map(k => [k, s[k]]));
const restoreOf = (snap, s) => Object.fromEntries(HISTORY_KEYS.map(k => [k, snap[k] ?? s[k]]));

// ============================================================
// CATALOGUE — validation des saisies
// ============================================================
const ok = (extra = {}) => ({ ok: true, ...extra });
const fail = (error) => ({ ok: false, error });

const trimLabel = (v) => (typeof v === 'string' ? v.trim().slice(0, CATALOG_LIMITS.maxLabel) : '');
const clampCapacity = (v) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(0, Math.min(CATALOG_LIMITS.maxCapacity, n)) : 1;
};
const labelTaken = (map, label, exceptId) => {
  const k = label.trim().toLowerCase();
  return Object.values(map).some(x => x.id !== exceptId && x.label.trim().toLowerCase() === k);
};
const isColor = (c) => typeof c === 'string' && (POLE_PALETTE[c] || /^#[0-9a-f]{6}$/i.test(c));
const LEVEL_KIND_SET = new Set(LEVEL_KINDS.map(k => k.id));

/** Renumérote `order` (0..n-1) selon l'ordre de `ids`. */
function withOrder(map, ids) {
  const next = { ...map };
  ids.forEach((id, i) => { if (next[id] && next[id].order !== i) next[id] = { ...next[id], order: i }; });
  return next;
}

/** Déplace `id` d'un cran (dir = -1 | +1) dans la liste `ids`. */
function moveInList(ids, id, dir) {
  const i = ids.indexOf(id);
  const j = i + dir;
  if (i === -1 || j < 0 || j >= ids.length) return null;
  const out = [...ids];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/**
 * Membres dont le rôle n'existe plus dans le catalogue `roles` :
 * le rôle est vidé et l'ancien libellé conservé dans `legacyMainRole`.
 */
function detachOrphanMembers(members, roles, previousRoles) {
  let changed = 0;
  const next = members.map(m => {
    if (!m.mainRole || roles[m.mainRole] || !previousRoles[m.mainRole]) return m;
    changed++;
    return { ...m, mainRole: '', legacyMainRole: previousRoles[m.mainRole].label };
  });
  return { members: changed ? next : members, changed };
}

const mainStorage = createSilenceableStorage();

// File d'attente des écritures du coffre (voir _vaultQueue).
let vaultWriteQueue = Promise.resolve();

export const useStore = create(
  persist(
    (set, get) => ({
      theme: 'dark',
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),

      columns: [
        { id: 'direction', title: '🏛️ Bureau & Direction' },
        { id: 'com', title: '📣 Pôle Communication' },
        { id: 'projet', title: '📋 Pôle Projets' },
        { id: 'event', title: '🎉 Pôle Événementiel' },
        { id: 'part', title: '🤝 Pôle Partenariat' },
        { id: 'transverse', title: '🧩 Membres transversaux' },
      ],
      members: [],
      availableBadges: DEFAULT_BADGES,
      // ⚠️ Déprécié (v11) : liste texte historique, remplacée par `roles`.
      // Conservée pour la compatibilité des anciens backups.
      availableRoles: DEFAULT_ROLES,

      // ========== CATALOGUE DES RÔLES (v11) ==========
      ...createDefaultCatalog(),

      addMember: (member) => {
        get()._pushHistory();
        const id = crypto.randomUUID();
        set((s) => ({ members: [...s.members, { badges: [], notes: '', ...member, id }] }));
        return id;
      },
      updateMember: (id, updates) => {
        get()._pushHistory();
        set((s) => ({ members: s.members.map(m => m.id === id ? { ...m, ...updates, id } : m) }));
      },
      deleteMember: (id) => {
        get()._pushHistory();
        set((s) => {
          const { [id]: _p, ...drivePermissions } = s.drivePermissions;
          const { [id]: _n, ...permissionNotes } = s.permissionNotes;
          return { members: s.members.filter(m => m.id !== id), drivePermissions, permissionNotes };
        });
      },
      moveMember: (memberId, newColumnId) => {
        const m = get().members.find(x => x.id === memberId);
        if (!m || m.columnId === newColumnId) return;
        get()._pushHistory();
        set((s) => ({
          members: s.members.map(x => x.id === memberId ? { ...x, columnId: newColumnId } : x)
        }));
      },

      addColumn: (title) => {
        get()._pushHistory();
        const id = crypto.randomUUID();
        set((s) => ({ columns: [...s.columns, { id, title }] }));
        return id;
      },
      updateColumn: (id, title) => {
        get()._pushHistory();
        set((s) => ({ columns: s.columns.map(c => c.id === id ? { ...c, title } : c) }));
      },
      moveColumn: (id, dir) => {
        const ids = get().columns.map(c => c.id);
        const next = moveInList(ids, id, dir);
        if (!next) return;
        get()._pushHistory();
        set((s) => ({ columns: next.map(cid => s.columns.find(c => c.id === cid)) }));
      },
      /**
       * Supprime une colonne. Par défaut ses membres sont déplacés vers
       * `moveMembersTo` ; sans destination ils sont supprimés (avec leurs
       * permissions). L'opération est annulable (undo).
       */
      deleteColumn: (id, { moveMembersTo = null } = {}) => {
        get()._pushHistory();
        set((s) => {
          const target = moveMembersTo && moveMembersTo !== id && s.columns.some(c => c.id === moveMembersTo) ? moveMembersTo : null;
          const columns = s.columns.filter(c => c.id !== id);
          if (target) {
            return { columns, members: s.members.map(m => m.columnId === id ? { ...m, columnId: target } : m) };
          }
          const removed = new Set(s.members.filter(m => m.columnId === id).map(m => m.id));
          return {
            columns,
            members: s.members.filter(m => !removed.has(m.id)),
            drivePermissions: Object.fromEntries(Object.entries(s.drivePermissions).filter(([k]) => !removed.has(k))),
            permissionNotes: Object.fromEntries(Object.entries(s.permissionNotes).filter(([k]) => !removed.has(k))),
          };
        });
      },

      addBadge: (badge) => set((s) => ({
        availableBadges: s.availableBadges.includes(badge) ? s.availableBadges : [...s.availableBadges, badge]
      })),

      // ========== CRUD PÔLES ==========
      addPole: (data = {}) => {
        const s = get();
        const label = trimLabel(data.label) || 'Nouveau pôle';
        if (labelTaken(s.poles, label)) return fail(`Un pôle « ${label} » existe déjà.`);
        const id = makeUniqueId(label, s.poles, 'pole');
        const order = Math.max(-1, ...Object.values(s.poles).map(p => p.order ?? 0)) + 1;
        s._pushHistory();
        set((st) => ({
          poles: {
            ...st.poles,
            [id]: normalizeCatalog({ poles: { [id]: { ...data, label, order, custom: true } } }).poles[id],
          },
        }));
        return ok({ id });
      },

      updatePole: (poleId, updates = {}) => {
        const s = get();
        const current = s.poles[poleId];
        if (!current) return fail('Pôle introuvable.');
        const patch = { ...updates };
        delete patch.id;
        if ('label' in patch) {
          patch.label = trimLabel(patch.label);
          if (!patch.label) return fail('Le nom du pôle est obligatoire.');
          if (labelTaken(s.poles, patch.label, poleId)) return fail(`Un pôle « ${patch.label} » existe déjà.`);
        }
        if ('color' in patch && !isColor(patch.color)) return fail('Couleur invalide.');
        const merged = normalizeCatalog({ poles: { [poleId]: { ...current, ...patch } } }).poles[poleId];
        if (patch.columnId === '' || patch.columnId === null) delete merged.columnId;
        s._pushHistory();
        set((st) => ({ poles: { ...st.poles, [poleId]: merged } }));
        return ok();
      },

      /** Refusée si des rôles sont rattachés au pôle. */
      deletePole: (poleId) => {
        const s = get();
        if (!s.poles[poleId]) return fail('Pôle introuvable.');
        const attached = Object.values(s.roles).filter(r => r.pole === poleId);
        if (attached.length > 0) {
          return fail(`Impossible : ${attached.length} rôle${attached.length > 1 ? 's sont rattachés' : ' est rattaché'} à ce pôle. Déplace-les ou supprime-les d'abord.`);
        }
        if (Object.keys(s.poles).length <= 1) return fail('Le catalogue doit contenir au moins un pôle.');
        s._pushHistory();
        set((st) => {
          const { [poleId]: _removed, ...poles } = st.poles;
          return { poles };
        });
        return ok();
      },

      movePole: (poleId, dir) => {
        const ids = listPoles(get()).map(p => p.id);
        const next = moveInList(ids, poleId, dir);
        if (!next) return fail('Déplacement impossible.');
        get()._pushHistory();
        set((s) => ({ poles: withOrder(s.poles, next) }));
        return ok();
      },

      reorderPoles: (orderedIds) => {
        get()._pushHistory();
        set((s) => ({ poles: withOrder(s.poles, orderedIds.filter(id => s.poles[id])) }));
        return ok();
      },

      // ========== CRUD NIVEAUX ==========
      addLevel: (data = {}) => {
        const s = get();
        const label = trimLabel(data.label) || 'Nouveau niveau';
        if (labelTaken(s.levels, label)) return fail(`Un niveau « ${label} » existe déjà.`);
        const id = makeUniqueId(label, s.levels, 'level');
        const order = Math.max(0, ...Object.values(s.levels).map(l => l.order ?? 0)) + 1;
        const kind = LEVEL_KIND_SET.has(data.kind) ? data.kind : 'membre';
        s._pushHistory();
        set((st) => ({
          levels: {
            ...st.levels,
            [id]: normalizeCatalog({ levels: { [id]: { requirement: 0.5, ...data, kind, label, order: data.order ?? order, custom: true } } }).levels[id],
          },
        }));
        return ok({ id });
      },

      updateLevel: (levelId, updates = {}) => {
        const s = get();
        const current = s.levels[levelId];
        if (!current) return fail('Niveau introuvable.');
        const patch = { ...updates };
        delete patch.id;
        if ('label' in patch) {
          patch.label = trimLabel(patch.label);
          if (!patch.label) return fail('Le nom du niveau est obligatoire.');
          if (labelTaken(s.levels, patch.label, levelId)) return fail(`Un niveau « ${patch.label} » existe déjà.`);
        }
        if ('kind' in patch && !LEVEL_KIND_SET.has(patch.kind)) return fail('Comportement moteur invalide.');
        const merged = normalizeCatalog({ levels: { [levelId]: { ...current, ...patch } } }).levels[levelId];
        s._pushHistory();
        set((st) => ({ levels: { ...st.levels, [levelId]: merged } }));
        return ok();
      },

      /** Refusée si des rôles utilisent ce niveau. */
      deleteLevel: (levelId) => {
        const s = get();
        if (!s.levels[levelId]) return fail('Niveau introuvable.');
        const used = Object.values(s.roles).filter(r => r.level === levelId);
        if (used.length > 0) {
          return fail(`Impossible : ${used.length} rôle${used.length > 1 ? 's utilisent' : ' utilise'} ce niveau. Change leur niveau d'abord.`);
        }
        if (Object.keys(s.levels).length <= 1) return fail('Le catalogue doit contenir au moins un niveau.');
        s._pushHistory();
        set((st) => {
          const { [levelId]: _removed, ...levels } = st.levels;
          return { levels };
        });
        return ok();
      },

      moveLevel: (levelId, dir) => {
        const ids = listLevels(get()).map(l => l.id);
        const next = moveInList(ids, levelId, dir);
        if (!next) return fail('Déplacement impossible.');
        get()._pushHistory();
        // Les niveaux sont ordonnés à partir de 1 (1 = plus haut niveau).
        set((s) => {
          const levels = { ...s.levels };
          next.forEach((id, i) => { levels[id] = { ...levels[id], order: i + 1 }; });
          return { levels };
        });
        return ok();
      },

      // ========== CRUD RÔLES ==========
      addRole: (data = {}) => {
        const s = get();
        const label = trimLabel(data.label) || 'Nouveau rôle';
        if (labelTaken(s.roles, label)) return fail(`Un rôle « ${label} » existe déjà.`);
        const pole = s.poles[data.pole] ? data.pole : (s.poles.transversal ? 'transversal' : listPoles(s)[0]?.id);
        const level = s.levels[data.level] ? data.level : listLevels(s).at(-1)?.id;
        if (!pole || !level) return fail('Crée d\'abord au moins un pôle et un niveau.');
        const id = makeUniqueId(label, s.roles, 'role');
        const order = Math.max(-1, ...Object.values(s.roles).filter(r => r.pole === pole).map(r => r.order ?? 0)) + 1;
        const role = normalizeCatalog({
          poles: s.poles, levels: s.levels,
          roles: { [id]: { capacity: 1, ...data, id, label, pole, level, order, custom: true } },
        }).roles[id];
        s._pushHistory();
        set((st) => ({ roles: { ...st.roles, [id]: role } }));
        return ok({ id });
      },

      /** Modifie un rôle. L'id est immuable : presets, membres et contraintes restent liés. */
      updateRole: (roleId, updates = {}) => {
        const s = get();
        const current = s.roles[roleId];
        if (!current) return fail('Rôle introuvable.');
        const patch = { ...updates };
        delete patch.id;
        if ('label' in patch) {
          patch.label = trimLabel(patch.label);
          if (!patch.label) return fail('Le nom du rôle est obligatoire.');
          if (labelTaken(s.roles, patch.label, roleId)) return fail(`Un rôle « ${patch.label} » existe déjà.`);
        }
        if ('pole' in patch && !s.poles[patch.pole]) return fail('Pôle inexistant.');
        if ('level' in patch && !s.levels[patch.level]) return fail('Niveau inexistant.');
        if ('capacity' in patch) patch.capacity = clampCapacity(patch.capacity);
        // Changement de pôle → le rôle passe en fin de liste du nouveau pôle.
        if (patch.pole && patch.pole !== current.pole) {
          patch.order = Math.max(-1, ...Object.values(s.roles).filter(r => r.pole === patch.pole).map(r => r.order ?? 0)) + 1;
        }
        const merged = normalizeCatalog({
          poles: s.poles, levels: s.levels, roles: { [roleId]: { ...current, ...patch } },
        }).roles[roleId];
        s._pushHistory();
        set((st) => ({ roles: { ...st.roles, [roleId]: merged } }));
        return ok();
      },

      setRoleCapacity: (roleId, capacity) => get().updateRole(roleId, { capacity }),

      duplicateRole: (roleId) => {
        const s = get();
        const original = s.roles[roleId];
        if (!original) return fail('Rôle introuvable.');
        let label = `${original.label} (copie)`;
        let n = 2;
        while (labelTaken(s.roles, label)) label = `${original.label} (copie ${n++})`;
        // Les alias ne sont pas dupliqués (ils doivent rester uniques pour l'import CSV).
        // Rôle + preset Drive copiés en une seule entrée d'historique.
        get().beginBatch();
        try {
          const res = get().addRole({ ...original, label, aliases: [] });
          if (res.ok && s.rolePresets[roleId]) {
            set((st) => ({ rolePresets: { ...st.rolePresets, [res.id]: { ...st.rolePresets[roleId] } } }));
          }
          return res;
        } finally {
          get().endBatch();
        }
      },

      /**
       * Supprime un rôle.
       *  - les membres qui l'occupent sont réaffectés à `reassignTo` (id de rôle)
       *    ou laissés sans rôle (ancien libellé conservé dans `legacyMainRole`) ;
       *  - le preset Drive associé est supprimé ;
       *  - le moteur de rôles purge ses contraintes/verrous (abonnement).
       * Annulable via undo (sauf la purge des contraintes du moteur).
       */
      deleteRole: (roleId, { reassignTo = '' } = {}) => {
        const s = get();
        const role = s.roles[roleId];
        if (!role) return fail('Rôle introuvable.');
        if (reassignTo && (!s.roles[reassignTo] || reassignTo === roleId)) return fail('Rôle de remplacement invalide.');
        s._pushHistory();
        let affected = 0;
        set((st) => {
          const { [roleId]: _removed, ...roles } = st.roles;
          const { [roleId]: _preset, ...rolePresets } = st.rolePresets;
          const members = st.members.map(m => {
            if (m.mainRole !== roleId) return m;
            affected++;
            return reassignTo
              ? { ...m, mainRole: reassignTo }
              : { ...m, mainRole: '', legacyMainRole: role.label };
          });
          return { roles, rolePresets, members };
        });
        return ok({ affectedMembers: affected });
      },

      moveRole: (roleId, dir) => {
        const s = get();
        const role = s.roles[roleId];
        if (!role) return fail('Rôle introuvable.');
        const ids = listRoles(s).filter(r => r.pole === role.pole).map(r => r.id);
        const next = moveInList(ids, roleId, dir);
        if (!next) return fail('Déplacement impossible.');
        s._pushHistory();
        set((st) => ({ roles: withOrder(st.roles, next) }));
        return ok();
      },

      /** Réordonne les rôles d'un pôle (glisser-déposer). */
      reorderRoles: (orderedIds) => {
        get()._pushHistory();
        set((s) => ({ roles: withOrder(s.roles, orderedIds.filter(id => s.roles[id])) }));
        return ok();
      },

      exportCatalog: () => {
        const s = get();
        return {
          kind: 'bde-manager/catalog',
          version: 1,
          exportedAt: new Date().toISOString(),
          catalog: { poles: s.poles, levels: s.levels, roles: s.roles },
        };
      },

      /**
       * Remplace le catalogue (import JSON ou réinitialisation).
       * Les membres dont le rôle disparaît sont détachés (ancien libellé
       * conservé). Les presets Drive ne sont jamais supprimés ici.
       * @returns {{ok:boolean, error?:string, detachedMembers?:number, counts?:object}}
       */
      replaceCatalog: (rawCatalog) => {
        let catalog;
        try {
          const src = rawCatalog?.catalog || rawCatalog;
          if (!src || typeof src !== 'object' || !src.roles || !src.poles || !src.levels) {
            return fail('Fichier invalide : un catalogue doit contenir « poles », « levels » et « roles ».');
          }
          catalog = normalizeCatalog(src);
        } catch (e) {
          return fail(`Catalogue illisible : ${e.message}`);
        }
        const s = get();
        s._pushHistory();
        const { members, changed } = detachOrphanMembers(s.members, catalog.roles, s.roles);
        set({ poles: catalog.poles, levels: catalog.levels, roles: catalog.roles, members });
        return ok({
          detachedMembers: changed,
          counts: {
            poles: Object.keys(catalog.poles).length,
            levels: Object.keys(catalog.levels).length,
            roles: Object.keys(catalog.roles).length,
          },
        });
      },

      resetCatalog: () => get().replaceCatalog(createDefaultCatalog()),

      // ========== DRIVE ==========
      folders: DEFAULT_FOLDERS,
      folderTags: DEFAULT_FOLDER_TAGS,
      drivePermissions: {},
      permissionNotes: {},
      rolePresets: DEFAULT_ROLE_PRESETS,

      // ========== HISTORIQUE UNDO/REDO ==========
      _history: { past: [], future: [] },
      _batchDepth: 0,
      _batchSnapshot: null,

      _pushHistory: () => set((s) => {
        if (s._batchDepth > 0) return {};
        return {
          _history: {
            past: [...s._history.past.slice(-(HISTORY_LIMIT - 1)), snapshotOf(s)],
            future: [],
          },
        };
      }),

      beginBatch: () => set((s) => {
        if (s._batchDepth === 0) {
          return { _batchDepth: 1, _batchSnapshot: snapshotOf(s) };
        }
        return { _batchDepth: s._batchDepth + 1 };
      }),

      endBatch: () => set((s) => {
        const newDepth = Math.max(0, s._batchDepth - 1);
        if (newDepth === 0 && s._batchSnapshot) {
          return {
            _batchDepth: 0,
            _history: {
              past: [...s._history.past.slice(-(HISTORY_LIMIT - 1)), s._batchSnapshot],
              future: [],
            },
            _batchSnapshot: null,
          };
        }
        return { _batchDepth: newDepth };
      }),

      runBatch: async (fn) => {
        get().beginBatch();
        try { await fn(); }
        finally { get().endBatch(); }
      },

      undo: () => set((s) => {
        if (s._history.past.length === 0) return {};
        const previous = s._history.past[s._history.past.length - 1];
        return {
          ...restoreOf(previous, s),
          _history: {
            past: s._history.past.slice(0, -1),
            future: [snapshotOf(s), ...s._history.future].slice(0, HISTORY_LIMIT),
          },
        };
      }),

      redo: () => set((s) => {
        if (s._history.future.length === 0) return {};
        const next = s._history.future[0];
        return {
          ...restoreOf(next, s),
          _history: {
            past: [...s._history.past, snapshotOf(s)].slice(-HISTORY_LIMIT),
            future: s._history.future.slice(1),
          },
        };
      }),

      canUndo: () => get()._history.past.length > 0,
      canRedo: () => get()._history.future.length > 0,

      setPermission: (memberId, folderId, level) => {
        get()._pushHistory();
        set((s) => {
          const memberPerms = { ...(s.drivePermissions[memberId] || {}) };
          if (level === 'none') delete memberPerms[folderId];
          else memberPerms[folderId] = level;
          return { drivePermissions: { ...s.drivePermissions, [memberId]: memberPerms } };
        });
      },

      clearMemberPermissions: (memberId) => {
        get()._pushHistory();
        set((s) => {
          const copy = { ...s.drivePermissions };
          delete copy[memberId];
          return { drivePermissions: copy };
        });
      },

      clearFolderPermissions: (folderId) => {
        get()._pushHistory();
        set((s) => {
          const newPerms = {};
          Object.entries(s.drivePermissions).forEach(([mid, perms]) => {
            const { [folderId]: _removed, ...rest } = perms;
            if (Object.keys(rest).length > 0) newPerms[mid] = rest;
          });
          return { drivePermissions: newPerms };
        });
      },

      setPermissionNote: (memberId, folderId, note) => {
        get()._pushHistory();
        set((s) => {
          const memberNotes = { ...(s.permissionNotes[memberId] || {}) };
          if (!note || !note.trim()) delete memberNotes[folderId];
          else memberNotes[folderId] = note;
          return { permissionNotes: { ...s.permissionNotes, [memberId]: memberNotes } };
        });
      },

      // ========== PRESETS ==========
      // Les presets sont indexés par id de rôle (v11). Des clés « hors
      // catalogue » peuvent subsister (anciens libellés) : elles sont
      // conservées et signalées dans l'interface.
      setRolePreset: (roleKey, preset) => {
        get()._pushHistory();
        set((s) => ({ rolePresets: { ...s.rolePresets, [roleKey]: preset } }));
      },

      deleteRolePreset: (roleKey) => {
        get()._pushHistory();
        set((s) => {
          const copy = { ...s.rolePresets };
          delete copy[roleKey];
          return { rolePresets: copy };
        });
      },

      renameRolePreset: (oldKey, newKey) => {
        if (!newKey || oldKey === newKey || !String(newKey).trim()) return;
        get()._pushHistory();
        set((s) => {
          const copy = { ...s.rolePresets };
          copy[newKey] = copy[oldKey];
          delete copy[oldKey];
          return { rolePresets: copy };
        });
      },

      applyRolePresetToMember: (memberId, roleKey) => {
        const preset = get().rolePresets[roleKey];
        if (!preset) return;
        get()._pushHistory();
        set((s) => ({
          drivePermissions: { ...s.drivePermissions, [memberId]: { ...preset } },
        }));
      },

      // ========== CRUD DOSSIERS ==========
      addFolder: (folder) => {
        get()._pushHistory();
        set((s) => {
          const id = 'f' + crypto.randomUUID().slice(0, 8);
          let code = folder.code;
          if (!code && folder.parent) {
            const parent = s.folders.find(f => f.id === folder.parent);
            if (parent) {
              const siblings = s.folders.filter(f => f.parent === folder.parent);
              code = `${parent.code}.${siblings.length + 1}`;
            }
          }
          if (!code) {
            const roots = s.folders.filter(f => !f.parent);
            code = String(roots.length).padStart(2, '0');
          }
          return {
            folders: [...s.folders, {
              id, code,
              name: folder.name || 'Nouveau dossier',
              parent: folder.parent ?? null,
              color: folder.color || 'zinc',
              tags: folder.tags || [],
            }],
          };
        });
      },

      updateFolder: (id, updates) => {
        const s = get();
        // Empêche les cycles : un dossier ne peut pas devenir enfant de lui-même
        // ni d'un de ses descendants.
        if (updates && 'parent' in updates && updates.parent) {
          let p = updates.parent;
          let guard = 0;
          while (p && guard++ < 1000) {
            if (p === id) return false;
            p = s.folders.find(f => f.id === p)?.parent || null;
          }
        }
        s._pushHistory();
        set((st) => ({ folders: st.folders.map(f => f.id === id ? { ...f, ...updates, id } : f) }));
        return true;
      },

      deleteFolder: (id) => {
        get()._pushHistory();
        set((s) => {
          const toDelete = new Set([id]);
          let changed = true;
          while (changed) {
            changed = false;
            s.folders.forEach(f => {
              if (f.parent && toDelete.has(f.parent) && !toDelete.has(f.id)) {
                toDelete.add(f.id);
                changed = true;
              }
            });
          }

          const newFolders = s.folders.filter(f => !toDelete.has(f.id));

          const newPerms = {};
          Object.entries(s.drivePermissions).forEach(([mid, perms]) => {
            const filtered = Object.fromEntries(
              Object.entries(perms).filter(([fid]) => !toDelete.has(fid))
            );
            if (Object.keys(filtered).length > 0) newPerms[mid] = filtered;
          });

          // Nettoie aussi les notes orphelines
          const newNotes = {};
          Object.entries(s.permissionNotes || {}).forEach(([mid, notes]) => {
            const filtered = Object.fromEntries(
              Object.entries(notes).filter(([fid]) => !toDelete.has(fid))
            );
            if (Object.keys(filtered).length > 0) newNotes[mid] = filtered;
          });

          return {
            folders: newFolders,
            drivePermissions: newPerms,
            permissionNotes: newNotes,
          };
        });
      },

      moveFolderUp: (id) => get()._moveFolder(id, -1),
      moveFolderDown: (id) => get()._moveFolder(id, +1),

      _moveFolder: (id, dir) => {
        const s = get();
        const folder = s.folders.find(f => f.id === id);
        if (!folder) return;
        const siblings = s.folders.filter(f => f.parent === folder.parent);
        const idx = siblings.findIndex(f => f.id === id);
        const other = siblings[idx + dir];
        if (idx === -1 || !other) return;
        s._pushHistory();
        set((st) => {
          const newFolders = [...st.folders];
          const i1 = newFolders.findIndex(f => f.id === id);
          const i2 = newFolders.findIndex(f => f.id === other.id);
          [newFolders[i1], newFolders[i2]] = [newFolders[i2], newFolders[i1]];
          return { folders: newFolders };
        });
      },

      // ========== TAGS ==========
      addFolderTag: (tag) => set((s) => ({
        folderTags: s.folderTags.find(t => t.id === tag.id) ? s.folderTags : [...s.folderTags, tag],
      })),

      deleteFolderTag: (tagId) => {
        get()._pushHistory();
        set((s) => ({
          folderTags: s.folderTags.filter(t => t.id !== tagId),
          folders: s.folders.map(f => ({ ...f, tags: (f.tags || []).filter(t => t !== tagId) })),
        }));
      },

      // ========== COFFRE-FORT CHIFFRÉ ==========
      vaultSalt: null,
      vaultVerifier: null,
      vaultEntriesBlob: null,
      _vaultKey: null,
      vaultEntries: [],

      _legacyMasterHash: null,
      _legacyVaultEntries: null,

      _vaultPersist: async (entries, key) => {
        const blob = await encryptEntries(key, entries);
        // Coffre verrouillé pendant le chiffrement : on enregistre le blob
        // sans remettre les entrées déchiffrées en mémoire.
        if (get()._vaultKey !== key) { set({ vaultEntriesBlob: blob }); return; }
        set({ vaultEntriesBlob: blob, vaultEntries: entries });
      },

      /**
       * Sérialise les écritures du coffre : chaque opération lit l'état
       * APRÈS la précédente (évite qu'un ajout et une suppression simultanés
       * ne s'écrasent).
       */
      _vaultQueue: (op) => {
        const run = vaultWriteQueue.then(op, op);
        vaultWriteQueue = run.catch(() => {});
        return run;
      },

      vaultIsConfigured: () => {
        const s = get();
        return !!(s.vaultSalt && s.vaultVerifier && s.vaultEntriesBlob);
      },

      vaultIsUnlocked: () => !!get()._vaultKey,

      vaultNeedsMigration: () => {
        const s = get();
        return Array.isArray(s._legacyVaultEntries) && s._legacyVaultEntries.length > 0;
      },

      vaultSetup: async (password) => {
        const { salt, verifier, entriesBlob, key } = await setupVault(password);
        set({
          vaultSalt: salt,
          vaultVerifier: verifier,
          vaultEntriesBlob: entriesBlob,
          _vaultKey: key,
          vaultEntries: [],
        });
      },

      vaultMigrateFromLegacy: async (password, oldEntries) => {
        const { salt, verifier, key } = await setupVault(password);
        const entriesBlob = await encryptEntries(key, oldEntries || []);
        set({
          vaultSalt: salt,
          vaultVerifier: verifier,
          vaultEntriesBlob: entriesBlob,
          _vaultKey: key,
          vaultEntries: oldEntries || [],
          _legacyMasterHash: null,
          _legacyVaultEntries: null,
          masterHash: null,
        });
      },

      vaultUnlock: async (password) => {
        const s = get();
        if (!s.vaultSalt || !s.vaultVerifier || !s.vaultEntriesBlob) {
          throw new Error('Aucun coffre configuré.');
        }
        const { key, entries } = await unlockVault(
          password, s.vaultSalt, s.vaultVerifier, s.vaultEntriesBlob
        );
        set({ _vaultKey: key, vaultEntries: entries });
      },

      vaultLock: () => set({ _vaultKey: null, vaultEntries: [] }),

      addVaultEntry: (entry) => get()._vaultQueue(async () => {
        const s = get();
        if (!s._vaultKey) throw new Error('Coffre verrouillé.');
        const newEntry = { ...entry, id: crypto.randomUUID(), createdAt: Date.now() };
        const nextEntries = [...s.vaultEntries, newEntry];
        await s._vaultPersist(nextEntries, s._vaultKey);
        return newEntry;
      }),

      updateVaultEntry: (id, updates) => get()._vaultQueue(async () => {
        const s = get();
        if (!s._vaultKey) throw new Error('Coffre verrouillé.');
        const nextEntries = s.vaultEntries.map(e => e.id === id ? { ...e, ...updates, id, updatedAt: Date.now() } : e);
        await s._vaultPersist(nextEntries, s._vaultKey);
      }),

      deleteVaultEntry: (id) => get()._vaultQueue(async () => {
        const s = get();
        if (!s._vaultKey) throw new Error('Coffre verrouillé.');
        const nextEntries = s.vaultEntries.filter(e => e.id !== id);
        await s._vaultPersist(nextEntries, s._vaultKey);
      }),

      resetVault: () => {
        set({
          vaultSalt: null,
          vaultVerifier: null,
          vaultEntriesBlob: null,
          _vaultKey: null,
          vaultEntries: [],
          masterHash: null,
          _legacyMasterHash: null,
          _legacyVaultEntries: null,
        });
      },

      // ========== BACKUP ==========
      // Le backup ne contient JAMAIS de secret en clair : le coffre n'y figure
      // que sous forme chiffrée (sel + vérificateur + blob AES-GCM).
      exportAllData: () => {
        const s = get();
        return {
          app: 'bde-manager',
          version: STORE_VERSION,
          exportedAt: new Date().toISOString(),
          data: {
            columns: s.columns,
            members: s.members,
            availableBadges: s.availableBadges,
            availableRoles: s.availableRoles,
            theme: s.theme,
            poles: s.poles,
            levels: s.levels,
            roles: s.roles,
            folders: s.folders,
            folderTags: s.folderTags,
            drivePermissions: s.drivePermissions,
            permissionNotes: s.permissionNotes,
            rolePresets: s.rolePresets,
            vaultSalt: s.vaultSalt,
            vaultVerifier: s.vaultVerifier,
            vaultEntriesBlob: s.vaultEntriesBlob,
          },
        };
      },

      /**
       * Restaure un backup (toutes versions ≥ 1). Le contenu est validé puis
       * migré vers le format courant. L'opération est annulable (undo), sauf
       * pour le coffre (verrouillé après import).
       */
      importAllData: (payload) => {
        if (!payload || typeof payload !== 'object' || !payload.data || typeof payload.data !== 'object') {
          throw new Error('Format invalide : ce fichier n\'est pas un backup BDE Manager.');
        }
        const raw = payload.data;
        const arrayOr = (v, fb) => (Array.isArray(v) ? v : fb);
        const objOr = (v, fb) => (v && typeof v === 'object' && !Array.isArray(v) ? v : fb);
        if (raw.members !== undefined && !Array.isArray(raw.members)) throw new Error('Backup corrompu : « members » doit être une liste.');
        if (raw.columns !== undefined && !Array.isArray(raw.columns)) throw new Error('Backup corrompu : « columns » doit être une liste.');

        const fromVersion = Number(payload.version) || 1;
        // Les données importées passent par la même migration que le stockage local.
        const d = fromVersion < STORE_VERSION
          ? migrateMainStore({ ...raw, rolePresets: raw.rolePresets ?? DEFAULT_ROLE_PRESETS }, fromVersion)
          : raw;
        const catalog = d.roles && d.poles && d.levels ? normalizeCatalog(d) : createDefaultCatalog();
        const members = arrayOr(d.members, get().members)
          .filter(m => m && typeof m === 'object')
          .map(m => ({ notes: '', ...m, id: m.id || crypto.randomUUID(), badges: Array.isArray(m.badges) ? m.badges : [] }))
          .map(m => migrateMemberRole(m, catalog));

        get()._pushHistory();
        set({
          columns: arrayOr(d.columns, get().columns),
          members,
          availableBadges: arrayOr(d.availableBadges, get().availableBadges),
          availableRoles: arrayOr(d.availableRoles, get().availableRoles),
          theme: d.theme === 'light' ? 'light' : 'dark',
          poles: catalog.poles,
          levels: catalog.levels,
          roles: catalog.roles,
          folders: arrayOr(d.folders, DEFAULT_FOLDERS),
          folderTags: arrayOr(d.folderTags, DEFAULT_FOLDER_TAGS),
          drivePermissions: objOr(d.drivePermissions, {}),
          permissionNotes: objOr(d.permissionNotes, {}),
          rolePresets: migratePresets(objOr(d.rolePresets, DEFAULT_ROLE_PRESETS), catalog),
          vaultSalt: d.vaultSalt ?? null,
          vaultVerifier: d.vaultVerifier ?? null,
          vaultEntriesBlob: d.vaultEntriesBlob ?? null,
          // Anciennes entrées en clair : conservées seulement si le backup ne
          // contient pas de coffre chiffré (sinon elles resteraient en clair
          // sans jamais pouvoir être migrées).
          _legacyMasterHash: d.vaultEntriesBlob ? null : (d._legacyMasterHash ?? null),
          _legacyVaultEntries: d.vaultEntriesBlob ? null : (d._legacyVaultEntries ?? null),
          _vaultKey: null,
          vaultEntries: [],
        });
        return { members: members.length, roles: Object.keys(catalog.roles).length };
      },
    }),
    {
      name: 'bde-storage',
      version: STORE_VERSION,
      storage: createJSONStorage(() => mainStorage.storage),
      partialize: (state) => {
        const {
          _history,
          _vaultKey,
          vaultEntries,
          _batchDepth,
          _batchSnapshot,
          ...rest
        } = state;
        // Les fonctions ne sont pas sérialisées par JSON.stringify.
        return rest;
      },
      migrate: (persistedState, version) => {
        const storage = typeof localStorage !== 'undefined' ? localStorage : undefined;
        return migrateMainStore(persistedState, version, { storage });
      },
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted || {}) };
        // Filet de sécurité : un catalogue persisté incomplet est réparé.
        const catalog = normalizeCatalog({
          poles: merged.poles || current.poles,
          levels: merged.levels || current.levels,
          roles: merged.roles || current.roles,
        });
        return { ...merged, ...catalog };
      },
    }
  )
);

// ------------------------------------------------------------
// Synchronisation du catalogue actif (lu par le moteur de rôles)
// ------------------------------------------------------------
const syncCatalog = (s) => setActiveCatalog({ poles: s.poles, levels: s.levels, roles: s.roles });
syncCatalog(useStore.getState());
useStore.subscribe((s, prev) => {
  if (s.poles !== prev.poles || s.levels !== prev.levels || s.roles !== prev.roles) syncCatalog(s);
});

// ------------------------------------------------------------
// Synchronisation entre onglets du même navigateur
// ------------------------------------------------------------
// Un autre onglet a modifié les données : on recharge l'état persisté sans le
// réécrire (voir core/crossTabSync.js). L'historique local est vidé (il ne
// correspond plus) et le coffre est reverrouillé si son contenu a changé.
onExternalStorageChange('bde-storage', () => {
  const before = useStore.getState();
  mainStorage.runSilently(() => {
    useStore.persist.rehydrate();
    const after = useStore.getState();
    const patch = { _history: { past: [], future: [] }, _batchDepth: 0, _batchSnapshot: null };
    if (after.vaultEntriesBlob !== before.vaultEntriesBlob && before._vaultKey) {
      patch._vaultKey = null;
      patch.vaultEntries = [];
    }
    useStore.setState(patch);
  });
});

/**
 * Vue « catalogue » de l'état, pour les fonctions pures de core/catalog.js.
 * ⚠️ Crée un nouvel objet : à utiliser avec getState(), JAMAIS comme
 * sélecteur React (boucle de rendu avec Zustand v5) — voir core/useCatalog.js.
 */
export const selectCatalog = (s) => ({ poles: s.poles, levels: s.levels, roles: s.roles });

export async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================
// HELPERS
// ============================================================
export const getRootFolder = (folder, folders) => {
  let f = folder;
  let safety = 0;
  while (f && f.parent && safety < 10) {
    const parent = folders.find(x => x.id === f.parent);
    if (!parent) break;
    f = parent;
    safety++;
  }
  return f;
};

export const getFolderTag = (tagId, folderTags) => folderTags.find(t => t.id === tagId);
export const getFolderColor = (colorId) => FOLDER_COLORS.find(c => c.id === colorId) || FOLDER_COLORS[FOLDER_COLORS.length - 1];

export const getMemberConfigStatus = (member, drivePermissions, rolePresets, folders) => {
  // Membre au rôle libre non migré : même résolution que « appliquer le preset ».
  const preset = rolePresets[member.mainRole]
    ?? rolePresets[resolveRoleId(member.mainRole || member.legacyMainRole || '')];
  const userPerms = drivePermissions[member.id] || {};

  if (!preset) {
    const count = Object.values(userPerms).filter(v => v !== 'none').length;
    return count === 0 ? 'empty' : 'partial';
  }

  let expected = 0;
  let matches = 0;
  let extra = 0;

  folders.forEach(f => {
    const expectedLevel = preset[f.id] || 'none';
    const actualLevel = userPerms[f.id] || 'none';
    if (expectedLevel !== 'none') {
      expected++;
      if (actualLevel === expectedLevel) matches++;
    } else {
      if (actualLevel !== 'none') extra++;
    }
  });

  if (extra > 0) return 'mismatch';
  if (expected === 0) {
    const count = Object.values(userPerms).filter(v => v !== 'none').length;
    return count === 0 ? 'empty' : 'partial';
  }
  if (matches === expected) return 'complete';
  if (matches === 0) return 'empty';
  return 'partial';
};

export const CONFIG_STATUS_META = {
  complete: { label: 'Conforme',      color: 'emerald', icon: '✓' },
  partial:  { label: 'Partiel',       color: 'amber',   icon: '◐' },
  empty:    { label: 'Non configuré', color: 'zinc',    icon: '○' },
  mismatch: { label: 'Hors preset',   color: 'red',     icon: '⚠' },
};