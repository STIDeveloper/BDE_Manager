import { useId, useRef, useState } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import Modal from '../Modal';
import { useConfirmStore } from './confirmStore';

const TONES = {
  danger:  { icon: AlertTriangle, box: 'bg-red-500/10 border-red-500/30',     iconCls: 'text-red-500',   btn: 'bg-red-600 hover:bg-red-700 text-white' },
  warning: { icon: AlertTriangle, box: 'bg-amber-500/10 border-amber-500/30', iconCls: 'text-amber-500', btn: 'bg-amber-500 hover:bg-amber-600 text-white' },
  primary: { icon: Info,          box: 'bg-blue-500/10 border-blue-500/30',   iconCls: 'text-blue-500',  btn: 'bg-blue-600 hover:bg-blue-700 text-white' },
};

/** Affiche la confirmation en tête de file (montée une seule fois dans App). */
export default function ConfirmHost() {
  const current = useConfirmStore(s => s.queue[0]);
  if (!current) return null;
  // `key` : remet l'état interne à zéro pour chaque nouvelle demande.
  return <ConfirmDialogView key={current.id} req={current} />;
}

function ConfirmDialogView({ req }) {
  const resolve = useConfirmStore(s => s._resolve);
  const [typed, setTyped] = useState('');
  const cancelRef = useRef(null);
  const inputRef = useRef(null);
  const inputId = useId();
  const tone = TONES[req.tone] || TONES.primary;
  const Icon = tone.icon;
  const matches = !req.requireWord || typed.trim().toUpperCase() === String(req.requireWord).toUpperCase();

  const close = (value) => resolve(req.id, value);

  return (
    <Modal
      isOpen
      onClose={() => close(false)}
      title={req.title}
      maxWidth="max-w-md"
      initialFocusRef={req.requireWord ? inputRef : cancelRef}
    >
      <form
        onSubmit={(e) => { e.preventDefault(); if (matches) close(true); }}
        className="space-y-4"
      >
        {(req.message || req.details?.length > 0) && (
          <div className={`flex gap-3 items-start border rounded-xl p-3 ${tone.box}`}>
            <Icon size={18} className={`${tone.iconCls} shrink-0 mt-0.5`} aria-hidden="true" />
            <div className="text-sm text-ink space-y-2 min-w-0">
              {req.message && <div className="whitespace-pre-line">{req.message}</div>}
              {req.details?.length > 0 && (
                <ul className="list-disc pl-4 space-y-0.5 text-dim">
                  {req.details.map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              )}
            </div>
          </div>
        )}

        {req.requireWord && (
          <div>
            <label htmlFor={inputId} className="text-xs text-dim font-semibold mb-1 block">
              Tape <span className="font-mono text-red-500">{req.requireWord}</span> pour confirmer
            </label>
            <input
              id={inputId}
              ref={inputRef}
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="w-full bg-elevated border border-line rounded-lg px-3 py-2 text-ink font-mono focus:outline-none focus:border-red-500"
            />
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => close(false)}
            className="flex-1 bg-elevated hover:bg-line text-ink font-medium py-2.5 rounded-lg transition-colors border border-line"
          >
            {req.cancelLabel}
          </button>
          <button
            type="submit"
            disabled={!matches}
            className={`flex-1 font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${tone.btn}`}
          >
            {req.confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
