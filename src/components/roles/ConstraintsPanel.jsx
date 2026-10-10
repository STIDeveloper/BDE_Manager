import React, { useState } from 'react';
import {
  Lock, Shield, Star, Trash2, Plus, Wand2, Check,
} from 'lucide-react';
import { useRolesStore } from '../../roleEngine/store.js';
import { ROLES, getRoleById } from '../../core/roles.js';
import { BDE_MONTREUIL_PRESET } from '../../roleEngine/constraints.js';
import { toast } from '../ui/toastStore';

// ============================================================
// Utilitaires
// ============================================================
function findCandidatesByKey(key, candidates) {
  const k = key.toLowerCase().trim();
  return candidates.filter(c =>
    (c.firstName || '').toLowerCase().startsWith(k) ||
    (c.lastName || '').toLowerCase().startsWith(k) ||
    (c.displayName || '').toLowerCase().includes(k)
  );
}

// ============================================================
// Section : Rôles forcés
// ============================================================
function ForcedRolesSection() {
  const { constraints, candidates, updateForcedRole } = useRolesStore();
  const [newKey, setNewKey] = useState('');
  const [newRole, setNewRole] = useState('');

  const entries = Object.entries(constraints.forcedRoles || {});

  const handleAdd = () => {
    if (!newKey.trim() || !newRole) return;
    updateForcedRole(newKey.trim().toLowerCase(), newRole);
    setNewKey(''); setNewRole('');
    toast.success('Contrainte ajoutée', `${newKey} → ${getRoleById(newRole)?.label}`);
  };

  return (
    <div className="bg-surface border border-line rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Lock size={14} className="text-red-500" />
        <h4 className="text-sm font-semibold text-ink">Rôles forcés</h4>
        <span className="text-[10px] text-muted">Score 100 sur ce rôle, 0 ailleurs</span>
      </div>

      {entries.length === 0 ? (
        <p className="text-xs text-dim italic">Aucune contrainte forcée.</p>
      ) : (
        <div className="space-y-1.5">
          {entries.map(([key, roleId]) => {
            const role = getRoleById(roleId);
            const matched = findCandidatesByKey(key, candidates);
            const matchLabel = matched.length > 0
              ? matched.map(c => `${c.firstName} ${c.lastName}`).join(', ')
              : '⚠️ aucun candidat';
            return (
              <div key={key} className="flex items-center gap-2 bg-elevated border border-line rounded-lg px-3 py-2">
                <span className="text-xs font-mono text-blue-500 shrink-0">"{key}"</span>
                <span className="text-dim text-xs">→</span>
                <span className="text-xs font-medium text-ink flex-1 truncate">
                  {role?.label || roleId}
                </span>
                <span className={`text-[10px] shrink-0 ${matched.length > 0 ? 'text-emerald-500' : 'text-amber-500'}`}>
                  {matchLabel}
                </span>
                <button onClick={() => updateForcedRole(key, null)}
                  className="text-dim hover:text-red-500 p-0.5 shrink-0">
                  <Trash2 size={11} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-2 pt-2 border-t border-line">
        <input type="text" value={newKey} onChange={(e) => setNewKey(e.target.value)}
          placeholder="Prénom/Nom"
          className="flex-1 bg-elevated border border-line rounded-lg px-2 py-1.5 text-xs text-ink focus:outline-none focus:border-blue-500" />
        <select value={newRole} onChange={(e) => setNewRole(e.target.value)}
          className="flex-1 bg-elevated border border-line rounded-lg px-2 py-1.5 text-xs text-ink focus:outline-none focus:border-blue-500">
          <option value="">Choisir un rôle…</option>
          {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
        <button onClick={handleAdd} disabled={!newKey.trim() || !newRole}
          className="bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white px-3 rounded-lg text-xs font-medium transition-colors">
          <Plus size={12} />
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Section : Niveaux plafonnés
// ============================================================
function MaxLevelsSection() {
  const { constraints, updateMaxLevel } = useRolesStore();
  const [newKey, setNewKey] = useState('');
  const [newLevel, setNewLevel] = useState('membre');

  const entries = Object.entries(constraints.maxLevels || {});
  const LEVELS = ['bureau', 'responsable', 'adjoint', 'membre'];

  const handleAdd = () => {
    if (!newKey.trim()) return;
    updateMaxLevel(newKey.trim().toLowerCase(), newLevel);
    setNewKey('');
    toast.success('Niveau max ajouté', `${newKey} plafonné à "${newLevel}"`);
  };

  return (
    <div className="bg-surface border border-line rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Shield size={14} className="text-amber-500" />
        <h4 className="text-sm font-semibold text-ink">Niveaux plafonnés</h4>
        <span className="text-[10px] text-muted">Interdit tout poste au-dessus</span>
      </div>

      {entries.length === 0 ? (
        <p className="text-xs text-dim italic">Aucun plafond.</p>
      ) : (
        <div className="space-y-1.5">
          {entries.map(([key, level]) => (
            <div key={key} className="flex items-center gap-2 bg-elevated border border-line rounded-lg px-3 py-2">
              <span className="text-xs font-mono text-amber-500 shrink-0">"{key}"</span>
              <span className="text-dim text-xs">≤</span>
              <span className="text-xs font-medium text-ink flex-1">{level}</span>
              <button onClick={() => updateMaxLevel(key, null)}
                className="text-dim hover:text-red-500 p-0.5 shrink-0">
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 pt-2 border-t border-line">
        <input type="text" value={newKey} onChange={(e) => setNewKey(e.target.value)}
          placeholder="Prénom/Nom"
          className="flex-1 bg-elevated border border-line rounded-lg px-2 py-1.5 text-xs text-ink focus:outline-none focus:border-blue-500" />
        <select value={newLevel} onChange={(e) => setNewLevel(e.target.value)}
          className="flex-1 bg-elevated border border-line rounded-lg px-2 py-1.5 text-xs text-ink focus:outline-none focus:border-blue-500">
          {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <button onClick={handleAdd} disabled={!newKey.trim()}
          className="bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-white px-3 rounded-lg text-xs font-medium transition-colors">
          <Plus size={12} />
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Section : Rôles préférés (bonus)
// ============================================================
function PreferredRolesSection() {
  const { constraints, updatePreferredRole } = useRolesStore();
  const [newKey, setNewKey] = useState('');
  const [newRole, setNewRole] = useState('');

  const entries = Object.entries(constraints.preferredRoles || {});

  const handleAdd = () => {
    if (!newKey.trim() || !newRole) return;
    updatePreferredRole(newKey.trim().toLowerCase(), newRole);
    setNewKey(''); setNewRole('');
    toast.success('Bonus ajouté', `${newKey} → +${constraints.preferredBonus || 8}`);
  };

  return (
    <div className="bg-surface border border-line rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Star size={14} className="text-blue-500" />
        <h4 className="text-sm font-semibold text-ink">Rôles préférés (bonus)</h4>
        <span className="text-[10px] text-muted">+{constraints.preferredBonus || 8} pts sans forcer</span>
      </div>

      {entries.length === 0 ? (
        <p className="text-xs text-dim italic">Aucun bonus.</p>
      ) : (
        <div className="space-y-1.5">
          {entries.map(([key, roleId]) => {
            const role = getRoleById(roleId);
            return (
              <div key={key} className="flex items-center gap-2 bg-elevated border border-line rounded-lg px-3 py-2">
                <span className="text-xs font-mono text-blue-500 shrink-0">"{key}"</span>
                <span className="text-dim text-xs">→</span>
                <span className="text-xs font-medium text-ink flex-1 truncate">{role?.label || roleId}</span>
                <button onClick={() => updatePreferredRole(key, null)}
                  className="text-dim hover:text-red-500 p-0.5 shrink-0">
                  <Trash2 size={11} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-2 pt-2 border-t border-line">
        <input type="text" value={newKey} onChange={(e) => setNewKey(e.target.value)}
          placeholder="Prénom/Nom"
          className="flex-1 bg-elevated border border-line rounded-lg px-2 py-1.5 text-xs text-ink focus:outline-none focus:border-blue-500" />
        <select value={newRole} onChange={(e) => setNewRole(e.target.value)}
          className="flex-1 bg-elevated border border-line rounded-lg px-2 py-1.5 text-xs text-ink focus:outline-none focus:border-blue-500">
          <option value="">Choisir un rôle…</option>
          {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
        <button onClick={handleAdd} disabled={!newKey.trim() || !newRole}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white px-3 rounded-lg text-xs font-medium transition-colors">
          <Plus size={12} />
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Panneau principal
// ============================================================
export default function ConstraintsPanel() {
  const { loadPreset, clearConstraints } = useRolesStore();

  const handleLoadPreset = () => {
    if (window.confirm(
      '⚠️ Charger le preset BDE IUT Montreuil ?\n\n' +
      'Cela va ajouter :\n' +
      '• Kenzo → Président (forcé)\n' +
      '• Bilal → Trésorier (forcé)\n' +
      '• Marchetti → Responsable Communication (forcé)\n' +
      '• Ferrandi → Membre (plafond)\n' +
      '• Hachemi → Membre E-Sport (bonus)\n' +
      '• Valentin → Responsable Communication (bonus)\n\n' +
      'Tes contraintes actuelles seront REMPLACÉES.'
    )) {
      loadPreset(BDE_MONTREUIL_PRESET);
      toast.success('Preset BDE appliqué');
    }
  };

  const handleClear = () => {
    if (window.confirm('Effacer TOUTES les contraintes ?')) {
      clearConstraints();
      toast.info('Contraintes effacées');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Lock size={16} className="text-red-500" />
          <h3 className="text-sm font-semibold text-ink">Contraintes personnalisées</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={handleLoadPreset}
            className="text-xs bg-elevated hover:bg-line border border-line text-ink px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5">
            <Wand2 size={11} /> Charger preset BDE
          </button>
          <button onClick={handleClear}
            className="text-xs bg-elevated hover:bg-red-500/10 border border-line text-dim hover:text-red-500 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5">
            <Trash2 size={11} /> Tout effacer
          </button>
        </div>
      </div>

      <div className="flex items-start gap-2 text-[11px] text-muted bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
        <Check size={12} className="text-blue-500 shrink-0 mt-0.5" />
        <span>
          Les contraintes sont <strong className="text-ink">externes au moteur</strong>. Elles s'appliquent au-dessus du score algorithmique.
        </span>
      </div>

      <ForcedRolesSection />
      <MaxLevelsSection />
      <PreferredRolesSection />
    </div>
  );
}
