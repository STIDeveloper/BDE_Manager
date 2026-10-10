import { ArrowRight, EyeOff, RotateCcw, Sparkles } from 'lucide-react';
import { poleColorHex } from '../../core/catalog';
import { TemplateIcon, toneFor } from './templateIcons';
import { memberInitials, memberName, suggestionKey } from './studioHelpers';

const PRIORITY = {
  high: { label: 'Prioritaire', bar: 'bg-red-500', badge: 'badge-rose' },
  medium: { label: 'Recommandé', bar: 'bg-amber-500', badge: 'badge-amber' },
  low: { label: 'Optionnel', bar: 'bg-zinc-400', badge: 'badge-neutral' },
};

/**
 * « À faire » : suggestions intelligentes des modèles + contrôles intégrés.
 * @param {{ suggestions: object[], getTemplate: (id:string)=>object|null, membersById: Map,
 *   catalog: object, onPrepare: (s:object)=>void, onAction: (s:object)=>void,
 *   onDismiss: (key:string)=>void, dismissedCount: number, onRestore: ()=>void }} props
 */
export default function SuggestionsPanel({
  suggestions, getTemplate, membersById, catalog, onPrepare, onAction, onDismiss, dismissedCount, onRestore,
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-dim max-w-2xl">
        Le studio analyse tes membres, ton profil et le registre pour te proposer les documents à produire :
        renouvellements, pièces manquantes, formalités après un changement de bureau…
      </p>

      {suggestions.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface p-10 text-center">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-emerald-500/10 text-emerald-500 grid place-items-center">
            <Sparkles size={22} aria-hidden="true" />
          </div>
          <p className="mt-3 font-semibold text-ink">Tout est à jour ✨</p>
          <p className="text-sm text-dim mt-1">Aucune action recommandée pour le moment.</p>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {suggestions.map(s => {
            const key = suggestionKey(s);
            const p = PRIORITY[s.priority] || PRIORITY.low;
            const template = s.builtin ? null : getTemplate(s.templateId);
            const people = (s.memberIds || []).map(id => membersById.get(id)).filter(Boolean);
            const canPrepare = s.builtin ? !!s.action : !!template;
            return (
              <li key={key} className="relative flex flex-col rounded-2xl border border-line bg-surface p-4 pl-5 overflow-hidden">
                <span className={`absolute left-0 inset-y-0 w-1 ${p.bar}`} aria-hidden="true" />
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`badge ${p.badge}`}>{p.label}</span>
                  {template && (
                    <span className="badge badge-neutral">
                      <span className={`inline-grid place-items-center rounded ${toneFor(template.category).tile}`} aria-hidden="true"><TemplateIcon name={template.icon} size={10} /></span>
                      {template.title}
                    </span>
                  )}
                  {s.builtin && <span className="badge badge-neutral">Profil</span>}
                </div>
                <h3 className="mt-2 font-semibold text-ink leading-snug">{s.title}</h3>
                {s.reason && <p className="text-[13px] text-dim mt-1 leading-relaxed">{s.reason}</p>}

                {people.length > 0 && (
                  <div className="mt-3 flex items-center gap-2">
                    <div className="flex -space-x-2" aria-hidden="true">
                      {people.slice(0, 5).map(m => {
                        const role = catalog.roles[m.mainRole];
                        return (
                          <span key={m.id} title={memberName(m)}
                            className="h-7 w-7 rounded-full grid place-items-center text-[10px] font-bold text-white ring-2 ring-surface"
                            style={{ backgroundColor: role ? poleColorHex(catalog.poles[role.pole]?.color) : '#71717a' }}>
                            {memberInitials(m)}
                          </span>
                        );
                      })}
                      {people.length > 5 && (
                        <span className="h-7 w-7 rounded-full grid place-items-center text-[10px] font-bold bg-elevated text-dim ring-2 ring-surface">+{people.length - 5}</span>
                      )}
                    </div>
                    <span className="text-xs text-dim truncate">
                      {people.length === 1 ? memberName(people[0]) : `${people.length} membres concernés`}
                    </span>
                  </div>
                )}

                <div className="mt-auto pt-3 flex items-center gap-2">
                  <button type="button" disabled={!canPrepare}
                    onClick={() => (s.builtin ? onAction(s) : onPrepare(s))}
                    className="btn-primary py-1.5 text-xs">
                    {s.builtin ? (s.actionLabel || 'Ouvrir') : 'Préparer'} <ArrowRight size={13} aria-hidden="true" />
                  </button>
                  {!canPrepare && <span className="text-[11px] text-muted">Modèle indisponible</span>}
                  <button type="button" onClick={() => onDismiss(key)} className="btn-ghost py-1.5 px-2 text-xs ml-auto"
                    aria-label={`Masquer la suggestion « ${s.title} »`}>
                    <EyeOff size={13} aria-hidden="true" /> Masquer
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {dismissedCount > 0 && (
        <button type="button" onClick={onRestore} className="btn-ghost text-xs">
          <RotateCcw size={13} aria-hidden="true" /> Réafficher les suggestions masquées ({dismissedCount})
        </button>
      )}
    </div>
  );
}
