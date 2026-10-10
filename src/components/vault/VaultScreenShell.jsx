import { Loader2 } from 'lucide-react';

const TONES = {
  red: 'bg-red-500/10 text-red-500',
  amber: 'bg-amber-500/10 text-amber-500',
  emerald: 'bg-emerald-500/10 text-emerald-500',
};

/** Carte centrée commune aux écrans "création", "déverrouillage" et "migration". */
export function VaultScreenShell({ icon: Icon, tone = 'red', title, titleId, children, footer, wide = false }) {
  return (
    <div className={`${wide ? 'max-w-lg' : 'max-w-md'} mx-auto mt-6 sm:mt-12`}>
      <section aria-labelledby={titleId} className="bg-surface border border-line rounded-2xl p-5 sm:p-8">
        <div className="flex justify-center mb-4">
          <div className={`p-4 rounded-full ${TONES[tone] || TONES.red}`}>
            <Icon size={40} aria-hidden="true" />
          </div>
        </div>
        <h2 id={titleId} className="text-2xl font-bold mb-2 text-center text-ink">{title}</h2>
        {children}
      </section>
      {footer && <div className="mt-4 text-center">{footer}</div>}
    </div>
  );
}

/** Bouton principal avec état de chargement (dérivation PBKDF2 ≈ 0,3–1 s). */
export function SubmitButton({ busy, disabled, busyLabel, children }) {
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      aria-busy={busy}
      className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {busy ? (
        <>
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          {busyLabel}
        </>
      ) : children}
    </button>
  );
}

export function FormError({ id, children }) {
  if (!children) return null;
  return <p id={id} role="alert" className="text-red-500 text-sm">{children}</p>;
}
