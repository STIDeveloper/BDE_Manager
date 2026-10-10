import { Component, Suspense, lazy, useLayoutEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { loadEngine } from './engine';

// Aperçu React du moteur de rendu, chargé à la demande.
const DocumentView = lazy(() => loadEngine().then(m => ({ default: m.DocumentView })));

/** Isole une erreur de rendu d'un document (le reste du studio continue). */
class SheetErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, resetKey: props.resetKey };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  static getDerivedStateFromProps(props, state) {
    // Nouveau document → nouvelle tentative de rendu.
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
  }

  render() {
    if (this.state.error) {
      return (
        <div role="alert" className="m-4 flex gap-3 items-start rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-ink">
          <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="font-semibold">Aperçu indisponible</p>
            <p className="text-dim mt-1">
              {/import|fetch|module/i.test(String(this.state.error?.message))
                ? 'Le moteur de rendu n\'a pas pu être chargé (connexion ?). Recharge la page pour réessayer.'
                : `Ce document n'a pas pu être affiché : ${this.state.error?.message || 'erreur inconnue'}.`}
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Feuille A4 mise à l'échelle de son conteneur (largeur), hauteur ajustée.
 * La feuille garde sa taille réelle (210 mm) et est réduite par une
 * transformation CSS : rendu identique à l'impression, quelle que soit la
 * largeur de l'écran.
 *
 * @param {{ doc, organization, issue?, editable?, overrides?, onEdit?,
 *   maxScale?: number, thumbnail?: boolean, className?: string }} props
 */
export default function SheetView({
  doc, organization, issue = null, editable = false, overrides, onEdit,
  maxScale = 1, thumbnail = false, className = '',
}) {
  const outerRef = useRef(null);
  const innerRef = useRef(null);
  const [box, setBox] = useState({ scale: thumbnail ? 0.12 : 0.6, height: 0, left: 0 });

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return undefined;
    const measure = () => {
      const available = outer.clientWidth;
      if (!available) return; // conteneur masqué (onglet « Formulaire » sur mobile)
      const natural = inner.offsetWidth || 794;
      const scale = Math.max(0.05, Math.min(maxScale, available / natural));
      const height = Math.ceil(inner.offsetHeight * scale);
      const left = Math.max(0, Math.floor((available - natural * scale) / 2));
      setBox(b => (Math.abs(b.scale - scale) < 0.0005 && b.height === height && b.left === left ? b : { scale, height, left }));
    };
    // Mesure immédiate (avant le premier affichage : pas de « saut » d'échelle),
    // puis à chaque changement de taille du conteneur, de la feuille ou de la fenêtre.
    measure();
    window.addEventListener('resize', measure);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(outer);
    ro?.observe(inner);
    return () => { ro?.disconnect(); window.removeEventListener('resize', measure); };
  }, [maxScale]);

  return (
    <div
      ref={outerRef}
      className={`relative w-full overflow-hidden ${className}`}
      style={{ height: box.height || undefined, minHeight: box.height ? undefined : (thumbnail ? 90 : 320) }}
      aria-hidden={thumbnail || undefined}
      inert={thumbnail || undefined}
    >
      <div
        ref={innerRef}
        className="absolute top-0"
        style={{
          left: box.left,
          width: 'max-content',
          transform: `scale(${box.scale})`,
          transformOrigin: 'top left',
          pointerEvents: thumbnail ? 'none' : undefined,
        }}
      >
        <SheetErrorBoundary resetKey={doc}>
          <Suspense fallback={(
            <div role="status" className="flex items-center gap-2 text-sm text-dim p-10" style={{ width: 794 }}>
              <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Préparation de l'aperçu…
            </div>
          )}>
            {doc && (
              <DocumentView
                doc={doc}
                organization={organization}
                issue={issue}
                editable={editable}
                overrides={overrides}
                onEdit={onEdit}
              />
            )}
          </Suspense>
        </SheetErrorBoundary>
      </div>
    </div>
  );
}
