// ============================================================
// ÉLECTIONS — interprétation des résultats (module PUR)
// ============================================================
// Entrée : la réponse de la RPC vote_results (agrégats anonymes) et la
// définition du vote. Sortie : pour chaque question, son type de scrutin,
// les voix, les blancs, l'issue selon la majorité choisie et les égalités.
// Les règles de majorité et de quorum sont celles du Studio documents
// (src/documents/templates/governanceMath.js) : importées, jamais recopiées,
// pour que l'écran et le procès-verbal disent exactement la même chose.
// ============================================================

import {
  computeQuorum, resolutionOutcome, majorityRuleText, toCount,
} from '../../documents/templates/governanceMath.js';

/** Majorité du formulaire (VoteSettings) → majorité du PV (governanceMath). */
export const MAJORITY_TO_PV = { simple: 'simple', absolute: 'absolue', two_thirds: 'deux_tiers' };
export const MAJORITY_LABELS = {
  simple: 'Majorité simple',
  absolute: 'Majorité absolue',
  two_thirds: 'Majorité des deux tiers',
};
export const pvMajority = (m) => MAJORITY_TO_PV[m] || 'simple';

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const BLANK_RX = /^(vote )?(blanc|nul)$|^bulletin (blanc|nul)$|^je vote blanc$/;
const isBlankOption = (o) => BLANK_RX.test(norm(o?.label)) || BLANK_RX.test(norm(o?.value));

function roleOf(o) {
  const l = norm(o?.label || o?.value);
  if (/^(pour|oui|yes|favorable)$/.test(l)) return 'for';
  if (/^(contre|non|no|defavorable)$/.test(l)) return 'against';
  if (/^abstention$|^je m'abstiens$|^abstiens$/.test(l)) return 'abstention';
  if (isBlankOption(o)) return 'blank';
  return null;
}

/**
 * Question « résolution » : Oui/Non, ou choix unique Pour / Contre /
 * Abstention (± vote blanc), sans autre option.
 */
export function isResolution(q) {
  if (q.type === 'yes_no') return true;
  if (!['single_choice', 'dropdown'].includes(q.type)) return false;
  const roles = (q.options || []).map(roleOf);
  return roles.length >= 2 && roles.every(Boolean) && roles.includes('for') && roles.includes('against');
}

/** Ex aequo en tête (valeurs triées décroissantes). */
function leaders(list, score) {
  if (!list.length) return [];
  const top = score(list[0]);
  if (!(top > 0)) return [];
  return list.filter(o => score(o) === top);
}

/**
 * Analyse d'une question.
 * @param {object} q        question des résultats serveur
 * @param {object} ctx      { ballots, majority ('simple'|'absolute'|'two_thirds'), quorumReached }
 */
export function analyzeQuestion(q, { ballots = 0, majority = 'simple', quorumReached = true } = {}) {
  const ballotCount = toCount(ballots);
  const options = (Array.isArray(q.options) ? q.options : []).map(o => ({
    value: String(o.value), label: o.label || String(o.value), count: toCount(o.count), points: o.points === undefined ? null : toCount(o.points),
  }));
  const noAnswer = Math.max(0, ballotCount - toCount(q.expressed));
  const pv = pvMajority(majority);

  // ── Résolution : pour / contre / abstention ──
  if (isResolution(q)) {
    let pour = 0; let contre = 0; let abst = 0; let blankOpt = 0;
    if (q.type === 'yes_no') {
      pour = options.find(o => o.value === 'yes')?.count || 0;
      contre = options.find(o => o.value === 'no')?.count || 0;
    } else {
      options.forEach(o => {
        const r = roleOf(o);
        if (r === 'for') pour += o.count;
        else if (r === 'against') contre += o.count;
        else if (r === 'abstention') abst += o.count;
        else if (r === 'blank') blankOpt += o.count;
      });
    }
    const blank = noAnswer + blankOpt;
    // Blancs et sans réponse : non exprimés, comptés comme abstentions dans le PV.
    const outcome = resolutionOutcome({ for: pour, against: contre, abstention: abst + blank }, pv, { voters: ballotCount });
    return {
      key: q.key, label: q.label, kind: 'resolution', options, ballots: ballotCount,
      for: pour, against: contre, abstention: abst, blank, expressed: pour + contre,
      outcome, adopted: outcome.adopted && quorumReached, tie: outcome.tie, valid: quorumReached,
    };
  }

  // ── Classement (méthode de Borda, points calculés par le serveur) ──
  if (q.type === 'ranking') {
    const sorted = [...options].sort((a, b) => (b.points || 0) - (a.points || 0));
    const top = leaders(sorted, o => o.points || 0);
    return {
      key: q.key, label: q.label, kind: 'ranking', options: sorted, ballots: ballotCount, blank: noAnswer,
      expressed: toCount(q.expressed), tie: top.length > 1, winner: top.length === 1 ? top[0] : null,
      leaders: top, valid: quorumReached,
    };
  }

  // ── Choix multiple : classement par voix, pas de vainqueur unique ──
  const blankOpts = options.filter(isBlankOption);
  const candidates = options.filter(o => !isBlankOption(o)).sort((a, b) => b.count - a.count);
  if (q.type === 'multiple_choice') {
    return {
      key: q.key, label: q.label, kind: 'multi', options: candidates, ballots: ballotCount,
      blank: noAnswer + blankOpts.reduce((n, o) => n + o.count, 0), expressed: toCount(q.expressed),
      tie: false, winner: null, leaders: leaders(candidates, o => o.count), valid: quorumReached,
    };
  }

  // ── Élection (choix unique entre candidat·es / listes) ──
  const blank = noAnswer + blankOpts.reduce((n, o) => n + o.count, 0);
  const expressed = candidates.reduce((n, o) => n + o.count, 0);
  const top = leaders(candidates, o => o.count);
  const tie = top.length > 1;
  let winner = null;
  let outcome = null;
  if (top.length === 1) {
    const first = top[0];
    // Majorité simple = majorité relative (le plus de voix l'emporte) ;
    // absolue / deux tiers : mêmes règles que les résolutions du PV, appliquées
    // aux voix du/de la premier·e face à toutes les autres voix exprimées.
    outcome = pv === 'simple' ? null : resolutionOutcome({ for: first.count, against: expressed - first.count, abstention: blank }, pv, { voters: ballotCount });
    if (pv === 'simple' || outcome.adopted) winner = first;
  }
  return {
    key: q.key, label: q.label, kind: 'election', options: candidates, blankOptions: blankOpts, ballots: ballotCount,
    blank, expressed, tie, leaders: top, winner: quorumReached ? winner : null, outcome,
    noMajority: !tie && top.length === 1 && !winner, valid: quorumReached,
  };
}

/**
 * Analyse complète.
 * @param {object} results réponse de vote_results (visible: true)
 * @param {{ majority?, quorumPercent? }} [settings] VoteSettings (secours si le serveur ne les renvoie pas)
 */
export function analyzeResults(results, settings = {}) {
  const ballots = toCount(results?.ballots);
  const electorate = toCount(results?.electorate);
  const majority = results?.majority || settings.majority || 'simple';
  const quorumPercent = results?.quorum_percent ?? settings.quorumPercent ?? 0;
  const quorum = computeQuorum({ present: ballots, represented: 0, total: electorate, percent: Number(quorumPercent) || 0 });
  // Pas de quorum fixé : tout scrutin avec au moins un bulletin est valable.
  const quorumReached = quorum.noQuorum ? true : quorum.reached;
  const questions = (results?.questions || []).map(q => analyzeQuestion(q, { ballots, majority, quorumReached }));
  return {
    ballots, electorate, majority, quorum, quorumReached,
    participation: electorate > 0 ? Math.round((ballots / electorate) * 10000) / 100 : null,
    ruleText: majorityRuleText(pvMajority(majority), ballots),
    questions,
  };
}

/** Participation en direct : { voted, electorate, percent, quorum } (quorum via governanceMath). */
export function participationStatus({ voted = 0, electorate = 0 } = {}, quorumPercent = 0) {
  const v = toCount(voted);
  const e = toCount(electorate);
  const quorum = computeQuorum({ present: v, represented: 0, total: e, percent: Number(quorumPercent) || 0 });
  return { voted: v, electorate: e, percent: e > 0 ? Math.round((v / e) * 1000) / 10 : 0, quorum, remainingForQuorum: quorum.noQuorum ? 0 : Math.max(0, quorum.required - v) };
}

const voix = (n) => `${n} voix`;

/** Ligne « Élections » du PV pour une question de type élection / classement. */
export function electionLine(a) {
  if (a.kind === 'election') {
    const scores = a.options.map(o => `${o.label} : ${voix(o.count)}`).join(' ; ');
    const blanks = a.blank ? ` ; blancs ou sans réponse : ${a.blank}` : '';
    if (!a.valid) return `${a.label} : scrutin sans effet, quorum non atteint (${scores}${blanks}).`;
    if (a.tie) return `${a.label} : égalité entre ${a.leaders.map(o => o.label).join(' et ')} (${voix(a.leaders[0].count)} chacun·e) — à départager selon les statuts (${scores}${blanks}).`;
    if (a.winner) return `${a.label} : ${a.winner.label}, élu·e avec ${voix(a.winner.count)} sur ${a.expressed} suffrage(s) exprimé(s) (${scores}${blanks}).`;
    if (a.noMajority) return `${a.label} : aucun·e candidat·e n'obtient la majorité requise (${scores}${blanks}).`;
    return `${a.label} : aucun suffrage exprimé${blanks}.`;
  }
  if (a.kind === 'ranking') {
    const scores = a.options.map(o => `${o.label} : ${o.points || 0} pts`).join(' ; ');
    if (a.tie) return `${a.label} (classement, méthode de Borda) : égalité en tête entre ${a.leaders.map(o => o.label).join(' et ')} (${scores}).`;
    return `${a.label} (classement, méthode de Borda) : ${a.winner ? `${a.winner.label} en tête` : 'aucun classement exprimé'} (${scores}).`;
  }
  if (a.kind === 'multi') {
    return `${a.label} (plusieurs choix possibles) : ${a.options.map(o => `${o.label} : ${voix(o.count)}`).join(' ; ')}${a.blank ? ` ; blancs ou sans réponse : ${a.blank}` : ''}.`;
  }
  return '';
}

/**
 * Valeurs du modèle « pv-ag » préremplies depuis les résultats.
 * Le quorum du PV = votants / inscrits (présents = bulletins dans l'urne).
 */
export function buildPvValues(analysis, { title = '', date, lieu = '', type = 'ordinaire', heureOuverture = '', heureCloture = '', openedAt = '', closedAt = '' } = {}) {
  const resolutions = analysis.questions.filter(a => a.kind === 'resolution').map(a => ({
    title: a.label, text: '', for: a.for, against: a.against, abstention: a.abstention + a.blank,
  }));
  const elections = analysis.questions.filter(a => a.kind !== 'resolution').map(electionLine).filter(Boolean);
  const fmt = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' });
  };
  const period = openedAt || closedAt ? ` Le scrutin ${openedAt ? `a été ouvert le ${fmt(openedAt)}` : ''}${openedAt && closedAt ? ' et ' : ''}${closedAt ? `clos le ${fmt(closedAt)}` : ''}.` : '';
  const deroulement = [
    `Les votes${title ? ` (« ${title} »)` : ''} se sont déroulés par voie électronique, à bulletin secret, sur la plateforme de l'association.${period}`,
    `Chaque électeur·rice inscrit·e sur la liste électorale (${analysis.electorate} inscrit·e·s) s'est identifié·e par un lien de connexion personnel et n'a pu voter qu'une fois. Le serveur enregistre séparément la liste électorale, le droit de vote consommé et le bulletin, sans lien entre eux ; chaque votant·e a reçu un code de reçu permettant de vérifier que son bulletin a été compté.`,
    `${analysis.ballots} bulletin(s) ont été déposés, soit une participation de ${analysis.participation === null ? '—' : String(analysis.participation).replace('.', ',')} %. Les bulletins blancs et les questions laissées sans réponse sont comptés comme abstentions et ne sont pas des suffrages exprimés.`,
  ].join('\n\n');
  return {
    type,
    date,
    lieu,
    heureOuverture,
    heureCloture,
    presents: [],
    autresPresents: analysis.ballots,
    representes: 0,
    totalMembres: analysis.electorate,
    quorumPercent: analysis.quorum.noQuorum ? 0 : analysis.quorum.percent,
    majorite: pvMajority(analysis.majority),
    listerPresents: false,
    ordreDuJour: [
      'Ouverture du scrutin électronique et rappel des modalités de vote',
      ...analysis.questions.map(a => (a.kind === 'resolution' ? `Vote : ${a.label}` : `Élection : ${a.label}`)),
      'Clôture du scrutin et proclamation des résultats',
    ],
    deroulement,
    resolutions,
    elections,
    questionsDiverses: '',
  };
}
