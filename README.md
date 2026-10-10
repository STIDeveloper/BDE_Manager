# BDE Manager

Application web locale (100% client-side, sans backend) de gestion d'un Bureau des Étudiants.

## 🎯 Fonctionnalités

### Gestion des membres
- Kanban drag & drop avec colonnes par pôle
- Fiches membres : prénom, nom, email, rôle principal, badges, notes
- Recherche et filtres multi-critères
- Export WhatsApp au format .txt

### Moteur de rôles intelligent
- Import CSV de formulaires (Google Forms)
- Scoring explicable : préférences, disponibilité, expérience, motivation, formation
- Solveur Hongrois (O(n³)) pour affectation globale optimale
- 3 scénarios : Satisfaction, Équilibre, Continuité
- Contraintes personnalisées : rôles forcés, plafonds, bonus
- Analyse de stabilité (200 perturbations Monte-Carlo)
- Organigramme SVG interactif : zoom, pan, drag, verrouillage
- Application au BDE en 1 clic avec prévisualisation

### Gouvernance Google Drive
- Matrice de permissions : Éditeur / Commentateur / Lecteur
- Arborescence modifiable (CRUD dossiers + tags)
- Presets par rôle pour affectation en masse
- Détection d'incohérences automatiques
- Export CSV/TXT/PDF/JSON
- Générateur de script Google Apps Script

### Coffre-fort chiffré
- AES-GCM 256 bits + dérivation PBKDF2 (250 000 itérations)
- Stockage 100% chiffré dans le navigateur
- Déverrouillage par mot de passe maître
- Migration automatique depuis un ancien coffre non chiffré

### Système
- Thème clair/sombre
- Undo/Redo (Ctrl+Z) sur les permissions
- Backup/Restore JSON de toutes les données
- Aucune donnée sensible envoyée à un service externe

## 🚀 Installation

```bash
npm install
npm run dev