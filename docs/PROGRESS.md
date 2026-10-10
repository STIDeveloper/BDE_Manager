# BDE Manager — Suivi de la professionnalisation

> Document mis à jour à la fin de chaque phase. Une fonctionnalité marquée ✅
> s'accompagne de sa preuve (test automatisé, commande ou parcours vérifié dans
> un navigateur). ⚠️ signale une limite connue, ⏳ un point restant à faire.

**Points de restauration Git (locaux, rien n'a été poussé) :**
- `baseline-pre-refacto` (commit `1dd70ec`) : état exact avant toute modification.
- Commit `14f64d1` : fondations (catalogue, migration, coffre, PWA).
- Restaurer l'état d'origine : `git checkout baseline-pre-refacto`.

---

## Synthèse des validations (état actuel)

| Élément | Statut | Preuve |
|---|---|---|
| Build | ✅ | `npm run build` OK. Précache SW 13 entrées / 874 Ko (avant : 35 / 6,4 Mo) |
| ESLint | ✅ | `npx eslint .` → **0 erreur** (avant : 103) |
| Tests | ✅ | `npm test` → **281/281** (avant : 37/40, commande cassée sous Node 24) |
| Migration des données existantes | ✅ | `src/core/tests/migration.test.js` (7) + parcours navigateur v10 → v11 |
| CRUD rôles / pôles / niveaux | ✅ | `src/core/tests/catalogStore.test.js` (17) + parcours navigateur |
| Catalogue dynamique (persisté) | ✅ | Persisté dans `bde-storage` v11 ; vérifié après rechargement |
| Aperçu live (organigrammes) | ✅ | Navigateur : pôle créé et rôle renommé visibles immédiatement |
| Moteur d'affectation | ✅ | `src/roleEngine/tests` (55). Non-régression : affectations **identiques** à l'ancien moteur sur le catalogue par défaut, hors correction du parsing « vice-président » (écarts documentés) |
| Coffre-fort | ✅ | Test crypto Node + parcours navigateur (création, ajout, verrouillage, mauvais/bon mot de passe, migration de l'ancien coffre) |
| Sync inter-onglets | ✅ | `src/core/tests/crossTab.test.js` (3) : aucune réécriture d'un changement externe |
| Pont moteur → Kanban | ✅ | `src/core/tests/bridge.test.js` (4) |
| Mobile (375 px) | ✅ | Navigateur : aucun débordement horizontal sur les 5 onglets ; cibles tactiles ≥ 40 px (Kanban) ; navigation inférieure |
| PWA installable | ✅ / ⚠️ | Manifeste valide (id, scope, icônes any + maskable), 46 écrans de démarrage iOS. Page **contrôlée par le SW et servie depuis le cache** (vérifié). ⚠️ L'enregistrement automatique échoue dans le navigateur intégré de l'environnement de test (l'enregistrement manuel réussit) : à confirmer sur le déploiement réel |
| Studio documents (27 modèles) | ✅ | Tests de chaque modèle × association complète/vide, test transversal du registre, moteurs PDF/HTML/Word testés sous Node ; navigateur : 22 attestations émises en 0,65 s, registre, vérification d'authenticité, mobile |
| Déploiement Vercel | ⏳ | **En attente de ton autorisation** (aucun déploiement ni push effectué) |

---

## Phase 0 — Audit (terminé)

| Domaine | Constat vérifié |
|---|---|
| Build | Passait, mais chunk Mermaid de 4,8 Mo préchargé à chaque visite et précaché. |
| Lint | 103 erreurs, aucune critique. Les bugs annoncés par le cahier (`await` hors async, regex) **n'existaient pas**. |
| Tests | `node --test <dossier>` incompatible avec Node 24 ; 37/40 (2 tests faux, 1 vrai bug null dans `explain.js`). |
| Coffre-fort | **Inutilisable** (`setMasterHash` inexistant) ; moteur AES-GCM jamais utilisé ; anciennes entrées en clair dans `localStorage`. |
| Migration | Lancée depuis `App.jsx` *après* l'hydratation du store, donc écrasée à la première écriture. |
| Rôles | 3 catalogues divergents ; vues Drive/Gouvernance basées sur des libellés (cassées après migration) ; parseur CSV : « Vice-Président(e) » → président. |
| Données | 100 % locales ; onglets concurrents qui s'écrasent ; candidats non persistés ; configuration du moteur absente des sauvegardes. |
| UX | 21 `window.confirm`, aucun attribut ARIA, actions visibles uniquement au survol, header qui déborde sur mobile, glisser-déposer de l'organigramme cassé, écran « Recommandations » factice (noms codés en dur). |

## Phase 1 — Fondations (terminé)

### Catalogue dynamique
- `src/core/catalog.js` : module pur, avec valeurs par défaut, normalisation/validation et catalogue actif lu par le moteur (testable sous Node, sans dépendance circulaire).
- Catalogue `{poles, levels, roles}` dans le store principal : persisté et inclus dans les backups. **Ids immuables** : renommer ne change que le libellé, donc presets, membres et contraintes restent liés.
- Actions validées qui renvoient `{ok, error}` en français, sans exception non gérée.
- Suppression d'un rôle : réaffectation ou détachement des membres (ancien libellé conservé), suppression du preset Drive, purge des contraintes et verrous du moteur. La suppression d'un pôle ou d'un niveau utilisé est refusée.
- La capacité devient un attribut du rôle, reprise automatiquement de l'ancien store du moteur.
- Hooks React à sélecteurs atomiques. Le `useStore(s => ({...}))` proposé par le cahier provoque une boucle de rendu infinie avec Zustand v5.
- Annuler/Rétablir couvre membres, colonnes, presets, dossiers, catalogue et permissions (30 niveaux).

### Migration (aucune perte)
- v10 → v11 dans `persist.migrate`, donc avant l'hydratation. Idempotente : libellés → ids (ancien libellé conservé), presets convertis sans suppression (collisions conservées), capacités reprises, coffre intact.
- Résolveur d'alias corrigé (vice-président, e-sport, com interne), compatible avec les rôles personnalisés.
- Import d'anciens backups (toutes versions) passé par la même migration.

### Coffre-fort
- AES-GCM-256 + PBKDF2 (250 000 itérations) réellement utilisé ; écritures sérialisées ; aucune donnée déchiffrée remise en mémoire après verrouillage.
- Migration guidée des anciennes entrées en clair, avec purge.
- Verrouillage automatique et limitation des essais.

### Moteur de rôles
- Lit le catalogue actif. Rôles et pôles personnalisés pris en compte (slots, scoring, alertes, explications, exports).
- Niveaux personnalisés : un « comportement moteur » (`kind`) détermine le scoring.
- Les choix CSV sont réinterprétés quand le catalogue change : un rôle créé après l'import est reconnu sans réimporter.
- Bugs corrigés : parsing vice-président, crash sur les candidats non placés, références orphelines (verrous ou contraintes vers un rôle supprimé), contraintes ignorées dans l'analyse de stabilité.

### PWA / production
- Mermaid et jspdf chargés à la demande. Précache de 874 Ko ; cache d'exécution pour les modules chargés plus tard.
- Invitation à mettre à jour, message « prête hors ligne ».
- Manifeste complet, icônes maskables réelles, écrans de démarrage iOS.
- En-têtes Vercel : CSP stricte (testée sans violation), HSTS, COOP, Permissions-Policy ; `no-cache` sur `sw.js`, `index.html` et le manifeste.

## Phase 2 — Interface (terminé)
- **Gestion des rôles** (no-code) : 3 colonnes sur ordinateur, tiroir sur tablette, parcours par étapes sur mobile. Niveaux, glisser-déposer + alternatives clavier, impact calculé avant suppression, export/import/réinitialisation.
- Accès : bouton ⚙ de l'en-tête (plein écran) et sous-onglet du moteur.
- Membres : sélection du rôle dans le catalogue, ancien texte libre préservé, validation, suppression de colonne avec déplacement des membres.
- Drive : presets par rôle du catalogue, « presets hors catalogue » réassociables, analyse sans libellés codés en dur, action destructive cachée (clic droit) remplacée par un bouton visible et confirmé, dossiers protégés contre les cycles.
- Organisation : organigramme groupé par pôles du catalogue, labels échappés (Mermaid en `securityLevel: strict`), recommandations calculées sur les vraies données.
- Moteur : organigramme live réécrit (Pointer Events tactiles, échange explicite, zoom non passif, fiche candidat accessible, MemberExplainModal enfin branché), compteurs placés / non placés corrigés, scénario « Personnalisé » resélectionnable.
- Transverse : boîte de dialogue accessible commune (focus piégé et restauré, Échap, pile), `confirmDialog` à la place des 21 `window.confirm`, toasts accessibles, navigation conservée dans l'URL, barre de navigation mobile, cibles tactiles ≥ 40 px.

## Phase 3 — Studio documents (terminé)
Nouvel onglet **Documents** : génération automatique de documents professionnels et légaux à partir des données de l'application (membres, rôles, Drive, registre).

**27 modèles** (`src/documents/templates/`) :
- *Membres* : attestation d'adhésion, attestation d'engagement associatif (mention de l'article L. 611-9 du code de l'éducation), lettre de mission (accès Drive inclus), lettre de recommandation, attestation de fin de fonctions, dossier de passation (accès du coffre listés **par libellé uniquement**), charte d'engagement, reçu de cotisation (montant en lettres, mention « non fiscal »), certificat de participation.
- *Gouvernance & légal* : convocation d'AG (contrôle du délai statutaire), feuille d'émargement, pouvoir, **procès-verbal d'AG avec calcul du quorum et des majorités** (simple, absolue, deux tiers, unanimité), compte rendu de bureau, **liste des dirigeants** (rappel de déclaration sous 3 mois en cas de changement de bureau), délégation de pouvoir, registre des membres.
- *Organisation* : organigramme officiel, annuaire interne, fiche de pôle.
- *Partenariats & finances* : convention de partenariat (articles numérotés), note de frais (contrôle IBAN mod 97), attestations d'événement en lot, budget prévisionnel.
- *RGPD* : mention d'information, **registre des traitements calculé à partir des données réellement stockées**, autorisation de droit à l'image (détection des mineurs).

**Fonctionnement** :
- Contrat unique (`model.js` / `context.js`) : un modèle produit un document abstrait, rendu en aperçu A4 retouchable, PDF vectoriel (jsPDF, chargé à la demande), impression et Word ; une seule source de balisage pour éviter toute divergence.
- **Émission** : chaque export reçoit un numéro chronologique (`BDE-2026-0001`, jamais réutilisé, même après suppression ou restauration d'une sauvegarde) et une **empreinte SHA-256** imprimée en pied de page ; le registre permet de **vérifier l'authenticité** d'un document papier. Brouillons : filigrane « BROUILLON » sur chaque page, aucun numéro.
- **Suggestions intelligentes** (« À faire ») : passations, lettres de mission manquantes, déclaration de changement de dirigeants, reçus, droit à l'image, registre RGPD annuel…
- Profil de l'association (logo, cachet, couleur, mentions légales) ; **signatures dessinées** (tactile/stylet) ou importées, stockées sur l'appareil.
- Génération en lot sans fuite de valeurs entre membres (seules les valeurs modifiées s'imposent à tous).
- Fiche membre : section « Informations administratives (optionnel) » (dates de mandat, formation, adresse, nationalité…) utilisée par les documents officiels.

**Vérifications** : relecture visuelle des PDF (mise en page et français), parcours navigateur complet (galerie, suggestions, émission en lot, registre, vérification, mobile 375 px).

**Corrigé pendant la vérification** : fiche « [Poste vacant] » du seed traitée comme une personne (exclue de tous les documents) ; aperçu mobile mal dimensionné à l'ouverture ; espaces perdues après le gras et chevauchement du pied de page dans le PDF ; modèles sans note juridique (détectés par le test transversal).

**Limites** : les modèles sont **indicatifs** (à vérifier au regard des statuts ; conseil juridique pour les actes engageants) ; impression navigateur sans numéros de page ; dans Word le pied de page apparaît en fin de document ; les emojis sont retirés du PDF (polices standard) ; le studio et l'export PDF hors ligne nécessitent une première ouverture en ligne.

## Bugs trouvés pendant la vérification (et corrigés)
- `bridge.js` : `createdColumns` hors de portée après refactorisation → « Appliquer au BDE » aurait échoué à chaque fois. Détecté par le lint, couvert depuis par `bridge.test.js`.
- Sync inter-onglets : la réhydratation réécrivait l'état et pouvait écraser l'écriture plus récente d'un autre onglet. Corrigé (stockage rendu muet pendant l'application) et testé.
- Configuration Tailwind : les couleurs `muted`, `line-strong` et `hover` étaient utilisées partout mais jamais définies (classes sans effet).
- `importAllData` : clé `badges` dupliquée.
- Générateur de script Apps Script : noms de dossiers injectés sans échappement (risque d'injection de code). Corrigé.

---

## Limites connues
- ⚠️ **Stockage 100 % local** (`localStorage`) : deux appareils, ou deux membres du bureau, ont des données **indépendantes**. Seul l'export/import JSON permet de partager, et il **remplace** les données sans les fusionner. Une vraie collaboration demanderait un backend (authentification, base de données, résolution de conflits) : hors périmètre.
- ⚠️ Effacer les données du navigateur efface l'application : exporter régulièrement une sauvegarde. Capacité d'environ 5 Mo par origine.
- ⚠️ Synchronisation entre onglets : « le dernier qui écrit gagne » sur l'état complet. Deux modifications *simultanées* dans deux onglets peuvent en perdre une. La synchronisation évite seulement qu'un onglet renvoie une version périmée.
- ⚠️ Annuler une suppression de rôle restaure le rôle, les membres et le preset, mais **pas** les contraintes du moteur purgées (signalé dans la fenêtre de suppression).
- ⚠️ Vue « Matrice » du Drive dense sur téléphone (une cellule par dossier × membre) : utiliser la vue « Par membre ».
- ⚠️ Hors ligne : l'organigramme Mermaid et l'export PDF fonctionnent hors ligne seulement s'ils ont été ouverts une fois en ligne (chargés à la demande).
- ⚠️ La police Inter vient de Google Fonts. Hors ligne avant la première mise en cache, la police système prend le relais.
- Quelques ids historiques restent dans des règles du moteur (bonus de succession pour `vice_president`, alerte `president_contest`). Ces règles sont ignorées sans erreur si ces rôles sont supprimés.

## Décisions en attente (ton autorisation est requise)
1. **Déploiement Vercel** (`vercel --prod`) : projet déjà lié (`.vercel/project.json`, projet « bde-manager »).
2. **Push GitHub** (`git remote add origin … && git push -u origin main`).
3. **Fichiers inutiles** à supprimer (non utilisés, toujours récupérables via Git) : `src/components/FolderManagerModal.jsx` (doublon orphelin), `fix_toast.js` (script ponctuel déjà appliqué), `bde-managervtt.zip` (ancienne archive de septembre), `src/App.css`, `src/assets/{hero.png,react.svg,vite.svg}`, `public/icons.svg` (restes du modèle Vite).

## Prochaines actions possibles
- Après déploiement : vérifier l'installation PWA sur iPhone et Android, puis le cycle de mise à jour du service worker.
- Si le bureau doit partager les données en temps réel : étudier un backend (Supabase ou Firebase), avec authentification et règles d'accès.
