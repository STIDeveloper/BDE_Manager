import { getCatalogRoles, resolveCatalog, capacityOf } from './config.js';
import { normalizeKey } from './normalizer.js';

// ============================================================
// Reconnaissance des libellés de rôles (réponses Google Form)
// ============================================================
// Ordre de résolution (parseRoleLabel) :
//  1. correspondance EXACTE (normalisée) sur le `label` ou un `aliases[]`
//     d'un rôle du catalogue → les rôles personnalisés sont reconnus sans code ;
//  2. table de motifs intégrée (synonymes historiques du BDE), qui ne renvoie
//     que des ids présents dans le catalogue ;
//  3. sinon null.
//
// ⚠️ La table est parcourue dans l'ordre : les motifs les PLUS SPÉCIFIQUES
// doivent précéder les plus généraux (vice-président avant président,
// secrétaire adjoint avant secrétaire, com interne avant com, e-sport avant sport).
const BUILTIN_PATTERNS = [
  // --- Bureau ---
  { rx: /\bvice\s?president/, id: 'vice_president' },
  { rx: /\bvp\b/, id: 'vice_president' },
  { rx: /\bpresident\w*(\s+e)?\s+adjoint/, id: 'vice_president' },   // "président adjoint" ≈ VP
  { rx: /\bpresident(e)?\b/, id: 'president' },
  { rx: /\bsecretaire\s*(e\s+)?(generale?\s+)?adjoint/, id: 'secretaire_adjoint' },
  { rx: /\bsecretaire\b/, id: 'secretaire' },
  { rx: /\btresorier/, id: 'tresorier' },

  // --- Communication (interne avant générale) ---
  { rx: /\brespo(nsable)?\s+(de\s+la\s+)?com(munication)?\s+interne/, id: 'responsable_communication_interne' },
  { rx: /\bmembre\s+(de\s+la\s+)?com(munication)?\s+interne/, id: 'membre_communication_interne' },
  { rx: /\brespo(nsable)?\s+(de\s+la\s+)?com(munication)?\b/, id: 'responsable_communication' },
  { rx: /\bmembre\s+(de\s+la\s+)?com(munication)?\b/, id: 'membre_communication' },

  // --- Projets ---
  { rx: /\brespo(nsable)?\s+projets?/, id: 'responsable_projets' },
  { rx: /\bmembre\s+projets?/, id: 'membre_projets' },

  // --- E-Sport (avant Sport) ---
  { rx: /\brespo(nsable)?\s+e\s?sport/, id: 'responsable_esport' },
  { rx: /\bmembre\s+e\s?sport/, id: 'membre_esport' },

  // --- Sport ---
  { rx: /\brespo(nsable)?\s+sport/, id: 'responsable_sport' },
  { rx: /\bmembre\s+sport/, id: 'membre_sport' },

  // --- Partenariats ---
  { rx: /\brespo(nsable)?\s+partenariat/, id: 'responsable_partenariats' },
  { rx: /\bmembre\s+partenariat/, id: 'membre_partenariats' },
];

/**
 * Convertit un libellé brut de rôle (CSV) en id canonique du catalogue.
 * @param {string} raw
 * @param {{roles:object}} [catalog]  Catalogue (défaut : catalogue actif)
 * @returns {string|null}
 */
export function parseRoleLabel(raw, catalog) {
  const k = normalizeKey(raw);
  if (!k) return null;
  const cat = resolveCatalog(catalog);
  const roles = getCatalogRoles(cat);

  // 1. Libellé ou alias exact (ordre du catalogue → déterministe)
  for (const role of roles) {
    if (normalizeKey(role.label) === k) return role.id;
  }
  for (const role of roles) {
    if ((role.aliases || []).some(a => normalizeKey(a) === k)) return role.id;
  }

  // 2. Synonymes intégrés (uniquement si le rôle existe encore)
  for (const p of BUILTIN_PATTERNS) {
    if (p.rx.test(k)) return cat.roles?.[p.id] ? p.id : null;
  }
  return null;
}

/**
 * Renvoie le rôle du catalogue à partir de son id (null si inexistant).
 */
export function getRole(roleId, catalog) {
  if (!roleId) return null;
  return resolveCatalog(catalog).roles?.[roleId] || null;
}

/**
 * Construit les slots (une instance par place disponible).
 * Les entrées de `capacities` qui ne correspondent à aucun rôle du catalogue
 * sont ignorées ; un rôle absent de `capacities` prend sa capacité catalogue.
 * @param {Object<string,number>} [capacities]  défaut : capacités du catalogue
 * @param {object} [catalog]                     défaut : catalogue actif
 * @returns {import('./types.js').Slot[]}
 */
export function buildSlots(capacities, catalog) {
  const slots = [];
  getCatalogRoles(catalog).forEach(role => {
    const cap = capacityOf(role, capacities);
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
