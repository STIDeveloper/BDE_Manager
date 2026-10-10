import React, { useState, useRef } from 'react';
import {
  FileUp, Download, Trash2, CheckCircle2, AlertTriangle, Info,
  FileText, X, ChevronDown,
} from 'lucide-react';
import { useRolesStore } from '../../roleEngine/store.js';
import { toast } from '../ui/toastStore';

export default function ImportPanel() {
  const [dragging, setDragging] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const fileRef = useRef(null);
  const { candidates, importReport, importedAt, importCsv, clearAll } = useRolesStore();

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
              : 'Aucune erreur détectée'
          );
        }
      } catch (err) {
        toast.error('Import impossible', err.message);
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    handleFile(file);
  };

  const onDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  const handleClear = () => {
    if (window.confirm('⚠️ Effacer toutes les données importées ? Cette action est irréversible.')) {
      clearAll();
      toast.warn('Données effacées');
    }
  };

  // ---------- ÉTAT 1 : pas de données ----------
  if (candidates.length === 0) {
    return (
      <div className="space-y-4">
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => fileRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
            dragging
              ? 'border-blue-500 bg-blue-500/5 scale-[1.005]'
              : 'border-line hover:border-line-strong bg-surface/40'
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <div className={`inline-flex p-4 rounded-2xl mb-4 transition-colors ${
            dragging ? 'bg-blue-500/15' : 'bg-elevated'
          }`}>
            <FileUp size={32} className={dragging ? 'text-blue-500' : 'text-dim'} />
          </div>
          <h3 className="text-sm font-semibold text-ink mb-1">
            {dragging ? 'Dépose le fichier CSV ici' : 'Glisse le CSV des réponses ici'}
          </h3>
          <p className="text-xs text-dim">ou clique pour parcourir tes fichiers</p>
          <p className="text-[11px] text-muted mt-3">
            Format attendu : export Google Forms « Choix des rôles 2026-2027 »
          </p>
        </div>

        <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 flex items-start gap-2 text-xs text-dim">
          <Info size={14} className="text-blue-500 shrink-0 mt-0.5" />
          <span>
            <strong className="text-ink">100 % local :</strong> aucune donnée n'est envoyée.
            Les téléphones et emails restent dans ton navigateur, jamais loggés, jamais exportés
            sans action explicite de ta part.
          </span>
        </div>
      </div>
    );
  }

  // ---------- ÉTAT 2 : données importées ----------
  const r = importReport;
  const qualityItems = [
    { label: 'Lignes valides', value: r.parsedRows, tone: 'ok' },
    { label: 'Lignes ignorées', value: r.skippedRows, tone: r.skippedRows > 0 ? 'warn' : 'ok' },
    { label: 'Choix uniques', value: r.missingChoice2 + r.missingChoice3, tone: 'info' },
    { label: 'Sans texte libre', value: r.emptyTextFields, tone: 'info' },
  ];

  return (
    <div className="space-y-4">
      {/* En-tête de succès */}
      <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-xl p-4 flex items-start gap-3">
        <div className="bg-emerald-500/15 p-2 rounded-lg shrink-0">
          <CheckCircle2 size={18} className="text-emerald-500" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-ink">
            {candidates.length} candidats importés
          </h3>
          <p className="text-xs text-dim mt-0.5">
            Le {new Date(importedAt).toLocaleString('fr-FR')}
          </p>
        </div>
        <button
          onClick={handleClear}
          className="text-xs text-dim hover:text-red-500 flex items-center gap-1 px-2 py-1 rounded-lg border border-line transition-colors shrink-0"
        >
          <Trash2 size={12} /> Effacer
        </button>
      </div>

      {/* Rapport qualité */}
      <div className="bg-surface border border-line rounded-xl overflow-hidden">
        <button
          onClick={() => setShowReport(!showReport)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-elevated/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <FileText size={14} className="text-dim" />
            <span className="text-sm font-medium text-ink">Rapport de qualité</span>
          </div>
          <ChevronDown size={14} className={`text-dim transition-transform ${showReport ? 'rotate-180' : ''}`} />
        </button>

        {showReport && (
          <div className="px-4 pb-4 border-t border-line">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
              {qualityItems.map((item, i) => (
                <div key={i} className="bg-elevated border border-line rounded-lg p-2.5">
                  <div className="text-[10px] text-muted uppercase tracking-wider font-medium">
                    {item.label}
                  </div>
                  <div className={`text-lg font-bold mt-0.5 ${
                    item.tone === 'ok' ? 'text-emerald-500'
                    : item.tone === 'warn' ? 'text-amber-500'
                    : 'text-ink'
                  }`}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>

            {r.warnings.length > 0 && (
              <div className="mt-3 pt-3 border-t border-line">
                <div className="text-[11px] text-dim uppercase tracking-wider font-medium mb-2">
                  Avertissements ({r.warnings.length})
                </div>
                <div className="max-h-[150px] overflow-y-auto space-y-1">
                  {r.warnings.map((w, i) => (
                    <div key={i} className="text-xs text-dim flex items-start gap-1.5">
                      <AlertTriangle size={11} className="text-amber-500 shrink-0 mt-0.5" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Aperçu candidats (masquage données sensibles) */}
      <div className="bg-surface border border-line rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-line">
          <h4 className="text-sm font-medium text-ink">Aperçu des candidats</h4>
          <p className="text-[11px] text-dim mt-0.5">Emails et téléphones masqués par défaut</p>
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-elevated">
              <tr className="border-b border-line">
                <th className="text-left px-3 py-2 text-dim font-medium">Nom</th>
                <th className="text-left px-3 py-2 text-dim font-medium">Formation</th>
                <th className="text-left px-3 py-2 text-dim font-medium">Année</th>
                <th className="text-left px-3 py-2 text-dim font-medium">1er choix</th>
                <th className="text-left px-3 py-2 text-dim font-medium">Dispo</th>
              </tr>
            </thead>
            <tbody>
              {candidates.slice(0, 50).map(c => (
                <tr key={c.id} className="border-b border-line/50 hover:bg-elevated/40">
                  <td className="px-3 py-2 text-ink font-medium">
                    {c.firstName} {c.lastName}
                  </td>
                  <td className="px-3 py-2 text-dim">{c.formation}</td>
                  <td className="px-3 py-2 text-dim">{c.year}</td>
                  <td className="px-3 py-2 text-ink">{c.rawChoices[0] || '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      c.availability >= 0.7 ? 'bg-emerald-500/10 text-emerald-500'
                      : c.availability >= 0.4 ? 'bg-amber-500/10 text-amber-500'
                      : 'bg-red-500/10 text-red-500'
                    }`}>
                      {c.availabilityLabel}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
