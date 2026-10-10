// Barre d'actions globales : compteurs, export / import JSON, réinitialisation.
import { useRef } from 'react';
import { Download, Upload, RotateCcw } from 'lucide-react';
import { useStore } from '../../../store.js';
import { createDefaultCatalog } from '../../../core/catalog.js';
import { confirmDialog } from '../../ui/confirmStore';
import { toast } from '../../ui/toastStore';
import {
  catalogFileName, computeReplaceImpact, memberDisplayName, parseCatalogText, plural,
} from './helpers.js';

const MAX_NAMES = 8;

function impactDetails(impact) {
  const t = impact.totals;
  const details = [
    `${plural(t.poles, 'pôle', 'pôles')} · ${plural(t.roles, 'rôle', 'rôles')} · ${plural(t.levels, 'niveau', 'niveaux')} · ${plural(t.capacity, 'place', 'places')}`,
    `${plural(impact.keptRoles.length, 'rôle conservé', 'rôles conservés')}, ${plural(impact.addedRoles.length, 'nouveau', 'nouveaux')}, ${plural(impact.removedRoles.length, 'retiré', 'retirés')}`,
  ];
  const n = impact.detachedMembers.length;
  if (n > 0) {
    const names = impact.detachedMembers.slice(0, MAX_NAMES).map(m => m.firstName || memberDisplayName(m)).join(', ');
    details.push(`${plural(n, 'membre perdra', 'membres perdront')} son rôle (ancien libellé conservé) : ${names}${n > MAX_NAMES ? '…' : ''}`);
  } else {
    details.push('Aucun membre ne perdra son rôle.');
  }
  details.push('Les presets Drive ne sont pas supprimés.');
  return details;
}

function resultToast(res, verb) {
  if (!res.ok) { toast.error(res.error); return; }
  const n = res.detachedMembers || 0;
  toast.success(`Catalogue ${verb}`, `${n ? `${plural(n, 'membre détaché', 'membres détachés')} de son rôle (ancien libellé conservé). ` : ''}Ctrl+Z pour annuler.`);
}

/** @param {{totals:{poles:number,roles:number,levels:number,capacity:number}}} props */
export default function CatalogToolbar({ totals }) {
  const fileRef = useRef(null);

  const exportJson = () => {
    const payload = useStore.getState().exportCatalog();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = catalogFileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Révocation différée : certains navigateurs lisent l'URL après le clic.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success('Catalogue exporté');
  };

  const importJson = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permet de réimporter le même fichier
    if (!file) return;
    let text;
    try { text = await file.text(); } catch { toast.error('Lecture du fichier impossible.'); return; }
    const parsed = parseCatalogText(text);
    if (!parsed.ok) { toast.error(parsed.error); return; }
    const s = useStore.getState();
    const impact = computeReplaceImpact(s, parsed.catalog, s.members);
    const ok = await confirmDialog({
      title: 'Remplacer le catalogue ?',
      message: `Le catalogue actuel sera remplacé par celui de « ${file.name} ».`,
      details: impactDetails(impact),
      confirmLabel: 'Importer',
      tone: impact.detachedMembers.length > 0 ? 'danger' : 'warning',
    });
    if (!ok) return;
    resultToast(useStore.getState().replaceCatalog(parsed.raw), 'importé');
  };

  const reset = async () => {
    const s = useStore.getState();
    const impact = computeReplaceImpact(s, createDefaultCatalog(), s.members);
    const ok = await confirmDialog({
      title: 'Réinitialiser le catalogue ?',
      message: 'Tous les pôles, rôles et niveaux reviennent au catalogue par défaut du BDE. Tes rôles personnalisés seront supprimés.',
      details: impactDetails(impact),
      confirmLabel: 'Réinitialiser',
      tone: 'danger',
      requireWord: 'RÉINITIALISER',
    });
    if (!ok) return;
    resultToast(useStore.getState().resetCatalog(), 'réinitialisé');
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-xs text-dim mr-auto" aria-live="polite">
        <span className="text-ink font-medium">{plural(totals.poles, 'pôle', 'pôles')}</span> ·{' '}
        <span className="text-ink font-medium">{plural(totals.roles, 'rôle', 'rôles')}</span> ·{' '}
        <span className="text-ink font-medium">{plural(totals.levels, 'niveau', 'niveaux')}</span> ·{' '}
        <span className="text-ink font-medium">{plural(totals.capacity, 'place', 'places')}</span>
      </p>
      <button type="button" onClick={exportJson} aria-label="Exporter le catalogue (JSON)" className="btn-secondary !px-2.5 !py-1.5 text-xs min-h-[36px]">
        <Download size={14} aria-hidden="true" />
        <span>Exporter<span className="hidden sm:inline"> le catalogue</span> (JSON)</span>
      </button>
      <button type="button" onClick={() => fileRef.current?.click()} aria-label="Importer un catalogue (JSON)" className="btn-secondary !px-2.5 !py-1.5 text-xs min-h-[36px]">
        <Upload size={14} aria-hidden="true" />
        <span>Importer<span className="hidden sm:inline"> un catalogue</span> (JSON)</span>
      </button>
      <input
        ref={fileRef} type="file" accept="application/json,.json" onChange={importJson}
        className="sr-only" tabIndex={-1} aria-hidden="true"
      />
      <button type="button" onClick={reset} aria-label="Réinitialiser au catalogue par défaut" className="btn-ghost !px-2.5 !py-1.5 text-xs min-h-[36px] hover:!text-red-500">
        <RotateCcw size={14} aria-hidden="true" />
        <span>Réinitialiser<span className="hidden sm:inline"> au catalogue par défaut</span></span>
      </button>
    </div>
  );
}
