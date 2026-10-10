import React, { useState } from 'react';
import {
  SlidersHorizontal, RotateCcw, Lock, Unlock, Settings2,
  ChevronDown, Info,
} from 'lucide-react';
import { useRolesStore } from '../../roleEngine/store.js';
import { ROLE_CATALOG } from '../../roleEngine/config.js';
import { toast } from '../ui/toastStore';

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

function Slider({ value, onChange, min = 0, max = 1, step = 0.01 }) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full accent-blue-500 h-1 rounded-full bg-elevated cursor-pointer"
    />
  );
}

export default function WeightsPanel() {
  const {
    weights, penalties, capacities, minScore,
    setWeight, setPenalty, setCapacity, setMinScore,
    resetWeights, clearLocks, lockedPairs,
  } = useRolesStore();

  const [showCapacities, setShowCapacities] = useState(false);
  const [showPenalties, setShowPenalties] = useState(true);

  const sumWeights = Object.values(weights).reduce((s, v) => s + v, 0);

  const handleReset = () => {
    if (window.confirm('Réinitialiser tous les paramètres par défaut ?')) {
      resetWeights();
      toast.info('Paramètres réinitialisés');
    }
  };

  // Regroupement des rôles par pôle pour la config des capacités
  const rolesByPole = {};
  ROLE_CATALOG.forEach(r => {
    if (!rolesByPole[r.pole]) rolesByPole[r.pole] = [];
    rolesByPole[r.pole].push(r);
  });

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
          {lockedPairs.length > 0 && (
            <button
              onClick={() => { clearLocks(); toast.info('Verrous supprimés'); }}
              className="text-xs text-dim hover:text-ink flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-line transition-colors">
              <Unlock size={12} /> {lockedPairs.length} verrou{lockedPairs.length > 1 ? 's' : ''}
            </button>
          )}
          <button
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
          <div className="px-4 pb-4 pt-1 border-t border-line max-h-[400px] overflow-y-auto space-y-4">
            {Object.entries(rolesByPole).map(([pole, roles]) => (
              <div key={pole}>
                <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-2">
                  {pole}
                </div>
                <div className="space-y-1.5">
                  {roles.map(r => (
                    <div key={r.id} className="flex items-center justify-between gap-3">
                      <span className="text-xs text-ink truncate">{r.label}</span>
                      <input
                        type="number"
                        min={0}
                        max={50}
                        value={capacities[r.id] ?? 0}
                        onChange={(e) => setCapacity(r.id, parseInt(e.target.value, 10) || 0)}
                        className="w-14 bg-elevated border border-line rounded-md px-2 py-1 text-xs text-ink text-center font-mono focus:outline-none focus:border-blue-500/50"
                      />
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
          Les pondérations sont sauvegardées automatiquement dans ton navigateur.
        </span>
      </div>
    </div>
  );
}
