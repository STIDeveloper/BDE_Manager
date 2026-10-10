// ============================================================
// ÉLECTIONS — liste électorale (module PUR)
// ============================================================
// Deux modes (VoteSettings.electoralRoll) :
//  - 'members' : les comptes membres de l'espace connecté (calculé par le
//    serveur à chaque publication ; un membre arrivé ensuite est inscrit à
//    la volée au moment de voter) ;
//  - 'list'    : une liste d'adresses e-mail (settings.vote.list). Le votant
//    se connecte par lien e-mail avec l'une de ces adresses.
// Le serveur ne garde de la liste que des empreintes propres à chaque vote
// (vote_rolls) ; la liste en clair reste dans le brouillon du formulaire et
// n'est jamais exposée aux votants (retirée de la définition publique).
// ============================================================

export const EMAIL_RX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const MAX_ROLL = 5000; // limite du serveur (forms_sync_roll)

const memberName = (m) => `${m?.firstName || ''} ${m?.lastName || ''}`.trim() || m?.name || 'Sans nom';

/**
 * Analyse un texte collé (une adresse par ligne, ou séparées par , ; espace).
 * Accepte « Nom <adresse> ».
 * @returns {{ emails: string[], invalid: string[], duplicates: number }}
 */
export function parseEmailList(text) {
  const tokens = String(text || '').split(/[\n,;\t]+/).map(s => s.trim()).filter(Boolean);
  const seen = new Set();
  const emails = [];
  const invalid = [];
  let duplicates = 0;
  tokens.forEach((raw) => {
    const inBrackets = raw.match(/<([^>]+)>/);
    const candidate = (inBrackets ? inBrackets[1] : raw).trim().toLowerCase().replace(/^mailto:/, '');
    // Plusieurs adresses séparées par des espaces sur une même ligne
    const parts = inBrackets ? [candidate] : candidate.split(/\s+/);
    parts.forEach((p) => {
      if (!EMAIL_RX.test(p)) { if (p) invalid.push(p); return; }
      if (seen.has(p)) { duplicates++; return; }
      seen.add(p);
      emails.push(p);
    });
  });
  return { emails, invalid, duplicates };
}

/**
 * Membres du BDE : ceux qui ont une adresse valide, ceux qui n'en ont pas.
 * @param {object[]} members store principal (fiches « poste vacant » à exclure en amont)
 */
export function splitMembersByEmail(members = []) {
  const withEmail = [];
  const withoutEmail = [];
  members.forEach((m) => {
    const email = String(m?.email || '').trim().toLowerCase();
    if (EMAIL_RX.test(email)) withEmail.push({ id: m.id, name: memberName(m), email });
    else withoutEmail.push({ id: m.id, name: memberName(m) });
  });
  const byName = (a, b) => a.name.localeCompare(b.name, 'fr');
  return { withEmail: withEmail.sort(byName), withoutEmail: withoutEmail.sort(byName) };
}

/** Fusionne des adresses (ordre conservé, sans doublon, minuscules). */
export function mergeEmails(...lists) {
  const seen = new Set();
  const out = [];
  lists.flat().forEach((e) => {
    const v = String(e || '').trim().toLowerCase();
    if (v && EMAIL_RX.test(v) && !seen.has(v)) { seen.add(v); out.push(v); }
  });
  return out;
}

/** Aperçu de la liste : qui parmi les membres du BDE est inscrit / absent de la liste. */
export function rollPreview(list = [], members = []) {
  const set = new Set(mergeEmails(list));
  const { withEmail, withoutEmail } = splitMembersByEmail(members);
  const membersListed = withEmail.filter(m => set.has(m.email));
  const membersNotListed = withEmail.filter(m => !set.has(m.email));
  const memberEmails = new Set(withEmail.map(m => m.email));
  const externals = [...set].filter(e => !memberEmails.has(e));
  return { total: set.size, membersListed, membersNotListed, withoutEmail, externals, tooLong: set.size > MAX_ROLL };
}
