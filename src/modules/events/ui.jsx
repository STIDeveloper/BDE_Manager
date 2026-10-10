// Petits composants partagés du module Événements.
import { STATUS_BADGE, statusLabel, participantStatusOf } from './logic.js';

export function StatusBadge({ status }) {
  return <span className={`badge ${STATUS_BADGE[status] || 'badge-neutral'}`}>{statusLabel(status)}</span>;
}

export function ParticipantBadge({ status }) {
  const s = participantStatusOf(status);
  return <span className={`badge ${s.badge}`}>{s.label}</span>;
}

/** Barre de progression accessible. */
export function Progress({ value, label, tone = 'bg-blue-500' }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={v}
      className="h-1.5 w-full rounded-full bg-elevated overflow-hidden">
      <div className={`h-full ${tone} transition-all`} style={{ width: `${v}%` }} />
    </div>
  );
}

/** Sélecteur de membre (liste déroulante). */
export function MemberSelect({ id, value, onChange, members, placeholder = '— Choisir un membre —', disabled, className = 'input', ariaLabel }) {
  return (
    <select id={id} aria-label={ariaLabel} className={className} value={value || ''} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {members.map(m => <option key={m.id} value={m.id}>{`${m.firstName || ''} ${m.lastName || ''}`.trim() || 'Sans nom'}</option>)}
    </select>
  );
}

/** Champ libellé + contrôle. */
export function Field({ label, children, hint, htmlFor }) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-xs font-medium text-dim">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="text-center py-10 px-4 border border-dashed border-line rounded-2xl">
      {Icon && <Icon size={28} className="mx-auto text-muted mb-2" aria-hidden="true" />}
      <p className="font-medium text-ink">{title}</p>
      {children && <p className="text-sm text-dim mt-1 max-w-md mx-auto">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
