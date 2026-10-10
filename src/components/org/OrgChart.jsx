import React, { useEffect, useRef, useState } from 'react';
import { Copy, Download, RefreshCw, Check, ZoomIn, ZoomOut } from 'lucide-react';
import mermaid from 'mermaid';
import { useStore } from '../../store';
import { generateOrgChart } from '../../utils/orgChartGenerator';
import { toast } from '../ui/toastStore';

export default function OrgChart() {
  const store = useStore();
  const { members, folders, rolePresets, theme } = store;
  const [svg, setSvg] = useState('');
  const [copied, setCopied] = useState(false);
  const [zoom, setZoom] = useState(1);
  const renderIdRef = useRef(0);
  const containerRef = useRef(null);

  const code = React.useMemo(() =>
    generateOrgChart({ members, folders, rolePresets }),
    [members, folders, rolePresets]);

  useEffect(() => {
    let cancelled = false;
    const id = `mermaid-${++renderIdRef.current}`;

    mermaid.initialize({
      startOnLoad: false,
      theme: theme === 'dark' ? 'dark' : 'default',
      securityLevel: 'loose',
      fontFamily: 'Inter, system-ui, sans-serif',
    });

    mermaid.render(id, code)
      .then(({ svg }) => {
        if (!cancelled) setSvg(svg);
      })
      .catch(err => {
        console.error('Mermaid render error:', err);
        if (!cancelled) setSvg(`<p style="color:#ef4444">Erreur de rendu : ${err.message}</p>`);
      });

    return () => { cancelled = true; };
  }, [code, theme]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success('Code Mermaid copié');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Copie impossible');
    }
  };

  const handleDownloadSVG = () => {
    if (!svg) return;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Organigramme_BDE_${new Date().toISOString().slice(0, 10)}.svg`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('SVG téléchargé');
  };

  const handleDownloadPNG = async () => {
    if (!svg || !containerRef.current) return;
    try {
      const svgEl = containerRef.current.querySelector('svg');
      if (!svgEl) return;

      const clone = svgEl.cloneNode(true);
      const bbox = svgEl.getBoundingClientRect();
      const w = bbox.width;
      const h = bbox.height;

      clone.setAttribute('width', w);
      clone.setAttribute('height', h);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

      const svgString = new XMLSerializer().serializeToString(clone);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = w * 2;
        canvas.height = h * 2;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = theme === 'dark' ? '#09090b' : '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(2, 2);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        canvas.toBlob((blob) => {
          if (!blob) return;
          const pngUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = pngUrl;
          a.download = `Organigramme_BDE_${new Date().toISOString().slice(0, 10)}.png`;
          a.click();
          URL.revokeObjectURL(pngUrl);
          toast.success('PNG téléchargé');
        });
      };
      img.src = url;
    } catch (err) {
      toast.error('Téléchargement impossible');
    }
  };

  const resetZoom = () => setZoom(1);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-500/10 p-2 rounded-lg">
            <RefreshCw size={16} className="text-indigo-500" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-ink">Organigramme dynamique</h3>
            <p className="text-[10px] text-dim">
              Généré automatiquement à partir de {members.length} membres • {folders.length} dossiers
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button onClick={() => setZoom(z => Math.max(0.5, z - 0.15))}
            className="bg-elevated hover:bg-line border border-line text-ink p-2 rounded-lg transition-colors" title="Zoom -">
            <ZoomOut size={14} />
          </button>
          <span className="text-xs text-dim font-mono w-12 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(2.5, z + 0.15))}
            className="bg-elevated hover:bg-line border border-line text-ink p-2 rounded-lg transition-colors" title="Zoom +">
            <ZoomIn size={14} />
          </button>
          <button onClick={resetZoom}
            className="text-xs text-dim hover:text-ink px-2 py-1.5 rounded-lg border border-line transition-colors">
            Reset
          </button>

          <div className="w-px h-6 bg-line mx-1" />

          <button onClick={handleCopy}
            className="flex items-center gap-1.5 bg-elevated hover:bg-line border border-line text-ink text-xs font-medium px-3 py-2 rounded-lg transition-colors">
            {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
            {copied ? 'Copié' : 'Copier code'}
          </button>
          <button onClick={handleDownloadSVG}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors">
            <Download size={12} /> SVG
          </button>
          <button onClick={handleDownloadPNG}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors">
            <Download size={12} /> PNG
          </button>
        </div>
      </div>

      <div className="bg-surface border border-line rounded-2xl overflow-hidden">
        <div
          ref={containerRef}
          className="overflow-auto p-4 min-h-[400px] max-h-[70vh] flex items-start justify-center"
          style={{ background: theme === 'dark' ? '#09090b' : '#fafafa' }}
        >
          <div
            style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', transition: 'transform 150ms' }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>
      </div>

      <details className="bg-surface border border-line rounded-xl p-3">
        <summary className="text-xs text-dim hover:text-ink cursor-pointer font-medium">
          Voir le code Mermaid brut
        </summary>
        <pre className="mt-3 text-[10px] font-mono text-ink/70 overflow-auto max-h-[300px] p-2 bg-base rounded-lg">
{code}
        </pre>
      </details>
    </div>
  );
}
