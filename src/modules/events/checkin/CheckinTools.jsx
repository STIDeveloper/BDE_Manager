// QR DE PRÉSENCE — boutons d'accès (onglet Participants d'un événement).
import { lazy, Suspense, useState } from 'react';
import { ScanLine, Ticket } from 'lucide-react';

const TicketsPanel = lazy(() => import('./TicketsPanel.jsx'));
const CheckinScanner = lazy(() => import('./CheckinScanner.jsx'));

export default function CheckinTools({ ev, canWrite }) {
  const [open, setOpen] = useState(null); // 'tickets' | 'scan'
  const hasParticipants = (ev.participants || []).some(p => ['registered', 'present', 'absent'].includes(p.status));
  return (
    <>
      <button type="button" className="btn-secondary" onClick={() => setOpen('tickets')} disabled={!hasParticipants}>
        <Ticket size={14} aria-hidden="true" /> Billets QR
      </button>
      {canWrite && (
        <button type="button" className="btn-secondary" onClick={() => setOpen('scan')} disabled={!hasParticipants}>
          <ScanLine size={14} aria-hidden="true" /> Scanner
        </button>
      )}
      <Suspense fallback={null}>
        {open === 'tickets' && <TicketsPanel eventId={ev.id} canWrite={canWrite} onClose={() => setOpen(null)} />}
        {open === 'scan' && <CheckinScanner eventId={ev.id} onClose={() => setOpen(null)} />}
      </Suspense>
    </>
  );
}
