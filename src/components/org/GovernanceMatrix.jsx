import { useMemo } from 'react';
import { Table, Info, Download } from 'lucide-react';
import { useStore, PERMISSION_LEVELS } from '../../store';
import { useCatalogMaps } from '../../core/useCatalog';
import { buildGovernanceCategories, dominantLevel } from '../../utils/governance';
import { toast } from '../ui/toastStore';

const LEVEL_DISPLAY = {
  none:      { label: '🚫 Aucun',      cls: 'text-dim bg-elevated' },
  reader:    { label: '👁 Lecteur',    cls: 'text-blue-500 bg-blue-500/10' },
  commenter: { label: '💬 Commentateur', cls: 'text-amber-500 bg-amber-500/10' },
  editor:    { label: '✏️ Éditeur',    cls: 'text-emerald-500 bg-emerald-500/10' },
};

export default function GovernanceMatrix() {
  // Sélecteurs atomiques (Zustand v5).
  const members = useStore(s => s.members);
  const folders = useStore(s => s.folders);
  const drivePermissions = useStore(s => s.drivePermissions);
  const catalog = useCatalogMaps();

  // Filtre les dossiers importants (racines + sous-dossiers confidentiels)
  const relevantFolders = useMemo(() => {
    return folders.filter(f =>
      !f.parent ||
      (f.tags || []).includes('confidential') ||
      f.id === 'f01.3' ||
      f.id === 'f02.1'
    );
  }, [folders]);

  // Catégories avec membres
  // Catégories dérivées du catalogue (bureau, encadrement par pôle, autres…)
  const categoriesWithMembers = useMemo(
    () => buildGovernanceCategories(members, catalog),
    [members, catalog]);

  // Construit la matrice
  const matrix = useMemo(() => {
    return relevantFolders.map(folder => {
      const row = { folder, cells: {} };
      categoriesWithMembers.forEach(cat => {
        row.cells[cat.id] = dominantLevel(cat.members, folder.id, drivePermissions);
      });
      return row;
    });
  }, [relevantFolders, categoriesWithMembers, drivePermissions]);

  // Export CSV
  const handleExportCSV = () => {
    const header = ['Dossier', 'Code', ...categoriesWithMembers.map(c => c.label)];
    const rows = matrix.map(r => [
      r.folder.name,
      r.folder.code,
      ...categoriesWithMembers.map(c => LEVEL_DISPLAY[r.cells[c.id]]?.label?.replace(/^[^\s]+\s/, '') || ''),
    ]);
    const escape = (v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const csv = '\ufeff' + [header, ...rows].map(r => r.map(escape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Matrice_Gouvernance_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Matrice exportée');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="bg-amber-500/10 p-2 rounded-lg">
            <Table size={16} className="text-amber-500" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-ink">Matrice de gouvernance des données</h3>
            <p className="text-[10px] text-dim">
              Croisement catégories de rôles (catalogue) × dossiers Drive • {relevantFolders.length} dossiers • {categoriesWithMembers.length} catégories
            </p>
          </div>
        </div>
        <button onClick={handleExportCSV}
          className="flex items-center gap-2 bg-elevated hover:bg-line border border-line text-ink text-xs font-medium px-3 py-2 rounded-lg transition-colors">
          <Download size={12} className="text-emerald-500" /> Export CSV
        </button>
      </div>

      <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 flex items-start gap-2 text-xs text-dim">
        <Info size={14} className="text-blue-500 shrink-0 mt-0.5" />
        <span>
          Le niveau affiché pour chaque catégorie est le <strong className="text-ink">niveau le plus élevé</strong> accordé à au moins un de ses membres.
          Si une seule personne d'un pôle a un accès Éditeur, toute la colonne passe en Éditeur.
        </span>
      </div>

      <div className="border border-line rounded-2xl bg-surface overflow-hidden">
        <div className="overflow-auto max-h-[70vh]">
          <table className="border-collapse text-xs w-full">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="sticky left-0 z-20 bg-surface border-b border-r border-line p-3 text-left min-w-[220px]">
                  <div className="text-dim text-[10px] uppercase tracking-wider font-bold">Dossier Drive</div>
                </th>
                {categoriesWithMembers.map(cat => (
                  <th key={cat.id} scope="col" title={cat.hint} className="border-b border-r border-line p-3 text-center min-w-[120px]">
                    <div className="text-ink text-xs font-bold">{cat.label}</div>
                    <div className="text-[10px] text-dim font-normal">
                      {cat.members.length} membre{cat.members.length > 1 ? 's' : ''}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map(row => {
                const folderTags = row.folder.tags || [];
                const isConfidential = folderTags.includes('confidential');
                const indent = row.folder.parent ? 20 : 0;
                return (
                  <tr key={row.folder.id} className="hover:bg-elevated/40">
                    <td className="sticky left-0 z-10 bg-surface border-b border-r border-line p-3">
                      <div className="flex items-center gap-2" style={{ paddingLeft: indent }}>
                        {isConfidential && <span className="text-red-500 shrink-0" title="Confidentiel">🔒</span>}
                        <div className="min-w-0">
                          <div className="text-[10px] font-mono text-dim">{row.folder.code}</div>
                          <div className="text-sm text-ink font-medium truncate" title={row.folder.name}>
                            {row.folder.name}
                          </div>
                        </div>
                      </div>
                    </td>
                    {categoriesWithMembers.map(cat => {
                      const level = row.cells[cat.id];
                      const display = LEVEL_DISPLAY[level];
                      return (
                        <td key={cat.id} className="border-b border-r border-line p-2 text-center">
                          <span className={`inline-block text-[10px] font-bold px-2 py-1 rounded ${display.cls}`}>
                            {display.label}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-[10px] text-dim">
        <span className="font-medium">Légende :</span>
        {PERMISSION_LEVELS.map(l => (
          <span key={l.id} className={`px-2 py-0.5 rounded ${LEVEL_DISPLAY[l.id].cls}`}>
            {LEVEL_DISPLAY[l.id].label}
          </span>
        ))}
      </div>
    </div>
  );
}
