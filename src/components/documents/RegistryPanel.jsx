import { useId, useMemo, useState } from 'react';
import {
  BadgeCheck, CalendarDays, Copy, Download, FileStack, Fingerprint, Layers, RefreshCw, Search, ShieldAlert, ShieldCheck,
  ShieldQuestion, Trash2,
} from 'lucide-react';
import { DOCUMENT_CATEGORIES } from '../../documents/model';
import { confirmDialog } from '../ui/confirmStore';
import { toast } from '../ui/toastStore';
import { TemplateIcon, toneFor } from './templateIcons';
import { downloadText } from './imageCompress';
import { memberName } from './studioHelpers';
import {
  filterRegistry, formatDateTime, formatLabel, registryToCsv, registryYears, verifyDocument,
} from './registryHelpers';

const PAGE = 50;
const categoryLabel = (id) => DOCUMENT_CATEGORIES.find(c => c.id === id)?.label || id;

/**
 * Registre chronologique des documents émis : recherche, filtres, export CSV,
 * vérification d'authenticité, régénération, suppression.
 */
export default function RegistryPanel({ documentLog, templates, getTemplate, membersById, onRegenerate, onRemove }) {
  const uid = useId();
  const [query, setQuery] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [category, setCategory] = useState('');
  const [year, setYear] = useState('');
  const [limit, setLimit] = useState(PAGE);

  const lookup = useMemo(() => ({
    memberName: (id) => (membersById.get(id) ? memberName(membersById.get(id)) : ''),
    templateOf: (id) => getTemplate(id),
    categoryLabel,
  }), [membersById, getTemplate]);

  const filters = useMemo(() => ({ query, templateId, category, year }), [query, templateId, category, year]);
  const rows = useMemo(() => filterRegistry(documentLog, filters, lookup), [documentLog, filters, lookup]);
  const years = useMemo(() => registryYears(documentLog), [documentLog]);
  const usedTemplates = useMemo(() => {
    const ids = new Set(documentLog.map(e => e.templateId));
    return templates.filter(t => ids.has(t.id));
  }, [documentLog, templates]);

  const stats = useMemo(() => {
    const thisYear = new Date().getFullYear();
    return {
      total: documentLog.length,
      year: documentLog.filter(e => new Date(e.createdAt).getFullYear() === thisYear).length,
      kinds: new Set(documentLog.map(e => e.templateId)).size,
      last: documentLog[0]?.createdAt || null,
    };
  }, [documentLog]);

  const filtering = !!(query || templateId || category || year);

  const exportCsv = () => {
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      downloadText(registryToCsv(rows, lookup), `registre_documents_${stamp}.csv`);
      toast.success('Registre exporté', `${rows.length} ligne${rows.length > 1 ? 's' : ''} (CSV, compatible Excel)`);
    } catch (e) {
      toast.error('Export impossible', e?.message);
    }
  };

  const remove = async (entry) => {
    const ok = await confirmDialog({
      title: `Supprimer ${entry.ref} du registre ?`,
      message: 'L\'entrée disparaît du registre : le document correspondant ne pourra plus être vérifié ici.',
      details: [
        `Le numéro ${entry.ref} ne sera jamais réattribué (la numérotation continue).`,
        'Le fichier déjà téléchargé ou imprimé n\'est pas affecté.',
      ],
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
    if (!ok) return;
    onRemove(entry.id);
    toast.success('Entrée supprimée', entry.ref);
  };

  const copyRef = async (ref) => {
    try {
      await navigator.clipboard.writeText(ref);
      toast.success('Référence copiée', ref);
    } catch {
      toast.error('Copie impossible', 'Le presse-papiers n\'est pas accessible.');
    }
  };

  return (
    <div className="space-y-4">
      {/* Indicateurs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon={FileStack} label="Documents émis" value={stats.total} tone="text-blue-500 bg-blue-500/10" />
        <Stat icon={CalendarDays} label={`En ${new Date().getFullYear()}`} value={stats.year} tone="text-violet-500 bg-violet-500/10" />
        <Stat icon={Layers} label="Types de documents" value={stats.kinds} tone="text-cyan-500 bg-cyan-500/10" />
        <Stat icon={BadgeCheck} label="Dernière émission" value={stats.last ? formatDateTime(stats.last).slice(0, 10) : '—'} tone="text-emerald-500 bg-emerald-500/10" small />
      </div>

      <VerifyBox documentLog={documentLog} lookup={lookup} />

      {/* Filtres */}
      <div className="rounded-2xl border border-line bg-surface p-3 space-y-3">
        <div className="flex flex-col lg:flex-row gap-2">
          <div className="relative flex-1 min-w-0">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
            <label htmlFor={`${uid}-q`} className="sr-only">Rechercher dans le registre</label>
            <input id={`${uid}-q`} type="search" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }}
              placeholder="Référence, document, membre, empreinte…" className="input pl-9" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 lg:w-[480px]">
            <label className="sr-only" htmlFor={`${uid}-t`}>Modèle</label>
            <select id={`${uid}-t`} value={templateId} onChange={(e) => { setTemplateId(e.target.value); setLimit(PAGE); }} className="input text-xs col-span-2 sm:col-span-1">
              <option value="">Tous les modèles</option>
              {usedTemplates.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
            <label className="sr-only" htmlFor={`${uid}-c`}>Catégorie</label>
            <select id={`${uid}-c`} value={category} onChange={(e) => { setCategory(e.target.value); setLimit(PAGE); }} className="input text-xs">
              <option value="">Toutes catégories</option>
              {DOCUMENT_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <label className="sr-only" htmlFor={`${uid}-y`}>Année</label>
            <select id={`${uid}-y`} value={year} onChange={(e) => { setYear(e.target.value); setLimit(PAGE); }} className="input text-xs">
              <option value="">Toutes années</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-dim" aria-live="polite">
            {rows.length} entrée{rows.length > 1 ? 's' : ''}{filtering ? ` sur ${documentLog.length}` : ''}
          </p>
          {filtering && (
            <button type="button" className="text-xs text-blue-600 dark:text-blue-400 hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
              onClick={() => { setQuery(''); setTemplateId(''); setCategory(''); setYear(''); }}>
              Effacer les filtres
            </button>
          )}
          <button type="button" onClick={exportCsv} disabled={!rows.length} className="btn-secondary py-1.5 text-xs ml-auto">
            <Download size={14} aria-hidden="true" /> Exporter le registre (CSV)
          </button>
        </div>
      </div>

      {documentLog.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line p-10 text-center">
          <FileStack size={24} className="mx-auto text-muted" aria-hidden="true" />
          <p className="mt-2 font-semibold text-ink">Registre vide</p>
          <p className="text-sm text-dim mt-1 max-w-md mx-auto">
            Chaque document exporté (PDF, impression, Word) reçoit un numéro unique et une empreinte, puis apparaît ici.
          </p>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-dim text-center py-8">Aucune entrée ne correspond aux filtres.</p>
      ) : (
        <>
          {/* Tableau (tablette / ordinateur) */}
          <div className="hidden md:block rounded-2xl border border-line bg-surface overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Registre des documents émis</caption>
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-dim border-b border-line">
                  <th scope="col" className="px-3 py-2.5 font-semibold">Réf.</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Date</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Document</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Membres</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Empreinte</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Format</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.slice(0, limit).map(e => {
                  const t = getTemplate(e.templateId);
                  return (
                    <tr key={e.id} className="hover:bg-hover/50 align-top">
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <button type="button" onClick={() => copyRef(e.ref)} title="Copier la référence"
                          className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-ink hover:text-blue-600 dark:hover:text-blue-400 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60">
                          {e.ref} <Copy size={11} className="text-muted" aria-hidden="true" />
                        </button>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs text-dim tabular-nums">{formatDateTime(e.createdAt)}</td>
                      <td className="px-3 py-2.5 min-w-[200px]"><DocCell entry={e} template={t} /></td>
                      <td className="px-3 py-2.5 text-xs text-dim max-w-[220px]"><MembersCell ids={e.memberIds} membersById={membersById} /></td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-dim whitespace-nowrap">{e.fingerprint || '—'}</td>
                      <td className="px-3 py-2.5"><span className="badge badge-neutral">{formatLabel(e.format)}</span></td>
                      <td className="px-3 py-2.5">
                        <RowActions entry={e} template={t} onRegenerate={onRegenerate} onRemove={remove} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Cartes (mobile) */}
          <ul className="md:hidden space-y-2">
            {rows.slice(0, limit).map(e => {
              const t = getTemplate(e.templateId);
              return (
                <li key={e.id} className="rounded-2xl border border-line bg-surface p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <button type="button" onClick={() => copyRef(e.ref)} className="inline-flex items-center gap-1 font-mono text-xs font-bold text-ink rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60">
                      {e.ref} <Copy size={11} className="text-muted" aria-hidden="true" /><span className="sr-only">Copier la référence</span>
                    </button>
                    <span className="text-[11px] text-dim tabular-nums">{formatDateTime(e.createdAt)}</span>
                  </div>
                  <DocCell entry={e} template={t} />
                  <div className="text-xs text-dim"><MembersCell ids={e.memberIds} membersById={membersById} /></div>
                  <div className="flex items-center gap-2 text-[11px] text-dim">
                    <Fingerprint size={12} aria-hidden="true" /> <span className="font-mono">{e.fingerprint || '—'}</span>
                    <span className="badge badge-neutral ml-auto">{formatLabel(e.format)}</span>
                  </div>
                  <RowActions entry={e} template={t} onRegenerate={onRegenerate} onRemove={remove} full />
                </li>
              );
            })}
          </ul>

          {rows.length > limit && (
            <div className="text-center">
              <button type="button" className="btn-secondary" onClick={() => setLimit(l => l + PAGE)}>
                Afficher plus ({rows.length - limit} restantes)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ icon: I, label, value, tone, small }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-3.5 flex items-center gap-3">
      <span className={`h-9 w-9 rounded-xl grid place-items-center shrink-0 ${tone}`} aria-hidden="true"><I size={17} /></span>
      <div className="min-w-0">
        <p className={`${small ? 'text-sm' : 'text-xl'} font-bold text-ink tabular-nums leading-tight`}>{value}</p>
        <p className="text-[11px] text-dim truncate">{label}</p>
      </div>
    </div>
  );
}

function DocCell({ entry, template }) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      {template && <span className={`h-6 w-6 rounded-lg grid place-items-center shrink-0 ${toneFor(template.category).tile}`} aria-hidden="true"><TemplateIcon name={template.icon} size={12} /></span>}
      <div className="min-w-0">
        <p className="text-sm text-ink font-medium leading-snug break-words">{entry.title || template?.title || 'Document'}</p>
        <p className="text-[11px] text-dim">{template ? `${template.title} · ${categoryLabel(template.category)}` : `Modèle « ${entry.templateId} » indisponible`}</p>
      </div>
    </div>
  );
}

function MembersCell({ ids, membersById }) {
  if (!ids?.length) return <span className="text-muted">—</span>;
  const names = ids.map(id => (membersById.get(id) ? memberName(membersById.get(id)) : 'Membre supprimé'));
  const shown = names.slice(0, 3).join(', ');
  return <span title={names.join(', ')}>{shown}{names.length > 3 ? ` +${names.length - 3}` : ''}</span>;
}

function RowActions({ entry, template, onRegenerate, onRemove, full }) {
  return (
    <div className={`flex items-center gap-1 ${full ? '' : 'justify-end'}`}>
      <button type="button" onClick={() => onRegenerate(entry)} disabled={!template}
        title={template ? 'Rouvrir le générateur avec les mêmes valeurs' : 'Modèle indisponible'}
        className={`btn-secondary py-1 px-2 text-xs ${full ? 'flex-1' : ''}`}>
        <RefreshCw size={13} aria-hidden="true" /> Régénérer
      </button>
      <button type="button" onClick={() => onRemove(entry)} aria-label={`Supprimer ${entry.ref} du registre`} title="Supprimer du registre"
        className="tap btn-ghost p-1.5 hover:!text-red-500">
        <Trash2 size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

/** Vérification d'un document à partir de sa référence (et de son empreinte). */
function VerifyBox({ documentLog, lookup }) {
  const uid = useId();
  const [ref, setRef] = useState('');
  const [fp, setFp] = useState('');
  const result = useMemo(() => verifyDocument(documentLog, ref, fp), [documentLog, ref, fp]);
  const entry = result.entry;
  const view = {
    match: { cls: 'border-emerald-500/30 bg-emerald-500/[0.07]', icon: ShieldCheck, iconCls: 'text-emerald-500', title: 'Document authentique', text: 'La référence existe et l\'empreinte correspond : le contenu n\'a pas été modifié depuis l\'émission.' },
    mismatch: { cls: 'border-red-500/30 bg-red-500/[0.07]', icon: ShieldAlert, iconCls: 'text-red-500', title: 'Empreinte différente', text: 'La référence existe mais l\'empreinte ne correspond pas : le document a pu être modifié, ou l\'empreinte a été mal recopiée.' },
    found: { cls: 'border-blue-500/30 bg-blue-500/[0.07]', icon: BadgeCheck, iconCls: 'text-blue-500', title: 'Référence trouvée', text: 'Saisis l\'empreinte imprimée en pied de page pour vérifier que le contenu est intact.' },
    'not-found': { cls: 'border-amber-500/30 bg-amber-500/[0.07]', icon: ShieldQuestion, iconCls: 'text-amber-500', title: 'Référence inconnue', text: 'Aucun document émis sous cette référence dans ce registre (ou l\'entrée a été supprimée).' },
  }[result.status];

  return (
    <section aria-labelledby={`${uid}-h`} className="rounded-2xl border border-line bg-surface p-4">
      <h3 id={`${uid}-h`} className="flex items-center gap-2 text-sm font-semibold text-ink">
        <ShieldCheck size={16} className="text-emerald-500" aria-hidden="true" /> Vérifier un document
      </h3>
      <p className="text-xs text-dim mt-0.5">Recopie la référence et l'empreinte imprimées en pied de page d'un document.</p>
      <div className="grid sm:grid-cols-2 gap-2 mt-3">
        <div>
          <label htmlFor={`${uid}-r`} className="text-[11px] font-semibold text-dim">Référence</label>
          <input id={`${uid}-r`} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="BDE-2026-0007" className="input font-mono uppercase" autoComplete="off" spellCheck={false} />
        </div>
        <div>
          <label htmlFor={`${uid}-f`} className="text-[11px] font-semibold text-dim">Empreinte <span className="font-normal">(facultatif)</span></label>
          <input id={`${uid}-f`} value={fp} onChange={(e) => setFp(e.target.value)} placeholder="3F9A-21C4-77B0" className="input font-mono uppercase" autoComplete="off" spellCheck={false} />
        </div>
      </div>
      {view && (
        <div className={`mt-3 flex gap-3 items-start rounded-xl border p-3 ${view.cls}`} role="status">
          <view.icon size={18} className={`shrink-0 mt-0.5 ${view.iconCls}`} aria-hidden="true" />
          <div className="text-sm min-w-0">
            <p className="font-semibold text-ink">{view.title}</p>
            <p className="text-dim text-xs mt-0.5">{view.text}</p>
            {entry && (
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                <dt className="text-dim">Document</dt><dd className="text-ink break-words">{entry.title}</dd>
                <dt className="text-dim">Émis le</dt><dd className="text-ink">{formatDateTime(entry.createdAt)}</dd>
                <dt className="text-dim">Empreinte</dt><dd className="text-ink font-mono">{entry.fingerprint || '—'}</dd>
                {entry.memberIds?.length > 0 && (<><dt className="text-dim">Membres</dt><dd className="text-ink">{entry.memberIds.map(id => lookup.memberName(id) || 'Membre supprimé').join(', ')}</dd></>)}
              </dl>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
