// ============================================================
// ÉLECTIONS — écran de gestion d'un vote (formulaire kind 'vote')
// ============================================================
// Monté par le Studio Formulaires (voir le rapport d'intégration) :
//   <ElectionManager formId={def.id} />
// Liste électorale → ouverture → participation en direct → clôture →
// résultats (majorité, quorum, égalités, blancs) → procès-verbal (pv-ag)
// émis au registre → lien public de vérification des reçus.
// Le serveur ne fournit que des totaux : aucune liste de votants.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, BarChart3, CheckCircle2, ClipboardCopy, FileText, Gavel, Link2, ListChecks, Loader2, Lock,
  Play, RefreshCw, ShieldCheck, Trophy, Unlock, UserX, Users, Vote,
} from 'lucide-react';
import { useStore } from '../../store.js';
import { useCan } from '../../core/permissions.js';
import { navigate } from '../../core/router.js';
import { toast } from '../../components/ui/toastStore.js';
import { confirmDialog } from '../../components/ui/confirmStore.js';
import { isPlaceholderMember, isoDate, formatDateLong } from '../../documents/context.js';
import { verificationUrl } from '../../documents/verification.js';
import { useFormsStore, hasUnpublishedChanges } from '../../modules/forms/store.js';
import { resolveSources, useRendererContext } from '../../modules/forms/integrations.js';
import { formatPercent } from '../../documents/templates/governanceMath.js';
import * as api from './api.js';
import { analyzeResults, buildPvValues, participationStatus, MAJORITY_LABELS } from './results.js';
import { mergeEmails, parseEmailList, rollPreview, splitMembersByEmail, MAX_ROLL } from './roll.js';
import { ballotCheckLink } from './receipts.js';
import AnonymityNotice from './AnonymityNotice.jsx';

const POLL_MS = 15000;
const EMPTY_LOG = [];

const card = 'bg-surface border border-line rounded-2xl p-4 space-y-3';

async function copy(text, what) {
  try { await navigator.clipboard.writeText(text); toast.success(`${what} copié`); } catch { toast.error('Copie impossible', 'Sélectionne le texte manuellement.'); }
}

function SectionTitle({ icon: Icon, children, aside }) {
  return (
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <h2 className="text-sm font-semibold text-ink flex items-center gap-2"><Icon size={16} aria-hidden="true" className="text-blue-500" /> {children}</h2>
      {aside}
    </div>
  );
}

function Meter({ value, label, tone = 'bg-blue-500' }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)} className="h-2 w-full rounded-full bg-elevated overflow-hidden">
      <div className={`h-full ${tone} transition-all`} style={{ width: `${v}%` }} />
    </div>
  );
}

// ── Liste électorale ────────────────────────────────────────

function RollSection({ def, vote, members, canWrite, onSave, needsRepublish }) {
  const uid = useId();
  const [mode, setMode] = useState(vote.electoralRoll || 'members');
  const [text, setText] = useState(() => (vote.list || []).join('\n'));
  const parsed = useMemo(() => parseEmailList(text), [text]);
  const preview = useMemo(() => rollPreview(parsed.emails, members), [parsed.emails, members]);
  const split = useMemo(() => splitMembersByEmail(members), [members]);
  const savedList = useMemo(() => mergeEmails(vote.list || []), [vote.list]);
  const dirty = mode !== (vote.electoralRoll || 'members') || (mode === 'list' && parsed.emails.join('\n') !== savedList.join('\n'));

  const addAllMembers = () => {
    const merged = mergeEmails(parsed.emails, split.withEmail.map(m => m.email));
    setText(merged.join('\n'));
    toast.info('Membres ajoutés', `${split.withEmail.length} adresse(s) de membres du BDE (doublons ignorés).`);
  };

  const save = () => {
    if (mode === 'list' && !parsed.emails.length) { toast.warn('Liste vide', 'Ajoute au moins une adresse e-mail.'); return; }
    if (preview.tooLong) { toast.error('Liste trop longue', `${MAX_ROLL} adresses maximum.`); return; }
    onSave({ electoralRoll: mode, list: mode === 'list' ? parsed.emails : (vote.list || []) });
  };

  return (
    <section className={card} aria-labelledby={`${uid}-t`}>
      <SectionTitle icon={Users}><span id={`${uid}-t`}>Liste électorale</span></SectionTitle>
      <div className="flex rounded-lg border border-line overflow-hidden w-fit" role="radiogroup" aria-label="Type de liste électorale">
        {[['members', 'Membres de l’espace'], ['list', 'Liste d’adresses e-mail']].map(([v, l], i) => (
          <button key={v} type="button" role="radio" aria-checked={mode === v} disabled={!canWrite} onClick={() => setMode(v)}
            className={`px-3 py-2 text-sm ${i ? 'border-l border-line' : ''} ${mode === v ? 'bg-blue-500/10 text-blue-600 dark:text-blue-300 font-medium' : 'text-dim hover:text-ink'}`}>{l}</button>
        ))}
      </div>

      {mode === 'members' ? (
        <div className="text-sm text-dim space-y-2">
          <p>Électeurs : <strong className="text-ink">tous les comptes membres de l’espace connecté</strong> (« Équipe & accès »). La liste est recalculée par le serveur à chaque publication ; un membre ajouté ensuite est inscrit au moment où il vote.</p>
          <p className="text-xs">Chacun vote en se connectant par lien e-mail avec l’adresse de son compte.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <label htmlFor={`${uid}-list`} className="text-xs font-medium text-dim">Adresses des électeurs (une par ligne, ou séparées par des virgules)</label>
            {canWrite && <button type="button" className="btn-secondary text-xs" onClick={addAllMembers} disabled={!split.withEmail.length}><Users size={14} aria-hidden="true" /> Ajouter les {split.withEmail.length} membres du BDE ayant un e-mail</button>}
          </div>
          <textarea id={`${uid}-list`} rows={7} className="input font-mono text-xs" value={text} readOnly={!canWrite}
            onChange={(e) => setText(e.target.value)} placeholder={'lea.martin@exemple.fr\nNom Prénom <adresse@exemple.fr>'} aria-describedby={`${uid}-sum`} />
          <p id={`${uid}-sum`} className="text-xs text-dim" aria-live="polite">
            <strong className="text-ink">{parsed.emails.length}</strong> électeur(s) valide(s)
            {parsed.duplicates ? ` · ${parsed.duplicates} doublon(s) ignoré(s)` : ''}
            {parsed.invalid.length ? ` · ${parsed.invalid.length} entrée(s) invalide(s) : ${parsed.invalid.slice(0, 5).join(', ')}${parsed.invalid.length > 5 ? '…' : ''}` : ''}
            {` · ${preview.membersListed.length} membre(s) du BDE, ${preview.externals.length} adresse(s) externe(s)`}
          </p>
          {preview.membersNotListed.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-dim">{preview.membersNotListed.length} membre(s) du BDE ayant un e-mail ne sont pas sur la liste</summary>
              <p className="mt-1 text-muted">{preview.membersNotListed.map(m => m.name).join(', ')}</p>
            </details>
          )}
        </div>
      )}

      {split.withoutEmail.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-200">
          <p className="font-medium flex items-center gap-1.5"><UserX size={14} aria-hidden="true" /> {split.withoutEmail.length} membre(s) du BDE sans adresse e-mail : ils ne peuvent pas voter en ligne tant qu’une adresse n’est pas renseignée.</p>
          <p className="mt-1">{split.withoutEmail.map(m => m.name).join(', ')}</p>
        </div>
      )}

      {canWrite && (
        <div className="flex flex-wrap gap-2 items-center">
          <button type="button" className="btn-primary" onClick={save} disabled={!dirty}><ListChecks size={15} aria-hidden="true" /> Enregistrer la liste</button>
          {!dirty && <span className="text-xs text-muted">{needsRepublish ? 'Liste enregistrée dans le brouillon — republie pour l’appliquer au vote en ligne.' : def.publishedVersion ? 'Liste en vigueur dans le vote en ligne.' : 'Liste enregistrée dans le brouillon (appliquée à la publication).'}</span>}
        </div>
      )}
      <p className="text-[11px] text-muted">Le serveur ne conserve que des empreintes de la liste, propres à ce vote ; les adresses ne sont jamais montrées aux votants.</p>
    </section>
  );
}

// ── Participation ───────────────────────────────────────────

function ParticipationSection({ data, quorumPercent, loading, error, onRefresh, at, live }) {
  const st = data ? participationStatus(data, quorumPercent) : null;
  return (
    <section className={card} aria-labelledby="el-part">
      <SectionTitle icon={BarChart3} aside={(
        <button type="button" className="btn-ghost text-xs" onClick={onRefresh} disabled={loading} aria-label="Actualiser la participation">
          {loading ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={14} aria-hidden="true" />} Actualiser
        </button>
      )}><span id="el-part">Participation{live ? ' en direct' : ''}</span></SectionTitle>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      {!st && !error && <p className="text-sm text-dim">{loading ? 'Chargement…' : 'Publie le vote pour suivre la participation.'}</p>}
      {st && (
        <div className="space-y-2" aria-live="polite">
          <p className="text-2xl font-semibold text-ink tabular-nums">{st.voted} <span className="text-base font-normal text-dim">votant(s) sur {st.electorate} inscrit(s)</span></p>
          <Meter value={st.percent} label={`Participation ${st.percent} %`} tone={st.quorum.reached || st.quorum.noQuorum ? 'bg-emerald-500' : 'bg-blue-500'} />
          <p className="text-sm text-dim">Participation : <strong className="text-ink">{formatPercent(st.percent)}</strong></p>
          {st.quorum.noQuorum ? (
            <p className="text-sm text-dim">Aucun quorum fixé pour ce vote.</p>
          ) : st.quorum.reached ? (
            <p className="text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5"><CheckCircle2 size={15} aria-hidden="true" /> Quorum atteint ({formatPercent(st.quorum.percent)} des inscrits, soit {st.quorum.required} votant(s)).</p>
          ) : (
            <p className="text-sm text-amber-700 dark:text-amber-300 flex items-center gap-1.5"><AlertTriangle size={15} aria-hidden="true" /> Quorum non atteint : encore {st.remainingForQuorum} votant(s) nécessaire(s) ({formatPercent(st.quorum.percent)} des inscrits = {st.quorum.required}).</p>
          )}
          {at && <p className="text-[11px] text-muted">Mis à jour à {at.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}{live ? ` · actualisation automatique toutes les ${POLL_MS / 1000} s` : ''}</p>}
        </div>
      )}
    </section>
  );
}

// ── Résultats ───────────────────────────────────────────────

function OptionBars({ a }) {
  const total = a.kind === 'ranking' ? Math.max(1, ...a.options.map(o => o.points || 0)) : Math.max(1, a.ballots);
  return (
    <ul className="space-y-1.5">
      {a.options.map(o => {
        const score = a.kind === 'ranking' ? (o.points || 0) : o.count;
        const pct = a.kind === 'ranking' ? (score / total) * 100 : (a.expressed ? (o.count / a.expressed) * 100 : 0);
        const lead = (a.winner && a.winner.value === o.value) || (a.tie && a.leaders?.some(l => l.value === o.value));
        return (
          <li key={o.value}>
            <div className="flex justify-between gap-2 text-sm">
              <span className={`text-ink ${lead ? 'font-semibold' : ''}`}>{o.label}{a.winner?.value === o.value && <Trophy size={13} className="inline ml-1 text-amber-500" aria-label="en tête" />}</span>
              <span className="text-dim tabular-nums">{a.kind === 'ranking' ? `${score} pt(s) · ${o.count} fois 1er` : `${o.count} voix · ${formatPercent(Math.round(pct * 100) / 100)}`}</span>
            </div>
            <Meter value={pct} label={`${o.label} : ${a.kind === 'ranking' ? `${score} points` : `${o.count} voix`}`} tone={lead ? 'bg-emerald-500' : 'bg-blue-400'} />
          </li>
        );
      })}
    </ul>
  );
}

function QuestionResult({ a }) {
  let verdict;
  if (a.kind === 'resolution') {
    verdict = (
      <p className={`text-sm font-medium ${a.adopted ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-300'}`}>
        {a.valid ? a.outcome.sentence : `Quorum non atteint : résolution sans effet (${a.outcome.detail}).`}
      </p>
    );
  } else if (a.kind === 'election') {
    verdict = !a.valid ? <p className="text-sm text-amber-700 dark:text-amber-300">Quorum non atteint : scrutin sans effet.</p>
      : a.tie ? <p className="text-sm font-medium text-amber-700 dark:text-amber-300 flex items-center gap-1.5"><AlertTriangle size={14} aria-hidden="true" /> Égalité entre {a.leaders.map(l => l.label).join(' et ')} ({a.leaders[0].count} voix) : départage à prévoir selon les statuts (second tour, tirage, âge…).</p>
        : a.winner ? <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{a.winner.label} l’emporte avec {a.winner.count} voix sur {a.expressed} suffrage(s) exprimé(s).</p>
          : a.noMajority ? <p className="text-sm text-amber-700 dark:text-amber-300">Personne n’obtient la majorité requise ({a.outcome?.required} voix) : second tour à organiser.</p>
            : <p className="text-sm text-dim">Aucun suffrage exprimé.</p>;
  } else if (a.kind === 'ranking') {
    verdict = a.tie ? <p className="text-sm text-amber-700 dark:text-amber-300">Égalité de points en tête : {a.leaders.map(l => l.label).join(', ')}.</p>
      : <p className="text-sm text-dim">Classement par la méthode de Borda (n points pour une 1re place, n−1 pour une 2e…).</p>;
  } else {
    verdict = <p className="text-sm text-dim">Plusieurs choix possibles : classement par nombre de voix.</p>;
  }
  return (
    <li className="border border-line rounded-xl p-3 space-y-2">
      <p className="text-sm font-semibold text-ink">{a.label}</p>
      {a.kind === 'resolution' ? (
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          {[['Pour', a.for], ['Contre', a.against], ['Abstention', a.abstention], ['Blancs / sans réponse', a.blank]].map(([l, n]) => (
            <div key={l} className="rounded-lg bg-elevated p-2"><dt className="text-[11px] text-dim">{l}</dt><dd className="text-lg font-semibold text-ink tabular-nums">{n}</dd></div>
          ))}
        </dl>
      ) : <OptionBars a={a} />}
      {a.kind !== 'resolution' && <p className="text-xs text-dim">Suffrages exprimés : {a.expressed} · blancs ou sans réponse : {a.blank}</p>}
      {verdict}
    </li>
  );
}

// ── Écran principal ─────────────────────────────────────────

export default function ElectionManager({ formId, onBack }) {
  const uid = useId();
  const def = useFormsStore(s => s.definitions[formId]);
  const publication = useFormsStore(s => s.publications[formId]);
  const updateForm = useFormsStore(s => s.updateForm);
  const recordPublication = useFormsStore(s => s.recordPublication);
  const setStatus = useFormsStore(s => s.setStatus);
  const rawMembers = useStore(s => s.members);
  const documentLog = useStore(s => s.documentLog) || EMPTY_LOG;
  const canWrite = useCan('forms', 'write');
  const canIssue = useCan('documents', 'write');
  const rendererContext = useRendererContext();
  const members = useMemo(() => (rawMembers || []).filter(m => !isPlaceholderMember(m)), [rawMembers]);

  const serverId = publication?.serverFormId || null;
  const vote = useMemo(() => def?.settings?.vote || {}, [def?.settings?.vote]);
  const status = def?.status || 'draft';
  const isOpen = status === 'published' && !(def?.settings?.closesAt && new Date(def.settings.closesAt).getTime() <= Date.now());
  const visibility = vote.resultsVisibility || 'after_close';

  const [busy, setBusy] = useState('');
  const [localNotice, setLocalNotice] = useState(null);
  const [part, setPart] = useState({ data: null, error: null, loading: false, at: null });
  const [res, setRes] = useState({ data: null, error: null, loading: false });
  const [pv, setPv] = useState(() => ({ type: 'ordinaire', date: isoDate(new Date()), lieu: '', heureOuverture: '', heureCloture: '' }));
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const handleError = useCallback((err, title) => {
    if (api.isLocalError(err)) { setLocalNotice(err.message || api.LOCAL_MODE_MESSAGE); return; }
    toast.error(title, api.voteErrorMessage(err));
  }, []);

  // ── Participation (sondage périodique pendant le vote) ──
  const loadParticipation = useCallback(async () => {
    if (!serverId) return;
    setPart(p => ({ ...p, loading: true }));
    try {
      const data = await api.voteParticipation(serverId);
      if (alive.current) setPart({ data, error: null, loading: false, at: new Date() });
    } catch (err) {
      if (!alive.current) return;
      if (api.isLocalError(err)) setLocalNotice(err.message || api.LOCAL_MODE_MESSAGE);
      setPart(p => ({ ...p, loading: false, error: api.voteErrorMessage(err) }));
    }
  }, [serverId]);

  useEffect(() => {
    if (!serverId) return undefined;
    // Premier chargement différé (hors du rendu) puis sondage tant que le vote est ouvert.
    const first = setTimeout(loadParticipation, 0);
    if (!isOpen) return () => clearTimeout(first);
    const t = setInterval(() => { if (document.visibilityState !== 'hidden') loadParticipation(); }, POLL_MS);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [serverId, isOpen, loadParticipation]);

  // ── Résultats ──
  const resultsAvailable = !!serverId && (status === 'closed' || status === 'archived' || visibility !== 'after_close');
  const loadResults = useCallback(async () => {
    if (!serverId) return;
    setRes(r => ({ ...r, loading: true }));
    try {
      const data = await api.voteResults(serverId);
      if (alive.current) setRes({ data, error: null, loading: false });
    } catch (err) {
      if (alive.current) setRes({ data: null, error: api.voteErrorMessage(err), loading: false });
    }
  }, [serverId]);
  useEffect(() => {
    if (!resultsAvailable) return undefined;
    const t = setTimeout(loadResults, 0);
    return () => clearTimeout(t);
  }, [resultsAvailable, status, loadResults]);

  const analysis = useMemo(() => (res.data?.visible ? analyzeResults(res.data, vote) : null), [res.data, vote]);
  const issued = useMemo(() => documentLog.filter(d => d.origin?.module === 'forms' && d.origin?.id === formId && d.templateId === 'pv-ag'), [documentLog, formId]);

  if (!def) {
    return <p className="text-sm text-dim py-10 text-center">Vote introuvable sur cet appareil.</p>;
  }
  if (def.kind !== 'vote') {
    return (
      <div className="max-w-xl mx-auto text-center py-12 space-y-3">
        <Vote size={32} className="mx-auto text-muted" aria-hidden="true" />
        <p className="text-sm text-dim">Ce formulaire n’est pas un vote : choisis le type « Vote / élection » dans ses réglages pour gérer une élection.</p>
      </div>
    );
  }

  // ── Actions ──
  const saveRoll = (patch) => {
    updateForm(def.id, d => ({ ...d, settings: { ...d.settings, vote: { ...(d.settings?.vote || {}), ...patch } } }), { snapshot: 'Liste électorale' });
    toast.success('Liste électorale enregistrée', def.publishedVersion ? 'Republie le vote pour l’appliquer en ligne.' : undefined);
  };

  const publish = async () => {
    const reopening = !!def.publishedVersion;
    if (!(await confirmDialog({
      title: reopening ? 'Republier le vote ?' : 'Publier et ouvrir le vote ?',
      message: reopening
        ? 'Une nouvelle version est publiée : la liste électorale du serveur est recalculée (les personnes ayant déjà voté restent comptées). Les bulletins déjà déposés sont conservés.'
        : 'Le vote devient accessible aux électeurs inscrits par son lien. Vérifie les questions et la liste électorale : après les premiers bulletins, le type du formulaire ne pourra plus changer.',
      confirmLabel: reopening ? 'Republier' : 'Publier et ouvrir', tone: 'primary',
    }))) return;
    setBusy('publish');
    setLocalNotice(null);
    try {
      const out = await api.publishForm(resolveSources({ ...def, status: 'published' }, rendererContext));
      recordPublication(def.id, { version: out?.version ?? (def.publishedVersion || 0) + 1, serverFormId: out?.form_id, slug: out?.slug || def.slug });
      toast.success('Vote publié et ouvert', `Version ${out?.version ?? ''}`);
    } catch (err) { handleError(err, 'Publication impossible'); } finally { setBusy(''); }
  };

  const changeStatus = async (next) => {
    if (!serverId) return;
    const closing = next === 'closed';
    if (!(await confirmDialog(closing ? {
      title: 'Clôturer le vote ?',
      message: `Plus aucun bulletin ne sera accepté.${visibility === 'after_close' ? ' Les résultats deviennent visibles selon le réglage « après la clôture ».' : ''}`,
      confirmLabel: 'Clôturer', tone: 'danger',
    } : {
      title: 'Rouvrir le vote ?',
      message: visibility === 'after_close'
        ? 'Attention : les résultats ont pu être consultés après la clôture. Rouvrir un scrutin dont les résultats sont connus peut en fausser l’issue et doit être justifié (incident technique…).'
        : 'Les électeurs qui n’ont pas encore voté pourront de nouveau voter.',
      confirmLabel: 'Rouvrir', tone: 'warning',
    }))) return;
    setBusy(next);
    try {
      await api.setFormStatus(serverId, next);
      setStatus(def.id, next);
      toast.success(closing ? 'Vote clôturé' : 'Vote rouvert');
      if (closing) loadParticipation();
    } catch (err) { handleError(err, 'Changement de statut impossible'); } finally { setBusy(''); }
  };

  const pvValues = () => {
    if (!analysis) return null;
    const firstPublish = (publication?.versions || []).slice(-1)[0]?.publishedAt || '';
    const values = buildPvValues(analysis, {
      title: def.title, date: pv.date, type: pv.type,
      openedAt: firstPublish,
    });
    // Champs facultatifs vides : on garde les valeurs par défaut du modèle.
    ['lieu', 'heureOuverture', 'heureCloture'].forEach((k) => { if (pv[k]) values[k] = pv[k]; else delete values[k]; });
    return values;
  };

  const issuePv = async (draft) => {
    const values = pvValues();
    if (!values) return;
    if (!draft && !(await confirmDialog({
      title: 'Émettre le procès-verbal ?',
      message: 'Un numéro officiel est attribué et le PV est inscrit au registre des documents (vérifiable par QR code). Relis d’abord l’aperçu : certaines formules types du modèle (feuille d’émargement, signatures) sont prévues pour une AG en présentiel.',
      confirmLabel: 'Émettre', tone: 'primary',
    }))) return;
    setBusy(draft ? 'pv-draft' : 'pv');
    try {
      const { issueDocuments } = await import('../../documents/issue.js');
      const out = await issueDocuments({
        templateId: 'pv-ag', values, format: 'pdf', draft,
        origin: { type: 'module', module: 'forms', id: def.id, label: def.title },
      });
      if (draft) toast.success('Aperçu téléchargé', 'Brouillon non numéroté.');
      else toast.success('Procès-verbal émis', out.refs?.join(', '));
    } catch (err) {
      toast.error('PV impossible', String(err?.message || err));
    } finally { setBusy(''); }
  };

  const verifyLink = serverId ? ballotCheckLink(serverId) : '';
  const publicLink = `${window.location.origin}${window.location.pathname}#/f/${def.slug}`;
  const statusLabel = !def.publishedVersion ? 'Brouillon (non publié)' : isOpen ? 'Vote ouvert' : status === 'published' ? 'Date de clôture dépassée' : 'Vote clôturé';

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <header className="flex flex-wrap items-start gap-3 justify-between">
        <div className="min-w-0">
          {onBack !== null && (
            <button type="button" className="btn-ghost text-xs -ml-2 mb-1" onClick={onBack || (() => navigate('forms', def.id))}>
              <ArrowLeft size={14} aria-hidden="true" /> Retour au formulaire
            </button>
          )}
          <h1 className="text-lg font-semibold text-ink flex items-center gap-2"><Gavel size={18} aria-hidden="true" /> {def.title}</h1>
          <p className="text-sm text-dim">
            <span className={`badge ${isOpen ? 'badge-emerald' : def.publishedVersion ? 'badge-amber' : 'badge-neutral'} mr-2`}>{statusLabel}</span>
            {MAJORITY_LABELS[vote.majority || 'simple']} · quorum {vote.quorumPercent ? `${vote.quorumPercent} %` : 'aucun'} · résultats {visibility === 'after_close' ? 'après la clôture' : visibility === 'live' ? 'en direct' : 'réservés aux administrateurs'}
          </p>
        </div>
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            {(!def.publishedVersion || status === 'draft') && (
              <button type="button" className="btn-primary" onClick={publish} disabled={!!busy}>{busy === 'publish' ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Play size={15} aria-hidden="true" />} Publier et ouvrir</button>
            )}
            {def.publishedVersion > 0 && status === 'published' && (
              <>
                <button type="button" className="btn-secondary" onClick={publish} disabled={!!busy}><RefreshCw size={15} aria-hidden="true" /> Republier</button>
                <button type="button" className="btn-danger" onClick={() => changeStatus('closed')} disabled={!!busy || !serverId}>{busy === 'closed' ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Lock size={15} aria-hidden="true" />} Clôturer le vote</button>
              </>
            )}
            {def.publishedVersion > 0 && status === 'closed' && (
              <button type="button" className="btn-secondary" onClick={() => changeStatus('published')} disabled={!!busy || !serverId}><Unlock size={15} aria-hidden="true" /> Rouvrir</button>
            )}
          </div>
        )}
      </header>

      {localNotice && (
        <p className="text-sm rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200 p-3" role="alert">
          {localNotice} Un vote anonyme ne peut être recueilli que par le serveur : en mode local, tu peux préparer la liste électorale et les questions.
        </p>
      )}

      <AnonymityNotice />

      {def.publishedVersion > 0 && (
        <section className={card} aria-labelledby={`${uid}-links`}>
          <SectionTitle icon={Link2}><span id={`${uid}-links`}>Liens à communiquer</span></SectionTitle>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label htmlFor={`${uid}-vl`} className="block text-xs text-dim mb-1">Lien du vote</label>
              <div className="flex gap-2"><input id={`${uid}-vl`} readOnly className="input font-mono text-xs" value={publicLink} onFocus={e => e.target.select()} />
                <button type="button" className="btn-secondary shrink-0" onClick={() => copy(publicLink, 'Lien du vote')} aria-label="Copier le lien du vote"><ClipboardCopy size={15} aria-hidden="true" /></button></div>
            </div>
            {verifyLink && (
              <div>
                <label htmlFor={`${uid}-rl`} className="block text-xs text-dim mb-1">Vérification des reçus (public)</label>
                <div className="flex gap-2"><input id={`${uid}-rl`} readOnly className="input font-mono text-xs" value={verifyLink} onFocus={e => e.target.select()} />
                  <button type="button" className="btn-secondary shrink-0" onClick={() => copy(verifyLink, 'Lien de vérification')} aria-label="Copier le lien de vérification des reçus"><ClipboardCopy size={15} aria-hidden="true" /></button></div>
              </div>
            )}
          </div>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <RollSection key={`${def.id}:${vote.electoralRoll}:${(vote.list || []).length}`} def={def} vote={vote} members={members} canWrite={canWrite} onSave={saveRoll} needsRepublish={hasUnpublishedChanges(def, publication)} />
        <ParticipationSection data={part.data} quorumPercent={vote.quorumPercent} loading={part.loading} error={part.error} onRefresh={loadParticipation} at={part.at} live={isOpen} />
      </div>

      <section className={card} aria-labelledby={`${uid}-res`}>
        <SectionTitle icon={Trophy} aside={resultsAvailable && (
          <button type="button" className="btn-ghost text-xs" onClick={loadResults} disabled={res.loading}>
            {res.loading ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={14} aria-hidden="true" />} Actualiser
          </button>
        )}><span id={`${uid}-res`}>Résultats</span></SectionTitle>
        {!resultsAvailable && <p className="text-sm text-dim">{!serverId ? 'Les résultats apparaîtront ici une fois le vote publié puis clôturé.' : 'Résultats masqués jusqu’à la clôture du vote (réglage « après la clôture ») : personne, pas même les administrateurs, ne peut les consulter avant.'}</p>}
        {res.error && <p className="text-sm text-red-600" role="alert">{res.error}</p>}
        {res.data && !res.data.visible && (
          <p className="text-sm text-dim">{res.data.reason === 'hidden_until_close' ? 'Le serveur garde les résultats secrets jusqu’à la clôture.' : res.data.reason === 'forbidden' ? 'Ton compte n’a pas le droit de consulter ces résultats.' : 'Résultats indisponibles.'}</p>
        )}
        {analysis && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span className="text-ink font-medium">{analysis.ballots} bulletin(s)</span>
              <span className="text-dim">{analysis.electorate} inscrit(s)</span>
              <span className="text-dim">participation {analysis.participation === null ? '—' : formatPercent(analysis.participation)}</span>
              {res.data.closed ? <span className="badge badge-emerald">Résultats définitifs</span> : <span className="badge badge-amber">Provisoires (vote en cours)</span>}
            </div>
            {!analysis.quorumReached && (
              <p className="text-sm rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-200 p-2.5" role="alert">
                Quorum non atteint ({analysis.quorum.counted} votant(s) pour {analysis.quorum.required} requis) : les décisions sont sans effet selon les paramètres du vote.
              </p>
            )}
            <p className="text-xs text-dim">{analysis.ruleText} Pour une élection entre candidat·es, la majorité simple désigne la personne ayant le plus de voix ; les votes blancs ne sont jamais des suffrages exprimés.</p>
            <ul className="space-y-3">{analysis.questions.map(a => <QuestionResult key={a.key} a={a} />)}</ul>
          </div>
        )}
      </section>

      <section className={card} aria-labelledby={`${uid}-pv`}>
        <SectionTitle icon={FileText}><span id={`${uid}-pv`}>Procès-verbal</span></SectionTitle>
        {!analysis || !res.data?.closed ? (
          <p className="text-sm text-dim">Le procès-verbal se génère à partir des résultats définitifs, une fois le vote clôturé.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-dim">Le modèle « Procès-verbal d’assemblée générale » est prérempli : quorum (votants / inscrits), majorité, une résolution par question Pour/Contre/Abstention ou Oui/Non, les élections avec leurs voix, et le déroulement du scrutin électronique.</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <div>
                <label htmlFor={`${uid}-pvt`} className="block text-xs text-dim mb-1">Type d’assemblée</label>
                <select id={`${uid}-pvt`} className="input" value={pv.type} onChange={e => setPv(p => ({ ...p, type: e.target.value }))}>
                  <option value="ordinaire">Ordinaire</option><option value="extraordinaire">Extraordinaire</option>
                </select>
              </div>
              <div>
                <label htmlFor={`${uid}-pvd`} className="block text-xs text-dim mb-1">Date de l’assemblée</label>
                <input id={`${uid}-pvd`} type="date" className="input" value={pv.date} onChange={e => setPv(p => ({ ...p, date: e.target.value }))} />
              </div>
              <div>
                <label htmlFor={`${uid}-pvl`} className="block text-xs text-dim mb-1">Lieu (facultatif)</label>
                <input id={`${uid}-pvl`} className="input" value={pv.lieu} placeholder="Par défaut : l’établissement" onChange={e => setPv(p => ({ ...p, lieu: e.target.value }))} />
              </div>
              <div>
                <label htmlFor={`${uid}-pvo`} className="block text-xs text-dim mb-1">Heure d’ouverture (facultatif)</label>
                <input id={`${uid}-pvo`} type="time" className="input" value={pv.heureOuverture} onChange={e => setPv(p => ({ ...p, heureOuverture: e.target.value }))} />
              </div>
              <div>
                <label htmlFor={`${uid}-pvc`} className="block text-xs text-dim mb-1">Heure de clôture (facultatif)</label>
                <input id={`${uid}-pvc`} type="time" className="input" value={pv.heureCloture} onChange={e => setPv(p => ({ ...p, heureCloture: e.target.value }))} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" onClick={() => issuePv(true)} disabled={!!busy}>{busy === 'pv-draft' ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <FileText size={15} aria-hidden="true" />} Aperçu (brouillon PDF)</button>
              <button type="button" className="btn-primary" onClick={() => issuePv(false)} disabled={!!busy || !canIssue} title={canIssue ? undefined : 'Droit « documents » en écriture requis'}>{busy === 'pv' ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Gavel size={15} aria-hidden="true" />} Émettre le PV</button>
            </div>
            {issued.length > 0 && (
              <div>
                <p className="text-xs font-medium text-dim mb-1">PV émis pour ce vote (registre des documents)</p>
                <ul className="divide-y divide-line border border-line rounded-lg text-sm">
                  {issued.map(e => (
                    <li key={e.id} className="px-3 py-2 flex flex-wrap items-center gap-2 justify-between">
                      <span className="text-ink"><span className="font-mono">{e.ref}</span> — {e.title}</span>
                      <span className="text-xs text-dim">{formatDateLong(e.createdAt)} · <a className="text-blue-600 dark:text-blue-400 underline" href={verificationUrl(e.ref, e.fingerprint)} target="_blank" rel="noopener noreferrer">vérifier</a></span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      <p className="text-[11px] text-muted flex items-center gap-1.5"><ShieldCheck size={12} aria-hidden="true" /> Aucune liste nominative des votants n’est disponible : le serveur ne fournit que des totaux.</p>
    </div>
  );
}
