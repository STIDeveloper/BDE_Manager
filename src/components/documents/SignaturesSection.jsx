import { useId, useMemo, useRef, useState } from 'react';
import { Lock, PenLine, Plus, Trash2, Upload } from 'lucide-react';
import { levelKind } from '../../core/catalog';
import { confirmDialog } from '../ui/confirmStore';
import { toast } from '../ui/toastStore';
import SignaturePad from './SignaturePad';
import { compressImageFile } from './imageCompress';
import { CHECKER } from './templateIcons';
import { memberName, sortMembers } from './studioHelpers';

/**
 * Signatures des membres du bureau (et de tout autre signataire ajouté).
 * Enregistrées immédiatement dans le profil (store), sur cet appareil.
 *
 * @param {{ members: object[], catalog: object, signatures: object,
 *   setSignature: (memberId:string, dataUrl:string|null)=>{ok:boolean,error?:string} }} props
 */
export default function SignaturesSection({ members, catalog, signatures, setSignature }) {
  const uid = useId();
  const [extra, setExtra] = useState([]);
  const [drawingFor, setDrawingFor] = useState(null);
  const [busyFor, setBusyFor] = useState(null);
  const [addId, setAddId] = useState('');
  const fileRefs = useRef({});

  const roleRank = useMemo(() => new Map(catalog.roleList.map((r, i) => [r.id, i])), [catalog.roleList]);

  const signers = useMemo(() => {
    const isBureau = (m) => {
      const r = catalog.roles[m.mainRole];
      return !!r && levelKind(catalog, r.level) === 'bureau';
    };
    const list = members.filter(m => isBureau(m) || signatures?.[m.id] || extra.includes(m.id));
    return list.sort((a, b) => (roleRank.get(a.mainRole) ?? 999) - (roleRank.get(b.mainRole) ?? 999) || memberName(a).localeCompare(memberName(b), 'fr'));
  }, [members, catalog, signatures, extra, roleRank]);

  const others = useMemo(() => sortMembers(members.filter(m => !signers.includes(m))), [members, signers]);

  const apply = (member, dataUrl, okMsg) => {
    const res = setSignature(member.id, dataUrl);
    if (res?.ok === false) {
      toast.error('Signature non enregistrée', res.error);
      return false;
    }
    toast.success(okMsg, memberName(member));
    return true;
  };

  const importFile = async (member, file) => {
    if (!file) return;
    setBusyFor(member.id);
    try {
      // Fond blanc rendu transparent : la signature se pose proprement sur le document.
      const { dataUrl } = await compressImageFile(file, { maxSide: 700, removeWhite: true });
      apply(member, dataUrl, 'Signature importée');
    } catch (e) {
      toast.error('Image refusée', e?.message);
    } finally {
      setBusyFor(null);
      if (fileRefs.current[member.id]) fileRefs.current[member.id].value = '';
    }
  };

  const remove = async (member) => {
    const ok = await confirmDialog({
      title: 'Supprimer cette signature ?',
      message: `La signature de ${memberName(member)} ne sera plus apposée sur les nouveaux documents.`,
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
    if (ok) apply(member, null, 'Signature supprimée');
  };

  return (
    <div className="space-y-3">
      <p className="flex gap-2 items-start text-xs text-dim rounded-xl border border-line bg-elevated/50 p-3">
        <Lock size={14} className="shrink-0 mt-px text-emerald-500" aria-hidden="true" />
        <span>
          Les signatures sont enregistrées <strong className="text-ink">immédiatement</strong>, uniquement sur cet appareil
          (jamais envoyées en ligne). Elles sont incluses, sous forme d'images, dans les sauvegardes exportées : garde ces fichiers en lieu sûr.
        </span>
      </p>

      {signers.length === 0 && (
        <p className="text-sm text-dim">Aucun membre du bureau pour l'instant. Ajoute un signataire ci-dessous.</p>
      )}

      <ul className="space-y-2">
        {signers.map(m => {
          const sig = signatures?.[m.id];
          const role = catalog.roles[m.mainRole];
          const inputId = `${uid}-file-${m.id}`;
          return (
            <li key={m.id} className="rounded-xl border border-line p-3 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink truncate">{memberName(m)}</p>
                  <p className="text-xs text-dim truncate">{role?.label || m.mainRole || 'Sans rôle'}</p>
                </div>
                <div className={`h-14 w-36 rounded-lg border border-line grid place-items-center overflow-hidden ${sig ? CHECKER : 'bg-elevated'}`}>
                  {sig ? <img src={sig} alt={`Signature de ${memberName(m)}`} className="max-h-full max-w-full object-contain" />
                    : <span className="text-[11px] text-muted">Aucune signature</span>}
                </div>
                <div className="flex flex-wrap gap-1.5 w-full sm:w-auto">
                  <button type="button" className="btn-secondary py-1.5 text-xs" onClick={() => setDrawingFor(drawingFor === m.id ? null : m.id)}
                    aria-expanded={drawingFor === m.id}>
                    <PenLine size={13} aria-hidden="true" /> {sig ? 'Refaire' : 'Dessiner la signature'}
                  </button>
                  <input ref={el => { fileRefs.current[m.id] = el; }} id={inputId} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only"
                    onChange={(e) => importFile(m, e.target.files?.[0])} disabled={busyFor === m.id} />
                  <label htmlFor={inputId} className={`btn-secondary py-1.5 text-xs cursor-pointer [input:focus-visible+&]:ring-2 [input:focus-visible+&]:ring-blue-500/60 ${busyFor === m.id ? 'opacity-50 pointer-events-none' : ''}`}>
                    <Upload size={13} aria-hidden="true" /> {busyFor === m.id ? 'Import…' : 'Importer une image'}
                  </label>
                  {sig && (
                    <button type="button" className="tap btn-ghost p-1.5 hover:!text-red-500" onClick={() => remove(m)} aria-label={`Supprimer la signature de ${memberName(m)}`}>
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
              {drawingFor === m.id && (
                <SignaturePad
                  name={memberName(m)}
                  onCancel={() => setDrawingFor(null)}
                  onSave={(dataUrl) => { if (apply(m, dataUrl, 'Signature enregistrée')) setDrawingFor(null); }}
                />
              )}
            </li>
          );
        })}
      </ul>

      {others.length > 0 && (
        <div className="flex gap-2 items-end">
          <div className="flex-1 min-w-0">
            <label htmlFor={`${uid}-add`} className="text-[11px] font-semibold text-dim">Ajouter un signataire</label>
            <select id={`${uid}-add`} className="input" value={addId} onChange={(e) => setAddId(e.target.value)}>
              <option value="">Choisir un membre…</option>
              {others.map(m => <option key={m.id} value={m.id}>{memberName(m)}{catalog.roles[m.mainRole] ? ` — ${catalog.roles[m.mainRole].label}` : ''}</option>)}
            </select>
          </div>
          <button type="button" className="btn-secondary" disabled={!addId}
            onClick={() => { setExtra(x => [...x, addId]); setDrawingFor(addId); setAddId(''); }}>
            <Plus size={14} aria-hidden="true" /> Ajouter
          </button>
        </div>
      )}
    </div>
  );
}
