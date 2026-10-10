// Fichiers : plusieurs fichiers, contrôle taille / type avant ajout, aperçu
// des images, progression de l'enregistrement local. Les fichiers sont
// gardés sur l'appareil (rt.storeFile) puis transmis avec la réponse.

import { useEffect, useRef, useState } from 'react';
import { FileText, Paperclip, Trash2, Upload } from 'lucide-react';

const DEFAULT_MB = 10;

function formatSize(n) {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} o`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} Ko`;
  return `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
}

function accepts(accept, file) {
  if (!Array.isArray(accept) || !accept.length) return true;
  const type = String(file.type || '').toLowerCase();
  const name = String(file.name || '').toLowerCase();
  return accept.some(a => {
    const x = String(a).trim().toLowerCase();
    if (x.startsWith('.')) return name.endsWith(x);
    if (x.endsWith('/*')) return type.startsWith(x.slice(0, -1));
    return type === x;
  });
}

function Thumb({ fileRef, rt }) {
  const [url, setUrl] = useState(null);
  const isImage = String(fileRef.type || '').startsWith('image/') && !/svg/i.test(fileRef.type);
  useEffect(() => {
    if (!isImage || !rt.getFileBlob) return undefined;
    let alive = true;
    let u = null;
    rt.getFileBlob(fileRef.id).then(blob => {
      if (!alive || !blob) return;
      u = URL.createObjectURL(blob);
      setUrl(u);
    });
    return () => { alive = false; if (u) URL.revokeObjectURL(u); };
  }, [fileRef.id, isImage, rt]);
  if (url) return <img src={url} alt="" />;
  return <span style={{ width: 44, height: 44, display: 'grid', placeItems: 'center' }} className="fr-muted"><FileText size={22} aria-hidden="true" /></span>;
}

export default function FileInput({ item, value, onChange, ids, ariaDescribedBy, invalid, readOnly, rt }) {
  const v = item.validation || {};
  const maxMb = Number(v.maxFileSizeMb) > 0 ? Math.min(Number(v.maxFileSizeMb), DEFAULT_MB) : DEFAULT_MB;
  const maxFiles = Number.isInteger(v.maxFiles) && v.maxFiles > 0 ? v.maxFiles : (item.multiple === false ? 1 : 10);
  const list = Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : [];
  const [busy, setBusy] = useState(null); // { done, total }
  const [localError, setLocalError] = useState('');
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);
  const listRef = useRef(list);
  useEffect(() => { listRef.current = list; });

  const add = async files => {
    setLocalError('');
    const arr = [...files];
    const room = maxFiles - listRef.current.length;
    if (room <= 0) { setLocalError(`${maxFiles} fichier${maxFiles > 1 ? 's' : ''} maximum.`); return; }
    const errs = [];
    const ok = [];
    for (const f of arr.slice(0, room)) {
      if (f.size > maxMb * 1024 * 1024) errs.push(`« ${f.name} » dépasse ${maxMb} Mo.`);
      else if (!accepts(v.accept, f)) errs.push(`« ${f.name} » : type de fichier non accepté.`);
      else ok.push(f);
    }
    if (arr.length > room) errs.push(`Seuls ${room} fichier${room > 1 ? 's' : ''} de plus peuvent être ajoutés.`);
    const refs = [];
    setBusy({ done: 0, total: ok.length });
    for (const f of ok) {
      try { refs.push(await rt.storeFile(f)); } catch (e) { errs.push(`« ${f.name} » : ${e?.message || 'enregistrement impossible'}.`); }
      setBusy(b => (b ? { ...b, done: b.done + 1 } : b));
    }
    setBusy(null);
    if (errs.length) setLocalError(errs.join(' '));
    if (refs.length) onChange([...listRef.current, ...refs]);
  };

  const remove = ref => {
    const next = list.filter(r => r.id !== ref.id);
    onChange(next.length ? next : null);
    if (ref.local) rt.removeFile?.(ref);
  };

  const acceptAttr = Array.isArray(v.accept) && v.accept.length ? v.accept.join(',') : undefined;
  const statusId = `${ids.control}-status`;
  return (
    <div>
      {!readOnly && list.length < maxFiles && (
        <div
          className={`fr-drop ${drag ? 'fr-drag' : ''}`}
          onDragOver={e => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); if (e.dataTransfer?.files?.length) add(e.dataTransfer.files); }}
        >
          <Upload size={22} aria-hidden="true" className="fr-muted" style={{ margin: '0 auto 6px' }} />
          <input
            ref={inputRef}
            id={ids.control}
            type="file"
            className="sr-only"
            multiple={maxFiles > 1}
            accept={acceptAttr}
            aria-describedby={[ariaDescribedBy, statusId].filter(Boolean).join(' ')}
            aria-invalid={invalid || undefined}
            onChange={e => { if (e.target.files?.length) add(e.target.files); e.target.value = ''; }}
          />
          <button type="button" className="fr-btn fr-btn-secondary" onClick={() => inputRef.current?.click()} disabled={!!busy}>
            <Paperclip size={16} aria-hidden="true" /> {list.length ? 'Ajouter un fichier' : 'Choisir un fichier'}
          </button>
          <p className="fr-help" id={statusId}>
            ou glisse-le ici · {maxMb} Mo max{maxFiles > 1 ? ` · ${maxFiles} fichiers max` : ''}
            {acceptAttr ? ` · ${v.accept.join(', ')}` : ''}
          </p>
        </div>
      )}
      {busy && (
        <div role="status" style={{ marginTop: 8 }}>
          <p className="fr-help">Préparation des fichiers… {busy.done} / {busy.total}</p>
          <div className="fr-bar" aria-hidden="true"><span style={{ width: `${busy.total ? (busy.done / busy.total) * 100 : 0}%` }} /></div>
        </div>
      )}
      {localError && <p className="fr-error" role="alert">{localError}</p>}
      {list.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'grid', gap: 6 }} aria-label="Fichiers joints">
          {list.map(ref => (
            <li key={ref.id} className="fr-file">
              <Thumb fileRef={ref} rt={rt} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{ref.name}</span>
                <span className="fr-help" style={{ marginTop: 0, display: 'block' }}>
                  {formatSize(ref.size)} · {ref.local ? rt.fileNote : 'déjà envoyé'}
                </span>
              </span>
              {!readOnly && (
                <button type="button" className="fr-iconbtn" aria-label={`Retirer ${ref.name}`} onClick={() => remove(ref)}>
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
