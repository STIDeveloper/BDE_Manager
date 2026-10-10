// Actions « membres » et « moteur d'affectation ».
import { useStore } from '../../store.js';
import { getActiveCatalog } from '../../core/catalog.js';
import { useRolesStore } from '../../roleEngine/store.js';
import { buildCandidate } from '../../roleEngine/scoring.js';
import { parseRoleLabel } from '../../roleEngine/roles.js';
import { normalizeDisplay, parseAvailability, parseSwissKnife, parseName, hashString } from '../../roleEngine/normalizer.js';
import { extractSignals } from '../../roleEngine/signals.js';
import { str, isoDay, normName, splitName, EMAIL_RX, fail, memberName, toBool, SIM_ID } from './helpers.js';

/** Id de rôle du catalogue depuis un id ou un libellé. */
function roleIdOf(v, catalog) {
  const s = str(v);
  if (!s) return '';
  if (catalog.roles?.[s]) return s;
  return parseRoleLabel(s, catalog) || '';
}

/** Membre existant : même email (sans casse) ou mêmes prénom + nom. */
export function findExistingMember(members, { email, firstName, lastName }) {
  const e = str(email).toLowerCase();
  if (e) {
    const byEmail = members.find(m => str(m.email).toLowerCase() === e);
    if (byEmail) return { member: byEmail, by: 'email' };
  }
  const full = normName(`${firstName} ${lastName}`);
  if (full && str(lastName)) {
    const byName = members.find(m => normName(`${m.firstName || ''} ${m.lastName || ''}`) === full);
    if (byName) return { member: byName, by: 'nom' };
  }
  return null;
}

const MEMBER_FIELDS = ['email', 'phone', 'program', 'year', 'joinedAt', 'birthDate'];

export const memberUpsert = {
  id: 'member.upsert',
  label: 'Créer / mettre à jour un membre',
  description: 'Crée la fiche membre depuis la réponse (dédoublonnage par email, sinon par prénom + nom) ou complète la fiche existante.',
  module: 'Membres',
  icon: 'UserPlus',
  capability: ['members', 'write'],
  params: [
    { key: 'firstName', label: 'Prénom', type: 'text', required: true, help: 'Ou laisse vide et renseigne « Nom complet ».' },
    { key: 'lastName', label: 'Nom', type: 'text' },
    { key: 'fullName', label: 'Nom complet (si prénom vide)', type: 'text' },
    { key: 'email', label: 'Email', type: 'text' },
    { key: 'phone', label: 'Téléphone', type: 'text' },
    { key: 'program', label: 'Formation', type: 'text' },
    { key: 'year', label: 'Année d\'études', type: 'text' },
    { key: 'birthDate', label: 'Date de naissance', type: 'text' },
    { key: 'mainRole', label: 'Rôle principal', type: 'role', help: 'Id ou libellé d\'un rôle du catalogue (ex. {reponse.choix_1}).' },
    { key: 'columnId', label: 'Colonne du tableau des membres', type: 'column-members' },
    { key: 'joinedAt', label: 'Date d\'adhésion', type: 'text', default: '{aujourdhui}' },
    { key: 'mode', label: 'Si le membre existe déjà', type: 'select', default: 'update', options: [
      { value: 'update', label: 'Compléter sa fiche' }, { value: 'skip', label: 'Ne rien modifier' },
    ] },
  ],
  run(p, ctx) {
    let firstName = normalizeDisplay(p.firstName);
    let lastName = normalizeDisplay(p.lastName);
    if (!firstName && str(p.fullName)) ({ firstName, lastName } = splitName(normalizeDisplay(p.fullName)));
    if (!firstName) fail('Prénom manquant : vérifie le mappage (ex. {reponse.prenom_nom.firstName}).');
    const email = str(p.email).toLowerCase();
    if (email && !EMAIL_RX.test(email)) fail(`Adresse email invalide : ${email}`);
    const state = useStore.getState();
    const catalog = getActiveCatalog();
    const payload = { firstName, lastName };
    const values = { email, phone: str(p.phone), program: str(p.program), year: str(p.year), joinedAt: isoDay(p.joinedAt), birthDate: isoDay(p.birthDate) };
    MEMBER_FIELDS.forEach(k => { if (values[k]) payload[k] = values[k]; });
    const role = roleIdOf(p.mainRole, catalog);
    if (str(p.mainRole) && !role) ctx.warn(`Rôle « ${str(p.mainRole)} » absent du catalogue : ignoré.`);
    if (role) payload.mainRole = role;
    const column = state.columns.find(c => c.id === str(p.columnId));
    const existing = findExistingMember(state.members, { email, firstName, lastName });
    const links = [{ label: 'Membres', section: 'kanban' }];

    if (existing) {
      const m = existing.member;
      ctx.outputs.memberId = m.id;
      if (p.mode === 'skip') return { ok: true, summary: `Membre déjà présent (${memberName(m)}, retrouvé par ${existing.by}) : fiche inchangée.`, links, output: { memberId: m.id, created: false } };
      // Complète uniquement les champs vides de la fiche (jamais d'écrasement).
      const patch = {};
      Object.entries(payload).forEach(([k, v]) => { if (v && !str(m[k])) patch[k] = v; });
      if (column && !m.columnId) patch.columnId = column.id;
      const fields = Object.keys(patch);
      if (ctx.simulate) return { ok: true, summary: `Retrouverait ${memberName(m)} (par ${existing.by})${fields.length ? ` et compléterait : ${fields.join(', ')}` : ' — rien à compléter'}.`, output: { memberId: m.id } };
      if (fields.length) state.updateMember(m.id, patch);
      return { ok: true, summary: `Membre existant ${memberName(m)} (retrouvé par ${existing.by})${fields.length ? ` — complété : ${fields.join(', ')}` : ' — déjà à jour'}.`, links, output: { memberId: m.id, created: false } };
    }
    if (ctx.simulate) ctx.outputs.memberId = SIM_ID;
    if (ctx.simulate) return { ok: true, output: { memberId: SIM_ID }, summary: `Créerait le membre ${firstName} ${lastName}${role ? ` (${catalog.roles[role]?.label || role})` : ''}.` };
    const id = state.addMember({ ...payload, columnId: column?.id || state.columns[0]?.id || '', notes: `Créé par l'automatisation « ${ctx.automation.name} ».` });
    ctx.outputs.memberId = id;
    return { ok: true, summary: `Membre créé : ${firstName} ${lastName}${role ? ` (${catalog.roles[role]?.label || role})` : ''}.`, links, output: { memberId: id, created: true } };
  },
};

/** Construit un candidat au format du moteur (src/roleEngine/types.js). */
export function candidateFromParams(p, { submittedAt } = {}) {
  const catalog = getActiveCatalog();
  const fullName = normalizeDisplay(p.fullName);
  if (!fullName) fail('Nom du candidat manquant (ex. {reponse.prenom_nom}).');
  const email = str(p.email).toLowerCase();
  // Choix : id du catalogue ou libellé → libellé brut (rawChoices), dédoublonné par id.
  const seen = new Set();
  const rawChoices = [];
  [p.choice1, p.choice2, p.choice3].forEach(v => {
    const s = str(v);
    if (!s) return;
    const label = catalog.roles?.[s]?.label || s;
    const canon = parseRoleLabel(label, catalog) || normName(label);
    if (seen.has(canon)) return;
    seen.add(canon);
    rawChoices.push(label);
  });
  const rawRow = {
    fullName, email, phone: str(p.phone), formation: str(p.formation),
    alternance: toBool(p.alternance) ? 'Oui' : 'Non', year: str(p.year),
    whyText: str(p.whyText), discoverText: str(p.discoverText), contributeText: str(p.contributeText),
    availabilityRaw: str(p.availability), swissKnifeRaw: str(p.swissKnife),
  };
  const { firstName, lastName } = parseName(fullName);
  const parsed = {
    id: email ? hashString(email) : hashString(fullName.toLowerCase()),
    displayName: fullName, firstName, lastName,
    availability: parseAvailability(rawRow.availabilityRaw),
    swissKnife: parseSwissKnife(rawRow.swissKnifeRaw),
    submittedAt: submittedAt || new Date().toISOString(),
    signals: extractSignals(rawRow),
    _dedupChoices: rawChoices,
  };
  const candidate = buildCandidate(rawRow, parsed, catalog);
  const unknown = rawChoices.filter(l => !parseRoleLabel(l, catalog));
  return { candidate, unknown };
}

export const candidateAdd = {
  id: 'recruitment.addCandidate',
  label: 'Ajouter au moteur d\'affectation',
  description: 'Ajoute (ou met à jour) le candidat dans le moteur d\'affectation des rôles : choix de rôles convertis en ids du catalogue, disponibilité, motivations.',
  module: 'Recrutement',
  icon: 'Sparkles',
  capability: ['recruitment', 'write'],
  params: [
    { key: 'fullName', label: 'Prénom et nom', type: 'text', required: true, default: '{reponse.prenom_nom}' },
    { key: 'email', label: 'Email', type: 'text', default: '{reponse.email}' },
    { key: 'phone', label: 'Téléphone', type: 'text', default: '{reponse.telephone}' },
    { key: 'formation', label: 'Formation', type: 'text', default: '{reponse.formation}' },
    { key: 'alternance', label: 'En alternance (Oui/Non)', type: 'text', default: '{reponse.alternance|libelle}' },
    { key: 'year', label: 'Année (BUT 1, BUT 2, BUT 3, Master)', type: 'text', default: '{reponse.annee}' },
    { key: 'choice1', label: '1er choix de rôle', type: 'text', default: '{reponse.choix_1}' },
    { key: 'choice2', label: '2e choix de rôle', type: 'text', default: '{reponse.choix_2}' },
    { key: 'choice3', label: '3e choix de rôle', type: 'text', default: '{reponse.choix_3}' },
    { key: 'whyText', label: 'Motivation', type: 'textarea', default: '{reponse.pourquoi}' },
    { key: 'discoverText', label: 'À découvrir', type: 'textarea', default: '{reponse.decouvrir}' },
    { key: 'contributeText', label: 'Apport', type: 'textarea', default: '{reponse.apporter}' },
    { key: 'availability', label: 'Disponibilité (libellé)', type: 'text', default: '{reponse.rythme|libelle}' },
    { key: 'swissKnife', label: 'Couteau suisse (libellé)', type: 'text', default: '{reponse.couteau_suisse|libelle}' },
  ],
  run(p, ctx) {
    const { candidate, unknown } = candidateFromParams(p, { submittedAt: ctx.response?.submittedAt });
    if (unknown.length) ctx.warn(`Choix non reconnus par le catalogue : ${unknown.join(', ')}.`);
    if (!candidate.choices.length) ctx.warn('Aucun choix de rôle reconnu : le candidat ne pourra pas être affecté.');
    const rs = useRolesStore.getState();
    const exists = rs.candidates.some(c => c.id === candidate.id);
    const labels = candidate.choices.map(id => getActiveCatalog().roles?.[id]?.label || id).join(' › ') || 'aucun choix';
    ctx.outputs.candidateId = candidate.id;
    if (ctx.simulate) return { ok: true, summary: `${exists ? 'Mettrait à jour' : 'Ajouterait'} le candidat ${candidate.displayName} (${labels}).`, output: { candidateId: candidate.id } };
    const record = { ...candidate, source: 'formulaire', responseId: ctx.response?.id || undefined };
    if (typeof rs.upsertCandidate === 'function') rs.upsertCandidate(record);
    else {
      // Pas encore d'API dédiée dans le moteur : même effet que l'import CSV
      // (liste remplacée puis recalcul des scénarios).
      useRolesStore.setState(s => ({ candidates: [...s.candidates.filter(c => c.id !== candidate.id), record], importedAt: s.importedAt || new Date().toISOString() }));
      useRolesStore.getState().recompute();
    }
    return { ok: true, summary: `Candidat ${exists ? 'mis à jour' : 'ajouté'} dans le moteur : ${candidate.displayName} (${labels}).`, links: [{ label: 'Moteur d\'affectation', section: 'org' }], output: { candidateId: candidate.id, created: !exists } };
  },
};
