/**
 * Tests du moteur piloté par le catalogue (src/core/catalog.js).
 * Chaque test passe un catalogue EXPLICITE (opts.catalog) : aucun état global,
 * sauf le dernier test qui vérifie la lecture du catalogue actif puis le restaure.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  importResponses, computeAssignments, compareAllScenarios, checkStability,
  explainAssignment, explainVacant, generateScenarioReport, computePoleTargets,
  DEFAULT_CAPACITIES, DEFAULT_WEIGHTS, DEFAULT_PENALTIES,
} from '../index.js';
import { parseRoleLabel, buildSlots } from '../roles.js';
import { buildScoreMatrix, computeScore } from '../scoring.js';
import { evaluateConstraints } from '../constraints.js';
import { buildAssignmentsRows } from '../exportOrgChart.js';
import { getCatalogRoles } from '../config.js';
import {
  DEFAULT_CATALOG, createDefaultCatalog, normalizeCatalog, setActiveCatalog, getActiveCatalog,
} from '../../core/catalog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const realCsv = fs.readFileSync(path.join(__dirname, 'real_responses.csv'), 'utf-8');
const sampleCsv = fs.readFileSync(path.join(__dirname, 'sample.csv'), 'utf-8');

const HEADER = '"Horodateur","Prénom et NOM","Téléphone","Email","Formation","Alternance","Année","1er choix","2e choix","3e choix","Pourquoi","Rôle à découvrir","Apporter","Rythme","Couteau suisse"';
const row = (name, email, c1, c2 = '', c3 = '', opts = {}) =>
  `"2026/09/27 6:57:16 PM UTC+3","${name}","0600000000","${email}","${opts.formation || 'InfoCOM'}","Non","${opts.year || 'BUT 3'}","${c1}","${c2}","${c3}","${opts.why || 'Je veux diriger et coordonner ce pôle avec passion et rigueur'}","","${opts.contrib || 'Mon énergie et mes idées pour le BDE'}","🚀 Dispo et réactif tous les jours","🔥 Carrément"`;
const csvOf = (...rows) => [HEADER, ...rows].join('\n');

/** Catalogue par défaut + pôle « Créatif » + rôle « Responsable Design » (capacité 2). */
function designCatalog() {
  const raw = createDefaultCatalog();
  raw.poles.creatif = { id: 'creatif', label: 'Créatif', short: 'Créa', color: 'pink', emoji: '🎨', order: 9, affinity: { InfoCOM: 0.9 } };
  raw.roles.responsable_design = {
    id: 'responsable_design', label: 'Responsable Design', pole: 'creatif', level: 'responsable',
    leadership: true, essential: false, capacity: 2, order: 0, aliases: ['Respo DA', '🎨 Design & Direction artistique'],
  };
  return normalizeCatalog(raw);
}

/** Copie modifiable du catalogue par défaut. */
const cloneDefault = () => normalizeCatalog(createDefaultCatalog());

const roleMap = (scenario) => Object.fromEntries(
  scenario.assignments.filter(a => a.candidateId).map(a => [a.candidateId, a.roleId]));

// ============================================================
// 1. parseRoleLabel — régressions (ordre des motifs)
// ============================================================

test('[CAT-1] parseRoleLabel : vice-président n\'est plus confondu avec président', () => {
  const cases = {
    'Vice-Président(e)': 'vice_president',
    'vice président': 'vice_president',
    'Vice-présidente': 'vice_president',
    'VICE PRESIDENT': 'vice_president',
    'Président adjoint': 'vice_president',
    'Présidente adjointe': 'vice_president',
    'Président(e)': 'president',
    'présidente': 'president',
    'Secrétaire adjoint': 'secretaire_adjoint',
    'Secrétaire adjoint(e)': 'secretaire_adjoint',
    'Secrétaire adjointe': 'secretaire_adjoint',
    'Secrétaire': 'secretaire',
    'Trésorière': 'tresorier',
    'Respo E-Sport': 'responsable_esport',
    'respo esport': 'responsable_esport',
    'Responsable Sport': 'responsable_sport',
    'Respo sport': 'responsable_sport',
    'Membre E-sport': 'membre_esport',
    'Membre Sport': 'membre_sport',
    'Respo com interne': 'responsable_communication_interne',
    'Responsable Communication Interne': 'responsable_communication_interne',
    'Responsable Com. Interne': 'responsable_communication_interne',
    'Respo com': 'responsable_communication',
    'Responsable Communication': 'responsable_communication',
    'Membre Com. Interne': 'membre_communication_interne',
    'Membre com': 'membre_communication',
    'Respo Partenariat': 'responsable_partenariats',
    'Membre Projet': 'membre_projets',
  };
  Object.entries(cases).forEach(([raw, expected]) => {
    assert.equal(parseRoleLabel(raw, DEFAULT_CATALOG), expected, `"${raw}"`);
  });
  assert.equal(parseRoleLabel('', DEFAULT_CATALOG), null);
  assert.equal(parseRoleLabel('Chef cuisinier', DEFAULT_CATALOG), null);
});

test('[CAT-2] parseRoleLabel : un motif intégré ne renvoie qu\'un rôle existant', () => {
  const cat = cloneDefault();
  delete cat.roles.vice_president;
  // Surtout pas « president » : le VP supprimé n'est pas reconnu
  assert.equal(parseRoleLabel('Vice-Président(e)', cat), null);
  assert.equal(parseRoleLabel('Président(e)', cat), 'president');
});

test('[CAT-3] import : VP + Président au choix restent 2 vœux distincts (dédoublonnage par id)', () => {
  const { candidates } = importResponses(sampleCsv, { catalog: DEFAULT_CATALOG });
  const adrien = candidates.find(c => c.firstName === 'Adrien');
  const sophia = candidates.find(c => c.firstName === 'Sophia');
  assert.equal(adrien.choices[0], 'vice_president');
  assert.deepEqual(sophia.choices, ['vice_president', 'responsable_projets', 'president']);
});

// ============================================================
// 2. Catalogue personnalisé : pôle « Créatif » + « Responsable Design »
// ============================================================

test('[CAT-4] buildSlots : rôle personnalisé de capacité 2 → 2 slots', () => {
  const cat = designCatalog();
  const slots = buildSlots(undefined, cat).filter(s => s.roleId === 'responsable_design');
  assert.deepEqual(slots.map(s => s.id), ['responsable_design#1', 'responsable_design#2']);
  // Map de capacités figée sans le nouveau rôle → capacité du catalogue
  assert.equal(buildSlots(DEFAULT_CAPACITIES, cat).filter(s => s.roleId === 'responsable_design').length, 2);
  // Capacité explicite prioritaire
  assert.equal(buildSlots({ ...DEFAULT_CAPACITIES, responsable_design: 1 }, cat).filter(s => s.roleId === 'responsable_design').length, 1);
  // Catalogue par défaut : rôle inconnu
  assert.equal(buildSlots(undefined, DEFAULT_CATALOG).filter(s => s.roleId === 'responsable_design').length, 0);
});

test('[CAT-5] parseRoleLabel : libellé et alias d\'un rôle personnalisé reconnus', () => {
  const cat = designCatalog();
  assert.equal(parseRoleLabel('Responsable Design', cat), 'responsable_design');
  assert.equal(parseRoleLabel('  responsable   DESIGN ', cat), 'responsable_design');
  assert.equal(parseRoleLabel('Respo DA', cat), 'responsable_design');
  assert.equal(parseRoleLabel('🎨 Design & Direction artistique', cat), 'responsable_design');
  assert.equal(parseRoleLabel('Responsable Design', DEFAULT_CATALOG), null);
  // Un alias peut surcharger un motif intégré
  const cat2 = designCatalog();
  cat2.roles.membre_projets.aliases = ['Respo Com'];
  assert.equal(parseRoleLabel('Respo Com', cat2), 'membre_projets');
});

test('[CAT-6] pipeline complet avec « Responsable Design » : import, placement, alertes, explications', () => {
  const cat = designCatalog();
  const csv = csvOf(
    row('Alice DESIGN', 'alice@test.fr', 'Responsable Design', 'Membre Communication'),
    row('Bruno GRAPHISTE', 'bruno@test.fr', 'Respo DA'),
    row('Clarisse COM', 'clarisse@test.fr', 'Membre Communication'),
  );
  const { candidates } = importResponses(csv, { catalog: cat });
  const alice = candidates.find(c => c.firstName === 'Alice');
  const bruno = candidates.find(c => c.firstName === 'Bruno');
  assert.deepEqual(alice.choices, ['responsable_design', 'membre_communication']);
  assert.deepEqual(bruno.choices, ['responsable_design']);

  // Plancher de pôle élevé → alerte « sous-doté » sur Créatif (2 places, cible 4)
  const scenario = computeAssignments(candidates, {
    catalog: cat, poleTargets: { minPoleSize: 4, weightByDemand: 0.7, weightByCapacity: 0.3 },
  });
  const design = scenario.assignments.filter(a => a.roleId === 'responsable_design' && a.candidateId);
  assert.deepEqual(design.map(a => a.candidateId).sort(), [alice.id, bruno.id].sort());
  assert.equal(scenario.poleSizes.creatif, 2);
  assert.ok('creatif' in scenario.poleTargets);

  // Alertes : refs = id de pôle, titres = libellés
  const poleAlerts = scenario.alerts.filter(a => (a.refs || []).includes('creatif'));
  assert.ok(poleAlerts.length > 0, 'Aucune alerte sur le pôle Créatif');
  poleAlerts.forEach(a => {
    assert.ok(a.title.includes('Créatif'), a.title);
    assert.ok(!a.title.includes('creatif'), a.title);
  });

  // Explication d'une affectation : libellé du rôle
  const ex = explainAssignment(design[0], alice.id === design[0].candidateId ? alice : bruno, { catalog: cat });
  assert.ok(ex.headline.includes('→ Responsable Design'), ex.headline);

  // Rapport + export CSV : pôle par libellé
  const report = generateScenarioReport(scenario, candidates, { catalog: cat });
  assert.ok(report.includes('Créatif'));
  const rows = buildAssignmentsRows(scenario, candidates, { catalog: cat });
  assert.ok(rows.some(r => r[2] === 'Responsable Design' && r[3] === 'Créatif'));
});

test('[CAT-7] poste personnalisé vacant : alerte « danger » (niveau responsable) + explication libellée', () => {
  const cat = designCatalog();
  const { candidates } = importResponses(csvOf(row('Clarisse COM', 'clarisse@test.fr', 'Membre Communication')), { catalog: cat });
  const scenario = computeAssignments(candidates, { catalog: cat });
  const vac = scenario.alerts.find(a => a.code === 'vacant_role' && a.refs[0] === 'responsable_design');
  assert.ok(vac, 'Alerte vacant manquante');
  assert.equal(vac.severity, 'danger');
  assert.equal(vac.title, 'Poste vacant : Responsable Design');
  const exv = explainVacant('responsable_design', 1, candidates, new Set(), { catalog: cat });
  assert.ok(exv.headline.startsWith('Responsable Design #1'));
  assert.ok(exv.caveats[0].includes('"Créatif"'), exv.caveats[0]);
  assert.ok(exv.caveats[0].includes('"Responsable"'), exv.caveats[0]);
});

// ============================================================
// 3. Renommage : les ids ne bougent pas → affectations identiques
// ============================================================

test('[CAT-8] renommer des rôles / pôles conserve les affectations', () => {
  const base = cloneDefault();
  const renamed = cloneDefault();
  renamed.roles.president.label = 'Président(e) du BDE';
  renamed.roles.responsable_communication.label = 'Responsable Communication & Réseaux';
  renamed.roles.membre_projets.label = 'Membre Projets & Events';
  renamed.poles.communication.label = 'Com & Réseaux';

  const { candidates } = importResponses(realCsv, { catalog: base });
  // Le CSV historique reste reconnu sous le catalogue renommé (motifs intégrés)
  const { candidates: candidates2 } = importResponses(realCsv, { catalog: renamed });
  assert.deepEqual(candidates2.map(c => c.choices), candidates.map(c => c.choices));

  const before = computeAssignments(candidates, { catalog: base });
  const after = computeAssignments(candidates, { catalog: renamed });
  assert.deepEqual(roleMap(after), roleMap(before));
  assert.equal(after.globalScore, before.globalScore);
  assert.deepEqual(after.poleSizes, before.poleSizes);

  // Les textes suivent le nouveau libellé
  const report = generateScenarioReport(after, candidates, { catalog: renamed });
  assert.ok(report.includes('Com & Réseaux'));
  const holder = after.assignments.find(a => a.roleId === 'president' && a.candidateId);
  const c = candidates.find(x => x.id === holder.candidateId);
  assert.ok(explainAssignment(holder, c, { catalog: renamed }).headline.endsWith('Président(e) du BDE'));
});

// ============================================================
// 4. Capacité 0, rôles supprimés, références pendantes
// ============================================================

test('[CAT-9] capacité 0 : aucun slot, aucun placement, pas de cible de pôle', () => {
  const cat = cloneDefault();
  cat.roles.membre_sport.capacity = 0;
  cat.roles.responsable_sport.capacity = 0;
  assert.equal(buildSlots(undefined, cat).filter(s => s.roleId.endsWith('_sport') && !s.roleId.includes('esport')).length, 0);

  const { candidates } = importResponses(realCsv, { catalog: cat });
  const scenario = computeAssignments(candidates, { catalog: cat });
  assert.ok(!scenario.assignments.some(a => (a.roleId === 'membre_sport' || a.roleId === 'responsable_sport')));
  assert.equal(scenario.poleSizes.sport, 0);
  assert.ok(!('sport' in scenario.poleTargets), 'Un pôle sans capacité ne doit pas avoir de cible');
  assert.ok(!scenario.alerts.some(a => a.code === 'pole_underpopulated' && a.refs[0] === 'sport'));
  // Capacité 0 passée explicitement par l'appelant
  const s2 = computeAssignments(candidates, { catalog: DEFAULT_CATALOG, capacities: { ...DEFAULT_CAPACITIES, membre_sport: 0 } });
  assert.ok(!s2.assignments.some(a => a.roleId === 'membre_sport'));
});

test('[CAT-10] rôle supprimé référencé par contraintes / verrous / choix : ignoré, sans plantage', () => {
  const full = cloneDefault();
  const cat = cloneDefault();
  delete cat.roles.tresorier;
  delete cat.roles.membre_esport;

  // Candidats importés AVANT la suppression (leurs choix contiennent 'tresorier')
  const { candidates } = importResponses(realCsv, { catalog: full });
  const bilal = candidates.find(c => c.firstName.toLowerCase().includes('bilal'));
  assert.deepEqual(bilal.choices, ['tresorier']);

  const constraints = {
    forcedRoles: { bilal: 'tresorier' },
    maxLevels: { ferrandi: 'niveau_supprime' },
    forbiddenRoles: { hachemi: ['tresorier', 'role_fantome'] },
    preferredRoles: { hachemi: 'membre_esport' },
    forceScore: 100, preferredBonus: 8, forbiddenPenalty: 100,
  };
  const lockedPairs = new Set([`${bilal.id}:tresorier#1`, `${candidates[0].id}:membre_esport#2`]);
  const opts = { catalog: cat, constraints, lockedPairs };

  const scenario = computeAssignments(candidates, opts);
  const { scenarios } = compareAllScenarios(candidates, opts);
  const stab = checkStability(candidates, { ...opts, iterations: 5 });
  assert.equal(scenarios.length, 3);
  assert.ok(stab.stability instanceof Map);
  [scenario, ...scenarios].forEach(s => {
    assert.ok(!s.assignments.some(a => a.roleId === 'tresorier' || a.roleId === 'membre_esport'));
    generateScenarioReport(s, candidates, { catalog: cat });
  });

  // Le forçage vers un rôle supprimé ne bloque PAS Bilal sur les autres rôles
  const roleMembre = cat.roles.membre_communication;
  assert.equal(evaluateConstraints(bilal, roleMembre, constraints, cat).action, null);
  assert.equal(evaluateConstraints(bilal, roleMembre, constraints, full).action, 'block');
  // Plafond vers un niveau supprimé : ignoré
  const ferrandi = candidates.find(c => c.firstName.toLowerCase().includes('ferrandi') || c.lastName.toLowerCase().includes('ferrandi'));
  assert.equal(evaluateConstraints(ferrandi, cat.roles.president, constraints, cat).action, null);

  // Explication d'une affectation périmée (rôle supprimé depuis le calcul)
  const stale = { candidateId: bilal.id, slotId: 'tresorier#1', roleId: 'tresorier', score: null, locked: false, vacant: false };
  const ex = explainAssignment(stale, bilal, { catalog: cat });
  assert.ok(ex.headline.includes('rôle supprimé'));
  assert.equal(explainVacant('tresorier', 1, candidates, new Set(), { catalog: cat }), null);

  // Choix pendants ignorés par les cibles de pôle
  const targets = computePoleTargets(candidates, undefined, undefined, cat);
  assert.ok(targets instanceof Map && targets.size > 0);
});

// ============================================================
// 5. Niveaux personnalisés
// ============================================================

test('[CAT-11] niveau personnalisé de type « responsable » = même scoring que Responsable', () => {
  const cat = cloneDefault();
  cat.levels.chef = { id: 'chef', label: 'Chef de projet', order: 2.5, requirement: 0.7, kind: 'responsable' };
  cat.roles.responsable_projets.level = 'chef';

  const { candidates } = importResponses(realCsv, { catalog: DEFAULT_CATALOG });
  const role = DEFAULT_CATALOG.roles.responsable_projets;
  const roleChef = cat.roles.responsable_projets;
  candidates.forEach(c => {
    const a = computeScore(c, role, DEFAULT_WEIGHTS, DEFAULT_PENALTIES, undefined, DEFAULT_CATALOG);
    const b = computeScore(c, roleChef, DEFAULT_WEIGHTS, DEFAULT_PENALTIES, undefined, cat);
    assert.equal(b.total, a.total, `Score différent pour ${c.firstName}`);
    assert.deepEqual(b.penaltyReasons, a.penaltyReasons);
  });

  // Contre-épreuve : un niveau de type « membre » change bien le scoring
  const catMembre = cloneDefault();
  catMembre.levels.chef = { id: 'chef', label: 'Chef', order: 2.5, requirement: 0.7, kind: 'membre' };
  catMembre.roles.responsable_projets.level = 'chef';
  const diff = candidates.some(c =>
    computeScore(c, catMembre.roles.responsable_projets, DEFAULT_WEIGHTS, DEFAULT_PENALTIES, undefined, catMembre).total
    !== computeScore(c, role, DEFAULT_WEIGHTS, DEFAULT_PENALTIES, undefined, DEFAULT_CATALOG).total);
  assert.ok(diff);

  // Affectations identiques avec le niveau personnalisé de type responsable
  assert.deepEqual(
    roleMap(computeAssignments(candidates, { catalog: cat })),
    roleMap(computeAssignments(candidates, { catalog: DEFAULT_CATALOG })));
});

test('[CAT-12] maxLevels : plafond comparé via levelRank (ordre du catalogue)', () => {
  const { candidates } = importResponses(realCsv, { catalog: DEFAULT_CATALOG });
  const ferrandi = candidates.find(c => `${c.firstName} ${c.lastName}`.toLowerCase().includes('ferrandi'));
  assert.ok(ferrandi);
  const constraints = { forcedRoles: {}, maxLevels: { ferrandi: 'adjoint' }, forbiddenRoles: {}, preferredRoles: {}, forceScore: 100, preferredBonus: 8 };
  const R = DEFAULT_CATALOG.roles;
  const act = (role, cat = DEFAULT_CATALOG) => evaluateConstraints(ferrandi, role, constraints, cat).action;
  assert.equal(act(R.president), 'block');
  assert.equal(act(R.responsable_projets), 'block');
  assert.equal(act(R.secretaire_adjoint), null);
  assert.equal(act(R.membre_projets), null);

  // Niveau « adjoint » remonté entre Bureau et Responsable → Responsable autorisé
  const cat = cloneDefault();
  cat.levels.adjoint.order = 1.5;
  assert.equal(act(cat.roles.president, cat), 'block');
  assert.equal(act(cat.roles.responsable_projets, cat), null);

  // Effet bout-en-bout : Ferrandi jamais placé au-dessus du plafond
  const scenario = computeAssignments(candidates, { catalog: DEFAULT_CATALOG, constraints });
  const a = scenario.assignments.find(x => x.candidateId === ferrandi.id);
  if (a.roleId) assert.ok(['adjoint', 'membre'].includes(DEFAULT_CATALOG.roles[a.roleId].level));
});

// ============================================================
// 6. Catalogue actif (getActiveCatalog) utilisé par défaut
// ============================================================

test('[CAT-13] sans option, le moteur lit le catalogue actif', () => {
  const previous = getActiveCatalog();
  try {
    setActiveCatalog(designCatalog());
    assert.equal(parseRoleLabel('Responsable Design'), 'responsable_design');
    assert.ok(getCatalogRoles().some(r => r.id === 'responsable_design'));
    const { candidates } = importResponses(csvOf(row('Alice DESIGN', 'alice@test.fr', 'Responsable Design')));
    assert.deepEqual(candidates[0].choices, ['responsable_design']);
    const s = computeAssignments(candidates);
    assert.equal(s.assignments.find(a => a.candidateId === candidates[0].id).roleId, 'responsable_design');
    // Matrice : toutes les colonnes du catalogue actif
    const m = buildScoreMatrix(candidates, null, DEFAULT_WEIGHTS, DEFAULT_PENALTIES);
    assert.ok(m.get(candidates[0].id).has('responsable_design'));
  } finally {
    setActiveCatalog(previous);
  }
  assert.equal(parseRoleLabel('Responsable Design'), null);
});
