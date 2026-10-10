import { useMemo } from 'react';
import { Copy, Info, Mail, TriangleAlert } from 'lucide-react';
import Modal from '../Modal';
import { useStore } from '../../store';
import { toast } from '../ui/toastStore';
import { buildDocumentMail, mailPlainText, mailtoHref } from './mailHelpers';
import { memberName } from './studioHelpers';

/**
 * Envoi en un clic d'un ou plusieurs documents émis : ouvre la messagerie
 * (mailto:) avec objet et corps préremplis. Aucun serveur d'envoi : le PDF
 * téléchargé est à joindre à la main (rappel affiché et inclus au message).
 *
 * @param {{ entries: object[], onClose: () => void }} props
 */
export default function SendDialog({ entries, onClose }) {
  const members = useStore(s => s.members);
  const organization = useStore(s => s.organization);
  const membersById = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);

  const mails = useMemo(() => (entries || []).map(e => {
    const recipients = (e.memberIds || []).map(id => membersById.get(id)).filter(Boolean);
    return { entry: e, recipients, ...buildDocumentMail(e, recipients, organization) };
  }), [entries, membersById, organization]);

  const copy = async (mail) => {
    try {
      await navigator.clipboard.writeText(mailPlainText(mail));
      toast.success('Message copié', 'Colle-le dans ta messagerie et joins le PDF.');
    } catch {
      toast.error('Copie impossible', 'Le presse-papiers n\'est pas accessible.');
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={mails.length > 1 ? `Envoyer ${mails.length} documents par email` : 'Envoyer par email'}
      description="Ta messagerie s'ouvre avec le message prérempli." maxWidth="max-w-xl"
      footer={<button type="button" className="btn-secondary" onClick={onClose}>Fermer</button>}>
      <div className="space-y-3">
        <p className="flex gap-2 rounded-xl border border-blue-500/30 bg-blue-500/[0.07] p-3 text-[13px] text-ink">
          <Info size={16} className="shrink-0 mt-0.5 text-blue-500" aria-hidden="true" />
          <span>Aucun email n'est envoyé par l'application : <strong>joins le PDF téléchargé</strong> au message avant de l'envoyer.</span>
        </p>
        <ul className="space-y-2">
          {mails.map(mail => (
            <li key={mail.entry.id || mail.entry.ref} className="rounded-xl border border-line bg-surface p-3 space-y-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink break-words">{mail.entry.title}</p>
                <p className="text-[11px] font-mono text-dim">{mail.entry.ref}</p>
              </div>
              <p className="text-xs text-dim break-words">
                <span className="font-semibold text-ink">À : </span>
                {mail.to.length ? mail.to.join(', ') : <span className="italic">aucun destinataire (à saisir dans ta messagerie)</span>}
              </p>
              {mail.missing.length > 0 && (
                <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                  <TriangleAlert size={13} aria-hidden="true" />
                  Sans email valide : {mail.missing.map(memberName).join(', ')} (fiche membre à compléter).
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <a href={mailtoHref(mail)} className="btn-primary py-1.5 text-xs" data-testid="mailto-link">
                  <Mail size={14} aria-hidden="true" /> Ouvrir ma messagerie
                </a>
                <button type="button" className="btn-secondary py-1.5 text-xs" onClick={() => copy(mail)}>
                  <Copy size={14} aria-hidden="true" /> Copier le message
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
