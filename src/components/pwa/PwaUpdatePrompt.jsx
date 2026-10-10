import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, WifiOff, X } from 'lucide-react';

// Vérification périodique d'une nouvelle version du service worker
const UPDATE_INTERVAL_MS = 60 * 60 * 1000; // 60 min

/**
 * Bandeau PWA : propose la mise à jour quand une nouvelle version est disponible
 * (registerType « prompt ») et signale une seule fois que l'app fonctionne hors ligne.
 * Rendu depuis src/main.jsx, en dehors de <App/>.
 */
export default function PwaUpdatePrompt() {
  const intervalRef = useRef(null);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;
      clearInterval(intervalRef.current);
      intervalRef.current = setInterval(async () => {
        // Pas de vérification hors ligne ni pendant une installation en cours
        if (registration.installing || !navigator.onLine) return;
        try {
          const resp = await fetch(swUrl, { cache: 'no-store', headers: { 'cache-control': 'no-cache' } });
          if (resp.status === 200) await registration.update();
        } catch {
          // Réseau indisponible : on réessaiera au prochain intervalle
        }
      }, UPDATE_INTERVAL_MS);
    },
    onRegisterError(error) {
      console.error('Enregistrement du service worker impossible :', error);
    },
  });

  useEffect(() => () => clearInterval(intervalRef.current), []);

  // Le message « prêt hors ligne » disparaît tout seul
  useEffect(() => {
    if (!offlineReady) return undefined;
    const t = setTimeout(() => setOfflineReady(false), 6000);
    return () => clearTimeout(t);
  }, [offlineReady, setOfflineReady]);

  const close = () => {
    setNeedRefresh(false);
    setOfflineReady(false);
  };

  const visible = needRefresh || offlineReady;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-4 left-4 right-4 sm:right-auto z-[110] flex justify-center sm:justify-start pointer-events-none"
    >
      {visible && (
        <div
          className="pointer-events-auto w-full max-w-sm bg-surface border border-line rounded-xl shadow-lg p-3 flex items-start gap-3"
          style={{ animation: 'toastIn 200ms ease-out' }}
        >
          <div className="shrink-0 mt-0.5 text-blue-500" aria-hidden="true">
            {needRefresh ? <RefreshCw size={16} /> : <WifiOff size={16} />}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ink">
              {needRefresh ? 'Nouvelle version disponible' : 'Application prête hors ligne'}
            </p>
            <p className="text-xs text-dim mt-0.5">
              {needRefresh
                ? 'Rechargez pour profiter des dernières améliorations.'
                : 'BDE Manager fonctionne désormais sans connexion.'}
            </p>

            {needRefresh && (
              <div className="flex gap-2 mt-2.5">
                <button type="button" className="btn-primary !py-1.5 !px-3 text-xs"
                  onClick={() => updateServiceWorker(true)}>
                  Mettre à jour
                </button>
                <button type="button" className="btn-ghost !py-1.5 !px-3 text-xs" onClick={close}>
                  Plus tard
                </button>
              </div>
            )}
          </div>

          <button type="button" onClick={close} aria-label="Fermer"
            className="shrink-0 text-dim hover:text-ink rounded-md p-0.5 transition-colors">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
