// ============================================================
// STUDIO FORMULAIRES — mode borne (tablette d'accueil)
// ============================================================
// Un formulaire rempli en boucle, plein écran, utilisable HORS LIGNE :
// chaque réponse est d'abord rangée dans la file locale (IndexedDB, fichiers
// compris : kioskQueue.js) puis envoyée au serveur dès que possible.
// Réinitialisation automatique après l'envoi (compte à rebours) et après une
// période d'inactivité. Sortie protégée par un code PIN choisi à l'ouverture.
//
// Props : { definition, slug?, formId?, context?, onExit?(),
//           send?(entry) → Promise (défaut : sendResponse vers le serveur),
//           resetSeconds? (8), idleSeconds? (120) }

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, CloudOff, CloudUpload, Expand, KeyRound, Lock, LogOut, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { flattenItems } from '../engine/index.js';
import FormRenderer from './FormRenderer.jsx';
import Shell, { StateCard } from './Shell.jsx';
import RichText from './RichText.jsx';
import { kioskQueue, usePendingCount } from './kioskQueue.js';
import { sendResponse } from './api.js';
import { getBlob, deleteBlob } from './localStore.js';
import { useOnline } from './hooks.js';

const PIN_RX = /^\d{4,8}$/;

async function hashPin(pin) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`bde-kiosk:${pin}`));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return `plain:${pin}`; // contexte non sécurisé (http) : comparaison directe en mémoire
  }
}

function defaultSend(entry) {
  return sendResponse({
    slug: entry.slug,
    answers: entry.answers,
    files: entry.files.map(f => ({ key: f.key, file: f.blob, name: f.name })),
    params: entry.meta?.params || null,
  });
}

function PinSetup({ title, onDone }) {
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [error, setError] = useState('');
  const submit = async e => {
    e.preventDefault();
    if (!PIN_RX.test(pin)) { setError('Le code doit comporter 4 à 8 chiffres.'); return; }
    if (pin !== pin2) { setError('Les deux codes ne correspondent pas.'); return; }
    // Plein écran demandé tout de suite (geste de l'utilisateur encore actif)
    try { document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })?.catch?.(() => {}); } catch { /* refusé : la borne fonctionne quand même */ }
    onDone(await hashPin(pin));
  };
  return (
    <StateCard icon={KeyRound} title={`Mode borne — ${title || 'formulaire'}`}>
      <p className="fr-muted">Choisis un code PIN : il sera demandé pour quitter le mode borne. Les réponses sont gardées sur cet appareil et envoyées dès que le réseau est disponible.</p>
      <form onSubmit={submit} className="fr-stack-sm" style={{ textAlign: 'left', maxWidth: 360, margin: '0 auto' }} noValidate>
        <label htmlFor="fr-pin1" className="fr-label">Code PIN (4 à 8 chiffres)</label>
        <input id="fr-pin1" className="fr-input" type="password" inputMode="numeric" autoComplete="new-password" maxLength={8} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} />
        <label htmlFor="fr-pin2" className="fr-label">Confirme le code</label>
        <input id="fr-pin2" className="fr-input" type="password" inputMode="numeric" autoComplete="new-password" maxLength={8} value={pin2} onChange={e => setPin2(e.target.value.replace(/\D/g, ''))} aria-describedby={error ? 'fr-pin-err' : undefined} aria-invalid={!!error || undefined} />
        {error && <p id="fr-pin-err" className="fr-error" role="alert">{error}</p>}
        <button type="submit" className="fr-btn fr-btn-primary" style={{ width: '100%' }}>
          <Expand size={18} aria-hidden="true" /> Démarrer la borne (plein écran)
        </button>
      </form>
    </StateCard>
  );
}

function PinPrompt({ pinHash, onCancel, onOk }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [tries, setTries] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const submit = async e => {
    e.preventDefault();
    if (Date.now() < lockedUntil) { setError('Trop d’essais : patiente 30 secondes.'); return; }
    if ((await hashPin(pin)) === pinHash) { onOk(); return; }
    const n = tries + 1;
    setTries(n);
    setPin('');
    if (n >= 5) { setLockedUntil(Date.now() + 30000); setTries(0); setError('Trop d’essais : patiente 30 secondes.'); } else setError('Code incorrect.');
  };
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="fr-pin-title" onKeyDown={e => { if (e.key === 'Escape') onCancel(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgb(0 0 0 / 0.55)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 16 }}>
      <form onSubmit={submit} className="fr-card fr-stack-sm" style={{ width: '100%', maxWidth: 360 }} noValidate>
        <h2 id="fr-pin-title" className="fr-page-title" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Lock size={18} aria-hidden="true" /> Quitter le mode borne</h2>
        <label htmlFor="fr-pin-exit" className="fr-label">Code PIN</label>
        <input ref={inputRef} id="fr-pin-exit" className="fr-input" type="password" inputMode="numeric" autoComplete="off" maxLength={8} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} aria-describedby={error ? 'fr-pin-exit-err' : undefined} aria-invalid={!!error || undefined} />
        {error && <p id="fr-pin-exit-err" className="fr-error" role="alert">{error}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="fr-btn fr-btn-secondary" onClick={onCancel}>Annuler</button>
          <button type="submit" className="fr-btn fr-btn-primary" disabled={!pin}>Déverrouiller</button>
        </div>
      </form>
    </div>
  );
}

export default function KioskMode({ definition, slug: slugProp, formId = null, context, onExit, send = defaultSend, resetSeconds = 8, idleSeconds = 120 }) {
  const slug = slugProp || definition?.slug || '';
  const [pinHash, setPinHash] = useState(null);
  const [round, setRound] = useState(0);
  const [answers, setAnswers] = useState({});
  const [phase, setPhase] = useState('form'); // form | thanks
  const [countdown, setCountdown] = useState(resetSeconds);
  const [askPin, setAskPin] = useState(false);
  const [flushInfo, setFlushInfo] = useState('');
  const [idleNotice, setIdleNotice] = useState(false);
  const online = useOnline();
  const pending = usePendingCount(kioskQueue, slug);
  const lastActivity = useRef(0);
  const answersRef = useRef(answers);
  useEffect(() => { answersRef.current = answers; });
  const sendRef = useRef(send);
  useEffect(() => { sendRef.current = send; });
  const ctx = useMemo(() => context || {}, [context]);

  const reset = useCallback(() => {
    setAnswers({});
    setRound(r => r + 1);
    setPhase('form');
    setCountdown(resetSeconds);
  }, [resetSeconds]);

  const flush = useCallback(async () => {
    if (!navigator.onLine) return;
    const res = await kioskQueue.flush(entry => sendRef.current(entry), { slug });
    if (res.sent) setFlushInfo(`${res.sent} réponse${res.sent > 1 ? 's' : ''} envoyée${res.sent > 1 ? 's' : ''}.`);
    else if (res.failed) setFlushInfo(`${res.failed} réponse${res.failed > 1 ? 's' : ''} refusée${res.failed > 1 ? 's' : ''} par le serveur (gardée${res.failed > 1 ? 's' : ''} sur la borne).`);
  }, [slug]);

  // Envoi périodique + au retour du réseau
  useEffect(() => {
    if (!pinHash) return undefined;
    const kick = () => { flush(); };
    const first = setTimeout(kick, 500);
    const t = setInterval(kick, 30000);
    window.addEventListener('online', kick);
    return () => { clearTimeout(first); clearInterval(t); window.removeEventListener('online', kick); };
  }, [pinHash, flush]);

  // Compte à rebours après envoi
  useEffect(() => {
    if (phase !== 'thanks') return undefined;
    if (countdown <= 0) { const t = setTimeout(reset, 0); return () => clearTimeout(t); }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, countdown, reset]);

  // Inactivité : formulaire commencé puis abandonné → remis à zéro
  useEffect(() => {
    if (!pinHash) return undefined;
    lastActivity.current = Date.now();
    const mark = () => { lastActivity.current = Date.now(); };
    const evs = ['pointerdown', 'keydown', 'touchstart', 'input'];
    evs.forEach(e => window.addEventListener(e, mark, { passive: true }));
    const t = setInterval(() => {
      const started = Object.keys(answersRef.current).length > 0;
      if (started && Date.now() - lastActivity.current > idleSeconds * 1000) {
        lastActivity.current = Date.now();
        setIdleNotice(true);
        reset();
      }
    }, 5000);
    return () => { evs.forEach(e => window.removeEventListener(e, mark)); clearInterval(t); };
  }, [pinHash, idleSeconds, reset]);

  const start = hash => setPinHash(hash);

  const exit = async () => {
    setAskPin(false);
    try { if (document.fullscreenElement) await document.exitFullscreen(); } catch { /* rien */ }
    onExit?.();
  };

  const onSubmit = async cleaned => {
    const raw = answersRef.current;
    const fileKeys = flattenItems(definition).filter(e => e.item.kind === 'question' && e.item.type === 'file' && !e.repeatKey).map(e => e.item.key);
    const files = [];
    const blobIds = [];
    for (const key of fileKeys) {
      for (const ref of (Array.isArray(raw[key]) ? raw[key] : [])) {
        if (!ref?.local) continue;
        const blob = await getBlob(ref.id);
        if (!blob) throw new Error(`Fichier « ${ref.name} » introuvable : ajoute-le de nouveau.`);
        files.push({ key, blob, name: ref.name });
        blobIds.push(ref.id);
      }
    }
    await kioskQueue.add({ slug, formId, kind: definition.kind || 'standard', answers: cleaned, files, meta: { source: 'kiosk', params: ctx.params || null } });
    blobIds.forEach(id => deleteBlob(id)); // copiés dans la file
    setIdleNotice(false);
    setPhase('thanks');
    setCountdown(resetSeconds);
    flush();
  };

  if (!pinHash) {
    return <Shell theme={definition?.theme}><PinSetup title={definition?.title} onDone={start} /></Shell>;
  }

  const conf = definition.settings?.confirmation || {};
  const total = pending.pending + pending.errors;
  const bar = (
    <div className="fr-card" style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 'var(--f-gap)' }}>
      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: '0.85rem' }} className="fr-muted">
        {online ? <Wifi size={16} aria-hidden="true" /> : <WifiOff size={16} aria-hidden="true" />}
        {online ? 'En ligne' : 'Hors ligne'}
      </span>
      <span role="status" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: '0.85rem', fontWeight: total ? 700 : 500 }}>
        {total ? <CloudOff size={16} aria-hidden="true" /> : <CloudUpload size={16} aria-hidden="true" />}
        {total ? `${total} réponse${total > 1 ? 's' : ''} en attente d’envoi` : 'Toutes les réponses sont envoyées'}
        {pending.errors > 0 && ` (dont ${pending.errors} refusée${pending.errors > 1 ? 's' : ''})`}
      </span>
      {flushInfo && <span className="fr-help" style={{ marginTop: 0 }}>{flushInfo}</span>}
      <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
        {total > 0 && online && (
          <button type="button" className="fr-btn fr-btn-ghost" onClick={flush} style={{ minHeight: 40 }}><RefreshCw size={16} aria-hidden="true" /> Envoyer</button>
        )}
        <button type="button" className="fr-iconbtn" aria-label="Quitter le mode borne (code PIN)" onClick={() => setAskPin(true)}><LogOut size={16} aria-hidden="true" /></button>
      </span>
    </div>
  );

  return (
    <>
      {phase === 'thanks' ? (
        <Shell theme={definition.theme}>
          {bar}
          <StateCard icon={CheckCircle2} title={conf.title || 'Merci !'} tone="success">
            <RichText text={conf.message || 'Ta réponse est enregistrée.'} />
            <p className="fr-muted" role="status">Nouveau formulaire dans {countdown} s…</p>
            <button type="button" className="fr-btn fr-btn-primary" onClick={reset}>Nouvelle réponse</button>
          </StateCard>
        </Shell>
      ) : (
        <FormRenderer
          key={round}
          definition={definition}
          answers={answers}
          onAnswersChange={setAnswers}
          mode="kiosk"
          context={ctx}
          onSubmit={onSubmit}
          fullHeight
          topSlot={<>{bar}{idleNotice && <p className="fr-alert fr-alert-info" role="status" style={{ marginBottom: 'var(--f-gap)' }}>Le formulaire précédent, inactif, a été effacé.</p>}</>}
        />
      )}
      {askPin && <PinPrompt pinHash={pinHash} onCancel={() => setAskPin(false)} onOk={exit} />}
    </>
  );
}
