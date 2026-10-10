// ============================================================
// PORTAIL « MON ESPACE » (#/espace) — page publique
// ============================================================
// Connexion par lien e-mail (aucun mot de passe), puis, pour le compte :
//  - mes réponses aux formulaires (statut, dates ; jamais les notes internes),
//    lien de modification quand le formulaire l'autorise ;
//  - mes inscriptions aux événements (fiche membre liée ou même adresse) ;
//  - les documents émis à mon nom (référence + lien de vérification) ;
//  - mes votes : reçus gardés sur cet appareil, vérifiables ;
//  - les formulaires ouverts réservés aux membres.
// Montée hors de la coque de l'application (comme #/f/ et #/verifier).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays, CheckCircle2, ClipboardList, CloudOff, ExternalLink, FileCheck2, FileSearch, Loader2, LogOut,
  Mail, PencilLine, RefreshCw, ShieldCheck, Trash2, UserCircle2, Vote, XCircle,
} from 'lucide-react';
import Shell, { StateCard } from '../runtime/Shell.jsx';
import { verificationUrl } from '../../documents/verification.js';
import * as portal from './api.js';
import { useReceipts, rememberReceipt, forgetReceipt, isFormUuid, isReceiptCode, normalizeReceipt, ballotCheckLink } from '../vote/receipts.js';

const fmtDate = (iso, withTime = false) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('fr-FR', withTime ? { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris' } : { dateStyle: 'long', timeZone: 'Europe/Paris' });
};
const formLink = (slug, query = '') => `${window.location.origin}${window.location.pathname}#/f/${encodeURIComponent(slug)}${query}`;
const errText = (err) => String(err?.message || err || 'Erreur inconnue.');

const PART_LABELS = { registered: 'Inscrit·e', waitlist: 'Liste d’attente', present: 'Présent·e', absent: 'Absent·e', cancelled: 'Annulé' };
const PAYMENT_LABELS = { pending: 'Paiement en attente', paid: 'Payé', manual: 'Réglé hors ligne', failed: 'Paiement échoué', refunded: 'Remboursé' };
const ROLE_LABELS = { owner: 'Propriétaire', bureau: 'Bureau', tresorier: 'Trésorier·e', membre: 'Membre', lecteur: 'Lecteur' };

function Pill({ children, tone = 'neutral' }) {
  const colors = {
    neutral: 'rgb(var(--c-elevated))', success: 'rgba(16,185,129,0.14)', warn: 'rgba(245,158,11,0.16)', danger: 'rgba(244,63,94,0.14)', info: 'rgba(59,130,246,0.14)',
  };
  return <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 600, background: colors[tone] || colors.neutral, border: '1px solid rgb(var(--c-line))' }}>{children}</span>;
}

function Section({ icon: Icon, title, id, children, aside }) {
  return (
    <section className="fr-card fr-stack-sm" aria-labelledby={id}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <h2 id={id} className="fr-page-title" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}><Icon size={20} aria-hidden="true" /> {title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

const rowStyle = { borderTop: '1px solid rgb(var(--c-line))', paddingTop: 10, display: 'grid', gap: 4 };
const listStyle = { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 };

/** Charge une ressource asynchrone (état + rechargement) ; `key` relance le chargement. */
function useLoad(loader, key) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  const [n, setN] = useState(0);
  const loaderRef = useRef(loader);
  useEffect(() => { loaderRef.current = loader; });
  useEffect(() => {
    let alive = true;
    loaderRef.current().then(
      data => { if (alive) setState({ status: 'ready', data, error: null }); },
      err => { if (alive) setState({ status: 'error', data: null, error: errText(err) }); },
    );
    return () => { alive = false; };
  }, [key, n]);
  return [state, () => { setState(s => ({ ...s, status: 'loading' })); setN(x => x + 1); }];
}

function Loading({ label }) {
  return <p className="fr-muted" role="status" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Loader2 size={16} className="animate-spin" aria-hidden="true" /> {label}</p>;
}

// ── Connexion ───────────────────────────────────────────────

function LoginCard() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState({ status: 'idle', error: '' });
  const submit = async (e) => {
    e.preventDefault();
    const v = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { setState({ status: 'idle', error: 'Adresse e-mail invalide.' }); return; }
    setState({ status: 'sending', error: '' });
    try { await portal.sendLoginLink(v); setState({ status: 'sent', error: '' }); } catch (err) { setState({ status: 'idle', error: errText(err) }); }
  };
  return (
    <StateCard icon={UserCircle2} title="Mon espace">
      <p className="fr-muted">Retrouve tes réponses aux formulaires, tes inscriptions, tes documents et tes reçus de vote. Connexion par lien e-mail : aucun mot de passe.</p>
      {state.status === 'sent' ? (
        <p className="fr-alert fr-alert-success" role="status" style={{ textAlign: 'left' }}>
          Lien envoyé à <strong>{email.trim()}</strong>. Ouvre-le <strong>sur cet appareil</strong> : tu reviendras ici, connecté·e.
        </p>
      ) : (
        <form onSubmit={submit} className="fr-stack-sm" style={{ textAlign: 'left', maxWidth: 420, margin: '0 auto' }} noValidate>
          <label htmlFor="portal-email" className="fr-label">Ton adresse e-mail</label>
          <input id="portal-email" type="email" className="fr-input" autoComplete="email" inputMode="email" value={email}
            onChange={e => setEmail(e.target.value)} aria-invalid={!!state.error || undefined} aria-describedby={state.error ? 'portal-email-err' : undefined} />
          {state.error && <p id="portal-email-err" className="fr-error" role="alert">{state.error}</p>}
          <button type="submit" className="fr-btn fr-btn-primary" style={{ width: '100%' }} disabled={state.status === 'sending'}>
            {state.status === 'sending' ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Mail size={18} aria-hidden="true" />} Recevoir le lien de connexion
          </button>
        </form>
      )}
    </StateCard>
  );
}

// ── Mes réponses ────────────────────────────────────────────

function ResponseRow({ r }) {
  const [edit, setEdit] = useState({ status: 'idle', link: null });
  const findEdit = async () => {
    setEdit({ status: 'busy', link: null });
    const token = await portal.localEditToken(r.slug, r.id).catch(() => null);
    setEdit(token ? { status: 'found', link: formLink(r.slug, `?modifier=${token}`) } : { status: 'missing', link: null });
  };
  const answered = Object.entries(r.answers || {}).filter(([, v]) => v !== null && v !== '' && !(Array.isArray(v) && !v.length));
  return (
    <li style={rowStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <strong>{r.title || r.slug}</strong>
        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Pill tone={/valid|accept/i.test(r.status) ? 'success' : /refus|reject/i.test(r.status) ? 'danger' : 'info'}>{r.status_label || r.status}</Pill>
          {r.waitlisted && <Pill tone="warn">Liste d’attente</Pill>}
          {r.payment_status && <Pill tone={r.payment_status === 'paid' || r.payment_status === 'manual' ? 'success' : 'warn'}>{PAYMENT_LABELS[r.payment_status] || r.payment_status}</Pill>}
        </span>
      </div>
      <p className="fr-help" style={{ margin: 0 }}>
        Envoyée le {fmtDate(r.created_at, true)}{r.updated_at && r.updated_at !== r.created_at ? ` · modifiée le ${fmtDate(r.updated_at, true)}` : ''} · {answered.length} réponse(s)
      </p>
      {r.editable ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {edit.status === 'found'
            ? <a className="fr-btn fr-btn-secondary" href={edit.link}><PencilLine size={16} aria-hidden="true" /> Modifier ma réponse</a>
            : <button type="button" className="fr-btn fr-btn-secondary" onClick={findEdit} disabled={edit.status === 'busy'}><PencilLine size={16} aria-hidden="true" /> Modifier ma réponse</button>}
          {edit.status === 'missing' && <span className="fr-help">Modification possible avec le lien « Modifier ma réponse » reçu lors de l’envoi (il n’est pas enregistré sur cet appareil). Par sécurité, le serveur ne garde qu’une empreinte de ce lien.</span>}
        </div>
      ) : <p className="fr-help" style={{ margin: 0 }}>Cette réponse n’est plus modifiable (traitée ou formulaire fermé).</p>}
    </li>
  );
}

function ResponsesSection() {
  const [state, reload] = useLoad(() => portal.myResponses(), 'responses');
  const rows = Array.isArray(state.data) ? state.data : [];
  return (
    <Section icon={ClipboardList} title="Mes réponses" id="portal-responses" aside={<button type="button" className="fr-btn fr-btn-ghost" onClick={reload} aria-label="Actualiser mes réponses"><RefreshCw size={16} aria-hidden="true" /></button>}>
      {state.status === 'loading' && <Loading label="Chargement de tes réponses…" />}
      {state.status === 'error' && <p className="fr-alert fr-alert-error">{state.error}</p>}
      {state.status === 'ready' && !rows.length && <p className="fr-muted">Aucune réponse liée à ce compte. Les réponses envoyées sans être connecté·e ne sont pas rattachées à ton compte.</p>}
      {rows.length > 0 && <ul style={listStyle}>{rows.map(r => <ResponseRow key={r.id} r={r} />)}</ul>}
      <p className="fr-help">Seuls le statut et les dates de traitement te sont montrés ; les notes internes de l’équipe ne sont jamais visibles ici.</p>
    </Section>
  );
}

// ── Mes votes ───────────────────────────────────────────────

function ReceiptRow({ r }) {
  const [state, setState] = useState(null);
  const check = async () => {
    setState({ busy: true });
    try { setState({ counted: !!(await portal.verifyBallot(r.formId, r.code)) }); } catch (err) { setState({ error: errText(err) }); }
  };
  return (
    <li style={rowStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <strong>{r.title || 'Vote'}</strong>
        <span className="fr-help">gardé le {fmtDate(r.savedAt)}</span>
      </div>
      <code style={{ fontSize: '0.85rem', wordBreak: 'break-all' }}>{r.code}</code>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="fr-btn fr-btn-secondary" onClick={check} disabled={state?.busy}>
          {state?.busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <FileSearch size={16} aria-hidden="true" />} Vérifier
        </button>
        <a className="fr-link" href={ballotCheckLink(r.formId)}>Page de vérification</a>
        <button type="button" className="fr-btn fr-btn-ghost" onClick={() => forgetReceipt(r.formId, r.code)} aria-label={`Oublier le reçu ${r.code.slice(0, 6)}… sur cet appareil`}><Trash2 size={16} aria-hidden="true" /></button>
      </div>
      <p role="status" className="fr-help" style={{ margin: 0 }}>
        {state?.counted === true && <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', color: 'var(--f-success)' }}><CheckCircle2 size={16} aria-hidden="true" /> Bulletin compté.</span>}
        {state?.counted === false && <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', color: 'var(--f-danger)' }}><XCircle size={16} aria-hidden="true" /> Aucun bulletin avec ce reçu.</span>}
        {state?.error}
      </p>
    </li>
  );
}

function VotesSection() {
  const receipts = useReceipts();
  const [ref, setRef] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const add = (e) => {
    e.preventDefault();
    const m = String(ref).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    const formId = m ? m[0].toLowerCase() : '';
    if (!isFormUuid(formId)) { setError('Colle le lien de vérification du vote (…/#/bulletin/…) ou son identifiant.'); return; }
    if (!isReceiptCode(code)) { setError('Le code de reçu fait 32 caractères (chiffres et lettres de a à f).'); return; }
    rememberReceipt({ formId, code: normalizeReceipt(code), title: 'Vote' });
    setRef(''); setCode(''); setError('');
  };
  return (
    <Section icon={Vote} title="Mes votes" id="portal-votes">
      <p className="fr-muted">Ton vote est secret : le serveur ne sait pas quel reçu t’appartient et ne peut donc pas te les rendre. Tes reçus sont gardés <strong>sur cet appareil</strong> (automatiquement après un vote, ou ajoutés ci-dessous) et restent vérifiables à tout moment.</p>
      {receipts.length ? <ul style={listStyle}>{receipts.map(r => <ReceiptRow key={`${r.formId}:${r.code}`} r={r} />)}</ul> : <p className="fr-help">Aucun reçu sur cet appareil.</p>}
      <details>
        <summary className="fr-link" style={{ cursor: 'pointer' }}>Ajouter un reçu noté ailleurs</summary>
        <form onSubmit={add} className="fr-stack-sm" style={{ marginTop: 10 }} noValidate>
          <label htmlFor="portal-ref" className="fr-label">Lien de vérification du vote ou identifiant</label>
          <input id="portal-ref" className="fr-input" value={ref} onChange={e => setRef(e.target.value)} autoComplete="off" spellCheck={false} />
          <label htmlFor="portal-code" className="fr-label">Code de reçu</label>
          <input id="portal-code" className="fr-input" value={code} onChange={e => setCode(e.target.value)} autoComplete="off" spellCheck={false} style={{ fontFamily: 'ui-monospace, monospace' }} />
          {error && <p className="fr-error" role="alert">{error}</p>}
          <button type="submit" className="fr-btn fr-btn-secondary">Garder ce reçu</button>
        </form>
      </details>
    </Section>
  );
}

// ── Espace(s) du BDE : inscriptions, documents, formulaires ──

function WorkspaceBlock({ ws, user }) {
  const [events] = useLoad(() => portal.myEvents(ws, user), `${ws.id}|${ws.memberId}|${user.email}`);
  const [docs] = useLoad(() => portal.myDocuments(ws), `${ws.id}|${ws.memberId}`);
  const [forms] = useLoad(() => portal.memberForms(ws), ws.id);
  const evRows = events.data || [];
  const docRows = docs.data || [];
  const formRows = forms.data || [];
  return (
    <div className="fr-stack">
      <Section icon={CalendarDays} title="Mes inscriptions" id={`portal-ev-${ws.id}`}>
        {!ws.memberId && <p className="fr-help">Ton compte n’est pas relié à une fiche membre : seules les inscriptions faites avec ton adresse ({user.email}) apparaissent. Demande au bureau de relier ton compte (Équipe & accès).</p>}
        {events.status === 'loading' && <Loading label="Chargement des événements…" />}
        {events.status === 'error' && <p className="fr-alert fr-alert-warn">Inscriptions indisponibles : {events.error}</p>}
        {events.status === 'ready' && !evRows.length && <p className="fr-muted">Aucune inscription trouvée.</p>}
        {evRows.length > 0 && (
          <ul style={listStyle}>
            {evRows.map(ev => (
              <li key={ev.id} style={rowStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <strong>{ev.title}</strong>
                  <span style={{ display: 'flex', gap: 6 }}>
                    <Pill tone={ev.me.status === 'present' || ev.me.status === 'registered' ? 'success' : ev.me.status === 'waitlist' ? 'warn' : 'neutral'}>{PART_LABELS[ev.me.status] || ev.me.status}</Pill>
                    {ev.me.paid && <Pill tone="success">Payé</Pill>}
                    {ev.status === 'cancelled' && <Pill tone="danger">Événement annulé</Pill>}
                  </span>
                </div>
                <p className="fr-help" style={{ margin: 0 }}>{fmtDate(ev.start, true)}{ev.location ? ` · ${ev.location}` : ''}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section icon={FileCheck2} title="Documents émis à mon nom" id={`portal-docs-${ws.id}`}>
        {!ws.memberId && <p className="fr-help">Disponible quand ton compte est relié à ta fiche membre.</p>}
        {ws.memberId && docs.status === 'loading' && <Loading label="Chargement du registre…" />}
        {docs.status === 'error' && <p className="fr-alert fr-alert-warn">Registre indisponible : {docs.error}</p>}
        {ws.memberId && docs.status === 'ready' && !docRows.length && <p className="fr-muted">Aucun document émis à ton nom.</p>}
        {docRows.length > 0 && (
          <ul style={listStyle}>
            {docRows.map(d => (
              <li key={d.ref} style={rowStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <strong>{d.title}</strong><code>{d.ref}</code>
                </div>
                <p className="fr-help" style={{ margin: 0 }}>
                  Émis le {fmtDate(d.createdAt)} · <a className="fr-link" href={verificationUrl(d.ref, d.fingerprint)}>Vérifier l’authenticité</a>
                </p>
              </li>
            ))}
          </ul>
        )}
        <p className="fr-help">Le fichier lui-même t’est remis par le bureau ; la vérification confirme qu’un document portant cette référence et cette empreinte a bien été émis.</p>
      </Section>

      <Section icon={ClipboardList} title="Formulaires ouverts pour les membres" id={`portal-forms-${ws.id}`}>
        {forms.status === 'loading' && <Loading label="Chargement…" />}
        {forms.status === 'error' && <p className="fr-alert fr-alert-warn">Liste indisponible : {forms.error}</p>}
        {forms.status === 'ready' && !formRows.length && <p className="fr-muted">Aucun formulaire réservé aux membres n’est ouvert en ce moment.</p>}
        {formRows.length > 0 && (
          <ul style={listStyle}>
            {formRows.map(f => (
              <li key={f.slug} style={{ ...rowStyle, display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span><strong>{f.title}</strong>{f.kind === 'vote' && <> <Pill tone="info">Vote</Pill></>}{f.closes_at && <span className="fr-help"> · jusqu’au {fmtDate(f.closes_at, true)}</span>}</span>
                <a className="fr-btn fr-btn-secondary" href={formLink(f.slug)}><ExternalLink size={16} aria-hidden="true" /> {f.kind === 'vote' ? 'Voter' : 'Répondre'}</a>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function WorkspacesArea({ user }) {
  const [state] = useLoad(() => portal.myWorkspaces(user), user.id);
  const list = useMemo(() => state.data || [], [state.data]);
  const [picked, setPicked] = useState(null);
  const ws = list.find(w => w.id === picked) || list[0] || null;
  if (state.status === 'loading') return <section className="fr-card"><Loading label="Recherche de ton association…" /></section>;
  if (state.status === 'error') return <section className="fr-card"><p className="fr-alert fr-alert-warn">Espaces indisponibles : {state.error}</p></section>;
  if (!ws) {
    return (
      <section className="fr-card fr-stack-sm">
        <h2 className="fr-page-title" style={{ margin: 0 }}>Inscriptions et documents</h2>
        <p className="fr-muted">Ton compte n’est membre d’aucun espace d’association : seules tes réponses aux formulaires et tes reçus de vote sont disponibles. Si tu fais partie du BDE, demande une invitation au bureau.</p>
      </section>
    );
  }
  return (
    <div className="fr-stack">
      {list.length > 1 && (
        <div className="fr-card fr-stack-sm">
          <label htmlFor="portal-ws" className="fr-label">Association</label>
          <select id="portal-ws" className="fr-input" value={ws.id} onChange={e => setPicked(e.target.value)}>
            {list.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
      )}
      <p className="fr-help" style={{ margin: 0 }}>{ws.name} · rôle : {ROLE_LABELS[ws.role] || ws.role}{ws.memberId ? ' · compte relié à ta fiche membre' : ''}</p>
      <WorkspaceBlock key={ws.id} ws={ws} user={user} />
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────

export default function PortalPage() {
  const configured = useMemo(() => portal.isConfigured(), []);
  const [session, setSession] = useState({ status: configured ? 'loading' : 'local', user: null, error: null });

  const refresh = useCallback(() => {
    portal.getSessionUser().then(
      user => setSession({ status: user ? 'in' : 'out', user, error: null }),
      err => setSession({ status: 'error', user: null, error: errText(err) }),
    );
  }, []);

  useEffect(() => {
    if (!configured) return undefined;
    refresh();
    return portal.onAuthChange(user => setSession({ status: user ? 'in' : 'out', user, error: null }));
  }, [configured, refresh]);

  useEffect(() => { document.title = 'Mon espace — BDE'; }, []);

  const logout = async () => {
    try { await portal.signOut(); } catch { /* hors ligne : session locale effacée */ }
    setSession({ status: 'out', user: null, error: null });
  };

  if (session.status === 'local') {
    return (
      <Shell>
        <StateCard icon={CloudOff} title="Mon espace n’est pas disponible">
          <p className="fr-muted">Cette application fonctionne ici en <strong>mode local</strong> : les données sont enregistrées uniquement sur l’appareil du bureau, il n’existe donc pas de compte personnel à consulter.</p>
          <p className="fr-muted">« Mon espace » nécessite l’<strong>espace connecté</strong> de l’association (serveur configuré dans Équipe & accès). Demande au bureau le lien de l’espace en ligne.</p>
        </StateCard>
      </Shell>
    );
  }
  if (session.status === 'loading') return <Shell><section className="fr-card"><Loading label="Ouverture de ton espace…" /></section></Shell>;
  if (session.status === 'error') {
    return <Shell><StateCard icon={XCircle} title="Connexion impossible" tone="error"><p className="fr-muted">{session.error}</p><button type="button" className="fr-btn fr-btn-primary" onClick={refresh}><RefreshCw size={16} aria-hidden="true" /> Réessayer</button></StateCard></Shell>;
  }
  if (session.status === 'out') return <Shell><LoginCard /></Shell>;

  const { user } = session;
  return (
    <Shell wide>
      <div className="fr-stack">
        <header className="fr-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 className="fr-title" style={{ fontSize: '1.5rem', margin: 0, display: 'flex', gap: 8, alignItems: 'center' }}><UserCircle2 size={26} aria-hidden="true" /> Mon espace</h1>
            <p className="fr-muted" style={{ margin: '4px 0 0' }}>Connecté·e : <strong>{user.email}</strong></p>
          </div>
          <button type="button" className="fr-btn fr-btn-secondary" onClick={logout}><LogOut size={16} aria-hidden="true" /> Se déconnecter</button>
        </header>
        <ResponsesSection />
        <WorkspacesArea user={user} />
        <VotesSection />
        <p className="fr-help" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><ShieldCheck size={14} aria-hidden="true" /> Cette page n’affiche que tes propres données ; elle n’enregistre rien sur le serveur.</p>
      </div>
    </Shell>
  );
}

