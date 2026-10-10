# Backend collaboratif (Supabase)

Sans configuration, BDE Manager fonctionne **en mode local** : les données restent dans le navigateur. Ce dossier sert à activer le **mode collaboratif** : comptes, espace partagé par BDE, droits par rôle appliqués par le serveur (RLS Postgres), temps réel, pièces jointes, numérotation des documents sans doublon, vérification publique des documents.

## Mise en place (environ 10 minutes, offre gratuite)

1. **Créer le projet** : https://supabase.com › *New project* (offre Free). Choisir une région européenne. Garder le mot de passe de la base dans le coffre-fort.
2. **Installer le schéma** : *SQL Editor* › *New query* › coller **tout** le contenu de `migrations/0001_init.sql` (ou bouton « Copier le script SQL » dans l'écran Équipe & accès) › *Run*. Résultat attendu : `Success. No rows returned`. Le script est idempotent (relançable).
3. **Authentification** : *Authentication › URL Configuration* :
   - *Site URL* : l'adresse de l'application (ex. `https://bde-manager.vercel.app`) ;
   - *Redirect URLs* : la même adresse (et `http://localhost:5173` pour le développement).
   - *Authentication › Providers › Email* : laisser « Confirm email » activé (recommandé).
   - Optionnel : *Authentication › SMTP Settings* pour envoyer les e-mails depuis l'adresse du BDE (l'offre gratuite limite le nombre d'e-mails par heure).
4. **Récupérer les clés** : *Project Settings › API* (ou *API Keys*) : `Project URL` et la clé **publique** (`anon public` ou `sb_publishable_…`).
   ⚠️ Ne jamais utiliser la clé `service_role` / `sb_secret_…` dans l'application (l'écran la refuse).
5. **Renseigner l'application**, au choix :
   - dans l'écran **Équipe & accès** (enregistré dans ce navigateur) ;
   - ou au déploiement : variables `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` (Vercel › Settings › Environment Variables, voir `.env.example`), puis redéployer.
6. **Premier compte** : Équipe & accès › *Créer un compte* › confirmer l'e-mail › *Créer un espace* › *Connecter cet appareil* › **Publier mes données locales** (l'espace est vide).
7. **Inviter l'équipe** : section *Invitations* (e-mail + rôle d'accès) › copier le lien ou l'envoyer par e-mail. La personne crée son compte avec **cette** adresse, ouvre le lien et accepte ; à la connexion de son appareil, ses données locales sont remplacées par celles de l'espace (sauvegarde JSON téléchargée automatiquement avant).

## Modèle de données

| Table | Rôle |
|---|---|
| `workspaces`, `workspace_members` | espaces et comptes membres (rôle d'accès, lien `member_id` vers la fiche membre du BDE) |
| `roles_grants` | matrice capacité × rôle d'accès (modifiable par le propriétaire via `set_grant`) |
| `invitations` | invitations à usage unique, liées à une adresse e-mail, valables 14 jours |
| `records` | **toutes** les données des modules : `(workspace_id, collection, id) → data jsonb`, suppression logique, `updated_at` posé par le serveur (dernier écrit gagne) |
| `collection_capabilities` | collection → capacité (préfixe le plus long ; inconnue → `admin`) |
| `document_registry_public` | réf. + empreinte + intitulé générique + date des documents émis (alimentée par trigger) |
| `document_sequences` | compteurs de numérotation par espace et par année |
| `audit_log` | qui / quoi / quand (jamais le contenu) |

Rôles d'accès par défaut : **owner** (tout), **bureau** (écriture partout, administration en lecture), **tresorier** (trésorerie en validation, adhésions et documents en écriture, le reste en lecture, pas de coffre), **membre** (agenda, événements, documents, profil et rôles en lecture), **lecteur** (lecture seule hors coffre, recrutement, administration).

Règles serveur notables : valider/rejeter une opération de trésorerie exige `finance ≥ validate` ; le coffre n'accepte que les champs chiffrés (`vaultSalt`, `vaultVerifier`, `vaultEntriesBlob`) ; aucune suppression physique ; l'espace garde toujours un propriétaire ; `verify_document` est la seule fonction accessible anonymement.

## Validation hors ligne (sans Docker)

```bash
npm install --prefix /tmp/pglite @electric-sql/pglite
node supabase/validation/validate.mjs /tmp/pglite          # VERBOSE=1 pour voir les motifs de refus
```

`validation/supabase_stub.sql` simule les schémas `auth` / `storage` de Supabase ; `validate.mjs` joue 61 contrôles (RLS entre deux espaces et cinq rôles, invitations, trésorerie, coffre, numérotation sous appels entrelacés, vérification anonyme, audit, stockage). PGlite n'est pas une dépendance du projet.

## Limites connues

- Les appels « concurrents » de la validation sont entrelacés dans une seule connexion PGlite ; l'unicité réelle repose sur l'UPSERT atomique (verrou de ligne) de `reserve_document_refs`.
- Conflits : dernier écrit gagne **par enregistrement** (pas de fusion champ par champ).
- Le temps réel de Supabase limite la taille des messages : une ligne trop volumineuse est relue depuis la base.
