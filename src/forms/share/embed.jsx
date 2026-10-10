// ============================================================
// PARTAGE — composants de la page intégrée (#/f/<slug> dans une <iframe>)
// ============================================================
// EmbedHeightReporter : envoie la hauteur au site parent.
// EmbedBlocked : remplace le formulaire quand le site n'est pas autorisé
// (décision : checkEmbed / useEmbedCheck de ./embedRuntime.js).

import { useEffect } from 'react';
import { ExternalLink, ShieldAlert } from 'lucide-react';
import Shell, { StateCard } from '../runtime/Shell.jsx';
import { startHeightReporter } from './embedRuntime.js';

/** Composant sans rendu : active l'envoi de la hauteur quand la page est intégrée. */
export function EmbedHeightReporter({ slug }) {
  useEffect(() => startHeightReporter({ slug }), [slug]);
  return null;
}

const REASONS = {
  disabled: 'L’intégration de ce formulaire dans un autre site n’est pas activée.',
  origin_not_allowed: 'Ce site n’est pas autorisé à afficher ce formulaire.',
  unknown_parent: 'Le site qui affiche ce formulaire n’a pas pu être identifié, or l’intégration est limitée à certains sites.',
};

/** Écran affiché à la place du formulaire quand l'intégration est refusée. */
export function EmbedBlocked({ reason, slug, theme }) {
  const link = `${window.location.origin}${window.location.pathname}#/f/${encodeURIComponent(slug || '')}`;
  return (
    <Shell theme={theme}>
      <StateCard icon={ShieldAlert} title="Formulaire non disponible ici">
        <p className="fr-muted">{REASONS[reason] || REASONS.disabled}</p>
        <a className="fr-btn fr-btn-primary" href={link} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} aria-hidden="true" /> Ouvrir le formulaire dans un nouvel onglet</a>
      </StateCard>
    </Shell>
  );
}
