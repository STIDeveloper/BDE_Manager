import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

// Page publique d'un formulaire (#/f/<slug>) : rendue SANS charger l'application
// (stores, modules, navigation) pour rester légère sur mobile et connexion lente.
// Une navigation interne vers #/f/ depuis l'app reste gérée par App.jsx.
const isPublicForm = /^#\/f\//.test(window.location.hash);
const root = ReactDOM.createRoot(document.getElementById('root'));

if (isPublicForm) {
  const PublicFormPage = lazy(() => import('./forms/runtime/PublicFormPage.jsx'));
  const ToastHost = lazy(() => import('./components/ui/Toast.jsx').then(m => ({ default: m.ToastContainer })));
  root.render(
    <React.StrictMode>
      <Suspense fallback={<p role="status" style={{ padding: 24, fontFamily: 'system-ui', color: '#666' }}>Chargement du formulaire…</p>}>
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
    root.render(
      <React.StrictMode>
        <App />
        {/* Bandeau de mise à jour / mode hors ligne du service worker */}
        <PwaUpdatePrompt />
      </React.StrictMode>
    );
  });
}
