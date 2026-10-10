# BDE Manager

Application web (PWA installable, 100 % client-side, sans backend) de gestion d'un Bureau des Étudiants.

> ⚠️ **Données locales** : tout est stocké dans le navigateur de l'appareil
> (`localStorage`). Rien n'est synchronisé entre appareils ni entre membres du
> bureau. Pour partager ou sauvegarder : bouton **Exporter** (JSON) en haut de l'écran.
> Voir « Limites » dans [`docs/PROGRESS.md`](docs/PROGRESS.md).

## Fonctionnalités

### Membres
- Kanban glisser-déposer (souris, tactile, clavier), colonnes réordonnables
- Fiches membres : rôle choisi dans le catalogue, badges, notes, email
- Recherche (nom, rôle, badge, notes) et filtres (rôle, sans rôle, hors catalogue, badge, colonne)
- Export WhatsApp (.txt)

### Gestion des rôles — sans code
- Pôles, niveaux hiérarchiques et rôles entièrement éditables depuis l'interface
  (bouton ⚙ de l'en-tête, ou Organisation › Moteur de rôles › Gestion des rôles)
- Créer, renommer, dupliquer, réordonner, supprimer ; capacités ; leadership / essentiel ;
  alias pour reconnaître un rôle dans un CSV de formulaire
- Suppressions sûres : pôle/niveau utilisé → refus expliqué ; rôle → réaffectation des membres
- Export / import / réinitialisation du catalogue (JSON)
- Toutes les vues (Kanban, Drive, organigrammes, moteur) se mettent à jour immédiatement

### Moteur d'affectation
- Import CSV (Google Forms) ; signalement des choix non reconnus (→ créer le rôle ou un alias)
- Scoring explicable (préférence, disponibilité, expérience, ambition, motivation, formation)
- Solveur hongrois + recherche locale ; 4 scénarios comparables ; contraintes (forcé, plafond, bonus)
- Analyse de stabilité (Monte-Carlo) ; organigramme interactif (zoom, échange verrouillé)
- Application au Kanban en une étape annulable

### Gouvernance Google Drive
- Matrice de permissions, arborescence de dossiers, presets par rôle
- Vérifications automatiques, recommandations basées sur les vraies données
- Exports CSV/TXT/PDF/JSON, générateur de script Google Apps Script

### Coffre-fort chiffré
- AES-GCM 256 bits, clé dérivée par PBKDF2-SHA256 (250 000 itérations), jamais stockée
- Verrouillage automatique (5 min d'inactivité / onglet masqué) ; limitation des essais
- Migration guidée des entrées d'un ancien coffre non chiffré (copies en clair effacées)
- Les sauvegardes JSON ne contiennent que la version chiffrée

### Système
- Annuler / Rétablir (Ctrl+Z, Ctrl+Maj+Z / Ctrl+Y) : membres, colonnes, catalogue, Drive, presets
- Sauvegarde / restauration JSON (toutes versions, migration automatique, sauvegarde de sécurité avant import)
- Synchronisation entre onglets du même navigateur
- Thème clair/sombre, navigation mobile en bas d'écran, accessibilité clavier / lecteur d'écran
- PWA : installable, hors ligne après la première visite, invitation à mettre à jour

## Développement

```bash
npm install
npm run dev        # serveur de développement
npm test           # tests automatisés (node:test)
npm run lint       # ESLint
npm run build      # build de production (dist/)
npm run check      # lint + tests + build
```

Node ≥ 18 requis (testé avec Node 24).

## Architecture (résumé)

| Dossier | Rôle |
|---|---|
| `src/store.js` | Store principal Zustand persisté (`bde-storage`, v11) : membres, catalogue, Drive, coffre, historique |
| `src/core/catalog.js` | Catalogue des rôles : module **pur** (valeurs par défaut, validation, catalogue actif du moteur) |
| `src/core/useCatalog.js` | Hooks React réactifs du catalogue |
| `src/core/migrations.js` | Migrations des données persistées (exécutées avant hydratation) |
| `src/roleEngine/` | Moteur d'affectation pur + son store (`bde-roles-storage`, v4) |
| `src/components/` | Interface (React 19, Tailwind) |
| `docs/PROGRESS.md` | Suivi des travaux, validations et limites connues |
