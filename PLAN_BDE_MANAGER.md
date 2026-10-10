Tu vas prendre en charge mon projet BDE Manager de A à Z. Tu es sur Claude MAX (sub-agents parallèles, planification, exécution autonome).

═══════════════════════════════════════════════════════════
CONTEXTE
═══════════════════════════════════════════════════════════

App React 19 + Vite + Tailwind + Zustand, 100% client-side. Modules : Kanban membres, moteur de rôles (solveur hongrois + Monte-Carlo), matrice Drive, coffre-fort chiffré (AES-GCM + PBKDF2), éditeur visuel no-code, backup/restore JSON.

Objectif final : app déployée sur Vercel, installable en PWA, zéro erreur critique, ET **gestion 100% no-code des rôles** (CRUD complet).

═══════════════════════════════════════════════════════════
PHASE 0 — RECONNAISSANCE (4 agents Explore en parallèle)
═══════════════════════════════════════════════════════════

AGENT A — Architecture
  → Explore `src/`, `src/core/`, `src/roleEngine/`
  → Cartographie + incohérences (fichiers orphelins, imports cassés)

AGENT B — Qualité code
  → `npx eslint src/ --ext .js,.jsx` + `npm run build`
  → Erreurs critiques vs cosmétiques

AGENT C — Tests
  → `node --test src/roleEngine/tests/` → OK/KO précis

AGENT D — Config production
  → Vérifie `vite.config.js`, `vercel.json`, `.gitignore`, `index.html`, `package.json`, `public/`

Synthétise en 5 lignes + annonce ton plan avant de continuer.

═══════════════════════════════════════════════════════════
PHASE 1 — CORRECTION BUGS (2 agents en parallèle)
═══════════════════════════════════════════════════════════

AGENT E — Bugs critiques
  → `src/roleEngine/tests/engine.test.js` : `await` hors async
  → `src/roleEngine/normalizer.js` : regex `no-misleading-character-class`
  → Vérifie `fullstack.test.js` et `part2.test.js`

AGENT F — Fast Refresh + imports morts
  → Sépare store Zustand + `toast` de `Toast.jsx` → `src/components/ui/toastStore.js`
  → Retire tous les `import React` inutiles + imports/variables morts
  → Lance `npx eslint src/ --fix`

VALIDATION : `npm run build` doit passer. Affiche erreurs avant/après.

═══════════════════════════════════════════════════════════
PHASE 2 — PRÉPARATION PRODUCTION + PWA
═══════════════════════════════════════════════════════════

Crée/remplace :

📄 `vite.config.js` :
```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  base: '/',
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'dnd-vendor': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
          'pdf-vendor': ['jspdf', 'jspdf-autotable'],
          'mermaid-vendor': ['mermaid'],
        },
      },
    },
  },
});
📄 vercel.json :

json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
      ]
    },
    {
      "source": "/assets/(.*)",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
    }
  ]
}
📄 public/manifest.webmanifest :

json
{
  "name": "BDE Manager",
  "short_name": "BDE",
  "description": "Gestion complète du Bureau des Étudiants",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0a10",
  "theme_color": "#4f81f5",
  "orientation": "portrait-primary",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
📄 public/favicon.svg :

svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#4f81f5"/>
  <text x="16" y="22" font-family="system-ui, sans-serif" font-size="14" font-weight="900" fill="#fff" text-anchor="middle">B</text>
</svg>
📄 public/icon-192.png + public/icon-512.png → génère depuis le SVG

📄 .gitignore complet + package.json (engines.node >= 18, script build/preview) + install vite-plugin-pwa

📄 index.html → title + metas PWA complètes (manifest, apple-touch-icon, theme-color, description, viewport, apple-mobile-web-app-capable)

VALIDATION : npm run build sans warning.

═══════════════════════════════════════════════════════════
PHASE 2.5 — GESTION CRUD COMPLÈTE DES RÔLES (NO-CODE) ⭐
═══════════════════════════════════════════════════════════

Objectif : transformer le catalogue de rôles en système entièrement éditable depuis l'UI, sans jamais toucher au code. Je veux pouvoir créer, modifier, réorganiser, supprimer n'importe quel rôle, pôle, niveau ou capacité.

━━━ ÉTAPE 1 — Refacto du modèle de rôles ━━━

AGENT G — Modèle dynamique

Transforme src/core/roles.js pour que les rôles soient stockés dans le store Zustand (useStore) et non plus en dur dans le fichier.

Crée dans src/store.js ces nouvelles entrées persistées :

js
// Catalogue dynamique des pôles
poles: { /* id -> { id, label, short, color, emoji, order, custom } */ },
// Catalogue dynamique des niveaux hiérarchiques
levels: { /* id -> { id, label, order, requirement, custom } */ },
// Catalogue dynamique des rôles
roles: { /* id -> { id, label, level, pole, leadership, essential, capacity, custom } */ },
Initialise ces 3 objets avec les valeurs actuelles (extraits de src/core/roles.js — pôles, niveaux, rôles).

Réécris src/core/roles.js pour qu'il devienne un adaptateur qui lit depuis le store :

js
import { useStore } from '../store.js';

export const getRoles       = () => Object.values(useStore.getState().roles);
export const getPoles       = () => Object.values(useStore.getState().poles);
export const getLevels      = () => Object.values(useStore.getState().levels);
export const getRoleById    = (id) => useStore.getState().roles[id] || null;
export const getPole        = (id) => useStore.getState().poles[id] || null;
export const getLevel       = (id) => useStore.getState().levels[id] || null;
export const getRolesByPole = (poleId) => getRoles().filter(r => r.pole === poleId);
export const getRolesByLevel = (levelId) => getRoles().filter(r => r.level === levelId);
export const getRoleLabel   = (id) => getRoleById(id)?.label || id;
export const getPoleLabel   = (id) => getPole(id)?.label || id;
export const getLevelLabel  = (id) => getLevel(id)?.label || id;
export const isValidRoleId  = (id) => !!useStore.getState().roles[id];
export const DEFAULT_CAPACITIES = null; // déprécié : la capacité vit sur chaque rôle
Mets à jour tous les imports dans src/roleEngine/, src/components/, src/core/bridge.js, src/core/migrations.js pour utiliser les nouvelles fonctions (les composants React doivent utiliser un hook useRoles() pour rester réactifs, le moteur peut lire via getState()).

Crée un hook pratique src/core/useRoles.js :

js
import { useStore } from '../store.js';
export function useRoles() {
  return useStore(s => ({
    roles: Object.values(s.roles),
    poles: Object.values(s.poles),
    levels: Object.values(s.levels),
  }));
}
━━━ ÉTAPE 2 — Actions CRUD dans le store ━━━

Ajoute dans src/store.js ces actions (à côté du bloc DRIVE) :

js
// ========== CRUD RÔLES ==========
addRole: (role) => set((s) => {
  const id = role.id || 'role_' + crypto.randomUUID().slice(0, 8);
  return {
    roles: {
      ...s.roles,
      [id]: {
        id,
        label: role.label || 'Nouveau rôle',
        level: role.level || 'membre',
        pole: role.pole || 'transversal',
        leadership: role.leadership ?? false,
        essential: role.essential ?? false,
        capacity: role.capacity ?? 1,
        custom: true,
        order: Object.keys(s.roles).length,
      },
    },
  };
}),

updateRole: (roleId, updates) => set((s) => ({
  roles: s.roles[roleId]
    ? { ...s.roles, [roleId]: { ...s.roles[roleId], ...updates } }
    : s.roles,
})),

deleteRole: (roleId) => set((s) => {
  const next = { ...s.roles };
  delete next[roleId];
  // Retire le rôle des presets liés
  const nextPresets = { ...s.rolePresets };
  delete nextPresets[roleId];
  return { roles: next, rolePresets: nextPresets };
}),

reorderRole: (roleId, newOrder) => set((s) => ({
  roles: s.roles[roleId]
    ? { ...s.roles, [roleId]: { ...s.roles[roleId], order: newOrder } }
    : s.roles,
})),

duplicateRole: (roleId) => set((s) => {
  const original = s.roles[roleId];
  if (!original) return {};
  const newId = 'role_' + crypto.randomUUID().slice(0, 8);
  return {
    roles: {
      ...s.roles,
      [newId]: { ...original, id: newId, label: `${original.label} (copie)`, custom: true },
    },
  };
}),

setRoleCapacity: (roleId, capacity) => set((s) => ({
  roles: s.roles[roleId]
    ? { ...s.roles, [roleId]: { ...s.roles[roleId], capacity: Math.max(0, capacity) } }
    : s.roles,
})),

// ========== CRUD PÔLES ==========
addPole: (pole) => set((s) => {
  const id = pole.id || 'pole_' + crypto.randomUUID().slice(0, 8);
  return {
    poles: {
      ...s.poles,
      [id]: {
        id,
        label: pole.label || 'Nouveau pôle',
        short: pole.short || 'Nouv.',
        color: pole.color || 'zinc',
        emoji: pole.emoji || '📌',
        order: pole.order ?? Object.keys(s.poles).length,
        custom: true,
      },
    },
  };
}),

updatePole: (poleId, updates) => set((s) => ({
  poles: s.poles[poleId]
    ? { ...s.poles, [poleId]: { ...s.poles[poleId], ...updates } }
    : s.poles,
})),

deletePole: (poleId) => set((s) => {
  // Refuse si des rôles y sont rattachés
  const rolesInPole = Object.values(s.roles).filter(r => r.pole === poleId);
  if (rolesInPole.length > 0) {
    throw new Error(`Impossible : ${rolesInPole.length} rôle(s) rattaché(s) à ce pôle`);
  }
  const next = { ...s.poles };
  delete next[poleId];
  return { poles: next };
}),

// ========== CRUD NIVEAUX ==========
addLevel: (level) => set((s) => {
  const id = level.id || 'level_' + crypto.randomUUID().slice(0, 8);
  return {
    levels: {
      ...s.levels,
      [id]: {
        id,
        label: level.label || 'Nouveau niveau',
        order: level.order ?? Object.keys(s.levels).length,
        requirement: level.requirement ?? 0.5,
        custom: true,
      },
    },
  };
}),

updateLevel: (levelId, updates) => set((s) => ({
  levels: s.levels[levelId]
    ? { ...s.levels, [levelId]: { ...s.levels[levelId], ...updates } }
    : s.levels,
})),

deleteLevel: (levelId) => set((s) => {
  const rolesInLevel = Object.values(s.roles).filter(r => r.level === levelId);
  if (rolesInLevel.length > 0) {
    throw new Error(`Impossible : ${rolesInLevel.length} rôle(s) avec ce niveau`);
  }
  const next = { ...s.levels };
  delete next[levelId];
  return { levels: next };
}),
━━━ ÉTAPE 3 — UI de gestion complète ━━━

Crée src/components/roles/RolesManager.jsx — un panneau à 3 colonnes (drag & drop natif HTML5) :

Colonne 1 — PÔLES

Liste des pôles avec emoji, label, couleur, nombre de rôles rattachés

Bouton "+ Nouveau pôle" → modale avec : label, short, emoji, couleur (color picker), order

Sur chaque pôle : icônes ✏️ Modifier / 🗑 Supprimer / ↑↓ Réordonner

Suppression bloquée si rôles rattachés

Colonne 2 — RÔLES

Filtré par pôle sélectionné (ou tous si clic sur "Tous les pôles")

Chaque rôle affiche : label, niveau (badge), capacité, leadership ⭐, essential 🔒

Bouton "+ Nouveau rôle" → modale avec : label, pôle (dropdown), niveau (dropdown), capacité (number), leadership (checkbox), essential (checkbox)

Actions par rôle : ✏️ Modifier / 🗑 Supprimer / 📋 Dupliquer / ↑↓ Réordonner / Capacity +/- inline

Colonne 3 — DÉTAIL DU RÔLE SÉLECTIONNÉ

Édition en place : label, pôle, niveau, capacité, badges

Aperçu des permissions Drive associées (si preset existe)

Aperçu du nombre de candidats qui ont ce rôle en 1er/2e/3e choix (depuis useRolesStore.candidates)

Bouton "Appliquer le preset" / "Voir la fiche"

Barre d'action globale :

Bouton "Exporter le catalogue (JSON)"

Bouton "Importer un catalogue (JSON)"

Bouton "Réinitialiser au catalogue par défaut"

Compteur : X pôles · Y rôles · Z niveaux

Modale de confirmation pour toute suppression : "Ce rôle est utilisé par N membres et N permissions. Es-tu sûr ?"

━━━ ÉTAPE 4 — Intégration dans l'onglet Organisation ━━━

Ajoute un sous-onglet "Gestion des rôles" dans src/components/roles/RolesTab.jsx (icône Settings2 ou FolderCog).

Dans src/components/OrganisationTab.jsx, garde la navigation existante.

Le composant RolesManager doit être accessible depuis le header de l'app pour être trouvé rapidement (ajoute une icône ⚙️ en haut à droite qui ouvre directement le panneau en plein écran).

━━━ ÉTAPE 5 — Cohérence avec le reste de l'app ━━━

Le moteur de rôles (src/roleEngine/) doit lire dynamiquement les rôles via getRoles() (jamais de constantes en dur).

L'organigramme live doit se mettre à jour dès qu'un rôle change (grâce à Zustand subscribe).

Le presets Drive (rolePresets) doit supporter la création dynamique : si un rôle est supprimé, son preset l'est aussi (fait dans deleteRole).

Le seed BDE (src/data/bdeSeed.js) doit être migré vers le nouveau format { poles, levels, roles } au premier chargement si l'utilisateur le demande.

━━━ VALIDATION PHASE 2.5 ━━━

npm run build passe sans erreur

Je peux créer un nouveau pôle "🎨 Créatif", lui assigner un nouveau rôle "Responsable Design" de niveau "responsable", capacité 2 → tout fonctionne

Je peux renommer un rôle existant sans casser les permissions existantes

Je peux supprimer un rôle sans rôle rattaché → OK

Je peux tenter de supprimer un pôle avec rôles → erreur claire

L'organigramme reflète immédiatement les changements

═══════════════════════════════════════════════════════════
PHASE 3 — DÉPLOIEMENT VERCEL
═══════════════════════════════════════════════════════════

git init (si pas déjà) + git add . + git commit -m "feat: full role management + PWA ready"

npm install -g vercel

vercel login → ME PRÉVENIR pour authentification navigateur

Après mon OK : vercel --prod
→ Set up? Y | Scope: compte perso | Existing? N | Name: bde-manager | Dir: ./ | Modify? N

Récupère l'URL finale

═══════════════════════════════════════════════════════════
PHASE 4 — VÉRIFICATION + RAPPORT
═══════════════════════════════════════════════════════════

Curl l'URL pour vérifier HTML

Vérifier /manifest.webmanifest

Vérifier service worker PWA

Rapport final en tableau :

Élément	Statut	Détail
Build	✅/❌	Taille bundle, chunks
ESLint	✅/❌	Erreurs restantes
Tests	✅/❌	X/Y passants
URL production	✅	https://...
PWA installable	✅/❌	
Mobile responsive	✅/❌	
CRUD Rôles	✅/❌	Créer/modifier/supprimer pôles+rôles+niveaux
Catalogue dynamique	✅/❌	Rôles persistés dans Zustand
Aperçu live	✅/❌	Organigramme réactif
Termine par :

3 instructions concrètes pour installer la PWA sur iPhone/Android

La commande Git pour sauvegarder sur GitHub : git remote add origin https://github.com/STIDeveloper/BDE_Manager && git push -u origin main

═══════════════════════════════════════════════════════════
RÈGLES
═══════════════════════════════════════════════════════════

Utilise un MAXIMUM de sub-agents parallèles (Phase 0, 1, et surtout 2.5)

Ne me demande confirmation QUE pour vercel login

Si tu bloques → propose 2 alternatives

Ne casse aucune fonctionnalité existante

Ne supprime aucun fichier sans me prévenir

Vérifie après CHAQUE phase que npm run build passe

Pour la Phase 2.5 : si tu dois trancher un choix d'UX, fais-le et documente-le en commentaire dans le code

C'est parti. Lance la Phase 0 immédiatement.

text

---

## 🎯 Ce que tu obtiendras à la fin

| Fonctionnalité | Statut |
|---|---|
| CRUD pôles | ✅ Créer / Modifier / Supprimer / Réordonner |
| CRUD rôles | ✅ Créer / Modifier / Dupliquer / Supprimer / Réordonner |
| CRUD niveaux | ✅ Créer / Modifier / Supprimer |
| Capacités dynamiques | ✅ + / − par rôle |
| Badges leadership / essential | ✅ Éditables |
| Aperçu live organigramme | ✅ Réactif en temps réel |
| Export / Import catalogue JSON | ✅ Sauvegarde / Restauration |
| Réinitialisation | ✅ Retour au seed |
| Détection d'utilisation | ✅ "Ce rôle est utilisé par N membres" |
| Sauvegarde auto Zustand | ✅ Persistance entre sessions |
| PWA installable | ✅ iPhone / Android |
| Déploiement Vercel | ✅ URL publique gratuite |

---

**Colle le prompt dans Claude Code et laisse-le travailler.** Si un point bloque ou si tu veux encore plus de contrôle (par ex. permissions granulaires par rôle), dis-le et je t'ajouterai une Phase 2.6. 🚀