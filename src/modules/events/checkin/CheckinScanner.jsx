// ============================================================
// QR DE PRÉSENCE — scanner plein écran
// ============================================================
// Caméra arrière (getUserMedia) → décodage (BarcodeDetector ou jsQR) →
// « présent » immédiat dans le store local (retour visuel, sonore,
// vibration). Anti double scan : un même code relu dans les 3 s est
// ignoré, un participant déjà pointé est signalé avec l'heure du premier
// pointage. Saisie manuelle par nom en secours ; lecture d'une photo de
// billet si la caméra est indisponible. Hors ligne : le pointage est
// enregistré sur l'appareil puis envoyé par la synchronisation.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Camera, CameraOff, CheckCircle2, CloudOff, ImageUp, Search, Undo2, Volume2, VolumeX, X, XCircle,
} from 'lucide-react';
import { useEventsStore } from '../store.js';
import { useBackendState } from '../../../backend/state.js';
import { checkinCounts, evaluateScan, searchParticipants } from './logic.js';
import { markPresent, undoPresent } from './actions.js';
import { createDecoder, decodeImageFile } from './decoder.js';
import { primeAudio, signal } from './feedback.js';

const SAME_CODE_MS = 3000;
const FLASH_MS = 2400;
const SCAN_EVERY_MS = 160;

const hhmm = (iso) => (iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '');

function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}

function cameraError(err) {
  const name = err?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Accès à la caméra refusé. Autorise la caméra pour ce site (icône à gauche de l’adresse), puis rouvre le scanner. Sinon, utilise la recherche par nom.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'Aucune caméra disponible sur cet appareil : utilise la recherche par nom ou la lecture d’une photo.';
  if (name === 'NotReadableError') return 'La caméra est utilisée par une autre application.';
  return 'Caméra indisponible (elle nécessite une connexion sécurisée HTTPS).';
}

export default function CheckinScanner({ eventId, onClose }) {
  const uid = useId();
  const ev = useEventsStore(s => s.events[eventId]);
  const pending = useBackendState(s => s.pending);
  const workspaceId = useBackendState(s => s.workspaceId);
  const online = useOnline();
  const videoRef = useRef(null);
  const closeRef = useRef(null);
  const fileRef = useRef(null);
  const lastCode = useRef({ text: '', t: 0 });
  const handlerRef = useRef(null);
  const [cam, setCam] = useState({ status: 'starting', error: null, kind: null });
  const [flash, setFlash] = useState(null);
  const [recent, setRecent] = useState([]);
  const [sound, setSound] = useState(true);
  const [query, setQuery] = useState('');
  const counts = useMemo(() => checkinCounts(ev), [ev]);
  const matches = useMemo(() => searchParticipants(ev, query), [ev, query]);

  // ── Retour d'un scan / d'une saisie ──
  const report = useCallback((kind, title, detail, extra = {}) => {
    signal(kind === 'ok' ? 'ok' : kind === 'warn' ? 'warn' : 'error', { sound });
    setFlash({ kind, title, detail, id: Date.now(), ...extra });
  }, [sound]);

  const checkIn = useCallback((participantId, via) => {
    const res = markPresent(eventId, participantId);
    const p = useEventsStore.getState().events[eventId]?.participants?.find(x => x.id === participantId);
    if (res.ok) {
      report('ok', p?.name || 'Participant', `Présent·e · ${hhmm(res.at)}${via === 'manual' ? ' (saisie manuelle)' : ''}`, { pid: participantId });
      setRecent(r => [{ pid: participantId, name: p?.name || '', at: res.at, via }, ...r.filter(x => x.pid !== participantId)].slice(0, 6));
    } else if (res.at || p?.status === 'present') {
      report('warn', `${p?.name || 'Participant'} : déjà pointé·e`, res.at ? `Premier passage à ${hhmm(res.at)}` : 'Déjà marqué·e présent·e');
    } else {
      report('error', p?.name || 'Pointage impossible', res.error);
    }
  }, [eventId, report]);

  /** Traite un texte décodé (exposé pour la lecture de photo et les tests). */
  const handleText = useCallback((text) => {
    const now = Date.now();
    if (text === lastCode.current.text && now - lastCode.current.t < SAME_CODE_MS) return 'ignored';
    lastCode.current = { text, t: now };
    const current = useEventsStore.getState().events[eventId];
    const r = evaluateScan(current, text);
    if (r.kind === 'ok') checkIn(r.participant.id, 'scan');
    else if (r.kind === 'already') report('warn', `${r.participant.name} : déjà pointé·e`, r.at ? `Premier passage à ${hhmm(r.at)}` : 'Déjà marqué·e présent·e');
    else if (r.kind === 'waitlist') report('error', r.participant.name, 'Sur liste d’attente : pas de place attribuée.');
    else if (r.kind === 'cancelled') report('error', r.participant.name, 'Inscription annulée.');
    else if (r.kind === 'removed') report('error', 'Billet invalide', 'Ce participant a été retiré de la liste.');
    else if (r.kind === 'unknown') report('error', 'Billet inconnu', 'Billet d’un autre événement, ou billet remplacé par un nouveau.');
    else report('error', 'Code non reconnu', 'Ce QR code n’est pas un billet.');
    return r.kind;
  }, [eventId, checkIn, report]);

  useEffect(() => { handlerRef.current = handleText; }, [handleText]);

  // ── Caméra ──
  useEffect(() => {
    let stopped = false;
    let stream = null;
    let timer = null;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('no media'), { name: 'SecurityError' });
        const decoder = await createDecoder();
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play().catch(() => {});
        setCam({ status: 'on', error: null, kind: decoder.kind });
        const tick = async () => {
          if (stopped) return;
          if (video.readyState >= 2) {
            const text = await decoder.detect(video);
            if (text && !stopped) handlerRef.current?.(text);
          }
          timer = setTimeout(tick, SCAN_EVERY_MS);
        };
        tick();
      } catch (err) {
        if (!stopped) setCam({ status: 'error', error: cameraError(err), kind: null });
      }
    })();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // ── Accessibilité : focus, Échap, défilement bloqué ──
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    primeAudio();
    const prev = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onCloseRef.current?.(); } };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; prev?.focus?.(); };
  }, []);

  useEffect(() => {
    if (!flash) return undefined;
    const t = setTimeout(() => setFlash(null), FLASH_MS);
    return () => clearTimeout(t);
  }, [flash]);

  const onPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await decodeImageFile(file);
      if (!text) { report('error', 'Aucun QR code lu', 'Reprends la photo plus près, bien à plat.'); return; }
      lastCode.current = { text: '', t: 0 }; // une photo est toujours traitée
      handleText(text);
    } catch {
      report('error', 'Image illisible', 'Choisis une photo au format JPEG ou PNG.');
    }
  };

  const undo = (item) => {
    const res = undoPresent(eventId, item.pid);
    if (res.ok) { setRecent(r => r.filter(x => x.pid !== item.pid)); report('warn', `${item.name} : pointage annulé`, 'Repassé·e en « inscrit·e ».'); } else report('error', 'Annulation impossible', res.error);
  };

  if (!ev) return null;
  const tone = flash?.kind === 'ok' ? 'bg-emerald-600' : flash?.kind === 'warn' ? 'bg-amber-500' : 'bg-rose-600';
  const FlashIcon = flash?.kind === 'ok' ? CheckCircle2 : flash?.kind === 'warn' ? AlertTriangle : XCircle;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby={`${uid}-t`} className="fixed inset-0 z-[70] bg-black text-white flex flex-col">
      <header className="flex items-center gap-2 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] bg-black/80">
        <div className="flex-1 min-w-0">
          <h2 id={`${uid}-t`} className="text-sm font-semibold truncate">Pointage — {ev.title}</h2>
          <p className="text-xs text-white/70" aria-live="polite"><strong className="text-white text-base tabular-nums" data-testid="checkin-count">{counts.present}</strong> présent(s) / {counts.expected} inscrit(s)</p>
        </div>
        <button type="button" onClick={() => setSound(s => !s)} className="p-2 rounded-lg hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-pressed={!sound} aria-label={sound ? 'Couper le son' : 'Activer le son'}>
          {sound ? <Volume2 size={20} aria-hidden="true" /> : <VolumeX size={20} aria-hidden="true" />}
        </button>
        <button ref={closeRef} type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label="Fermer le scanner">
          <X size={22} aria-hidden="true" />
        </button>
      </header>

      {(!online || (workspaceId && pending > 0)) && (
        <p className="flex items-center gap-2 text-xs bg-amber-500 text-black px-3 py-1.5" role="status">
          <CloudOff size={14} aria-hidden="true" />
          {!online ? 'Hors ligne : les pointages sont enregistrés sur cet appareil et seront synchronisés au retour du réseau.' : `${pending} modification(s) en attente de synchronisation.`}
        </p>
      )}

      <div className="relative flex-1 min-h-0 bg-black">
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted aria-label="Aperçu de la caméra" />
        {cam.status === 'on' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
            <div className="w-[min(70vw,320px)] aspect-square rounded-3xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
        )}
        {cam.status !== 'on' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            {cam.status === 'starting' ? <Camera size={40} className="animate-pulse" aria-hidden="true" /> : <CameraOff size={40} aria-hidden="true" />}
            <p className="text-sm text-white/90 max-w-sm" role={cam.status === 'error' ? 'alert' : 'status'}>{cam.status === 'starting' ? 'Ouverture de la caméra…' : cam.error}</p>
          </div>
        )}
        {flash && (
          <div key={flash.id} className={`absolute inset-x-3 top-3 ${tone} rounded-2xl p-4 shadow-xl flex items-start gap-3 animate-fade-in`} role="status" aria-live="assertive" data-testid="checkin-flash" data-kind={flash.kind}>
            <FlashIcon size={32} className="shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-lg font-bold leading-tight break-words">{flash.title}</p>
              {flash.detail && <p className="text-sm opacity-90">{flash.detail}</p>}
            </div>
          </div>
        )}
      </div>

      <div className="bg-neutral-950 border-t border-white/10 p-3 space-y-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] max-h-[45dvh] overflow-y-auto">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <label htmlFor={`${uid}-q`} className="sr-only">Rechercher un participant par nom</label>
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50" aria-hidden="true" />
            <input id={`${uid}-q`} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Saisie manuelle : nom ou e-mail…" autoComplete="off"
              className="w-full rounded-xl bg-white/10 border border-white/20 pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-white/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white" />
          </div>
          <button type="button" onClick={() => fileRef.current?.click()} className="shrink-0 rounded-xl bg-white/10 border border-white/20 px-3 text-sm flex items-center gap-1.5 hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white">
            <ImageUp size={16} aria-hidden="true" /> <span className="hidden sm:inline">Photo</span><span className="sr-only sm:hidden">Lire une photo de billet</span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-label="Photo d’un billet" onChange={onPhoto} data-testid="checkin-photo" />
        </div>
        {query.trim() && (
          <ul className="space-y-1" aria-label="Résultats de la recherche">
            {matches.length === 0 && <li className="text-sm text-white/60 px-1">Aucun participant ne correspond.</li>}
            {matches.map(p => (
              <li key={p.id} className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
                <span className="flex-1 min-w-0 text-sm truncate">{p.name}{p.email && <span className="text-white/50"> · {p.email}</span>}</span>
                {p.status === 'present' ? <span className="text-xs text-emerald-300">Présent·e {ev.checkin?.at?.[p.id] ? `(${hhmm(ev.checkin.at[p.id])})` : ''}</span>
                  : p.status === 'waitlist' ? <span className="text-xs text-amber-300">Liste d’attente</span>
                    : <button type="button" onClick={() => { checkIn(p.id, 'manual'); setQuery(''); }} className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-white">Présent</button>}
              </li>
            ))}
          </ul>
        )}
        {recent.length > 0 && !query.trim() && (
          <div>
            <p className="text-[11px] uppercase tracking-wider text-white/50 mb-1">Derniers pointages</p>
            <ul className="space-y-1">
              {recent.map(r => (
                <li key={r.pid} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 size={14} className="text-emerald-400 shrink-0" aria-hidden="true" />
                  <span className="flex-1 truncate">{r.name}</span>
                  <span className="text-xs text-white/50">{hhmm(r.at)}</span>
                  <button type="button" onClick={() => undo(r)} className="p-1.5 rounded-lg hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label={`Annuler le pointage de ${r.name}`}><Undo2 size={14} aria-hidden="true" /></button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {cam.kind && <p className="text-[10px] text-white/40">Décodage : {cam.kind === 'native' ? 'détecteur natif du navigateur' : 'jsQR'}</p>}
      </div>
    </div>
  );
}
