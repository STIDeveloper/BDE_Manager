import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Eraser, Keyboard, PenLine, Undo2 } from 'lucide-react';
import { MAX_DATAURL_LENGTH, smoothPath, strokesBounds } from './imageMath';

const INKS = [
  { id: 'black', label: 'Encre noire', color: '#1b1f2a' },
  { id: 'blue', label: 'Encre bleue', color: '#1d3a8a' },
];

const SCRIPT_FONTS = [
  { id: 'script', label: 'Manuscrite', stack: '"Segoe Script", "Bradley Hand", "Snell Roundhand", cursive' },
  { id: 'brush', label: 'Pinceau', stack: '"Brush Script MT", "Brush Script Std", "Snell Roundhand", cursive' },
  { id: 'chancery', label: 'Calligraphie', stack: '"Lucida Handwriting", "Apple Chancery", "URW Chancery L", cursive' },
];

/** Trace un trait lissé (courbes quadratiques par les milieux). */
function drawStroke(g, stroke) {
  const path = smoothPath(stroke.points);
  g.strokeStyle = stroke.color;
  g.fillStyle = stroke.color;
  g.lineWidth = stroke.width;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (path.type === 'dot') {
    g.beginPath();
    g.arc(path.x, path.y, stroke.width / 2, 0, Math.PI * 2);
    g.fill();
    return;
  }
  g.beginPath();
  g.moveTo(path.start.x, path.start.y);
  path.curves.forEach(c => g.quadraticCurveTo(c.cx, c.cy, c.x, c.y));
  g.stroke();
}

/** Export PNG transparent, recadré sur les traits, sous la limite de poids. */
function exportStrokes(strokes) {
  const b = strokesBounds(strokes, 6);
  if (!b) return null;
  for (const scale of [3, 2, 1.5, 1]) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(b.width * scale));
    c.height = Math.max(1, Math.ceil(b.height * scale));
    const g = c.getContext('2d');
    g.scale(scale, scale);
    g.translate(-b.x, -b.y);
    strokes.forEach(s => drawStroke(g, s));
    const url = c.toDataURL('image/png');
    if (url.length <= MAX_DATAURL_LENGTH) return url;
  }
  return null;
}

/** Signature « écrite au clavier » rendue dans une police manuscrite. */
async function exportTyped(text, stack, color) {
  try { await document.fonts?.ready; } catch { /* polices système : rien à attendre */ }
  const size = 72;
  const font = `${size}px ${stack}`;
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = font;
  const width = Math.ceil(probe.measureText(text).width + size * 0.8);
  const height = Math.ceil(size * 1.7);
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const g = c.getContext('2d');
  g.font = font;
  g.fillStyle = color;
  g.textBaseline = 'middle';
  g.fillText(text, size * 0.4, height / 2);
  const url = c.toDataURL('image/png');
  return url.length <= MAX_DATAURL_LENGTH ? url : null;
}

/**
 * Pavé de signature : tracé au doigt, au stylet ou à la souris (Pointer
 * Events, lissage, écran haute densité, annulation du dernier trait), ou
 * signature écrite au clavier (alternative accessible).
 *
 * @param {{ name: string, onSave: (dataUrl:string)=>Promise<boolean>|boolean, onCancel: ()=>void }} props
 */
export default function SignaturePad({ name, onSave, onCancel }) {
  const uid = useId();
  const [mode, setMode] = useState('draw');
  const [strokes, setStrokes] = useState([]);
  const [ink, setInk] = useState(INKS[0].color);
  const [typed, setTyped] = useState(name || '');
  const [font, setFont] = useState(SCRIPT_FONTS[0].id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const strokesRef = useRef([]);
  const currentRef = useRef(null);
  const frameRef = useRef(0);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext('2d');
    const dpr = canvas.width / Math.max(1, canvas.clientWidth);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    strokesRef.current.forEach(s => drawStroke(g, s));
    if (currentRef.current) drawStroke(g, currentRef.current);
  }, []);

  const schedule = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => { frameRef.current = 0; redraw(); });
  }, [redraw]);

  useEffect(() => {
    strokesRef.current = strokes;
    redraw();
  }, [strokes, redraw]);

  // Taille réelle du canevas = taille affichée × densité de l'écran.
  useEffect(() => {
    if (mode !== 'draw') return undefined;
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      canvas.width = Math.round(wrap.clientWidth * dpr);
      canvas.height = Math.round(wrap.clientHeight * dpr);
      redraw();
    });
    ro.observe(wrap);
    return () => { ro.disconnect(); cancelAnimationFrame(frameRef.current); frameRef.current = 0; };
  }, [mode, redraw]);

  const pointOf = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    canvasRef.current.setPointerCapture?.(e.pointerId);
    const width = e.pointerType === 'pen' && e.pressure > 0 ? 1.3 + e.pressure * 2.4 : 2.6;
    currentRef.current = { points: [pointOf(e)], width, color: ink };
    setError('');
    schedule();
  };
  const onPointerMove = (e) => {
    const cur = currentRef.current;
    if (!cur) return;
    const events = e.nativeEvent.getCoalescedEvents?.() || [];
    (events.length ? events : [e.nativeEvent]).forEach(ev => {
      const p = pointOf(ev);
      const last = cur.points.at(-1);
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= 0.8) cur.points.push(p);
    });
    schedule();
  };
  const endStroke = () => {
    const done = currentRef.current;
    if (!done) return;
    currentRef.current = null;
    setStrokes(s => [...s, done]);
  };

  const fontStack = SCRIPT_FONTS.find(f => f.id === font)?.stack || SCRIPT_FONTS[0].stack;
  const canSave = mode === 'draw' ? strokes.length > 0 : typed.trim().length > 0;

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const url = mode === 'draw' ? exportStrokes(strokes) : await exportTyped(typed.trim(), fontStack, ink);
      if (!url) { setError('Signature trop lourde ou vide : recommence avec un tracé plus simple.'); return; }
      await onSave(url);
    } catch (e) {
      setError(e?.message || 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-line bg-elevated/50 p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Mode de signature" className="flex bg-elevated p-0.5 rounded-lg border border-line">
          {[['draw', 'Dessiner', PenLine], ['type', 'Écrire mon nom', Keyboard]].map(([id, label, I]) => (
            <button key={id} type="button" aria-pressed={mode === id} onClick={() => setMode(id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${
                mode === id ? 'bg-surface text-ink shadow-sm' : 'text-dim hover:text-ink'}`}>
              <I size={13} aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Couleur de l'encre" className="flex items-center gap-1.5 ml-auto">
          {INKS.map(i => (
            <button key={i.id} type="button" onClick={() => setInk(i.color)} aria-pressed={ink === i.color} aria-label={i.label} title={i.label}
              className={`tap h-6 w-6 rounded-full border-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${ink === i.color ? 'border-blue-500' : 'border-transparent'}`}>
              <span className="block h-4 w-4 m-auto rounded-full" style={{ backgroundColor: i.color }} />
            </button>
          ))}
        </div>
      </div>

      {mode === 'draw' ? (
        <>
          <div ref={wrapRef} className="relative h-44 sm:h-52 rounded-lg bg-white border border-black/10 overflow-hidden select-none">
            <canvas
              ref={canvasRef}
              className="absolute inset-0 h-full w-full touch-none cursor-crosshair"
              role="img"
              aria-label={`Zone de signature${strokes.length ? ` (${strokes.length} trait${strokes.length > 1 ? 's' : ''})` : ' (vide)'}`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endStroke}
              onPointerCancel={endStroke}
              onLostPointerCapture={endStroke}
            />
            <div className="pointer-events-none absolute left-6 right-6 bottom-10 border-b border-dashed border-slate-300" aria-hidden="true" />
            <span className="pointer-events-none absolute left-6 bottom-4 text-[11px] text-slate-400" aria-hidden="true">
              {strokes.length ? 'Signature' : 'Signe ici au doigt, au stylet ou à la souris'}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary py-1.5 text-xs" onClick={() => setStrokes(s => s.slice(0, -1))} disabled={!strokes.length}>
              <Undo2 size={13} aria-hidden="true" /> Annuler le trait
            </button>
            <button type="button" className="btn-secondary py-1.5 text-xs" onClick={() => setStrokes([])} disabled={!strokes.length}>
              <Eraser size={13} aria-hidden="true" /> Effacer
            </button>
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <div className="grid sm:grid-cols-[1fr_auto] gap-2">
            <div>
              <label htmlFor={`${uid}-name`} className="text-[11px] font-semibold text-dim">Nom à signer</label>
              <input id={`${uid}-name`} className="input" value={typed} onChange={(e) => setTyped(e.target.value)} maxLength={60} />
            </div>
            <div>
              <label htmlFor={`${uid}-font`} className="text-[11px] font-semibold text-dim">Style</label>
              <select id={`${uid}-font`} className="input" value={font} onChange={(e) => setFont(e.target.value)}>
                {SCRIPT_FONTS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </div>
          </div>
          <div className="h-28 rounded-lg bg-white border border-black/10 grid place-items-center overflow-hidden px-4" aria-hidden="true">
            <span className="text-4xl sm:text-5xl truncate max-w-full" style={{ fontFamily: fontStack, color: ink }}>{typed || ' '}</span>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-500" role="alert">{error}</p>}

      <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>Annuler</button>
        <button type="button" className="btn-primary" onClick={save} disabled={!canSave || saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer la signature'}
        </button>
      </div>
    </div>
  );
}
