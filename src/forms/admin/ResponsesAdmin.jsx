// ============================================================
// ADMINISTRATION DES RÉPONSES (#/forms/<id>/reponses)
// ============================================================
// Onglet « Réponses » de l'éditeur : tableau de bord, tableau virtualisé,
// statistiques, croisements, vues par type (candidatures, quiz, enquêtes,
// réservations), exports. Données : dépôt local ou serveur (responsesRepo).
// Droits : lecture forms.read ; traitement forms.write ; suppression et
// export des données sensibles forms.manage.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { LayoutDashboard, Table2, BarChart3, Grid2x2, Download, ClipboardCheck, Trophy, GitCompare, CalendarRange, RefreshCw, AlertCircle, Loader2, Server, HardDrive, Eye, EyeOff, Lock, FlaskConical } from 'lucide-react';
import { useStore } from '../../store.js';
import { useCan, usePermissionSource } from '../../core/permissions.js';
import { useCatalog } from '../../core/useCatalog.js';
import { useFormsStore } from '../../modules/forms/store.js';
import { useRendererContext, resolveSources } from '../../modules/forms/integrations.js';
import { confirmDialog } from '../../components/ui/confirmStore.js';
import { toast } from '../../components/ui/toastStore.js';
import { formsApi, useBackendState, useEventsMap, useAutomationsStore } from './integrations.js';
import { useResponses, markSeen } from './useResponses.js';
import { adminQuestions, applyFilters, dimensions, EMPTY_FILTERS, scoreOf, slotPlanning } from './analytics.js';
import { buildColumns } from './columns.js';
import { readPref, writePref } from './prefs.js';
import { VizStyles } from './charts.jsx';
import Dashboard from './Dashboard.jsx';
import ResponsesTable from './ResponsesTable.jsx';
import StatsView from './StatsView.jsx';
import CrossView from './CrossView.jsx';
import ExportsView from './ExportsView.jsx';
import Applications from './Applications.jsx';
import { QuizView, CompareView, PlanningView } from './KindViews.jsx';
import ResponseDrawer from './ResponseDrawer.jsx';
import FiltersBar from './FiltersBar.jsx';

const selectWorkspace = s => s.workspaceId;
const useWorkspaceId = useBackendState ? () => useBackendState(selectWorkspace) : () => null;

export default function ResponsesAdmin({ def: rawDef }) {
  const canRead = useCan('forms', 'read');
  const canWrite = useCan('forms', 'write');
  const canManage = useCan('forms', 'manage');
  const perm = usePermissionSource();
  const publication = useFormsStore(s => s.publications[rawDef.id]);
  const workspaceId = useWorkspaceId();
  const members = useStore(s => s.members);
  const eventsMap = useEventsMap();
  const catalog = useCatalog();
  const rendererCtx = useRendererContext();
  const def = useMemo(() => resolveSources(rawDef, rendererCtx), [rawDef, rendererCtx]);

  const serverFormId = publication?.serverFormId || null;
  const canServer = !!(workspaceId && formsApi && serverFormId);
  const [sourcePref, setSourcePref] = useState(() => readPref(`source:${rawDef.id}`, 'auto'));
  const mode = canServer && sourcePref !== 'local' ? 'server' : 'local';
  const actor = perm?.user?.email || 'Cet appareil';
  const [trash, setTrash] = useState(false);

  const data = useResponses({ def: rawDef, mode, serverFormId, actor, deleted: trash });
  const { rows, repo } = data;

  // Définitions publiées par version (serveur) : une réponse s'affiche avec SA version.
  const [versions, setVersions] = useState({});
  useEffect(() => {
    if (!repo?.versions) return undefined;
    let alive = true;
    repo.versions().then(v => { if (alive) setVersions(v || {}); }).catch(() => {});
    return () => { alive = false; };
  }, [repo]);
  const definitionFor = useCallback((row) => {
    const v = row?.version && versions[row.version];
    return v ? resolveSources(v, rendererCtx) : def;
  }, [versions, def, rendererCtx]);

  // Libellés des membres / événements
  const memberById = useMemo(() => new Map((members || []).map(m => [m.id, m])), [members]);
  const memberName = useCallback((id) => {
    const m = memberById.get(id);
    return m ? ([m.firstName, m.lastName].filter(Boolean).join(' ') || m.name || m.email || 'Membre') : '';
  }, [memberById]);
  const labelFor = useCallback((kind, id) => (kind === 'member' ? memberName(id) : eventsMap?.[id]?.title || ''), [memberName, eventsMap]);
  const poleOfMember = useCallback((id) => {
    const m = memberById.get(id);
    const role = m?.mainRole ? catalog.roles?.[m.mainRole] : null;
    const pole = role?.pole ? catalog.poles?.[role.pole] : null;
    return pole ? { id: role.pole, label: pole.label || role.pole } : null;
  }, [memberById, catalog]);

  const questions = useMemo(() => adminQuestions(def), [def]);
  const columns = useMemo(() => buildColumns(def, { labelFor, memberName }), [def, labelFor, memberName]);
  const dims = useMemo(() => dimensions(def, { labelFor, poleOfMember }), [def, labelFor, poleOfMember]);

  const [revealed, setRevealed] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const scoreFn = useCallback(r => scoreOf(def, r), [def]);
  const filtered = useMemo(() => applyFilters(rows, filters, { questions, labelFor, includeSensitive: revealed, scoreOf: scoreFn }), [rows, filters, questions, labelFor, revealed, scoreFn]);
  const [selected, setSelected] = useState(() => new Set());
  const [openId, setOpenId] = useState(null);

  // Nouvelles réponses vues : on mémorise la visite
  useEffect(() => { if (!data.loading) markSeen(rawDef.id); }, [data.loading, data.loadedAt, rawDef.id]);

  const hasSlots = useMemo(() => slotPlanning(def, []).length > 0, [def]);
  const tabs = useMemo(() => {
    const t = [
      { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
      { id: 'table', label: 'Réponses', icon: Table2 },
      { id: 'stats', label: 'Statistiques', icon: BarChart3 },
      { id: 'cross', label: 'Croisement', icon: Grid2x2 },
    ];
    if (def.kind === 'application') t.push({ id: 'applications', label: 'Évaluations', icon: ClipboardCheck });
    if (def.kind === 'quiz' || questions.some(q => q.item?.score)) t.push({ id: 'quiz', label: 'Quiz', icon: Trophy });
    if (def.kind === 'survey') t.push({ id: 'compare', label: 'Comparaison', icon: GitCompare });
    if (def.kind === 'booking' || hasSlots) t.push({ id: 'planning', label: 'Planning', icon: CalendarRange });
    t.push({ id: 'exports', label: 'Exports', icon: Download });
    return t;
  }, [def.kind, questions, hasSlots]);
  const [tabPref, setTabPref] = useState(() => readPref(`tab:${rawDef.id}`, 'dashboard'));
  const tab = tabs.some(t => t.id === tabPref) ? tabPref : 'dashboard';
  const setTab = (id) => { setTabPref(id); writePref(`tab:${rawDef.id}`, id); };

  const reveal = async () => {
    if (revealed) { setRevealed(false); return; }
    const ok = await confirmDialog({
      title: 'Afficher les données sensibles ?',
      message: 'Téléphones, adresses, dates de naissance, signatures et autres réponses marquées « sensibles » seront visibles à l\'écran jusqu\'à ce que tu les masques ou quittes la page. Vérifie que personne ne regarde ton écran.',
      confirmLabel: 'Afficher', tone: 'warning',
    });
    if (ok) setRevealed(true);
  };

  if (!canRead) {
    return (
      <div className="bg-surface border border-line rounded-2xl p-8 text-center space-y-2">
        <Lock size={28} className="mx-auto text-muted" aria-hidden="true" />
        <p className="text-sm text-dim">Ton rôle ne permet pas de consulter les réponses des formulaires.</p>
      </div>
    );
  }

  const openRow = filtered.find(r => r.id === openId) || rows.find(r => r.id === openId) || null;
  const ctx = {
    def, rawDef, rows, filtered, questions, columns, dims, repo, mode, canWrite, canManage, revealed, labelFor, memberName, members,
    poleOfMember, definitionFor, selected, setSelected, openRow: id => setOpenId(id), filters, setFilters, reload: data.reload,
    scoreOf: scoreFn, actor, trash,
  };
  const filterable = ['table', 'stats', 'cross', 'exports', 'applications', 'quiz', 'planning'].includes(tab);

  return (
    <div className="space-y-3" data-forms-admin>
      <VizStyles />
      <div className="flex flex-wrap items-center gap-2">
        <span className={`badge ${mode === 'server' ? 'badge-brand' : 'badge-neutral'} inline-flex items-center gap-1`}>
          {mode === 'server' ? <Server size={12} aria-hidden="true" /> : <HardDrive size={12} aria-hidden="true" />}
          {mode === 'server' ? 'Réponses en ligne (serveur)' : 'Réponses de cet appareil'}
        </span>
        {canServer && (
          <label className="text-xs text-dim inline-flex items-center gap-1">
            <span className="sr-only">Source des réponses</span>
            <select className="input !py-1 !text-xs !w-auto max-w-full" value={mode} onChange={e => { const v = e.target.value === 'local' ? 'local' : 'auto'; setSourcePref(v); writePref(`source:${rawDef.id}`, v); setSelected(new Set()); }}>
              <option value="server">En ligne</option>
              <option value="local">Cet appareil (borne, saisie locale)</option>
            </select>
          </label>
        )}
        {mode === 'server' && canManage && (
          <button type="button" className={`btn-ghost !py-1 !text-xs ${trash ? '!text-red-600' : ''}`} aria-pressed={trash} onClick={() => { setTrash(t => !t); setSelected(new Set()); }}>
            {trash ? 'Quitter la corbeille' : 'Corbeille'}
          </button>
        )}
        <span className="text-xs text-dim" aria-live="polite">
          {data.loading ? (data.progress ? `Chargement… ${data.progress.n} / ${data.progress.total}` : 'Chargement…') : `${rows.length} réponse${rows.length > 1 ? 's' : ''}${data.truncated ? ` (sur ${data.total}, limite d'affichage atteinte)` : ''}`}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" className="btn-ghost !py-1 !text-xs" onClick={reveal} aria-pressed={revealed} title="Données sensibles">
            {revealed ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
            <span className="hidden sm:inline">{revealed ? 'Masquer les données sensibles' : 'Révéler les données sensibles'}</span>
          </button>
          <button type="button" className="btn-ghost !p-1.5" onClick={data.reload} aria-label="Recharger les réponses" title="Recharger" disabled={data.loading}>
            {data.loading ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={15} aria-hidden="true" />}
          </button>
          {import.meta.env.DEV && mode === 'local' && canWrite && <DemoButton def={def} members={members} eventsMap={eventsMap} sources={rendererCtx.sources} />}
        </div>
      </div>

      {data.error && (
        <div role="alert" className="flex items-start gap-2 p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-sm text-red-700 dark:text-red-300">
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0"><p>{data.error}</p><button type="button" className="underline text-xs mt-1" onClick={data.reload}>Réessayer</button></div>
        </div>
      )}

      <nav aria-label="Vues des réponses" className="overflow-x-auto -mx-1 px-1">
        <div role="tablist" className="inline-flex gap-1 p-1 bg-elevated border border-line rounded-xl">
          {tabs.map(t => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs sm:text-sm whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${tab === t.id ? 'bg-surface text-ink shadow-sm border border-line' : 'text-dim hover:text-ink border border-transparent'}`}>
              <t.icon size={14} aria-hidden="true" /> {t.label}
            </button>
          ))}
        </div>
      </nav>

      {filterable && <FiltersBar ctx={ctx} />}

      <div role="tabpanel" aria-label={tabs.find(t => t.id === tab)?.label}>
        {tab === 'dashboard' && <Dashboard ctx={ctx} loading={data.loading} goTable={() => setTab('table')} />}
        {tab === 'table' && <ResponsesTable ctx={ctx} />}
        {tab === 'stats' && <StatsView ctx={ctx} />}
        {tab === 'cross' && <CrossView ctx={ctx} />}
        {tab === 'applications' && <Applications ctx={ctx} />}
        {tab === 'quiz' && <QuizView ctx={ctx} />}
        {tab === 'compare' && <CompareView ctx={ctx} />}
        {tab === 'planning' && <PlanningView ctx={ctx} />}
        {tab === 'exports' && <ExportsView ctx={ctx} />}
      </div>

      {openRow && (
        <ResponseDrawer key={openRow.id} ctx={ctx} row={openRow} list={filtered} onNavigate={id => setOpenId(id)} onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}

/** Outil de développement : réponses de démonstration (mode local uniquement). */
function DemoButton({ def, members, eventsMap, sources }) {
  const run = async () => {
    if (!useAutomationsStore) { toast.error('Module Automatisations absent', 'Les réponses locales ne peuvent pas être créées.'); return; }
    const ok = await confirmDialog({ title: 'Générer 320 réponses de démonstration ?', message: 'Outil de développement : des réponses fictives (noms inventés, @exemple.fr) sont ajoutées aux réponses locales de ce formulaire.', confirmLabel: 'Générer' });
    if (!ok) return;
    const { generateDemoResponses } = await import('./demoData.js');
    const batch = generateDemoResponses(def, 320, { members, events: Object.values(eventsMap || {}), sources });
    useAutomationsStore.setState(s => ({ responses: { ...s.responses, ...batch } }));
    toast.success('Réponses de démonstration créées', `${Object.keys(batch).length} réponses fictives.`);
  };
  return (
    <button type="button" className="btn-ghost !py-1 !text-xs" onClick={run} title="Développement uniquement">
      <FlaskConical size={14} aria-hidden="true" /><span className="hidden sm:inline">Démo</span>
    </button>
  );
}
