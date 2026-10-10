import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { reserveDocumentRefsAuto } from '../../backend/documentRefs';
import {
  AlertTriangle, ArrowLeft, BookOpen, Building2, CheckCircle2, ChevronRight, Eye, History, Info, Lightbulb, Mail, Scale, SquarePen,
} from 'lucide-react';
import { useStore } from '../../store';
import { useCatalog } from '../../core/useCatalog';
import {
  getTemplate, defaultValues, missingRequirements, generateDocuments, collectWarnings,
} from '../../documents/registry';
import { DOCUMENT_CATEGORIES, applyOverrides, documentFingerprint, validateDocument, safeFileName } from '../../documents/model';
import { formatDateLong } from '../../documents/context';
import { toast } from '../ui/toastStore';
import { confirmDialog } from '../ui/confirmStore';
import FormField from './FormField';
import MemberPicker from './MemberPicker';
import PreviewPane from './PreviewPane';
import ExportBar from './ExportBar';
import { loadEngine } from './engine';
import { TemplateIcon, toneFor } from './templateIcons';
import {
  defaultDependsOnMember, defaultMemberSelection, generationValues, memberName, sortMembers,
} from './studioHelpers';
import { buildIssues, buildLogEntries, docKey, exportBaseName, refRange } from './registryHelpers';
import { useTemplates } from '../../documents/useTemplates';
import SendDialog from './SendDialog';

/** Valeur « retardée » : l'aperçu n'est régénéré qu'après une pause de frappe. */
function useDebouncedValue(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const DISCLAIMER = 'Modèles fournis à titre indicatif. Pour les actes engageants, vérifie tes statuts ou demande conseil.';

/**
 * Générateur d'un modèle : formulaire dynamique + aperçu A4 en direct +
 * export (PDF / impression / Word) avec émission au registre.
 *
 * @param {{ session: { key, templateId, memberIds?, values?, origin? }, ctx: object,
 *   onClose: ()=>void, onOpenProfile: (field?:string)=>void, onShowRegistry: ()=>void }} props
 */
export default function Generator(props) {
  useTemplates(); // modèles personnalisés : rendu à jour s'ils changent
  const template = getTemplate(props.session.templateId);
  if (!template) {
    return (
      <div className="max-w-lg mx-auto text-center py-16 space-y-4">
        <AlertTriangle size={28} className="mx-auto text-amber-500" aria-hidden="true" />
        <p className="text-ink font-semibold">Ce modèle n'existe plus.</p>
        <p className="text-sm text-dim">Il a peut-être été renommé ou retiré de l'application.</p>
        <button type="button" className="btn-secondary" onClick={props.onClose}>
          <ArrowLeft size={15} aria-hidden="true" /> Retour aux modèles
        </button>
      </div>
    );
  }
  return <GeneratorBody {...props} template={template} />;
}

function GeneratorBody({ session, ctx, template, onClose, onOpenProfile, onShowRegistry }) {
  const uid = useId();
  const catalog = useCatalog();
  const columns = useStore(s => s.columns);
  const logDocuments = useStore(s => s.logDocuments);
  const isMemberScope = template.scope === 'member';
  const members = useMemo(() => sortMembers(ctx.members), [ctx.members]);

  // ── État du formulaire (initialisé une fois : voir `key` dans le parent) ──
  const [formValues, setFormValues] = useState(() => ({ ...defaultValues(template, ctx, null), ...(session.values || {}) }));
  const [touched, setTouched] = useState(() => new Set(Object.keys(session.values || {})));
  const [initialMembers] = useState(() => {
    if (!isMemberScope) return { ids: [], lost: 0 };
    const asked = Array.isArray(session.memberIds) ? session.memberIds : [];
    if (!asked.length) return { ids: defaultMemberSelection(template, ctx), lost: 0 };
    const known = new Set(ctx.members.map(m => m.id));
    const ids = asked.filter(id => known.has(id));
    return { ids, lost: asked.length - ids.length };
  });
  const [memberIds, setMemberIds] = useState(initialMembers.ids);
  const [overrides, setOverrides] = useState({});
  const [index, setIndex] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [mobileView, setMobileView] = useState('form');
  const [showErrors, setShowErrors] = useState(false);
  const [draft, setDraft] = useState(false);
  const [busy, setBusy] = useState(null);
  const [lastIssue, setLastIssue] = useState(null);
  const [sending, setSending] = useState(false);

  const suggestedIds = useMemo(
    () => (isMemberScope && typeof template.memberFilter === 'function' ? defaultMemberSelection(template, ctx) : null),
    [isMemberScope, template, ctx],
  );

  // ── Génération (différée de 200 ms, mémoïsée) ──
  const genValues = useMemo(() => generationValues(template, formValues, touched), [template, formValues, touched]);
  // Scope « membre » : seuls les champs modifiés (ou pré-remplis) écrasent les
  // valeurs par défaut calculées pour chaque membre.
  const genOptions = useMemo(() => (isMemberScope ? { editedKeys: [...touched] } : {}), [isMemberScope, touched]);
  const liveInput = useMemo(() => ({ values: genValues, memberIds, options: genOptions }), [genValues, memberIds, genOptions]);
  const debounced = useDebouncedValue(liveInput, 200);
  const stale = debounced !== liveInput;

  const generation = useMemo(() => {
    try {
      return { docs: generateDocuments(template, ctx, debounced.values, debounced.memberIds, debounced.options), error: null };
    } catch (error) {
      return { docs: [], error };
    }
  }, [template, ctx, debounced]);
  const docs = generation.docs;
  const safeIndex = Math.min(index, Math.max(0, docs.length - 1));

  const membersById = useMemo(() => new Map(ctx.members.map(m => [m.id, m])), [ctx.members]);
  const currentMember = useMemo(() => {
    if (!isMemberScope) return null;
    const id = docs[safeIndex]?.meta?.memberIds?.[0] || memberIds[0];
    return membersById.get(id) || null;
  }, [isMemberScope, docs, safeIndex, memberIds, membersById]);

  // Valeurs réellement utilisées pour le document affiché.
  const baseDefaults = useMemo(() => defaultValues(template, ctx, currentMember), [template, ctx, currentMember]);
  const effectiveValues = useMemo(() => ({ ...baseDefaults, ...genValues }), [baseDefaults, genValues]);

  const missing = useMemo(() => missingRequirements(template, ctx, effectiveValues), [template, ctx, effectiveValues]);
  const fieldMissing = missing.filter(m => m.kind === 'field');
  const orgMissing = missing.filter(m => m.kind === 'organization');
  const warnings = useMemo(() => collectWarnings(template, ctx, genValues, currentMember), [template, ctx, genValues, currentMember]);
  const noMembers = isMemberScope && memberIds.length === 0;

  const blocked = noMembers ? 'Sélectionne au moins un membre.'
    : fieldMissing.length ? `${fieldMissing.length} champ${fieldMissing.length > 1 ? 's' : ''} obligatoire${fieldMissing.length > 1 ? 's' : ''} à compléter.`
      : orgMissing.length ? 'Profil de l\'association incomplet.' : null;

  const retouchCount = useMemo(() => Object.values(overrides).reduce((n, o) => n + Object.keys(o || {}).length, 0), [overrides]);

  const fieldDomId = useCallback((key) => `${uid}-f-${key}`, [uid]);
  const handleEdit = useCallback((key, blockId, text) => {
    setOverrides(o => ({ ...o, [key]: { ...(o[key] || {}), [blockId]: text } }));
  }, []);

  const setField = (key, value) => {
    setFormValues(prev => ({ ...prev, [key]: value }));
    setTouched(prev => (prev.has(key) ? prev : new Set(prev).add(key)));
  };
  const untouch = (key) => setTouched(prev => {
    const next = new Set(prev);
    next.delete(key);
    return next;
  });

  const docLabel = useCallback((d, i) => {
    const id = d?.meta?.memberIds?.[0];
    return id && membersById.get(id) ? memberName(membersById.get(id)) : (d?.meta?.title || `Document ${i + 1}`);
  }, [membersById]);

  const requestClose = async () => {
    if (busy) return;
    if (retouchCount > 0) {
      const ok = await confirmDialog({
        title: 'Quitter le générateur ?',
        message: retouchCount > 1
          ? `Tu as ${retouchCount} retouches de texte non exportées : elles seront perdues.`
          : 'Tu as 1 retouche de texte non exportée : elle sera perdue.',
        confirmLabel: 'Quitter',
        tone: 'warning',
      });
      if (!ok) return;
    }
    onClose();
  };

  // ── Export = émission ──
  const runExport = async (format) => {
    if (busy) return;
    if (blocked && !(draft && !noMembers)) {
      setShowErrors(true);
      setMobileView('form');
      toast.warn('Document incomplet', `${blocked} Tu peux aussi exporter un brouillon non numéroté.`);
      const first = noMembers ? null : fieldMissing[0];
      if (first) setTimeout(() => document.getElementById(fieldDomId(first.key))?.focus(), 50);
      return;
    }
    // Génération fraîche (valeurs courantes, sans attendre l'aperçu différé).
    let fresh;
    try {
      fresh = generateDocuments(template, ctx, genValues, memberIds, genOptions);
    } catch (e) {
      toast.error('Génération impossible', e?.message || String(e));
      return;
    }
    if (!fresh.length) { toast.warn('Aucun document à exporter'); return; }
    const finalDocs = fresh.map((d, i) => applyOverrides(d, overrides[docKey(d, i)]));

    const problems = finalDocs.flatMap((d, i) => validateDocument(d).map(p => (finalDocs.length > 1 ? `Document ${i + 1} : ${p}` : p)));
    if (problems.length) {
      const ok = await confirmDialog({
        title: 'Anomalies détectées',
        message: 'Certaines valeurs semblent manquantes ou incohérentes dans le document. Vérifie l\'aperçu avant de l\'émettre.',
        details: problems.slice(0, 6),
        confirmLabel: 'Exporter quand même',
        tone: 'warning',
      });
      if (!ok) return;
    }

    setBusy(format);
    let refs = [];
    try {
      const engine = await loadEngine();
      // Brouillon : pied de page explicite, sans numéro ni empreinte.
      let issues = finalDocs.map(() => ({ ref: 'BROUILLON (non émis)', fingerprint: '', issuedAt: null }));
      if (!draft) {
        const fingerprints = await Promise.all(finalDocs.map(d => documentFingerprint(d)));
        // Numéros réservés côté serveur si un espace collaboratif est connecté.
        refs = await reserveDocumentRefsAuto(finalDocs.length);
        issues = buildIssues(refs, fingerprints);
      }
      const base = safeFileName(exportBaseName(finalDocs, draft ? null : issues, template.title, draft));
      const opts = { organization: ctx.organization, issues, draft };
      if (format === 'pdf') await engine.downloadPdf(finalDocs, opts, base);
      else if (format === 'word') await engine.downloadWord(finalDocs, opts, base);
      else await engine.printDocuments(finalDocs, opts);

      if (draft) {
        toast.info('Brouillon exporté', 'Non numéroté et non inscrit au registre.');
      } else {
        const entries = logDocuments(buildLogEntries(finalDocs, issues, { templateId: template.id, values: genValues, format, fileName: base }));
        const n = finalDocs.length;
        toast.success(n > 1 ? `${n} documents émis` : 'Document émis', refRange(refs));
        setLastIssue({ refs, format, at: new Date(), entries: Array.isArray(entries) ? entries : [] });
      }
    } catch (e) {
      console.error('[Documents] export', e);
      toast.error('L\'export a échoué', `${e?.message || 'Erreur inconnue.'}${refs.length ? ' Les numéros réservés ne seront pas réutilisés.' : ''}`);
    } finally {
      setBusy(null);
    }
  };

  const tone = toneFor(template.category);
  const category = DOCUMENT_CATEGORIES.find(c => c.id === template.category);
  const origin = session.origin;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* En-tête */}
      <div className="flex items-start gap-3">
        <button type="button" onClick={requestClose} className="btn-secondary px-2.5 shrink-0" aria-label="Retour aux modèles">
          <ArrowLeft size={16} aria-hidden="true" /> <span className="hidden sm:inline">Modèles</span>
        </button>
        <div className={`h-10 w-10 rounded-xl grid place-items-center shrink-0 ${tone.tile}`} aria-hidden="true">
          <TemplateIcon name={template.icon} size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-ink leading-tight">{template.title}</h2>
          <p className="text-sm text-dim mt-0.5">{template.description}</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {category && <span className="badge badge-neutral">{category.label}</span>}
            <span className={`badge ${isMemberScope ? 'badge-brand' : 'badge-violet'}`}>{isMemberScope ? 'Un document par membre' : 'Document de l\'association'}</span>
            {template.legal?.references?.length > 0 && <span className="badge badge-emerald"><Scale size={10} aria-hidden="true" /> Légal</span>}
          </div>
        </div>
      </div>

      {origin?.type === 'registry' && (
        <Callout tone="amber" icon={History}>
          Régénéré depuis <strong className="font-mono">{origin.ref}</strong>{origin.date ? ` (émis le ${formatDateLong(origin.date)})` : ''}.
          Les données (membres, profil, rôles) ont pu changer depuis : vérifie l'aperçu. Un <strong>nouveau numéro</strong> sera attribué.
          {initialMembers.lost > 0 && ` ${initialMembers.lost} membre${initialMembers.lost > 1 ? 's ont' : ' a'} été supprimé${initialMembers.lost > 1 ? 's' : ''} depuis.`}
        </Callout>
      )}
      {origin?.type === 'suggestion' && (
        <Callout tone="blue" icon={Lightbulb}>Préparé à partir de la suggestion « {origin.label} ». Vérifie et complète avant d'émettre.</Callout>
      )}

      {/* Bascule mobile */}
      <div role="group" aria-label="Affichage" className="lg:hidden flex bg-elevated p-0.5 rounded-lg border border-line">
        {[['form', 'Formulaire', SquarePen], ['preview', `Aperçu${docs.length > 1 ? ` (${docs.length})` : ''}`, Eye]].map(([id, label, I]) => (
          <button key={id} type="button" aria-pressed={mobileView === id} onClick={() => setMobileView(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${
              mobileView === id ? 'bg-surface text-ink shadow-sm' : 'text-dim'}`}>
            <I size={15} aria-hidden="true" /> {label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-start">
        {/* ── Formulaire ── */}
        <section aria-label="Formulaire" className={`space-y-4 min-w-0 ${mobileView === 'form' ? '' : 'hidden lg:block'}`}>
          {orgMissing.length > 0 && (
            <div role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/[0.06] p-3.5">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Building2 size={16} className="text-red-500" aria-hidden="true" /> Profil de l'association incomplet
              </p>
              <p className="text-xs text-dim mt-1">Ce document a besoin de ces informations (en-tête, mentions légales) :</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {orgMissing.map(m => (
                  <button key={m.key} type="button" onClick={() => onOpenProfile(m.key)}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-surface px-2.5 py-1 text-xs font-medium text-ink hover:border-red-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60">
                    {m.label} <ChevronRight size={12} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {isMemberScope && (
            <MemberPicker members={members} selected={memberIds} onChange={setMemberIds} catalog={catalog} columns={columns} suggestedIds={suggestedIds} />
          )}

          {template.fields?.length > 0 && (
            <div className="rounded-2xl border border-line bg-surface p-4 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[13px] font-semibold text-ink">Contenu du document</h3>
                {fieldMissing.length > 0 && (
                  <span className={`badge ${showErrors ? 'badge-rose' : 'badge-neutral'}`}>
                    {fieldMissing.length} requis à compléter
                  </span>
                )}
              </div>
              {template.fields.map(f => {
                const isUntouchedPerMember = isMemberScope && !touched.has(f.key);
                const value = isUntouchedPerMember ? baseDefaults[f.key] : formValues[f.key];
                const missingHere = fieldMissing.some(m => m.key === f.key);
                return (
                  <FormField
                    key={f.key}
                    field={f}
                    value={value}
                    onChange={(v) => setField(f.key, v)}
                    error={missingHere && (showErrors || touched.has(f.key)) ? 'Ce champ est obligatoire.' : null}
                    perMember={isUntouchedPerMember && defaultDependsOnMember(f) && memberIds.length > 1}
                    onResetDefault={isMemberScope && touched.has(f.key) && defaultDependsOnMember(f) ? () => untouch(f.key) : undefined}
                    members={members}
                    catalog={catalog}
                    domId={fieldDomId(f.key)}
                    ctx={ctx}
                  />
                );
              })}
            </div>
          )}

          {warnings.length > 0 && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] p-3.5" aria-live="polite">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <AlertTriangle size={16} className="text-amber-500" aria-hidden="true" /> À vérifier
                {isMemberScope && currentMember && memberIds.length > 1 && <span className="text-xs font-normal text-dim">({memberName(currentMember)})</span>}
              </p>
              <ul className="mt-1.5 space-y-1 text-[13px] text-ink list-disc pl-5">
                {warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          {template.legal?.note && (
            <div className="rounded-2xl border border-line bg-elevated/50 p-3.5">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Scale size={15} className="text-emerald-500" aria-hidden="true" /> Cadre légal
              </p>
              <p className="text-[13px] text-dim mt-1 leading-relaxed">{template.legal.note}</p>
              {template.legal.references?.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {template.legal.references.map(r => <li key={r} className="badge badge-neutral"><BookOpen size={10} aria-hidden="true" /> {r}</li>)}
                </ul>
              )}
            </div>
          )}
          <p className="flex gap-2 text-xs text-muted leading-relaxed px-1">
            <Info size={14} className="shrink-0 mt-px" aria-hidden="true" /> {DISCLAIMER}
          </p>

          <button type="button" onClick={() => setMobileView('preview')} className="lg:hidden btn-primary w-full">
            <Eye size={15} aria-hidden="true" /> Voir l'aperçu et exporter
          </button>
        </section>

        {/* ── Aperçu + export ── */}
        <section aria-label="Aperçu et export"
          className={`min-w-0 rounded-2xl border border-line bg-surface overflow-hidden flex flex-col lg:sticky lg:top-[68px] lg:h-[calc(100vh-84px)] ${
            mobileView === 'preview' ? '' : 'hidden lg:flex'}`}>
          <ExportBar count={docs.length} busy={busy} onExport={runExport} draft={draft} onDraftChange={setDraft} blocked={blocked} />
          {lastIssue && (
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-line bg-emerald-500/[0.07] text-xs" role="status">
              <CheckCircle2 size={14} className="text-emerald-500" aria-hidden="true" />
              <span className="text-ink">Émis : <strong className="font-mono">{refRange(lastIssue.refs)}</strong></span>
              {lastIssue.entries?.length > 0 && (
                <button type="button" onClick={() => setSending(true)} className="ml-auto inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60">
                  <Mail size={13} aria-hidden="true" /> Envoyer par email
                </button>
              )}
              <button type="button" onClick={onShowRegistry} className={`${lastIssue.entries?.length ? '' : 'ml-auto '}text-blue-600 dark:text-blue-400 hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60`}>
                Voir le registre
              </button>
            </div>
          )}
          <div className="flex-1 min-h-[420px] lg:min-h-0">
            <PreviewPane
              docs={docs}
              error={generation.error}
              stale={stale}
              index={safeIndex}
              onIndex={(i) => setIndex(Math.max(0, Math.min(docs.length - 1, i)))}
              organization={ctx.organization}
              editMode={editMode}
              onToggleEdit={() => setEditMode(v => !v)}
              overrides={overrides}
              onEdit={handleEdit}
              onResetOverrides={() => setOverrides({})}
              retouchCount={retouchCount}
              docLabel={docLabel}
              emptyMessage={noMembers ? 'Sélectionne au moins un membre pour voir l\'aperçu.' : 'Aucun document généré.'}
            />
          </div>
        </section>
      </div>
      {sending && lastIssue?.entries?.length > 0 && <SendDialog entries={lastIssue.entries} onClose={() => setSending(false)} />}
    </div>
  );
}

const CALLOUT_TONES = {
  amber: 'border-amber-500/30 bg-amber-500/[0.07] [&>svg]:text-amber-500',
  blue: 'border-blue-500/30 bg-blue-500/[0.07] [&>svg]:text-blue-500',
};

function Callout({ tone, icon: I, children }) {
  return (
    <div className={`flex gap-2.5 items-start rounded-xl border p-3 text-[13px] text-ink ${CALLOUT_TONES[tone]}`}>
      <I size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
      <p className="leading-relaxed">{children}</p>
    </div>
  );
}
