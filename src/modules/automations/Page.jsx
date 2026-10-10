// ============================================================
// MODULE AUTOMATISATIONS — écran principal
// ============================================================
// « SI déclencheur ET conditions ALORS actions » sur les réponses des
// formulaires. Moteur : src/automations/ (pipeline, actions, exécuteur).
// Routes : #/automations                 liste (actives / inactives)
//          #/automations/edit/<id>       éditeur visuel
//          #/automations/approbations    file d'approbation
//          #/automations/journal         journal des exécutions
//          #/automations/reponses        réponses locales (mode local)
//          #/automations/modeles         modèles prêts à l'emploi
// Droits : forms › write pour éditer / exécuter, forms › validate pour approuver.
// ============================================================
import { useEffect, useId, useMemo, useState } from 'react';
import {
  Workflow, Plus, Play, Loader2, Copy, Pencil, Trash2, ShieldCheck, LayoutTemplate, ListChecks, History, Inbox, Zap, AlertTriangle,
} from 'lucide-react';
import { navigate, useRoute } from '../../core/router.js';
import { useCan } from '../../core/permissions.js';
import { toast } from '../../components/ui/toastStore.js';
import { confirmDialog } from '../../components/ui/confirmStore.js';
import { useFormsStore } from '../forms/store.js';
import { useAutomationsStore } from '../../automations/store.js';
import { startAutomationRunner, runNow, useRunnerState } from '../../automations/runner.js';
import { TRIGGER_LABEL, emptyAutomation } from '../../automations/model.js';
import { getAction } from '../../automations/actions/index.js';
import { AUTOMATION_TEMPLATES, bestFormFor, instantiateTemplate } from '../../automations/templates.js';
import { statusesOf } from '../../automations/pipeline.js';
import {
  useConnected, useServerData, useAutomationList, persistAutomation, removeAutomation, duplicateAutomationIn,
} from '../../automations/ui/data.js';
import Editor from '../../automations/ui/Editor.jsx';
import { ApprovalsPanel, JournalPanel } from '../../automations/ui/RunsPanel.jsx';
import ResponsesPanel from '../../automations/ui/ResponsesPanel.jsx';
import { StatusBadge } from '../../automations/ui/RunDetails.jsx';
import { fmtDate } from '../../automations/ui/format.js';

const selectRuns = s => s.runs;
const selectDefs = s => s.definitions;
const selectRunner = s => s;

export default function AutomationsPage() {
  const route = useRoute();
  const connected = useConnected();
  const canWrite = useCan('forms', 'write');
  const runner = useRunnerState(selectRunner);
  const runs = useAutomationsStore(selectRuns);
  const serverLoading = useServerData(s => s.loading);
  const serverError = useServerData(s => s.error);
  const serverRuns = useServerData(s => s.runs);
  const list = useAutomationList(connected);
  const [draft, setDraft] = useState(null); // automatisation en cours d'édition (nouvelle / modèle)

  useEffect(() => { startAutomationRunner(); }, []);
  useEffect(() => { if (connected) useServerData.getState().load(); }, [connected]);

  const tab = route.rest[0] || '';
  const pendingCount = useMemo(() => Object.values(runs).filter(r => r.status === 'pending_approval' && r.mode !== 'server').length
    + (connected ? serverRuns.filter(r => r.status === 'pending_approval').length : 0), [runs, connected, serverRuns]);

  const editingId = tab === 'edit' ? route.rest[1] : null;
  const editing = editingId ? (draft?.id === editingId ? draft : list.find(a => a.id === editingId)) : null;

  const execute = async () => {
    try {
      const res = await runNow();
      if (connected) await useServerData.getState().load();
      if (res?.skipped === 'other-tab') toast.info('Un autre onglet exécute déjà', 'Réessaie dans un instant.');
      else toast.success('Passage terminé', `${res?.executed || 0} exécutée(s), ${res?.failed || 0} en échec${res?.ingested ? `, ${res.ingested} réponse(s) de borne reprise(s)` : ''}${res?.claimed ? `, ${res.claimed} réservée(s) sur le serveur` : ''}.`);
    } catch (err) {
      toast.error('Exécution impossible', String(err?.message || err));
    }
  };

  const openEditor = (a) => { setDraft(a); navigate('automations', 'edit', a.id); };

  const TABS = [
    { id: '', label: 'Automatisations', icon: Workflow },
    { id: 'approbations', label: `Approbations${pendingCount ? ` (${pendingCount})` : ''}`, icon: ShieldCheck },
    { id: 'journal', label: 'Journal', icon: History },
    ...(!connected ? [{ id: 'reponses', label: 'Réponses locales', icon: Inbox }] : []),
    { id: 'modeles', label: 'Modèles', icon: LayoutTemplate },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink flex items-center gap-2"><Workflow size={22} aria-hidden="true" /> Automatisations</h1>
          <p className="text-sm text-dim">SI une réponse arrive (ou change) ET les conditions sont vraies, ALORS les actions s'enchaînent : membre, moteur de rôles, documents, trésorerie, événements, tâches, agenda…</p>
          <p className="text-xs text-muted mt-1">
            <span className={`badge ${connected ? 'badge-emerald' : 'badge-neutral'} mr-2`}>{connected ? 'Mode connecté — déclenchements enregistrés par le serveur' : 'Mode local — cet appareil'}</span>
            Exécuteur : {runner.busy ? 'en cours…' : runner.lastRunAt ? `dernier passage ${fmtDate(runner.lastRunAt)}` : 'démarrage…'} (toutes les 60 s quand l'application est ouverte)
            {runner.lastError && <span className="text-rose-500"> · {runner.lastError}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canWrite && <button type="button" className="btn-secondary" onClick={execute} disabled={runner.busy}>{runner.busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Play size={16} aria-hidden="true" />} Exécuter maintenant</button>}
          {canWrite && <button type="button" className="btn-primary" onClick={() => openEditor(emptyAutomation())}><Plus size={16} aria-hidden="true" /> Nouvelle</button>}
        </div>
      </header>

      {tab !== 'edit' && (
        <nav aria-label="Sections des automatisations" className="flex flex-wrap gap-1 border-b border-line pb-2">
          {TABS.map(t => (
            <button key={t.id || 'list'} type="button" onClick={() => navigate('automations', t.id || undefined)} aria-current={tab === t.id ? 'page' : undefined}
              className={`chip ${tab === t.id ? 'chip-active' : 'chip-idle'}`}><t.icon size={14} aria-hidden="true" /> {t.label}</button>
          ))}
        </nav>
      )}

      {connected && serverError && <p className="card p-3 text-sm text-rose-500 flex gap-2" role="alert"><AlertTriangle size={16} aria-hidden="true" />{serverError}</p>}

      {tab === 'edit' && (
        editing ? (
          canWrite ? (
            <Editor key={editing.id} initial={editing} connected={connected}
              onSave={(a) => persistAutomation(a, connected)}
              onClose={() => { setDraft(null); navigate('automations'); }} />
          ) : <p className="card p-6 text-sm text-dim">Modifier une automatisation demande le droit Formulaires › écriture.</p>
        ) : serverLoading ? <p className="text-sm text-dim flex gap-2"><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Chargement…</p>
          : <p className="card p-6 text-sm text-dim">Automatisation introuvable. <button type="button" className="btn-ghost" onClick={() => navigate('automations')}>Retour à la liste</button></p>
      )}
      {tab === '' && <AutomationList list={list} connected={connected} canWrite={canWrite} runs={runs} loading={serverLoading} onEdit={openEditor} />}
      {tab === 'approbations' && <ApprovalsPanel connected={connected} />}
      {tab === 'journal' && <JournalPanel connected={connected} />}
      {tab === 'reponses' && !connected && <ResponsesPanel />}
      {tab === 'modeles' && <TemplatesPanel canWrite={canWrite} onUse={openEditor} />}
    </div>
  );
}

function triggerSummary(a, defs) {
  const def = a.formId ? defs[a.formId] : null;
  const form = a.formId ? (def?.title || 'formulaire introuvable') : 'tous les formulaires';
  let t = TRIGGER_LABEL[a.trigger?.type] || a.trigger?.type;
  if (a.trigger?.type === 'response.status_changed' && a.trigger.status) t += ` → ${statusesOf(def).find(s => s.id === a.trigger.status)?.label || a.trigger.status}`;
  if (a.trigger?.type === 'schedule') t += ` (${a.trigger.schedule?.offsetDays >= 0 ? '+' : ''}${a.trigger.schedule?.offsetDays || 0} j)`;
  return `${t} · ${form}`;
}

function AutomationList({ list, connected, canWrite, runs, loading, onEdit }) {
  const defs = useFormsStore(selectDefs);
  const [busy, setBusy] = useState(null);
  const lastRun = useMemo(() => {
    const out = {};
    Object.values(runs).forEach(r => { if (!out[r.automationId] || String(r.createdAt) > String(out[r.automationId].createdAt)) out[r.automationId] = r; });
    return out;
  }, [runs]);
  const active = list.filter(a => a.enabled);
  const inactive = list.filter(a => !a.enabled);

  const wrap = async (a, fn, ok) => {
    setBusy(a.id);
    try { await fn(); if (ok) toast.success(ok, a.name); } catch (err) { toast.error('Action impossible', String(err?.message || err)); } finally { setBusy(null); }
  };
  const toggle = (a) => wrap(a, () => persistAutomation({ ...a, enabled: !a.enabled }, connected), a.enabled ? 'Automatisation désactivée' : 'Automatisation activée');
  const duplicate = (a) => wrap(a, () => duplicateAutomationIn(a, connected), 'Automatisation dupliquée (inactive)');
  const remove = async (a) => {
    if (!(await confirmDialog({ title: `Supprimer « ${a.name} » ?`, message: 'L\'automatisation ne se déclenchera plus. Le journal et les données déjà créées sont conservés.', confirmLabel: 'Supprimer', tone: 'danger' }))) return;
    wrap(a, () => removeAutomation(a, connected), 'Automatisation supprimée');
  };

  if (loading && !list.length) return <p className="text-sm text-dim flex gap-2"><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Chargement…</p>;
  if (!list.length) {
    return (
      <div className="card p-8 text-center space-y-3">
        <Zap className="mx-auto text-muted" size={32} aria-hidden="true" />
        <p className="text-sm text-dim">Aucune automatisation. Pars d'un modèle prêt à l'emploi ou crée la tienne.</p>
        <button type="button" className="btn-secondary" onClick={() => navigate('automations', 'modeles')}><LayoutTemplate size={16} aria-hidden="true" /> Voir les modèles</button>
      </div>
    );
  }
  const card = (a) => {
    const lr = lastRun[a.id];
    return (
      <li key={a.id} className="card p-4 flex flex-wrap items-start gap-3">
        <button type="button" role="switch" aria-checked={a.enabled} aria-label={`${a.enabled ? 'Désactiver' : 'Activer'} ${a.name}`} disabled={!canWrite || busy === a.id} onClick={() => toggle(a)}
          className={`mt-0.5 relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${a.enabled ? 'bg-emerald-600 border-emerald-600' : 'bg-elevated border-line'}`}>
          <span className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow transition-all ${a.enabled ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-ink">{a.name}</h3>
          <p className="text-xs text-dim">{triggerSummary(a, defs)}</p>
          <p className="text-xs text-muted mt-0.5">{a.actions.map((x, i) => `${i + 1}. ${x.label || getAction(x.type)?.label || x.type}`).join(' · ') || 'Aucune action'}</p>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {a.requiresApproval && <span className="badge badge-amber"><ShieldCheck size={10} aria-hidden="true" /> Validation humaine</span>}
            {(a.conditions?.rules?.length > 0 || a.conditions?.formula) && <span className="badge badge-neutral"><ListChecks size={10} aria-hidden="true" /> Conditions</span>}
            {lr && <span className="inline-flex items-center gap-1 text-[11px] text-muted">Dernière : <StatusBadge status={lr.status} /> {fmtDate(lr.createdAt)}</span>}
          </div>
        </div>
        <div className="flex gap-1">
          {canWrite && <button type="button" className="btn-ghost !px-2" aria-label={`Modifier ${a.name}`} onClick={() => onEdit(a)}><Pencil size={16} aria-hidden="true" /></button>}
          {canWrite && <button type="button" className="btn-ghost !px-2" aria-label={`Dupliquer ${a.name}`} disabled={busy === a.id} onClick={() => duplicate(a)}><Copy size={16} aria-hidden="true" /></button>}
          {canWrite && <button type="button" className="btn-ghost !px-2" aria-label={`Supprimer ${a.name}`} disabled={busy === a.id} onClick={() => remove(a)}><Trash2 size={16} aria-hidden="true" /></button>}
        </div>
      </li>
    );
  };
  return (
    <div className="space-y-5">
      <section aria-labelledby="auto-active">
        <h2 id="auto-active" className="text-sm font-semibold text-dim mb-2">Actives ({active.length})</h2>
        {active.length ? <ul className="space-y-2">{active.map(card)}</ul> : <p className="text-sm text-muted">Aucune automatisation active.</p>}
      </section>
      <section aria-labelledby="auto-inactive">
        <h2 id="auto-inactive" className="text-sm font-semibold text-dim mb-2">Inactives ({inactive.length})</h2>
        {inactive.length ? <ul className="space-y-2">{inactive.map(card)}</ul> : <p className="text-sm text-muted">Aucune.</p>}
      </section>
    </div>
  );
}

function TemplatesPanel({ canWrite, onUse }) {
  const uid = useId();
  const defs = useFormsStore(selectDefs);
  const forms = useMemo(() => Object.values(defs).filter(d => d.status !== 'archived'), [defs]);
  const [choice, setChoice] = useState({});
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {AUTOMATION_TEMPLATES.map(t => {
        const suggested = bestFormFor(t, defs);
        const formId = choice[t.id] ?? suggested?.id ?? '';
        return (
          <li key={t.id} className="card p-4 flex flex-col gap-3">
            <div>
              <h3 className="font-semibold text-ink">{t.title}</h3>
              <p className="text-sm text-dim">{t.description}</p>
            </div>
            <div className="mt-auto space-y-2">
              <label htmlFor={`${uid}-${t.id}`} className="text-xs font-semibold text-dim">Formulaire</label>
              <select id={`${uid}-${t.id}`} className="input" value={formId} onChange={(e) => setChoice(c => ({ ...c, [t.id]: e.target.value }))}>
                <option value="">{t.formTemplate ? '— Choisir le formulaire —' : 'Tous les formulaires'}</option>
                {forms.map(f => <option key={f.id} value={f.id}>{f.title}{suggested?.id === f.id ? ' (suggéré)' : ''}</option>)}
              </select>
              {t.formTemplate && !suggested && <p className="text-[11px] text-muted">Conçu pour le modèle de formulaire « {t.formTemplate} » du Studio Formulaires.</p>}
              <button type="button" className="btn-primary w-full" disabled={!canWrite} onClick={() => onUse(instantiateTemplate(t, formId || null))}><Plus size={16} aria-hidden="true" /> Utiliser ce modèle</button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
