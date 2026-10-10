// Liste des formulaires : cartes, recherche, filtres, actions.
import { useMemo, useState, useId } from 'react';
import {
  Plus, Search, ClipboardList, Copy, Archive, ArchiveRestore, Trash2, Link2, QrCode, Code2, FolderOpen, MoreVertical, Download,
} from 'lucide-react';
import { useFormsStore, hasUnpublishedChanges } from './store.js';
import { FORM_KINDS } from '../../forms/schema.js';
import { useCan } from '../../core/permissions.js';
import { navigate } from '../../core/router.js';
import { toast } from '../../components/ui/toastStore.js';
import { confirmDialog } from '../../components/ui/confirmStore.js';
import { STATUS_META, relativeTime, copyText, downloadJson, exportEnvelope } from './utils.js';
import { publicLink } from './integrations.js';
import NewFormModal from './NewFormModal.jsx';
import ShareModal from './ShareModal.jsx';

const KIND_LABEL = Object.fromEntries(FORM_KINDS.map(k => [k.id, k.label]));

export default function FormList() {
  const uid = useId();
  const definitions = useFormsStore(s => s.definitions);
  const publications = useFormsStore(s => s.publications);
  const canWrite = useCan('forms', 'write');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('active');
  const [creating, setCreating] = useState(false);
  const [share, setShare] = useState(null); // { def, mode }

  const all = useMemo(() => Object.values(definitions).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))), [definitions]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter(d => {
      if (kind && d.kind !== kind) return false;
      if (status === 'active' && d.status === 'archived') return false;
      if (status && status !== 'active' && d.status !== status) return false;
      if (needle && !`${d.title} ${d.description || ''} ${d.slug}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [all, q, kind, status]);

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">Formulaires</h1>
          <p className="text-sm text-dim">Inscriptions, candidatures, votes, enquêtes… conçus ici, publiés en lien court.</p>
        </div>
        {canWrite && (
          <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
            <Plus size={16} aria-hidden="true" /> Nouveau formulaire
          </button>
        )}
      </header>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <label htmlFor={`${uid}-q`} className="sr-only">Rechercher un formulaire</label>
          <input id={`${uid}-q`} className="input pl-9" placeholder="Rechercher par titre ou lien…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <label htmlFor={`${uid}-k`} className="sr-only">Type</label>
        <select id={`${uid}-k`} className="input sm:w-56" value={kind} onChange={e => setKind(e.target.value)}>
          <option value="">Tous les types</option>
          {FORM_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
        </select>
        <label htmlFor={`${uid}-s`} className="sr-only">Statut</label>
        <select id={`${uid}-s`} className="input sm:w-44" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="active">Actifs</option>
          <option value="">Tous les statuts</option>
          {Object.entries(STATUS_META).map(([id, m]) => <option key={id} value={id}>{m.label}</option>)}
        </select>
      </div>

      {list.length === 0 ? (
        <div className="bg-surface border border-line rounded-2xl p-10 text-center space-y-3">
          <ClipboardList size={36} className="mx-auto text-muted" aria-hidden="true" />
          {all.length === 0 ? (
            <>
              <h2 className="font-semibold text-ink">Aucun formulaire pour l'instant</h2>
              <p className="text-sm text-dim max-w-md mx-auto">Pars d'un modèle professionnel (inscription, candidature au bureau, vote d'AG…) ou d'une page blanche.</p>
              {canWrite && <button type="button" className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} aria-hidden="true" /> Créer mon premier formulaire</button>}
            </>
          ) : (
            <p className="text-sm text-dim">Aucun formulaire ne correspond à ces filtres.</p>
          )}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map(d => (
            <FormCard key={d.id} def={d} publication={publications[d.id]} onShare={mode => setShare({ id: d.id, mode })} />
          ))}
        </ul>
      )}

      <NewFormModal isOpen={creating} onClose={() => setCreating(false)} />
      {share && definitions[share.id] && (
        <ShareModal def={definitions[share.id]} mode={share.mode} onClose={() => setShare(null)} />
      )}
    </div>
  );
}

function FormCard({ def, publication, onShare }) {
  const canWrite = useCan('forms', 'write');
  const canManage = useCan('forms', 'manage');
  const duplicateForm = useFormsStore(s => s.duplicateForm);
  const setArchived = useFormsStore(s => s.setArchived);
  const deleteForm = useFormsStore(s => s.deleteForm);
  const [menu, setMenu] = useState(false);
  const meta = STATUS_META[def.status] || STATUS_META.draft;
  const dirty = hasUnpublishedChanges(def, publication);
  const questions = useMemo(() => {
    let n = 0;
    const walk = items => (items || []).forEach(it => {
      if (it.kind === 'question') n++;
      if (it.kind === 'section') walk(it.items);
      if (it.kind === 'columns') (it.columns || []).forEach(walk);
    });
    def.pages.forEach(p => walk(p.items));
    return n;
  }, [def.pages]);

  const copyLink = async () => {
    const ok = await copyText(publicLink(def.slug));
    if (ok) toast.success('Lien copié', `/#/f/${def.slug}`);
    else toast.error('Copie impossible', 'Sélectionne le lien manuellement.');
    setMenu(false);
  };
  const duplicate = () => {
    const id = duplicateForm(def.id);
    toast.success('Formulaire dupliqué', 'La copie est un brouillon indépendant.');
    setMenu(false);
    if (id) navigate('forms', id);
  };
  const archive = async () => {
    setMenu(false);
    const archived = def.status !== 'archived';
    if (archived && def.status === 'published' && !(await confirmDialog({
      title: 'Archiver ce formulaire ?',
      message: 'Il disparaît de la liste active. Pense à le fermer côté serveur s\'il reçoit encore des réponses.',
      confirmLabel: 'Archiver', tone: 'warning',
    }))) return;
    setArchived(def.id, archived);
    toast.success(archived ? 'Formulaire archivé' : 'Formulaire désarchivé');
  };
  const remove = async () => {
    setMenu(false);
    const ok = await confirmDialog({
      title: `Supprimer « ${def.title} » ?`,
      message: 'Le brouillon et son historique seront supprimés de cet espace. Les versions déjà publiées et leurs réponses restent sur le serveur.',
      confirmLabel: 'Supprimer définitivement', tone: 'danger', requireWord: 'SUPPRIMER',
    });
    if (!ok) return;
    deleteForm(def.id);
    toast.success('Formulaire supprimé');
  };
  const exportJson = () => {
    downloadJson(`formulaire-${def.slug}.json`, exportEnvelope(def));
    toast.success('Export JSON téléchargé', 'Usage interne : définition sans réponses.');
    setMenu(false);
  };

  return (
    <li className="bg-surface border border-line rounded-2xl p-4 flex flex-col gap-3 hover:border-line-strong transition-colors">
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={() => navigate('forms', def.id)} className="text-left min-w-0 flex-1 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60">
          <h2 className="font-semibold text-ink truncate">{def.title || 'Sans titre'}</h2>
          <p className="text-xs text-dim mt-0.5">{KIND_LABEL[def.kind] || 'Formulaire'} · {questions} question{questions > 1 ? 's' : ''} · {def.pages.length} page{def.pages.length > 1 ? 's' : ''}</p>
        </button>
        <div className="relative shrink-0">
          <button type="button" className="btn-ghost !p-1.5" aria-label={`Actions pour ${def.title}`} aria-expanded={menu} aria-haspopup="menu" onClick={() => setMenu(m => !m)}>
            <MoreVertical size={16} aria-hidden="true" />
          </button>
          {menu && (
            <div role="menu" className="absolute right-0 top-full mt-1 z-20 w-56 bg-surface border border-line rounded-xl shadow-xl p-1" onKeyDown={e => { if (e.key === 'Escape') setMenu(false); }}>
              <MenuItem icon={FolderOpen} onClick={() => navigate('forms', def.id)}>Ouvrir</MenuItem>
              {canWrite && <MenuItem icon={Copy} onClick={duplicate}>Dupliquer</MenuItem>}
              <MenuItem icon={Link2} onClick={copyLink}>Copier le lien</MenuItem>
              <MenuItem icon={QrCode} onClick={() => { setMenu(false); onShare('qr'); }}>QR code du lien</MenuItem>
              <MenuItem icon={Code2} onClick={() => { setMenu(false); onShare('embed'); }}>Code d'intégration</MenuItem>
              <MenuItem icon={Download} onClick={exportJson}>Exporter (JSON)</MenuItem>
              {canWrite && <MenuItem icon={def.status === 'archived' ? ArchiveRestore : Archive} onClick={archive}>{def.status === 'archived' ? 'Désarchiver' : 'Archiver'}</MenuItem>}
              {canManage && <MenuItem icon={Trash2} danger onClick={remove}>Supprimer…</MenuItem>}
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`badge ${meta.badge}`}>{meta.label}</span>
        {def.publishedVersion ? <span className="badge badge-brand">v{def.publishedVersion} publiée</span> : null}
        {dirty && <span className="badge badge-amber">Modifications non publiées</span>}
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 text-xs text-muted">
        <button type="button" onClick={copyLink} className="font-mono truncate hover:text-ink rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60" title="Copier le lien">
          /#/f/{def.slug}
        </button>
        <span className="shrink-0">modifié {relativeTime(def.updatedAt)}</span>
      </div>
    </li>
  );
}

function MenuItem({ icon: Icon, children, onClick, danger }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg text-left focus:outline-none focus-visible:bg-elevated hover:bg-elevated ${danger ? 'text-red-600 dark:text-red-400' : 'text-ink'}`}
    >
      <Icon size={15} aria-hidden="true" /> {children}
    </button>
  );
}
