import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { BookOpen, Building2, FileText, ListTodo, Sparkles } from 'lucide-react';
import { useStore } from '../../store';
import { useCatalog } from '../../core/useCatalog';
import { useDocumentContext } from '../../documents/useDocumentContext';
import { TEMPLATES, getTemplate, collectSuggestions } from '../../documents/registry';
import { toast } from '../ui/toastStore';
import TemplateGallery from './TemplateGallery';
import Generator from './Generator';
import SuggestionsPanel from './SuggestionsPanel';
import RegistryPanel from './RegistryPanel';
import OrganizationProfileModal from './OrganizationProfileModal';
import {
  builtinSuggestions, mergeSuggestions, profileCompleteness, suggestionKey, suggestionToSession,
} from './studioHelpers';

// ============================================================
// STUDIO DOCUMENTS — racine de l'onglet « Documents »
// ============================================================
// Navigation : sous-onglets Créer / À faire / Registre (mémorisés), et
// générateur ouvert « comme une page » : #/documents/<modèle> (bouton
// Retour du navigateur, lien direct, rechargement).

const TAB_KEY = 'bde.documents.tab';
const DISMISSED_KEY = 'bde.documents.dismissedSuggestions';
const TABS = [
  { id: 'create', label: 'Créer', icon: Sparkles },
  { id: 'todo', label: 'À faire', icon: ListTodo },
  { id: 'registry', label: 'Registre', icon: BookOpen },
];

const readTab = () => {
  try {
    const v = localStorage.getItem(TAB_KEY);
    return TABS.some(t => t.id === v) ? v : 'create';
  } catch { return 'create'; }
};
const readDismissed = () => {
  try {
    const v = JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]');
    return Array.isArray(v) ? v.filter(x => typeof x === 'string') : [];
  } catch { return []; }
};
const writeStorage = (key, value) => {
  try { localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)); } catch { /* stockage indisponible : préférence non mémorisée */ }
};

/** Id du modèle présent dans l'URL (#/documents/<id>), sinon null. */
function templateIdFromHash() {
  const parts = window.location.hash.replace(/^#\/?/, '').split('/');
  if (parts[0] !== 'documents' || !parts[1]) return null;
  try { return decodeURIComponent(parts[1]); } catch { return null; }
}

let sessionSeq = 0;
const newSession = (init) => ({ ...init, key: `s${++sessionSeq}` });

export default function DocumentsStudio() {
  const uid = useId();
  const ctx = useDocumentContext();
  const catalog = useCatalog();
  const organization = useStore(s => s.organization);
  const members = useStore(s => s.members);
  const documentLog = useStore(s => s.documentLog);
  const removeDocumentLogEntry = useStore(s => s.removeDocumentLogEntry);

  const [tab, setTab] = useState(readTab);
  const [session, setSession] = useState(() => {
    const id = templateIdFromHash();
    return id && getTemplate(id) ? newSession({ templateId: id }) : null;
  });
  const [profile, setProfile] = useState(null); // { field } | null
  const [dismissed, setDismissed] = useState(readDismissed);
  const tabRefs = useRef({});

  // ── Navigation générateur ⇄ galerie (historique du navigateur) ──
  useEffect(() => {
    const onPop = () => {
      const id = templateIdFromHash();
      setSession(cur => {
        if (!id) return null;
        if (cur?.templateId === id) return cur;
        return getTemplate(id) ? newSession({ templateId: id }) : null;
      });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const openGenerator = useCallback((init) => {
    setSession(newSession(init));
    const target = `#/documents/${encodeURIComponent(init.templateId)}`;
    if (window.location.hash !== target) window.history.pushState({ bdeDocuments: true }, '', target);
    window.scrollTo({ top: 0 });
  }, []);

  const closeGenerator = useCallback(() => {
    if (window.history.state?.bdeDocuments) {
      window.history.back(); // → popstate ferme le générateur
    } else {
      setSession(null);
      window.history.replaceState(null, '', '#/documents');
    }
  }, []);

  const selectTab = (id) => {
    setTab(id);
    writeStorage(TAB_KEY, id);
  };

  // Tablist : flèches gauche / droite, Début / Fin.
  const onTabKey = (e) => {
    const i = TABS.findIndex(t => t.id === tab);
    let next = null;
    if (e.key === 'ArrowRight') next = TABS[(i + 1) % TABS.length];
    else if (e.key === 'ArrowLeft') next = TABS[(i - 1 + TABS.length) % TABS.length];
    else if (e.key === 'Home') next = TABS[0];
    else if (e.key === 'End') next = TABS.at(-1);
    if (!next) return;
    e.preventDefault();
    selectTab(next.id);
    tabRefs.current[next.id]?.focus();
  };

  // ── Profil & suggestions ──
  const completeness = useMemo(() => profileCompleteness(organization, members), [organization, members]);
  const allSuggestions = useMemo(
    () => mergeSuggestions(builtinSuggestions(completeness), collectSuggestions(ctx)),
    [completeness, ctx],
  );
  const dismissedSet = useMemo(() => new Set(dismissed), [dismissed]);
  const suggestions = useMemo(() => allSuggestions.filter(s => !dismissedSet.has(suggestionKey(s))), [allSuggestions, dismissedSet]);
  const dismissedCount = allSuggestions.length - suggestions.length;

  const dismiss = (key) => {
    const next = [...new Set([...dismissed, key])].slice(-300);
    setDismissed(next);
    writeStorage(DISMISSED_KEY, next);
    toast.info('Suggestion masquée', 'Tu peux la réafficher en bas de la liste.');
  };
  const restoreDismissed = () => {
    setDismissed([]);
    writeStorage(DISMISSED_KEY, []);
  };

  const membersById = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);

  const prepare = (s) => {
    const template = getTemplate(s.templateId);
    const init = suggestionToSession(s, template, members);
    if (!init) { toast.error('Modèle introuvable', s.templateId); return; }
    openGenerator(init);
  };
  const runBuiltin = (s) => {
    if (s.action?.type === 'profile') setProfile({ field: s.action.field || null });
    else if (s.action?.type === 'navigate') window.location.hash = s.action.hash.replace(/^#/, '');
  };

  const regenerate = (entry) => {
    const template = getTemplate(entry.templateId);
    if (!template) { toast.error('Modèle introuvable', 'Ce modèle n\'existe plus dans l\'application.'); return; }
    openGenerator({
      templateId: template.id,
      memberIds: entry.memberIds || [],
      values: entry.values && typeof entry.values === 'object' ? entry.values : {},
      origin: { type: 'registry', ref: entry.ref, date: entry.createdAt },
    });
  };

  const openProfile = useCallback((field = null) => setProfile({ field }), []);
  const showRegistry = useCallback(() => { setTab('registry'); writeStorage(TAB_KEY, 'registry'); closeGenerator(); }, [closeGenerator]);

  const profileModal = profile && (
    <OrganizationProfileModal focusField={profile.field} onClose={() => setProfile(null)} />
  );

  if (session) {
    return (
      <>
        <Generator key={session.key} session={session} ctx={ctx} onClose={closeGenerator} onOpenProfile={openProfile} onShowRegistry={showRegistry} />
        {profileModal}
      </>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* En-tête */}
      <header className="relative overflow-hidden rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-gradient-to-br from-blue-500/20 via-violet-500/10 to-transparent blur-2xl" aria-hidden="true" />
        <div className="relative flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <PaperStack />
            <div className="min-w-0">
              <h2 className="text-xl font-black tracking-tight text-ink">Studio documents</h2>
              <p className="text-sm text-dim mt-0.5">
                Attestations, procès-verbaux, conventions, RGPD… générés à partir de tes données, numérotés et vérifiables.
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="badge badge-neutral"><FileText size={10} aria-hidden="true" /> {TEMPLATES.length} modèle{TEMPLATES.length > 1 ? 's' : ''}</span>
                <span className="badge badge-neutral"><BookOpen size={10} aria-hidden="true" /> {documentLog.length} émis</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => openProfile(completeness.missing[0]?.key || null)}
              className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-elevated text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
              aria-label={`Profil complet à ${completeness.percent} %${completeness.missing.length ? `. Manquant : ${completeness.missing.map(m => m.label).join(', ')}` : ''}`}
              title={completeness.missing.length ? `À compléter : ${completeness.missing.map(m => m.label).join(', ')}` : 'Profil complet'}
            >
              <CompletenessRing percent={completeness.percent} />
              <span className="hidden sm:block">
                <span className="block text-xs font-semibold text-ink">Profil {completeness.percent === 100 ? 'complet' : `${completeness.done}/${completeness.total}`}</span>
                <span className="block text-[11px] text-dim">{completeness.missing.length ? `${completeness.missing.length} élément${completeness.missing.length > 1 ? 's' : ''} manquant${completeness.missing.length > 1 ? 's' : ''}` : 'Prêt pour les documents'}</span>
              </span>
            </button>
            <button type="button" className="btn-secondary" onClick={() => openProfile(null)}>
              <Building2 size={15} aria-hidden="true" /> <span>Profil de l'association</span>
            </button>
          </div>
        </div>
      </header>

      {/* Sous-navigation */}
      <div role="tablist" aria-label="Studio documents" onKeyDown={onTabKey}
        className="flex bg-elevated p-0.5 rounded-lg border border-line w-full sm:w-fit max-w-full overflow-x-auto">
        {TABS.map(t => {
          const active = tab === t.id;
          const count = t.id === 'todo' ? suggestions.length : t.id === 'registry' ? documentLog.length : 0;
          return (
            <button
              key={t.id}
              ref={el => { tabRefs.current[t.id] = el; }}
              id={`${uid}-tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`${uid}-panel-${t.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => selectTab(t.id)}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${
                active ? 'bg-surface text-ink shadow-sm' : 'text-dim hover:text-ink'}`}
            >
              <t.icon size={14} aria-hidden="true" /> {t.label}
              {count > 0 && (
                <span className={`min-w-[18px] px-1 rounded-full text-[10px] font-bold tabular-nums ${
                  t.id === 'todo' ? 'bg-red-500 text-white' : 'bg-line text-dim'}`}>
                  {count}<span className="sr-only">{t.id === 'todo' ? ' suggestions' : ' documents'}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div id={`${uid}-panel-${tab}`} role="tabpanel" aria-labelledby={`${uid}-tab-${tab}`} tabIndex={-1} className="focus:outline-none">
        {tab === 'create' && (
          <TemplateGallery templates={TEMPLATES} organization={ctx.organization} documentLog={documentLog}
            onOpen={(t) => openGenerator({ templateId: t.id })} />
        )}
        {tab === 'todo' && (
          <SuggestionsPanel
            suggestions={suggestions}
            getTemplate={getTemplate}
            membersById={membersById}
            catalog={catalog}
            onPrepare={prepare}
            onAction={runBuiltin}
            onDismiss={dismiss}
            dismissedCount={dismissedCount}
            onRestore={restoreDismissed}
          />
        )}
        {tab === 'registry' && (
          <RegistryPanel
            documentLog={documentLog}
            templates={TEMPLATES}
            getTemplate={getTemplate}
            membersById={membersById}
            onRegenerate={regenerate}
            onRemove={removeDocumentLogEntry}
          />
        )}
      </div>

      {profileModal}
    </div>
  );
}

/** Anneau de complétude du profil (SVG). */
function CompletenessRing({ percent }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const color = percent >= 100 ? '#10b981' : percent >= 60 ? '#3b82f6' : '#f59e0b';
  return (
    <span className="relative h-11 w-11 shrink-0" aria-hidden="true">
      <svg viewBox="0 0 44 44" className="h-11 w-11 -rotate-90">
        <circle cx="22" cy="22" r={r} fill="none" strokeWidth="4" className="stroke-line" />
        <circle cx="22" cy="22" r={r} fill="none" strokeWidth="4" stroke={color} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(100, percent)) / 100)}
          style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(0.16,1,0.3,1)' }} />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[10px] font-bold text-ink tabular-nums">{percent}%</span>
    </span>
  );
}

/** Pile de feuilles décorative (identité du studio). */
function PaperStack() {
  return (
    <span className="relative h-12 w-11 shrink-0 hidden xs:block sm:block" aria-hidden="true">
      <span className="absolute inset-0 translate-x-1.5 translate-y-1 rotate-6 rounded-md bg-violet-500/25" />
      <span className="absolute inset-0 translate-x-0.5 rotate-2 rounded-md bg-blue-500/30" />
      <span className="absolute inset-0 rounded-md bg-white border border-black/10 shadow-sm p-1.5 space-y-1">
        <span className="block h-1 w-5 rounded bg-blue-500" />
        <span className="block h-0.5 w-full rounded bg-slate-200" />
        <span className="block h-0.5 w-full rounded bg-slate-200" />
        <span className="block h-0.5 w-3/4 rounded bg-slate-200" />
        <span className="block h-0.5 w-full rounded bg-slate-200" />
      </span>
    </span>
  );
}
