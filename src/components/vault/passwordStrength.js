// Évaluation indicative de la robustesse d'un mot de passe maître.
// Heuristique simple (longueur + variété + motifs évidents) : ce n'est qu'un indice visuel.

export const MIN_PASSWORD_LENGTH = 6;      // imposé par le moteur (core/crypto.js)
export const RECOMMENDED_PASSWORD_LENGTH = 8;

const COMMON = [
  'password', 'motdepasse', 'azerty', 'qwerty', '123456', '000000', 'bde', 'admin',
  'soleil', 'bonjour', 'iloveyou', 'abc123', 'letmein',
];

export function evaluatePassword(pw = '') {
  if (!pw) return { score: 0, label: '', tone: 'none', tips: [] };

  const tips = [];
  let score = 0;

  if (pw.length >= RECOMMENDED_PASSWORD_LENGTH) score++;
  if (pw.length >= 12) score++;
  if (pw.length >= 16) score++;

  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(r => r.test(pw)).length;
  if (classes >= 3) score++;

  const lower = pw.toLowerCase();
  const hasCommon = COMMON.some(w => lower.includes(w));
  const repetitive = /^(.)\1+$/.test(pw) || new Set(pw).size <= 3;
  if (hasCommon || repetitive) score = Math.max(0, score - 2);

  if (pw.length < RECOMMENDED_PASSWORD_LENGTH) tips.push(`Au moins ${RECOMMENDED_PASSWORD_LENGTH} caractères recommandés.`);
  if (classes < 3) tips.push('Mélange minuscules, majuscules, chiffres et symboles.');
  if (hasCommon) tips.push('Évite les mots trop courants.');
  if (repetitive) tips.push('Évite les caractères répétés.');
  if (pw.length < 12 && tips.length === 0) tips.push('Une phrase de passe (4-5 mots) est encore plus sûre.');

  score = Math.min(4, score);
  const meta = [
    { label: 'Très faible', tone: 'red' },
    { label: 'Faible', tone: 'red' },
    { label: 'Moyen', tone: 'amber' },
    { label: 'Bon', tone: 'emerald' },
    { label: 'Excellent', tone: 'emerald' },
  ][score];

  return { score, ...meta, tips };
}

/** Retourne un message d'erreur (string) ou null si le couple mot de passe/confirmation est valide. */
export function validateNewPassword(pw, confirm) {
  if (!pw || pw.length < MIN_PASSWORD_LENGTH) {
    return `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`;
  }
  if (pw !== confirm) return 'Les deux mots de passe ne correspondent pas.';
  return null;
}
