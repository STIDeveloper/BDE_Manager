import { useEffect, useId, useMemo, useState } from 'react';
import { Lock, Unlock, Plus, ShieldCheck, Search, AlertTriangle } from 'lucide-react';
import { useStore, ENTRY_TYPES } from '../store';
import VaultEntryCard from './VaultEntryCard';
import VaultEntryFormModal from './VaultEntryFormModal';
import { toast } from './ui/toastStore';
import TypeToConfirmDialog from './vault/TypeToConfirmDialog';
import SetupScreen from './vault/SetupScreen';
import UnlockScreen from './vault/UnlockScreen';
import MigrationScreen from './vault/MigrationScreen';
import AutoLockIndicator from './vault/AutoLockIndicator';
// Effet de bord voulu : active le verrouillage automatique global (inactivité / onglet masqué)
import './vault/autoLock';

const SENSITIVE_TYPES = new Set(ENTRY_TYPES.filter(t => t.sensitive).map(t => t.id));
const TYPE_LABELS = Object.fromEntries(ENTRY_TYPES.map(t => [t.id, t.label]));

export default function Vault() {
  // Sélecteurs atomiques : l'écran affiché découle directement du store
  const isConfigured = useStore(s => !!(s.vaultSalt && s.vaultVerifier && s.vaultEntriesBlob));
  const isUnlocked = useStore(s => !!s._vaultKey);
  const legacyCount = useStore(s => (Array.isArray(s._legacyVaultEntries) ? s._legacyVaultEntries.length : 0));
  const resetVault = useStore(s => s.resetVault);

  const [dialog, setDialog] = useState(null); // 'reset' | 'discardLegacy' | null

  // Nettoie l'ancien drapeau "déverrouillé" (purement cosmétique) des versions précédentes
  useEffect(() => {
    try { sessionStorage.removeItem('vault_unlocked'); } catch { /* stockage indisponible */ }
  }, []);

  const closeDialog = () => setDialog(null);

  const handleReset = () => {
    resetVault();
    setDialog(null);
    toast.warn('Toutes les entrées et le mot de passe maître ont été supprimés.', 'Coffre-fort réinitialisé');
  };

  const handleDiscardLegacy = () => {
    resetVault();
    setDialog(null);
    toast.warn('Les anciennes entrées non chiffrées ont été supprimées.', 'Anciennes données effacées');
  };

  let screen;
  if (!isConfigured && legacyCount > 0) {
    screen = <MigrationScreen onRequestDiscard={() => setDialog('discardLegacy')} />;
  } else if (!isConfigured) {
    screen = <SetupScreen />;
  } else if (!isUnlocked) {
    screen = <UnlockScreen onRequestReset={() => setDialog('reset')} />;
  } else {
    screen = <UnlockedVault onRequestReset={() => setDialog('reset')} />;
  }

  return (
    <>
      {screen}

      <TypeToConfirmDialog
        isOpen={dialog === 'reset'}
        onClose={closeDialog}
        onConfirm={handleReset}
        title="Réinitialiser le coffre-fort ?"
        confirmLabel="Réinitialiser le coffre"
      >
        <p>
          Cela supprime <strong>définitivement</strong> le mot de passe maître et <strong>toutes les entrées</strong> du coffre dans ce navigateur.
        </p>
        <p className="text-dim">
          Les sauvegardes JSON exportées ne contiennent que la version <strong>chiffrée</strong> du coffre :
          tu ne pourras restaurer une ancienne sauvegarde qu'avec le mot de passe maître qui la protégeait.
        </p>
      </TypeToConfirmDialog>

      <TypeToConfirmDialog
        isOpen={dialog === 'discardLegacy'}
        onClose={closeDialog}
        onConfirm={handleDiscardLegacy}
        title="Supprimer les anciennes entrées ?"
        confirmLabel="Supprimer les anciennes entrées"
      >
        <p>
          Les <strong>{legacyCount} ancienne{legacyCount > 1 ? 's' : ''} entrée{legacyCount > 1 ? 's' : ''}</strong> non chiffrée{legacyCount > 1 ? 's' : ''} seront
          effacée{legacyCount > 1 ? 's' : ''} définitivement. Tu pourras ensuite créer un nouveau coffre vide.
        </p>
        <p className="text-dim">Pense à noter ailleurs les informations dont tu as encore besoin avant de confirmer.</p>
      </TypeToConfirmDialog>
    </>
  );
}

// ============ Écran déverrouillé ============
// Démonté dès que le coffre est verrouillé (manuel, auto, synchro inter-onglets) :
// recherche, formulaire et valeurs révélées sont donc oubliés automatiquement.
function UnlockedVault({ onRequestReset }) {
  const vaultEntries = useStore(s => s.vaultEntries);
  const vaultLock = useStore(s => s.vaultLock);
  const deleteVaultEntry = useStore(s => s.deleteVaultEntry);

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [modal, setModal] = useState({ open: false, entry: null });
  const [toDelete, setToDelete] = useState(null);
  const searchId = useId();
  const filterId = useId();

  const entries = useMemo(() => (Array.isArray(vaultEntries) ? vaultEntries : []), [vaultEntries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter(e => {
      if (filterType && e.type !== filterType) return false;
      if (!q) return true;
      const haystack = [
        e.label, e.notes, TYPE_LABELS[e.type],
        // On ne cherche pas dans les valeurs sensibles (mots de passe, IBAN…)
        SENSITIVE_TYPES.has(e.type) ? '' : e.value,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [entries, search, filterType]);

  const handleLock = () => {
    vaultLock();
    toast.info('Coffre-fort verrouillé');
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteVaultEntry(toDelete.id);
      toast.info('Entrée supprimée', toDelete.label || undefined);
      setToDelete(null);
    } catch (err) {
      toast.error(err?.message || 'Suppression impossible.');
      throw err;
    }
  };

  const count = entries.length;

  return (
    <div>
      <div className="flex items-start sm:items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="bg-emerald-500/10 p-3 rounded-xl shrink-0">
            <Unlock size={24} className="text-emerald-500" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-ink">Coffre-fort déverrouillé</h2>
            <p className="text-xs text-dim">
              {count} entrée{count > 1 ? 's' : ''} chiffrée{count > 1 ? 's' : ''}
            </p>
            <AutoLockIndicator />
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={onRequestReset}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-elevated hover:bg-red-500/10 text-dim hover:text-red-500 text-sm transition-colors border border-line"
            title="Supprimer tout le coffre"
          >
            <AlertTriangle size={14} aria-hidden="true" /> Réinitialiser
          </button>
          <button
            type="button"
            onClick={handleLock}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-elevated hover:bg-line text-ink text-sm font-medium transition-colors border border-line"
          >
            <Lock size={14} aria-hidden="true" /> Verrouiller
          </button>
          <button
            type="button"
            onClick={() => setModal({ open: true, entry: null })}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition-colors"
          >
            <Plus size={14} aria-hidden="true" /> Ajouter
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap" role="search">
        <div className="flex-1 min-w-[180px] relative">
          <label htmlFor={searchId} className="sr-only">Rechercher dans le coffre</label>
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim pointer-events-none" aria-hidden="true" />
          <input
            id={searchId}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher dans le coffre..."
            autoComplete="off"
            className="w-full bg-surface border border-line rounded-xl pl-9 pr-3 py-2 text-ink placeholder-dim focus:outline-none focus:border-red-500 text-sm"
          />
        </div>
        <label htmlFor={filterId} className="sr-only">Filtrer par type</label>
        <select
          id={filterId}
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="bg-surface border border-line rounded-xl px-3 py-2 text-ink text-sm focus:outline-none focus:border-red-500 max-w-full"
        >
          <option value="">Tous les types</option>
          {ENTRY_TYPES.map(t => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-dim">
          {count === 0 ? (
            <>
              <ShieldCheck size={48} className="mx-auto mb-3 opacity-30" aria-hidden="true" />
              <p>Aucune entrée dans le coffre-fort.</p>
              <p className="text-sm mt-1">Clique sur « Ajouter » pour commencer.</p>
            </>
          ) : (
            <p role="status">Aucun résultat pour ces filtres.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map(entry => (
            <VaultEntryCard
              key={entry.id}
              entry={entry}
              onEdit={(e) => setModal({ open: true, entry: e })}
              onDelete={setToDelete}
            />
          ))}
        </div>
      )}

      <p className="mt-6 text-[11px] text-dim text-center">
        🔐 Chiffré localement (AES-256-GCM, clé dérivée par PBKDF2). Les exports JSON ne contiennent que la version chiffrée.
      </p>

      <VaultEntryFormModal
        isOpen={modal.open}
        onClose={() => setModal({ open: false, entry: null })}
        entry={modal.entry}
      />

      <TypeToConfirmDialog
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={handleDelete}
        confirmWord={null}
        title="Supprimer cette entrée ?"
        confirmLabel="Supprimer"
      >
        <p>
          « <strong className="break-words">{toDelete?.label || 'Sans titre'}</strong> » sera supprimée définitivement du coffre-fort.
        </p>
      </TypeToConfirmDialog>
    </div>
  );
}
