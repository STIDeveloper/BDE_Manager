// Relance des impayés par email (mailto, destinataires en Cci) + historique.
import { useId, useState } from 'react';
import { Mail, Copy, Send, AlertTriangle } from 'lucide-react';
import Modal from '../../components/Modal.jsx';
import { toast } from '../../components/ui/toastStore.js';
import { formatDateShort } from '../../documents/context.js';
import { memberName, labelCls } from '../finance/hooks.js';
import { useMembershipStore, DEFAULT_REMINDER } from './store.js';
import { buildMailto, groupMessage, personalMessage, openMailto } from './logic.js';

const MAILTO_LIMIT = 1900; // au-delà, certains clients mail tronquent le lien

export default function ReminderDialog({ rows, year, onClose }) {
  const settings = useMembershipStore(s => s.settings);
  const updateSettings = useMembershipStore(s => s.updateSettings);
  const addReminders = useMembershipStore(s => s.addReminders);
  const uid = useId();
  const tpl = settings.reminderTemplate || DEFAULT_REMINDER;
  const [subject, setSubject] = useState(tpl.subject);
  const [body, setBody] = useState(tpl.body);
  const [sentIds, setSentIds] = useState([]);

  const withEmail = rows.filter(r => r.member.email);
  const withoutEmail = rows.filter(r => !r.member.email);
  const template = { subject, body };
  const group = groupMessage(template, settings.defaultAmount, year);
  const groupUrl = buildMailto({ bcc: withEmail.map(r => r.member.email), subject: group.subject, body: group.body });
  const tooLong = groupUrl.length > MAILTO_LIMIT;

  const saveTemplate = () => {
    if (subject !== tpl.subject || body !== tpl.body) updateSettings({ reminderTemplate: { subject, body } });
  };

  const sendGroup = () => {
    saveTemplate();
    openMailto(groupUrl);
    addReminders(withEmail.map(r => r.member.id), year, 'email');
    setSentIds(withEmail.map(r => r.member.id));
    toast.success('Email de relance préparé', `${withEmail.length} destinataire(s) en Cci · relance consignée.`);
  };

  const sendOne = (r) => {
    saveTemplate();
    const msg = personalMessage(template, r.member, r.amount, year);
    openMailto(buildMailto({ to: [r.member.email], subject: msg.subject, body: msg.body }));
    addReminders([r.member.id], year, 'email');
    setSentIds(ids => [...new Set([...ids, r.member.id])]);
  };

  const markManual = () => {
    addReminders(withoutEmail.map(r => r.member.id), year, 'manuel');
    toast.info('Relance manuelle consignée', `${withoutEmail.length} membre(s).`);
  };

  const copyEmails = async () => {
    try {
      await navigator.clipboard.writeText(withEmail.map(r => r.member.email).join(', '));
      toast.success('Adresses copiées', `${withEmail.length} adresse(s).`);
    } catch { toast.error('Copie impossible', 'Le presse-papiers est indisponible.'); }
  };

  return (
    <Modal isOpen onClose={() => { saveTemplate(); onClose(); }} title={`Relancer ${rows.length} membre(s)`} maxWidth="max-w-2xl"
      description="Variables disponibles : {prenom}, {nom}, {montant}, {annee}."
      footer={(
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={copyEmails} disabled={!withEmail.length}><Copy size={14} aria-hidden="true" /> Copier les adresses</button>
          <button type="button" className="btn-primary" onClick={sendGroup} disabled={!withEmail.length}><Send size={14} aria-hidden="true" /> Ouvrir l'email groupé (Cci)</button>
        </div>
      )}>
      <div className="space-y-3">
        <div>
          <label htmlFor={`${uid}-s`} className={labelCls}>Objet</label>
          <input id={`${uid}-s`} className="input" value={subject} onChange={e => setSubject(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`${uid}-b`} className={labelCls}>Message</label>
          <textarea id={`${uid}-b`} className="input min-h-[160px] font-mono text-xs" value={body} onChange={e => setBody(e.target.value)} />
          <button type="button" className="btn-ghost text-xs py-1 mt-1" onClick={() => { setSubject(DEFAULT_REMINDER.subject); setBody(DEFAULT_REMINDER.body); }}>Rétablir le modèle par défaut</button>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-dim">Aperçu de l'email groupé</summary>
          <div className="mt-2 bg-elevated border border-line rounded-lg p-3 whitespace-pre-wrap text-ink"><strong>{group.subject}</strong>{'\n\n'}{group.body}</div>
          <p className="text-xs text-dim mt-1">Dans l'email groupé, {'{prenom}'} devient « à toutes et à tous ». Utilise l'envoi individuel ci-dessous pour personnaliser.</p>
        </details>
        {tooLong && (
          <p className="text-xs text-amber-600 dark:text-amber-400 flex gap-1"><AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden="true" />Beaucoup de destinataires : certains logiciels de messagerie tronquent les liens longs. En cas de souci, copie les adresses et colle-les en Cci.</p>
        )}
        <div>
          <h4 className="text-sm font-semibold text-ink mb-1">Envoi individuel personnalisé</h4>
          <ul className="divide-y divide-line border border-line rounded-xl max-h-60 overflow-y-auto">
            {withEmail.map(r => (
              <li key={r.member.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="flex-1 min-w-0 truncate">{memberName(r.member)} <span className="text-muted">· {r.member.email}</span></span>
                {r.reminderCount > 0 && <span className="text-xs text-muted shrink-0">{r.reminderCount} relance(s), dernière le {formatDateShort(r.lastReminder)}</span>}
                {sentIds.includes(r.member.id) && <span className="badge badge-emerald">Relancé</span>}
                <button type="button" className="btn-ghost p-1.5" aria-label={`Écrire à ${memberName(r.member)}`} onClick={() => sendOne(r)}><Mail size={14} aria-hidden="true" /></button>
              </li>
            ))}
          </ul>
        </div>
        {withoutEmail.length > 0 && (
          <div className="text-sm bg-amber-500/[0.08] border border-amber-500/20 rounded-xl p-3">
            <p className="text-ink">{withoutEmail.length} membre(s) sans email : {withoutEmail.map(r => memberName(r.member)).join(', ')}.</p>
            <button type="button" className="btn-secondary mt-2 py-1" onClick={markManual}>Consigner une relance manuelle</button>
          </div>
        )}
      </div>
    </Modal>
  );
}
