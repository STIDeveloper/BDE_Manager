// ============================================================
// MODE BORNE — route autonome #/borne/<formId>
// ============================================================
// Affichée HORS de la coque de l'application (aucune navigation, aucun
// accès aux autres données) : un visiteur à l'accueil d'un événement ne peut
// que remplir le formulaire. Seul le code PIN (défini au démarrage) ramène à
// l'application. Pour une borne verrouillée, active aussi le « mode kiosque »
// / l'épinglage d'application de la tablette.
import { lazy, Suspense } from 'react';
import { useRoute, navigate } from '../../core/router.js';
import { useFormsStore } from './store.js';

const KioskMode = lazy(() => import('../../forms/runtime/KioskMode.jsx'));

export default function KioskRoute() {
  const route = useRoute();
  const formId = route.rest[0];
  const def = useFormsStore(s => (formId ? s.definitions[formId] : null));

  if (!def) {
    return (
      <main className="min-h-[100dvh] grid place-items-center p-6 bg-base text-center">
        <div className="space-y-3 max-w-sm">
          <h1 className="text-lg font-semibold text-ink">Formulaire introuvable sur cet appareil</h1>
          <p className="text-sm text-dim">Le mode borne utilise un formulaire du Studio de cet appareil.</p>
          <button type="button" className="btn-secondary" onClick={() => navigate('forms')}>Retour aux formulaires</button>
        </div>
      </main>
    );
  }
  return (
    <Suspense fallback={<p role="status" className="p-6 text-sm text-dim">Ouverture du mode borne…</p>}>
      <KioskMode definition={def} formId={def.id} slug={def.slug} onExit={() => navigate('forms', def.id)} />
    </Suspense>
  );
}
