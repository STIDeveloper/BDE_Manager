import { useId, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, Clock, FileText, Handshake, Landmark, LayoutGrid, Network, Scale, Search, ShieldCheck, TriangleAlert, Users, X,
} from 'lucide-react';
import { DOCUMENT_CATEGORIES } from '../../documents/model';
import { TemplateIcon, toneFor } from './templateIcons';
import { recentTemplateIds, templateMatches } from './studioHelpers';

const CATEGORY_ICONS = { Users, Landmark, Network, Handshake, ShieldCheck };
const categoryLabel = (id) => DOCUMENT_CATEGORIES.find(c => c.id === id)?.label || '';

/** Champs du profil requis par le modèle et encore vides. */
function missingProfile(template, organization) {
  return (template.requires || [])
    .map(p => p.replace(/^organization\./, ''))
    .filter(k => !organization?.[k]);
}

/**
 * Galerie des modèles : recherche, catégories, récents.
 * @param {{ templates: object[], organization: object, documentLog: object[], onOpen: (t:object)=>void }} props
 */
export default function TemplateGallery({ templates, organization, documentLog, onOpen }) {
  const searchId = useId();
  const searchRef = useRef(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');

  const counts = useMemo(() => {
    const c = {};
    templates.forEach(t => { c[t.category] = (c[t.category] || 0) + 1; });
    return c;
  }, [templates]);

  const filtered = useMemo(
    () => templates.filter(t => templateMatches(t, query, category, categoryLabel(t.category))),
    [templates, query, category],
  );

  const recent = useMemo(() => {
    const byId = new Map(templates.map(t => [t.id, t]));
    return recentTemplateIds(documentLog, 4).map(id => byId.get(id)).filter(Boolean);
  }, [templates, documentLog]);

  const filtering = !!query.trim() || !!category;

  if (!templates.length) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-surface p-10 text-center">
        <div className="mx-auto h-12 w-12 rounded-2xl bg-blue-500/10 text-blue-500 grid place-items-center">
          <FileText size={22} aria-hidden="true" />
        </div>
        <p className="mt-3 font-semibold text-ink">Les modèles arrivent…</p>
        <p className="text-sm text-dim mt-1">Aucun modèle de document n'est encore installé dans cette version.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Recherche + catégories */}
      <div className="space-y-3">
        <div className="relative max-w-xl">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <label htmlFor={searchId} className="sr-only">Rechercher un modèle</label>
          <input
            ref={searchRef}
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape' && query) { e.preventDefault(); setQuery(''); } }}
            placeholder="Attestation, procès-verbal, convention, RGPD…"
            className="input pl-9 pr-9 py-2.5"
          />
          {query && (
            <button type="button" onClick={() => { setQuery(''); searchRef.current?.focus(); }} aria-label="Effacer la recherche"
              className="tap absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60">
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" role="group" aria-label="Catégories">
          <button type="button" onClick={() => setCategory('')} aria-pressed={!category}
            className={`chip shrink-0 py-1.5 ${!category ? 'chip-active' : 'chip-idle'}`}>
            <LayoutGrid size={13} aria-hidden="true" /> Tous <span className="tabular-nums text-muted">{templates.length}</span>
          </button>
          {DOCUMENT_CATEGORIES.map(c => {
            const I = CATEGORY_ICONS[c.icon] || FileText;
            const active = category === c.id;
            const n = counts[c.id] || 0;
            return (
              <button key={c.id} type="button" onClick={() => setCategory(active ? '' : c.id)} aria-pressed={active} disabled={!n}
                className={`chip shrink-0 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed ${active ? 'chip-active' : 'chip-idle'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${toneFor(c.id).dot}`} aria-hidden="true" />
                <I size={13} aria-hidden="true" /> {c.label} <span className="tabular-nums text-muted">{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Récemment utilisés */}
      {!filtering && recent.length > 0 && (
        <section aria-labelledby={`${searchId}-recent`}>
          <h3 id={`${searchId}-recent`} className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-dim mb-2">
            <Clock size={13} aria-hidden="true" /> Récemment utilisés
          </h3>
          <div className="flex flex-wrap gap-2">
            {recent.map(t => {
              return (
                <button key={t.id} type="button" onClick={() => onOpen(t)}
                  className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink hover:border-line-strong hover:bg-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60">
                  <span className={`h-6 w-6 rounded-lg grid place-items-center ${toneFor(t.category).tile}`} aria-hidden="true"><TemplateIcon name={t.icon} size={13} /></span>
                  {t.title}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Résultats */}
      {filtering ? (
        filtered.length ? (
          <>
            <p className="text-xs text-dim" aria-live="polite">{filtered.length} modèle{filtered.length > 1 ? 's' : ''}</p>
            <CardGrid templates={filtered} organization={organization} onOpen={onOpen} />
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-line p-8 text-center" aria-live="polite">
            <p className="text-sm text-ink font-medium">Aucun modèle ne correspond.</p>
            <button type="button" className="btn-secondary mt-3" onClick={() => { setQuery(''); setCategory(''); }}>
              Effacer les filtres
            </button>
          </div>
        )
      ) : (
        DOCUMENT_CATEGORIES.filter(c => counts[c.id]).map(c => {
          const I = CATEGORY_ICONS[c.icon] || FileText;
          const list = templates.filter(t => t.category === c.id);
          return (
            <section key={c.id} aria-labelledby={`${searchId}-${c.id}`}>
              <div className="flex items-end gap-3 mb-2.5">
                <span className={`h-8 w-8 rounded-xl grid place-items-center ${toneFor(c.id).tile}`} aria-hidden="true"><I size={16} /></span>
                <div className="min-w-0">
                  <h3 id={`${searchId}-${c.id}`} className="text-sm font-bold text-ink">{c.label} <span className="text-muted font-medium tabular-nums">· {list.length}</span></h3>
                  <p className="text-xs text-dim truncate">{c.description}</p>
                </div>
              </div>
              <CardGrid templates={list} organization={organization} onOpen={onOpen} />
            </section>
          );
        })
      )}
    </div>
  );
}

function CardGrid({ templates, organization, onOpen }) {
  return (
    <ul className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {templates.map(t => <li key={t.id} className="flex"><TemplateCard template={t} organization={organization} onOpen={onOpen} /></li>)}
    </ul>
  );
}

function TemplateCard({ template: t, organization, onOpen }) {
  const tone = toneFor(t.category);
  const missing = missingProfile(t, organization);
  const legal = t.legal?.references?.length > 0;
  return (
    <button
      type="button"
      onClick={() => onOpen(t)}
      className="group relative w-full text-left flex flex-col rounded-2xl border border-line bg-surface p-4 overflow-hidden transition-all hover:border-line-strong hover:shadow-[var(--shadow-lg)] hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
    >
      <span className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${tone.bar} to-transparent opacity-70`} aria-hidden="true" />
      <span className="flex items-start gap-3">
        <span className={`h-10 w-10 rounded-xl grid place-items-center shrink-0 ${tone.tile}`} aria-hidden="true"><TemplateIcon name={t.icon} size={19} /></span>
        <span className="min-w-0">
          <span className="block font-semibold text-ink leading-snug">{t.title}</span>
          <span className="block text-[13px] text-dim mt-1 leading-snug line-clamp-2">{t.description}</span>
        </span>
      </span>
      <span className="mt-auto pt-3 flex flex-wrap items-center gap-1.5">
        <span className={`badge ${t.scope === 'member' ? 'badge-brand' : 'badge-violet'}`}>{t.scope === 'member' ? 'Par membre' : 'Association'}</span>
        {legal && <span className="badge badge-emerald"><Scale size={10} aria-hidden="true" /> Légal</span>}
        {missing.length > 0 && (
          <span className="badge badge-amber" title={`Profil à compléter : ${missing.join(', ')}`}>
            <TriangleAlert size={10} aria-hidden="true" /> Profil à compléter
          </span>
        )}
        <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400">
          Créer <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </span>
    </button>
  );
}
