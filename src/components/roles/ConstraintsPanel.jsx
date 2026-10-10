import { useState } from 'react';
import {
  Lock, Shield, Star, Trash2, Plus, Wand2, Check,
} from 'lucide-react';
import { useRolesStore } from '../../roleEngine/store.js';
import { useCatalog } from '../../core/useCatalog.js';
import { BDE_MONTREUIL_PRESET } from '../../roleEngine/constraints.js';
import { toast } from '../ui/toastStore';
import { confirmDialog } from '../ui/confirmStore';

const INPUT_CLS = 'flex-1 min-w-0 bg-elevated border border-line rounded-lg px-2 py-1.5 text-xs text-ink focus:outline-none focus:border-blue-500';

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
  const { roles, roleList } = useCatalog();
  const forcedRoles = useRolesStore(s => s.constraints.forcedRoles);
  const candidates = useRolesStore(s => s.candidates);
  const updateForcedRole = useRolesStore(s => s.updateForcedRole);
  const [newKey, setNewKey] = useState('');
  const [newRole, setNewRole] = useState('');

  const entries = Object.entries(forcedRoles || {});

  const handleAdd = () => {
    if (!newKey.trim() || !newRole) return;
    updateForcedRole(newKey.trim().toLowerCase(), newRole);
    setNewKey(''); setNewRole('');
    toast.success('Contrainte ajoutée', `${newKey} → ${(roles[newRole]?.label || newRole)}`);
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
            const role = roles[roleId];
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
                <button type="button" onClick={() => updateForcedRole(key, null)}
                  aria-label={`Supprimer le rôle forcé de « ${key} »`} title="Supprimer"
                  className="text-dim hover:text-red-500 p-1 shrink-0">
                  <Trash2 size={11} aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-2 pt-2 border-t border-line">
        <input type="text" value={newKey} onChange={(e) => setNewKey(e.target.value)}
          placeholder="Prénom/Nom" aria-label="Prénom ou nom du candidat"
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          className={INPUT_CLS} />
        <select value={newRole} onChange={(e) => setNewRole(e.target.value)} aria-label="Rôle"
          className={INPUT_CLS}>
          <option value="">Choisir un rôle…</option>
          {roleList.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
        <button type="button" onClick={handleAdd} disabled={!newKey.trim() || !newRole} aria-label="Ajouter le rôle forcé"
          className="bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white px-3 rounded-lg text-xs font-medium transition-colors">
          <Plus size={12} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Section : Niveaux plafonnés
// ============================================================
function MaxLevelsSection() {
  const { levelList, levelLabel } = useCatalog();
  const maxLevels = useRolesStore(s => s.constraints.maxLevels);
  const updateMaxLevel = useRolesStore(s => s.updateMaxLevel);
  const [newKey, setNewKey] = useState('');
  // Niveau le plus bas du catalogue par défaut (les niveaux sont personnalisables)
  const [newLevelChoice, setNewLevel] = useState('');
  const newLevel = levelList.some(l => l.id === newLevelChoice) ? newLevelChoice : (levelList.at(-1)?.id || '');

  const entries = Object.entries(maxLevels || {});

  const handleAdd = () => {
    if (!newKey.trim() || !newLevel) return;
    updateMaxLevel(newKey.trim().toLowerCase(), newLevel);
    setNewKey('');
    toast.success('Niveau max ajouté', `${newKey} plafonné à « ${levelLabel(newLevel)} »`);
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
              <span className="text-xs font-medium text-ink flex-1">{levelLabel(level)}</span>
              <button type="button" onClick={() => updateMaxLevel(key, null)}
                aria-label={`Supprimer le plafond de « ${key} »`} title="Supprimer"
                className="text-dim hover:text-red-500 p-1 shrink-0">
                <Trash2 size={11} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 pt-2 border-t border-line">
        <input type="text" value={newKey} onChange={(e) => setNewKey(e.target.value)}
          placeholder="Prénom/Nom" aria-label="Prénom ou nom du candidat"
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          className={INPUT_CLS} />
        <select value={newLevel} onChange={(e) => setNewLevel(e.target.value)} aria-label="Niveau maximum"
          className={INPUT_CLS}>
          {levelList.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
        <button type="button" onClick={handleAdd} disabled={!newKey.trim() || !newLevel} aria-label="Ajouter le plafond"
          className="bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-white px-3 rounded-lg text-xs font-medium transition-colors">
          <Plus size={12} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Section : Rôles préférés (bonus)
// ============================================================
function PreferredRolesSection() {
  const { roles, roleList } = useCatalog();
  const preferredRoles = useRolesStore(s => s.constraints.preferredRoles);
  const preferredBonus = useRolesStore(s => s.constraints.preferredBonus);
  const updatePreferredRole = useRolesStore(s => s.updatePreferredRole);
  const [newKey, setNewKey] = useState('');
  const [newRole, setNewRole] = useState('');

  const entries = Object.entries(preferredRoles || {});

  const handleAdd = () => {
    if (!newKey.trim() || !newRole) return;
    updatePreferredRole(newKey.trim().toLowerCase(), newRole);
    setNewKey(''); setNewRole('');
    toast.success('Bonus ajouté', `${newKey} → ${roles[newRole]?.label || newRole} (+${preferredBonus || 8})`);
  };

  return (
    <div className="bg-surface border border-line rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Star size={14} className="text-blue-500" />
        <h4 className="text-sm font-semibold text-ink">Rôles préférés (bonus)</h4>
        <span className="text-[10px] text-muted">+{preferredBonus || 8} pts sans forcer</span>
      </div>

      {entries.length === 0 ? (
        <p className="text-xs text-dim italic">Aucun bonus.</p>
      ) : (
        <div className="space-y-1.5">
          {entries.map(([key, roleId]) => {
            const role = roles[roleId];
            return (
              <div key={key} className="flex items-center gap-2 bg-elevated border border-line rounded-lg px-3 py-2">
                <span className="text-xs font-mono text-blue-500 shrink-0">"{key}"</span>
                <span className="text-dim text-xs">→</span>
                <span className="text-xs font-medium text-ink flex-1 truncate">{role?.label || roleId}</span>
                <button type="button" onClick={() => updatePreferredRole(key, null)}
                  aria-label={`Supprimer le bonus de « ${key} »`} title="Supprimer"
                  className="text-dim hover:text-red-500 p-1 shrink-0">
                  <Trash2 size={11} aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-2 pt-2 border-t border-line">
        <input type="text" value={newKey} onChange={(e) => setNewKey(e.target.value)}
          placeholder="Prénom/Nom" aria-label="Prénom ou nom du candidat"
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          className={INPUT_CLS} />
        <select value={newRole} onChange={(e) => setNewRole(e.target.value)} aria-label="Rôle"
          className={INPUT_CLS}>
          <option value="">Choisir un rôle…</option>
          {roleList.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
        <button type="button" onClick={handleAdd} disabled={!newKey.trim() || !newRole} aria-label="Ajouter le bonus"
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white px-3 rounded-lg text-xs font-medium transition-colors">
          <Plus size={12} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Panneau principal
// ============================================================
export default function ConstraintsPanel() {
  const loadPreset = useRolesStore(s => s.loadPreset);
  const clearConstraints = useRolesStore(s => s.clearConstraints);
  const { roleLabel, levelLabel } = useCatalog();

  const handleLoadPreset = async () => {
    const p = BDE_MONTREUIL_PRESET;
    const cap = (k) => k.charAt(0).toUpperCase() + k.slice(1);
    // Détails générés depuis le preset + libellés du catalogue courant
    const details = [
      ...Object.entries(p.forcedRoles || {}).map(([k, r]) => `${cap(k)} → ${roleLabel(r)} (forcé)`),
      ...Object.entries(p.maxLevels || {}).map(([k, l]) => `${cap(k)} → ${levelLabel(l)} maximum (plafond)`),
      ...Object.entries(p.preferredRoles || {}).map(([k, r]) => `${cap(k)} → ${roleLabel(r)} (bonus)`),
    ];
    const ok = await confirmDialog({
      title: 'Charger le preset BDE IUT Montreuil ?',
      message: 'Tes contraintes actuelles seront REMPLACÉES par celles-ci (les rôles absents du catalogue sont ignorés) :',
      details,
      confirmLabel: 'Charger le preset',
      tone: 'warning',
    });
    if (!ok) return;
    loadPreset(BDE_MONTREUIL_PRESET);
    toast.success('Preset BDE appliqué');
  };

  const handleClear = async () => {
    const ok = await confirmDialog({
      title: 'Effacer toutes les contraintes ?',
      message: 'Rôles forcés, plafonds de niveau et bonus seront supprimés. Les scénarios sont recalculés aussitôt.',
      confirmLabel: 'Tout effacer',
      tone: 'danger',
    });
    if (!ok) return;
    clearConstraints();
    toast.info('Contraintes effacées');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Lock size={16} className="text-red-500" />
          <h3 className="text-sm font-semibold text-ink">Contraintes personnalisées</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={handleLoadPreset}
            className="text-xs bg-elevated hover:bg-line border border-line text-ink px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5">
            <Wand2 size={11} aria-hidden="true" /> Charger preset BDE
          </button>
          <button type="button" onClick={handleClear}
            className="text-xs bg-elevated hover:bg-red-500/10 border border-line text-dim hover:text-red-500 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5">
            <Trash2 size={11} aria-hidden="true" /> Tout effacer
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
