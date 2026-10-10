import { normalizeKey } from './normalizer.js';

// ============================================================
// Règles lexicales (FR) — documentées
// Chaque signal renvoie strength 0..1 + citation source
// ============================================================

const RULES = [
  // --- Ambition / leadership ---
  {
    type: 'ambition',
    strength: 0.9,
    rx: /\b(president|diriger|manager|leader|coordination|coordonner|responsable|piloter|superviser)\b/,
  },
  {
    type: 'ambition',
    strength: 0.6,
    rx: /\b(gerer|organiser|initiative|prendre des decisions|motiver|management)\b/,
  },

  // --- Retrait volontaire ---
  {
    type: 'retrait',
    strength: 0.9,
    rx: /\b(en retrait|tout en bas|le plus bas|pas de role|pas de poste|je ne veux pas etre|sans diriger|simple aide|aider seulement|aider physiquement)\b/,
  },
  {
    type: 'retrait',
    strength: 0.6,
    rx: /\b(je ne me vois pas|je prefere ne pas prendre|je ne pense pas que je peux etre responsable)\b/,
  },

  // --- Expérience / ancienneté ---
  {
    type: 'experience',
    strength: 0.9,
    rx: /\b(\d+\s*an(s)? d.anciennete|pere fondateur|depuis \d+ ans|j.ai ete (tresorier|president|secretaire|responsable)|3 ans|deja fait|connais deja tout)\b/,
  },
  {
    type: 'experience',
    strength: 0.6,
    rx: /\b(experience|j.ai deja|ancien(nne)?|passation|connait|connais)\b/,
  },

  // --- Transmission / formation ---
  {
    type: 'transmission',
    strength: 0.9,
    rx: /\b(former|transmettre|apprendre aux|enseigner|faire profiter|sensibiliser|mentorer|passer le relais)\b/,
  },

  // --- Contrainte de disponibilité ---
  {
    type: 'contrainte',
    strength: 0.9,
    rx: /\b(emploi du temps charge|tres charge|peu disponible|absent(e)?|difficile d.assurer|pas regulier|limite)\b/,
  },

  // --- Rôle précis souhaité (dans "rôle à découvrir") ---
  {
    type: 'role_pricis',
    strength: 1.0,
    rx: /\b(responsable instagram|respo instagram|responsable tiktok|respo tiktok|president adjoint|responsable esport|responsable projets|responsable communication)\b/,
  },
];

/**
 * Extrait les signaux depuis les textes libres d'un candidat.
 * @param {{ whyText:string, discoverText:string, contributeText:string }} raw
 * @returns {import('./types.js').Signal[]}
 */
export function extractSignals(raw) {
  const sources = [
    { key: 'whyText', text: raw.whyText || '' },
    { key: 'discoverText', text: raw.discoverText || '' },
    { key: 'contributeText', text: raw.contributeText || '' },
  ];
  const signals = [];
  sources.forEach(({ key, text }) => {
    const k = normalizeKey(text);
    if (!k) return;
    RULES.forEach(rule => {
      const match = k.match(rule.rx);
      if (match) {
        const idx = k.indexOf(match[0]);
        const quote = text.slice(Math.max(0, idx - 30), Math.min(text.length, idx + match[0].length + 30)).trim();
        signals.push({
          type: rule.type,
          strength: rule.strength,
          source: key,
          quote: quote || match[0],
        });
      }
    });
  });
  return signals;
}

/** Filtre les signaux par type et renvoie le max de strength (0 si absent) */
export function signalStrength(signals, type) {
  const filtered = signals.filter(s => s.type === type);
  return filtered.length === 0 ? 0 : Math.max(...filtered.map(s => s.strength));
}

/** Détecte les contradictions internes d'un candidat */
export function detectContradictions(candidate) {
  const contradictions = [];
  const amb = signalStrength(candidate.signals, 'ambition');
  const ret = signalStrength(candidate.signals, 'retrait');
  const ctr = signalStrength(candidate.signals, 'contrainte');

  // Ambition + retrait simultanés
  if (amb >= 0.6 && ret >= 0.6) {
    contradictions.push('Ambition et retrait volontaire détectés simultanément');
  }
  // Rôle bureau/responsable + dispo faible
  const hasLeadershipRole = candidate.choices.some(c => {
    const k = normalizeKey(c);
    return /\b(president|vice|responsable|tresorier|secretaire)\b/.test(k);
  });
  if (hasLeadershipRole && candidate.availability <= 0.4) {
    contradictions.push('Vise un poste à responsabilité mais annonce une disponibilité limitée');
  }
  // Contrainte explicite + leadership
  if (ctr >= 0.9 && hasLeadershipRole) {
    contradictions.push('Contrainte de temps annoncée sur un poste exigeant');
  }
  return contradictions;
}