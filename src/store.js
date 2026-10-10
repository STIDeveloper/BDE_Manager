import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  setupVault,
  unlockVault,
  encryptEntries,
} from './core/crypto.js';

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
      availableRoles: DEFAULT_ROLES,

      addMember: (member) => set((s) => ({ members: [...s.members, { ...member, id: crypto.randomUUID() }] })),
      updateMember: (id, updates) => set((s) => ({ members: s.members.map(m => m.id === id ? { ...m, ...updates } : m) })),
      deleteMember: (id) => set((s) => ({
        members: s.members.filter(m => m.id !== id),
        drivePermissions: Object.fromEntries(Object.entries(s.drivePermissions).filter(([k]) => k !== id)),
        permissionNotes: Object.fromEntries(Object.entries(s.permissionNotes).filter(([k]) => k !== id)),
      })),
      moveMember: (memberId, newColumnId) => set((s) => ({
        members: s.members.map(m => m.id === memberId ? { ...m, columnId: newColumnId } : m)
      })),

      addColumn: (title) => set((s) => ({ columns: [...s.columns, { id: crypto.randomUUID(), title }] })),
      updateColumn: (id, title) => set((s) => ({ columns: s.columns.map(c => c.id === id ? { ...c, title } : c) })),
      deleteColumn: (id) => set((s) => ({
        columns: s.columns.filter(c => c.id !== id),
        members: s.members.filter(m => m.columnId !== id)
      })),

      addBadge: (badge) => set((s) => ({
        availableBadges: s.availableBadges.includes(badge) ? s.availableBadges : [...s.availableBadges, badge]
      })),

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
            past: [...s._history.past.slice(-29), {
              drivePermissions: s.drivePermissions,
              permissionNotes: s.permissionNotes,
            }],
            future: [],
          },
        };
      }),

      beginBatch: () => set((s) => {
        if (s._batchDepth === 0) {
          return {
            _batchDepth: 1,
            _batchSnapshot: {
              drivePermissions: s.drivePermissions,
              permissionNotes: s.permissionNotes,
            },
          };
        }
        return { _batchDepth: s._batchDepth + 1 };
      }),

      endBatch: () => set((s) => {
        const newDepth = Math.max(0, s._batchDepth - 1);
        if (newDepth === 0 && s._batchSnapshot) {
          return {
            _batchDepth: 0,
            _history: {
              past: [...s._history.past.slice(-29), s._batchSnapshot],
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
          drivePermissions: previous.drivePermissions,
          permissionNotes: previous.permissionNotes || {},
          _history: {
            past: s._history.past.slice(0, -1),
            future: [{ drivePermissions: s.drivePermissions, permissionNotes: s.permissionNotes }, ...s._history.future].slice(0, 30),
          },
        };
      }),

      redo: () => set((s) => {
        if (s._history.future.length === 0) return {};
        const next = s._history.future[0];
        return {
          drivePermissions: next.drivePermissions,
          permissionNotes: next.permissionNotes || {},
          _history: {
            past: [...s._history.past, { drivePermissions: s.drivePermissions, permissionNotes: s.permissionNotes }].slice(-30),
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
            const { [folderId]: _, ...rest } = perms;
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
      setRolePreset: (roleName, preset) => set((s) => ({
        rolePresets: { ...s.rolePresets, [roleName]: preset },
      })),

      deleteRolePreset: (roleName) => set((s) => {
        const copy = { ...s.rolePresets };
        delete copy[roleName];
        return { rolePresets: copy };
      }),

      renameRolePreset: (oldName, newName) => set((s) => {
        if (oldName === newName || !newName.trim()) return {};
        const copy = { ...s.rolePresets };
        copy[newName] = copy[oldName];
        delete copy[oldName];
        return { rolePresets: copy };
      }),

      applyRolePresetToMember: (memberId, roleName) => {
        const preset = get().rolePresets[roleName];
        if (!preset) return;
        get()._pushHistory();
        set((s) => ({
          drivePermissions: { ...s.drivePermissions, [memberId]: { ...preset } },
        }));
      },

      // ========== CRUD DOSSIERS ==========
      addFolder: (folder) => set((s) => {
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
      }),

      updateFolder: (id, updates) => set((s) => ({
        folders: s.folders.map(f => f.id === id ? { ...f, ...updates } : f),
      })),

      deleteFolder: (id) => set((s) => {
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

        // ⚠️ FIX #18 : nettoie AUSSI les notes orphelines
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
      }),

      moveFolderUp: (id) => set((s) => {
        const folder = s.folders.find(f => f.id === id);
        if (!folder) return {};
        const siblings = s.folders.filter(f => f.parent === folder.parent);
        const idx = siblings.findIndex(f => f.id === id);
        if (idx <= 0) return {};
        const prev = siblings[idx - 1];
        const newFolders = [...s.folders];
        const i1 = newFolders.findIndex(f => f.id === id);
        const i2 = newFolders.findIndex(f => f.id === prev.id);
        [newFolders[i1], newFolders[i2]] = [newFolders[i2], newFolders[i1]];
        return { folders: newFolders };
      }),

      moveFolderDown: (id) => set((s) => {
        const folder = s.folders.find(f => f.id === id);
        if (!folder) return {};
        const siblings = s.folders.filter(f => f.parent === folder.parent);
        const idx = siblings.findIndex(f => f.id === id);
        if (idx === -1 || idx >= siblings.length - 1) return {};
        const next = siblings[idx + 1];
        const newFolders = [...s.folders];
        const i1 = newFolders.findIndex(f => f.id === id);
        const i2 = newFolders.findIndex(f => f.id === next.id);
        [newFolders[i1], newFolders[i2]] = [newFolders[i2], newFolders[i1]];
        return { folders: newFolders };
      }),

      // ========== TAGS ==========
      addFolderTag: (tag) => set((s) => ({
        folderTags: s.folderTags.find(t => t.id === tag.id) ? s.folderTags : [...s.folderTags, tag],
      })),

      deleteFolderTag: (tagId) => set((s) => ({
        folderTags: s.folderTags.filter(t => t.id !== tagId),
        folders: s.folders.map(f => ({ ...f, tags: (f.tags || []).filter(t => t !== tagId) })),
      })),

      // ========== COFFRE-FORT CHIFFRÉ ==========
      vaultSalt: null,
      vaultVerifier: null,
      vaultEntriesBlob: null,
      _vaultKey: null,
      vaultEntries: [],

      _vaultPersist: async (entries, key) => {
        const blob = await encryptEntries(key, entries);
        set({ vaultEntriesBlob: blob, vaultEntries: entries });
      },

      vaultIsConfigured: () => {
        const s = get();
        return !!(s.vaultSalt && s.vaultVerifier && s.vaultEntriesBlob);
      },

      vaultIsUnlocked: () => !!get()._vaultKey,

      vaultNeedsMigration: () => {
        const s = get();
        return !!(s._legacyMasterHash && Array.isArray(s._legacyVaultEntries) && s._legacyVaultEntries.length > 0);
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

      addVaultEntry: async (entry) => {
        const s = get();
        if (!s._vaultKey) throw new Error('Coffre verrouillé.');
        const newEntry = { ...entry, id: crypto.randomUUID(), createdAt: Date.now() };
        const nextEntries = [...s.vaultEntries, newEntry];
        await s._vaultPersist(nextEntries, s._vaultKey);
        return newEntry;
      },

      updateVaultEntry: async (id, updates) => {
        const s = get();
        if (!s._vaultKey) throw new Error('Coffre verrouillé.');
        const nextEntries = s.vaultEntries.map(e => e.id === id ? { ...e, ...updates } : e);
        await s._vaultPersist(nextEntries, s._vaultKey);
      },

      deleteVaultEntry: async (id) => {
        const s = get();
        if (!s._vaultKey) throw new Error('Coffre verrouillé.');
        const nextEntries = s.vaultEntries.filter(e => e.id !== id);
        await s._vaultPersist(nextEntries, s._vaultKey);
      },

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
      exportAllData: () => {
        const s = get();
        return {
          version: 10,
          exportedAt: new Date().toISOString(),
          data: {
            columns: s.columns,
            members: s.members,
            availableBadges: s.availableBadges,
            availableRoles: s.availableRoles,
            theme: s.theme,
            folders: s.folders,
            folderTags: s.folderTags,
            drivePermissions: s.drivePermissions,
            permissionNotes: s.permissionNotes,
            rolePresets: s.rolePresets,
            // Coffre chiffré uniquement
            vaultSalt: s.vaultSalt,
            vaultVerifier: s.vaultVerifier,
            vaultEntriesBlob: s.vaultEntriesBlob,
          },
        };
      },

      importAllData: (payload) => {
        if (!payload || !payload.data) throw new Error('Format invalide');
        const d = payload.data;
        set({
          columns: d.columns ?? get().columns,
          members: d.members ?? get().members,
          availableBadges: d.availableBadges ?? get().availableBadges,
          availableRoles: d.availableRoles ?? get().availableRoles,
          theme: d.theme ?? 'dark',
          folders: d.folders ?? DEFAULT_FOLDERS,
          folderTags: d.folderTags ?? DEFAULT_FOLDER_TAGS,
          drivePermissions: d.drivePermissions ?? {},
          permissionNotes: d.permissionNotes ?? {},
          rolePresets: d.rolePresets ?? DEFAULT_ROLE_PRESETS,
          vaultSalt: d.vaultSalt ?? null,
          vaultVerifier: d.vaultVerifier ?? null,
          vaultEntriesBlob: d.vaultEntriesBlob ?? null,
          _vaultKey: null,
          vaultEntries: [],
          _history: { past: [], future: [] },
        });
      },
    }),
    {
      name: 'bde-storage',
      version: 10,
      partialize: (state) => {
        const {
          _history,
          _vaultKey,
          vaultEntries,
          _batchDepth,
          _batchSnapshot,
          ...rest
        } = state;
        return rest;
      },
      migrate: (persistedState, version) => {
        if (version < 10) {
          const s = persistedState || {};
          const hasLegacyVault =
            s.masterHash &&
            Array.isArray(s.vaultEntries) &&
            s.vaultEntries.length > 0;

          return {
            ...s,
            _legacyMasterHash: hasLegacyVault ? s.masterHash : null,
            _legacyVaultEntries: hasLegacyVault ? s.vaultEntries : null,
            vaultSalt: null,
            vaultVerifier: null,
            vaultEntriesBlob: null,
            masterHash: null,
          };
        }
        return persistedState;
      },
    }
  )
);

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
  const preset = rolePresets[member.mainRole];
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