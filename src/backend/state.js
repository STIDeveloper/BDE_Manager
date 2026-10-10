// ============================================================
// ÉTAT DU BACKEND (léger, sans dépendance à Supabase)
// ============================================================
// Lu par l'indicateur d'en-tête (SyncStatusBadge) et l'écran « Équipe &
// accès ». Le moteur (engine.js, chargé à la demande) le met à jour.
//
// status :
//   'local'    : aucun espace connecté, données uniquement sur cet appareil
//   'starting' : connexion au serveur en cours
//   'synced'   : à jour avec l'espace
//   'syncing'  : envoi / réception en cours (pending = modifications en attente)
//   'offline'  : hors ligne — les modifications sont gardées et renvoyées
//   'error'    : erreur (détail dans `error`)
//   'follower' : un autre onglet de ce navigateur synchronise
// ============================================================

import { create } from 'zustand';

export const useBackendState = create(() => ({
  configured: false,
  ready: false,            // moteur initialisé (session lue)
  user: null,              // { id, email }
  recovery: false,         // retour d'un lien « mot de passe oublié »
  workspaceId: null,
  workspaceName: '',
  role: null,              // rôle d'accès dans l'espace
  memberId: null,          // fiche membre du BDE liée au compte
  status: 'local',
  pending: 0,
  lastSyncAt: null,
  error: null,
  progress: null,          // { label, done, total } pendant une migration
}));

export const setBackendState = (patch) => useBackendState.setState(patch);

export const STATUS_META = {
  local: { label: 'Mode local', tone: 'neutral', hint: 'Données enregistrées uniquement sur cet appareil.' },
  starting: { label: 'Connexion…', tone: 'brand', hint: 'Connexion au serveur en cours.' },
  synced: { label: 'Synchronisé', tone: 'emerald', hint: 'Toutes les modifications sont enregistrées sur le serveur.' },
  syncing: { label: 'Synchronisation…', tone: 'brand', hint: 'Envoi ou réception de modifications.' },
  offline: { label: 'Hors ligne', tone: 'amber', hint: 'Les modifications sont gardées et seront envoyées au retour de la connexion.' },
  error: { label: 'Erreur de synchro', tone: 'rose', hint: 'La synchronisation a rencontré une erreur.' },
  follower: { label: 'Synchronisé (autre onglet)', tone: 'emerald', hint: 'Un autre onglet de ce navigateur assure la synchronisation.' },
};
