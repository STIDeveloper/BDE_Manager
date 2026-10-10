// ============================================================
// QR DE PRÉSENCE — billets personnels (génération, envoi, PDF)
// ============================================================
import { useEffect, useId, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { ClipboardCopy, Download, Loader2, Mail, QrCode, RefreshCw, Ticket } from 'lucide-react';
import Modal from '../../../components/Modal.jsx';
import { toast } from '../../../components/ui/toastStore.js';
import { confirmDialog } from '../../../components/ui/confirmStore.js';
import { useStore } from '../../../store.js';
import { useEventsStore } from '../store.js';
import { ensureTokens, regenerateToken } from './actions.js';
import { TOKEN_RX, eventWhen, ticketEligible, ticketLink, ticketMail } from './logic.js';

function QrThumb({ link, label }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(link, { margin: 1, width: 240, errorCorrectionLevel: 'M' }).then(u => { if (alive) setSrc(u); }).catch(() => {});
    return () => { alive = false; };
  }, [link]);
  return src ? <img src={src} alt={label} className="w-40 h-40 rounded-lg border border-line bg-white p-1" /> : <div className="w-40 h-40 rounded-lg border border-line" role="status" aria-label="Génération du QR code" />;
}

export default function TicketsPanel({ eventId, canWrite, onClose }) {
  const uid = useId();
  const ev = useEventsStore(s => s.events[eventId]);
  const orgName = useStore(s => s.organization?.name) || '';
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => (ev?.participants || []).filter(ticketEligible).map(p => ({ p, token: TOKEN_RX.test(ev.checkin?.tokens?.[p.id] || '') ? ev.checkin.tokens[p.id] : null })), [ev]);
  const missing = rows.filter(r => !r.token).length;
  const when = eventWhen(ev);

  if (!ev) return null;

  const generate = () => {
    const n = ensureTokens(eventId);
    toast.success(n ? `${n} billet(s) créé(s)` : 'Tous les billets existent déjà');
  };
  const regen = async (p) => {
    if (!(await confirmDialog({ title: `Nouveau billet pour ${p.name} ?`, message: 'L’ancien QR code ne sera plus accepté à l’entrée (billet perdu ou partagé). Pense à envoyer le nouveau.', confirmLabel: 'Remplacer le billet', tone: 'warning' }))) return;
    regenerateToken(eventId, p.id);
    toast.success('Nouveau billet créé', p.name);
  };
  const pdf = async () => {
    const list = rows.filter(r => r.token).map(r => ({ participant: r.p, token: r.token }));
    if (!list.length) { toast.warn('Aucun billet', 'Génère d’abord les billets.'); return; }
    setBusy(true);
    try {
      const { downloadTicketsPdf } = await import('./ticketsPdf.js');
      const name = await downloadTicketsPdf(ev, list, { when, organization: orgName });
      toast.success('Billets téléchargés', `${list.length} billet(s) · ${name} (usage interne)`);
    } catch (err) {
      toast.error('PDF impossible', String(err?.message || err));
    } finally { setBusy(false); }
  };
  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); toast.success('Lien du billet copié'); } catch { toast.error('Copie impossible'); }
  };

  return (
    <Modal isOpen onClose={onClose} title="Billets QR personnels" description={ev.title} maxWidth="max-w-2xl">
      <div className="space-y-4">
        <p className="text-sm text-dim">Chaque inscrit reçoit un QR code <strong className="text-ink">personnel et non devinable</strong> (jeton aléatoire de 128 bits). Scanné à l’entrée, il le marque présent. Le lien du billet peut être envoyé par e-mail : le participant l’ouvre sur son téléphone le jour J.</p>
        <div className="flex flex-wrap gap-2">
          {canWrite && <button type="button" className="btn-primary" onClick={generate} disabled={!missing}><Ticket size={15} aria-hidden="true" /> {missing ? `Générer ${missing} billet(s) manquant(s)` : 'Billets à jour'}</button>}
          <button type="button" className="btn-secondary" onClick={pdf} disabled={busy || rows.every(r => !r.token)}>{busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Download size={15} aria-hidden="true" />} Planche de billets (PDF)</button>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-dim">Aucun inscrit : les billets sont réservés aux participants inscrits (pas à la liste d’attente).</p>
        ) : (
          <ul className="border border-line rounded-xl divide-y divide-line" aria-label="Billets">
            {rows.map(({ p, token }) => {
              const link = token ? ticketLink(token) : null;
              return (
                <li key={p.id} className="p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex-1 min-w-[150px]">
                      <p className="text-sm text-ink">{p.name} {p.status === 'present' && <span className="badge badge-emerald ml-1">Présent·e</span>}</p>
                      <p className="text-xs text-dim">{token ? `Billet n° ${token.slice(0, 8).toUpperCase()}` : 'Pas encore de billet'}{p.email ? ` · ${p.email}` : ' · pas d’e-mail'}</p>
                    </div>
                    {token && (
                      <>
                        <button type="button" className="btn-ghost p-2" aria-expanded={open === p.id} aria-controls={`${uid}-${p.id}`} onClick={() => setOpen(o => (o === p.id ? null : p.id))} aria-label={`Afficher le QR de ${p.name}`}><QrCode size={16} aria-hidden="true" /></button>
                        <button type="button" className="btn-ghost p-2" onClick={() => copy(link)} aria-label={`Copier le lien du billet de ${p.name}`}><ClipboardCopy size={16} aria-hidden="true" /></button>
                        {p.email
                          ? <a className="btn-secondary text-xs" href={ticketMail(ev, p, link, when)}><Mail size={14} aria-hidden="true" /> Envoyer</a>
                          : <span className="text-[11px] text-muted">Envoi : copie le lien</span>}
                        {canWrite && <button type="button" className="btn-ghost p-2" onClick={() => regen(p)} aria-label={`Remplacer le billet de ${p.name}`}><RefreshCw size={15} aria-hidden="true" /></button>}
                      </>
                    )}
                  </div>
                  {token && open === p.id && (
                    <div id={`${uid}-${p.id}`} className="flex flex-col items-center gap-1">
                      <QrThumb link={link} label={`QR du billet de ${p.name}`} />
                      <p className="text-[11px] text-muted break-all text-center">{link}</p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-[11px] text-muted">« Envoyer » ouvre ta messagerie avec le lien du billet (rien n’est envoyé automatiquement). Le PDF contient des noms : usage interne.</p>
      </div>
    </Modal>
  );
}
