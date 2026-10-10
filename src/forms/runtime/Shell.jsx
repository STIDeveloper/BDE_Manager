// Coque thémée des écrans hors formulaire (chargement, erreurs, confirmation,
// mode borne) : mêmes variables de thème que FormRenderer.

import { useMemo } from 'react';
import { resolveTheme } from './theme.js';
import { useSystemDark } from './hooks.js';
import { useMediaSrc } from './media.js';
import './runtime.css';

export default function Shell({ theme: themeDef, children, wide = false, className = '' }) {
  const systemDark = useSystemDark();
  const theme = useMemo(() => resolveTheme(themeDef, { systemDark }), [themeDef, systemDark]);
  const bgImage = useMediaSrc(theme.background.imageRef);
  const style = {
    ...theme.vars,
    minHeight: '100vh',
    background: bgImage ? `center / cover no-repeat url("${bgImage.replace(/"/g, '%22')}")` : theme.background.css,
  };
  return (
    <div className={`fr-root ${theme.animations ? 'fr-anim' : 'fr-noanim'} ${className}`} style={style}>
      <main style={{ maxWidth: wide ? 960 : 760, margin: '0 auto', padding: '24px 16px 48px' }}>
        {children}
      </main>
    </div>
  );
}

/** Carte d'état (titre + texte + actions). */
export function StateCard({ icon: Icon, title, children, tone = 'neutral' }) {
  const color = tone === 'error' ? 'var(--f-danger)' : tone === 'success' ? 'var(--f-success)' : 'var(--f-accent-ink)';
  return (
    <section className="fr-card fr-page-enter fr-stack" style={{ textAlign: 'center', padding: 'calc(var(--f-pad) * 1.5) var(--f-pad)' }} aria-labelledby="fr-state-title">
      {Icon && (
        <div style={{ display: 'grid', placeItems: 'center' }}>
          <span style={{ width: 56, height: 56, borderRadius: 999, display: 'grid', placeItems: 'center', background: 'rgb(var(--c-elevated))', color }}>
            <Icon size={28} aria-hidden="true" />
          </span>
        </div>
      )}
      <h1 id="fr-state-title" className="fr-title" style={{ fontSize: '1.4rem' }}>{title}</h1>
      {children}
    </section>
  );
}
