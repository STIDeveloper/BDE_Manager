// ============================================================
// STUDIO FORMULAIRES — CONTRAT DU SCHÉMA (source de vérité)
// ============================================================
// Partagé par : l'éditeur (src/modules/forms/), la page répondant
// (src/forms/runtime/), le moteur de règles (src/forms/engine/), la
// fonction serveur d'envoi (supabase/functions/forms-submit/) et les
// automatisations. Tout est du JSON pur (aucun code exécutable).
//
// ── FormDefinition (brouillon, éditable) ─────────────────────
// {
//   id, slug ('wei-2027', unique, lien court /f/<slug>), title, description,
//   kind: 'standard'|'registration'|'application'|'vote'|'booking'|'quiz'|'survey',
//   status: 'draft'|'published'|'closed'|'archived',
//   pages: Page[],                 // au moins 1
//   variables: Variable[],         // variables et champs calculés
//   theme: Theme,
//   settings: Settings,
//   automations: string[],         // ids des automatisations liées (store automations)
//   publishedVersion?: number, createdAt, updatedAt, createdBy?
// }
// Une PUBLICATION fige une copie immuable { formId, version, definition, publishedAt } :
// chaque réponse référence (formId, version) → modifier le brouillon ne casse
// jamais les réponses existantes.
//
// ── Page ─────────────────────────────────────────────────────
// { id, title?, description?, items: Item[],
//   logic?: { showIf?: Expr, next?: [{ when: Expr, goTo: pageId | 'submit' }] } }
//
// ── Item (élément d'une page) ────────────────────────────────
// Bloc de mise en page :
//   { id, kind: 'section', title, description?, items: Item[], collapsible? }
//   { id, kind: 'columns', columns: Item[][] }            // 2 ou 3 colonnes (empilées sur mobile)
//   { id, kind: 'content', format: 'text'|'image'|'divider', text?, image?: AttachmentRef, alt? }
// Question :
//   { id, kind: 'question', key ('nom_variable', unique, [a-z][a-z0-9_]*), type: QuestionType,
//     label, help?, placeholder?, required?: boolean | Expr,
//     showIf?: Expr, readOnlyIf?: Expr,
//     default?: any | { expr: Expr },            // valeur préremplie (expr : calculée)
//     prefillFrom?: 'member.email'|'member.firstName'|'member.lastName'|'member.phone'|'url:<param>',
//     options?: Option[],                       // choix / liste / classement / tableau (lignes)
//     columns?: Option[],                       // tableau (grille) : colonnes
//     validation?: Validation,
//     repeat?: { min?, max?, addLabel? },       // question / section répétable
//     score?: { correct?: any, points?: number, perOption?: { [value]: number } }, // quiz
//     sensitive?: boolean,                      // masqué par défaut dans l'admin, purgé en priorité
//     source?: 'members'|'events'|'roles'|'poles' // choix alimentés par les données du BDE
//   }
//
// QuestionType :
//   short_text, long_text, email, phone, number, url, date, time, datetime,
//   single_choice (boutons radio), multiple_choice (cases), dropdown,
//   yes_no, rating (étoiles 1..max), scale (échelle linéaire min..max avec libellés),
//   nps (0..10), ranking (classement par glisser-déposer), matrix (grille lignes × colonnes,
//   choix unique ou multiple), file (téléversement), image_choice, signature,
//   address (adresse structurée), name (prénom + nom), consent (case obligatoire RGPD),
//   slots (créneaux avec capacité), member_picker, event_picker, payment (montant → paiement),
//   hidden (valeur cachée, ex. paramètre d'URL), calculated (affichage d'un calcul)
//
// Option : { value, label, image?: AttachmentRef, capacity?: number, price?: number, showIf?: Expr }
// Validation : { min?, max?, minLength?, maxLength?, pattern?, patternMessage?,
//                minSelected?, maxSelected?, maxFileSizeMb?, maxFiles?, accept?: string[],
//                uniqueAcrossResponses?: boolean }
// Variable : { key, label?, expr: Expr, type: 'number'|'text'|'boolean'|'date' }
//
// Expr : chaîne du langage de formules (src/forms/engine/expr.js), ex.
//   `age >= 18 ET regime = "vegetarien"`, `SOMME(note_1; note_2) / 2`,
//   `SI(score >= 15; "Admis"; "Refusé")`, `CONTIENT(activites; "escalade")`,
//   `NB_REPONSES("form_id") < 100` (fonctions serveur dans les quotas uniquement).
//   Aucune exécution de code arbitraire : analyseur dédié, évaluateur sûr.
//
// ── Theme ────────────────────────────────────────────────────
// { preset, accent (hex), background: { type: 'color'|'gradient'|'image', value },
//   font: 'inter'|'system'|'serif'|'rounded'|'mono', radius: 'none'|'sm'|'md'|'lg'|'full',
//   logo?: AttachmentRef, cover?: AttachmentRef, progressBar: 'bar'|'steps'|'none',
//   animations: boolean, density: 'compact'|'comfortable' }
//
// ── Settings ─────────────────────────────────────────────────
// { access: 'public'|'link'|'members'|'invited',  // public : référencé ; link : lien non listé
//   identity: 'anonymous'|'optional'|'required',   // required : connexion (lien e-mail)
//   opensAt?, closesAt?, maxResponses?, quotas?: [{ expr: Expr, max, message }],
//   waitlist?: boolean, onePerPerson?: boolean, allowEdit?: 'never'|'until_close'|'until_review',
//   saveDraft?: boolean, showSummary?: boolean, pdfReceipt?: boolean,
//   confirmation: { title, message, redirectUrl? },
//   notifications: { onSubmit?: string[] /* emails */, respondentReceipt?: boolean },
//   antiSpam: { turnstile: boolean, honeypot: true, rateLimitPerHour: number },
//   retentionDays?: number, consentText?: string, embed?: { allowed: boolean, origins?: string[] },
//   statuses: [{ id, label, color, final?: boolean }],   // workflow de traitement
//   vote?: VoteSettings }
//
// VoteSettings (kind 'vote') : { electoralRoll: 'members'|'list', list?: string[] (emails),
//   anonymous: true, resultsVisibility: 'after_close'|'live'|'admins',
//   quorumPercent?, majority: 'simple'|'absolute'|'two_thirds' }
//   → stockage SÉPARÉ identité / droit de vote / bulletin côté serveur (voir supabase).
//
// ── Response ─────────────────────────────────────────────────
// { id, formId, version, status (id d'un statut des settings, défaut 'received'),
//   answers: { [key]: value }, computed: { [variableKey]: value }, score?,
//   respondent?: { userId?, memberId?, email?, name? }  // absent si anonyme
//   files: AttachmentRef[], submittedAt, updatedAt, editToken? (hash côté serveur),
//   tags: string[], assignee?: memberId, notes?: [{ at, by, text }],
//   history: [{ at, by?, action, from?, to? }], waitlisted?: boolean, paymentStatus? }
// ============================================================

export const QUESTION_TYPES = [
  { type: 'short_text', label: 'Texte court', group: 'Texte', icon: 'Type' },
  { type: 'long_text', label: 'Paragraphe', group: 'Texte', icon: 'AlignLeft' },
  { type: 'name', label: 'Prénom et nom', group: 'Coordonnées', icon: 'User' },
  { type: 'email', label: 'Email', group: 'Coordonnées', icon: 'Mail' },
  { type: 'phone', label: 'Téléphone', group: 'Coordonnées', icon: 'Phone' },
  { type: 'address', label: 'Adresse', group: 'Coordonnées', icon: 'MapPin' },
  { type: 'url', label: 'Lien web', group: 'Coordonnées', icon: 'Link' },
  { type: 'single_choice', label: 'Choix unique', group: 'Choix', icon: 'CircleDot' },
  { type: 'multiple_choice', label: 'Cases à cocher', group: 'Choix', icon: 'SquareCheck' },
  { type: 'dropdown', label: 'Liste déroulante', group: 'Choix', icon: 'ChevronDownSquare' },
  { type: 'yes_no', label: 'Oui / Non', group: 'Choix', icon: 'ToggleLeft' },
  { type: 'image_choice', label: 'Choix en images', group: 'Choix', icon: 'Images' },
  { type: 'ranking', label: 'Classement', group: 'Choix', icon: 'ListOrdered' },
  { type: 'matrix', label: 'Tableau (grille)', group: 'Choix', icon: 'Grid3x3' },
  { type: 'rating', label: 'Note (étoiles)', group: 'Évaluation', icon: 'Star' },
  { type: 'scale', label: 'Échelle', group: 'Évaluation', icon: 'SlidersHorizontal' },
  { type: 'nps', label: 'Recommandation (0–10)', group: 'Évaluation', icon: 'Gauge' },
  { type: 'number', label: 'Nombre', group: 'Nombres & dates', icon: 'Hash' },
  { type: 'date', label: 'Date', group: 'Nombres & dates', icon: 'Calendar' },
  { type: 'time', label: 'Heure', group: 'Nombres & dates', icon: 'Clock' },
  { type: 'datetime', label: 'Date et heure', group: 'Nombres & dates', icon: 'CalendarClock' },
  { type: 'slots', label: 'Créneaux', group: 'Réservation', icon: 'CalendarRange' },
  { type: 'file', label: 'Fichier', group: 'Fichiers & signature', icon: 'Paperclip' },
  { type: 'signature', label: 'Signature', group: 'Fichiers & signature', icon: 'PenLine' },
  { type: 'consent', label: 'Consentement', group: 'Fichiers & signature', icon: 'ShieldCheck' },
  { type: 'member_picker', label: 'Membre du BDE', group: 'Données du BDE', icon: 'Users' },
  { type: 'event_picker', label: 'Événement', group: 'Données du BDE', icon: 'PartyPopper' },
  { type: 'payment', label: 'Paiement', group: 'Paiement', icon: 'CreditCard' },
  { type: 'calculated', label: 'Champ calculé', group: 'Avancé', icon: 'Calculator' },
  { type: 'hidden', label: 'Champ caché', group: 'Avancé', icon: 'EyeOff' },
];

export const QUESTION_TYPE_IDS = new Set(QUESTION_TYPES.map(t => t.type));

export const FORM_KINDS = [
  { id: 'standard', label: 'Formulaire' },
  { id: 'registration', label: 'Inscription à un événement' },
  { id: 'application', label: 'Candidature' },
  { id: 'vote', label: 'Vote / élection' },
  { id: 'booking', label: 'Réservation de créneaux' },
  { id: 'quiz', label: 'Quiz / questionnaire noté' },
  { id: 'survey', label: 'Enquête de satisfaction' },
];

export const DEFAULT_STATUSES = [
  { id: 'received', label: 'Reçu', color: 'blue' },
  { id: 'in_review', label: 'En cours', color: 'amber' },
  { id: 'waiting', label: 'En attente', color: 'zinc' },
  { id: 'accepted', label: 'Validé', color: 'emerald', final: true },
  { id: 'rejected', label: 'Refusé', color: 'red', final: true },
];

export const KEY_RX = /^[a-z][a-z0-9_]{0,48}$/;
