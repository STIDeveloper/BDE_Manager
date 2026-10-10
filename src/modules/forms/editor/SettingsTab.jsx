// ============================================================
// Onglet « Réglages » : accès, période, quotas, notifications,
// anti-spam, données, intégration, statuts, vote.
// ============================================================
import { useId, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2, X, ShieldAlert, Info } from 'lucide-react';
import { FORM_KINDS, DEFAULT_STATUSES } from '../../../forms/schema.js';
import { isEmail, newKeyFromLabel } from '../../../forms/engine/index.js';
import { Panel, Field, Toggle, Segmented, NumberInput } from '../ui.jsx';
import { FormulaInput } from './Formula.jsx';

const ACCESS = [
  { value: 'public', label: 'Public', hint: 'Référencé : visible dans la liste publique des formulaires du BDE.' },
  { value: 'link', label: 'Par lien', hint: 'Non listé : seules les personnes ayant le lien peuvent répondre.' },
  { value: 'members', label: 'Membres', hint: 'Réservé aux membres connectés de l\'espace.' },
  { value: 'invited', label: 'Invités', hint: 'Réservé aux adresses e-mail invitées (lien personnel).' },
];
const IDENTITY = [
  { value: 'anonymous', label: 'Anonyme', hint: 'Aucune identité enregistrée avec la réponse.' },
  { value: 'optional', label: 'Facultative', hint: 'Le répondant peut se connecter pour préremplir et retrouver sa réponse.' },
  { value: 'required', label: 'Obligatoire', hint: 'Connexion par lien e-mail exigée avant de répondre.' },
];
const COLORS = ['blue', 'amber', 'zinc', 'emerald', 'red', 'violet', 'pink', 'cyan'];
const COLOR_HEX = { blue: '#3b82f6', amber: '#f59e0b', zinc: '#71717a', emerald: '#10b981', red: '#ef4444', violet: '#8b5cf6', pink: '#ec4899', cyan: '#06b6d4' };
const COLOR_FR = { blue: 'Bleu', amber: 'Ambre', zinc: 'Gris', emerald: 'Vert', red: 'Rouge', violet: 'Violet', pink: 'Rose', cyan: 'Cyan' };

const toLocalInput = iso => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocalInput = v => (v ? new Date(v).toISOString() : null);

export default function SettingsTab({ def, update }) {
  const s = def.settings || {};
  const set = (patch, opts = {}) => update(d => ({ ...d, settings: { ...(d.settings || {}), ...patch } }), opts);
  const setNested = (key, patch, opts) => set({ [key]: { ...(s[key] || {}), ...patch } }, opts);

  return (
    <div className="grid xl:grid-cols-2 gap-4 items-start">
      <div className="space-y-4 min-w-0">
        <Panel title="Type et accès">
          <Field label="Type de formulaire">
            {id => (
              <select id={id} className="input" value={def.kind} onChange={e => update(d => ({ ...d, kind: e.target.value, settings: e.target.value === 'vote' && !d.settings?.vote ? { ...d.settings, vote: { electoralRoll: 'members', list: [], anonymous: true, resultsVisibility: 'after_close', quorumPercent: null, majority: 'simple' } } : d.settings }), { snapshot: 'Type de formulaire' })}>
                {FORM_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
            )}
          </Field>
          <ChoiceList label="Qui peut répondre ?" value={s.access || 'link'} options={ACCESS} onChange={v => set({ access: v }, { snapshot: 'Accès' })} />
          <ChoiceList label="Identité du répondant" value={s.identity || 'optional'} options={IDENTITY} onChange={v => set({ identity: v }, { snapshot: 'Identité' })} />
        </Panel>

        <Panel title="Période et limites">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Ouverture">{id => <input id={id} type="datetime-local" className="input" value={toLocalInput(s.opensAt)} onChange={e => set({ opensAt: fromLocalInput(e.target.value) })} />}</Field>
            <Field label="Fermeture" error={s.opensAt && s.closesAt && new Date(s.opensAt) >= new Date(s.closesAt) ? 'La fermeture doit suivre l\'ouverture.' : null}>
              {id => <input id={id} type="datetime-local" className="input" value={toLocalInput(s.closesAt)} onChange={e => set({ closesAt: fromLocalInput(e.target.value) })} />}
            </Field>
          </div>
          <Field label="Nombre maximal de réponses" hint="Vide = illimité.">{id => <NumberInput id={id} min={1} value={s.maxResponses ?? undefined} onChange={v => set({ maxResponses: Number.isInteger(v) && v > 0 ? v : null }, { coalesce: 'set:max' })} />}</Field>
          <Toggle label="Liste d'attente" hint="Au-delà des limites (maximum, quotas, créneaux complets), les réponses sont acceptées en liste d'attente." checked={!!s.waitlist} onChange={v => set({ waitlist: v })} />
          <QuotasEditor def={def} quotas={s.quotas || []} onChange={(q, opts) => set({ quotas: q }, opts)} />
        </Panel>

        <Panel title="Réponses">
          <Toggle label="Une seule réponse par personne" hint={s.identity === 'anonymous' ? 'Avec un formulaire anonyme, la limite repose sur l\'appareil (contournable).' : 'Contrôlé par l\'identité du répondant.'} checked={!!s.onePerPerson} onChange={v => set({ onePerPerson: v })} />
          <Field label="Modification après envoi">
            {id => (
              <select id={id} className="input" value={s.allowEdit || 'never'} onChange={e => set({ allowEdit: e.target.value })}>
                <option value="never">Jamais</option>
                <option value="until_close">Jusqu'à la fermeture du formulaire</option>
                <option value="until_review">Jusqu'au début du traitement</option>
              </select>
            )}
          </Field>
          <Toggle label="Enregistrer un brouillon" hint="Le répondant peut reprendre plus tard sur le même appareil." checked={s.saveDraft !== false} onChange={v => set({ saveDraft: v })} />
          <Toggle label="Récapitulatif avant envoi" checked={s.showSummary !== false} onChange={v => set({ showSummary: v })} />
          <Toggle label="Reçu PDF" hint="Le répondant peut télécharger un récapitulatif PDF de sa réponse." checked={!!s.pdfReceipt} onChange={v => set({ pdfReceipt: v })} />
        </Panel>

        <Panel title="Message de confirmation">
          <Field label="Titre">{id => <input id={id} className="input" value={s.confirmation?.title || ''} onChange={e => setNested('confirmation', { title: e.target.value }, { coalesce: 'set:ct' })} />}</Field>
          <Field label="Message">{id => <textarea id={id} rows={3} className="input" value={s.confirmation?.message || ''} onChange={e => setNested('confirmation', { message: e.target.value }, { coalesce: 'set:cm' })} />}</Field>
          <Field label="Redirection après envoi (facultatif)" error={s.confirmation?.redirectUrl && !/^https:\/\//i.test(s.confirmation.redirectUrl) ? 'L\'adresse doit commencer par https://' : null}>
            {id => <input id={id} type="url" className="input" placeholder="https://…" value={s.confirmation?.redirectUrl || ''} onChange={e => setNested('confirmation', { redirectUrl: e.target.value.trim() }, { coalesce: 'set:cr' })} />}
          </Field>
        </Panel>
      </div>

      <div className="space-y-4 min-w-0">
        {def.kind === 'vote' && <VotePanel s={s} setNested={setNested} />}

        <Panel title="Notifications">
          <EmailList label="Prévenir à chaque réponse" emails={s.notifications?.onSubmit || []} onChange={list => setNested('notifications', { onSubmit: list })} />
          <Toggle label="Accusé de réception au répondant" hint="Nécessite une question e-mail ou un répondant identifié." checked={!!s.notifications?.respondentReceipt} onChange={v => setNested('notifications', { respondentReceipt: v })} />
        </Panel>

        <Panel title="Protection anti-spam">
          <Toggle label="Vérification Cloudflare Turnstile" hint="Défi invisible contre les robots (clé à configurer côté serveur)." checked={!!s.antiSpam?.turnstile} onChange={v => setNested('antiSpam', { turnstile: v, honeypot: true })} />
          <Field label="Réponses maximum par heure et par adresse IP">{id => <NumberInput id={id} min={1} max={1000} value={s.antiSpam?.rateLimitPerHour ?? 20} onChange={v => setNested('antiSpam', { rateLimitPerHour: Number.isInteger(v) && v > 0 ? v : 20, honeypot: true }, { coalesce: 'set:rate' })} />}</Field>
          <p className="text-[11px] text-muted">Un champ piège invisible (« honeypot ») est toujours actif.</p>
        </Panel>

        <Panel title="Données personnelles (RGPD)">
          <Field label="Durée de conservation des réponses (jours)" hint="Les réponses plus anciennes sont purgées automatiquement par le serveur.">
            {id => <NumberInput id={id} min={1} max={3650} value={s.retentionDays ?? undefined} onChange={v => set({ retentionDays: Number.isInteger(v) && v > 0 ? v : null }, { coalesce: 'set:ret' })} />}
          </Field>
          <Field label="Mention d'information affichée sous le formulaire">{id => <textarea id={id} rows={3} className="input" value={s.consentText || ''} onChange={e => set({ consentText: e.target.value }, { coalesce: 'set:consent' })} />}</Field>
        </Panel>

        <Panel title="Intégration dans un site">
          <Toggle label="Autoriser l'intégration (iframe)" checked={!!s.embed?.allowed} onChange={v => setNested('embed', { allowed: v })} />
          {s.embed?.allowed && <OriginList origins={s.embed?.origins || []} onChange={o => setNested('embed', { origins: o })} />}
        </Panel>

        <StatusesEditor statuses={s.statuses?.length ? s.statuses : DEFAULT_STATUSES} onChange={(st, opts) => set({ statuses: st }, opts)} />
      </div>
    </div>
  );
}

function ChoiceList({ label, value, options, onChange }) {
  const name = useId();
  return (
    <fieldset className="space-y-1">
      <legend className="text-xs font-medium text-dim mb-1">{label}</legend>
      {options.map(o => (
        <label key={o.value} className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer ${value === o.value ? 'border-blue-500 bg-blue-500/5' : 'border-line'}`}>
          <input type="radio" name={name} className="mt-0.5" checked={value === o.value} onChange={() => onChange(o.value)} />
          <span className="text-sm text-ink">{o.label}<span className="block text-[11px] text-muted">{o.hint}</span></span>
        </label>
      ))}
    </fieldset>
  );
}

function QuotasEditor({ def, quotas, onChange }) {
  const set = (i, patch, coalesce) => onChange(quotas.map((q, j) => (j === i ? { ...q, ...patch } : q)), coalesce ? { coalesce: `quota:${i}:${coalesce}` } : { snapshot: 'Quotas' });
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-ink">Quotas</p>
        <button type="button" className="btn-ghost !py-1 text-xs" onClick={() => onChange([...quotas, { expr: '', max: 50, message: 'Ce quota est atteint.' }], { snapshot: 'Quota ajouté' })}><Plus size={13} aria-hidden="true" /> Quota</button>
      </div>
      {!quotas.length && <p className="text-[11px] text-muted">Ex. « formule = "complete" » limité à 120 réponses. Les quotas sont vérifiés par le serveur à l'envoi.</p>}
      {quotas.map((q, i) => (
        <div key={i} className="border border-line rounded-xl p-2 space-y-2">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <FormulaInput label={`Quota ${i + 1} : réponses concernées`} def={def} value={q.expr || ''} onChange={v => set(i, { expr: v }, 'expr')} placeholder='formule = "complete"' rows={1} />
            </div>
            <button type="button" className="btn-ghost !p-1 mt-5" aria-label={`Supprimer le quota ${i + 1}`} onClick={() => onChange(quotas.filter((_, j) => j !== i), { snapshot: 'Quota supprimé' })}><Trash2 size={13} aria-hidden="true" /></button>
          </div>
          <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2">
            <Field label="Maximum">{id => <NumberInput id={id} min={0} value={q.max} onChange={v => set(i, { max: Number.isInteger(v) && v >= 0 ? v : 0 }, 'max')} />}</Field>
            <Field label="Message si atteint">{id => <input id={id} className="input" value={q.message || ''} onChange={e => set(i, { message: e.target.value }, 'msg')} />}</Field>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmailList({ label, emails, onChange }) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState('');
  const add = () => {
    const parts = draft.split(/[\s,;]+/).map(x => x.trim().toLowerCase()).filter(Boolean);
    if (!parts.length) return;
    const bad = parts.filter(p => !isEmail(p));
    if (bad.length) { setErr(`Adresse invalide : ${bad.join(', ')}`); return; }
    onChange([...new Set([...emails, ...parts])]);
    setDraft('');
    setErr('');
  };
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-medium text-dim">{label}</label>
      <div className="flex gap-1.5">
        <input id={id} type="email" className="input" placeholder="tresorier@bde.fr" value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} aria-invalid={!!err} />
        <button type="button" className="btn-secondary shrink-0" onClick={add}>Ajouter</button>
      </div>
      {err && <p className="text-xs text-red-600" role="alert">{err}</p>}
      <ul className="flex flex-wrap gap-1.5">
        {emails.map(e => (
          <li key={e} className="badge badge-neutral !text-[11px]">{e}
            <button type="button" aria-label={`Retirer ${e}`} onClick={() => onChange(emails.filter(x => x !== e))}><X size={11} aria-hidden="true" /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OriginList({ origins, onChange }) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState('');
  const add = () => {
    let o = draft.trim();
    if (!o) return;
    try {
      const u = new URL(o);
      if (u.protocol !== 'https:') throw new Error();
      o = u.origin;
    } catch { setErr('Origine invalide : saisis une adresse https://exemple.fr'); return; }
    onChange([...new Set([...origins, o])]);
    setDraft('');
    setErr('');
  };
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-medium text-dim">Sites autorisés (vide = tous)</label>
      <div className="flex gap-1.5">
        <input id={id} className="input" placeholder="https://bde-exemple.fr" value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <button type="button" className="btn-secondary shrink-0" onClick={add}>Ajouter</button>
      </div>
      {err && <p className="text-xs text-red-600" role="alert">{err}</p>}
      <ul className="flex flex-wrap gap-1.5">
        {origins.map(o => (
          <li key={o} className="badge badge-neutral !text-[11px]">{o}<button type="button" aria-label={`Retirer ${o}`} onClick={() => onChange(origins.filter(x => x !== o))}><X size={11} aria-hidden="true" /></button></li>
        ))}
      </ul>
    </div>
  );
}

function StatusesEditor({ statuses, onChange }) {
  const uid = useId();
  const set = (i, patch, coalesce) => onChange(statuses.map((st, j) => (j === i ? { ...st, ...patch } : st)), coalesce ? { coalesce: `status:${i}:${coalesce}` } : { snapshot: 'Statuts' });
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= statuses.length) return;
    const n = [...statuses];
    [n[i], n[j]] = [n[j], n[i]];
    onChange(n, { snapshot: 'Statuts' });
  };
  const add = () => {
    const id = newKeyFromLabel('statut', new Set(statuses.map(s => s.id)));
    onChange([...statuses, { id, label: 'Nouveau statut', color: 'violet' }], { snapshot: 'Statut ajouté' });
  };
  return (
    <Panel title="Statuts de traitement" description="Étapes de suivi des réponses dans l'espace d'administration. Le premier statut est attribué à chaque nouvelle réponse."
      actions={<button type="button" className="btn-secondary !py-1 text-xs" onClick={add}><Plus size={13} aria-hidden="true" /> Statut</button>}>
      <ol className="space-y-1.5">
        {statuses.map((st, i) => (
          <li key={st.id} className="flex flex-wrap items-center gap-1.5 border border-line rounded-lg p-1.5">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: COLOR_HEX[st.color] || '#888' }} aria-hidden="true" />
            <label htmlFor={`${uid}-l${i}`} className="sr-only">Libellé du statut {i + 1}</label>
            <input id={`${uid}-l${i}`} className="input !py-1 text-xs flex-1 min-w-28" value={st.label} onChange={e => set(i, { label: e.target.value }, 'label')} />
            <label htmlFor={`${uid}-c${i}`} className="sr-only">Couleur du statut {i + 1}</label>
            <select id={`${uid}-c${i}`} className="input !py-1 !w-24 text-xs" value={st.color} onChange={e => set(i, { color: e.target.value })}>
              {COLORS.map(c => <option key={c} value={c}>{COLOR_FR[c]}</option>)}
            </select>
            <label className="flex items-center gap-1 text-[11px] text-dim"><input type="checkbox" checked={!!st.final} onChange={e => set(i, { final: e.target.checked || undefined })} /> final</label>
            <span className="font-mono text-[10px] text-muted">{st.id}</span>
            <button type="button" className="btn-ghost !p-1" disabled={i === 0} aria-label={`Monter le statut ${st.label}`} onClick={() => move(i, -1)}><ArrowUp size={12} aria-hidden="true" /></button>
            <button type="button" className="btn-ghost !p-1" disabled={i === statuses.length - 1} aria-label={`Descendre le statut ${st.label}`} onClick={() => move(i, 1)}><ArrowDown size={12} aria-hidden="true" /></button>
            <button type="button" className="btn-ghost !p-1" disabled={statuses.length <= 1} aria-label={`Supprimer le statut ${st.label}`} onClick={() => onChange(statuses.filter((_, j) => j !== i), { snapshot: 'Statut supprimé' })}><Trash2 size={12} aria-hidden="true" /></button>
          </li>
        ))}
      </ol>
      <p className="text-[11px] text-muted">Un statut « final » clôt le traitement (la réponse ne peut plus être modifiée par le répondant).</p>
    </Panel>
  );
}

function VotePanel({ s, setNested }) {
  const v = s.vote || {};
  const listId = useId();
  return (
    <Panel title="Réglages du vote">
      <div className="text-[11px] rounded-lg border border-blue-500/30 bg-blue-500/5 text-ink p-2.5 space-y-1">
        <p className="font-semibold flex items-center gap-1.5"><ShieldAlert size={13} aria-hidden="true" /> Anonymat réel : ce qui est garanti</p>
        <p>Les votes passent uniquement par le serveur (espace connecté). Il enregistre <strong>séparément</strong> la liste électorale, le droit de vote consommé (contre le double vote) et le bulletin, <strong>sans colonne commune ni horodatage précis</strong> ; aucun rôle de l'application ne peut lire ces tables : ni les administrateurs du BDE ni les exports ne relient un bulletin à une personne. Chaque votant reçoit un reçu pour vérifier que son bulletin a été compté.</p>
        <p>Limites honnêtes : le propriétaire technique de la base (accès administrateur au serveur) garde un accès complet ; avec très peu de votants, le résultat peut révéler un choix. En mode local, aucun vote ne peut être recueilli.</p>
      </div>
      <Segmented label="Liste électorale" value={v.electoralRoll || 'members'} onChange={x => setNested('vote', { electoralRoll: x })}
        options={[{ value: 'members', label: 'Membres de l\'espace' }, { value: 'list', label: 'Liste d\'e-mails' }]} />
      {v.electoralRoll === 'list' && (
        <div className="space-y-1">
          <label htmlFor={listId} className="text-xs font-medium text-dim">Électeurs (un e-mail par ligne)</label>
          <textarea id={listId} rows={5} className="input font-mono text-xs" value={(v.list || []).join('\n')}
            onChange={e => setNested('vote', { list: e.target.value.split(/[\n,;]+/).map(x => x.trim().toLowerCase()).filter(Boolean) }, { coalesce: 'vote:list' })} />
          <p className="text-[11px] text-muted">{(v.list || []).length} électeur(s){(v.list || []).some(x => !isEmail(x)) ? ' — certaines adresses sont invalides.' : '.'}</p>
        </div>
      )}
      <Field label="Visibilité des résultats">
        {id => (
          <select id={id} className="input" value={v.resultsVisibility || 'after_close'} onChange={e => setNested('vote', { resultsVisibility: e.target.value })}>
            <option value="after_close">Après la clôture du vote</option>
            <option value="live">En direct (participation et résultats)</option>
            <option value="admins">Administrateurs uniquement</option>
          </select>
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Quorum (% des électeurs)" hint="Vide = pas de quorum.">{id => <NumberInput id={id} min={1} max={100} value={v.quorumPercent ?? undefined} onChange={x => setNested('vote', { quorumPercent: x > 0 && x <= 100 ? x : null }, { coalesce: 'vote:q' })} />}</Field>
        <Field label="Majorité requise">
          {id => (
            <select id={id} className="input" value={v.majority || 'simple'} onChange={e => setNested('vote', { majority: e.target.value })}>
              <option value="simple">Simple (plus de voix pour que contre)</option>
              <option value="absolute">Absolue (plus de 50 % des exprimés)</option>
              <option value="two_thirds">Deux tiers</option>
            </select>
          )}
        </Field>
      </div>
      <p className="text-[11px] text-muted flex gap-1"><Info size={12} className="shrink-0 mt-0.5" aria-hidden="true" /> Le bulletin est toujours secret (anonyme) ; les questions du vote sont marquées « données sensibles ».</p>
    </Panel>
  );
}
