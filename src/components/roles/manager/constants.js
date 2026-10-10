// Constantes partagées de la gestion des rôles (aucun composant ici).
import { createContext } from 'react';

/**
 * Élément DOM dans lequel les menus / tiroirs sont « portés ».
 * En plein écran, c'est le panneau lui-même (sinon aria-modal les rendrait
 * inaccessibles) ; en mode page, null → document.body.
 */
export const PortalTargetContext = createContext(null);

/** Anneau de focus clavier commun (visible uniquement au clavier). */
export const FOCUS_RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60';

/** Emojis proposés pour un pôle (le champ texte accepte n'importe quel emoji). */
export const EMOJI_SUGGESTIONS = ['🏛️', '📣', '🏫', '📋', '🎉', '🏅', '🎮', '🤝', '🧩', '🎨', '💻', '📸', '🎵', '🌱', '💰', '📚'];

/** Formations connues de l'IUT (clés utilisées par le moteur pour l'affinité). */
export const KNOWN_FORMATIONS = ['InfoCOM', 'Informatique', 'GACO', 'QLIO'];

/** Noms lisibles des couleurs de la palette (accessibilité des pastilles). */
export const COLOR_NAMES = {
  red: 'Rouge', orange: 'Orange', amber: 'Ambre', yellow: 'Jaune',
  lime: 'Citron vert', emerald: 'Émeraude', teal: 'Sarcelle', cyan: 'Cyan',
  sky: 'Bleu ciel', blue: 'Bleu', indigo: 'Indigo', violet: 'Violet',
  purple: 'Pourpre', pink: 'Rose', rose: 'Framboise', zinc: 'Gris',
};

/** Classe de badge selon le comportement moteur du niveau. */
export const LEVEL_KIND_BADGE = {
  bureau: 'badge-rose',
  responsable: 'badge-violet',
  adjoint: 'badge-cyan',
  membre: 'badge-neutral',
};

/** Niveaux de permission Drive (copie locale des libellés : pas de dépendance au store ici). */
export const DRIVE_LEVELS = [
  { id: 'editor', label: 'Éditeur', short: 'E', cls: 'badge-emerald' },
  { id: 'commenter', label: 'Commentateur', short: 'C', cls: 'badge-amber' },
  { id: 'reader', label: 'Lecteur', short: 'L', cls: 'badge-brand' },
];

/** Classes des champs de formulaire (dialogues + détail). */
export const inputCls = 'w-full bg-elevated border border-line rounded-lg px-3 py-2 min-h-[36px] text-sm text-ink placeholder:text-dim focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 aria-[invalid=true]:border-red-500';
export const labelCls = 'block text-[11px] font-semibold uppercase tracking-wide text-dim mb-1';
