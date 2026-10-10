// ============================================================
// STUDIO FORMULAIRES — écran du module (#/forms, #/forms/<id>)
// ============================================================
import { ClipboardList } from 'lucide-react';
import { useRoute, navigate } from '../../core/router.js';
import { useFormsStore } from './store.js';
import FormList from './FormList.jsx';
import Editor from './editor/Editor.jsx';


export default function FormsPage() {
  const route = useRoute();
  const definitions = useFormsStore(s => s.definitions);
  const formId = route.rest[0];

  if (formId) {
    const def = definitions[formId];
    if (!def) {
      return (
        <div className="max-w-xl mx-auto text-center py-16 space-y-3">
          <ClipboardList size={36} className="mx-auto text-muted" aria-hidden="true" />
          <h1 className="text-lg font-semibold text-ink">Formulaire introuvable</h1>
          <p className="text-sm text-dim">Il a peut-être été supprimé sur cet appareil ou par un autre membre de l'équipe.</p>
          <button type="button" className="btn-secondary" onClick={() => navigate('forms')}>Retour aux formulaires</button>
        </div>
      );
    }
    if (route.rest[1] === 'borne') {
      // Ancienne adresse : la borne a sa propre route, hors de l'application.
      navigate('borne', def.id);
      return null;
    }
    return <Editor key={formId} formId={formId} initialTab={route.rest[1]} />;
  }
  return <FormList />;
}
