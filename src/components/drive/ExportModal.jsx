import { useState } from 'react';
import {
  Download, FileText, FileSpreadsheet, FileJson, FileType,
  Check, Info,
} from 'lucide-react';
import Modal from '../Modal';
import { useStore } from '../../store';
import { useCatalogMaps } from '../../core/useCatalog';
import { toast } from '../ui/toastStore';
import {
  exportMatrixCSV, exportMatrixTXT, exportMatrixPDF, exportDriveJSON,
} from '../../utils/exporters';

const FORMATS = [
  { id: 'csv', label: 'CSV (Excel)', description: 'Ouvrable dans Excel/Sheets. Idéal pour analyse.', icon: FileSpreadsheet, color: 'emerald' },
  { id: 'txt', label: 'TXT (WhatsApp)', description: 'Formaté pour WhatsApp avec emojis et listes groupées.', icon: FileText, color: 'blue' },
  { id: 'pdf', label: 'PDF (rapport imprimable)', description: 'Rapport propre avec page de couverture et détail par dossier.', icon: FileType, color: 'red' },
  { id: 'json', label: 'JSON (matrice brute)', description: 'Pour réutilisation ou traitement programmatique.', icon: FileJson, color: 'amber' },
];

export default function ExportModal({ isOpen, onClose }) {
  // Sélecteurs atomiques (Zustand v5).
  const members = useStore(s => s.members);
  const folders = useStore(s => s.folders);
  const folderTags = useStore(s => s.folderTags);
  const drivePermissions = useStore(s => s.drivePermissions);
  const rolePresets = useStore(s => s.rolePresets);
  const permissionNotes = useStore(s => s.permissionNotes);
  const catalog = useCatalogMaps();
  const [busy, setBusy] = useState(false);

  const [format, setFormat] = useState('csv');
  const [scope, setScope] = useState('all');
  const [txtGroupBy, setTxtGroupBy] = useState('folder');
  const [includeEmptyRows, setIncludeEmptyRows] = useState(true);

  const membersWithPerms = members.filter(m => {
    const p = drivePermissions[m.id] || {};
    return Object.values(p).some(v => v !== 'none');
  });

  const targetMembers = scope === 'all' ? members : membersWithPerms;

  const handleExport = async () => {
    const payload = {
      members: targetMembers, folders, folderTags, drivePermissions,
      rolePresets, permissionNotes, includeEmptyRows, groupBy: txtGroupBy,
    };
    try {
      setBusy(true);
      if (format === 'csv') exportMatrixCSV(payload, catalog);
      else if (format === 'txt') exportMatrixTXT(payload, catalog);
      // PDF : jsPDF est chargé à la demande (import dynamique).
      else if (format === 'pdf') await exportMatrixPDF(payload, catalog);
      else if (format === 'json') exportDriveJSON(payload);
      onClose();
    } catch (err) {
      console.error('Export impossible :', err);
      toast.error('L\'export a échoué. Vérifie ta connexion (chargement du module PDF) et réessaie.', 'Export');
    } finally {
      setBusy(false);
    }
  };

  const colorMap = {
    emerald: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30',
    blue:    'text-blue-500 bg-blue-500/10 border-blue-500/30',
    red:     'text-red-500 bg-red-500/10 border-red-500/30',
    amber:   'text-amber-500 bg-amber-500/10 border-amber-500/30',
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Exporter la matrice de permissions">
      <div className="space-y-5">
        <div>
          <div className="text-xs text-dim uppercase font-bold tracking-wider mb-2">1. Choisis un format</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {FORMATS.map(f => {
              const Icon = f.icon;
              const isActive = format === f.id;
              return (
                <button key={f.id} onClick={() => setFormat(f.id)}
                  className={`text-left p-3 rounded-xl border-2 transition-all ${
                    isActive ? `${colorMap[f.color]} ring-2 ring-current` : 'bg-elevated border-line hover:border-dim'
                  }`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Icon size={16} className={isActive ? '' : 'text-dim'} />
                    <span className={`text-sm font-bold ${isActive ? '' : 'text-ink'}`}>{f.label}</span>
                    {isActive && <Check size={12} className="ml-auto" />}
                  </div>
                  <p className={`text-[10px] ${isActive ? 'opacity-80' : 'text-dim'}`}>{f.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="text-xs text-dim uppercase font-bold tracking-wider mb-2">2. Périmètre</div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setScope('all')}
              className={`flex-1 min-w-[140px] p-2.5 rounded-lg border text-sm transition-all ${
                scope === 'all' ? 'bg-blue-500/10 border-blue-500/50 text-blue-500 font-semibold' : 'bg-elevated border-line text-dim hover:text-ink'
              }`}>
              Tous les membres
              <span className="block text-[10px] opacity-70 mt-0.5">{members.length} membres</span>
            </button>
            <button onClick={() => setScope('withPerms')}
              className={`flex-1 min-w-[140px] p-2.5 rounded-lg border text-sm transition-all ${
                scope === 'withPerms' ? 'bg-blue-500/10 border-blue-500/50 text-blue-500 font-semibold' : 'bg-elevated border-line text-dim hover:text-ink'
              }`}>
              Avec permissions uniquement
              <span className="block text-[10px] opacity-70 mt-0.5">{membersWithPerms.length} membres</span>
            </button>
          </div>
        </div>

        {format === 'txt' && (
          <div>
            <div className="text-xs text-dim uppercase font-bold tracking-wider mb-2">Groupement (TXT)</div>
            <div className="flex gap-2">
              <button onClick={() => setTxtGroupBy('folder')}
                className={`flex-1 p-2 rounded-lg border text-xs transition-all ${
                  txtGroupBy === 'folder' ? 'bg-blue-500/10 border-blue-500/50 text-blue-500 font-semibold' : 'bg-elevated border-line text-dim hover:text-ink'
                }`}>
                Par dossier
              </button>
              <button onClick={() => setTxtGroupBy('member')}
                className={`flex-1 p-2 rounded-lg border text-xs transition-all ${
                  txtGroupBy === 'member' ? 'bg-blue-500/10 border-blue-500/50 text-blue-500 font-semibold' : 'bg-elevated border-line text-dim hover:text-ink'
                }`}>
                Par membre
              </button>
            </div>
          </div>
        )}

        {format === 'csv' && (
          <label className="flex items-center gap-2 text-sm cursor-pointer p-2 rounded-lg hover:bg-elevated">
            <input type="checkbox" checked={includeEmptyRows}
              onChange={(e) => setIncludeEmptyRows(e.target.checked)} className="accent-blue-500" />
            <span className="text-ink">Inclure les membres sans aucune permission</span>
          </label>
        )}

        <div className="flex items-start gap-2 text-xs text-dim bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
          <Info size={14} className="text-blue-500 shrink-0 mt-0.5" />
          <span>
            Le fichier sera téléchargé automatiquement.
            {format === 'pdf' && ' Le PDF contient 2 sections : un tableau global et un détail par dossier.'}
            {format === 'csv' && ' Le CSV utilise un séparateur virgule et un encodage UTF-8 BOM (compatible Excel FR).'}
          </span>
        </div>

        <div className="flex gap-2 pt-2 border-t border-line">
          <button onClick={onClose}
            className="flex-1 bg-elevated hover:bg-line text-ink font-medium py-2.5 rounded-lg transition-colors border border-line">
            Annuler
          </button>
          <button type="button" onClick={handleExport} disabled={busy} aria-busy={busy}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2">
            <Download size={14} aria-hidden="true" /> {busy ? 'Préparation…' : 'Exporter'}
          </button>
        </div>
      </div>
    </Modal>
  );
}