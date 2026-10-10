// ============================================================
// ADMINISTRATION DES RÉPONSES — jeu de réponses de démonstration
// ============================================================
// OUTIL DE DÉVELOPPEMENT (bouton visible uniquement en `npm run dev`, mode
// local) : génère des réponses fictives cohérentes avec la définition
// (tous les types de questions) dans les réponses locales, pour vérifier
// le tableau, les filtres, les statistiques et les exports. Noms fictifs,
// adresses @exemple.fr, téléphones 06000000NN.
// ============================================================
import { compileForm, evaluateForm, computeScore } from '../engine/index.js';
import { statusesOf } from './analytics.js';

const FIRST = ['Camille', 'Lina', 'Adrien', 'Yanis', 'Ilona', 'Léo', 'Sarah', 'Noah', 'Jade', 'Adam', 'Clarisse', 'Ilyes', 'Manon', 'Ethan', 'Zoé', 'Maxence', 'Léa', 'Malik', 'Emma', 'Tom'];
const LAST = ['Martin', 'Bernard', 'Dubois', 'Durand', 'Moreau', 'Laurent', 'Simon', 'Michel', 'Garcia', 'Roux', 'Fournier', 'Girard', 'Bonnet', 'Mercier', 'Blanc', 'Faure', 'Rousseau', 'Diallo', 'Nguyen', 'Petit'];
const SENTENCES = [
  'J\'aimerais m\'investir dans la vie associative et rencontrer de nouvelles personnes.',
  'L\'organisation était super, mais la soirée a commencé en retard.',
  'Très bonne ambiance, les activités étaient variées et bien encadrées.',
  'Je souhaite développer mes compétences en communication et en gestion de projet.',
  'Le prix était un peu élevé pour les étudiants boursiers.',
  'Merci au bureau pour l\'accueil, j\'ai adoré le week-end d\'intégration.',
  'Il faudrait plus de navettes pour le retour et une meilleure information.',
  'Motivé·e pour aider sur les événements sportifs et la communication.',
  'La musique était trop forte mais le repas était excellent.',
  'Je peux apporter mon expérience de trésorier dans une autre association.',
];
const TAGS = ['prioritaire', 'à rappeler', 'VIP', 'doublon ?'];
const PNG_DOT = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function valueFor(item, type, r, i, ctx) {
  const pick = list => list[Math.floor(r() * list.length)];
  const opts = Array.isArray(item.options) && item.options.length ? item.options : (item.source && ctx.sources?.[item.source]) || [];
  const weighted = () => { // préférence pour les premières options (répartitions réalistes)
    const k = Math.floor((r() ** 1.6) * opts.length);
    return opts[Math.min(k, opts.length - 1)]?.value;
  };
  const v = item.validation || {};
  switch (type) {
    case 'short_text': return pick(['Très bien', 'Bof', 'BUT Informatique', 'GEA', 'Licence pro', 'TC', 'Super', 'À revoir', 'Parfait']) + (r() < 0.3 ? ` ${i}` : '');
    case 'long_text': return `${pick(SENTENCES)} ${r() < 0.5 ? pick(SENTENCES) : ''}`.trim();
    case 'email': return `${ctx.first.toLowerCase()}.${ctx.last.toLowerCase()}${i}@exemple.fr`.normalize('NFD').replace(/[̀-ͯ]/g, '');
    case 'phone': return `060000${String(i % 10000).padStart(4, '0')}`;
    case 'name': return { firstName: ctx.first, lastName: ctx.last };
    case 'address': return { line1: `${1 + (i % 90)} rue de l'Exemple`, postalCode: '93100', city: pick(['Montreuil', 'Paris', 'Bagnolet']), country: 'France' };
    case 'url': return `https://exemple.fr/profil/${i}`;
    case 'single_choice': case 'dropdown': case 'image_choice': return opts.length ? weighted() : undefined;
    case 'multiple_choice': {
      if (!opts.length) return undefined;
      const n = 1 + Math.floor(r() * Math.min(3, opts.length));
      return [...new Set(Array.from({ length: n }, () => weighted()))];
    }
    case 'yes_no': return r() < 0.68;
    case 'consent': return true;
    case 'ranking': return opts.map(o => o.value).sort(() => r() - 0.5);
    case 'matrix': {
      const cols = Array.isArray(item.columns) ? item.columns : [];
      if (!cols.length) return undefined;
      return Object.fromEntries(opts.map(o => [String(o.value), item.multiple ? [cols[Math.floor(r() * cols.length)].value] : cols[Math.min(cols.length - 1, Math.floor((r() ** 0.8) * cols.length))].value]));
    }
    case 'rating': { const max = item.max ?? v.max ?? 5; return Math.max(1, Math.min(max, Math.round(max * 0.55 + (r() + r() - 1) * max * 0.5))); }
    case 'scale': { const lo = item.min ?? v.min ?? 1, hi = item.max ?? v.max ?? 5; return Math.max(lo, Math.min(hi, Math.round(lo + (hi - lo) * (0.35 + r() * 0.65)))); }
    case 'nps': return Math.min(10, Math.max(0, Math.round(5 + r() * 6 - (r() < 0.2 ? 5 : 0))));
    case 'number': {
      const lo = typeof v.min === 'number' ? v.min : 0;
      const hi = typeof v.max === 'number' ? v.max : lo + 100;
      return Math.round(lo + (hi - lo) * ((r() + r()) / 2));
    }
    case 'date': { const d = new Date(Date.now() + (Math.floor(r() * 120) - 60) * 86400000); return d.toISOString().slice(0, 10); }
    case 'time': return `${String(8 + Math.floor(r() * 12)).padStart(2, '0')}:${pick(['00', '15', '30', '45'])}`;
    case 'datetime': { const d = new Date(Date.now() + Math.floor(r() * 30) * 86400000); return `${d.toISOString().slice(0, 10)}T${String(9 + Math.floor(r() * 10)).padStart(2, '0')}:00`; }
    case 'slots': return opts.length ? weighted() : undefined;
    case 'file': return r() < 0.7 ? [{ id: `f${i}`, name: `justificatif-${i}.pdf`, size: 20000 + Math.floor(r() * 300000), type: 'application/pdf' }] : undefined;
    case 'signature': return r() < 0.8 ? PNG_DOT : undefined;
    case 'member_picker': return ctx.memberIds.length ? pick(ctx.memberIds) : undefined;
    case 'event_picker': return ctx.eventIds.length ? pick(ctx.eventIds) : undefined;
    case 'payment': return { amount: item.amount && typeof item.amount === 'number' ? item.amount : pick([10, 15, 25, 45]), currency: 'EUR' };
    case 'hidden': return pick(['insta', 'affiche', 'mail', 'bouche-a-oreille']);
    default: return undefined;
  }
}

/**
 * Génère `count` réponses locales pour la définition (sources résolues).
 * ctx : { members: [{ id }], events: [{ id }], sources }
 * → réponses au format du store des automatisations.
 */
export function generateDemoResponses(def, count = 320, ctx = {}) {
  const c = compileForm(def);
  const statuses = statusesOf(def);
  const memberIds = (ctx.members || []).map(m => m.id).filter(Boolean);
  const eventIds = (ctx.events || []).map(e => e.id).filter(Boolean);
  const out = {};
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const r = rng(i * 7919 + 17);
    const g = { first: FIRST[Math.floor(r() * FIRST.length)], last: LAST[Math.floor(r() * LAST.length)], memberIds, eventIds, sources: ctx.sources };
    const answers = {};
    for (const q of c.questions) {
      if (q.repeatKey || q.type === 'calculated') continue;
      if (r() < 0.06 && !q.item.required) continue; // quelques réponses partielles
      const v = valueFor(q.item, q.type, r, i, g);
      if (v !== undefined) answers[q.key] = v;
    }
    for (const [gk, grp] of c.repeatGroups || []) {
      const n = Math.floor(r() * 3);
      answers[gk] = Array.from({ length: n }, () => Object.fromEntries(grp.childKeys.map(ck => { const cq = c.byKey.get(ck); return [ck, valueFor(cq.item, cq.type, r, i, g)]; }).filter(([, v]) => v !== undefined)));
    }
    let ev;
    try { ev = evaluateForm(def, answers, {}); } catch { ev = null; }
    if (ev) Object.keys(answers).forEach(k => { if (!ev.visible.has(k) && !c.repeatGroups?.has(k)) delete answers[k]; });
    const computed = ev?.computed || {};
    let score;
    try { score = computeScore(def, answers).score; } catch { score = null; }
    // Répartition dans le temps : 45 derniers jours, plus de réponses au début (lancement).
    const ageDays = Math.floor((r() ** 1.8) * 45);
    const at = new Date(now - ageDays * 86400000 - Math.floor(r() * 86400000)).toISOString();
    const st = r() < 0.45 ? statuses[0] : statuses[Math.floor(r() * statuses.length)];
    const id = `demo-${def.id.slice(0, 8)}-${String(i).padStart(4, '0')}`;
    out[id] = {
      id, formId: def.id, version: def.publishedVersion || null, status: st?.id || 'received', answers, computed,
      ...(score !== null ? { score } : {}),
      respondent: { email: `${g.first}.${g.last}${i}@exemple.fr`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''), ...(memberIds.length && r() < 0.3 ? { memberId: memberIds[i % memberIds.length] } : {}) },
      source: r() < 0.15 ? 'borne' : 'manuel',
      waitlisted: r() < 0.05,
      tags: r() < 0.25 ? [TAGS[Math.floor(r() * TAGS.length)]] : [],
      assignee: memberIds.length && r() < 0.3 ? memberIds[Math.floor(r() * memberIds.length)] : undefined,
      submittedAt: at, createdAt: at, updatedAt: at,
      history: [{ at, action: 'submitted' }],
    };
  }
  return out;
}

/** Formulaire de démonstration couvrant tous les types de questions. */
export function buildAllTypesDefinition() {
  const q = (key, type, label, extra = {}) => ({ id: `q_${key}`, kind: 'question', key, type, label, ...extra });
  const o = (...l) => l.map(x => ({ value: x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_'), label: x }));
  return {
    title: 'Démo — tous les types de questions', kind: 'survey', description: 'Formulaire de démonstration (développement).',
    pages: [
      { id: 'p1', title: 'Identité', items: [
        q('identite', 'name', 'Prénom et nom', { required: true }), q('email', 'email', 'Email', { required: true }),
        q('telephone', 'phone', 'Téléphone', { sensitive: true }), q('adresse', 'address', 'Adresse', { sensitive: true }),
        q('site', 'url', 'Site web'), q('pseudo', 'short_text', 'Pseudo'), q('naissance', 'date', 'Date de naissance', { sensitive: true }),
      ] },
      { id: 'p2', title: 'Avis', items: [
        q('formule', 'single_choice', 'Formule choisie', { options: o('Complète', 'Soirée seule', 'Journée') }),
        q('regime', 'dropdown', 'Régime alimentaire', { options: o('Standard', 'Végétarien', 'Vegan', 'Sans gluten') }),
        q('activites', 'multiple_choice', 'Activités', { options: o('Escalade', 'Kayak', 'Rando', 'Paintball', 'Jeux') }),
        q('photo', 'image_choice', 'Ambiance préférée', { options: o('Plage', 'Montagne', 'Ville') }),
        q('revenir', 'yes_no', 'Reviendrais-tu ?'),
        q('note', 'rating', 'Note globale', { max: 5 }), q('organisation', 'scale', 'Organisation', { min: 1, max: 10 }),
        q('nps', 'nps', 'Recommanderais-tu le BDE ?'),
        q('classement', 'ranking', 'Classe les activités', { options: o('Soirée', 'Sport', 'Culture') }),
        q('grille', 'matrix', 'Évalue chaque aspect', { options: o('Repas', 'Transport', 'Logement'), columns: o('Mauvais', 'Moyen', 'Bon', 'Excellent') }),
        q('commentaire', 'long_text', 'Commentaire libre'),
      ] },
      { id: 'p3', title: 'Pratique', items: [
        q('budget', 'number', 'Budget (€)', { validation: { min: 0, max: 200 } }), q('heure', 'time', 'Heure d\'arrivée'),
        q('rdv', 'datetime', 'Rendez-vous'),
        q('creneau', 'slots', 'Créneau', { options: [{ value: 's1', label: 'Samedi 10 h', capacity: 60 }, { value: 's2', label: 'Samedi 14 h', capacity: 80 }, { value: 's3', label: 'Dimanche 10 h', capacity: 40 }] }),
        q('justif', 'file', 'Justificatif'), q('signature', 'signature', 'Signature'),
        q('parrain', 'member_picker', 'Parrain / marraine'), q('evenement', 'event_picker', 'Événement concerné'),
        q('paiement', 'payment', 'Paiement', { amount: 25 }), q('source', 'hidden', 'Source'),
        { id: 's_acc', kind: 'section', key: 'accompagnants', title: 'Accompagnants', repeat: { min: 0, max: 3 }, items: [q('acc_nom', 'short_text', 'Nom de l\'accompagnant')] },
        q('total', 'calculated', 'Total', { expr: 'budget * 2' }), q('rgpd', 'consent', 'J\'accepte le traitement de mes données'),
      ] },
    ],
    settings: { maxResponses: 400, waitlist: true, quotas: [{ expr: 'formule = "complete"', max: 150, message: 'Complet' }] },
  };
}
