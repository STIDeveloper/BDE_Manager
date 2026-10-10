// ============================================================
// MODULE « ÉQUIPE & ACCÈS » — amorçage
// ============================================================
// Ce module n'a pas de données propres à synchroniser (les comptes, rôles
// d'accès et invitations vivent sur le serveur Supabase). Ce fichier est
// chargé au démarrage par src/modules/index.js : il lance le backend
// collaboratif s'il est configuré (reprise de la synchronisation, droits),
// APRÈS l'enregistrement des stores des autres modules.
// ============================================================

import { bootBackend } from '../../backend/bootstrap.js';

if (typeof window !== 'undefined') {
  setTimeout(() => { bootBackend(); }, 0);
}

export const TEAM_MODULE = 'team';
