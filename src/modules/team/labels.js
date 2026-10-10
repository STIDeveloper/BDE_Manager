// Libellés de l'écran « Équipe & accès ».
import { CAPABILITIES } from '../../core/permissions.js';

export const LEVEL_LABELS = {
  none: 'Aucun', read: 'Lecture', write: 'Écriture', validate: 'Validation', manage: 'Gestion',
};
export const LEVEL_ORDER = ['none', 'read', 'write', 'validate', 'manage'];

export const ROLE_LABELS = {
  owner: 'Propriétaire', bureau: 'Bureau', tresorier: 'Trésorier·e', membre: 'Membre', lecteur: 'Lecteur',
};
export const ROLE_BADGE = {
  owner: 'badge-violet', bureau: 'badge-brand', tresorier: 'badge-emerald', membre: 'badge-neutral', lecteur: 'badge-neutral',
};
export const EDITABLE_ROLES = ['bureau', 'tresorier', 'membre', 'lecteur'];

const COLLECTION_LABELS = {
  'core.members': 'Fiches membres', 'core.columns': 'Colonnes du tableau', 'core.badges': 'Badges',
  'core.poles': 'Pôles', 'core.levels': 'Niveaux', 'core.roles': 'Rôles du BDE',
  'core.folders': 'Dossiers du Drive', 'core.folderTags': 'Étiquettes du Drive',
  'core.drivePermissions': 'Accès Drive des membres', 'core.permissionNotes': 'Notes d’accès Drive',
  'core.rolePresets': 'Modèles d’accès Drive', 'core.organization': 'Profil de l’association',
  'core.documentLog': 'Registre des documents', 'core.vault': 'Coffre-fort (chiffré)',
  'recruitment.candidates': 'Candidats', 'recruitment.settings': 'Réglages du recrutement',
};

export function collectionLabel(collection) {
  if (COLLECTION_LABELS[collection]) return COLLECTION_LABELS[collection];
  const [mod, rest] = String(collection || '').split('.');
  const cap = CAPABILITIES.find(c => c.id === mod);
  return cap ? `${cap.label} › ${rest || ''}` : collection || '—';
}

export const ACTION_LABELS = {
  create: 'a créé', update: 'a modifié', delete: 'a supprimé', restore: 'a restauré',
  'workspace.create': 'a créé l’espace', 'invitation.create': 'a invité une personne',
  'invitation.accept': 'a rejoint l’espace', 'grant.set': 'a modifié un droit',
  'member.role': 'a changé un rôle d’accès', 'member.link': 'a lié un compte à une fiche',
  'member.remove': 'a retiré un membre', 'member.leave': 'a quitté l’espace',
};

export const inviteLink = (token) => `${window.location.origin}${window.location.pathname}#/team/invite/${token}`;

export function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
