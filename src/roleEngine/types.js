/**
 * @typedef {Object} Candidate
 * @property {string} id            Identifiant unique (hash email normalisé)
 * @property {string} displayName   "Prénom NOM" lisible
 * @property {string} firstName
 * @property {string} lastName
 * @property {string} phone         Jamais loggé/exporté sans opt-in
 * @property {string} email         Jamais loggé/exporté sans opt-in
 * @property {string} formation     "InfoCOM" | "Informatique" | "GACO" | "QLIO" | ...
 * @property {boolean} alternance
 * @property {string} year          "BUT 1" | "BUT 2" | "BUT 3" | "Master"
 * @property {string[]} choices     1er→3e choix (normalisés, dédupliqués)
 * @property {string} whyText
 * @property {string} discoverText
 * @property {string} contributeText
 * @property {number} availability  0..1  (🚀=1, ⚖️=0.7, 🎯=0.4, ⚠️=0.1)
 * @property {number} swissKnife    0..1  (🔥=1, ⚖️=0.5, 🎯=0.1)
 * @property {string} availabilityLabel  Libellé brut (pour l'UI)
 * @property {string} swissKnifeLabel
 * @property {string} submittedAt   ISO
 * @property {Signal[]} signals
 */

/**
 * Rôle du catalogue (source de vérité : src/core/catalog.js).
 * @typedef {Object} Role
 * @property {string} id            Slug interne IMMUABLE, ex. "membre_communication"
 * @property {string} label         Libellé affiché (renommable)
 * @property {string} level         ID de niveau (comportement moteur : levelKind(catalog, level))
 * @property {string} pole          ID de pôle, ex. 'communication' (libellé : poleLabelIn(catalog, pole))
 * @property {number} capacity
 * @property {boolean} leadership
 * @property {boolean} essential
 * @property {number} order
 * @property {string[]} aliases     Libellés alternatifs reconnus à l'import CSV
 */

/**
 * @typedef {Object} Slot
 * @property {string} id
 * @property {string} roleId
 * @property {number} index       Numéro d'exemplaire (Resp. Com #1, #2)
 */

/**
 * @typedef {Object} Signal
 * @property {'ambition'|'retrait'|'experience'|'transmission'|'contrainte'|'role_pricis'|'contradiction'} type
 * @property {number} strength  0..1
 * @property {string} source    Colonne source (whyText / discoverText / contributeText)
 * @property {string} quote     Extrait textuel
 */

/**
 * @typedef {Object} ScoreBreakdown
 * @property {number} total      0..100 (après pénalités)
 * @property {number} raw        0..100 (avant pénalités)
 * @property {number} P
 * @property {number} D
 * @property {number} E
 * @property {number} A
 * @property {number} M
 * @property {number} F
 * @property {number} penalty
 * @property {string[]} penaltyReasons
 * @property {1|2|3|null} rank   Rang obtenu (1er/2e/3e), null si non demandé
 */

/**
 * @typedef {Object} Assignment
 * @property {string} candidateId
 * @property {string|null} slotId      null = non assigné
 * @property {string|null} roleId
 * @property {ScoreBreakdown|null} score
 * @property {boolean} locked
 * @property {boolean} vacant          true si c'est un slot resté vide
 */

/**
 * @typedef {Object} ScenarioResult
 * @property {string} name
 * @property {string} description
 * @property {Object} weights
 * @property {Assignment[]} assignments
 * @property {number} globalScore
 * @property {number} avgSatisfaction
 * @property {number} worstSatisfaction
 * @property {Object} poleSizes       { communication: 5, ... } (clés = ids de pôle)
 * @property {Object} poleTargets     { communication: 4, ... } (clés = ids de pôle)
 * @property {Alert[]} alerts
 */

/**
 * @typedef {Object} Alert
 * @property {'danger'|'warning'|'info'} severity
 * @property {string} code
 * @property {string} title
 * @property {string} message
 * @property {string[]} [refs]        IDs candidats / rôles / pôles concernés
 */

export {};