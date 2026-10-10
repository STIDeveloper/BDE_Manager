// Partage d'un formulaire : lien court, QR code, code d'intégration <iframe>.
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Download, Settings2 } from 'lucide-react';
import SharePanel from '../../forms/share/SharePanel.jsx';
import Modal from '../../components/Modal.jsx';
import { navigate } from '../../core/router.js';
import { toast } from '../../components/ui/toastStore.js';
import { Segmented } from './ui.jsx';
import { copyText, embedCode } from './utils.js';
import { publicLink } from './integrations.js';

export default function ShareModal({ def, mode = 'link', onClose }) {
  const [tab, setTab] = useState(mode);
  const [qr, setQr] = useState({ url: null, error: null });
  const link = publicLink(def.slug);
  const embedAllowed = !!def.settings?.embed?.allowed;

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(link, { margin: 1, width: 512, errorCorrectionLevel: 'M' })
      .then(url => { if (alive) setQr({ url, error: null }); })
      .catch(() => { if (alive) setQr({ url: null, error: 'Génération du QR code impossible.' }); });
    return () => { alive = false; };
  }, [link]);

  const copy = async (text, what) => {
    if (await copyText(text)) toast.success(`${what} copié`);
    else toast.error('Copie impossible', 'Sélectionne le texte manuellement.');
  };
  const downloadQr = () => {
    if (!qr.url) return;
    const a = document.createElement('a');
    a.href = qr.url;
    a.download = `qr-${def.slug}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <Modal isOpen onClose={onClose} title="Partager le formulaire" description={def.title} maxWidth="max-w-lg">
      <div className="space-y-4">
        <Segmented label="Mode de partage" value={tab} onChange={setTab} options={[
          { value: 'link', label: 'Lien' }, { value: 'qr', label: 'QR code' }, { value: 'embed', label: 'Intégration' },
          { value: 'kit', label: 'Affiche & kit' },
        ]} />
        {tab === 'kit' && (
          <SharePanel slug={def.slug} title={def.title} description={def.description} published={!!def.publishedVersion} embed={def.settings?.embed} />
        )}
        {!def.publishedVersion && (
          <p className="text-xs rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200 p-2.5">
            Ce formulaire n'est pas encore publié : le lien ne fonctionnera qu'après sa publication.
          </p>
        )}
        {tab === 'link' && (
          <div className="space-y-2">
            <label htmlFor="share-link" className="text-xs font-medium text-dim">Lien court</label>
            <div className="flex gap-2">
              <input id="share-link" readOnly className="input font-mono text-xs" value={link} onFocus={e => e.target.select()} />
              <button type="button" className="btn-secondary shrink-0" onClick={() => copy(link, 'Lien')}><Copy size={15} aria-hidden="true" /> Copier</button>
            </div>
          </div>
        )}
        {tab === 'qr' && (
          <div className="flex flex-col items-center gap-3">
            {qr.url ? <img src={qr.url} alt={`QR code du lien ${link}`} className="w-56 h-56 rounded-xl border border-line bg-white p-2" /> : (
              <div className="w-56 h-56 rounded-xl border border-line flex items-center justify-center text-sm text-dim">{qr.error || 'Génération…'}</div>
            )}
            <p className="text-xs text-muted font-mono break-all text-center">{link}</p>
            <button type="button" className="btn-secondary" onClick={downloadQr} disabled={!qr.url}><Download size={15} aria-hidden="true" /> Télécharger (PNG)</button>
          </div>
        )}
        {tab === 'embed' && (
          embedAllowed ? (
            <div className="space-y-2">
              <label htmlFor="share-embed" className="text-xs font-medium text-dim">Code à coller dans ton site</label>
              <textarea id="share-embed" readOnly rows={4} className="input font-mono text-xs" value={embedCode(def)} onFocus={e => e.target.select()} />
              {def.settings.embed.origins?.length ? (
                <p className="text-[11px] text-muted">Sites autorisés : {def.settings.embed.origins.join(', ')}</p>
              ) : <p className="text-[11px] text-muted">Aucune restriction d'origine : tout site peut intégrer ce formulaire.</p>}
              <button type="button" className="btn-secondary" onClick={() => copy(embedCode(def), 'Code d\'intégration')}><Copy size={15} aria-hidden="true" /> Copier le code</button>
            </div>
          ) : (
            <div className="text-sm text-dim space-y-3">
              <p>L'intégration dans un autre site est désactivée pour ce formulaire.</p>
              <button type="button" className="btn-secondary" onClick={() => { onClose(); navigate('forms', def.id, 'settings'); }}>
                <Settings2 size={15} aria-hidden="true" /> Ouvrir les réglages
              </button>
            </div>
          )
        )}
      </div>
    </Modal>
  );
}
