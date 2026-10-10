import React, { useState, useEffect } from 'react';
import { useStore, hashPassword, ENTRY_TYPES } from '../store';
import { Lock, Unlock, Plus, ShieldCheck, Search, AlertTriangle } from 'lucide-react';
import VaultEntryCard from './VaultEntryCard';
import VaultEntryFormModal from './VaultEntryFormModal';
import { toast } from './ui/toastStore';

export default function Vault() {
  const { masterHash, setMasterHash, vaultEntries, resetVault } = useStore();
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [modal, setModal] = useState({ open: false, entry: null });

  useEffect(() => {
    if (sessionStorage.getItem('vault_unlocked') === 'true' && masterHash) setUnlocked(true);
  }, [masterHash]);

  const handleSetup = async (e) => {
    e.preventDefault(); setError('');
    if (password.length < 4) return setError('Le mot de passe doit contenir au moins 4 caractères.');
    if (password !== confirmPassword) return setError('Les deux mots de passe ne correspondent pas.');
    const hash = await hashPassword(password);
    setMasterHash(hash);
    sessionStorage.setItem('vault_unlocked', 'true');
    setUnlocked(true); setPassword(''); setConfirmPassword('');
    toast.success('Coffre-fort créé');
  };

  const handleUnlock = async (e) => {
    e.preventDefault(); setError('');
    const hash = await hashPassword(password);
    if (hash === masterHash) {
      sessionStorage.setItem('vault_unlocked', 'true');
      setUnlocked(true); setPassword('');
      toast.success('Coffre-fort déverrouillé');
    } else {
      setError('Mot de passe incorrect.');
      setPassword('');
    }
  };

  const handleLock = () => {
    sessionStorage.removeItem('vault_unlocked');
    setUnlocked(false);
    toast.info('Coffre-fort verrouillé');
  };

  const handleReset = () => {
    if (window.confirm('⚠️ ATTENTION : Cela supprimera DÉFINITIVEMENT le mot de passe maître ET toutes les entrées. Continuer ?')) {
      resetVault();
      sessionStorage.removeItem('vault_unlocked');
      setUnlocked(false);
      toast.warn('Coffre-fort réinitialisé');
    }
  };

  const inputCls = "w-full bg-elevated border border-line rounded-xl px-4 py-3 text-ink placeholder-dim focus:outline-none focus:border-red-500";

  // ============ ÉCRAN 1 : Création ============
  if (!masterHash) {
    return (
      <div className="max-w-md mx-auto mt-12">
        <div className="bg-surface border border-line rounded-2xl p-8">
          <div className="flex justify-center mb-4">
            <div className="bg-red-500/10 p-4 rounded-full">
              <ShieldCheck size={40} className="text-red-500" />
            </div>
          </div>
          <h2 className="text-2xl font-bold mb-2 text-center text-ink">Créer le coffre-fort</h2>
          <p className="text-dim mb-6 text-center text-sm">
            Choisis un mot de passe maître. Il protègera l'accès à toutes les données sensibles.<br />
            <span className="text-amber-500">⚠️ Aucun moyen de le récupérer s'il est perdu.</span>
          </p>
          <form onSubmit={handleSetup} className="space-y-3">
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Mot de passe maître" className={inputCls} autoFocus />
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirmer le mot de passe" className={inputCls} />
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button type="submit"
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl transition-colors">
              Créer le coffre-fort
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ============ ÉCRAN 2 : Verrouillé ============
  if (!unlocked) {
    return (
      <div className="max-w-md mx-auto mt-12">
        <div className="bg-surface border border-line rounded-2xl p-8">
          <div className="flex justify-center mb-4">
            <div className="bg-red-500/10 p-4 rounded-full">
              <Lock size={40} className="text-red-500" />
            </div>
          </div>
          <h2 className="text-2xl font-bold mb-2 text-center text-ink">Coffre-fort verrouillé</h2>
          <p className="text-dim mb-6 text-center text-sm">
            Entre ton mot de passe maître pour accéder aux données sensibles.
          </p>
          <form onSubmit={handleUnlock} className="space-y-3">
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Mot de passe maître" className={inputCls} autoFocus />
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button type="submit"
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
              <Unlock size={16} /> Déverrouiller
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ============ ÉCRAN 3 : Déverrouillé ============
  const filtered = vaultEntries.filter(e => {
    const matchSearch = !search ||
      e.label.toLowerCase().includes(search.toLowerCase()) ||
      e.value.toLowerCase().includes(search.toLowerCase());
    const matchType = !filterType || e.type === filterType;
    return matchSearch && matchType;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-500/10 p-3 rounded-xl">
            <Unlock size={24} className="text-emerald-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-ink">Coffre-fort déverrouillé</h2>
            <p className="text-xs text-dim">
              {vaultEntries.length} entrée{vaultEntries.length > 1 ? 's' : ''} sécurisée{vaultEntries.length > 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleReset}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-elevated hover:bg-red-500/10 text-dim hover:text-red-500 text-sm transition-colors border border-line"
            title="Réinitialiser tout le coffre">
            <AlertTriangle size={14} /> Reset
          </button>
          <button onClick={handleLock}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-elevated hover:bg-line text-ink text-sm font-medium transition-colors border border-line">
            <Lock size={14} /> Verrouiller
          </button>
          <button onClick={() => setModal({ open: true, entry: null })}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition-colors">
            <Plus size={14} /> Ajouter
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="flex-1 min-w-[200px] relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher dans le coffre..."
            className="w-full bg-surface border border-line rounded-xl pl-9 pr-3 py-2 text-ink placeholder-dim focus:outline-none focus:border-red-500 text-sm" />
        </div>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
          className="bg-surface border border-line rounded-xl px-3 py-2 text-ink text-sm focus:outline-none focus:border-red-500">
          <option value="">Tous les types</option>
          {ENTRY_TYPES.map(t => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-dim">
          {vaultEntries.length === 0 ? (
            <>
              <ShieldCheck size={48} className="mx-auto mb-3 opacity-30" />
              <p>Aucune entrée dans le coffre-fort.</p>
              <p className="text-sm mt-1">Clique sur "Ajouter" pour commencer.</p>
            </>
          ) : (
            <p>Aucun résultat pour ces filtres.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map(entry => (
            <VaultEntryCard key={entry.id} entry={entry}
              onEdit={(e) => setModal({ open: true, entry: e })} />
          ))}
        </div>
      )}

      <VaultEntryFormModal isOpen={modal.open}
        onClose={() => setModal({ open: false, entry: null })}
        entry={modal.entry} />
    </div>
  );
}
