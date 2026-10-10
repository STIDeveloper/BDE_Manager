// Petits composants d'interface du Studio Formulaires.
import { Component, useId } from 'react';
import {
  Type, AlignLeft, User, Mail, Phone, MapPin, Link, CircleDot, SquareCheck, ChevronDownSquare, ToggleLeft, Images,
  ListOrdered, Grid3x3, Star, SlidersHorizontal, Gauge, Hash, Calendar, Clock, CalendarClock, CalendarRange, Paperclip,
  PenLine, ShieldCheck, Users, PartyPopper, CreditCard, Calculator, EyeOff, IdCard, Vote, Trophy, HandHeart, Receipt,
  Handshake, Square, FileText,
} from 'lucide-react';

const Icons = {
  Type, AlignLeft, User, Mail, Phone, MapPin, Link, CircleDot, SquareCheck, ChevronDownSquare, ToggleLeft, Images,
  ListOrdered, Grid3x3, Star, SlidersHorizontal, Gauge, Hash, Calendar, Clock, CalendarClock, CalendarRange, Paperclip,
  PenLine, ShieldCheck, Users, PartyPopper, CreditCard, Calculator, EyeOff, IdCard, Vote, Trophy, HandHeart, Receipt,
  Handshake, Square, FileText,
};

/** Icône lucide à partir de son nom (repli : carré). */
export function IconByName({ name, size = 16, className = '' }) {
  const Cmp = Icons[name] || Icons.Square;
  return <Cmp size={size} className={className} aria-hidden="true" />;
}

/** Champ libellé + contrôle (id fourni à l'enfant via render prop). */
export function Field({ label, hint, error, children, className = '' }) {
  const id = useId();
  return (
    <div className={`space-y-1 ${className}`}>
      <label htmlFor={id} className="block text-xs font-medium text-dim">{label}</label>
      {children(id)}
      {error ? <p className="text-xs text-red-600 dark:text-red-400" role="alert">{error}</p> : hint ? <p className="text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}

/** Interrupteur accessible. */
export function Toggle({ checked, onChange, label, hint, disabled }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <label htmlFor={id} className="text-sm text-ink cursor-pointer min-w-0">
        {label}
        {hint && <span className="block text-[11px] text-muted">{hint}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={!!checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative shrink-0 w-10 h-6 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 disabled:opacity-40 ${checked ? 'bg-blue-600' : 'bg-line-strong'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </button>
    </div>
  );
}

/** Contrôle segmenté (boutons radio). */
export function Segmented({ value, onChange, options, label, size = 'sm' }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 p-1 bg-elevated border border-line rounded-lg">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`px-2.5 ${size === 'xs' ? 'py-0.5 text-[11px]' : 'py-1 text-xs'} rounded-md font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${value === o.value ? 'bg-surface text-ink shadow-sm border border-line' : 'text-dim hover:text-ink border border-transparent'}`}
        >
          {o.icon && <o.icon size={13} className="inline -mt-0.5 mr-1" aria-hidden="true" />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Bloc de réglages titré. */
export function Panel({ title, description, children, actions }) {
  return (
    <section className="bg-surface border border-line rounded-2xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          {description && <p className="text-xs text-dim mt-0.5">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** Saisie numérique tolérante (vide → undefined). */
export function NumberInput({ value, onChange, id, min, max, step, placeholder, className = 'input' }) {
  return (
    <input
      id={id}
      type="number"
      inputMode="decimal"
      className={className}
      value={value ?? ''}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      onChange={e => {
        const raw = e.target.value;
        if (raw === '') onChange(undefined);
        else {
          const n = Number(raw);
          onChange(Number.isFinite(n) ? n : undefined);
        }
      }}
    />
  );
}

/** Capture les erreurs d'un composant tiers (moteur d'affichage en cours de développement). */
export class SafeBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    if (this.state.error) {
      return this.props.fallback ?? (
        <div role="alert" className="p-4 text-sm rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200">
          L'aperçu n'a pas pu être affiché ({String(this.state.error?.message || 'erreur inconnue').slice(0, 160)}).
        </div>
      );
    }
    return this.props.children;
  }
}

