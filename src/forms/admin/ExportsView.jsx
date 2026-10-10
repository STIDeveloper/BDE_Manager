// Exports : CSV, Excel, rapport PDF personnalisé (sections au choix).
import { useId, useState } from 'react';
import { FileText, FileSpreadsheet, FileDown, Loader2, ShieldAlert } from 'lucide-react';
import { exportCsv, exportXlsx, exportPdfReport, REPORT_SECTIONS, INTERNAL_NOTICE } from './exporters.js';
import { activeFilterCount } from './analytics.js';
import { defaultVisible } from './columns.js';
import { readPref } from './prefs.js';
import { confirmDialog } from '../../components/ui/confirmStore.js';
import { toast } from '../../components/ui/toastStore.js';

export default function ExportsView({ ctx }) {
  const uid = useId();
  const { def, filtered, rows, selected, columns, canManage, dims, filters } = ctx;
  const [scope, setScope] = useState(selected.size ? 'selection' : 'filtered');
  const [colScope, setColScope] = useState('all');
  const [sensitive, setSensitive] = useState(false);
  const [sections, setSections] = useState(() => new Set(['summary', 'questions', 'kind']));
  const [crossA, setCrossA] = useState(dims[0]?.id || '');
  const [crossB, setCrossB] = useState(dims.find(d => d.id === '__status')?.id || '');
  const [busy, setBusy] = useState(null);

  const target = scope === 'selection' ? rows.filter(r => selected.has(r.id)) : scope === 'all' ? rows : filtered;
  const visibleIds = readPref(`cols:${def.id}`, null)?.order || defaultVisible(columns);
  const cols = (colScope === 'visible' ? visibleIds.map(id => columns.find(c => c.id === id)).filter(Boolean) : columns)
    .filter(c => (sensitive && canManage) || !c.sensitive);
  const filtersLabel = scope === 'filtered' && activeFilterCount(filters) ? `${activeFilterCount(filters)} filtre(s)${filters.q ? `, recherche « ${filters.q} »` : ''}` : scope === 'selection' ? 'sélection manuelle' : '';

  const toggleSensitive = async (on) => {
    if (!on) { setSensitive(false); return; }
    const ok = await confirmDialog({ title: 'Inclure les données sensibles ?', message: 'Téléphones, adresses, dates de naissance… seront présents dans le fichier. Stocke-le de façon sécurisée et supprime-le après usage.', confirmLabel: 'Inclure', tone: 'warning' });
    if (ok) setSensitive(true);
  };

  const run = async (kind) => {
    if (!target.length) { toast.warn('Rien à exporter', 'Aucune réponse dans le périmètre choisi.'); return; }
    setBusy(kind);
    try {
      let name;
      if (kind === 'csv') name = exportCsv(def, target, cols);
      else if (kind === 'xlsx') name = await exportXlsx(def, target, cols);
      else {
        name = await exportPdfReport(def, {
          sections, rows: target, selected: target, labelFor: ctx.labelFor, includeSensitive: sensitive && canManage, filtersLabel,
          crossDims: [dims.find(d => d.id === crossA), dims.find(d => d.id === crossB)], definitionFor: ctx.definitionFor, maxDetailed: 100,
        });
      }
      toast.success('Export téléchargé', `${name} — ${target.length} réponse(s), usage interne.`);
    } catch (err) {
      toast.error('Export impossible', err?.message || String(err));
    } finally { setBusy(null); }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs p-2 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200 flex gap-1.5"><ShieldAlert size={14} className="shrink-0 mt-0.5" aria-hidden="true" />{INTERNAL_NOTICE} Cette mention figure dans chaque fichier.</p>
      <section className="bg-surface border border-line rounded-2xl p-4 space-y-3">
        <fieldset>
          <legend className="text-xs font-medium text-dim mb-1">Réponses exportées</legend>
          <div className="flex flex-wrap gap-3 text-sm text-ink">
            <label className="inline-flex items-center gap-1.5"><input type="radio" name={`${uid}-s`} checked={scope === 'filtered'} onChange={() => setScope('filtered')} /> Filtrées ({filtered.length})</label>
            <label className="inline-flex items-center gap-1.5"><input type="radio" name={`${uid}-s`} checked={scope === 'selection'} disabled={!selected.size} onChange={() => setScope('selection')} /> Sélection ({selected.size})</label>
            <label className="inline-flex items-center gap-1.5"><input type="radio" name={`${uid}-s`} checked={scope === 'all'} onChange={() => setScope('all')} /> Toutes ({rows.length})</label>
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-xs font-medium text-dim mb-1">Colonnes (CSV / Excel)</legend>
          <div className="flex flex-wrap gap-3 text-sm text-ink">
            <label className="inline-flex items-center gap-1.5"><input type="radio" name={`${uid}-c`} checked={colScope === 'all'} onChange={() => setColScope('all')} /> Toutes les questions</label>
            <label className="inline-flex items-center gap-1.5"><input type="radio" name={`${uid}-c`} checked={colScope === 'visible'} onChange={() => setColScope('visible')} /> Colonnes affichées du tableau</label>
          </div>
        </fieldset>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={sensitive} disabled={!canManage} onChange={e => toggleSensitive(e.target.checked)} />
          Inclure les données sensibles {!canManage && <span className="text-xs text-muted">(droit « gestion » des formulaires requis)</span>}
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" disabled={!!busy} onClick={() => run('csv')}>{busy === 'csv' ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <FileText size={15} aria-hidden="true" />} CSV (;)</button>
          <button type="button" className="btn-secondary" disabled={!!busy} onClick={() => run('xlsx')}>{busy === 'xlsx' ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <FileSpreadsheet size={15} aria-hidden="true" />} Excel (.xlsx)</button>
        </div>
        <p className="text-[11px] text-muted">{cols.length} colonne(s) · {target.length} réponse(s). Excel : feuille « Réponses » + feuille « Synthèse ».</p>
      </section>

      <section className="bg-surface border border-line rounded-2xl p-4 space-y-3" aria-labelledby={`${uid}-r`}>
        <h3 id={`${uid}-r`} className="text-sm font-semibold text-ink">Rapport PDF personnalisé</h3>
        <fieldset className="grid gap-1 sm:grid-cols-2">
          <legend className="sr-only">Sections du rapport</legend>
          {REPORT_SECTIONS.map(s => (
            <label key={s.id} className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={sections.has(s.id)} onChange={e => setSections(p => { const n = new Set(p); if (e.target.checked) n.add(s.id); else n.delete(s.id); return n; })} /> {s.label}
            </label>
          ))}
        </fieldset>
        {sections.has('crosstab') && (
          <div className="grid gap-2 sm:grid-cols-2">
            <div><label htmlFor={`${uid}-xa`} className="block text-xs text-dim mb-1">Croisement : lignes</label><select id={`${uid}-xa`} className="input" value={crossA} onChange={e => setCrossA(e.target.value)}>{dims.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select></div>
            <div><label htmlFor={`${uid}-xb`} className="block text-xs text-dim mb-1">colonnes</label><select id={`${uid}-xb`} className="input" value={crossB} onChange={e => setCrossB(e.target.value)}>{dims.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select></div>
          </div>
        )}
        {sections.has('responses') && target.length > 100 && <p className="text-xs text-amber-700 dark:text-amber-300">Le détail est limité aux 100 premières réponses du périmètre (sélectionne-les dans le tableau pour choisir).</p>}
        <button type="button" className="btn-primary" disabled={!!busy || !sections.size} onClick={() => run('pdf')}>{busy === 'pdf' ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <FileDown size={15} aria-hidden="true" />} Générer le rapport PDF</button>
      </section>
    </div>
  );
}
