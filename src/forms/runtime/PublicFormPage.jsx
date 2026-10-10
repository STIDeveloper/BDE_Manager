// ============================================================
// STUDIO FORMULAIRES — page publique d'un formulaire (#/f/<slug>)
// ============================================================
// Montée par App.jsx hors de la coque de l'application. Volontairement
// légère (aucun module lourd de l'app) : moteur de règles + rendu + client
// serveur. Le PDF, le pavé de signature, le glisser-déposer et la connexion
// sont chargés à la demande.
//
// Paramètres d'adresse :
//   ?<param>=…           préremplissage (questions prefillFrom 'url:<param>') et params.* des formules
//   ?modifier=<jeton>    modification d'une réponse (lien reçu à l'envoi ; ?edit= accepté)
//   ?reprise=<jeton>     reprise d'un brouillon enregistré en ligne
//   ?paiement=retour|annule|erreur   retour de HelloAsso

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, CalendarClock, CheckCircle2, ClipboardCopy, CloudOff, CreditCard, Download, FileSearch,
  Lock, LogIn, Loader2, PencilLine, RefreshCw, RotateCcw, ShieldCheck, Users, WifiOff,
} from 'lucide-react';
import { useRoute } from '../../core/router.js';
import { toast } from '../../components/ui/toastStore.js';
import { summarizeAnswers, flattenItems, formatMoneyFr, isEmpty } from '../engine/index.js';
import FormRenderer from './FormRenderer.jsx';
import { EmbedHeightReporter, EmbedBlocked } from '../share/embed.jsx';
import { checkEmbed } from '../share/embedRuntime.js';
import { rememberReceipt } from '../vote/receipts.js';
import Shell, { StateCard } from './Shell.jsx';
import RichText from './RichText.jsx';
import Turnstile from './Turnstile.jsx';
import { useOnline } from './hooks.js';
import {
  BACKEND_MISSING, checkBallot, errorMessage, fetchPublicForm, hasApi, isNetworkError, loadResponseByToken,
  loadServerDraft, makeDraftToken, paymentUrlFor, saveServerDraft, sendResponse, sendVote,
} from './api.js';
import { kvDelete, kvGet, kvSet, getBlob, deleteBlob } from './localStore.js';
import { outboxQueue, usePendingCount } from './kioskQueue.js';

const engineMods = import.meta.glob('../../backend/engine.js');
const RESERVED_PARAMS = new Set(['modifier', 'edit', 'reprise', 'paiement']);
const TURNSTILE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';
const FLUSH_EVENT = 'bde-forms-outbox-flush';
const RETRY_DELAYS = [1000, 2000, 4000, 8000, 15000, 30000];

const fmtDate = iso => {
  try { return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(new Date(iso)); } catch { return String(iso); }
};
const fmtTime = d => new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(d);

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } finally { ta.remove(); }
  }
  toast.success('Lien copié', 'Colle-le où tu veux pour le retrouver.');
}

function pageLink(slug, query = {}) {
  const q = new URLSearchParams(query).toString();
  return `${window.location.origin}${window.location.pathname}#/f/${encodeURIComponent(slug)}${q ? `?${q}` : ''}`;
}

/** Fichiers à joindre à l'envoi : références locales des questions « fichier » (niveau racine). */
async function collectFiles(definition, answers) {
  const keys = flattenItems(definition).filter(e => e.item.kind === 'question' && e.item.type === 'file' && !e.repeatKey).map(e => e.item.key);
  const files = [];
  const missing = [];
  for (const key of keys) {
    const list = Array.isArray(answers[key]) ? answers[key] : [];
    for (const ref of list) {
      if (!ref?.local) continue;
      const blob = await getBlob(ref.id);
      if (blob) files.push({ key, file: blob, name: ref.name });
      else missing.push(ref.name);
    }
  }
  return { files, missing };
}

/** Réponses sans les références de fichiers absentes de cet appareil. */
async function dropMissingFiles(definition, answers) {
  const keys = flattenItems(definition).filter(e => e.item.kind === 'question' && e.item.type === 'file').map(e => e.item.key);
  const out = { ...answers };
  for (const key of keys) {
    if (!Array.isArray(out[key])) continue;
    const kept = [];
    for (const ref of out[key]) if (!ref?.local || await getBlob(ref.id)) kept.push(ref);
    if (kept.length) out[key] = kept; else delete out[key];
  }
  return out;
}

function Skeleton() {
  return (
    <Shell>
      <div role="status" aria-label="Chargement du formulaire" className="fr-stack">
        <div className="fr-card fr-stack-sm">
          <div className="fr-skeleton" style={{ height: 28, width: '60%' }} />
          <div className="fr-skeleton" style={{ height: 14, width: '90%' }} />
          <div className="fr-skeleton" style={{ height: 14, width: '75%' }} />
        </div>
        <div className="fr-card fr-stack">
          {[0, 1, 2].map(i => (
            <div key={i} className="fr-stack-sm">
              <div className="fr-skeleton" style={{ height: 16, width: '40%' }} />
              <div className="fr-skeleton" style={{ height: 46 }} />
            </div>
          ))}
        </div>
        <span className="sr-only">Chargement du formulaire…</span>
      </div>
    </Shell>
  );
}

// ── Connexion requise ───────────────────────────────────────

function AuthGate({ title, theme, reason }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState({ status: 'idle', error: '' });
  const loader = Object.values(engineMods)[0];
  const send = async e => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setState({ status: 'idle', error: 'Adresse e-mail invalide.' }); return; }
    setState({ status: 'sending', error: '' });
    try {
      const m = await loader();
      try { localStorage.setItem('bde-forms-return', window.location.hash); } catch { /* rien */ }
      await m.sendMagicLink(email.trim());
      setState({ status: 'sent', error: '' });
    } catch (err) {
      setState({ status: 'idle', error: errorMessage(err) });
    }
  };
  return (
    <Shell theme={theme}>
      <StateCard icon={Lock} title={title || 'Connexion requise'}>
        <p className="fr-muted">
          {reason === 'forbidden'
            ? 'Ce formulaire est réservé à certaines personnes et ton compte n’y a pas accès. Connecte-toi avec l’adresse qui a reçu l’invitation.'
            : 'Ce formulaire demande de t’identifier : tu recevras un lien de connexion par e-mail (aucun mot de passe).'}
        </p>
        {!loader && <p className="fr-alert fr-alert-warn">La connexion n’est pas disponible sur cette version : contacte l’organisateur du formulaire.</p>}
        {loader && state.status !== 'sent' && (
          <form onSubmit={send} className="fr-stack-sm" style={{ textAlign: 'left', maxWidth: 420, margin: '0 auto' }} noValidate>
            <label htmlFor="fr-auth-email" className="fr-label">Ton adresse e-mail</label>
            <input id="fr-auth-email" type="email" className="fr-input" autoComplete="email" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} aria-invalid={!!state.error || undefined} aria-describedby={state.error ? 'fr-auth-err' : undefined} />
            {state.error && <p id="fr-auth-err" className="fr-error" role="alert">{state.error}</p>}
            <button type="submit" className="fr-btn fr-btn-primary" style={{ width: '100%' }} disabled={state.status === 'sending'}>
              {state.status === 'sending' ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <LogIn size={18} aria-hidden="true" />}
              Recevoir le lien de connexion
            </button>
          </form>
        )}
        {state.status === 'sent' && (
          <div className="fr-alert fr-alert-success" role="status" style={{ textAlign: 'left' }}>
            Lien envoyé à <strong>{email}</strong>. Ouvre-le sur cet appareil, puis reviens sur ce formulaire :
            <div style={{ marginTop: 8 }}>
              <button type="button" className="fr-btn fr-btn-secondary" onClick={() => copyText(window.location.href)}>
                <ClipboardCopy size={16} aria-hidden="true" /> Copier le lien du formulaire
              </button>
            </div>
          </div>
        )}
      </StateCard>
    </Shell>
  );
}

// ── Écran de confirmation ───────────────────────────────────

function VerifyReceipt({ formId, initial }) {
  const [code, setCode] = useState(initial || '');
  const [res, setRes] = useState(null);
  const check = async e => {
    e.preventDefault();
    setRes({ busy: true });
    try { setRes({ ok: await checkBallot(formId, code) }); } catch (err) { setRes({ error: errorMessage(err) }); }
  };
  return (
    <form onSubmit={check} className="fr-stack-sm" style={{ textAlign: 'left' }}>
      <label htmlFor="fr-receipt" className="fr-label" style={{ fontSize: '0.9rem' }}>Vérifier qu’un bulletin a été compté</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input id="fr-receipt" className="fr-input" value={code} onChange={e => setCode(e.target.value)} spellCheck={false} autoComplete="off" />
        <button type="submit" className="fr-btn fr-btn-secondary" disabled={!code.trim() || res?.busy}><FileSearch size={16} aria-hidden="true" /> Vérifier</button>
      </div>
      <p role="status" className="fr-help">
        {res?.ok === true && 'Ce bulletin a bien été compté.'}
        {res?.ok === false && 'Aucun bulletin compté avec ce code.'}
        {res?.error}
      </p>
    </form>
  );
}

function Confirmation({ data, result, definition, submitted, onRestart }) {
  const settings = definition.settings || {};
  const conf = settings.confirmation || {};
  const slug = data.form.slug;
  const [busy, setBusy] = useState('');
  const [countdown, setCountdown] = useState(() => (safeRedirect(conf.redirectUrl) && !result.queued ? 6 : null));
  const summary = useMemo(() => (settings.showSummary ? summarizeAnswers(definition, submitted, { context: { params: data.params } }) : []), [settings.showSummary, definition, submitted, data.params]);
  const canEdit = result.editToken && settings.allowEdit && settings.allowEdit !== 'never';
  const editLink = canEdit ? pageLink(slug, { modifier: result.editToken }) : null;
  const redirect = safeRedirect(conf.redirectUrl);

  // Vote : le reçu est conservé sur l'appareil (carnet de reçus du portail).
  useEffect(() => {
    if (data.form.kind === 'vote' && result.receiptCode && data.form.id) {
      rememberReceipt({ formId: data.form.id, code: result.receiptCode, slug, title: data.form.title });
    }
  }, [data.form, result.receiptCode, slug]);

  useEffect(() => {
    if (countdown === null) return undefined;
    if (countdown <= 0) { window.location.assign(redirect); return undefined; }
    const t = setTimeout(() => setCountdown(c => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown, redirect]);

  const pay = async () => {
    setBusy('pay');
    try {
      const url = result.paymentUrl || await paymentUrlFor(result.responseId, result.editToken);
      window.location.assign(url);
    } catch (err) {
      toast.error('Paiement indisponible', errorMessage(err));
      setBusy('');
    }
  };
  const pdf = async () => {
    setBusy('pdf');
    try {
      const { downloadSummaryPdf } = await import('./summaryPdf.js');
      await downloadSummaryPdf(definition, submitted, { context: { params: data.params }, responseId: result.responseId, waitlisted: result.waitlisted, receiptCode: result.receiptCode });
    } catch (err) {
      toast.error('PDF impossible', err?.message || 'Réessaie.');
    } finally { setBusy(''); }
  };

  const title = result.queued ? 'Réponse enregistrée sur cet appareil' : (conf.title || (data.form.kind === 'vote' ? 'Vote enregistré' : 'Merci !'));
  return (
    <div className="fr-stack">
      <StateCard icon={result.queued ? CloudOff : CheckCircle2} title={title} tone={result.queued ? 'neutral' : 'success'}>
        <div role="status" className="fr-stack-sm" style={{ textAlign: 'left' }}>
          {result.queued ? (
            <p>Le réseau est indisponible. Ta réponse est gardée sur cet appareil et sera envoyée <strong>automatiquement</strong> dès le retour de la connexion — laisse cette page ouverte ou reviens plus tard sur ce lien.</p>
          ) : (
            <>
              {(conf.message || result.message) && <RichText text={conf.message || result.message} />}
              {!conf.message && !result.message && <p>Ta réponse a bien été envoyée.</p>}
              {result.updated && <p className="fr-alert fr-alert-info">Ta réponse a été mise à jour.</p>}
              {result.waitlisted && <p className="fr-alert fr-alert-warn">Le formulaire est complet : ta réponse est placée sur <strong>liste d’attente</strong>. Tu seras prévenu·e si une place se libère.</p>}
              {result.score !== null && result.score !== undefined && <p className="fr-alert fr-alert-info">Score : <strong>{result.score}{result.maxScore ? ` / ${result.maxScore}` : ''}</strong></p>}
              {result.uploadErrors?.length > 0 && <p className="fr-alert fr-alert-error">Certains fichiers n’ont pas pu être transmis : {result.uploadErrors.join(', ')}. Contacte l’organisateur.</p>}
            </>
          )}
        </div>

        {result.receiptCode && (
          <div className="fr-alert fr-alert-info" style={{ textAlign: 'left' }}>
            <p style={{ fontWeight: 700 }}>Ton code de reçu</p>
            <p style={{ fontFamily: 'ui-monospace, monospace', fontSize: '1.1rem', wordBreak: 'break-all', margin: '6px 0' }}>{result.receiptCode}</p>
            <p className="fr-help">Garde-le : il permet de vérifier que ton bulletin a été compté, sans révéler ton vote.</p>
            <button type="button" className="fr-btn fr-btn-secondary" onClick={() => copyText(result.receiptCode)}><ClipboardCopy size={16} aria-hidden="true" /> Copier le code</button>
          </div>
        )}

        {result.paymentRequired && !result.queued && (
          <div className="fr-alert fr-alert-info" style={{ textAlign: 'left' }}>
            <p style={{ fontWeight: 700 }}>Paiement à effectuer{result.paymentAmountCents ? ` : ${formatMoneyFr(result.paymentAmountCents / 100)}` : ''}</p>
            <p className="fr-help">Tu vas être redirigé·e vers HelloAsso (paiement sécurisé).</p>
            <button type="button" className="fr-btn fr-btn-primary" style={{ marginTop: 8 }} onClick={pay} disabled={busy === 'pay'}>
              {busy === 'pay' ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <CreditCard size={18} aria-hidden="true" />} Payer maintenant
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          {(settings.showSummary || settings.pdfReceipt) && (
            <button type="button" className="fr-btn fr-btn-secondary" onClick={pdf} disabled={busy === 'pdf'}>
              {busy === 'pdf' ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />} Télécharger le récapitulatif (PDF)
            </button>
          )}
          {editLink && (
            <button type="button" className="fr-btn fr-btn-secondary" onClick={() => copyText(editLink)}>
              <PencilLine size={16} aria-hidden="true" /> Copier le lien « Modifier ma réponse »
            </button>
          )}
          {!settings.onePerPerson && data.form.kind !== 'vote' && (
            <button type="button" className="fr-btn fr-btn-ghost" onClick={onRestart}><RotateCcw size={16} aria-hidden="true" /> Répondre à nouveau</button>
          )}
        </div>
        {editLink && <p className="fr-help">Garde ce lien : il permet de modifier ta réponse{settings.allowEdit === 'until_review' ? ' tant qu’elle n’a pas été traitée' : ' tant que le formulaire est ouvert'}.</p>}

        {countdown !== null && (
          <p className="fr-help" role="status">
            Redirection dans {countdown} s… <a href={redirect} className="fr-link">Continuer</a> ·{' '}
            <button type="button" className="fr-link" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit' }} onClick={() => setCountdown(null)}>Rester ici</button>
          </p>
        )}
        {data.form.kind === 'vote' && data.form.id && <VerifyReceipt formId={data.form.id} initial={result.receiptCode} />}
      </StateCard>

      {summary.length > 0 && (
        <section className="fr-card" aria-labelledby="fr-sum-title">
          <h2 id="fr-sum-title" className="fr-page-title">Récapitulatif</h2>
          <dl style={{ margin: '12px 0 0', display: 'grid', gap: 10 }}>
            {summary.map(r => (
              <div key={r.key} style={{ borderBottom: '1px solid rgb(var(--c-line))', paddingBottom: 8 }}>
                <dt className="fr-muted" style={{ fontSize: '0.85rem' }}>{r.label}</dt>
                <dd style={{ margin: '2px 0 0', fontWeight: 500, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{r.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  );
}

function safeRedirect(url) {
  if (typeof url !== 'string' || !url.trim()) return null;
  try { const u = new URL(url.trim()); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null; } catch { return null; }
}

// ── Session de réponse ──────────────────────────────────────

function FormSession({ data, initial, onRestart }) {
  const { form, definition, stats } = data;
  const settings = definition.settings || {};
  const slug = form.slug;
  const [answers, setAnswers] = useState(initial.answers);
  const [result, setResult] = useState(null);
  const [submitted, setSubmitted] = useState(null);
  const [draftInfo, setDraftInfo] = useState(initial.restored ? { restored: initial.restored, at: initial.restoredAt } : null);
  const [savedAt, setSavedAt] = useState(null);
  const [serverSaved, setServerSaved] = useState(null);
  const [draftToken, setDraftToken] = useState(initial.draftToken || null);
  const [honeypot, setHoneypot] = useState('');
  // Brouillon seulement après une vraie saisie (pas pour les seuls préremplissages)
  const [dirty, setDirty] = useState(!!initial.restored);
  const [turnstileToken, setTurnstileToken] = useState(null);
  const turnstileRef = useRef(null);
  const online = useOnline();
  const pending = usePendingCount(outboxQueue, slug);
  const [lastSub, setLastSub] = useState(null);
  useEffect(() => {
    if (!initial.paymentReturn || initial.paymentReturn === 'retour') return;
    let alive = true;
    kvGet(`last:${slug}`).then(v => { if (alive && v?.responseId) setLastSub(v); });
    return () => { alive = false; };
  }, [initial.paymentReturn, slug]);
  const editing = !!initial.editToken;
  const useTurnstile = !!settings.antiSpam?.turnstile && !!TURNSTILE_KEY && form.kind !== 'vote';
  const serverDraft = !!settings.saveDraft && !editing && hasApi('saveDraft');
  const context = useMemo(() => ({ params: data.params, stats }), [data.params, stats]);
  const answersRef = useRef(answers);
  useEffect(() => { answersRef.current = answers; });
  useEffect(() => {
    const prev = document.title;
    document.title = form.title || definition.title || 'Formulaire';
    return () => { document.title = prev; };
  }, [form.title, definition.title]);

  // Brouillon local (toujours) et en ligne (si autorisé), avec temporisation
  useEffect(() => {
    if (result || editing || !dirty) return undefined;
    const t = setTimeout(() => {
      const empty = !Object.values(answers).some(v => !isEmpty(v));
      if (empty) { kvDelete(`draft:${slug}`); return; }
      kvSet(`draft:${slug}`, { answers, savedAt: Date.now(), draftToken, version: data.version }).then(() => setSavedAt(new Date()));
    }, 700);
    return () => clearTimeout(t);
  }, [answers, result, editing, slug, draftToken, data.version, dirty]);

  useEffect(() => {
    if (!serverDraft || result || !online || !dirty) return undefined;
    const empty = !Object.values(answers).some(v => !isEmpty(v));
    if (empty) return undefined;
    const t = setTimeout(async () => {
      const token = draftToken || makeDraftToken();
      try {
        await saveServerDraft(slug, token, answers);
        if (!draftToken) setDraftToken(token);
        setServerSaved(new Date());
      } catch { /* hors ligne ou refus : le brouillon local suffit */ }
    }, 4000);
    return () => clearTimeout(t);
  }, [answers, serverDraft, result, online, slug, draftToken, dirty]);

  // Envois différés : renvoyés au retour du réseau
  const flush = useCallback(() => {
    if (!navigator.onLine) return;
    outboxQueue.flush(async entry => {
      let token = null;
      if (useTurnstile) {
        token = turnstileRef.current?.getToken?.() || null;
        if (!token) throw Object.assign(new Error('Vérification anti-robot en attente.'), { code: 'network' });
      }
      const res = await sendResponse({
        slug: entry.slug, answers: entry.answers, files: entry.files.map(f => ({ key: f.key, file: f.blob, name: f.name })),
        turnstileToken: token, draftToken: entry.meta?.draftToken || null, editToken: entry.meta?.editToken || null, honeypot: '', params: entry.meta?.params || null,
      });
      if (useTurnstile) turnstileRef.current?.reset();
      return res;
    }, { slug, onSent: (entry, res) => {
      (entry.meta?.blobIds || []).forEach(id => deleteBlob(id));
      setResult(r => (r?.queued && r.queueId === entry.id ? { ...res, queued: false } : r));
      toast.success('Réponse envoyée', 'La réponse gardée hors ligne a bien été transmise.');
    } });
  }, [slug, useTurnstile]);

  useEffect(() => {
    flush();
    window.addEventListener('online', flush);
    window.addEventListener(FLUSH_EVENT, flush);
    return () => { window.removeEventListener('online', flush); window.removeEventListener(FLUSH_EVENT, flush); };
  }, [flush]);

  const finish = async (res, cleaned, blobIds) => {
    setSubmitted(cleaned);
    setResult(res);
    await kvDelete(`draft:${slug}`);
    if (!res.queued) {
      blobIds.forEach(id => deleteBlob(id));
      if (res.responseId) kvSet(`last:${slug}`, { responseId: res.responseId, editToken: res.editToken || null, at: Date.now() });
    }
    window.scrollTo?.({ top: 0 });
  };

  const onSubmit = async cleaned => {
    if (form.kind === 'vote') {
      if (!form.id) throw new Error('Formulaire de vote invalide.');
      const receipt = await sendVote(form.id, cleaned);
      await finish({ responseId: null, receiptCode: receipt, waitlisted: false }, cleaned, []);
      return;
    }
    if (useTurnstile && !turnstileToken) throw new Error('Vérification anti-robot en cours : patiente une seconde puis renvoie.');
    const raw = answersRef.current;
    const { files, missing } = await collectFiles(definition, raw);
    if (missing.length) throw new Error(`Fichier introuvable sur cet appareil : ${missing.join(', ')}. Ajoute-le de nouveau.`);
    const blobIds = files.length ? flattenItems(definition).filter(e => e.item.type === 'file').flatMap(e => (Array.isArray(raw[e.item.key]) ? raw[e.item.key] : []).filter(r => r?.local).map(r => r.id)) : [];
    const payload = { slug, answers: cleaned, files, turnstileToken, draftToken, editToken: initial.editToken || null, honeypot, params: data.params };
    const queue = async () => {
      const entry = await outboxQueue.add({ slug, formId: form.id, answers: cleaned, files: files.map(f => ({ key: f.key, blob: f.file, name: f.name })), meta: { draftToken, editToken: initial.editToken || null, params: data.params, blobIds } });
      await finish({ queued: true, queueId: entry.id }, cleaned, blobIds);
    };
    if (!navigator.onLine) { await queue(); return; }
    try {
      const res = await sendResponse(payload);
      await finish(res, cleaned, blobIds);
    } catch (err) {
      if (useTurnstile) turnstileRef.current?.reset();
      if (isNetworkError(err)) { await queue(); return; }
      const e = new Error(errorMessage(err));
      e.fields = err?.fields || null;
      throw e;
    }
  };

  const restart = () => onRestart();

  if (result) {
    return (
      <Shell theme={definition.theme}>
        <Confirmation data={data} result={result} definition={definition} submitted={submitted} onRestart={restart} />
      </Shell>
    );
  }

  const resumeLink = draftToken && serverDraft ? pageLink(slug, { reprise: draftToken }) : null;
  const full = stats?.full || (Number.isInteger(settings.maxResponses) && Number(stats?.total) >= settings.maxResponses);

  const slot = (
    <>
      <div className="fr-hp" aria-hidden="true">
        <label htmlFor="fr-hp-field">Ne pas remplir ce champ</label>
        <input id="fr-hp-field" name="honeypot" type="text" tabIndex={-1} autoComplete="off" value={honeypot} onChange={e => setHoneypot(e.target.value)} />
      </div>
      {useTurnstile && <Turnstile ref={turnstileRef} siteKey={TURNSTILE_KEY} onToken={setTurnstileToken} />}
      {!online && (
        <p className="fr-alert fr-alert-warn" role="status" style={{ display: 'flex', gap: 8 }}>
          <WifiOff size={18} aria-hidden="true" style={{ flex: 'none' }} />
          Tu es hors ligne : ta réponse sera gardée sur cet appareil et envoyée automatiquement au retour du réseau.
        </p>
      )}
    </>
  );

  const notices = [
    editing && { tone: 'info', icon: PencilLine, text: 'Tu modifies une réponse déjà envoyée. Valide pour enregistrer les changements.' },
    initial.paymentReturn && { ...paymentNotice(initial.paymentReturn), action: lastSub ? { label: 'Relancer le paiement', onClick: () => paymentUrlFor(lastSub.responseId, lastSub.editToken).then(u => window.location.assign(u), err => toast.error('Paiement indisponible', errorMessage(err))) } : null },
    full && settings.waitlist && !editing && { tone: 'warn', icon: Users, text: 'Le formulaire est complet : ta réponse sera placée sur liste d’attente.' },
    draftInfo && { tone: 'info', icon: RotateCcw, text: `Brouillon ${draftInfo.restored === 'server' ? 'en ligne' : 'de cet appareil'} repris${draftInfo.at ? ` (enregistré le ${fmtDate(draftInfo.at)})` : ''}.`, action: { label: 'Recommencer à zéro', onClick: async () => { await kvDelete(`draft:${slug}`); setAnswers({}); setDraftInfo(null); } } },
    pending.pending + pending.errors > 0 && { tone: 'warn', icon: CloudOff, text: `${pending.pending + pending.errors} réponse(s) en attente d’envoi sur cet appareil${pending.errors ? ` (dont ${pending.errors} refusée(s) par le serveur)` : ''}.`, action: online ? { label: 'Envoyer maintenant', onClick: () => window.dispatchEvent(new Event(FLUSH_EVENT)) } : null },
  ].filter(Boolean);

  const markDirty = e => { if (!dirty && e.target?.closest?.('[data-field-key]')) setDirty(true); };
  return (
    <div onChangeCapture={markDirty} onInputCapture={markDirty} onClickCapture={markDirty}>
    <FormRenderer
      definition={definition}
      answers={answers}
      onAnswersChange={setAnswers}
      mode="live"
      context={context}
      onSubmit={onSubmit}
      submitLabel={editing ? 'Enregistrer les modifications' : undefined}
      submitSlot={slot}
      fullHeight
      topSlot={<Notices items={notices} />}
      bottomSlot={<DraftBar savedAt={savedAt} serverSaved={serverSaved} resumeLink={resumeLink} editing={editing} />}
    />
    </div>
  );
}

function paymentNotice(state) {
  if (state === 'retour') return { tone: 'success', icon: CheckCircle2, text: 'Merci, ton paiement a été transmis. Sa confirmation peut prendre quelques minutes.' };
  if (state === 'annule') return { tone: 'warn', icon: AlertTriangle, text: 'Paiement annulé : ta réponse est enregistrée mais reste à régler. Relance le paiement ou utilise le lien reçu par e-mail.' };
  return { tone: 'error', icon: AlertTriangle, text: 'Le paiement a échoué. Ta réponse est enregistrée : réessaie le paiement ou contacte l’organisateur.' };
}

function Notices({ items }) {
  if (!items.length) return null;
  return (
    <div className="fr-stack-sm" style={{ marginBottom: 'var(--f-gap)' }}>
      {items.map((n, i) => {
        const Icon = n.icon;
        return (
          <div key={i} className={`fr-alert fr-alert-${n.tone}`} role="status" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {Icon && <Icon size={18} aria-hidden="true" style={{ flex: 'none' }} />}
            <span style={{ flex: 1, minWidth: 200 }}>{n.text}</span>
            {n.action && <button type="button" className="fr-btn fr-btn-secondary" onClick={n.action.onClick}>{n.action.label}</button>}
          </div>
        );
      })}
    </div>
  );
}

function DraftBar({ savedAt, serverSaved, resumeLink, editing }) {
  if (editing || (!savedAt && !resumeLink)) return null;
  return (
    <div className="fr-help" role="status" style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', marginTop: 16 }}>
      <span>
        {serverSaved ? `Brouillon enregistré en ligne à ${fmtTime(serverSaved)}` : savedAt ? `Brouillon enregistré sur cet appareil à ${fmtTime(savedAt)}` : ''}
      </span>
      {resumeLink && (
        <button type="button" className="fr-btn fr-btn-ghost" onClick={() => copyText(resumeLink)}>
          <ClipboardCopy size={16} aria-hidden="true" /> Copier le lien de reprise
        </button>
      )}
    </div>
  );
}

// ── Chargement ──────────────────────────────────────────────

function useFormLoader(slug, query) {
  const [state, setState] = useState({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const editToken = query.get('modifier') || query.get('edit') || null;
  const resumeToken = query.get('reprise') || null;
  const paymentReturn = query.get('paiement');
  useEffect(() => {
    let alive = true;
    let timer = null;
    let settled = false;
    const run = async (n) => {
      try {
        if (!hasApi('getPublicForm')) { setState({ status: 'error', error: BACKEND_MISSING, fatal: true }); return; }
        const data = await fetchPublicForm(slug);
        if (!alive) return;
        if (!data.available) { setState({ status: 'unavailable', reason: data.reason, title: data.title }); return; }
        const params = {};
        for (const [k, v] of query.entries()) if (!RESERVED_PARAMS.has(k) && !(k in params)) params[k] = v.slice(0, 500);
        const full = { ...data, params };
        const initial = { answers: {}, restored: null, draftToken: null, editToken: null, paymentReturn: ['retour', 'annule', 'erreur'].includes(paymentReturn) ? paymentReturn : null };
        if (editToken) {
          const resp = await loadResponseByToken(editToken).catch(err => { throw err; });
          if (!alive) return;
          if (!resp) { setState({ status: 'unavailable', reason: 'edit_not_found', title: data.form.title }); return; }
          if (!resp.editable) { setState({ status: 'unavailable', reason: 'edit_locked', title: data.form.title, data: full, response: resp }); return; }
          initial.answers = resp.answers;
          initial.editToken = editToken;
        } else if (resumeToken) {
          const d = await loadServerDraft(slug, resumeToken).catch(() => null);
          if (d) {
            initial.answers = await dropMissingFiles(data.definition, d.answers);
            initial.restored = 'server';
            initial.restoredAt = d.updatedAt;
            initial.draftToken = resumeToken;
          }
        } else {
          const local = await kvGet(`draft:${slug}`);
          if (local?.answers && Object.keys(local.answers).length) {
            initial.answers = await dropMissingFiles(data.definition, local.answers);
            initial.restored = 'local';
            initial.restoredAt = local.savedAt ? new Date(local.savedAt).toISOString() : null;
            initial.draftToken = local.draftToken || null;
          }
        }
        settled = true;
        if (alive) setState({ status: 'ready', data: full, initial });
      } catch (err) {
        if (!alive) return;
        if (isNetworkError(err) && n < RETRY_DELAYS.length) {
          setState({ status: 'retrying', error: errorMessage(err), next: RETRY_DELAYS[n] });
          timer = setTimeout(() => run(n + 1), RETRY_DELAYS[n]);
          return;
        }
        setState({ status: 'error', error: errorMessage(err), network: isNetworkError(err), fatal: err?.code === 'missing' || err?.code === 'local' });
      }
    };
    run(0);
    const onOnline = () => { if (settled) return; clearTimeout(timer); run(0); };
    window.addEventListener('online', onOnline);
    return () => { alive = false; clearTimeout(timer); window.removeEventListener('online', onOnline); };
  }, [slug, attempt]); // eslint-disable-line react-hooks/exhaustive-deps
  return [state, () => setAttempt(a => a + 1)];
}

function openState(data) {
  const { form, definition } = data;
  const s = definition.settings || {};
  const now = Date.now();
  const opensAt = form.opensAt || s.opensAt;
  const closesAt = form.closesAt || s.closesAt;
  if (opensAt && new Date(opensAt).getTime() > now) return { state: 'not_yet', at: opensAt };
  if (form.status === 'closed' || form.status === 'archived' || (closesAt && new Date(closesAt).getTime() <= now)) return { state: 'closed', at: closesAt };
  if (form.open === false) return { state: 'closed', at: closesAt };
  const stats = data.stats || {};
  const full = stats.full || (Number.isInteger(s.maxResponses) && Number(stats.total) >= s.maxResponses);
  if (full && !s.waitlist) return { state: 'full' };
  return { state: 'open' };
}

function FormPageInner({ slug, query, onReload }) {
  const [state, retry] = useFormLoader(slug, query);
  const [round, setRound] = useState(0);

  if (state.status === 'loading') return <Skeleton />;
  if (state.status === 'retrying') {
    return (
      <Shell>
        <StateCard icon={WifiOff} title="Connexion difficile">
          <p className="fr-muted" role="status">{state.error} Nouvel essai automatique dans {Math.round(state.next / 1000)} s…</p>
          <button type="button" className="fr-btn fr-btn-secondary" onClick={retry}><RefreshCw size={16} aria-hidden="true" /> Réessayer maintenant</button>
        </StateCard>
      </Shell>
    );
  }
  if (state.status === 'error') {
    return (
      <Shell>
        <StateCard icon={state.network ? WifiOff : AlertTriangle} title={state.network ? 'Pas de connexion' : 'Formulaire indisponible'} tone="error">
          <p className="fr-muted">{state.error}</p>
          {!state.fatal && <button type="button" className="fr-btn fr-btn-primary" onClick={retry}><RefreshCw size={16} aria-hidden="true" /> Réessayer</button>}
        </StateCard>
      </Shell>
    );
  }
  if (state.status === 'unavailable') {
    if (state.reason === 'auth_required' || state.reason === 'forbidden') return <AuthGate title={state.title} reason={state.reason} />;
    if (state.reason === 'edit_not_found') {
      return <Shell><StateCard icon={FileSearch} title="Lien de modification invalide"><p className="fr-muted">Ce lien de modification n’existe pas ou a expiré.</p><a className="fr-btn fr-btn-secondary" href={`#/f/${encodeURIComponent(slug)}`}>Ouvrir le formulaire</a></StateCard></Shell>;
    }
    if (state.reason === 'edit_locked') {
      const sum = summarizeAnswers(state.data.definition, state.response.answers, { context: { params: state.data.params } });
      return (
        <Shell theme={state.data.definition.theme}>
          <div className="fr-stack">
            <StateCard icon={Lock} title="Réponse non modifiable"><p className="fr-muted">Cette réponse a déjà été traitée ou le formulaire est fermé : elle ne peut plus être modifiée.</p></StateCard>
            {sum.length > 0 && (
              <section className="fr-card"><h2 className="fr-page-title">Ta réponse</h2>
                <dl style={{ display: 'grid', gap: 8, marginTop: 10 }}>{sum.map(r => <div key={r.key}><dt className="fr-muted" style={{ fontSize: '0.85rem' }}>{r.label}</dt><dd style={{ margin: 0 }}>{r.value}</dd></div>)}</dl>
              </section>
            )}
          </div>
        </Shell>
      );
    }
    return (
      <Shell>
        <StateCard icon={FileSearch} title="Formulaire introuvable">
          <p className="fr-muted">Ce lien ne correspond à aucun formulaire publié. Vérifie l’adresse ou demande un nouveau lien à l’organisateur.</p>
        </StateCard>
      </Shell>
    );
  }

  const { data, initial } = state;
  const { definition, form, viewer } = data;
  const s = definition.settings || {};
  // Intégration (iframe) : refusée si le site parent n'est pas autorisé dans les réglages.
  const emb = checkEmbed(s.embed);
  if (emb.embedded && !emb.allowed) return <EmbedBlocked reason={emb.reason} slug={form.slug} theme={definition.theme} />;
  const editing = !!initial.editToken;
  const os = openState(data);
  if (!editing && os.state === 'not_yet') {
    return <Shell theme={definition.theme}><StateCard icon={CalendarClock} title={form.title || 'Bientôt ouvert'}><p className="fr-muted">Ce formulaire ouvrira le <strong>{fmtDate(os.at)}</strong>. Reviens à ce moment-là !</p><button type="button" className="fr-btn fr-btn-secondary" onClick={onReload}><RefreshCw size={16} aria-hidden="true" /> Actualiser</button></StateCard></Shell>;
  }
  if (!editing && os.state === 'closed') {
    return <Shell theme={definition.theme}><StateCard icon={Lock} title={form.title || 'Formulaire fermé'}><p className="fr-muted">Ce formulaire n’accepte plus de réponses{os.at ? ` depuis le ${fmtDate(os.at)}` : ''}.</p>{initial.paymentReturn && <p className="fr-alert fr-alert-info">{paymentNotice(initial.paymentReturn).text}</p>}</StateCard></Shell>;
  }
  if (!editing && os.state === 'full') {
    return <Shell theme={definition.theme}><StateCard icon={Users} title={form.title || 'Complet'}><p className="fr-muted">Le nombre maximal de réponses est atteint. Merci de ton intérêt !</p></StateCard></Shell>;
  }
  if ((s.identity === 'required' || form.kind === 'vote') && viewer && viewer.authenticated === false) {
    return <AuthGate title={form.title} />;
  }
  if (form.kind === 'vote' && viewer?.already_voted) {
    return <Shell theme={definition.theme}><StateCard icon={ShieldCheck} title="Tu as déjà voté" tone="success"><p className="fr-muted">Ton vote a été enregistré. Tu peux vérifier qu’il a été compté avec ton code de reçu.</p>{form.id && <VerifyReceipt formId={form.id} />}</StateCard></Shell>;
  }
  if (form.kind === 'vote' && viewer?.eligible === false) {
    return <Shell theme={definition.theme}><StateCard icon={Lock} title="Vote réservé"><p className="fr-muted">Ton compte ne figure pas sur la liste électorale de ce vote.</p></StateCard></Shell>;
  }
  return (
    <FormSession
      key={round}
      data={data}
      initial={round === 0 ? initial : { answers: {}, restored: null, draftToken: null, editToken: null }}
      onRestart={() => setRound(r => r + 1)}
    />
  );
}

export default function PublicFormPage() {
  const route = useRoute();
  const slug = (route.rest[0] || '').trim().toLowerCase();
  const queryString = route.query.toString();
  const query = useMemo(() => new URLSearchParams(queryString), [queryString]);
  const [reload, setReload] = useState(0);
  if (!slug) {
    return <Shell><StateCard icon={FileSearch} title="Lien incomplet"><p className="fr-muted">L’adresse doit être de la forme …/#/f/nom-du-formulaire.</p></StateCard></Shell>;
  }
  return (
    <>
      <EmbedHeightReporter slug={slug} />
      <FormPageInner key={`${slug}|${queryString}|${reload}`} slug={slug} query={query} onReload={() => setReload(r => r + 1)} />
    </>
  );
}
