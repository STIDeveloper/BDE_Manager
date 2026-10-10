import { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { evaluatePassword } from './passwordStrength';

/** Champ mot de passe labellisé avec bouton afficher/masquer. */
export function PasswordField({
  label, value, onChange, autoComplete = 'current-password', describedBy, invalid, disabled, placeholder, className = '', ref,
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);

  return (
    <div className={className}>
      <label htmlFor={id} className="text-xs text-dim uppercase font-semibold mb-1 block">{label}</label>
      <div className="relative">
        <input
          id={id}
          ref={ref}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          disabled={disabled}
          placeholder={placeholder}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className="w-full bg-elevated border border-line rounded-xl pl-4 pr-11 py-3 text-ink placeholder-dim focus:outline-none focus:border-red-500 disabled:opacity-60"
        />
        <button
          type="button"
          onClick={() => setVisible(v => !v)}
          aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          aria-pressed={visible}
          aria-controls={id}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 text-dim hover:text-ink rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/50"
        >
          {visible ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}

const TONE = {
  none: { bar: 'bg-line', text: 'text-dim' },
  red: { bar: 'bg-red-500', text: 'text-red-500' },
  amber: { bar: 'bg-amber-500', text: 'text-amber-500' },
  emerald: { bar: 'bg-emerald-500', text: 'text-emerald-500' },
};

/** Jauge de robustesse (indicative) d'un nouveau mot de passe. */
export function PasswordStrengthMeter({ password, id }) {
  const { score, label, tone, tips } = evaluatePassword(password);
  const t = TONE[tone] || TONE.none;
  return (
    <div id={id} className="space-y-1" aria-live="polite">
      <div className="flex gap-1" aria-hidden="true">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className={`h-1.5 flex-1 rounded-full ${password && i < Math.max(1, score) ? t.bar : 'bg-line'}`} />
        ))}
      </div>
      {password ? (
        <p className="text-xs">
          <span className={`font-semibold ${t.text}`}>Robustesse : {label}</span>
          {tips[0] && <span className="text-dim"> — {tips[0]}</span>}
        </p>
      ) : (
        <p className="text-xs text-dim">8 caractères minimum recommandés (6 obligatoires).</p>
      )}
    </div>
  );
}
