import { useEffect, useState } from 'react';
import { Timer } from 'lucide-react';
import { useAutoLockClock } from './autoLock';

function format(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/** Petit indicateur discret du temps restant avant le verrouillage automatique. */
export default function AutoLockIndicator() {
  const deadline = useAutoLockClock(s => s.deadline);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (deadline === null) return null;
  const remaining = deadline - now;
  const soon = remaining <= 60_000;

  return (
    <p
      className={`text-[11px] flex items-center gap-1 ${soon ? 'text-amber-500' : 'text-dim'}`}
      title="Toute activité (souris, clavier) repousse le verrouillage. Masquer l'onglet plus d'1 min verrouille aussi le coffre."
    >
      <Timer size={11} aria-hidden="true" />
      <span>Verrouillage auto dans {format(remaining)}</span>
    </p>
  );
}
