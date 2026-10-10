// ============================================================
// PARTAGE — panneau réutilisable (lien court, QR, affiche, intégration)
// ============================================================
// Usage :
//   <SharePanel slug="wei-2027" title="Inscription WEI" description="…"
//               published={!!def.publishedVersion} embed={def.settings?.embed} />
// Peut remplacer le contenu de src/modules/forms/ShareModal.jsx (voir le
// rapport d'intégration) ou servir pour tout autre lien public (QR d'un
// événement, page de vérification de vote…) : `link` remplace alors le
// lien court calculé depuis `slug`.

import { useEffect, useId, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { AlertTriangle, ClipboardCopy, Code2, Download, FileText, Link2, Loader2, QrCode, ShieldCheck } from 'lucide-react';
import { useStore } from '../../store.js';
import { toast } from '../../components/ui/toastStore.js';
import { displayLink, embedSnippet, hashLink, normalizeOrigin, shortLink } from './links.js';

const TABS = [
  { id: 'link', label: 'Lien', icon: Link2 },
  { id: 'qr', label: 'QR code', icon: QrCode },
  { id: 'poster', label: 'Affiche A4', icon: FileText },
  { id: 'embed', label: 'Intégration', icon: Code2 },
];

async function copyToClipboard(text, what = 'Texte') {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copié`);
    return true;
  } catch {
    toast.error('Copie impossible', 'Sélectionne le texte puis copie-le manuellement.');
    return false;
  }
}

function download(href, name) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default function SharePanel({ slug, title = 'Formulaire', description = '', published = true, embed, link: customLink, initialTab = 'link', showEmbed = true }) {
  const uid = useId();
  const orgName = useStore(s => s.organization?.name) || '';
  const [tab, setTab] = useState(initialTab);
  const [qr, setQr] = useState({ png: null, svg: null, error: null });
  const [busy, setBusy] = useState(false);
  const [posterTitle, setPosterTitle] = useState(title);
  const [posterText, setPosterText] = useState(description ? String(description).slice(0, 160) : '');

  const link = customLink || shortLink(slug);
  const fallback = customLink ? null : hashLink(slug);
  const snippet = useMemo(() => (slug ? embedSnippet({ slug, title }) : ''), [slug, title]);
  const origins = useMemo(() => (embed?.origins || []).map(normalizeOrigin).filter(Boolean), [embed?.origins]);
  const tabs = showEmbed && slug ? TABS : TABS.filter(t => t.id !== 'embed');

  useEffect(() => {
    let alive = true;
    Promise.all([
      QRCode.toDataURL(link, { margin: 2, width: 720, errorCorrectionLevel: 'Q' }),
      QRCode.toString(link, { type: 'svg', margin: 2, errorCorrectionLevel: 'Q' }),
    ]).then(([png, svg]) => { if (alive) setQr({ png, svg, error: null }); })
      .catch(() => { if (alive) setQr({ png: null, svg: null, error: 'Génération du QR code impossible.' }); });
    return () => { alive = false; };
  }, [link]);

  const base = String(slug || title || 'lien').replace(/[^\w-]+/g, '_').slice(0, 60);
  const downloadSvg = () => {
    const url = URL.createObjectURL(new Blob([qr.svg], { type: 'image/svg+xml' }));
    download(url, `qr_${base}.svg`);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const poster = async () => {
    setBusy(true);
    try {
      const { downloadPoster } = await import('./qrPdf.js');
      const name = await downloadPoster({ title: posterTitle || title, subtitle: posterText, link, organization: orgName, fileName: `affiche_${base}` });
      toast.success('Affiche téléchargée', name);
    } catch (err) {
      toast.error('Affiche impossible', String(err?.message || err));
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Mode de partage" className="inline-flex flex-wrap gap-1 p-1 bg-elevated border border-line rounded-lg">
        {tabs.map(t => (
          <button key={t.id} type="button" role="tab" id={`${uid}-tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`${uid}-panel`}
            onClick={() => setTab(t.id)}
            className={`px-2.5 py-1 text-xs rounded-md font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${tab === t.id ? 'bg-surface text-ink shadow-sm border border-line' : 'text-dim hover:text-ink border border-transparent'}`}>
            <t.icon size={13} className="inline -mt-0.5 mr-1" aria-hidden="true" />{t.label}
          </button>
        ))}
      </div>

      {!published && (
        <p className="text-xs rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200 p-2.5 flex gap-1.5">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" aria-hidden="true" /> Pas encore publié : le lien ne fonctionnera qu’après la publication.
        </p>
      )}

      <div id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-tab-${tab}`}>
        {tab === 'link' && (
          <div className="space-y-3">
            <div>
              <label htmlFor={`${uid}-short`} className="block text-xs font-medium text-dim mb-1">Lien court</label>
              <div className="flex gap-2">
                <input id={`${uid}-short`} readOnly className="input font-mono text-xs" value={link} onFocus={e => e.target.select()} />
                <button type="button" className="btn-secondary shrink-0" onClick={() => copyToClipboard(link, 'Lien')}><ClipboardCopy size={15} aria-hidden="true" /> Copier</button>
              </div>
              <p className="text-[11px] text-muted mt-1">À dire à l’oral ou écrire : <strong className="text-dim">{displayLink(link)}</strong></p>
            </div>
            {fallback && (
              <div>
                <label htmlFor={`${uid}-hash`} className="block text-xs font-medium text-dim mb-1">Lien de secours (sans réécriture serveur)</label>
                <div className="flex gap-2">
                  <input id={`${uid}-hash`} readOnly className="input font-mono text-xs" value={fallback} onFocus={e => e.target.select()} />
                  <button type="button" className="btn-secondary shrink-0" onClick={() => copyToClipboard(fallback, 'Lien')} aria-label="Copier le lien de secours"><ClipboardCopy size={15} aria-hidden="true" /></button>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'qr' && (
          <div className="flex flex-col items-center gap-3">
            {qr.png ? <img src={qr.png} alt={`QR code menant à ${displayLink(link)}`} className="w-56 h-56 rounded-xl border border-line bg-white p-2" />
              : <div className="w-56 h-56 rounded-xl border border-line flex items-center justify-center text-sm text-dim" role="status">{qr.error || 'Génération…'}</div>}
            <p className="text-xs text-muted font-mono break-all text-center">{displayLink(link)}</p>
            <div className="flex flex-wrap gap-2 justify-center">
              <button type="button" className="btn-secondary" disabled={!qr.png} onClick={() => download(qr.png, `qr_${base}.png`)}><Download size={15} aria-hidden="true" /> PNG</button>
              <button type="button" className="btn-secondary" disabled={!qr.svg} onClick={downloadSvg}><Download size={15} aria-hidden="true" /> SVG (impression)</button>
            </div>
          </div>
        )}

        {tab === 'poster' && (
          <div className="space-y-3">
            <div>
              <label htmlFor={`${uid}-pt`} className="block text-xs font-medium text-dim mb-1">Titre de l’affiche</label>
              <input id={`${uid}-pt`} className="input" value={posterTitle} maxLength={90} onChange={e => setPosterTitle(e.target.value)} />
            </div>
            <div>
              <label htmlFor={`${uid}-ps`} className="block text-xs font-medium text-dim mb-1">Accroche (facultatif)</label>
              <textarea id={`${uid}-ps`} rows={2} className="input" value={posterText} maxLength={160} onChange={e => setPosterText(e.target.value)} />
            </div>
            <p className="text-xs text-dim">A4 portrait : bandeau {orgName ? `« ${orgName} »` : 'de l’association'}, titre, grand QR code vectoriel (net à l’impression), lien lisible.</p>
            <button type="button" className="btn-primary" onClick={poster} disabled={busy}>{busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <FileText size={15} aria-hidden="true" />} Télécharger l’affiche (PDF)</button>
          </div>
        )}

        {tab === 'embed' && (
          embed?.allowed ? (
            <div className="space-y-2">
              <label htmlFor={`${uid}-emb`} className="block text-xs font-medium text-dim">Code à coller dans ton site (iframe + ajustement automatique de la hauteur)</label>
              <textarea id={`${uid}-emb`} readOnly rows={8} className="input font-mono text-[11px]" value={snippet} onFocus={e => e.target.select()} />
              <button type="button" className="btn-secondary" onClick={() => copyToClipboard(snippet, 'Code d’intégration')}><ClipboardCopy size={15} aria-hidden="true" /> Copier le code</button>
              <p className="text-[11px] text-muted flex gap-1.5"><ShieldCheck size={12} className="shrink-0 mt-0.5" aria-hidden="true" />
                {origins.length ? `Affichage autorisé uniquement sur : ${origins.join(', ')} (contrôle fait par le formulaire ; un autre site voit un message et un lien).` : 'Aucune restriction : tout site en HTTPS peut afficher ce formulaire.'}
              </p>
            </div>
          ) : (
            <p className="text-sm text-dim">L’intégration dans un autre site est désactivée pour ce formulaire (Réglages › Intégration).</p>
          )
        )}
      </div>
    </div>
  );
}
