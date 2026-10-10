import { ROLE_CATALOG, DEFAULT_CAPACITIES } from './config.js';
import { normalizeKey } from './normalizer.js';

// Dictionnaire de synonymes → id de rôle canonique
const ROLE_ALIASES = [
  // Bureau
  { rx: /\bpresident(e)?\b/, id: 'president' },
  { rx: /\bvice[\s-]?president/, id: 'vice_president' },
  { rx: /\bpresident(e)?\s*adjoint/, id: 'vice_president' },       // "président adjoint" ≈ VP
  { rx: /\bsecretaire\s*adjoint/, id: 'secretaire_adjoint' },
  { rx: /\bsecretaire\b/, id: 'secretaire' },
  { rx: /\btresorier/, id: 'tresorier' },

  // Communication
  { rx: /\bresponsable\s+communication\s+interne/, id: 'responsable_communication_interne' },
  { rx: /\brespo(nsable)?\s+com(\.)?\s+interne/, id: 'responsable_communication_interne' },
  { rx: /\bresponsable\s+communication\b/, id: 'responsable_communication' },
  { rx: /\brespo(nsable)?\s+com(munication)?\b/, id: 'responsable_communication' },
  { rx: /\bmembre\s+communication\s+interne/, id: 'membre_communication_interne' },
  { rx: /\bmembre\s+com(\.)?\s+interne/, id: 'membre_communication_interne' },
  { rx: /\bmembre\s+communication\b/, id: 'membre_communication' },
  { rx: /\bmembre\s+com(munication)?\b/, id: 'membre_communication' },

  // Projets
  { rx: /\bresponsable\s+projets?/, id: 'responsable_projets' },
  { rx: /\brespo(nsable)?\s+projets?/, id: 'responsable_projets' },
  { rx: /\bmembre\s+projets?/, id: 'membre_projets' },

  // Sport
  { rx: /\bresponsable\s+sport/, id: 'responsable_sport' },
  { rx: /\brespo(nsable)?\s+sport/, id: 'responsable_sport' },
  { rx: /\bmembre\s+sport/, id: 'membre_sport' },

  // E-Sport
  { rx: /\bresponsable\s+e[\s-]?sport/, id: 'responsable_esport' },
  { rx: /\brespo(nsable)?\s+e[\s-]?sport/, id: 'responsable_esport' },
  { rx: /\bmembre\s+e[\s-]?sport/, id: 'membre_esport' },

  // Partenariats
  { rx: /\bresponsable\s+partenariat/, id: 'responsable_partenariats' },
  { rx: /\brespo(nsable)?\s+partenariat/, id: 'responsable_partenariats' },
  { rx: /\bmembre\s+partenariat/, id: 'membre_partenariats' },
];

/**
 * Convertit un libellé brut de rôle en id canonique.
 * @param {string} raw
 * @returns {string|null}
 */
export function parseRoleLabel(raw) {
  const k = normalizeKey(raw);
  if (!k) return null;
  for (const a of ROLE_ALIASES) {
    if (a.rx.test(k)) return a.id;
  }
  return null;
}

/**
 * Renvoie le rôle du catalogue à partir de son id.
 */
export function getRole(roleId) {
  return ROLE_CATALOG.find(r => r.id === roleId) || null;
}

/**
 * Construit les slots (une instance par place disponible).
 * @param {Object<string,number>} capacities
 * @returns {import('./types.js').Slot[]}
 */
export function buildSlots(capacities = DEFAULT_CAPACITIES) {
  const slots = [];
  ROLE_CATALOG.forEach(role => {
    const cap = Math.max(0, capacities[role.id] ?? 0);
    for (let i = 0; i < cap; i++) {
      slots.push({
        id: `${role.id}#${i + 1}`,
        roleId: role.id,
        index: i + 1,
      });
    }
  });
  return slots;
}