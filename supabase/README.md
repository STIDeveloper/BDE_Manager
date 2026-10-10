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

`validation/supabase_stub.sql` simule les schémas `auth` / `storage` de Supabase (et ses privilèges par défaut) ; lancer d'abord `node scripts/build-edge.mjs`. `validate.mjs` joue 198 contrôles : ceux de 0001 (RLS entre deux espaces et cinq rôles, invitations, trésorerie, coffre, numérotation sous appels entrelacés, vérification anonyme, audit, stockage) puis, via `forms-scenarios.mjs`, ceux de 0002 (publication, cœur réel de forms-submit avec le moteur, RLS, vote anonyme, automatisations, paiement, messages). PGlite n'est pas une dépendance du projet.

## Limites connues

- Les appels « concurrents » de la validation sont entrelacés dans une seule connexion PGlite ; l'unicité réelle repose sur l'UPSERT atomique (verrou de ligne) de `reserve_document_refs`.
- Conflits : dernier écrit gagne **par enregistrement** (pas de fusion champ par champ).
- Le temps réel de Supabase limite la taille des messages : une ligne trop volumineuse est relue depuis la base.

---

# Studio Formulaires (migration 0002 + fonctions Edge)

Formulaires publics (lien `/f/<slug>`), réponses traitées dans l'application, vote anonyme, paiements HelloAsso, e-mails Brevo, automatisations. **Prérequis : 0001 déjà installée.**

## Étapes pour le propriétaire du projet

### 1. Base de données
*SQL Editor* › *New query* › coller **tout** `migrations/0002_forms.sql` › *Run* (résultat attendu : `Success. No rows returned`). Idempotent : relançable. Effets :
- capacités **Formulaires** (`forms`) et **Tâches** (`tasks`) ajoutées à tous les espaces existants (propriétaire : gérer ; bureau : écrire ; trésorier : formulaires en lecture, tâches en écriture ; membre et lecteur : lecture) — un réglage déjà modifié n'est jamais écrasé ;
- tables `forms`, `form_versions` (immuables), `form_responses`, `form_response_events`, `form_drafts`, `vote_rolls` / `vote_rights` / `vote_ballots`, `automations`, `automation_runs`, `rate_limits` — RLS partout ;
- bucket privé **form-uploads** (10 Mo par fichier ; écriture uniquement par URL signée émise par `forms-submit`) ;
- correctif de 0001 : `audit()` et `seed_default_grants()` ne sont plus appelables directement (Supabase accorde par défaut l'exécution de toute nouvelle fonction à `authenticated`).

### 2. Cloudflare Turnstile (anti-robot)
1. https://dash.cloudflare.com › *Turnstile* › *Add widget* : nom « BDE Manager », domaines `bde-manager.vercel.app` (+ `localhost` pour le développement), mode *Managed*.
2. **Site key** (publique) → Vercel › *Settings* › *Environment Variables* : `VITE_TURNSTILE_SITE_KEY=<site key>`, puis redéployer.
3. **Secret key** → secrets Supabase (*Edge Functions* › *Secrets*) : `TURNSTILE_SECRET_KEY`.

Sans secret, un formulaire qui exige Turnstile est refusé avec un message clair (503) ; les autres fonctionnent.

### 3. Brevo (e-mails)
1. https://app.brevo.com › *Senders, Domains & Dedicated IPs* : ajouter et **vérifier** l'adresse d'expédition (idéalement sur le domaine du BDE, SPF/DKIM).
2. *SMTP & API* › *API Keys* › *Generate a new API key*.
3. Secrets Supabase : `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` (adresse vérifiée), `BREVO_SENDER_NAME` (ex. « BDE Polytech »).

Sans Brevo : aucun e-mail (accusés de réception et notifications ignorés), le reste fonctionne.

### 4. HelloAsso (paiements)
1. https://admin.helloasso.com › *Mon compte* › *Intégrations et API* : récupérer le **Client ID** et le **Client secret** de l'API. Le **slug de l'organisation** est la fin de l'URL publique `helloasso.com/associations/<slug>`.
2. Secrets Supabase : `HELLOASSO_CLIENT_ID`, `HELLOASSO_CLIENT_SECRET`, `HELLOASSO_ORG_SLUG`, `HELLOASSO_WEBHOOK_TOKEN` (chaîne aléatoire, ex. `openssl rand -hex 24`) ; `HELLOASSO_ENV=sandbox` uniquement pour tester avec un compte https://www.helloasso-sandbox.com.
3. Même page HelloAsso, champ *URL de notification (callback)* — déclarer exactement :

   `https://zvuniwturousjnliybpm.supabase.co/functions/v1/helloasso/webhook?token=<HELLOASSO_WEBHOOK_TOKEN>`

La notification n'est jamais crue sur parole : la fonction relit le paiement auprès de l'API HelloAsso (commande + paiement « Authorized »/« Processed », montant ≥ montant attendu, `metadata.responseId` posé par nous) avant de passer la réponse à « payé ». Le montant facturé est celui recalculé par le moteur côté serveur à l'envoi. Retours : `https://bde-manager.vercel.app/f/<slug>?paiement=retour|annule|erreur`.

### 5. Secrets communs
- `APP_ORIGIN=https://bde-manager.vercel.app` (plusieurs origines séparées par des virgules, ex. `https://bde-manager.vercel.app,http://localhost:5173`) ;
- facultatif : `RATE_LIMIT_SALT` (chaîne aléatoire) ;
- `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont fournis automatiquement aux fonctions : **ne jamais** les mettre dans l'application.

```bash
npx supabase login
npx supabase secrets set --project-ref zvuniwturousjnliybpm APP_ORIGIN=https://bde-manager.vercel.app TURNSTILE_SECRET_KEY=... BREVO_API_KEY=... BREVO_SENDER_EMAIL=... BREVO_SENDER_NAME="BDE ..." HELLOASSO_CLIENT_ID=... HELLOASSO_CLIENT_SECRET=... HELLOASSO_ORG_SLUG=... HELLOASSO_WEBHOOK_TOKEN=...
```

### 6. Déployer les fonctions
Depuis la racine du projet :

```bash
node scripts/build-edge.mjs     # copie du moteur → supabase/functions/_shared/forms-engine (à refaire à chaque évolution du moteur)
npx supabase login
npx supabase functions deploy forms-submit --project-ref zvuniwturousjnliybpm --no-verify-jwt
npx supabase functions deploy brevo-send   --project-ref zvuniwturousjnliybpm --no-verify-jwt
npx supabase functions deploy helloasso    --project-ref zvuniwturousjnliybpm --no-verify-jwt
```

`--no-verify-jwt` est **nécessaire** : les envois anonymes et les notifications HelloAsso n'ont pas de JWT ; chaque fonction vérifie elle-même le JWT utilisateur quand il est requis. Alternative sans terminal : *Edge Functions* › *Deploy a new function* › éditeur web, en recréant `index.ts` et le dossier `_shared/` complet, puis désactiver « Enforce JWT verification » dans les réglages de chaque fonction.

Test rapide après déploiement : ouvrir un formulaire publié (`/f/<slug>`), envoyer une réponse, vérifier qu'elle apparaît dans l'application ; *Edge Functions* › *Logs* ne contient aucune donnée personnelle (codes techniques uniquement).

## Architecture

| Élément | Rôle |
|---|---|
| `publish_form` | capacité `forms` ≥ write ; valide la définition (1–50 pages, ≤ 1 Mo, clés uniques, 500 questions max) ; lien court unique ; nouvelle version immuable |
| `get_public_form` (anon) | dernière version publiée si `published`/`closed` et accès autorisé (`public`/`link` ; `members`/`invited` → compte éligible) ; définition expurgée (destinataires des notifications, liste électorale, bonnes réponses des quiz) ; compteurs publics (total, liste d'attente, par option à capacité) |
| `forms-submit` (Edge) | origine (APP_ORIGIN ou origines d'intégration du formulaire), pot de miel, limitation (empreinte IP + formulaire), Turnstile, ouverture, accès / identité, **revalidation complète par le moteur** (`validateAnswers`, `quotaStatus` avec compteurs lus en base, quotas à expression évalués sur les réponses existantes, existence des membres / événements choisis), unicité, une réponse par personne, insertion atomique (verrou par formulaire + empreinte : deux envois simultanés pour la dernière place → un seul accepté), URL signées d'envoi de fichiers (`<espace>/<formulaire>/<réponse>/<fichier>`), jeton de modification (renvoyé une fois, haché en base), accusé de réception |
| `brevo-send` (Edge) | message d'un organisateur (`forms` ≥ write) aux répondants de son espace ou à des comptes membres ; destinataires résolus côté serveur, 30 envois / heure / espace |
| `helloasso` (Edge) | `/checkout` (réponse + jeton de modification → URL de paiement) ; `/webhook` (revérification auprès de l'API) |
| `form_responses` | lecture : capacité `forms` ≥ read ; traitement (statut, étiquettes, responsable, liste d'attente, suppression logique, « réglé hors ligne ») : ≥ write ; les réponses elles-mêmes et « payé » ne sont modifiables que par le serveur ; historique automatique (`form_response_events`) |
| Répondant | `get_my_responses()` (compte connecté), `get_response_by_token(jeton)` (lien reçu) — sans étiquettes, responsable ni notes internes ; brouillons `save_form_draft` / `load_form_draft` (jeton aléatoire du navigateur, 30 jours) |
| `automation_runs` | déclenchements enregistrés par trigger (`response.created`, `response.updated`, `response.status_changed` avec `trigger.status` facultatif, `payment.paid`), approbation (`forms` ≥ validate), exécution par l'app : `claim_automation_runs` (réservation 10 min) → `complete_automation_run` |

## Vote anonyme : garanties et limites
- **Séparation** : `vote_rolls` (empreintes des électeurs, propres à chaque vote), `vote_rights` (droit consommé, date au **jour** près), `vote_ballots` (bulletin : identifiant aléatoire, choix, empreinte du reçu, jour). Aucune colonne commune hormis `form_id`, aucun horodatage précis, aucune clé séquentielle.
- **Accès** : aucune politique RLS sur ces tables ; `anon`, `authenticated` **et la clé de service** n'y ont aucun privilège. Seules les RPC `cast_vote`, `verify_ballot`, `vote_results`, `vote_participation` (agrégats) y accèdent. Le vote ne passe ni par le journal d'audit ni par le temps réel.
- **Une seule transaction** : éligibilité, vote ouvert, bulletin valide, puis droit consommé (clé primaire → pas de double vote, même simultané) + bulletin inséré ; le reçu (128 bits) n'est stocké que haché.
- **Résultats** : `after_close` (personne avant la clôture, même le propriétaire), `live`, `admins` (capacité `forms` ≥ write) ; participation, quorum, majorité simple / absolue / deux tiers ; classement par méthode de Borda.
- **Limites résiduelles** : quiconque administre l'infrastructure Postgres (rôle `postgres` du tableau de bord, accès disque/WAL, extensions d'inspection) peut rapprocher l'**ordre physique d'insertion** des lignes de `vote_rights` et de `vote_ballots`, ou corréler les **journaux** (journaux d'API Supabase : utilisateur, IP, heure de l'appel `cast_vote`) avec l'arrivée des bulletins — surtout pour un petit corps électoral ou un vote isolé dans la journée. Le dispositif protège contre les autres membres, les administrateurs de l'application et la clé de service, pas contre le propriétaire de l'infrastructure. Pour une élection à fort enjeu : l'annoncer, ou recourir à un service de vote certifié.

## Côté application
- Client : `src/backend/forms.js`. En mode local, chaque appel lève « Formulaires publics : connecte d'abord un espace (Équipe & accès). »
- Script `package.json` recommandé : `"build:edge": "node scripts/build-edge.mjs"`.
