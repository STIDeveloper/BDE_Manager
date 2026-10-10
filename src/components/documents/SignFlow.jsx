import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, FileDown, Hand, Loader2, ShieldAlert, X } from 'lucide-react';
import { useStore } from '../../store';
import { useDocsStore } from '../../modules/docs/store';
import { toast } from '../ui/toastStore';
import SignaturePad from './SignaturePad';
import SheetView from './SheetView';
import { memberName } from './studioHelpers';
import { formatDateTime } from './registryHelpers';
import { applySignature, defaultSlotFor, downloadSignedPdf, issueOfEntry, regenerateEntry, signatureSlotsOf } from './signHelpers';

/**
 * Circuit de signature sur l'appareil, en plein écran :
 * « Passe l'appareil à … » → lecture du document + signature + « Lu et
 * approuvé » → enregistrement (store docs, lié à l'entrée du registre).
 *
 * @param {{ entry: object, ctx: object, onClose: () => void }} props
 */
export default function SignFlow({ entry, ctx, onClose }) {
  const uid = useId();
  const members = useStore(s => s.members);
  const recordSignature = useDocsStore(s => s.recordSignature);
  const existing = useDocsStore(s => s.signatures[entry.id]);
  const panelRef = useRef(null);

  const signers = useMemo(() => (entry.memberIds || []).map(id => members.find(m => m.id === id)).filter(Boolean), [entry.memberIds, members]);
  const [signerId, setSignerId] = useState(signers[0]?.id || '');
  const signer = signers.find(m => m.id === signerId) || null;
  const [step, setStep] = useState('handoff');
  const [state, setState] = useState({ loading: true, doc: null, matches: false, error: '' });
  const [slot, setSlot] = useState(-1);
  const [approved, setApproved] = useState(false);
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    regenerateEntry(entry, ctx).then(res => {
      if (!alive) return;
      setState({ loading: false, doc: res.doc, matches: res.matches, error: res.error || '' });
    });
    return () => { alive = false; };
  }, [entry, ctx]);

  const slots = useMemo(() => signatureSlotsOf(state.doc), [state.doc]);
  const slotIndex = slot >= 0 && slot < slots.length ? slot : defaultSlotFor(slots, signer);
  const chosen = slots[slotIndex] || null;

  // Plein écran : défilement de la page bloqué, Échap ferme, focus initial.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    panelRef.current?.querySelector('[data-autofocus]')?.focus();
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose]);
  useEffect(() => { panelRef.current?.querySelector('[data-autofocus]')?.focus(); }, [step]);

  const blocker = state.loading ? null
    : state.error ? state.error
      : !state.matches ? 'Le contenu régénéré ne correspond plus à la version émise (membre, profil ou valeurs modifiés depuis, ou retouches de texte). Réémets le document avant de le faire signer.'
        : !slots.length ? 'Ce document ne comporte aucun bloc de signature.'
          : !signer ? 'Aucun membre concerné par ce document.'
            : null;

  const save = async (image) => {
    if (!approved) { toast.warn('Coche « Lu et approuvé »', 'La signature n\'est enregistrée qu\'après lecture du document.'); return false; }
    try {
      const rec = recordSignature(entry.id, {
        ref: entry.ref, memberId: signer.id, signerName: memberName(signer), image,
        blockId: chosen?.blockId, slotIndex: chosen?.slotIndex ?? 0, signedAt: new Date().toISOString(),
      });
      setSaved(rec);
      setStep('done');
      toast.success('Signature enregistrée', `${entry.ref} — ${memberName(signer)}`);
      return true;
    } catch (e) {
      toast.error('Signature non enregistrée', e?.message);
      return false;
    }
  };

  const download = async () => {
    setBusy(true);
    try {
      const name = await downloadSignedPdf(entry, ctx, saved || existing);
      toast.success('PDF signé téléchargé', name);
    } catch (e) {
      toast.error('Téléchargement impossible', e?.message);
    } finally {
      setBusy(false);
    }
  };

  const first = signer?.firstName?.trim() || (signer ? memberName(signer) : 'la personne concernée');
  const previewDoc = useMemo(() => (state.doc && saved ? applySignature(state.doc, saved) : state.doc), [state.doc, saved]);

  return createPortal(
    <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={`${uid}-t`}
      className="fixed inset-0 z-[120] bg-base overflow-y-auto overscroll-contain">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-surface/95 backdrop-blur px-4 py-2.5">
        <p id={`${uid}-t`} className="text-sm font-semibold text-ink min-w-0 truncate">
          Signature — <span className="font-mono">{entry.ref}</span>
        </p>
        <button type="button" onClick={onClose} className="tap btn-ghost p-2 ml-auto" aria-label="Fermer le circuit de signature">
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      {step === 'handoff' && (
        <div className="max-w-lg mx-auto px-4 py-12 text-center space-y-5">
          <span className="mx-auto h-16 w-16 rounded-2xl bg-blue-500/10 text-blue-500 grid place-items-center" aria-hidden="true"><Hand size={30} /></span>
          <h2 className="text-2xl font-black text-ink">Passe l'appareil à {first}</h2>
          <p className="text-sm text-dim">{first} va lire « {entry.title} », puis signer sur l'écran.</p>
          {signers.length > 1 && (
            <div className="text-left max-w-xs mx-auto">
              <label htmlFor={`${uid}-who`} className="text-[13px] font-semibold text-ink">Signataire</label>
              <select id={`${uid}-who`} className="input" value={signerId} onChange={(e) => { setSignerId(e.target.value); setSlot(-1); }}>
                {signers.map(m => <option key={m.id} value={m.id}>{memberName(m)}</option>)}
              </select>
            </div>
          )}
          {existing && <p className="text-xs text-amber-700 dark:text-amber-300">Déjà signé le {formatDateTime(existing.signedAt)} : une nouvelle signature remplacera la précédente.</p>}
          {state.loading ? (
            <p className="text-sm text-dim inline-flex items-center gap-2" role="status"><Loader2 size={15} className="animate-spin" aria-hidden="true" /> Préparation du document…</p>
          ) : blocker ? (
            <p role="alert" className="flex gap-2 text-left rounded-xl border border-red-500/30 bg-red-500/[0.07] p-3 text-[13px] text-ink">
              <ShieldAlert size={16} className="shrink-0 mt-0.5 text-red-500" aria-hidden="true" /> {blocker}
            </p>
          ) : (
            <button type="button" className="btn-primary px-6 py-3 text-base" data-autofocus onClick={() => setStep('sign')}>
              Je suis {first}, commencer
            </button>
          )}
        </div>
      )}

      {step === 'sign' && state.doc && (
        <div className="max-w-6xl mx-auto px-4 py-5 grid gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] items-start">
          <section aria-label="Document à lire" className="rounded-2xl border border-line bg-elevated/40 p-2 sm:p-4 min-w-0">
            <SheetView doc={state.doc} organization={ctx.organization} issue={issueOfEntry(entry)} />
          </section>
          <section aria-label="Signer" className="space-y-4 lg:sticky lg:top-16">
            <div className="rounded-2xl border border-line bg-surface p-4 space-y-3">
              <h2 className="text-base font-bold text-ink">{first}, lis le document puis signe</h2>
              {slots.length > 1 && (
                <div>
                  <label htmlFor={`${uid}-slot`} className="text-[13px] font-semibold text-ink">Emplacement de la signature</label>
                  <select id={`${uid}-slot`} className="input" value={slotIndex} onChange={(e) => setSlot(Number(e.target.value))}>
                    {slots.map((s, i) => <option key={`${s.blockId}-${s.slotIndex}`} value={i}>{s.label}{s.name ? ` — ${s.name}` : ''}</option>)}
                  </select>
                </div>
              )}
              <label htmlFor={`${uid}-ok`} className="flex items-start gap-2.5 rounded-xl border border-line bg-elevated/50 p-3 cursor-pointer">
                <input id={`${uid}-ok`} type="checkbox" className="mt-0.5 h-4 w-4 accent-blue-600" checked={approved} onChange={(e) => setApproved(e.target.checked)} data-autofocus />
                <span className="text-sm text-ink"><strong>Lu et approuvé.</strong> J'ai lu ce document et je le signe.</span>
              </label>
              {approved ? (
                <SignaturePad name={signer ? memberName(signer) : ''} onSave={save} onCancel={onClose} />
              ) : (
                <p className="text-xs text-dim">Coche « Lu et approuvé » pour afficher le pavé de signature.</p>
              )}
            </div>
          </section>
        </div>
      )}

      {step === 'done' && (
        <div className="max-w-5xl mx-auto px-4 py-8 space-y-5">
          <div className="text-center space-y-2">
            <CheckCircle2 size={40} className="mx-auto text-emerald-500" aria-hidden="true" />
            <h2 className="text-2xl font-black text-ink">Merci {first} !</h2>
            <p className="text-sm text-dim">Signé le {formatDateTime(saved?.signedAt)}. Rends l'appareil à la personne qui t'a demandé de signer.</p>
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              <button type="button" className="btn-primary" onClick={download} disabled={busy} data-autofocus>
                {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <FileDown size={15} aria-hidden="true" />} Télécharger le PDF signé
              </button>
              <button type="button" className="btn-secondary" onClick={onClose}>Terminer</button>
            </div>
          </div>
          {previewDoc && (
            <div className="rounded-2xl border border-line bg-elevated/40 p-2 sm:p-4">
              <SheetView doc={previewDoc} organization={ctx.organization} issue={issueOfEntry(entry)} />
            </div>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}
