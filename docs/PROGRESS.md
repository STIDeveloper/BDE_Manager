# BDE Manager — Suivi de la professionnalisation

> Document tenu à jour après chaque phase. Toute fonctionnalité marquée ✅ est
> accompagnée de sa preuve (test automatisé, commande ou vérification manuelle
> décrite). ⏳ = en cours, ⚠️ = limite connue.

**Point de restauration** : commit `1dd70ec` + tag `baseline-pre-refacto`
(état exact avant toute modification). Restaurer : `git checkout baseline-pre-refacto`.

---

## Phase 0 — Audit (terminé)

| Domaine | Constat vérifié |
|---|---|
| Build | Passait, mais chunk Mermaid 4,8 Mo préchargé à chaque visite et précaché (SW 6,4 Mo). |
| Lint | 103 erreurs, aucune critique (95 `no-unused-vars`). Les bugs supposés du cahier (`await` hors async, regex) **n'existaient pas**. |
| Tests | `node --test <dossier>` incompatible Node 24 ; 37/40 (2 tests faux + 1 vrai bug null dans `explain.js`). |
| Coffre-fort | **Inutilisable** (`setMasterHash` inexistant) ; moteur AES-GCM jamais utilisé ; anciennes entrées en clair laissées dans `localStorage`. |
| Migration | Exécutée depuis `App.jsx` *après* l'hydratation du store → écrasée à la 1re écriture. |
| Rôles | 3 catalogues divergents ; vues Drive/Gouvernance basées sur des libellés (cassées après migration) ; parseur CSV : « Vice-Président(e) » → président. |
| Données | 100 % locales ; onglets concurrents s'écrasent ; candidats du moteur non persistés ; config moteur absente des backups. |
| UX | 21 `window.confirm`, 0 attribut ARIA, actions au survol inaccessibles au tactile, header débordant sur mobile, drag & drop de l'organigramme cassé. |

## Phase 1 — Fondations (en cours)

### Catalogue dynamique (no-code)
- ✅ `src/core/catalog.js` : module **pur** (aucune dépendance) — valeurs par défaut, normalisation/validation, helpers, *catalogue actif* lu par le moteur.
- ✅ Catalogue `{poles, levels, roles}` stocké dans le store principal (persisté + inclus dans les backups). Ids **immuables** (renommer = changer le libellé).
- ✅ Actions CRUD validées (retour `{ok, error}` en français) : pôles, niveaux, rôles, duplication, réordonnancement, export/import/réinitialisation du catalogue.
- ✅ Suppression de rôle : réaffectation ou détachement des membres (ancien libellé conservé), preset Drive supprimé, contraintes et verrous du moteur purgés. Suppression de pôle/niveau utilisé refusée.
- ✅ Capacités = attribut du rôle (reprises automatiquement de l'ancien store du moteur).
- ✅ Hooks React `src/core/useCatalog.js` (sélecteurs atomiques — le `useStore(s => ({...}))` proposé dans le cahier provoque une boucle infinie avec Zustand v5).
- ✅ Annuler/Rétablir étendu : membres, colonnes, presets, dossiers, catalogue, permissions (30 niveaux).
- *Preuve* : `src/core/tests/catalogStore.test.js` — 16/16 (dont le scénario « pôle Créatif + Responsable Design capacité 2 »).

### Migration des données existantes
- ✅ Migration v10 → v11 dans `persist.migrate` (avant hydratation), idempotente, sans perte : libellés → ids (ancien libellé conservé), presets convertis sans suppression (collisions conservées), capacités reprises, coffre intact.
- ✅ Résolveur d'alias corrigé (vice-président, e-sport, com interne) et compatible avec les rôles personnalisés.
- *Preuve* : `src/core/tests/migration.test.js` — 7/7 (état v10 réel → v11 via le middleware persist).

### Coffre-fort
- ✅ Réécrit sur le moteur AES-GCM-256 + PBKDF2 (250 000 itérations) ; création, déverrouillage, verrouillage, ajout/édition/suppression.
- ✅ Migration guidée des anciennes entrées en clair (vérification de l'ancien mot de passe), purge des données en clair.
- ✅ Verrouillage automatique (5 min d'inactivité, onglet masqué > 1 min), limitation des essais (5 échecs → attente croissante).
- ✅ Écritures chiffrées sérialisées (file d'attente) ; aucune donnée déchiffrée remise en mémoire après verrouillage.
- *Preuve* : test aller-retour crypto Node (mauvais/bon mot de passe, blob altéré rejeté, IV unique). ⏳ Vérification navigateur en phase E2E.

### Synchronisation
- ✅ Synchronisation entre onglets du même navigateur (événement `storage` → réhydratation, historique vidé, coffre reverrouillé si modifié ailleurs).
- ⚠️ **Aucune synchronisation entre appareils ni entre utilisateurs** : voir « Limites ».

### PWA / production
- ✅ Mermaid chargé à la demande ; précache SW : 35 entrées / 6,4 Mo → 15 entrées / 1,1 Mo ; cache d'exécution pour les chunks paresseux (hors ligne après 1re visite).
- ✅ Invite de mise à jour (`registerType: 'prompt'`), message « prête hors ligne ».
- ✅ Manifeste complet (`id`, `scope`, `lang`), icônes maskables réelles (zone de sécurité), apple-touch-icon et écrans de démarrage iOS référencés.
- ✅ En-têtes Vercel : CSP stricte (testée sans violation en prévisualisation), HSTS, COOP, Permissions-Policy, cache `no-cache` pour `sw.js`/`index.html`/manifeste.
- ⏳ Service worker non testable dans le navigateur intégré (enregistrement refusé par l'environnement) — à vérifier après déploiement.

## Limites connues (architecture des données)
- **Stockage 100 % local** (`localStorage` du navigateur) : rien n'est envoyé à un serveur. Deux appareils (ou deux membres du bureau) ont des données **indépendantes**. Le seul moyen de partager est l'export/import JSON manuel (qui **remplace** les données, sans fusion).
- Effacer les données du navigateur efface l'application : exporter régulièrement une sauvegarde.
- Capacité `localStorage` ≈ 5 Mo par origine.
- Une vraie collaboration multi-utilisateurs nécessiterait un backend (authentification + base de données + résolution de conflits) : hors périmètre actuel.

## Prochaines actions
- Intégration de l'interface « Gestion des rôles », migration des écrans du moteur sur le catalogue, UX/accessibilité, lint à zéro, parcours E2E navigateur.
