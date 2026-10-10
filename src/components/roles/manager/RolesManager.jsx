// ============================================================
// GESTION DES RÔLES — pôles, rôles et niveaux du BDE (no-code)
// ============================================================
// Tout est lu via les hooks (useCatalog, useRoleUsage) : organigramme,
// moteur et fiches membres se mettent à jour immédiatement. Aucune copie
// locale du catalogue, hormis les brouillons de formulaires.
//
// Disposition :
//  - ordinateur (≥1024px) : 3 colonnes Pôles | Rôles | Détail ;
//  - tablette (≥768px)    : 2 colonnes + détail en tiroir ;
//  - mobile               : pas-à-pas Pôles → Rôles → Détail avec retour.
import { useId, useMemo, useState } from 'react';
import { Redo2, Settings2, Undo2, X, MousePointerClick } from 'lucide-react';
import { useStore } from '../../../store.js';
import { useCatalog } from '../../../core/useCatalog.js';
import { confirmDialog } from '../../ui/confirmStore';
import { toast } from '../../ui/toastStore';
import { catalogTotals, plural, poleSummaries } from './helpers.js';
import { useLayoutMode } from './hooks.js';
import { useRoleUsage } from './useRoleUsage.js';
import { FOCUS_RING } from './constants.js';
import { FullscreenShell, DetailDrawer } from './Shells.jsx';
import CatalogToolbar from './CatalogToolbar.jsx';
import PolesPanel from './PolesPanel.jsx';
import RolesPanel from './RolesPanel.jsx';
import RoleDetail from './RoleDetail.jsx';
import LevelsPanel from './LevelsPanel.jsx';
import PoleDialog from './PoleDialog.jsx';
import RoleDialog from './RoleDialog.jsx';
import DeleteRoleDialog from './DeleteRoleDialog.jsx';
import BlockedDialog from './BlockedDialog.jsx';
import { EmptyState, IconButton } from './ui.jsx';

const VIEWS = [
  { id: 'catalog', label: 'Pôles & rôles' },
  { id: 'levels', label: 'Niveaux' },
];

/** Boutons Annuler / Rétablir (utiles en plein écran, où l'en-tête de l'app est masqué). */
function UndoRedo() {
  const canUndo = useStore(s => s._history.past.length > 0);
  const canRedo = useStore(s => s._history.future.length > 0);
  return (
    <div className="flex items-center gap-0.5">
      <IconButton label="Annuler la dernière modification (Ctrl+Z)" disabled={!canUndo} onClick={() => useStore.getState().undo()}>
        <Undo2 size={16} aria-hidden="true" />
      </IconButton>
      <IconButton label="Rétablir (Ctrl+Maj+Z)" disabled={!canRedo} onClick={() => useStore.getState().redo()}>
        <Redo2 size={16} aria-hidden="true" />
      </IconButton>
    </div>
  );
}

function ViewTabs({ view, onChange, idPrefix }) {
  const onKeyDown = (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = VIEWS.findIndex(v => v.id === view);
    const next = VIEWS[(i + (e.key === 'ArrowRight' ? 1 : -1) + VIEWS.length) % VIEWS.length];
    onChange(next.id);
    document.getElementById(`${idPrefix}-tab-${next.id}`)?.focus();
  };
  return (
    <div role="tablist" aria-label="Sections de la gestion des rôles" onKeyDown={onKeyDown} className="inline-flex bg-elevated p-0.5 rounded-lg border border-line">
      {VIEWS.map(v => (
        <button
          key={v.id}
          id={`${idPrefix}-tab-${v.id}`}
          type="button"
          role="tab"
          aria-selected={view === v.id}
          aria-controls={`${idPrefix}-panel`}
          tabIndex={view === v.id ? 0 : -1}
          onClick={() => onChange(v.id)}
          className={`px-3 min-h-[36px] rounded-md text-xs font-medium ${FOCUS_RING} ${view === v.id ? 'bg-surface text-ink shadow-sm' : 'text-dim hover:text-ink'}`}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}

function ManagerBody({ variant, onClose, titleId }) {
  const catalog = useCatalog();
  const usage = useRoleUsage();
  const layout = useLayoutMode();
  const uid = useId();
  const detailTitleId = `${uid}-detail-title`;

  const [view, setView] = useState('catalog');
  const [poleFilter, setPoleFilter] = useState('all');
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  // Étape du parcours mobile / ouverture du tiroir tablette.
  const [step, setStep] = useState('poles'); // 'poles' | 'roles' | 'detail'
  const [dialog, setDialog] = useState(null);

  const { poles, roles, poleList, rolesByPole } = catalog;
  const totals = useMemo(() => catalogTotals(catalog), [catalog]);
  const summaries = useMemo(() => poleSummaries(rolesByPole), [rolesByPole]);

  // Valeurs dérivées robustes (pôle/rôle supprimés, annulation…) : pas d'effet.
  const effectivePole = poleFilter !== 'all' && poles[poleFilter] ? poleFilter : 'all';
  const selectedRole = selectedRoleId ? roles[selectedRoleId] || null : null;
  const effectiveStep = step === 'detail' && !selectedRole ? 'roles' : step;

  const selectPole = (id) => { setPoleFilter(id); setStep('roles'); };
  const openRole = (id) => { setSelectedRoleId(id); setStep('detail'); };
  const closeDetail = () => setStep('roles');

  const duplicateRole = (role) => {
    const res = useStore.getState().duplicateRole(role.id);
    if (!res.ok) { toast.error(res.error); return; }
    const st = useStore.getState();
    const presetNote = st.rolePresets[res.id] ? 'Preset Drive copié. ' : '';
    toast.success('Rôle dupliqué', `« ${st.roles[res.id]?.label || role.label} ». ${presetNote}Les alias ne sont pas copiés (ils doivent rester uniques).`);
    openRole(res.id);
  };

  const deletePole = async (pole) => {
    const attached = rolesByPole[pole.id] || [];
    if (attached.length > 0) {
      setDialog({
        type: 'blocked',
        title: `Impossible de supprimer « ${pole.label} »`,
        message: `${plural(attached.length, 'rôle est encore rattaché', 'rôles sont encore rattachés')} à ce pôle. Déplace-les vers un autre pôle (dans leur détail) ou supprime-les d'abord.`,
        items: attached.map(r => r.label),
        actionLabel: 'Voir les rôles du pôle',
        onAction: () => selectPole(pole.id),
      });
      return;
    }
    if (poleList.length <= 1) { toast.error('Le catalogue doit contenir au moins un pôle.'); return; }
    const ok = await confirmDialog({
      title: `Supprimer le pôle « ${pole.label} » ?`,
      message: 'Ce pôle ne contient aucun rôle. Tu pourras annuler avec Ctrl+Z.',
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
    if (!ok) return;
    const res = useStore.getState().deletePole(pole.id);
    if (res.ok) toast.success(`Pôle « ${pole.label} » supprimé`);
    else toast.error(res.error);
  };

  const panelProps = {
    poles: (
      <PolesPanel
        poleList={poleList}
        summaries={summaries}
        totals={totals}
        selected={effectivePole}
        onSelect={selectPole}
        onCreate={() => setDialog({ type: 'pole', pole: null })}
        onEdit={(pole) => setDialog({ type: 'pole', pole })}
        onDelete={deletePole}
      />
    ),
    roles: (
      <RolesPanel
        poleFilter={effectivePole}
        catalog={catalog}
        usage={usage}
        selectedRoleId={selectedRole?.id || null}
        onOpenRole={openRole}
        onCreate={(poleId) => setDialog({ type: 'role', poleId })}
        onDuplicate={duplicateRole}
        onDelete={(role) => setDialog({ type: 'deleteRole', roleId: role.id })}
        onBack={layout === 'mobile' ? () => setStep('poles') : undefined}
      />
    ),
  };

  const detail = selectedRole && (
    <RoleDetail
      key={selectedRole.id}
      role={selectedRole}
      catalog={catalog}
      usage={usage}
      titleId={detailTitleId}
      onDuplicate={duplicateRole}
      onDelete={(role) => setDialog({ type: 'deleteRole', roleId: role.id })}
      onClose={layout === 'desktop' ? undefined : closeDetail}
      closeMode={layout === 'mobile' ? 'back' : 'close'}
    />
  );

  // Hauteur des colonnes : en plein écran elles occupent l'espace restant ;
  // en mode page, une hauteur fixe garde chaque colonne défilable seule.
  const gridHeight = variant === 'fullscreen' ? 'flex-1 min-h-0' : 'h-[calc(100vh-15rem)] min-h-[480px]';

  let content;
  if (view === 'levels') {
    content = <div className={layout === 'mobile' ? '' : gridHeight}><LevelsPanel catalog={catalog} /></div>;
  } else if (layout === 'desktop') {
    content = (
      <div className={`grid gap-3 grid-cols-[minmax(240px,280px)_minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1.15fr)_minmax(0,1fr)] ${gridHeight}`}>
        {panelProps.poles}
        {panelProps.roles}
        <div className="card flex flex-col min-h-0 h-full" aria-labelledby={selectedRole ? detailTitleId : undefined} role="region">
          {detail || (
            <EmptyState icon={MousePointerClick} title="Aucun rôle sélectionné">
              Choisis un rôle dans la liste pour le modifier et voir qui l'occupe, qui le demande et ses permissions Drive.
            </EmptyState>
          )}
        </div>
      </div>
    );
  } else if (layout === 'tablet') {
    content = (
      <>
        <div className={`grid gap-3 grid-cols-[240px_minmax(0,1fr)] ${gridHeight}`}>
          {panelProps.poles}
          {panelProps.roles}
        </div>
        {effectiveStep === 'detail' && selectedRole && (
          <DetailDrawer onClose={closeDetail} labelledBy={detailTitleId}>{detail}</DetailDrawer>
        )}
      </>
    );
  } else {
    // Mobile : une seule colonne à la fois.
    content = (
      <div className={variant === 'fullscreen' ? 'flex-1 min-h-0 flex flex-col' : 'min-h-[60vh] flex flex-col'}>
        <nav aria-label="Étapes" className="mb-2">
          <ol className="flex items-center gap-1 text-[11px] text-dim">
            {[['poles', 'Pôles'], ['roles', 'Rôles'], ['detail', 'Détail']].map(([id, label], i) => (
              <li key={id} className="flex items-center gap-1">
                {i > 0 && <span aria-hidden="true">›</span>}
                <span aria-current={effectiveStep === id ? 'step' : undefined} className={effectiveStep === id ? 'text-ink font-semibold' : ''}>{label}</span>
              </li>
            ))}
          </ol>
        </nav>
        <div className="flex-1 min-h-0 flex flex-col">
          {effectiveStep === 'poles' && panelProps.poles}
          {effectiveStep === 'roles' && panelProps.roles}
          {effectiveStep === 'detail' && <div className="card flex flex-col min-h-0 flex-1">{detail}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-3 ${variant === 'fullscreen' ? 'h-full min-h-0 p-3 sm:p-4 overflow-y-auto lg:overflow-hidden' : ''}`}>
      <header className="flex flex-wrap items-center gap-3 shrink-0">
        <div className="flex items-center gap-3 mr-auto min-w-0">
          <div className="bg-blue-500/10 p-2.5 rounded-xl shrink-0">
            <Settings2 size={20} className="text-blue-500" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-ink">Gestion des rôles</h2>
            <p className="text-xs text-dim">
              Les changements s'appliquent partout immédiatement · Ctrl+Z pour annuler
            </p>
          </div>
        </div>
        <ViewTabs view={view} onChange={setView} idPrefix={uid} />
        {variant === 'fullscreen' && (
          <div className="flex items-center gap-1">
            <UndoRedo />
            <IconButton label="Fermer la gestion des rôles" onClick={onClose}><X size={18} aria-hidden="true" /></IconButton>
          </div>
        )}
      </header>

      <div className="shrink-0">
        <CatalogToolbar totals={totals} />
      </div>

      <div
        id={`${uid}-panel`}
        role="tabpanel"
        aria-labelledby={`${uid}-tab-${view}`}
        className={variant === 'fullscreen' || layout !== 'mobile' ? 'flex flex-col min-h-0 flex-1' : ''}
      >
        {content}
      </div>

      {dialog?.type === 'pole' && (
        <PoleDialog pole={dialog.pole} onClose={() => setDialog(null)} onSaved={(id) => setPoleFilter(id)} />
      )}
      {dialog?.type === 'role' && (
        <RoleDialog defaultPole={dialog.poleId} onClose={() => setDialog(null)} onCreated={openRole} />
      )}
      {dialog?.type === 'deleteRole' && roles[dialog.roleId] && (
        <DeleteRoleDialog
          role={roles[dialog.roleId]}
          usage={usage}
          onClose={() => setDialog(null)}
          onDeleted={() => setStep('roles')}
        />
      )}
      {dialog?.type === 'blocked' && (
        <BlockedDialog
          title={dialog.title}
          message={dialog.message}
          items={dialog.items}
          actionLabel={dialog.actionLabel}
          onAction={dialog.onAction}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

/**
 * Gestionnaire du catalogue des rôles.
 * @param {{ variant?: 'page' | 'fullscreen', onClose?: () => void }} props
 *  - 'page'       : rendu dans un onglet ;
 *  - 'fullscreen' : panneau plein écran (dialogue modal, Échap ferme).
 */
export default function RolesManager({ variant = 'page', onClose }) {
  const titleId = useId();
  if (variant === 'fullscreen') {
    return (
      <FullscreenShell onClose={onClose} labelledBy={titleId}>
        <ManagerBody variant="fullscreen" onClose={onClose} titleId={titleId} />
      </FullscreenShell>
    );
  }
  return <ManagerBody variant="page" titleId={titleId} />;
}
