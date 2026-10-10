import React, { useState } from 'react';
import { PackagePlus, AlertTriangle, Check, X, Sparkles } from 'lucide-react';
import { useStore } from '../../store';
import { buildBDEConfig, BDE_NEW_PRESETS } from '../../data/bdeSeed';
import { toast } from '../ui/toastStore';

export default function LoadBDEBanner() {
  const [confirming, setConfirming] = useState(false);

  const handleLoad = () => {
    try {
      const config = buildBDEConfig();

      // Récupère l'état actuel pour fusionner les presets
      const currentState = useStore.getState();
      const mergedPresets = { ...currentState.rolePresets, ...BDE_NEW_PRESETS };

      // Charge tout d'un coup
      useStore.setState({
        columns: config.columns,
        members: config.members,
        drivePermissions: config.drivePermissions,
        rolePresets: mergedPresets,
        permissionNotes: {},
        _history: { past: [], future: [] }, // reset undo
      });

      setConfirming(false);
      toast.success(
        `${config.members.length} membres chargés`,
        'Configuration BDE appliquée'
      );
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors du chargement', err.message);
    }
  };

  // ============ ÉTAT 1 : Proposition ============
  if (!confirming) {
    return (
      <div className="relative overflow-hidden bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-emerald-500/10 border border-line rounded-2xl p-5">
        <div className="absolute -top-8 -right-8 opacity-5 pointer-events-none">
          <PackagePlus size={160} />
        </div>

        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 flex-1 min-w-[240px]">
            <div className="bg-blue-600 p-2.5 rounded-xl shrink-0 shadow-lg">
              <PackagePlus size={20} className="text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-ink flex items-center gap-2">
                Charger la configuration BDE officielle
                <Sparkles size={12} className="text-amber-500" />
              </h3>
              <p className="text-xs text-dim mt-1 leading-relaxed">
                Pré-remplit l'application avec les <strong className="text-ink">22 membres</strong> du BDE,
                la <strong className="text-ink">structure des 5 pôles</strong>,
                et les <strong className="text-ink">permissions Drive</strong> conformes à la charte.
              </p>
              <p className="text-[10px] text-amber-500 mt-2 flex items-center gap-1">
                <AlertTriangle size={10} />
                Remplace tes données actuelles (membres, colonnes, permissions)
              </p>
            </div>
          </div>

          <button
            onClick={() => setConfirming(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors flex items-center gap-2 shrink-0">
            <PackagePlus size={14} /> Charger
          </button>
        </div>
      </div>
    );
  }

  // ============ ÉTAT 2 : Confirmation ============
  return (
    <div className="relative overflow-hidden bg-gradient-to-r from-red-500/10 to-amber-500/10 border border-red-500/40 rounded-2xl p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="bg-red-500 p-2.5 rounded-xl shrink-0">
          <AlertTriangle size={20} className="text-white" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-red-500">
            ⚠️ Confirmation requise
          </h3>
          <p className="text-xs text-dim mt-1 leading-relaxed">
            Cette action va <strong className="text-ink">remplacer intégralement</strong> :
          </p>
          <ul className="text-xs text-dim mt-2 ml-4 space-y-0.5 list-disc">
            <li>La liste des <strong className="text-ink">membres actuels</strong></li>
            <li>Les <strong className="text-ink">colonnes Kanban</strong></li>
            <li>Les <strong className="text-ink">permissions Drive</strong> déjà configurées</li>
            <li>Les <strong className="text-ink">notes</strong> attachées aux permissions</li>
          </ul>
          <p className="text-xs text-amber-500 mt-3">
            💡 Pense à faire un <strong>backup</strong> (bouton ⬇️ en haut) avant si tu veux revenir en arrière.
          </p>
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <button onClick={() => setConfirming(false)}
          className="bg-elevated hover:bg-line text-ink text-sm font-medium px-4 py-2 rounded-xl transition-colors border border-line flex items-center gap-2">
          <X size={14} /> Annuler
        </button>
        <button onClick={handleLoad}
          className="bg-red-600 hover:bg-red-700 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors flex items-center gap-2">
          <Check size={14} /> Confirmer et remplacer
        </button>
      </div>
    </div>
  );
}
