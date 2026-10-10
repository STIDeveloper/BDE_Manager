// Petits composants d'interface partagés par la gestion des rôles.
import { Minus, Plus, Star, Lock } from 'lucide-react';
import { poleColorHex } from '../../../core/catalog.js';
import { FOCUS_RING, LEVEL_KIND_BADGE } from './constants.js';

const ICON_TONES = {
  default: 'text-dim hover:text-ink hover:bg-elevated',
  danger: 'text-dim hover:text-red-500 hover:bg-red-500/10',
  primary: 'text-blue-500 hover:bg-blue-500/10',
};

/** Bouton icône 36×36 px (cible tactile), libellé accessible obligatoire. */
export function IconButton({ label, onClick, disabled, tone = 'default', children, className = '', ...rest }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center w-9 h-9 rounded-lg shrink-0 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent ${FOCUS_RING} ${ICON_TONES[tone] || ICON_TONES.default} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Pastille de couleur d'un pôle (couleur en style inline : classes dynamiques invisibles pour Tailwind). */
export function PoleDot({ color, size = 10, className = '' }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block rounded-full shrink-0 ${className}`}
      style={{ width: size, height: size, backgroundColor: poleColorHex(color) }}
    />
  );
}

export function LevelBadge({ level }) {
  if (!level) return <span className="badge badge-neutral">Niveau inconnu</span>;
  return <span className={`badge ${LEVEL_KIND_BADGE[level.kind] || 'badge-neutral'}`}>{level.label}</span>;
}

/** Icônes ⭐ leadership / 🔒 essentiel, avec libellés accessibles. */
export function RoleFlags({ role, size = 13 }) {
  return (
    <>
      {role.leadership && (
        <span role="img" aria-label="Rôle de leadership" title="Rôle de leadership" className="inline-flex text-amber-500">
          <Star size={size} fill="currentColor" aria-hidden="true" />
        </span>
      )}
      {role.essential && (
        <span role="img" aria-label="Rôle essentiel" title="Rôle essentiel (à pourvoir en priorité)" className="inline-flex text-rose-500">
          <Lock size={size} aria-hidden="true" />
        </span>
      )}
    </>
  );
}

/** Capacité −/+ (chaque clic passe par le store → annulable avec Ctrl+Z). */
export function CapacityStepper({ value, onChange, roleLabel, max = 99 }) {
  return (
    <div role="group" aria-label={`Capacité de ${roleLabel}`} className="inline-flex items-center rounded-lg border border-line bg-elevated/60">
      <IconButton label={`Retirer une place à ${roleLabel}`} disabled={value <= 0} onClick={() => onChange(value - 1)}>
        <Minus size={14} aria-hidden="true" />
      </IconButton>
      <span className="min-w-[2.25rem] text-center text-sm font-semibold text-ink tabular-nums" aria-live="polite" aria-atomic="true">
        {value}<span className="sr-only">{value > 1 ? ' places' : ' place'}</span>
      </span>
      <IconButton label={`Ajouter une place à ${roleLabel}`} disabled={value >= max} onClick={() => onChange(value + 1)}>
        <Plus size={14} aria-hidden="true" />
      </IconButton>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="text-center py-10 px-4">
      {Icon && <Icon size={30} className="mx-auto mb-2 text-dim opacity-40" aria-hidden="true" />}
      <p className="text-sm font-medium text-ink">{title}</p>
      {children && <div className="text-xs text-dim mt-1 max-w-xs mx-auto">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Section titrée du panneau de détail. */
export function DetailSection({ title, icon: Icon, children, aside }) {
  return (
    <section className="border border-line rounded-xl p-3 sm:p-4 bg-surface">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-dim flex items-center gap-1.5">
          {Icon && <Icon size={13} aria-hidden="true" />}
          {title}
        </h4>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** En-tête de colonne (titre + action principale). */
export function ColumnHeader({ title, count, children, before }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 border-b border-line shrink-0">
      {before}
      <h3 className="text-sm font-semibold text-ink flex-1 min-w-0 truncate">
        {title}
        {count !== undefined && <span className="ml-1.5 text-xs font-normal text-dim">({count})</span>}
      </h3>
      {children}
    </div>
  );
}

/** Message d'erreur de champ (région live). */
export function FieldError({ id, children }) {
  if (!children) return null;
  return <p id={id} role="alert" className="text-xs text-red-500 mt-1">{children}</p>;
}

