// ============================================================
// QR DE PRÉSENCE — page publique du billet (#/billet?t=<jeton>)
// ============================================================
// Ouverte depuis le lien reçu par e-mail : affiche le QR code du billet à
// présenter à l'entrée. Aucune donnée n'est chargée : le QR est calculé à
// partir de l'adresse (fonctionne hors ligne une fois la page ouverte).
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Ticket, TicketX } from 'lucide-react';
import { useRoute } from '../../../core/router.js';
import Shell, { StateCard } from '../../../forms/runtime/Shell.jsx';
import { TOKEN_RX, ticketLink } from './logic.js';

/** Page publique. `token` (facultatif) remplace le jeton lu dans l'adresse. */
export default function TicketPage({ token: forced }) {
  const route = useRoute();
  const token = String(forced || route.query.get('t') || '').toLowerCase();
  const valid = TOKEN_RX.test(token);
  const [src, setSrc] = useState(null);

  useEffect(() => {
    if (!valid) return undefined;
    let alive = true;
    QRCode.toDataURL(ticketLink(token), { margin: 2, width: 600, errorCorrectionLevel: 'M' }).then(u => { if (alive) setSrc(u); }).catch(() => {});
    document.title = 'Mon billet';
    return () => { alive = false; };
  }, [token, valid]);

  if (!valid) {
    return <Shell><StateCard icon={TicketX} title="Billet invalide"><p className="fr-muted">Ce lien de billet est incomplet. Ouvre le lien exact reçu par e-mail, ou demande un nouveau billet à l’organisation.</p></StateCard></Shell>;
  }
  return (
    <Shell>
      <StateCard icon={Ticket} title="Mon billet">
        <p className="fr-muted">Présente ce QR code à l’entrée. Monte la luminosité de ton écran.</p>
        <div style={{ display: 'grid', placeItems: 'center' }}>
          {src ? <img src={src} alt="QR code de ton billet" style={{ width: 'min(80vw, 320px)', height: 'auto', background: '#fff', padding: 8, borderRadius: 16 }} />
            : <div role="status" style={{ width: 280, height: 280 }} className="fr-skeleton" aria-label="Génération du QR code" />}
        </div>
        <p className="fr-help" style={{ fontFamily: 'ui-monospace, monospace' }}>Billet n° {token.slice(0, 8).toUpperCase()}</p>
        <p className="fr-help">Ce billet est personnel : ne le partage pas. Une capture d’écran fonctionne aussi.</p>
      </StateCard>
    </Shell>
  );
}
