import { useId, useMemo, useState } from 'react';
import { Search, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { memberInitials, memberMatchesPicker, memberName } from './studioHelpers';
import { poleColorHex } from '../../core/catalog';

/**
 * Sélection multiple des membres concernés (modèles « par membre ») :
 * recherche, filtres pôle / rôle / colonne, sélection du filtre courant,
 * sélection suggérée par le modèle (memberFilter).
 *
 * @param {{ members: object[], selected: string[], onChange: (ids:string[])=>void,
 *   catalog: object, columns: object[], suggestedIds: string[]|null }} props
 */
export default function MemberPicker({ members, selected, onChange, catalog, columns, suggestedIds }) {
  const uid = useId();
  const [query, setQuery] = useState('');
  const [poleId, setPoleId] = useState('');
  const [roleId, setRoleId] = useState('');
  const [columnId, setColumnId] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const filters = useMemo(() => ({ query, poleId, roleId, columnId }), [query, poleId, roleId, columnId]);
  const visible = useMemo(
    () => members.filter(m => memberMatchesPicker(m, filters, catalog.roles)),
    [members, filters, catalog.roles],
  );
  const activeFilters = [poleId, roleId, columnId].filter(Boolean).length;
  const allVisibleSelected = visible.length > 0 && visible.every(m => selectedSet.has(m.id));

  // Ordre de sortie stable : celui de la liste (alphabétique).
  const emit = (set) => onChange(members.filter(m => set.has(m.id)).map(m => m.id));
  const toggle = (id) => {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id); else next.add(id);
    emit(next);
  };
  const toggleVisible = () => {
    const next = new Set(selectedSet);
    visible.forEach(m => (allVisibleSelected ? next.delete(m.id) : next.add(m.id)));
    emit(next);
  };
  const suggestedSet = useMemo(() => new Set(suggestedIds || []), [suggestedIds]);
  const isSuggestedSelection = suggestedIds && suggestedIds.length === selected.length && selected.every(id => suggestedSet.has(id));

  const resetFilters = () => { setPoleId(''); setRoleId(''); setColumnId(''); setQuery(''); };

  if (!members.length) {
    return (
      <div className="rounded-xl border border-dashed border-line p-4 text-sm text-dim text-center">
        Aucun membre pour l'instant. Ajoute des membres dans l'onglet <a href="#/kanban" className="text-blue-600 dark:text-blue-400 underline">Membres</a>.
      </div>
    );
  }

  return (
    <section aria-labelledby={`${uid}-title`} className="rounded-2xl border border-line bg-surface overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b border-line">
        <h3 id={`${uid}-title`} className="text-[13px] font-semibold text-ink">Membres concernés</h3>
        <span className={`badge ${selected.length ? 'badge-brand' : 'badge-rose'} tabular-nums`} aria-live="polite">
          {selected.length} / {members.length} sélectionné{selected.length > 1 ? 's' : ''}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {suggestedIds && !isSuggestedSelection && (
            <button type="button" onClick={() => onChange(suggestedIds)} className="btn-ghost px-2 py-1 text-xs"
              title="Sélection proposée par le modèle">
              <Sparkles size={13} aria-hidden="true" /> Suggérés ({suggestedIds.length})
            </button>
          )}
          {selected.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="btn-ghost px-2 py-1 text-xs">
              <X size={13} aria-hidden="true" /> Vider
            </button>
          )}
        </div>
      </div>

      <div className="p-2.5 space-y-2 border-b border-line bg-elevated/30">
        <div className="flex gap-2">
          <div className="relative flex-1 min-w-0">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
            <label htmlFor={`${uid}-q`} className="sr-only">Rechercher un membre</label>
            <input id={`${uid}-q`} type="search" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Nom, rôle, email…" className="input py-1.5 pl-8 text-sm" />
          </div>
          <button type="button" onClick={() => setShowFilters(v => !v)} aria-expanded={showFilters} aria-controls={`${uid}-filters`}
            className={`btn-secondary px-2.5 py-1.5 text-xs ${activeFilters ? 'border-blue-500/40 text-blue-600 dark:text-blue-400' : ''}`}>
            <SlidersHorizontal size={14} aria-hidden="true" />
            <span className="hidden sm:inline">Filtres</span>
            {activeFilters > 0 && <span className="tabular-nums">({activeFilters})</span>}
          </button>
        </div>
        {showFilters && (
          <div id={`${uid}-filters`} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label htmlFor={`${uid}-pole`} className="text-[10px] uppercase tracking-wide font-semibold text-dim">Pôle</label>
              <select id={`${uid}-pole`} value={poleId} onChange={(e) => setPoleId(e.target.value)} className="input py-1.5 text-xs">
                <option value="">Tous les pôles</option>
                {catalog.poleList.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={`${uid}-role`} className="text-[10px] uppercase tracking-wide font-semibold text-dim">Rôle</label>
              <select id={`${uid}-role`} value={roleId} onChange={(e) => setRoleId(e.target.value)} className="input py-1.5 text-xs">
                <option value="">Tous les rôles</option>
                <option value="__none__">Sans rôle du catalogue</option>
                {catalog.roleList.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={`${uid}-col`} className="text-[10px] uppercase tracking-wide font-semibold text-dim">Colonne</label>
              <select id={`${uid}-col`} value={columnId} onChange={(e) => setColumnId(e.target.value)} className="input py-1.5 text-xs">
                <option value="">Toutes les colonnes</option>
                {columns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={toggleVisible} disabled={!visible.length} className="btn-ghost px-2 py-1 text-xs">
            {allVisibleSelected ? 'Tout désélectionner' : 'Tout sélectionner'} ({visible.length}{visible.length !== members.length ? ' filtrés' : ''})
          </button>
          {(activeFilters > 0 || query) && (
            <button type="button" onClick={resetFilters} className="text-xs text-blue-600 dark:text-blue-400 hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60">
              Réinitialiser les filtres
            </button>
          )}
        </div>
      </div>

      <ul className="max-h-72 overflow-y-auto divide-y divide-line" aria-label="Liste des membres">
        {visible.map(m => {
          const role = catalog.roles[m.mainRole];
          const color = role ? poleColorHex(catalog.poles[role.pole]?.color) : '#71717a';
          const id = `${uid}-m-${m.id}`;
          const checked = selectedSet.has(m.id);
          return (
            <li key={m.id}>
              <label htmlFor={id} className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${checked ? 'bg-blue-500/[0.06]' : 'hover:bg-hover'}`}>
                <input id={id} type="checkbox" checked={checked} onChange={() => toggle(m.id)} className="h-4 w-4 accent-blue-600 shrink-0" />
                <span className="h-7 w-7 rounded-full grid place-items-center text-[10px] font-bold text-white shrink-0" style={{ backgroundColor: color }} aria-hidden="true">
                  {memberInitials(m)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-ink truncate">{memberName(m)}</span>
                  <span className="block text-[11px] text-dim truncate">{role?.label || m.mainRole || m.legacyMainRole || 'Sans rôle'}</span>
                </span>
                {suggestedSet.has(m.id) && (
                  <span className="badge badge-violet shrink-0" title="Proposé par le modèle">
                    <Sparkles size={10} aria-hidden="true" /> <span className="hidden sm:inline">suggéré</span>
                  </span>
                )}
              </label>
            </li>
          );
        })}
        {!visible.length && <li className="px-3 py-6 text-sm text-muted text-center">Aucun membre ne correspond aux filtres.</li>}
      </ul>
    </section>
  );
}
