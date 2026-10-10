// ============================================================
// ÉDITEUR D'UN FORMULAIRE (#/forms/<id>[/<onglet>])
// ============================================================
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Undo2, Redo2, History, AlertTriangle, CheckCircle2, Share2, Rocket, Hammer, GitBranch, Palette as PaletteIcon,
  Settings2, Eye, Cloud, AlertCircle, X, Inbox, Vote } from 'lucide-react';
import { useFormsStore, useFormUndo, hasUnpublishedChanges } from '../store.js';
import { validateDefinition, collectRefs, tryParse, flattenItems } from '../../../forms/engine/index.js';
import { useCan } from '../../../core/permissions.js';
import { navigate } from '../../../core/router.js';
import { toast } from '../../../components/ui/toastStore.js';
import { confirmDialog } from '../../../components/ui/confirmStore.js';
import {
  findItem, insertItem, removeItem, duplicateItem, moveItem, addPage, removePage, movePage, duplicatePage,
  newQuestion, newBlock, pageContainer, sectionContainer, itemLabel, contentHash,
} from '../defOps.js';
import { STATUS_META, relativeTime } from '../utils.js';
import { useRendererContext } from '../integrations.js';
import BuildTab from './BuildTab.jsx';
import LogicTab from './LogicTab.jsx';
import ThemeTab from './ThemeTab.jsx';
import SettingsTab from './SettingsTab.jsx';
import PreviewTab from './PreviewTab.jsx';
import PublishTab, { IssuesList } from './PublishTab.jsx';
import HistoryModal from './HistoryModal.jsx';
import ShareModal from '../ShareModal.jsx';

// Administration des réponses (src/forms/admin/) chargée à la demande
const adminLoader = Object.values(import.meta.glob('../../../forms/admin/ResponsesAdmin.jsx'))[0] || null;
const ResponsesAdmin = adminLoader ? lazy(adminLoader) : null;
// Gestion d'élection (formulaires de type « vote »).
const ElectionManager = lazy(() => import('../../../forms/vote/ElectionManager.jsx'));

const TABS = [
  { id: 'build', label: 'Construire', icon: Hammer },
  { id: 'logic', label: 'Logique', icon: GitBranch },
  { id: 'theme', label: 'Thème', icon: PaletteIcon },
  { id: 'settings', label: 'Réglages', icon: Settings2 },
  { id: 'preview', label: 'Aperçu', icon: Eye },
  { id: 'publish', label: 'Publication', icon: Rocket },
  ...(ResponsesAdmin ? [{ id: 'reponses', label: 'Réponses', icon: Inbox }] : []),
  { id: 'election', label: 'Élection', icon: Vote, kind: 'vote' },
];
const IDLE_SNAPSHOT_MS = 30000;
const EMPTY_STACK = { past: [], future: [] };

/** Références d'une formule (pour avertir avant suppression). */
function refsIn(src) {
  if (typeof src !== 'string' || !src.trim()) return [];
  const { ast } = tryParse(src);
  return ast ? [...collectRefs(ast)] : [];
}
function usagesOf(def, key) {
  if (!key) return [];
  const out = [];
  for (const { item } of flattenItems(def)) {
    const srcs = [item.showIf, typeof item.required === 'string' ? item.required : null, item.readOnlyIf, item.expr, item.default?.expr, item.amount?.expr, ...(item.options || []).map(o => o?.showIf)];
    if (item.key !== key && srcs.some(s => refsIn(s).includes(key))) out.push(itemLabel(item));
  }
  for (const v of def.variables || []) if (refsIn(v.expr).includes(key)) out.push(`variable ${v.key}`);
  for (const p of def.pages) {
    if (refsIn(p.logic?.showIf).includes(key) || (p.logic?.next || []).some(r => refsIn(r.when).includes(key))) out.push(`page « ${p.title || ''} »`);
  }
  return out;
}

export default function Editor({ formId, initialTab }) {
  const def = useFormsStore(s => s.definitions[formId]);
  const publication = useFormsStore(s => s.publications[formId]);
  const updateForm = useFormsStore(s => s.updateForm);
  const undo = useFormsStore(s => s.undo);
  const redo = useFormsStore(s => s.redo);
  const snapshot = useFormsStore(s => s.snapshot);
  const stack = useFormUndo(s => s.stacks[formId]) || EMPTY_STACK;
  const canWrite = useCan('forms', 'write');
  const context = useRendererContext();
  const rootRef = useRef(null);

  const tab = TABS.some(t => t.id === initialTab) ? initialTab : 'build';
  const setTab = useCallback(id => navigate('forms', formId, id === 'build' ? undefined : id), [formId]);
  const [selection, setSelection] = useState(null);
  const [currentPageId, setCurrentPageId] = useState(() => def.pages[0]?.id);
  const [mobilePane, setMobilePane] = useState('canvas');
  const [testAnswers, setTestAnswers] = useState({});
  const [device, setDevice] = useState('desktop');
  const [showHistory, setShowHistory] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [share, setShare] = useState(null);

  const issues = useMemo(() => validateDefinition(def), [def]);
  const errors = issues.filter(i => i.level === 'error').length;
  const dirty = hasUnpublishedChanges(def, publication);
  const pageExists = def.pages.some(p => p.id === currentPageId);
  const effectivePageId = pageExists ? currentPageId : def.pages[0]?.id;

  const update = useCallback((next, opts) => {
    if (!canWrite) return;
    updateForm(formId, next, opts);
  }, [canWrite, updateForm, formId]);

  // Instantané automatique après 30 s sans modification (si le contenu a changé)
  useEffect(() => {
    if (!canWrite) return undefined;
    const t = setTimeout(() => {
      const st = useFormsStore.getState();
      const cur = st.definitions[formId];
      const list = st.history[formId] || [];
      const last = list[list.length - 1];
      if (cur && (!last || contentHash(last.definition) !== contentHash(cur))) snapshot(formId, 'Modifications');
    }, IDLE_SNAPSHOT_MS);
    return () => clearTimeout(t);
  }, [def.updatedAt, formId, snapshot, canWrite]);

  // Annuler / rétablir au clavier quand le focus est dans l'éditeur
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      const isUndo = k === 'z' && !e.shiftKey;
      const isRedo = k === 'y' || (k === 'z' && e.shiftKey);
      if (!isUndo && !isRedo) return;
      if (!rootRef.current || !rootRef.current.contains(document.activeElement)) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      e.preventDefault();
      if (!canWrite) return;
      const ok = isUndo ? undo(formId) : redo(formId);
      if (!ok) toast.info(isUndo ? 'Rien à annuler' : 'Rien à rétablir');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [formId, undo, redo, canWrite]);

  const select = useCallback((sel, opts = {}) => {
    if (!sel) { setSelection(null); return; }
    if (sel.kind === 'item') {
      const f = findItem(useFormsStore.getState().definitions[formId], sel.id);
      if (f) setCurrentPageId(f.pageId);
    }
    if (sel.kind === 'page') setCurrentPageId(sel.id);
    setSelection(sel.kind === 'form' ? null : { kind: sel.kind, id: sel.id });
    if (opts.showProps) setMobilePane('props');
    if (sel.tab) setTab(sel.tab);
  }, [formId, setTab]);

  const ctx = useMemo(() => {
    const cur = () => useFormsStore.getState().definitions[formId];
    const defaultTarget = () => {
      const d = cur();
      if (selection?.kind === 'item') {
        const f = findItem(d, selection.id);
        if (f) {
          if (f.item.kind === 'section') return { cid: sectionContainer(f.item.id), index: undefined };
          return { cid: f.container, index: f.index + 1 };
        }
      }
      const pid = selection?.kind === 'page' ? selection.id : effectivePageId;
      return { cid: pageContainer(pid), index: undefined };
    };
    return {
      def,
      canWrite,
      update,
      selection,
      select,
      context,
      testAnswers,
      currentPageId: effectivePageId,
      setCurrentPageId,
      mobilePane,
      setMobilePane,
      notify: (title, detail) => toast.warn(title, detail),
      insertNew: (type, cid, index) => {
        if (!canWrite) return;
        const d = cur();
        const target = cid ? { cid, index } : defaultTarget();
        const item = type.startsWith('block:') ? newBlock(type.slice(6), d) : newQuestion(type, d);
        update(insertItem(d, target.cid, item, target.index), { snapshot: `Ajout : ${itemLabel(item)}` });
        select({ kind: 'item', id: item.id });
      },
      duplicate: (id) => {
        const d = cur();
        const { def: next, newId } = duplicateItem(d, id);
        if (!newId) return;
        update(next, { snapshot: 'Duplication' });
        select({ kind: 'item', id: newId });
        toast.success('Élément dupliqué');
      },
      remove: async (id) => {
        const d = cur();
        const f = findItem(d, id);
        if (!f) return;
        const children = f.item.kind === 'section' ? (f.item.items || []).length : f.item.kind === 'columns' ? (f.item.columns || []).flat().length : 0;
        const used = usagesOf(d, f.item.key);
        if (children || used.length) {
          const ok = await confirmDialog({
            title: `Supprimer « ${itemLabel(f.item)} » ?`,
            message: children ? `Ce bloc contient ${children} élément(s), supprimé(s) avec lui.` : 'Cette question est utilisée ailleurs : les formules concernées signaleront une référence inconnue.',
            details: used.length ? used.slice(0, 8).map(u => `Utilisée par : ${u}`) : undefined,
            confirmLabel: 'Supprimer', tone: 'danger',
          });
          if (!ok) return;
        }
        update(removeItem(cur(), id), { snapshot: `Suppression : ${itemLabel(f.item)}` });
        setSelection(s => (s?.id === id ? null : s));
        toast.success('Élément supprimé', 'Ctrl+Z pour annuler.');
      },
      moveWithin: (id, cid, index) => update(moveItem(cur(), id, cid, index), { snapshot: 'Réorganisation' }),
      addPage: (afterIndex) => {
        const { def: next, pageId } = addPage(cur(), afterIndex);
        update(next, { snapshot: 'Ajout de page' });
        setCurrentPageId(pageId);
        setSelection({ kind: 'page', id: pageId });
      },
      removePage: async (pageId) => {
        const d = cur();
        const page = d.pages.find(p => p.id === pageId);
        if (!page || d.pages.length <= 1) return;
        if ((page.items || []).length) {
          const ok = await confirmDialog({
            title: `Supprimer la page « ${page.title || ''} » ?`,
            message: `Ses ${page.items.length} élément(s) seront supprimés. Les règles de saut vers cette page sont retirées.`,
            confirmLabel: 'Supprimer la page', tone: 'danger',
          });
          if (!ok) return;
        }
        update(removePage(cur(), pageId), { snapshot: 'Suppression de page' });
        setSelection(null);
        toast.success('Page supprimée', 'Ctrl+Z pour annuler.');
      },
      movePage: (from, to) => update(movePage(cur(), from, to), { snapshot: 'Ordre des pages' }),
      duplicatePage: (pageId) => {
        const { def: next, pageId: np } = duplicatePage(cur(), pageId);
        if (!np) return;
        update(next, { snapshot: 'Duplication de page' });
        setCurrentPageId(np);
        toast.success('Page dupliquée');
      },
    };
  }, [def, canWrite, update, selection, select, context, testAnswers, effectivePageId, mobilePane, formId]);

  const propsAction = useCallback((a) => {
    if (a.kind === 'duplicate') ctx.duplicate(a.id);
    else if (a.kind === 'delete') ctx.remove(a.id);
    else select(a);
  }, [ctx, select]);
  const buildCtx = useMemo(() => ({ ...ctx, propsAction }), [ctx, propsAction]);

  const pickIssue = useCallback((it) => {
    setShowIssues(false);
    if (it.itemId && findItem(def, it.itemId)) { select({ kind: 'item', id: it.itemId, tab: 'build' }, { showProps: true }); return; }
    if (it.pageId && def.pages.some(p => p.id === it.pageId)) { select({ kind: 'page', id: it.pageId, tab: 'build' }, { showProps: true }); return; }
    if (it.key && (def.variables || []).some(v => v.key === it.key)) { setTab('logic'); return; }
    if (/date|réponses|quota|redirection|vote|identification/i.test(it.message)) { setTab('settings'); return; }
    if (/lien court/i.test(it.message)) { setTab('publish'); return; }
    select({ kind: 'form', tab: 'build' }, { showProps: true });
  }, [def, select, setTab]);

  const meta = STATUS_META[def.status] || STATUS_META.draft;

  return (
    <div ref={rootRef} className="max-w-[110rem] mx-auto space-y-3" data-form-editor>
      <header className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-ghost !px-2" onClick={() => navigate('forms')} aria-label="Retour à la liste des formulaires">
          <ArrowLeft size={16} aria-hidden="true" /><span className="hidden sm:inline">Formulaires</span>
        </button>
        <div className="flex-1 min-w-[12rem]">
          <label htmlFor="form-title" className="sr-only">Titre du formulaire</label>
          <input id="form-title" className="w-full bg-transparent text-lg font-bold text-ink rounded-lg px-2 py-1 border border-transparent hover:border-line focus:border-blue-500 focus:outline-none" value={def.title}
            readOnly={!canWrite} onChange={e => update(d => ({ ...d, title: e.target.value }), { coalesce: 'form:title' })} />
          <div className="flex flex-wrap items-center gap-1.5 px-2">
            <span className={`badge ${meta.badge}`}>{meta.label}</span>
            {def.publishedVersion ? <span className="badge badge-brand">v{def.publishedVersion} en ligne</span> : null}
            {dirty && <span className="badge badge-amber">Modifications non publiées</span>}
            <span className="text-[11px] text-muted inline-flex items-center gap-1"><Cloud size={11} aria-hidden="true" /> Enregistré automatiquement · {relativeTime(def.updatedAt)}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <button type="button" className="btn-ghost !p-2" disabled={!canWrite || !stack.past.length} onClick={() => undo(formId)} aria-label="Annuler (Ctrl+Z)" title="Annuler (Ctrl+Z)"><Undo2 size={16} aria-hidden="true" /></button>
          <button type="button" className="btn-ghost !p-2" disabled={!canWrite || !stack.future.length} onClick={() => redo(formId)} aria-label="Rétablir (Ctrl+Y)" title="Rétablir (Ctrl+Y)"><Redo2 size={16} aria-hidden="true" /></button>
          <div className="relative">
            <button type="button" className={`btn-secondary !py-1.5 ${errors ? '!border-red-500/50' : ''}`} aria-expanded={showIssues} onClick={() => setShowIssues(s => !s)}>
              {issues.length ? <AlertTriangle size={15} className={errors ? 'text-red-600' : 'text-amber-600'} aria-hidden="true" /> : <CheckCircle2 size={15} className="text-emerald-600" aria-hidden="true" />}
              <span>{issues.length ? `${issues.length} problème${issues.length > 1 ? 's' : ''}` : 'Aucun problème'}</span>
            </button>
            {showIssues && (
              <div className="absolute right-0 top-full mt-1 z-40 w-[min(26rem,92vw)] max-h-[60vh] overflow-auto bg-surface border border-line rounded-xl shadow-2xl p-2" role="dialog" aria-label="Problèmes détectés"
                onKeyDown={e => { if (e.key === 'Escape') setShowIssues(false); }}>
                <div className="flex items-center justify-between px-1 pb-1">
                  <p className="text-xs font-semibold text-ink flex items-center gap-1"><AlertCircle size={13} aria-hidden="true" /> Vérification</p>
                  <button type="button" className="btn-ghost !p-1" aria-label="Fermer la liste des problèmes" onClick={() => setShowIssues(false)}><X size={14} aria-hidden="true" /></button>
                </div>
                <IssuesList issues={issues} onPick={pickIssue} />
              </div>
            )}
          </div>
          <button type="button" className="btn-ghost !p-2" onClick={() => setShowHistory(true)} aria-label="Historique des versions" title="Historique"><History size={16} aria-hidden="true" /></button>
          <button type="button" className="btn-ghost !p-2" onClick={() => setShare('link')} aria-label="Partager" title="Partager"><Share2 size={16} aria-hidden="true" /></button>
          <button type="button" className="btn-primary !py-1.5" onClick={() => setTab('publish')}><Rocket size={15} aria-hidden="true" /> Publier</button>
        </div>
      </header>

      {!canWrite && (
        <p className="text-xs rounded-lg border border-line bg-elevated p-2 text-dim">Lecture seule : ton rôle ne permet pas de modifier les formulaires.</p>
      )}

      <nav aria-label="Sections de l'éditeur" className="overflow-x-auto -mx-1 px-1">
        <div role="tablist" className="inline-flex gap-1 p-1 bg-elevated border border-line rounded-xl">
          {TABS.filter(t => !t.kind || t.kind === def.kind).map(t => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${tab === t.id ? 'bg-surface text-ink shadow-sm border border-line' : 'text-dim hover:text-ink border border-transparent'}`}>
              <t.icon size={14} aria-hidden="true" /> {t.label}
              {t.id === 'publish' && errors > 0 && <span className="badge badge-rose !px-1">{errors}</span>}
            </button>
          ))}
        </div>
      </nav>

      <div role="tabpanel" aria-label={TABS.find(t => t.id === tab)?.label}>
        {tab === 'build' && <BuildTab ctx={buildCtx} />}
        {tab === 'logic' && (
          <fieldset disabled={!canWrite} className="min-w-0">
            <LogicTab def={def} update={update} testAnswers={testAnswers} setTestAnswers={setTestAnswers} context={context} onSelect={sel => select(sel, { showProps: true })} />
          </fieldset>
        )}
        {tab === 'theme' && <fieldset disabled={!canWrite} className="min-w-0"><ThemeTab def={def} update={update} /></fieldset>}
        {tab === 'settings' && <fieldset disabled={!canWrite} className="min-w-0"><SettingsTab def={def} update={update} /></fieldset>}
        {tab === 'preview' && (
          <PreviewTab def={def} device={device} setDevice={setDevice} testAnswers={testAnswers} setTestAnswers={setTestAnswers} context={context}
            selectedId={selection?.kind === 'item' ? selection.id : null} onItemClick={id => select({ kind: 'item', id, tab: 'build' }, { showProps: true })} />
        )}
        {tab === 'publish' && <PublishTab def={def} issues={issues} onPickIssue={pickIssue} onShare={setShare} />}
        {tab === 'election' && def.kind === 'vote' && (
          <Suspense fallback={<p className="text-sm text-dim p-6" role="status">Chargement de l'élection…</p>}>
            <ElectionManager formId={def.id} />
          </Suspense>
        )}
        {tab === 'reponses' && ResponsesAdmin && (
          <Suspense fallback={<p className="text-sm text-dim p-6" role="status">Chargement des réponses…</p>}>
            <ResponsesAdmin def={def} />
          </Suspense>
        )}
      </div>

      {showHistory && <HistoryModal formId={formId} canWrite={canWrite} onClose={() => setShowHistory(false)} />}
      {share && <ShareModal def={def} mode={share} onClose={() => setShare(null)} />}
    </div>
  );
}
