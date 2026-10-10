// Candidatures : grille d'évaluation configurable, évaluateurs multiples,
// évaluation à l'aveugle, conflits d'intérêts, moyenne / écart, classement,
// décision, envoi des retenus au moteur d'affectation des rôles.
// Stockage : store forms (tranches synchronisées forms.evaluations et
// forms.evaluationGrids) — aucune API d'évaluation côté serveur.
import { useId, useMemo, useState } from 'react';
import { EyeOff, Eye, Plus, Trash2, Save, Sparkles, Loader2, AlertTriangle, Settings2, X } from 'lucide-react';
import { useFormsStore } from '../../modules/forms/store.js';
import { usePermissionSource } from '../../core/permissions.js';
import { summarizeAnswers } from '../engine/index.js';
import { DEFAULT_CRITERIA, evaluationSummary, evaluationTotal, fmtNum, statusesOf, STATUS_BADGE, adminQuestions } from './analytics.js';
import { respondentLabel } from './columns.js';
import { readPref, writePref } from './prefs.js';
import { automationsAvailable, sendCandidatesToRoleEngine } from './manualActions.js';
import { navigate } from '../../core/router.js';
import { toast } from '../../components/ui/toastStore.js';
import { confirmDialog } from '../../components/ui/confirmStore.js';
import Modal from '../../components/Modal.jsx';

const EMPTY = {};
const ACCEPT_RX = /accept|retenu|valid|admis/i;

export default function Applications({ ctx }) {
  const uid = useId();
  const { def, filtered, rows, canWrite, memberName, members, questions } = ctx;
  const perm = usePermissionSource();
  const grid = useFormsStore(s => s.evaluationGrids[def.id]) || null;
  const allEvals = useFormsStore(s => s.evaluations) || EMPTY;
  const saveGrid = useFormsStore(s => s.saveEvaluationGrid);
  const criteria = grid?.criteria?.length ? grid.criteria : DEFAULT_CRITERIA;
  const [blind, setBlind] = useState(() => readPref(`blind:${def.id}`, grid?.blindDefault ?? true));
  const [editGrid, setEditGrid] = useState(false);
  const [evaluating, setEvaluating] = useState(null);
  const remoteUser = perm?.mode === 'remote' ? perm.user : null;
  const [localEvaluator, setLocalEvaluator] = useState(() => readPref('evaluator', ''));
  const evaluatorId = remoteUser?.id || localEvaluator;
  const evaluatorName = remoteUser ? (remoteUser.email || 'Compte connecté') : localEvaluator === '__device' ? 'Cet appareil' : memberName(localEvaluator);

  // Numéro anonyme stable : ordre d'arrivée
  const number = useMemo(() => {
    const sorted = [...rows].sort((a, b) => String(a.submittedAt).localeCompare(String(b.submittedAt)));
    return new Map(sorted.map((r, i) => [r.id, i + 1]));
  }, [rows]);
  const evalsByResponse = useMemo(() => {
    const m = new Map();
    Object.values(allEvals).forEach(e => { if (e?.formId === def.id) { if (!m.has(e.responseId)) m.set(e.responseId, []); m.get(e.responseId).push(e); } });
    return m;
  }, [allEvals, def.id]);
  const ranking = useMemo(() => filtered.map(r => ({ row: r, sum: evaluationSummary(evalsByResponse.get(r.id) || [], criteria) }))
    .sort((a, b) => (b.sum.mean ?? -1) - (a.sum.mean ?? -1) || String(a.row.submittedAt).localeCompare(String(b.row.submittedAt))), [filtered, evalsByResponse, criteria]);
  const statuses = statusesOf(def);
  const nameOf = r => (blind ? `Candidat n°${number.get(r.id)}` : respondentLabel(r, questions, memberName) || `Candidat n°${number.get(r.id)}`);

  const setDecision = async (row, status) => {
    try { await ctx.repo.update([row], { status }); toast.success('Décision enregistrée', statuses.find(s => s.id === status)?.label); ctx.reload(); } catch (err) { toast.error('Décision non enregistrée', err?.message || String(err)); }
  };

  return (
    <div className="space-y-3">
      <div className="bg-surface border border-line rounded-2xl p-3 flex flex-wrap items-center gap-2">
        <button type="button" className={`btn-secondary !py-1.5 ${blind ? '!border-violet-500/50' : ''}`} aria-pressed={blind} onClick={() => { setBlind(b => !b); writePref(`blind:${def.id}`, !blind); }}>
          {blind ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />} Évaluation à l'aveugle : {blind ? 'activée' : 'désactivée'}
        </button>
        {canWrite && <button type="button" className="btn-ghost !py-1.5" onClick={() => setEditGrid(true)}><Settings2 size={15} aria-hidden="true" /> Grille ({criteria.length} critères)</button>}
        <div className="ml-auto flex items-center gap-2">
          {remoteUser ? <span className="text-xs text-dim">Évaluateur : {evaluatorName}</span> : (
            <>
              <label htmlFor={`${uid}-ev`} className="text-xs text-dim">Je suis</label>
              <select id={`${uid}-ev`} className="input !w-auto max-w-full !py-1 !text-xs" value={localEvaluator} onChange={e => { setLocalEvaluator(e.target.value); writePref('evaluator', e.target.value); }}>
                <option value="">Choisir l'évaluateur…</option>
                <option value="__device">Cet appareil (sans fiche membre)</option>
                {(members || []).map(m => <option key={m.id} value={m.id}>{memberName(m.id)}</option>)}
              </select>
            </>
          )}
        </div>
      </div>
      {blind && <p className="text-[11px] text-dim">Mode aveugle : nom, e-mail, téléphone, adresse, signature et réponses sensibles sont masqués ; les candidats sont numérotés par ordre d'arrivée.</p>}

      <section className="bg-surface border border-line rounded-2xl overflow-x-auto" aria-labelledby={`${uid}-rk`}>
        <h3 id={`${uid}-rk`} className="text-sm font-semibold text-ink p-3 pb-0">Classement ({ranking.length} candidature{ranking.length > 1 ? 's' : ''})</h3>
        <table className="w-full text-sm border-collapse mt-2">
          <thead><tr className="text-xs text-dim border-b border-line">
            <th scope="col" className="p-2 text-right w-10">Rang</th><th scope="col" className="p-2 text-left">Candidat</th>
            <th scope="col" className="p-2 text-right">Moyenne /20</th><th scope="col" className="p-2 text-right">Écart-type</th>
            <th scope="col" className="p-2 text-right">Évaluations</th><th scope="col" className="p-2 text-left">Ma note</th><th scope="col" className="p-2 text-left">Décision</th>
          </tr></thead>
          <tbody>
            {ranking.map(({ row, sum }, i) => {
              const mine = evaluatorId ? (evalsByResponse.get(row.id) || []).find(e => e.evaluatorId === evaluatorId) : null;
              const myTotal = mine ? evaluationTotal(mine, criteria) : null;
              const st = statuses.find(s => s.id === row.status);
              return (
                <tr key={row.id} className="border-b border-line/60">
                  <td className="p-2 text-right tabular-nums text-dim">{sum.n ? i + 1 : '—'}</td>
                  <th scope="row" className="p-2 text-left font-normal">
                    <button type="button" className="text-ink hover:underline text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 rounded" onClick={() => setEvaluating(row.id)}>{nameOf(row)}</button>
                  </th>
                  <td className="p-2 text-right tabular-nums font-semibold text-ink">{fmtNum(sum.mean)}</td>
                  <td className="p-2 text-right tabular-nums text-dim">{sum.n > 1 ? fmtNum(sum.sd) : '—'}</td>
                  <td className="p-2 text-right tabular-nums text-dim">{sum.n}{sum.conflicts ? <span className="text-amber-600" title="Conflit(s) d'intérêts déclaré(s) : évaluation(s) exclue(s)"> +{sum.conflicts}⚠</span> : ''}</td>
                  <td className="p-2">{mine?.conflict ? <span className="badge badge-amber">Conflit déclaré</span> : myTotal !== null ? <span className="tabular-nums">{fmtNum(myTotal)}</span> : <button type="button" className="text-xs underline text-blue-600 dark:text-blue-400" onClick={() => setEvaluating(row.id)}>Évaluer</button>}</td>
                  <td className="p-2">
                    {canWrite ? (
                      <select aria-label={`Décision pour ${nameOf(row)}`} className="input !py-1 !text-xs !w-auto max-w-full" value={row.status} onChange={e => setDecision(row, e.target.value)}>
                        {statuses.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                    ) : <span className={`badge ${STATUS_BADGE[st?.color] || 'badge-neutral'}`}>{st?.label || row.status}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <SendToEngine ctx={ctx} statuses={statuses} />

      {editGrid && <GridEditor criteria={criteria} blindDefault={grid?.blindDefault ?? true} onClose={() => setEditGrid(false)} onSave={(c, b) => { saveGrid(def.id, { criteria: c, blindDefault: b }); setEditGrid(false); toast.success('Grille d\'évaluation enregistrée'); }} />}
      {evaluating && (() => {
        const row = rows.find(r => r.id === evaluating);
        return row ? <EvaluationModal ctx={ctx} row={row} title={nameOf(row)} blind={blind} criteria={criteria} evaluatorId={evaluatorId} evaluatorName={evaluatorName}
          evals={evalsByResponse.get(row.id) || []} onClose={() => setEvaluating(null)} /> : null;
      })()}
    </div>
  );
}

function GridEditor({ criteria, blindDefault, onSave, onClose }) {
  const [list, setList] = useState(() => criteria.map(c => ({ ...c })));
  const [blind, setBlind] = useState(blindDefault);
  const valid = list.length > 0 && list.every(c => c.label.trim() && c.max >= 1);
  const upd = (i, p) => setList(l => l.map((c, j) => (j === i ? { ...c, ...p } : c)));
  return (
    <Modal isOpen onClose={onClose} title="Grille d'évaluation" description="Critères notés par chaque évaluateur ; la note finale est ramenée sur 20 selon les coefficients." maxWidth="max-w-xl"
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Annuler</button><button type="button" className="btn-primary" disabled={!valid} onClick={() => onSave(list.map(c => ({ ...c, label: c.label.trim() })), blind)}><Save size={14} aria-hidden="true" /> Enregistrer</button></>}>
      <div className="space-y-2">
        {list.map((c, i) => (
          <div key={c.id} className="grid grid-cols-[1fr_4.5rem_4.5rem_auto] gap-2 items-end">
            <div><label htmlFor={`gc-${c.id}-l`} className="block text-[11px] text-dim">Critère</label><input id={`gc-${c.id}-l`} className="input" value={c.label} maxLength={80} onChange={e => upd(i, { label: e.target.value })} /></div>
            <div><label htmlFor={`gc-${c.id}-m`} className="block text-[11px] text-dim">Barème</label><input id={`gc-${c.id}-m`} type="number" min="1" max="100" className="input" value={c.max} onChange={e => upd(i, { max: Math.max(1, Number(e.target.value) || 1) })} /></div>
            <div><label htmlFor={`gc-${c.id}-w`} className="block text-[11px] text-dim">Coef.</label><input id={`gc-${c.id}-w`} type="number" min="0" step="0.5" className="input" value={c.weight ?? 1} onChange={e => upd(i, { weight: Math.max(0, Number(e.target.value) || 0) })} /></div>
            <button type="button" className="btn-ghost !p-2" aria-label={`Supprimer le critère ${c.label}`} onClick={() => setList(l => l.filter((_, j) => j !== i))}><Trash2 size={15} aria-hidden="true" /></button>
          </div>
        ))}
        <button type="button" className="btn-ghost !py-1 !text-xs" onClick={() => setList(l => [...l, { id: `c${Date.now().toString(36)}`, label: 'Nouveau critère', max: 5, weight: 1 }])}><Plus size={13} aria-hidden="true" /> Ajouter un critère</button>
        <label className="flex items-center gap-2 text-sm text-ink pt-2"><input type="checkbox" checked={blind} onChange={e => setBlind(e.target.checked)} /> Évaluation à l'aveugle par défaut</label>
      </div>
    </Modal>
  );
}

function EvaluationModal({ ctx, row, title, blind, criteria, evaluatorId, evaluatorName, evals, onClose }) {
  const uid = useId();
  const save = useFormsStore(s => s.saveEvaluation);
  const del = useFormsStore(s => s.deleteEvaluation);
  const mine = evals.find(e => e.evaluatorId === evaluatorId) || null;
  const [scores, setScores] = useState(() => ({ ...(mine?.scores || {}) }));
  const [comment, setComment] = useState(mine?.comment || '');
  const [conflict, setConflict] = useState(!!mine?.conflict);
  const [conflictNote, setConflictNote] = useState(mine?.conflictNote || '');
  const definition = ctx.definitionFor(row);
  const hidden = useMemo(() => new Set(adminQuestions(definition).filter(q => q.identity || q.sensitive).map(q => q.key)), [definition]);
  const lines = useMemo(() => {
    let l;
    try { l = summarizeAnswers(definition, row.answers || {}, { labelFor: ctx.labelFor }); } catch { l = []; }
    return blind ? l.filter(x => !hidden.has(x.key.split('.')[0]) && !x.sensitive) : l.map(x => (x.sensitive && !ctx.revealed ? { ...x, value: '•••••' } : x));
  }, [definition, row.answers, ctx.labelFor, blind, hidden, ctx.revealed]);
  const total = evaluationTotal({ scores }, criteria);
  const others = evals.filter(e => e.evaluatorId !== evaluatorId);
  const submit = () => {
    if (!evaluatorId) { toast.warn('Évaluateur inconnu', 'Choisis d\'abord qui évalue (« Je suis… »).'); return; }
    save({ formId: ctx.def.id, responseId: row.id, evaluatorId, evaluatorName, scores: conflict ? {} : scores, comment: comment.trim(), conflict, conflictNote: conflict ? conflictNote.trim() : '' });
    toast.success(conflict ? 'Conflit d\'intérêts déclaré' : 'Évaluation enregistrée', conflict ? 'Ton évaluation est exclue de la moyenne.' : `Note : ${fmtNum(total)} / 20`);
    onClose();
  };
  return (
    <Modal isOpen onClose={onClose} title={`Évaluer — ${title}`} maxWidth="max-w-3xl"
      footer={<>{mine && <button type="button" className="btn-ghost !text-red-600 mr-auto" onClick={async () => { if (await confirmDialog({ title: 'Supprimer ton évaluation ?', confirmLabel: 'Supprimer', tone: 'danger' })) { del(mine.id); onClose(); } }}>Supprimer mon évaluation</button>}
        <button type="button" className="btn-secondary" onClick={onClose}>Fermer</button><button type="button" className="btn-primary" disabled={!ctx.canWrite} onClick={submit}><Save size={14} aria-hidden="true" /> Enregistrer</button></>}>
      <div className="grid gap-4 md:grid-cols-2">
        <section aria-label="Candidature" className="space-y-1 max-h-[55vh] overflow-y-auto pr-1">
          {blind && <p className="text-[11px] text-violet-700 dark:text-violet-300 flex items-center gap-1"><EyeOff size={12} aria-hidden="true" /> Identité et coordonnées masquées.</p>}
          <dl className="divide-y divide-line border border-line rounded-xl">
            {lines.map(l => <div key={l.key} className="p-2"><dt className="text-[11px] text-muted">{l.label}</dt><dd className="text-sm text-ink whitespace-pre-wrap break-words">{l.value}</dd></div>)}
          </dl>
        </section>
        <section aria-label="Ma grille" className="space-y-2">
          <label className="flex items-start gap-2 text-sm text-ink p-2 rounded-lg border border-amber-500/30 bg-amber-500/5">
            <input type="checkbox" checked={conflict} onChange={e => setConflict(e.target.checked)} className="mt-1" />
            <span>Je déclare un conflit d'intérêts (proche, colocataire, binôme…) : je ne note pas cette candidature.</span>
          </label>
          {conflict ? (
            <div><label htmlFor={`${uid}-cn`} className="block text-xs text-dim mb-1">Précision (facultatif)</label><input id={`${uid}-cn`} className="input" maxLength={200} value={conflictNote} onChange={e => setConflictNote(e.target.value)} /></div>
          ) : criteria.map(c => (
            <div key={c.id} className="flex items-center gap-2">
              <label htmlFor={`${uid}-${c.id}`} className="text-sm text-ink flex-1">{c.label} <span className="text-[11px] text-muted">/ {c.max}{(c.weight ?? 1) !== 1 ? ` · coef. ${c.weight}` : ''}</span></label>
              <input id={`${uid}-${c.id}`} type="number" min="0" max={c.max} step="0.5" className="input !w-20" value={scores[c.id] ?? ''}
                onChange={e => setScores(s => ({ ...s, [c.id]: e.target.value === '' ? undefined : Math.min(c.max, Math.max(0, Number(e.target.value))) }))} />
            </div>
          ))}
          {!conflict && <p className="text-sm text-ink">Total : <strong>{fmtNum(total)} / 20</strong></p>}
          <div><label htmlFor={`${uid}-com`} className="block text-xs text-dim mb-1">Commentaire</label><textarea id={`${uid}-com`} className="input min-h-[4rem]" maxLength={2000} value={comment} onChange={e => setComment(e.target.value)} /></div>
          {!evaluatorId && <p className="text-xs text-amber-700 dark:text-amber-300 flex gap-1"><AlertTriangle size={13} aria-hidden="true" /> Choisis d'abord l'évaluateur (« Je suis… »).</p>}
          {others.length > 0 && (
            <details className="text-xs"><summary className="cursor-pointer text-dim">Autres évaluations ({others.length})</summary>
              <ul className="mt-1 space-y-1">{others.map(e => <li key={e.id} className="p-1.5 rounded bg-elevated">{e.evaluatorName || 'Évaluateur'} : {e.conflict ? 'conflit déclaré' : `${fmtNum(evaluationTotal(e, criteria))} / 20`}{e.comment ? ` — ${e.comment}` : ''}</li>)}</ul>
            </details>
          )}
        </section>
      </div>
    </Modal>
  );
}

function SendToEngine({ ctx, statuses }) {
  const uid = useId();
  const defaults = statuses.filter(s => ACCEPT_RX.test(s.id) || (s.final && ACCEPT_RX.test(s.label))).map(s => s.id);
  const [chosen, setChosen] = useState(() => new Set(defaults.length ? defaults : statuses.filter(s => s.final).slice(0, 1).map(s => s.id)));
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const targets = ctx.rows.filter(r => chosen.has(r.status) && !r.pending);
  const send = async () => {
    const ok = await confirmDialog({ title: `Envoyer ${targets.length} candidat(s) au moteur d'affectation ?`, message: 'Chaque candidat est ajouté (ou mis à jour) dans le moteur d\'affectation des rôles avec ses choix de rôles, sa disponibilité et ses motivations. Les affectations sont recalculées.', confirmLabel: 'Envoyer' });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await sendCandidatesToRoleEngine({ rows: targets, definition: ctx.def, mode: ctx.mode, formId: ctx.def.id });
      setReport(res);
      if (res.failed.length) toast.warn('Envoi partiel', `${res.ok} envoyé(s), ${res.failed.length} en échec.`);
      else toast.success('Candidats envoyés au moteur', `${res.ok} candidat(s).`);
    } catch (err) { toast.error('Envoi impossible', err?.message || String(err)); } finally { setBusy(false); }
  };
  return (
    <section className="bg-surface border border-line rounded-2xl p-4 space-y-2" aria-labelledby={`${uid}-h`}>
      <h3 id={`${uid}-h`} className="text-sm font-semibold text-ink flex items-center gap-1.5"><Sparkles size={15} aria-hidden="true" /> Moteur d'affectation des rôles</h3>
      <fieldset className="flex flex-wrap gap-2"><legend className="text-xs text-dim mb-1 w-full">Statuts considérés comme « retenus »</legend>
        {statuses.map(s => <label key={s.id} className="inline-flex items-center gap-1 text-sm text-ink"><input type="checkbox" checked={chosen.has(s.id)} onChange={e => setChosen(p => { const n = new Set(p); if (e.target.checked) n.add(s.id); else n.delete(s.id); return n; })} /> {s.label}</label>)}
      </fieldset>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary" disabled={busy || !targets.length || !automationsAvailable || !ctx.canWrite} onClick={send}>
          {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Sparkles size={15} aria-hidden="true" />} Envoyer les {targets.length} candidat(s) retenu(s)
        </button>
        <button type="button" className="btn-ghost !text-xs" onClick={() => navigate('org')}>Ouvrir le moteur</button>
      </div>
      {!automationsAvailable && <p className="text-xs text-amber-700 dark:text-amber-300">Module Automatisations indisponible : l'action d'ajout au moteur ne peut pas être utilisée.</p>}
      <p className="text-[11px] text-muted">Mappage attendu (modèle « Candidature au bureau ») : prenom_nom, email, telephone, formation, alternance, annee, choix_1/2/3, pourquoi, decouvrir, apporter, rythme, couteau_suisse.</p>
      {report && (
        <div className="text-xs p-2 rounded-lg bg-elevated space-y-0.5" aria-live="polite">
          <div className="flex items-center justify-between"><p className="font-semibold text-ink">{report.ok} envoyé(s), {report.failed.length} échec(s)</p><button type="button" className="btn-ghost !p-1" aria-label="Fermer le compte rendu" onClick={() => setReport(null)}><X size={12} aria-hidden="true" /></button></div>
          {report.failed.slice(0, 10).map((f, i) => <p key={i} className="text-red-600">• {f.error}</p>)}
          {[...new Set(report.warnings)].slice(0, 6).map((w, i) => <p key={i} className="text-amber-700 dark:text-amber-300">• {w}</p>)}
        </div>
      )}
    </section>
  );
}
