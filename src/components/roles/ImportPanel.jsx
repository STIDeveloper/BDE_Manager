import { useState, useMemo, useId } from 'react';
import {
  FileUp, Trash2, CheckCircle2, AlertTriangle, Info,
  FileText, ChevronDown, HelpCircle, ExternalLink,
} from 'lucide-react';
import { useRolesStore } from '../../roleEngine/store.js';
import { parseRoleLabel } from '../../roleEngine/roles.js';
import { useCatalog, useCatalogMaps } from '../../core/useCatalog.js';
import { toast } from '../ui/toastStore';
import { confirmDialog } from '../ui/confirmStore';

/**
 * Choix bruts (CSV) non reconnus par le catalogue actif, regroupés par
 * libellé : { raw, count }. Recalculé à chaque changement du catalogue →
 * créer le rôle ou ajouter un alias dans « Gestion des rôles » les fait
 * disparaître sans réimporter (le store ré-interprète les candidats).
 */
function findUnrecognized(candidates, catalog) {
  const byKey = new Map();
  candidates.forEach(c => {
    (Array.isArray(c.rawChoices) ? c.rawChoices : []).forEach(raw => {
      const text = String(raw ?? '').trim();
      if (!text || parseRoleLabel(text, catalog)) return;
      const key = text.toLowerCase();
      const e = byKey.get(key) || { raw: text, count: 0 };
      e.count++;
      byKey.set(key, e);
    });
  });
  return [...byKey.values()].sort((a, b) => b.count - a.count || a.raw.localeCompare(b.raw, 'fr'));
}

/**
 * @param {object} props
 * @param {() => void} [props.onOpenRolesManager]  Ouvre « Gestion des rôles » (bouton affiché si fourni)
 */
export default function ImportPanel({ onOpenRolesManager }) {
  const [dragging, setDragging] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const inputId = `csv-input-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const candidates = useRolesStore(s => s.candidates);
  const importReport = useRolesStore(s => s.importReport);
  const importedAt = useRolesStore(s => s.importedAt);
  const importCsv = useRolesStore(s => s.importCsv);
  const clearAll = useRolesStore(s => s.clearAll);
  const catalog = useCatalogMaps();
  const { roleLabel } = useCatalog();

  const unrecognized = useMemo(() => findUnrecognized(candidates, catalog), [candidates, catalog]);
  const unrecognizedSet = useMemo(() => new Set(unrecognized.map(u => u.raw.toLowerCase())), [unrecognized]);

  const handleFile = (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error('Format non supporté', 'Utilise un fichier CSV exporté depuis Google Forms.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const result = importCsv(e.target.result);
        if (result.cached) {
          toast.info('CSV identique', 'Aucun recalcul nécessaire.');
        } else {
          toast.success(
            `${result.candidates.length} candidats importés`,
            result.report.skippedRows > 0
              ? `${result.report.skippedRows} ligne(s) ignorée(s)`
              : 'Aucune erreur détectée',
          );
        }
      } catch (err) {
        toast.error('Import impossible', err.message);
      }
    };
    reader.onerror = () => toast.error('Lecture du fichier impossible');
    reader.readAsText(file, 'UTF-8');
  };

  const onInputChange = (e) => {
    handleFile(e.target.files?.[0]);
    e.target.value = ''; // permet de réimporter le même fichier
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files?.[0]);
  };
  const onDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  const handleClear = async () => {
    const ok = await confirmDialog({
      title: 'Effacer les candidats importés ?',
      message: 'Les réponses importées contiennent des données personnelles (noms, emails, téléphones, motivations). Elles sont stockées sur cet appareil uniquement ; les effacer supprime aussi les scénarios et les verrous de l\'organigramme.',
      details: [
        `${candidates.length} candidat${candidates.length > 1 ? 's' : ''} supprimé${candidates.length > 1 ? 's' : ''} de cet appareil`,
        'Pondérations, contraintes et catalogue des rôles conservés',
        'Action irréversible : il faudra réimporter le CSV',
      ],
      confirmLabel: 'Effacer les candidats',
      tone: 'danger',
    });
    if (!ok) return;
    clearAll();
    toast.warn('Candidats effacés', 'Les données personnelles importées ont été supprimées de cet appareil.');
  };

  const fileInput = (
    <input id={inputId} type="file" accept=".csv,text/csv" className="sr-only peer" onChange={onInputChange} />
  );

  // ---------- ÉTAT 1 : pas de données ----------
  if (candidates.length === 0) {
    return (
      <div className="space-y-4">
        {fileInput}
        <label
          htmlFor={inputId}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          className={`block relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500/60 ${
            dragging
              ? 'border-blue-500 bg-blue-500/5 scale-[1.005]'
              : 'border-line hover:border-line-strong bg-surface/40'
          }`}
        >
          <div className={`inline-flex p-4 rounded-2xl mb-4 transition-colors ${dragging ? 'bg-blue-500/15' : 'bg-elevated'}`}>
            <FileUp size={32} className={dragging ? 'text-blue-500' : 'text-dim'} aria-hidden="true" />
          </div>
          <span className="block text-sm font-semibold text-ink mb-1">
            {dragging ? 'Dépose le fichier CSV ici' : 'Glisse le CSV des réponses ici'}
          </span>
          <span className="block text-xs text-dim">ou clique (ou Entrée sur le champ fichier) pour parcourir tes fichiers</span>
          <span className="block text-[11px] text-muted mt-3">
            Format attendu : export Google Forms des choix de rôles (CSV)
          </span>
        </label>

        <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 flex items-start gap-2 text-xs text-dim">
          <Info size={14} className="text-blue-500 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            <strong className="text-ink">100 % local :</strong> aucune donnée n'est envoyée.
            Les réponses importées sont stockées <strong className="text-ink">sur cet appareil uniquement</strong>
            (pour les retrouver après rechargement) et peuvent être effacées à tout moment.
          </span>
        </div>
      </div>
    );
  }

  // ---------- ÉTAT 2 : données importées ----------
  const r = importReport || { parsedRows: candidates.length, skippedRows: 0, missingChoice2: 0, missingChoice3: 0, emptyTextFields: 0, warnings: [] };
  const qualityItems = [
    { key: 'valid', label: 'Lignes valides', value: r.parsedRows, tone: 'ok' },
    { key: 'skipped', label: 'Lignes ignorées', value: r.skippedRows, tone: r.skippedRows > 0 ? 'warn' : 'ok' },
    { key: 'single', label: 'Choix uniques', value: (r.missingChoice2 || 0) + (r.missingChoice3 || 0), tone: 'info' },
    { key: 'notext', label: 'Sans texte libre', value: r.emptyTextFields, tone: 'info' },
    { key: 'unrec', label: 'Choix non reconnus', value: unrecognized.length, tone: unrecognized.length > 0 ? 'warn' : 'ok' },
  ];
  const dateLabel = importedAt ? new Date(importedAt).toLocaleString('fr-FR') : '—';

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-xl p-4 flex items-start gap-3 flex-wrap">
        <div className="bg-emerald-500/15 p-2 rounded-lg shrink-0">
          <CheckCircle2 size={18} className="text-emerald-500" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <h3 className="text-sm font-semibold text-ink">
            {candidates.length} candidat{candidates.length > 1 ? 's' : ''} importé{candidates.length > 1 ? 's' : ''}
          </h3>
          <p className="text-xs text-dim mt-0.5">
            Données importées le {dateLabel}, {candidates.length} candidat{candidates.length > 1 ? 's' : ''} — stockées sur cet appareil uniquement
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {fileInput}
          <label htmlFor={inputId}
            className="peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500/60 text-xs text-dim hover:text-ink flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-line transition-colors cursor-pointer">
            <FileUp size={12} aria-hidden="true" /> Importer un autre CSV
          </label>
          <button
            type="button"
            onClick={handleClear}
            className="text-xs text-dim hover:text-red-500 hover:border-red-500/40 flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-line transition-colors"
          >
            <Trash2 size={12} aria-hidden="true" /> Effacer les candidats
          </button>
        </div>
      </div>

      {/* Choix non reconnus : fonctionnalité no-code clé */}
      {unrecognized.length > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-4">
          <div className="flex items-start gap-2">
            <HelpCircle size={15} className="text-amber-500 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-ink">
                {unrecognized.length} choix non reconnu{unrecognized.length > 1 ? 's' : ''}
              </h4>
              <p className="text-xs text-dim mt-0.5">
                Ces réponses ne correspondent à aucun rôle du catalogue : elles sont ignorées par le moteur.
                Crée le rôle ou ajoute un alias dans « Gestion des rôles » pour le reconnaître — les candidats
                sont ré-analysés automatiquement, sans réimporter.
              </p>
              <ul className="flex flex-wrap gap-1.5 mt-2.5">
                {unrecognized.slice(0, 30).map(u => (
                  <li key={u.raw.toLowerCase()} className="text-[11px] bg-surface border border-amber-500/30 text-ink rounded-md px-2 py-0.5">
                    « {u.raw} » <span className="text-muted">× {u.count}</span>
                  </li>
                ))}
                {unrecognized.length > 30 && <li className="text-[11px] text-muted">+{unrecognized.length - 30} autres</li>}
              </ul>
              {onOpenRolesManager && (
                <button type="button" onClick={onOpenRolesManager}
                  className="mt-3 text-xs font-medium text-blue-500 hover:text-blue-400 flex items-center gap-1">
                  Ouvrir « Gestion des rôles » <ExternalLink size={11} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Rapport qualité */}
      <div className="bg-surface border border-line rounded-xl overflow-hidden">
        <button
          type="button"
          aria-expanded={showReport}
          onClick={() => setShowReport(!showReport)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-elevated/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <FileText size={14} className="text-dim" aria-hidden="true" />
            <span className="text-sm font-medium text-ink">Rapport de qualité</span>
          </div>
          <ChevronDown size={14} className={`text-dim transition-transform ${showReport ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>

        {showReport && (
          <div className="px-4 pb-4 border-t border-line">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3">
              {qualityItems.map(item => (
                <div key={item.key} className="bg-elevated border border-line rounded-lg p-2.5">
                  <div className="text-[10px] text-muted uppercase tracking-wider font-medium">{item.label}</div>
                  <div className={`text-lg font-bold mt-0.5 ${
                    item.tone === 'ok' ? 'text-emerald-500' : item.tone === 'warn' ? 'text-amber-500' : 'text-ink'
                  }`}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>

            {(r.warnings || []).length > 0 && (
              <div className="mt-3 pt-3 border-t border-line">
                <div className="text-[11px] text-dim uppercase tracking-wider font-medium mb-2">
                  Avertissements ({r.warnings.length})
                </div>
                <ul className="max-h-[150px] overflow-y-auto space-y-1">
                  {r.warnings.map((w, i) => (
                    // Liste figée par import : l'index est stable ici
                    <li key={`${i}-${w}`} className="text-xs text-dim flex items-start gap-1.5">
                      <AlertTriangle size={11} className="text-amber-500 shrink-0 mt-0.5" aria-hidden="true" />
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Aperçu candidats (masquage données sensibles) */}
      <div className="bg-surface border border-line rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-line">
          <h4 className="text-sm font-medium text-ink">Aperçu des candidats</h4>
          <p className="text-[11px] text-dim mt-0.5">
            Emails et téléphones masqués{candidates.length > 50 ? ` · 50 premiers sur ${candidates.length}` : ''}
          </p>
        </div>
        <div className="max-h-[400px] overflow-auto">
          <table className="w-full text-xs min-w-[520px]">
            <thead className="sticky top-0 bg-elevated">
              <tr className="border-b border-line">
                <th scope="col" className="text-left px-3 py-2 text-dim font-medium">Nom</th>
                <th scope="col" className="text-left px-3 py-2 text-dim font-medium">Formation</th>
                <th scope="col" className="text-left px-3 py-2 text-dim font-medium">Année</th>
                <th scope="col" className="text-left px-3 py-2 text-dim font-medium">1er choix</th>
                <th scope="col" className="text-left px-3 py-2 text-dim font-medium">Dispo</th>
              </tr>
            </thead>
            <tbody>
              {candidates.slice(0, 50).map(c => {
                const raw1 = Array.isArray(c.rawChoices) ? c.rawChoices[0] : null;
                const recognized = raw1 ? parseRoleLabel(raw1, catalog) : (c.choices?.[0] || null);
                const unknown = raw1 && unrecognizedSet.has(String(raw1).trim().toLowerCase());
                return (
                  <tr key={c.id} className="border-b border-line/50 hover:bg-elevated/40">
                    <td className="px-3 py-2 text-ink font-medium">{c.firstName} {c.lastName}</td>
                    <td className="px-3 py-2 text-dim">{c.formation}</td>
                    <td className="px-3 py-2 text-dim">{c.year}</td>
                    <td className="px-3 py-2">
                      {recognized ? (
                        <span className="text-ink">{roleLabel(recognized)}</span>
                      ) : unknown ? (
                        <span className="text-amber-500" title="Choix non reconnu : crée le rôle ou ajoute un alias dans « Gestion des rôles »">
                          ⚠️ {raw1}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        c.availability >= 0.7 ? 'bg-emerald-500/10 text-emerald-500'
                        : c.availability >= 0.4 ? 'bg-amber-500/10 text-amber-500'
                        : 'bg-red-500/10 text-red-500'
                      }`}>
                        {c.availabilityLabel || '—'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
