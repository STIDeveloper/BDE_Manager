import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

// Page publique d'un formulaire (#/f/<slug>) : rendue SANS charger l'application
// (stores, modules, navigation) pour rester légère sur mobile et connexion lente.
// Une navigation interne vers #/f/ depuis l'app reste gérée par App.jsx.
// Lien court /f/<slug> (chemin) → route interne #/f/<slug>.
{
  const m = /^\/f\/([A-Za-z0-9-]{1,60})\/?$/.exec(window.location.pathname);
  if (m && !/^#\/./.test(window.location.hash)) {
    window.history.replaceState(null, '', `/#/f/${m[1].toLowerCase()}${window.location.search}`);
  }
}
// Pages publiques légères : formulaire, portail « Mon espace », vérification
// de bulletin de vote, billet d'événement.
const LIGHT = {
  f: () => import('./forms/runtime/PublicFormPage.jsx'),
  espace: () => import('./forms/portal/PortalPage.jsx'),
  bulletin: () => import('./forms/vote/BallotCheckPage.jsx'),
  billet: () => import('./modules/events/checkin/TicketPage.jsx'),
};
const lightKey = (window.location.hash.match(/^#\/(f|espace|bulletin|billet)(?=[/?]|$)/) || [])[1];
const root = ReactDOM.createRoot(document.getElementById('root'));

if (lightKey) {
  const PublicFormPage = lazy(LIGHT[lightKey]);
  const ToastHost = lazy(() => import('./components/ui/Toast.jsx').then(m => ({ default: m.ToastContainer })));
  root.render(
    <React.StrictMode>
      <Suspense fallback={<p role="status" style={{ padding: 24, fontFamily: 'system-ui', color: '#666' }}>Chargement…</p>}>
        <PublicFormPage />
        <ToastHost />
      </Suspense>
    </React.StrictMode>
  );
} else {
  Promise.all([
    import('./modules/index.js'),
    import('./App.jsx'),
    import('./components/pwa/PwaUpdatePrompt.jsx'),
  ]).then(([, { default: App }, { default: PwaUpdatePrompt }]) => {
    // Exécuteur des automatisations : démarre avec l'application (sinon
    // seulement à l'ouverture de l'écran Automatisations).
    import('./automations/runner.js').then(m => m.startAutomationRunner?.()).catch(err => console.error('[automatisations]', err));
    root.render(
      <React.StrictMode>
        <App />
        {/* Bandeau de mise à jour / mode hors ligne du service worker */}
        <PwaUpdatePrompt />
      </React.StrictMode>
    );
  });
}
