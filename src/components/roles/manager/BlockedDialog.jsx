// Explication d'une action refusée (pôle / niveau encore utilisé).
// Choix UX : une fenêtre plutôt qu'un toast, pour laisser le temps de lire la
// liste des rôles concernés et proposer l'action utile.
import { AlertTriangle } from 'lucide-react';
import Modal from '../../Modal';

/**
 * @param {{title:string, message:string, items?:string[], actionLabel?:string, onAction?:()=>void, onClose:()=>void}} props
 */
export default function BlockedDialog({ title, message, items = [], actionLabel, onAction, onClose }) {
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={title}
      maxWidth="max-w-md"
      footer={(
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          {actionLabel && onAction && (
            <button type="button" onClick={() => { onAction(); onClose(); }} className="btn-secondary min-h-[40px]">
              {actionLabel}
            </button>
          )}
          <button type="button" data-autofocus onClick={onClose} className="btn-primary min-h-[40px]">Compris</button>
        </div>
      )}
    >
      <div className="flex gap-3 items-start border rounded-xl p-3 bg-amber-500/10 border-amber-500/30">
        <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="text-sm text-ink space-y-2 min-w-0">
          <p>{message}</p>
          {items.length > 0 && (
            <ul className="list-disc pl-4 space-y-0.5 text-dim">
              {items.map(item => <li key={item}>{item}</li>)}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
