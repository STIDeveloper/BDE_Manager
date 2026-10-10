import { useState } from 'react';
import {
  SlidersHorizontal, RotateCcw, Lock, Unlock, Settings2,
  ChevronDown, Info, Minus, Plus, ExternalLink,
} from 'lucide-react';
import { useRolesStore } from '../../roleEngine/store.js';
import { useStore } from '../../store.js';
import { useCatalog } from '../../core/useCatalog.js';
import { CATALOG_LIMITS } from '../../core/catalog.js';
import { toast } from '../ui/toastStore';
import { confirmDialog } from '../ui/confirmStore';

const WEIGHT_LABELS = {
  P: { label: 'Préférence', help: 'Poids donné au rang du choix (1er > 2e > 3e)' },
  D: { label: 'Disponibilité', help: 'Adéquation disponibilité vs exigence du poste' },
  E: { label: 'Expérience', help: 'Ancienneté, continuité du rôle' },
  A: { label: 'Ambition', help: 'Cohérence entre ambition déclarée et niveau du poste' },
  M: { label: 'Motivation', help: 'Spécificité du texte de motivation' },
  F: { label: 'Formation', help: 'Affinité formation ↔ pôle' },
};

const PENALTY_LABELS = {
  alternanceOnBureau: 'Alternance sur poste Bureau',
  alternanceOnResponsable: 'Alternance sur poste Responsable',
  lowAvailabilityOnLeadership: 'Dispo faible sur poste clé',
  contradiction: 'Contradiction détectée',
  nonRequested: 'Poste hors des 3 choix',
};

function Slider({ value, onChange, min = 0, max = 1, step = 0.01, label, valueText }) {
  return (
    <input
      type="range"
      aria-label={label}
      aria-valuetext={valueText}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full accent-blue-500 h-1 rounded-full bg-elevated cursor-pointer"
    />
  );
}

/**
 * @param {object} props
 * @param {() => void} [props.onOpenRolesManager]  Ouvre « Gestion des rôles »
 *   (bouton affiché uniquement si fourni).
 */
export default function WeightsPanel({ onOpenRolesManager }) {
  const weights = useRolesStore(s => s.weights);
  const penalties = useRolesStore(s => s.penalties);
  const minScore = useRolesStore(s => s.minScore);
  const lockedCount = useRolesStore(s => s.lockedPairs.length);
  const setWeight = useRolesStore(s => s.setWeight);
  const setPenalty = useRolesStore(s => s.setPenalty);
  const setMinScore = useRolesStore(s => s.setMinScore);
  const resetWeights = useRolesStore(s => s.resetWeights);
  const clearLocks = useRolesStore(s => s.clearLocks);
  // Les capacités appartiennent au catalogue (source de vérité unique)
  const setRoleCapacity = useStore(s => s.setRoleCapacity);
  const { poleList, rolesByPole } = useCatalog();

  const [showCapacities, setShowCapacities] = useState(false);
  const [showPenalties, setShowPenalties] = useState(true);

  const sumWeights = Object.values(weights).reduce((s, v) => s + v, 0);

  const handleReset = async () => {
    const ok = await confirmDialog({
      title: 'Réinitialiser les pondérations ?',
      message: 'Les poids, les pénalités et le seuil d\'éligibilité reviennent à leurs valeurs par défaut. Les capacités, contraintes et verrous ne changent pas.',
      confirmLabel: 'Réinitialiser',
      tone: 'warning',
    });
    if (!ok) return;
    resetWeights();
    toast.info('Paramètres réinitialisés');
  };

  const handleClearLocks = async () => {
    const ok = await confirmDialog({
      title: 'Retirer tous les verrous ?',
      message: `${lockedCount} verrou${lockedCount > 1 ? 's' : ''} posé${lockedCount > 1 ? 's' : ''} depuis l'organigramme ser${lockedCount > 1 ? 'ont' : 'a'} retiré${lockedCount > 1 ? 's' : ''}.`,
      confirmLabel: 'Retirer',
      tone: 'warning',
    });
    if (!ok) return;
    clearLocks();
    toast.info('Verrous supprimés');
  };

  const setCap = (roleId, v) => {
    const n = Math.max(0, Math.min(CATALOG_LIMITS.maxCapacity, Math.round(Number(v) || 0)));
    setRoleCapacity(roleId, n);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={16} className="text-purple-500" />
          <h3 className="text-sm font-semibold text-ink">Réglage des pondérations</h3>
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
            Math.abs(sumWeights - 1) < 0.01
              ? 'bg-emerald-500/10 text-emerald-500'
              : 'bg-amber-500/10 text-amber-500'
          }`}>
            Σ = {sumWeights.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {lockedCount > 0 && (
            <button
              type="button"
              onClick={handleClearLocks}
              title="Retirer tous les verrous posés depuis l'organigramme"
              className="text-xs text-dim hover:text-ink flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-line transition-colors">
              <Unlock size={12} aria-hidden="true" /> {lockedCount} verrou{lockedCount > 1 ? 's' : ''}
            </button>
          )}
          <button
            type="button"
            onClick={handleReset}
            className="text-xs text-dim hover:text-ink flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-line transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>

      {/* Poids */}
      <div className="bg-surface border border-line rounded-xl p-4 space-y-3.5">
        {Object.entries(WEIGHT_LABELS).map(([key, meta]) => (
          <div key={key}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-ink">{meta.label}</span>
                <span className="text-[10px] text-muted font-mono">{key}</span>
              </div>
              <span className="text-xs font-mono text-ink tabular-nums">
                {(weights[key] * 100).toFixed(0)}%
              </span>
            </div>
            <Slider
              value={weights[key]}
              onChange={(v) => setWeight(key, v)}
              label={`Poids : ${meta.label}`}
              valueText={`${(weights[key] * 100).toFixed(0)} %`}
            />
            <p className="text-[10px] text-muted mt-1">{meta.help}</p>
          </div>
        ))}
        <div className="pt-3 border-t border-line">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-dim">Seuil d'éligibilité</span>
            <span className="text-xs font-mono text-ink tabular-nums">{minScore}</span>
          </div>
          <Slider
            value={minScore}
            onChange={setMinScore}
            label="Seuil d'éligibilité"
            min={0}
            max={100}
            step={1}
          />
          <p className="text-[10px] text-muted mt-1">
            Score minimum pour qu'un candidat soit éligible à un poste. En dessous, le poste reste vacant.
          </p>
        </div>
      </div>

      {/* Pénalités */}
      <div className="bg-surface border border-line rounded-xl overflow-hidden">
        <button
          type="button"
          aria-expanded={showPenalties}
          onClick={() => setShowPenalties(!showPenalties)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-elevated/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Settings2 size={14} className="text-dim" />
            <span className="text-sm font-medium text-ink">Pénalités</span>
          </div>
          <ChevronDown size={14} className={`text-dim transition-transform ${showPenalties ? 'rotate-180' : ''}`} />
        </button>

        {showPenalties && (
          <div className="px-4 pb-4 pt-1 border-t border-line space-y-3">
            {Object.entries(PENALTY_LABELS).map(([key, label]) => (
              <div key={key}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-dim">{label}</span>
                  <span className="text-xs font-mono text-ink tabular-nums">−{penalties[key]}</span>
                </div>
                <Slider
                  value={penalties[key]}
                  onChange={(v) => setPenalty(key, v)}
                  label={`Pénalité : ${label}`}
                  min={0}
                  max={40}
                  step={1}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Capacités */}
      <div className="bg-surface border border-line rounded-xl overflow-hidden">
        <button
          type="button"
          aria-expanded={showCapacities}
          onClick={() => setShowCapacities(!showCapacities)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-elevated/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Lock size={14} className="text-dim" />
            <span className="text-sm font-medium text-ink">Capacités des postes</span>
          </div>
          <ChevronDown size={14} className={`text-dim transition-transform ${showCapacities ? 'rotate-180' : ''}`} />
        </button>

        {showCapacities && (
          <div className="px-4 pb-4 pt-3 border-t border-line max-h-[460px] overflow-y-auto space-y-4">
            <div className="flex items-start gap-2 text-[11px] text-dim bg-elevated border border-line rounded-lg p-2.5">
              <Info size={12} className="text-blue-500 shrink-0 mt-0.5" aria-hidden="true" />
              <span className="flex-1">
                Les rôles, pôles et capacités se gèrent dans « Gestion des rôles ». Les capacités modifiées ici
                sont enregistrées dans ce même catalogue (Ctrl+Z pour annuler).
              </span>
              {onOpenRolesManager && (
                <button type="button" onClick={onOpenRolesManager}
                  className="shrink-0 text-blue-500 hover:text-blue-400 font-medium flex items-center gap-1">
                  Ouvrir <ExternalLink size={11} aria-hidden="true" />
                </button>
              )}
            </div>
            {poleList.filter(p => (rolesByPole[p.id] || []).length > 0).map(pole => (
              <div key={pole.id} role="group" aria-label={`Capacités du pôle ${pole.label}`}>
                <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-2">
                  {pole.emoji} {pole.label}
                </div>
                <div className="space-y-1.5">
                  {rolesByPole[pole.id].map(r => (
                    <div key={r.id} className="flex items-center justify-between gap-3">
                      <label htmlFor={`cap-${r.id}`} className="text-xs text-ink truncate">
                        {r.label}
                        {r.custom && <span className="ml-1.5 text-[9px] text-blue-500 border border-blue-500/30 rounded px-1">perso</span>}
                      </label>
                      <div className="flex items-center gap-1 shrink-0">
                        <button type="button" onClick={() => setCap(r.id, (r.capacity ?? 0) - 1)} disabled={(r.capacity ?? 0) <= 0}
                          aria-label={`Diminuer la capacité de ${r.label}`}
                          className="p-1.5 rounded-md border border-line text-dim hover:text-ink disabled:opacity-40">
                          <Minus size={11} aria-hidden="true" />
                        </button>
                        <input
                          id={`cap-${r.id}`}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={CATALOG_LIMITS.maxCapacity}
                          value={r.capacity ?? 0}
                          onChange={(e) => setCap(r.id, e.target.value)}
                          className="w-14 bg-elevated border border-line rounded-md px-2 py-1 text-xs text-ink text-center font-mono focus:outline-none focus:border-blue-500/50"
                        />
                        <button type="button" onClick={() => setCap(r.id, (r.capacity ?? 0) + 1)} disabled={(r.capacity ?? 0) >= CATALOG_LIMITS.maxCapacity}
                          aria-label={`Augmenter la capacité de ${r.label}`}
                          className="p-1.5 rounded-md border border-line text-dim hover:text-ink disabled:opacity-40">
                          <Plus size={11} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-start gap-2 text-[11px] text-muted bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
        <Info size={12} className="text-blue-500 shrink-0 mt-0.5" />
        <span>
          Toute modification déclenche un recalcul instantané des scénarios.
          Les pondérations sont sauvegardées automatiquement sur cet appareil.
          Les rôles, pôles et capacités se gèrent dans « Gestion des rôles ».
        </span>
      </div>
    </div>
  );
}
