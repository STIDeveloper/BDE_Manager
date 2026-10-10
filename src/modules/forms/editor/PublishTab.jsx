// ============================================================
// Onglet « Publication » : vérification, lien court, publication
// (version immuable via le serveur), statut, versions publiées.
// ============================================================
import { useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, CloudOff, Download, History, Link2, Lock, QrCode, Rocket, Unlock, RefreshCw } from 'lucide-react';
import { useCan } from '../../../core/permissions.js';
import { toast } from '../../../components/ui/toastStore.js';
import { confirmDialog } from '../../../components/ui/confirmStore.js';
import { useFormsStore, hasUnpublishedChanges, uniqueSlug } from '../store.js';
import { formsApi, useWorkspaceId, publicLink, useRendererContext, resolveSources } from '../integrations.js';
import { Panel } from '../ui.jsx';
import { formatDateTime, downloadJson, exportEnvelope, copyText } from '../utils.js';

const SLUG_RX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function IssuesList({ issues, onPick, empty = 'Aucun problème détecté : le formulaire est prêt à être publié.' }) {
  if (!issues.length) {
    return <p className="text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5"><CheckCircle2 size={15} aria-hidden="true" /> {empty}</p>;
  }
  return (
    <ul className="space-y-1">
      {issues.map((it, i) => (
        <li key={i}>
          <button type="button" onClick={() => onPick(it)}
            className="w-full text-left flex items-start gap-2 p-2 rounded-lg hover:bg-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60">
            {it.level === 'error'
              ? <AlertCircle size={15} className="text-red-600 shrink-0 mt-0.5" aria-label="Erreur" />
              : <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" aria-label="Avertissement" />}
            <span className="text-xs text-ink">{it.message}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function PublishTab({ def, issues, onPickIssue, onShare }) {
  const canManage = useCan('forms', 'manage');
  const workspaceId = useWorkspaceId();
  const rendererContext = useRendererContext();
  const definitions = useFormsStore(s => s.definitions);
  const publication = useFormsStore(s => s.publications[def.id]);
  const updateForm = useFormsStore(s => s.updateForm);
  const recordPublication = useFormsStore(s => s.recordPublication);
  const setStatus = useFormsStore(s => s.setStatus);
  const [slug, setSlug] = useState(def.slug);
  const [busy, setBusy] = useState(false);
  const [localNotice, setLocalNotice] = useState(null);
  const [remoteVersions, setRemoteVersions] = useState(null);

  const errors = issues.filter(i => i.level === 'error');
  const warnings = issues.filter(i => i.level === 'warning');
  const dirty = hasUnpublishedChanges(def, publication);
  const slugTaken = useMemo(() => Object.values(definitions).some(d => d.id !== def.id && d.slug === slug), [definitions, def.id, slug]);
  const slugError = !slug ? 'Le lien court est obligatoire.' : !SLUG_RX.test(slug) ? 'Minuscules, chiffres et tirets uniquement (ex. wei-2027).' : slug.length > 60 ? '60 caractères maximum.' : slugTaken ? 'Déjà utilisé par un autre formulaire de cet espace.' : null;
  const connected = !!(formsApi && workspaceId);

  const saveSlug = async () => {
    if (slugError || slug === def.slug) return;
    if (def.publishedVersion && !(await confirmDialog({
      title: 'Changer le lien court ?',
      message: `L'ancien lien /#/f/${def.slug} ne fonctionnera plus après la prochaine publication (QR codes imprimés, liens partagés).`,
      confirmLabel: 'Changer le lien', tone: 'warning',
    }))) { setSlug(def.slug); return; }
    updateForm(def.id, d => ({ ...d, slug }), { snapshot: 'Lien court' });
    toast.success('Lien court enregistré', `/#/f/${slug}`);
  };

  const publish = async () => {
    if (errors.length) { toast.error('Publication impossible', `${errors.length} erreur(s) à corriger d'abord.`); return; }
    if (slugError) { toast.error('Lien court invalide', slugError); return; }
    // Les choix « source » (rôles, pôles, membres, événements) sont figés à la publication.
    const toPublish = resolveSources({ ...def, slug }, rendererContext);
    if (slug !== def.slug) updateForm(def.id, d => ({ ...d, slug }), { snapshot: 'Lien court' });
    if (!formsApi || typeof formsApi.publishForm !== 'function') {
      setLocalNotice('Le service de publication n\'est pas disponible dans cette version de l\'application.');
      return;
    }
    if (!connected) {
      setLocalNotice(formsApi.LOCAL_MODE_MESSAGE || 'Connecte d\'abord un espace collaboratif pour publier.');
      return;
    }
    if (!(await confirmDialog({
      title: def.publishedVersion ? `Publier la version ${def.publishedVersion + 1} ?` : 'Publier ce formulaire ?',
      message: def.publishedVersion
        ? 'Une nouvelle version immuable est créée. Les réponses déjà reçues restent liées à leur version d\'origine.'
        : `Le formulaire sera accessible à l'adresse /#/f/${slug} selon les réglages d'accès.`,
      confirmLabel: 'Publier', tone: 'primary',
    }))) return;
    setBusy(true);
    setLocalNotice(null);
    try {
      const res = await formsApi.publishForm(toPublish);
      recordPublication(def.id, { version: res?.version ?? (def.publishedVersion || 0) + 1, serverFormId: res?.form_id, slug: res?.slug || slug });
      toast.success(`Version ${res?.version ?? ''} publiée`, `Lien : /#/f/${res?.slug || slug}`);
    } catch (err) {
      if (err?.code === 'local' || err?.code === 'missing') setLocalNotice(err.message || formsApi.LOCAL_MODE_MESSAGE);
      else toast.error('Publication échouée', String(err?.message || err));
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (status) => {
    const serverId = publication?.serverFormId;
    if (!connected || !serverId || typeof formsApi.setFormStatus !== 'function') {
      setLocalNotice(formsApi?.LOCAL_MODE_MESSAGE || 'Connecte un espace pour ouvrir ou fermer les réponses.');
      return;
    }
    setBusy(true);
    try {
      await formsApi.setFormStatus(serverId, status);
      setStatus(def.id, status);
      toast.success(status === 'closed' ? 'Réponses fermées' : 'Réponses rouvertes');
    } catch (err) {
      toast.error('Changement de statut impossible', String(err?.message || err));
    } finally { setBusy(false); }
  };

  const loadRemote = async () => {
    if (!connected || !publication?.serverFormId) return;
    setBusy(true);
    try {
      const rows = await formsApi.listFormVersions(publication.serverFormId);
      setRemoteVersions(Array.isArray(rows) ? rows : []);
    } catch (err) {
      toast.error('Versions indisponibles', String(err?.message || err));
    } finally { setBusy(false); }
  };

  const restoreVersion = async (row) => {
    if (!(await confirmDialog({ title: `Restaurer la version ${row.version} dans le brouillon ?`, message: 'Le brouillon actuel est sauvegardé dans l\'historique avant d\'être remplacé.', confirmLabel: 'Restaurer', tone: 'warning' }))) return;
    useFormsStore.getState().snapshot(def.id, 'Avant restauration d\'une version publiée');
    updateForm(def.id, d => ({ ...row.definition, id: d.id, slug: d.slug, status: d.status, publishedVersion: d.publishedVersion, createdAt: d.createdAt }), { snapshot: `Version publiée v${row.version} restaurée` });
    toast.success(`Version ${row.version} restaurée dans le brouillon`);
  };

  const exportJson = () => {
    downloadJson(`formulaire-${def.slug}.json`, exportEnvelope(def));
    toast.success('Export JSON téléchargé', 'Usage interne : définition sans réponses.');
  };

  const versions = publication?.versions || [];
  return (
    <div className="grid lg:grid-cols-2 gap-4 items-start">
      <div className="space-y-4 min-w-0">
        <Panel title="Vérification" description="Les erreurs bloquent la publication ; les avertissements sont des conseils.">
          <div className="flex gap-2 text-xs">
            <span className={`badge ${errors.length ? 'badge-rose' : 'badge-emerald'}`}>{errors.length} erreur{errors.length > 1 ? 's' : ''}</span>
            <span className={`badge ${warnings.length ? 'badge-amber' : 'badge-neutral'}`}>{warnings.length} avertissement{warnings.length > 1 ? 's' : ''}</span>
          </div>
          <IssuesList issues={issues} onPick={onPickIssue} />
        </Panel>
        <Panel title="Lien court">
          <div className="space-y-1">
            <label htmlFor="publish-slug" className="text-xs font-medium text-dim">Adresse du formulaire</label>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted font-mono shrink-0">/#/f/</span>
              <input id="publish-slug" className={`input font-mono text-sm ${slugError ? '!border-red-500' : ''}`} value={slug} aria-invalid={!!slugError}
                onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-{2,}/g, '-'))} onBlur={saveSlug} />
              <button type="button" className="btn-ghost text-xs shrink-0" onClick={() => setSlug(uniqueSlug(def.title, definitions, def.id))}>Depuis le titre</button>
            </div>
            {slugError ? <p className="text-xs text-red-600" role="alert">{slugError}</p> : <p className="text-[11px] text-muted font-mono break-all">{publicLink(slug)}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary !py-1.5 text-xs" onClick={async () => { if (await copyText(publicLink(def.slug))) toast.success('Lien copié'); }}><Link2 size={14} aria-hidden="true" /> Copier le lien</button>
            <button type="button" className="btn-secondary !py-1.5 text-xs" onClick={() => onShare('qr')}><QrCode size={14} aria-hidden="true" /> QR code</button>
            <button type="button" className="btn-secondary !py-1.5 text-xs" onClick={exportJson}><Download size={14} aria-hidden="true" /> Exporter (JSON)</button>
          </div>
        </Panel>
      </div>

      <div className="space-y-4 min-w-0">
        <Panel title="Publication">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-dim">Statut :</span>
            <span className={`badge ${def.status === 'published' ? 'badge-emerald' : def.status === 'closed' ? 'badge-amber' : 'badge-neutral'}`}>
              {def.status === 'published' ? 'Publié, ouvert' : def.status === 'closed' ? 'Publié, fermé' : def.status === 'archived' ? 'Archivé' : 'Brouillon jamais publié'}
            </span>
            {def.publishedVersion ? <span className="badge badge-brand">Version en ligne : v{def.publishedVersion}</span> : null}
            {dirty && <span className="badge badge-amber">Modifications non publiées</span>}
          </div>
          {!connected && (
            <div className="text-xs rounded-lg border border-line bg-elevated p-3 flex gap-2">
              <CloudOff size={16} className="text-dim shrink-0" aria-hidden="true" />
              <p className="text-dim">Mode local : aucun espace collaboratif n'est connecté. La publication en ligne nécessite le serveur (Équipe &amp; accès). Tu peux continuer à concevoir, prévisualiser et exporter le formulaire en JSON.</p>
            </div>
          )}
          {localNotice && (
            <div role="alert" className="text-xs rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-100 p-3 space-y-2">
              <p className="font-semibold">Publication impossible pour l'instant</p>
              <p>{localNotice}</p>
              <p>Rien n'a été publié. Exporte la définition pour la conserver ou la publier depuis un autre appareil connecté.</p>
              <button type="button" className="btn-secondary !py-1 text-xs" onClick={exportJson}><Download size={13} aria-hidden="true" /> Exporter le JSON</button>
            </div>
          )}
          {canManage ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary" disabled={busy || errors.length > 0} onClick={publish}>
                <Rocket size={15} aria-hidden="true" /> {busy ? 'Publication…' : def.publishedVersion ? (dirty ? `Publier la v${def.publishedVersion + 1}` : 'Republier') : 'Publier'}
              </button>
              {def.publishedVersion ? (
                def.status === 'closed'
                  ? <button type="button" className="btn-secondary" disabled={busy} onClick={() => changeStatus('published')}><Unlock size={15} aria-hidden="true" /> Rouvrir les réponses</button>
                  : <button type="button" className="btn-secondary" disabled={busy} onClick={() => changeStatus('closed')}><Lock size={15} aria-hidden="true" /> Fermer les réponses</button>
              ) : null}
            </div>
          ) : <p className="text-xs text-muted">La publication est réservée aux personnes ayant le droit « Formulaires : gestion ».</p>}
          {errors.length > 0 && <p className="text-[11px] text-red-600">Corrige les erreurs listées dans « Vérification » pour publier.</p>}
        </Panel>

        <Panel title="Versions publiées" description="Chaque publication fige une version : les réponses restent liées à la version à laquelle elles ont été données."
          actions={connected && publication?.serverFormId ? <button type="button" className="btn-ghost !py-1 text-xs" disabled={busy} onClick={loadRemote}><RefreshCw size={13} aria-hidden="true" /> Serveur</button> : null}>
          {remoteVersions ? (
            remoteVersions.length ? (
              <ul className="divide-y divide-line">
                {remoteVersions.map(r => (
                  <li key={r.version} className="py-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-ink">v{r.version} · {formatDateTime(r.published_at)}</span>
                    <button type="button" className="btn-ghost !py-1 text-xs" onClick={() => restoreVersion(r)}><History size={13} aria-hidden="true" /> Restaurer dans le brouillon</button>
                  </li>
                ))}
              </ul>
            ) : <p className="text-xs text-muted">Aucune version sur le serveur.</p>
          ) : versions.length ? (
            <ul className="divide-y divide-line">
              {versions.map(v => (
                <li key={v.version} className="py-2 text-xs flex items-center justify-between gap-2">
                  <span className="text-ink">v{v.version}{v.version === def.publishedVersion ? ' (en ligne)' : ''}</span>
                  <span className="text-muted">{formatDateTime(v.publishedAt)} · /f/{v.slug}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-xs text-muted">Aucune version publiée.</p>}
        </Panel>
      </div>
    </div>
  );
}
