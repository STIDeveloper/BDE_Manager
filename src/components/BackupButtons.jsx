import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { useStore } from '../store';
import { useRolesStore } from '../roleEngine/store';
import { STORE_VERSION } from '../core/migrations';
import { toast } from './ui/toastStore';
import { confirmDialog } from './ui/confirmStore';
import {
  buildFullBackup, inspectBackup, backupSummaryLines, backupFileName,
} from './members/backupHelpers';

// ============================================================
// SAUVEGARDE COMPLÈTE (export / import JSON)
// ============================================================
// Format : voir src/components/members/backupHelpers.js.
//   { app, version, exportedAt, data: {…store principal…},
//     rolesEngine?: useRolesStore.exportConfig() }
// `rolesEngine` (poids, pénalités, score minimal, contraintes, verrous du
// moteur de rôles) est un champ OPTIONNEL au premier niveau : les anciens
// backups sans ce champ restent importables.

function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Backup complet de l'état actuel (store principal + config du moteur). */
function currentFullBackup() {
  let engine = null;
  try {
    engine = useRolesStore.getState().exportConfig();
  } catch (err) {
    console.error('[backup] export de la config du moteur impossible', err);
  }
  return buildFullBackup(useStore.getState().exportAllData(), engine);
}

export default function BackupButtons() {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const handleExport = () => {
    try {
      const payload = currentFullBackup();
      downloadJson(payload, backupFileName('BDE_Backup'));
      toast.success('Backup téléchargé', `${payload.data.members?.length || 0} membres${payload.rolesEngine ? ' + config du moteur de rôles' : ''}`);
    } catch (err) {
      console.error(err);
      toast.error('Export impossible', err?.message);
    }
  };

  const importFile = async (file) => {
    let text;
    try {
      text = await file.text();
    } catch {
      toast.error('Lecture impossible', 'Le fichier n\'a pas pu être lu.');
      return;
    }

    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      toast.error('Fichier invalide', `« ${file.name} » n'est pas un fichier JSON valide.`);
      return;
    }

    const check = inspectBackup(payload, STORE_VERSION);
    if (!check.ok) {
      toast.error('Ce n\'est pas un backup BDE Manager', check.error);
      return;
    }

    const ok = await confirmDialog({
      title: 'Importer ce backup ?',
      message:
        'L\'import REMPLACE toutes tes données actuelles (membres, colonnes, catalogue de rôles, ' +
        'dossiers et permissions Drive, coffre-fort).\n' +
        'Une sauvegarde de sécurité de tes données actuelles est téléchargée automatiquement avant l\'import. ' +
        'Ctrl+Z annule l\'import (sauf le coffre-fort).',
      details: backupSummaryLines(check.summary),
      confirmLabel: 'Sauvegarder puis importer',
      tone: 'warning',
    });
    if (!ok) return;

    // 1. Sauvegarde de sécurité de l'état actuel.
    try {
      downloadJson(currentFullBackup(), backupFileName('BDE_Sauvegarde_avant_import'));
    } catch (err) {
      console.error(err);
      const goOn = await confirmDialog({
        title: 'Sauvegarde de sécurité impossible',
        message: `La sauvegarde automatique a échoué (${err?.message || 'erreur inconnue'}). Importer quand même ?`,
        confirmLabel: 'Importer sans sauvegarde',
        tone: 'danger',
      });
      if (!goOn) return;
    }

    // 2. Données principales (validées + migrées par le store).
    let result;
    try {
      result = useStore.getState().importAllData(payload);
    } catch (err) {
      console.error(err);
      toast.error('Import impossible', err?.message || 'Backup invalide.');
      return;
    }

    // 3. Configuration du moteur de rôles (optionnelle, indépendante).
    let engineMsg = '';
    if (payload.rolesEngine) {
      try {
        useRolesStore.getState().importConfig(payload.rolesEngine);
        engineMsg = ' + config du moteur';
      } catch (err) {
        console.error(err);
        toast.warn('Config du moteur ignorée', err?.message || 'Configuration du moteur de rôles invalide.');
      }
    }

    toast.success(
      'Import réussi',
      `${result?.members ?? 0} membres, ${result?.roles ?? 0} rôles${engineMsg}.${check.summary.hasVault ? ' Déverrouille le coffre avec son mot de passe.' : ''}`
    );
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permet de réimporter le même fichier
    if (!file || busy) return;
    setBusy(true);
    try {
      await importFile(file);
    } finally {
      setBusy(false);
    }
  };

  const btnCls = 'bg-elevated hover:bg-line border border-line text-ink p-2 rounded-xl transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60';

  return (
    <>
      <button
        type="button"
        onClick={handleExport}
        className={btnCls}
        aria-label="Exporter une sauvegarde complète (JSON)"
        title="Exporter toutes les données (JSON)"
      >
        <Download size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className={btnCls}
        aria-label="Importer une sauvegarde (JSON)"
        title="Importer un backup JSON"
      >
        <Upload size={16} aria-hidden="true" />
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        onChange={handleImport}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
      />
    </>
  );
}
