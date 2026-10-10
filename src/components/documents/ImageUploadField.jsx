import { useId, useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2, Upload } from 'lucide-react';
import { compressImageFile } from './imageCompress';
import { dataUrlBytes, formatBytes } from './imageMath';
import { toast } from '../ui/toastStore';
import { CHECKER } from './templateIcons';


/**
 * Import d'une image (logo, tampon) : glisser-déposer ou sélection,
 * redimensionnée et compressée côté client (≤ 380 Ko).
 *
 * @param {{ id: string, label: string, hint?: string, value: string|null,
 *   onChange: (dataUrl:string|null)=>void, maxSide?: number }} props
 */
export default function ImageUploadField({ id, label, hint, value, onChange, maxSide = 600 }) {
  const inputRef = useRef(null);
  const hintId = useId();
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const { dataUrl, width, height } = await compressImageFile(file, { maxSide });
      onChange(dataUrl);
      toast.success(`${label} importé`, `${width} × ${height} px · ${formatBytes(dataUrlBytes(dataUrl))}`);
    } catch (e) {
      toast.error('Image refusée', e?.message || 'Import impossible.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div>
      <p className="text-[13px] font-semibold text-ink mb-1">{label}</p>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }}
        className={`flex items-center gap-3 rounded-xl border border-dashed p-3 transition-colors ${dragOver ? 'border-blue-500 bg-blue-500/5' : 'border-line'}`}
      >
        <div className={`h-20 w-28 shrink-0 rounded-lg border border-line grid place-items-center overflow-hidden ${value ? CHECKER : 'bg-elevated'}`}>
          {busy ? <Loader2 size={18} className="animate-spin text-dim" aria-hidden="true" />
            : value ? <img src={value} alt={`${label} actuel`} className="max-h-full max-w-full object-contain" />
              : <ImagePlus size={20} className="text-muted" aria-hidden="true" />}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p id={hintId} className="text-xs text-dim">
            {value ? `${formatBytes(dataUrlBytes(value))} · ` : ''}{hint || 'PNG, JPEG ou WebP — glisse-dépose ou importe.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <input ref={inputRef} id={id} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only"
              aria-describedby={hintId} onChange={(e) => handleFile(e.target.files?.[0])} disabled={busy} />
            <label htmlFor={id}
              className={`btn-secondary py-1.5 text-xs cursor-pointer ${busy ? 'opacity-50 pointer-events-none' : ''} [input:focus-visible+&]:ring-2 [input:focus-visible+&]:ring-blue-500/60`}>
              <Upload size={13} aria-hidden="true" /> {value ? 'Remplacer' : 'Importer'}
            </label>
            {value && (
              <button type="button" onClick={() => onChange(null)} className="btn-ghost py-1.5 text-xs hover:!text-red-500" disabled={busy}>
                <Trash2 size={13} aria-hidden="true" /> Retirer
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
