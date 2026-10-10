// Vérification anti-robot Cloudflare Turnstile, chargée à la demande.
// Mode « managed » avec apparence « interaction-only » : invisible pour la
// plupart des visiteurs, une case n'apparaît qu'en cas de doute.
// CSP requise : script-src et frame-src https://challenges.cloudflare.com

import { useEffect, useImperativeHandle, useRef, useState } from 'react';

const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading = null;

function loadScript() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Navigateur requis.'));
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SRC;
      s.async = true;
      s.defer = true;
      s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Vérification anti-robot indisponible.')));
      s.onerror = () => { loading = null; s.remove(); reject(new Error('Impossible de charger la vérification anti-robot (réseau ou bloqueur de contenu).')); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

/**
 * ref → { reset(), getToken() } ; onToken(token|null)
 */
export default function Turnstile({ siteKey, onToken, ref, theme = 'auto' }) {
  const boxRef = useRef(null);
  const widgetRef = useRef(null);
  const tokenRef = useRef(null);
  const onTokenRef = useRef(onToken);
  const [error, setError] = useState('');
  useEffect(() => { onTokenRef.current = onToken; });

  useImperativeHandle(ref, () => ({
    reset() {
      tokenRef.current = null;
      onTokenRef.current?.(null);
      if (window.turnstile && widgetRef.current !== null) { try { window.turnstile.reset(widgetRef.current); } catch { /* rien */ } }
    },
    getToken: () => tokenRef.current,
  }), []);

  useEffect(() => {
    let alive = true;
    loadScript().then(ts => {
      if (!alive || !boxRef.current) return;
      widgetRef.current = ts.render(boxRef.current, {
        sitekey: siteKey,
        appearance: 'interaction-only',
        theme,
        language: 'fr',
        callback: t => { tokenRef.current = t; setError(''); onTokenRef.current?.(t); },
        'expired-callback': () => { tokenRef.current = null; onTokenRef.current?.(null); },
        'error-callback': () => { tokenRef.current = null; setError('La vérification anti-robot a échoué : recharge la page ou réessaie.'); onTokenRef.current?.(null); },
      });
    }).catch(e => { if (alive) setError(e.message); });
    return () => {
      alive = false;
      if (window.turnstile && widgetRef.current !== null) { try { window.turnstile.remove(widgetRef.current); } catch { /* rien */ } }
      widgetRef.current = null;
    };
  }, [siteKey, theme]);

  return (
    <div>
      <div ref={boxRef} />
      {error && <p className="fr-error" role="alert">{error}</p>}
    </div>
  );
}
