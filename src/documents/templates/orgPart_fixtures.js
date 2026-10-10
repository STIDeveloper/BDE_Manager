// ============================================================
// JEUX DE DONNÉES DE TEST — modèles organisation / partenariats / rgpd
// ============================================================
// Contextes réalistes construits avec buildContext : catalogue par défaut
// enrichi d'un pôle et d'un rôle personnalisés, membres avec et sans
// coordonnées, échantillon de candidatures, profil complet ou minimal.
// Utilisé uniquement par les fichiers *.test.js voisins.
// ============================================================

import { createDefaultCatalog } from '../../core/catalog.js';
import { buildContext } from '../context.js';

export const TODAY = '2026-10-10';

export function fixtureCatalog() {
  const cat = createDefaultCatalog();
  cat.poles.design = { id: 'design', label: 'Design', short: 'Design', color: 'lime', emoji: '🎨', order: 9, affinity: {}, custom: true };
  cat.roles.graphiste = { id: 'graphiste', label: 'Graphiste', level: 'membre', pole: 'design', leadership: false, essential: false, capacity: 2, order: 0, aliases: [], custom: true };
  return cat;
}

export const MEMBERS = [
  { id: 'm1', firstName: 'Alice', lastName: 'Martin', email: 'alice.martin@example.org', phone: '06 12 34 56 78', mainRole: 'president', badges: ['Accès Banque'], notes: '' },
  { id: 'm2', firstName: 'Bob', lastName: 'Durand', email: 'bob.durand@example.org', mainRole: 'tresorier', badges: [], notes: '' },
  { id: 'm3', firstName: 'Clarisse', lastName: 'Petit', email: 'clarisse.petit@example.org', phone: '07 00 00 00 01', birthDate: '2005-02-14', mainRole: 'secretaire', badges: [], notes: '' },
  { id: 'm4', firstName: 'David', lastName: 'Leroy', email: 'david.leroy@example.org', mainRole: 'responsable_communication', badges: ['Accès Insta'], notes: '' },
  { id: 'm5', firstName: 'Emma', lastName: 'Moreau', email: 'emma.moreau@example.org', phone: '06 99 99 99 99', mainRole: 'graphiste', imageConsent: 'oui', badges: ['Graphiste'], notes: '' },
  { id: 'm6', firstName: 'Farid', lastName: 'Benali', email: 'farid.benali@example.org', mainRole: 'responsable_partenariats', badges: [], notes: 'Contact privilégié du sponsor principal' },
  { id: 'm7', firstName: 'Gaëlle', lastName: 'Roux', email: 'gaelle.roux@example.org', mainRole: '', legacyMainRole: 'Mascotte', badges: [], notes: '' },
  { id: 'm8', firstName: 'Adrien', lastName: 'Blanc', mainRole: 'membre_communication', birthDate: '2010-05-01', badges: ['Photographe'], notes: '' },
];

export const FOLDERS = [
  { id: 'f00', code: '00', name: 'Bureau & Stratégie', parent: null },
  { id: 'f01', code: '01', name: 'Pôle Communication', parent: null },
  { id: 'f01.3', code: '01.3', name: 'Réseaux Sociaux', parent: 'f01' },
  { id: 'f02', code: '02', name: 'Pôle Événementiel', parent: null },
];

export const PRESETS = {
  president: { f00: 'editor', f01: 'editor', f02: 'editor' },
  responsable_communication: { f01: 'editor', 'f01.3': 'editor', f02: 'reader' },
  membre_communication: { f01: 'reader', 'f01.3': 'commenter' },
};

export const CANDIDATES = [
  { id: 'c1', displayName: 'Ilona Garcia', firstName: 'Ilona', lastName: 'Garcia', email: 'ilona@example.org', phone: '0601020304', formation: 'InfoCOM', year: 'BUT 1', alternance: false, choices: ['membre_communication'], whyText: 'J\'aime la photo.', availability: 1, availabilityLabel: '🚀', submittedAt: '2026-09-20T10:00:00.000Z', signals: [] },
  { id: 'c2', displayName: 'Jules Faure', firstName: 'Jules', lastName: 'Faure', email: 'jules@example.org', phone: '', formation: 'GACO', year: 'BUT 2', alternance: true, choices: ['tresorier'], whyText: '', contributeText: 'Rigueur', availability: 0.7, submittedAt: '2026-09-21T10:00:00.000Z', signals: [{ type: 'experience', strength: 0.6, source: 'contributeText', quote: 'Rigueur' }] },
  { id: 'c3', displayName: 'Lina Haddad', firstName: 'Lina', lastName: 'Haddad', email: 'lina@example.org', formation: 'QLIO', year: 'BUT 1', choices: [], availability: 0.4, submittedAt: '2026-09-22T10:00:00.000Z', signals: [] },
];

export const FULL_ORGANIZATION = {
  name: 'BDE IUT de Montreuil',
  shortName: 'BDE Montreuil',
  address: '140 rue de la Nouvelle France',
  postalCode: '93100',
  city: 'Montreuil',
  rna: 'W931234567',
  email: 'contact@bde-montreuil.example.org',
  website: 'bde-montreuil.example.org',
  signatures: { m1: 'data:image/png;base64,iVBORw0KGgo=' },
};

/** Contexte complet (catalogue personnalisé, membres, candidats, coffre ouvert). */
export function fullContext(extra = {}) {
  const cat = fixtureCatalog();
  return buildContext({
    ...cat,
    members: MEMBERS,
    folders: FOLDERS,
    rolePresets: PRESETS,
    drivePermissions: { m1: { f00: 'editor', f01: 'editor' }, m4: { f01: 'editor', f02: 'none' }, m8: { f02: 'none' } },
    organization: FULL_ORGANIZATION,
    documentLog: [{ id: 'l1', templateId: 'attestation-adhesion', createdAt: '2026-09-15T08:00:00.000Z' }],
  }, { candidates: CANDIDATES, vaultEntryLabels: ['Instagram', 'Banque', 'Wifi local'], today: TODAY, ...extra });
}

/** Contexte minimal : profil par défaut, aucun membre, aucune donnée annexe. */
export function minimalContext() {
  return buildContext({ ...createDefaultCatalog() }, { today: TODAY });
}

/** Valeurs par défaut d'un modèle (copie locale de registry.defaultValues). */
export function defaults(template, ctx, member = null) {
  const out = {};
  (template.fields || []).forEach(f => {
    const empty = f.type === 'checkbox' ? false : ['members', 'list', 'resolutions', 'lines'].includes(f.type) ? [] : '';
    out[f.key] = typeof f.default === 'function' ? f.default(ctx, member) : (f.default ?? empty);
  });
  return out;
}

/** Construit un document avec les valeurs par défaut surchargées. */
export function build(template, ctx, values = {}, member = null) {
  return template.build(ctx, { ...defaults(template, ctx, member), ...values }, member);
}
