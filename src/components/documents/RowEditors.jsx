import { useId } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { formatMoney } from '../../documents/context';
import { linesTotal, moveItem, numberInputValue, parseAmount, resolutionOutcome } from './studioHelpers';

const iconBtn = 'tap p-1.5 rounded-md text-dim hover:text-ink hover:bg-hover disabled:opacity-30 disabled:hover:bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60';

const OUTCOME = {
  adopted: { label: 'Adoptée', cls: 'badge-emerald' },
  rejected: { label: 'Rejetée', cls: 'badge-rose' },
  pending: { label: 'Vote à saisir', cls: 'badge-neutral' },
};

/** Boutons monter / descendre / supprimer d'une ligne. */
function RowActions({ index, count, onMove, onRemove, label }) {
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      <button type="button" className={iconBtn} disabled={index === 0} onClick={() => onMove(index, index - 1)} aria-label={`Monter ${label}`}>
        <ArrowUp size={14} aria-hidden="true" />
      </button>
      <button type="button" className={iconBtn} disabled={index === count - 1} onClick={() => onMove(index, index + 1)} aria-label={`Descendre ${label}`}>
        <ArrowDown size={14} aria-hidden="true" />
      </button>
      <button type="button" className={`${iconBtn} hover:!text-red-500`} onClick={() => onRemove(index)} aria-label={`Supprimer ${label}`}>
        <Trash2 size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * Éditeur de résolutions d'assemblée : titre, texte, pour / contre / abstention.
 * Valeur : [{ title, text, for, against, abstention }]
 */
export function ResolutionsEditor({ value, onChange, invalid }) {
  const baseId = useId();
  const rows = Array.isArray(value) ? value : [];
  const update = (i, patch) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = () => onChange([...rows, { title: '', text: '', for: '', against: '', abstention: '' }]);
  const move = (from, to) => onChange(moveItem(rows, from, to));
  const remove = (i) => onChange(rows.filter((_, j) => j !== i));

  return (
    <div className="space-y-2">
      {rows.length === 0 && (
        <p className={`text-xs rounded-lg border border-dashed px-3 py-3 text-center ${invalid ? 'border-red-500/60 text-red-500' : 'border-line text-muted'}`}>
          Aucune résolution pour l'instant.
        </p>
      )}
      {rows.map((r, i) => {
        const id = `${baseId}-${i}`;
        const outcome = OUTCOME[resolutionOutcome(r)];
        return (
          <div key={i} className="rounded-xl border border-line bg-elevated/50 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-dim tabular-nums w-6 shrink-0">n°{i + 1}</span>
              <label htmlFor={`${id}-t`} className="sr-only">Titre de la résolution {i + 1}</label>
              <input id={`${id}-t`} className="input py-1.5 font-medium" value={r.title ?? ''} placeholder="Ex. Approbation des comptes 2025-2026"
                onChange={(e) => update(i, { title: e.target.value })} />
              <RowActions index={i} count={rows.length} onMove={move} onRemove={remove} label={`la résolution ${i + 1}`} />
            </div>
            <label htmlFor={`${id}-x`} className="sr-only">Texte de la résolution {i + 1}</label>
            <textarea id={`${id}-x`} className="input min-h-[64px] text-[13px]" value={r.text ?? ''}
              placeholder="L'assemblée générale, après avoir entendu…"
              onChange={(e) => update(i, { text: e.target.value })} />
            <div className="flex flex-wrap items-end gap-2">
              {[['for', 'Pour'], ['against', 'Contre'], ['abstention', 'Abstention']].map(([k, label]) => (
                <div key={k} className="w-[88px]">
                  <label htmlFor={`${id}-${k}`} className="text-[10px] uppercase tracking-wide font-semibold text-dim">{label}</label>
                  <input id={`${id}-${k}`} type="number" min="0" inputMode="numeric" className="input py-1.5 tabular-nums"
                    value={r[k] ?? ''} onChange={(e) => update(i, { [k]: numberInputValue(e.target.value) })} />
                </div>
              ))}
              <span className={`badge ${outcome.cls} mb-2`}>{outcome.label}</span>
            </div>
          </div>
        );
      })}
      <button type="button" onClick={add} className="btn-secondary w-full border-dashed text-xs">
        <Plus size={14} aria-hidden="true" /> Ajouter une résolution
      </button>
    </div>
  );
}

/**
 * Lignes chiffrées (note de frais, budget) : libellé, date facultative,
 * montant ; total en direct.
 * Valeur : [{ label, amount, date? }]
 */
export function LinesEditor({ value, onChange, invalid }) {
  const baseId = useId();
  const rows = Array.isArray(value) ? value : [];
  const update = (i, patch) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = () => onChange([...rows, { label: '', amount: '' }]);
  const move = (from, to) => onChange(moveItem(rows, from, to));
  const remove = (i) => onChange(rows.filter((_, j) => j !== i));
  const total = linesTotal(rows);

  return (
    <div className="space-y-2">
      {rows.length === 0 && (
        <p className={`text-xs rounded-lg border border-dashed px-3 py-3 text-center ${invalid ? 'border-red-500/60 text-red-500' : 'border-line text-muted'}`}>
          Aucune ligne pour l'instant.
        </p>
      )}
      {rows.map((r, i) => {
        const id = `${baseId}-${i}`;
        const bad = r.amount !== '' && r.amount !== undefined && !Number.isFinite(parseAmount(r.amount));
        return (
          <div key={i} className="flex flex-wrap sm:flex-nowrap items-center gap-2 rounded-lg sm:rounded-none border sm:border-0 border-line p-2 sm:p-0">
            <label htmlFor={`${id}-l`} className="sr-only">Libellé de la ligne {i + 1}</label>
            <input id={`${id}-l`} className="input py-1.5 flex-1 min-w-[140px]" value={r.label ?? ''} placeholder="Libellé"
              onChange={(e) => update(i, { label: e.target.value })} />
            <label htmlFor={`${id}-d`} className="sr-only">Date de la ligne {i + 1} (facultatif)</label>
            <input id={`${id}-d`} type="date" className="input py-1.5 w-[138px] shrink-0 text-xs" value={r.date ?? ''} title="Date (facultatif)"
              onChange={(e) => update(i, e.target.value ? { date: e.target.value } : { date: undefined })} />
            <div className="relative w-28 shrink-0">
              <label htmlFor={`${id}-a`} className="sr-only">Montant de la ligne {i + 1} (euros)</label>
              <input id={`${id}-a`} type="number" step="0.01" inputMode="decimal"
                className={`input py-1.5 pr-6 text-right tabular-nums ${bad ? 'border-red-500' : ''}`}
                value={r.amount ?? ''} onChange={(e) => update(i, { amount: numberInputValue(e.target.value) })} />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none" aria-hidden="true">€</span>
            </div>
            <RowActions index={i} count={rows.length} onMove={move} onRemove={remove} label={`la ligne ${i + 1}`} />
          </div>
        );
      })}
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={add} className="btn-secondary border-dashed text-xs">
          <Plus size={14} aria-hidden="true" /> Ajouter une ligne
        </button>
        <p className="text-sm text-dim" aria-live="polite">
          Total : <strong className="text-ink tabular-nums">{formatMoney(total)}</strong>
        </p>
      </div>
    </div>
  );
}
