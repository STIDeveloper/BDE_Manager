import { useState } from 'react';
import { PackagePlus, AlertTriangle, Sparkles, X } from 'lucide-react';
import { useStore, selectCatalog } from '../../store';
import { bdeSeedSummary } from '../../data/bdeSeed';
import { buildConvertedBDEConfig } from '../members/seedConversion';
import { toast } from '../ui/toastStore';
import { confirmDialog } from '../ui/confirmStore';

const DISMISS_KEY = 'bde-ui-seed-banner-dismissed';
const SEED = bdeSeedSummary();

function readDismissed() {
  try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
}
function writeDismissed() {
  try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* stockage indisponible : bandeau masqué pour la session */ }
}

/**
 * Chargement de la configuration officielle du BDE.
 * - Bandeau complet : uniquement si aucun membre et non masqué.
 * - Sinon : lien compact (toujours accessible depuis l'onglet Organisation).
 * Le chargement est UNE seule étape annulable (Ctrl+Z).
 */
export default function LoadBDEBanner() {
  const hasMembers = useStore(s => s.members.length > 0);
  const [dismissed, setDismissed] = useState(readDismissed);

  const dismiss = () => { writeDismissed(); setDismissed(true); };

  const handleLoad = async () => {
    const state = useStore.getState();
    const ok = await confirmDialog({
      title: 'Charger la configuration officielle ?',
      message:
        `Cette action REMPLACE tes membres actuels${state.members.length ? ` (${state.members.length})` : ''}, ` +
        'les colonnes Kanban, les permissions Drive individuelles et leurs notes.',
      details: [
        `${SEED.members} membres${SEED.vacancies ? ` + ${SEED.vacancies} poste${SEED.vacancies > 1 ? 's' : ''} vacant${SEED.vacancies > 1 ? 's' : ''}` : ''} répartis en ${SEED.columns} colonnes`,
        'Rôles convertis vers le catalogue (ancien libellé conservé)',
        'Presets Drive officiels ajoutés / mis à jour (les autres sont conservés)',
        'Catalogue de rôles, dossiers Drive et coffre-fort : inchangés',
        'Annulable avec Ctrl+Z (ou le bouton « Annuler » en haut)',
      ],
      confirmLabel: 'Charger et remplacer',
      tone: 'warning',
    });
    if (!ok) return;

    try {
      const s = useStore.getState();
      const config = buildConvertedBDEConfig(selectCatalog(s));
      // Une seule entrée d'historique : l'historique existant est conservé.
      s._pushHistory();
      useStore.setState((st) => ({
        columns: config.columns,
        members: config.members,
        drivePermissions: config.drivePermissions,
        rolePresets: { ...st.rolePresets, ...config.rolePresets },
        permissionNotes: {},
      }));
      const offCatalog = config.members.filter(m => m.mainRole && !s.roles[m.mainRole]).length;
      toast.success(
        'Configuration BDE appliquée',
        `${config.members.length} fiches chargées${offCatalog ? ` (${offCatalog} rôle${offCatalog > 1 ? 's' : ''} hors catalogue)` : ''} — Ctrl+Z pour annuler`
      );
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors du chargement', err?.message);
    }
  };

  // ============ Lien compact ============
  if (hasMembers || dismissed) {
    return (
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleLoad}
          className="text-xs text-dim hover:text-blue-500 inline-flex items-center gap-1.5 px-2 py-1 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
        >
          <PackagePlus size={13} aria-hidden="true" /> Charger la config officielle du BDE…
        </button>
      </div>
    );
  }

  // ============ Bandeau complet (aucun membre) ============
  return (
    <section
      aria-label="Configuration BDE officielle"
      className="relative overflow-hidden bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-emerald-500/10 border border-line rounded-2xl p-4 sm:p-5"
    >
      <div className="absolute -top-8 -right-8 opacity-5 pointer-events-none" aria-hidden="true">
        <PackagePlus size={160} />
      </div>

      <button
        type="button"
        onClick={dismiss}
        aria-label="Masquer ce bandeau"
        title="Masquer (le lien reste disponible)"
        className="absolute top-2 right-2 text-dim hover:text-ink p-1.5 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
      >
        <X size={16} aria-hidden="true" />
      </button>

      <div className="relative flex items-start justify-between gap-4 flex-wrap pr-6">
        <div className="flex items-start gap-3 flex-1 min-w-[220px]">
          <div className="bg-blue-600 p-2.5 rounded-xl shrink-0 shadow-lg" aria-hidden="true">
            <PackagePlus size={20} className="text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-ink flex items-center gap-2">
              Charger la configuration BDE officielle
              <Sparkles size={12} className="text-amber-500" aria-hidden="true" />
            </h3>
            <p className="text-xs text-dim mt-1 leading-relaxed">
              Pré-remplit l'application avec les <strong className="text-ink">{SEED.members} membres</strong> du BDE,
              la <strong className="text-ink">structure en {SEED.columns} colonnes</strong>,
              et les <strong className="text-ink">permissions Drive</strong> conformes à la charte.
            </p>
            <p className="text-[11px] text-amber-500 mt-2 flex items-center gap-1">
              <AlertTriangle size={11} aria-hidden="true" />
              Remplace tes données actuelles (membres, colonnes, permissions) — annulable avec Ctrl+Z
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLoad}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors flex items-center gap-2 shrink-0">
          <PackagePlus size={14} aria-hidden="true" /> Charger…
        </button>
      </div>
    </section>
  );
}
