# Brief commun aux développeurs de modules (BDE Manager)

Projet : `E:\BDE doc off\AppBDE_POLE\bde-manager` — React 19, Vite 8, Zustand 5, Tailwind 3, lucide-react, PWA.
Shell : Bash avec `cd "/e/BDE doc off/AppBDE_POLE/bde-manager"` (Windows, Node 24).
Langue : interface en français, tutoiement (comme le reste de l'app). Commentaires en français.

## Règles impératives
- **Ne crée AUCUN nouveau fichier de test** (règle du propriétaire). Ne supprime pas les tests existants ; `npm test` doit rester vert.
- Vérifie : `npx eslint <tes fichiers>` (0 erreur, react-hooks v7 strict), `npm run build`, et un **vrai parcours dans le navigateur** (outils `mcp__Claude_Browser__*`) sur TON serveur de dev (port indiqué dans ta mission : `npx vite --port <port> --strictPort` en arrière-plan). Les captures d'écran peuvent échouer dans cet environnement : utilise `get_page_text`, `read_page`, `find`, `javascript_tool`. `requestAnimationFrame` et `ResizeObserver` peuvent ne pas se déclencher dans ce navigateur (pas de rendu graphique) : ne conclus pas à un bug pour cette seule raison.
- À la fin : vide le localStorage/IndexedDB de TON origine de test, arrête UNIQUEMENT ton serveur (retrouve le PID avec `netstat -ano` puis `Stop-Process` sur ce PID), ne touche pas aux autres ports.
- Ne fais **aucune** opération git (ni commit, ni stash, ni checkout). Le responsable intègre.
- Pas de fonctionnalité factice : chaque bouton fait réellement ce qu'il annonce, les données sont persistées.
- Données personnelles : ne journalise jamais de données sensibles dans la console ; exports avec mention « usage interne ».

## Socle à lire avant de coder
- `src/modules/contracts.js` : formes de données de TOUS les modules et liens entre eux (les respecter exactement).
- `src/core/createModuleStore.js` : fabrique de store persisté (sync onglets, sauvegarde, synchro backend) — utilise-la pour tout nouveau store de module (`src/modules/<module>/store.js`, chargé automatiquement par `src/modules/index.js`).
- `src/core/moduleRegistry.js` (tranches synchronisables), `src/core/attachments.js` (fichiers en IndexedDB), `src/core/router.js` (`navigate(section, ...)`, `useRoute()`), `src/core/permissions.js` (`useCan(capability, level)` : masquer/désactiver les actions non autorisées).
- `src/documents/issue.js` : `issueDocuments({ templateId, memberIds, values, format })` pour émettre un document officiel numéroté depuis n'importe quel module. Modèles disponibles : voir `src/documents/templates/*.js` (ids).
- Écran d'un module : `src/modules/<module>/Page.jsx` (export par défaut, sans props) — découvert automatiquement par `App.jsx` (sections : dashboard, calendar, membership, handover, events, finance, team).
- UI partagée : `src/components/Modal.jsx` (dialogue accessible), `src/components/ui/confirmStore.js` (`await confirmDialog({...})`), `src/components/ui/toastStore.js` (`toast.success(titre, détail)`), `src/core/useCatalog.js` (rôles/pôles), store principal `src/store.js` (membres : `useStore(s => s.members)`, organisation, registre des documents).
- Langage visuel : s'inspirer de `src/components/documents/*` (cartes `bg-surface border border-line rounded-2xl`, `btn-primary`, `btn-secondary`, `badge`, jetons `text-ink/dim/muted`, thèmes clair/sombre).

## Zustand v5
Jamais de sélecteur qui crée un objet/tableau (`useStore(s => ({...}))`, `s => Object.values(s.x)`) : sélectionner les valeurs brutes puis dériver avec `useMemo`.

## Lecture d'un autre module sans dépendance d'ordre
Si le store d'un autre module n'existe pas encore (développement en parallèle), lis-le via
`const mods = import.meta.glob('../events/store.js', { eager: true })` et gère son absence proprement.

## Qualité attendue
Responsive 375 → 1440 px, accessible (labels `htmlFor`, `aria-label` sur boutons-icônes, focus visible, navigation clavier, pas d'action visible uniquement au survol), états vides / chargement / erreur, confirmations avant suppression, toasts de résultat, montants au format français (`formatMoney` de `src/documents/context.js`), dates françaises (`formatDateLong`).

Rapport final (< 700 mots) : fichiers, fonctionnalités réellement opérationnelles, interconnexions, vérifications effectuées (avec preuves), limites honnêtes, demandes au responsable.
