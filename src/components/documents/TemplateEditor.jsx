import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, Braces, Download, Eye, Info, Plus, Save, SquarePen, Trash2,
} from 'lucide-react';
import { DOCUMENT_CATEGORIES, validateDocument } from '../../documents/model';
import {
  CUSTOM_BLOCK_TYPES, CUSTOM_FIELD_TYPES, CUSTOM_ICONS, VARIABLE_GROUPS, compileCustomTemplate, emptyCustomBlock,
  exportCustomTemplate, normalizeCustomTemplate, slugKey, unknownVariables,
} from '../../documents/customTemplates';
import { generateDocuments, getTemplate } from '../../documents/registry';
import { useDocsStore } from '../../modules/docs/store';
import { useCan } from '../../core/permissions';
import { confirmDialog } from '../ui/confirmStore';
import { toast } from '../ui/toastStore';
import SheetView from './SheetView';
import { TemplateIcon, toneFor } from './templateIcons';
import { downloadText } from './imageCompress';
import { memberName, sortMembers } from './studioHelpers';

// Dernier champ texte actif : la variable choisie dans le menu y est insérée.
const VarTargetContext = createContext(null);

/** Champ texte (input / textarea) qui accepte l'insertion de variables. */
function VarInput({ id, value, onChange, multiline = false, rows = 3, className = '', ...rest }) {
  const setTarget = useContext(VarTargetContext);
  const ref = useRef(null);
  // Toujours le dernier onChange (évite une fermeture périmée lors de l'insertion).
  const latest = useRef(onChange);
  useEffect(() => { latest.current = onChange; });
  // Position du curseur à rétablir après une insertion de variable.
  const caret = useRef(null);
  useLayoutEffect(() => {
    if (caret.current === null || !ref.current) return;
    const pos = caret.current;
    caret.current = null;
    ref.current.focus();
    ref.current.setSelectionRange?.(pos, pos);
  }, [value]);
  const register = () => setTarget?.({
    el: ref.current,
    onChange: (v) => latest.current(v),
    setCaret: (pos) => { caret.current = pos; },
  });
  const props = {
    id, ref, value: value ?? '', className: `input ${className}`.trim(),
    onChange: (e) => { onChange(e.target.value); register(); },
    onFocus: register,
    ...rest,
  };
  return multiline ? <textarea rows={rows} {...props} /> : <input type="text" {...props} />;
}

const labelCls = 'text-[12px] font-semibold text-dim';

/**
 * Éditeur de modèle personnalisé (no-code) : informations, champs de
 * formulaire, blocs (ajout, réordonnancement, suppression), variables,
 * aperçu en direct, export JSON.
 *
 * @param {{ initial: object, isNew: boolean, ctx: object, notice?: string, onClose: () => void }} props
 */
export default function TemplateEditor({ initial, isNew, ctx, notice, onClose }) {
  const uid = useId();
  const canWrite = useCan('documents', 'write');
  const saveCustomTemplate = useDocsStore(s => s.saveCustomTemplate);
  const removeCustomTemplate = useDocsStore(s => s.removeCustomTemplate);
  const [draft, setDraft] = useState(() => normalizeCustomTemplate(initial));
  const [savedId, setSavedId] = useState(isNew ? null : initial.id);
  const [dirty, setDirty] = useState(!!isNew);
  const [addType, setAddType] = useState('paragraph');
  const [mobileView, setMobileView] = useState('edit');
  const [varPick, setVarPick] = useState('');
  const [sampleId, setSampleId] = useState('');
  const varTarget = useRef(null);
  const setVarTarget = useCallback((t) => { varTarget.current = t; }, []);

  const update = useCallback((patch) => { setDraft(d => ({ ...d, ...patch })); setDirty(true); }, []);
  const updateBlock = useCallback((id, patch) => {
    setDraft(d => ({ ...d, blocks: d.blocks.map(b => (b.id === id ? { ...b, ...patch } : b)) }));
    setDirty(true);
  }, []);
  const moveBlock = (i, delta) => {
    setDraft(d => {
      const j = i + delta;
      if (j < 0 || j >= d.blocks.length) return d;
      const blocks = [...d.blocks];
      [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
      return { ...d, blocks };
    });
    setDirty(true);
  };
  const removeBlock = (id) => { setDraft(d => ({ ...d, blocks: d.blocks.filter(b => b.id !== id) })); setDirty(true); };
  const addBlock = () => {
    const b = emptyCustomBlock(addType);
    if (!b) return;
    setDraft(d => ({ ...d, blocks: [...d.blocks, b] }));
    setDirty(true);
    setTimeout(() => document.getElementById(`${uid}-blk-${b.id}`)?.focus(), 30);
  };

  // ── Champs personnalisés ──
  const updateField = (i, patch) => {
    setDraft(d => ({ ...d, fields: d.fields.map((f, k) => (k === i ? { ...f, ...patch } : f)) }));
    setDirty(true);
  };
  const addField = () => {
    setDraft(d => {
      const used = new Set(d.fields.map(f => f.key));
      let key = 'champ'; let n = 1;
      while (used.has(key)) key = `champ_${++n}`;
      return { ...d, fields: [...d.fields, { key, label: 'Nouveau champ', type: 'text', required: false, default: '' }] };
    });
    setDirty(true);
  };
  const removeField = (i) => { setDraft(d => ({ ...d, fields: d.fields.filter((_, k) => k !== i) })); setDirty(true); };

  // ── Variables ──
  const insertVariable = (name) => {
    const t = varTarget.current;
    if (!t?.el || !document.body.contains(t.el)) {
      toast.info('Choisis d\'abord un champ', 'Clique dans un texte du modèle, puis choisis la variable à insérer.');
      return;
    }
    const el = t.el;
    const token = `{${name}}`;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const next = el.value.slice(0, start) + token + el.value.slice(end);
    t.setCaret(start + token.length);
    t.onChange(next);
  };

  const unknown = useMemo(() => unknownVariables(draft), [draft]);

  // ── Aperçu ──
  const members = useMemo(() => sortMembers(ctx.members), [ctx.members]);
  const sample = draft.scope === 'member' ? (members.find(m => m.id === sampleId) || members[0] || null) : null;
  const preview = useMemo(() => {
    try {
      const t = compileCustomTemplate(draft);
      const docs = generateDocuments(t, ctx, {}, sample ? [sample.id] : []);
      return { doc: docs[0] || null, problems: docs[0] ? validateDocument(docs[0]) : [], error: null };
    } catch (e) {
      return { doc: null, problems: [], error: e };
    }
  }, [draft, ctx, sample]);

  const requestClose = async () => {
    if (dirty && canWrite) {
      const ok = await confirmDialog({ title: 'Quitter l\'éditeur ?', message: 'Les modifications non enregistrées seront perdues.', confirmLabel: 'Quitter', tone: 'warning' });
      if (!ok) return;
    }
    onClose();
  };

  const save = async () => {
    if (!draft.title.trim()) { toast.warn('Titre manquant', 'Donne un titre au modèle.'); document.getElementById(`${uid}-title`)?.focus(); return; }
    if (!draft.blocks.length) { toast.warn('Modèle vide', 'Ajoute au moins un bloc.'); return; }
    if (unknown.length) {
      const ok = await confirmDialog({
        title: 'Variables inconnues',
        message: 'Ces variables ne seront pas remplacées : une ligne à compléter (________) apparaîtra à leur place dans le document.',
        details: unknown.map(u => `{${u.name}} — ${u.reason}`),
        confirmLabel: 'Enregistrer quand même', tone: 'warning',
      });
      if (!ok) return;
    }
    const rec = saveCustomTemplate({ ...draft, id: savedId || draft.id });
    setDraft(rec);
    setSavedId(rec.id);
    setDirty(false);
    toast.success(isNew && !savedId ? 'Modèle créé' : 'Modèle enregistré', `« ${rec.title} » est disponible dans la galerie.`);
  };

  const remove = async () => {
    if (!savedId) return;
    const ok = await confirmDialog({
      title: `Supprimer « ${draft.title} » ?`,
      message: 'Le modèle disparaît de la galerie. Les documents déjà émis restent au registre (ils ne pourront plus être régénérés).',
      confirmLabel: 'Supprimer', tone: 'danger',
    });
    if (!ok) return;
    removeCustomTemplate(savedId);
    toast.success('Modèle supprimé', draft.title);
    onClose();
  };

  const exportJson = () => {
    try {
      downloadText(exportCustomTemplate(draft), `modele_${slugKey(draft.title)}.json`, 'application/json;charset=utf-8');
      toast.success('Modèle exporté', 'Fichier JSON réimportable dans BDE Manager.');
    } catch (e) {
      toast.error('Export impossible', e?.message);
    }
  };

  const tone = toneFor(draft.category);
  const memberScope = draft.scope === 'member';
  const base = initial.basedOn ? getTemplate(initial.basedOn) : null;

  return (
    <VarTargetContext.Provider value={setVarTarget}>
      <div className="space-y-4 animate-fade-in">
        <div className="flex flex-wrap items-start gap-3">
          <button type="button" onClick={requestClose} className="btn-secondary px-2.5 shrink-0" aria-label="Retour aux modèles">
            <ArrowLeft size={16} aria-hidden="true" /> <span className="hidden sm:inline">Modèles</span>
          </button>
          <div className={`h-10 w-10 rounded-xl grid place-items-center shrink-0 ${tone.tile}`} aria-hidden="true"><TemplateIcon name={draft.icon} size={20} /></div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-ink leading-tight">{savedId ? 'Modifier le modèle' : 'Nouveau modèle personnalisé'}</h2>
            <p className="text-sm text-dim mt-0.5">
              {dirty ? 'Modifications non enregistrées.' : 'Enregistré : disponible dans la galerie.'}
              {base && <> Basé sur « {base.title} ».</>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={exportJson}><Download size={15} aria-hidden="true" /> Exporter (JSON)</button>
            {savedId && canWrite && (
              <button type="button" className="btn-secondary hover:!text-red-500" onClick={remove}><Trash2 size={15} aria-hidden="true" /> Supprimer</button>
            )}
            <button type="button" className="btn-primary" onClick={save} disabled={!canWrite}><Save size={15} aria-hidden="true" /> Enregistrer</button>
          </div>
        </div>

        {notice && (
          <p className="flex gap-2 items-start rounded-xl border border-blue-500/30 bg-blue-500/[0.07] p-3 text-[13px] text-ink">
            <Info size={16} className="shrink-0 mt-0.5 text-blue-500" aria-hidden="true" /> {notice}
          </p>
        )}

        <div role="group" aria-label="Affichage" className="lg:hidden flex bg-elevated p-0.5 rounded-lg border border-line">
          {[['edit', 'Édition', SquarePen], ['preview', 'Aperçu', Eye]].map(([id, label, I]) => (
            <button key={id} type="button" aria-pressed={mobileView === id} onClick={() => setMobileView(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${mobileView === id ? 'bg-surface text-ink shadow-sm' : 'text-dim'}`}>
              <I size={15} aria-hidden="true" /> {label}
            </button>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] items-start">
          <div className={`space-y-4 min-w-0 ${mobileView === 'edit' ? '' : 'hidden lg:block'}`}>
            {/* Informations */}
            <section className="rounded-2xl border border-line bg-surface p-4 space-y-3" aria-labelledby={`${uid}-info`}>
              <h3 id={`${uid}-info`} className="text-[13px] font-semibold text-ink">Informations</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label htmlFor={`${uid}-title`} className={labelCls}>Nom du modèle (galerie)</label>
                  <input id={`${uid}-title`} className="input" value={draft.title} onChange={(e) => update({ title: e.target.value })} maxLength={120} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor={`${uid}-desc`} className={labelCls}>Description</label>
                  <input id={`${uid}-desc`} className="input" value={draft.description} onChange={(e) => update({ description: e.target.value })} maxLength={300} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor={`${uid}-doctitle`} className={labelCls}>Titre du document produit (variables admises)</label>
                  <VarInput id={`${uid}-doctitle`} value={draft.docTitle} onChange={(v) => update({ docTitle: v })} placeholder={draft.title} maxLength={200} />
                </div>
                <div>
                  <label htmlFor={`${uid}-cat`} className={labelCls}>Catégorie</label>
                  <select id={`${uid}-cat`} className="input" value={draft.category} onChange={(e) => update({ category: e.target.value })}>
                    {DOCUMENT_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
                <fieldset>
                  <legend className={labelCls}>Portée</legend>
                  <div className="flex gap-1 mt-1 bg-elevated p-0.5 rounded-lg border border-line">
                    {[['member', 'Par membre'], ['organization', 'Association']].map(([v, l]) => (
                      <label key={v} className={`flex-1 text-center text-xs font-medium px-2 py-1.5 rounded-md cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500/60 ${draft.scope === v ? 'bg-surface text-ink shadow-sm' : 'text-dim'}`}>
                        <input type="radio" name={`${uid}-scope`} value={v} checked={draft.scope === v} onChange={() => update({ scope: v })} className="sr-only" aria-label={`Portée : ${l}`} /> {l}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
              <fieldset>
                <legend className={labelCls}>Icône</legend>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {CUSTOM_ICONS.map(name => (
                    <label key={name} title={name} className={`tap h-9 w-9 rounded-lg grid place-items-center border cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500/60 ${draft.icon === name ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'border-line text-dim hover:text-ink'}`}>
                      <input type="radio" name={`${uid}-icon`} value={name} checked={draft.icon === name} onChange={() => update({ icon: name })} className="sr-only" aria-label={`Icône ${name}`} />
                      <TemplateIcon name={name} size={16} aria-hidden="true" />
                    </label>
                  ))}
                </div>
              </fieldset>
            </section>

            {/* Champs de formulaire */}
            <section className="rounded-2xl border border-line bg-surface p-4 space-y-3" aria-labelledby={`${uid}-fields`}>
              <div className="flex items-center gap-2">
                <h3 id={`${uid}-fields`} className="text-[13px] font-semibold text-ink">Champs à remplir à l'émission</h3>
                <button type="button" className="btn-secondary py-1 text-xs ml-auto" onClick={addField}><Plus size={13} aria-hidden="true" /> Ajouter un champ</button>
              </div>
              <p className="text-xs text-dim">Toujours proposés : date du document (<code>{'{date}'}</code>) et signataire (<code>{'{signataire.nom}'}</code>). Chaque champ ajouté devient une variable <code>{'{champ.clé}'}</code>.</p>
              {draft.fields.length === 0 ? (
                <p className="text-xs text-muted italic">Aucun champ personnalisé.</p>
              ) : (
                <ul className="space-y-2">
                  {draft.fields.map((f, i) => (
                    <li key={i} className="rounded-xl border border-line bg-elevated/40 p-3 grid sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
                      <div>
                        <label htmlFor={`${uid}-fl-${i}`} className={labelCls}>Libellé</label>
                        <input id={`${uid}-fl-${i}`} className="input" value={f.label} maxLength={120}
                          onChange={(e) => updateField(i, { label: e.target.value, ...(f.key.startsWith('champ') && f.label === 'Nouveau champ' ? { key: slugKey(e.target.value) } : {}) })} />
                      </div>
                      <div>
                        <label htmlFor={`${uid}-fk-${i}`} className={labelCls}>Clé (variable)</label>
                        <input id={`${uid}-fk-${i}`} className="input font-mono text-xs" value={f.key} maxLength={30}
                          onChange={(e) => updateField(i, { key: slugKey(e.target.value) })} />
                      </div>
                      <button type="button" className="tap btn-ghost p-2 hover:!text-red-500" onClick={() => removeField(i)} aria-label={`Supprimer le champ ${f.label}`}>
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                      <div>
                        <label htmlFor={`${uid}-ft-${i}`} className={labelCls}>Type</label>
                        <select id={`${uid}-ft-${i}`} className="input" value={f.type} onChange={(e) => updateField(i, { type: e.target.value })}>
                          {CUSTOM_FIELD_TYPES.map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label htmlFor={`${uid}-fd-${i}`} className={labelCls}>Valeur par défaut</label>
                        <input id={`${uid}-fd-${i}`} className="input" type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'} value={f.default || ''} onChange={(e) => updateField(i, { default: e.target.value })} />
                      </div>
                      <label className="inline-flex items-center gap-1.5 text-xs text-ink pb-2">
                        <input type="checkbox" checked={!!f.required} onChange={(e) => updateField(i, { required: e.target.checked })} className="h-3.5 w-3.5" /> Requis
                      </label>
                      {f.type === 'select' && (
                        <div className="sm:col-span-3">
                          <label htmlFor={`${uid}-fo-${i}`} className={labelCls}>Choix (un par ligne)</label>
                          <textarea id={`${uid}-fo-${i}`} rows={3} className="input" value={(f.options || []).join('\n')}
                            onChange={(e) => updateField(i, { options: e.target.value.split('\n') })} />
                        </div>
                      )}
                      <p className="sm:col-span-3 text-[11px] text-dim">Variable : <code className="font-mono">{`{champ.${f.key}}`}</code></p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Blocs */}
            <section className="rounded-2xl border border-line bg-surface p-4 space-y-3" aria-labelledby={`${uid}-blocks`}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 id={`${uid}-blocks`} className="text-[13px] font-semibold text-ink">Contenu ({draft.blocks.length} bloc{draft.blocks.length > 1 ? 's' : ''})</h3>
              </div>

              {/* Menu des variables */}
              <div className="rounded-xl border border-violet-500/30 bg-violet-500/[0.06] p-3 flex flex-wrap items-end gap-2">
                <div className="min-w-0 flex-1">
                  <label htmlFor={`${uid}-var`} className={`${labelCls} flex items-center gap-1`}><Braces size={12} aria-hidden="true" /> Insérer une variable (dans le dernier champ texte utilisé)</label>
                  <select id={`${uid}-var`} className="input" value={varPick} onChange={(e) => setVarPick(e.target.value)}>
                    <option value="">Choisir une variable…</option>
                    {VARIABLE_GROUPS.filter(g => !g.memberOnly || memberScope).map(g => (
                      <optgroup key={g.id} label={g.label}>
                        {g.vars.map(([k, l]) => <option key={k} value={k}>{l} — {`{${k}}`}</option>)}
                      </optgroup>
                    ))}
                    {draft.fields.length > 0 && (
                      <optgroup label="Champs personnalisés">
                        {draft.fields.map(f => <option key={f.key} value={`champ.${f.key}`}>{f.label} — {`{champ.${f.key}}`}</option>)}
                      </optgroup>
                    )}
                  </select>
                </div>
                <button type="button" className="btn-secondary" disabled={!varPick} onMouseDown={(e) => e.preventDefault()} onClick={() => { insertVariable(varPick); }}>
                  <Plus size={14} aria-hidden="true" /> Insérer
                </button>
              </div>

              {unknown.length > 0 && (
                <div role="alert" className="rounded-xl border border-amber-500/40 bg-amber-500/[0.08] p-3 text-[13px]">
                  <p className="flex items-center gap-2 font-semibold text-ink"><AlertTriangle size={15} className="text-amber-500" aria-hidden="true" /> Variable{unknown.length > 1 ? 's' : ''} inconnue{unknown.length > 1 ? 's' : ''}</p>
                  <ul className="mt-1 space-y-0.5 text-dim">
                    {unknown.map(u => <li key={u.name}><code className="font-mono text-ink">{`{${u.name}}`}</code> — {u.reason} Remplacée par « ________ » dans le document.</li>)}
                  </ul>
                </div>
              )}

              {draft.blocks.length === 0 && <p className="text-sm text-dim text-center py-4">Aucun bloc : ajoute un titre puis des paragraphes.</p>}
              <ol className="space-y-2">
                {draft.blocks.map((b, i) => (
                  <li key={b.id} className="rounded-xl border border-line bg-elevated/40 p-3 space-y-2">
                    <div className="flex items-center gap-1">
                      <span className="badge badge-neutral">{i + 1}. {CUSTOM_BLOCK_TYPES.find(t => t.type === b.type)?.label}</span>
                      <span className="ml-auto flex items-center gap-0.5">
                        <button type="button" className="tap btn-ghost p-1.5" onClick={() => moveBlock(i, -1)} disabled={i === 0} aria-label={`Monter le bloc ${i + 1}`}><ArrowUp size={14} aria-hidden="true" /></button>
                        <button type="button" className="tap btn-ghost p-1.5" onClick={() => moveBlock(i, 1)} disabled={i === draft.blocks.length - 1} aria-label={`Descendre le bloc ${i + 1}`}><ArrowDown size={14} aria-hidden="true" /></button>
                        <button type="button" className="tap btn-ghost p-1.5 hover:!text-red-500" onClick={() => removeBlock(b.id)} aria-label={`Supprimer le bloc ${i + 1}`}><Trash2 size={14} aria-hidden="true" /></button>
                      </span>
                    </div>
                    <BlockEditor block={b} uid={`${uid}-blk-${b.id}`} onChange={(patch) => updateBlock(b.id, patch)} memberScope={memberScope} />
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap items-end gap-2 pt-1">
                <div>
                  <label htmlFor={`${uid}-add`} className={labelCls}>Ajouter un bloc</label>
                  <select id={`${uid}-add`} className="input" value={addType} onChange={(e) => setAddType(e.target.value)}>
                    {CUSTOM_BLOCK_TYPES.map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
                  </select>
                </div>
                <button type="button" className="btn-secondary" onClick={addBlock}><Plus size={15} aria-hidden="true" /> Ajouter</button>
              </div>
            </section>
          </div>

          {/* Aperçu */}
          <section aria-label="Aperçu" className={`min-w-0 rounded-2xl border border-line bg-surface overflow-hidden lg:sticky lg:top-[68px] ${mobileView === 'preview' ? '' : 'hidden lg:block'}`}>
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-line">
              <span className="text-xs font-medium text-dim">Aperçu (valeurs par défaut)</span>
              {memberScope && members.length > 0 && (
                <>
                  <label htmlFor={`${uid}-sample`} className="sr-only">Membre d'exemple</label>
                  <select id={`${uid}-sample`} className="input py-1 text-xs ml-auto max-w-[200px]" value={sample?.id || ''} onChange={(e) => setSampleId(e.target.value)}>
                    {members.map(m => <option key={m.id} value={m.id}>{memberName(m)}</option>)}
                  </select>
                </>
              )}
            </div>
            {preview.problems.length > 0 && (
              <p className="px-3 py-2 text-xs text-amber-700 dark:text-amber-300 border-b border-line">{preview.problems[0]}</p>
            )}
            <div className="p-2 sm:p-3 bg-elevated/40 max-h-[calc(100vh-150px)] overflow-y-auto">
              {preview.error ? (
                <p role="alert" className="text-sm text-red-500 p-4">Aperçu impossible : {preview.error.message}</p>
              ) : preview.doc ? (
                <SheetView doc={preview.doc} organization={ctx.organization} />
              ) : (
                <p className="text-sm text-dim p-6 text-center">{memberScope ? 'Ajoute un membre pour voir l\'aperçu.' : 'Aucun aperçu.'}</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </VarTargetContext.Provider>
  );
}

/** Édition d'un bloc selon son type. */
function BlockEditor({ block: b, uid, onChange, memberScope }) {
  switch (b.type) {
    case 'title':
      return (
        <div className="grid sm:grid-cols-2 gap-2">
          <div><label htmlFor={uid} className={labelCls}>Titre</label><VarInput id={uid} value={b.text} onChange={(v) => onChange({ text: v })} /></div>
          <div><label htmlFor={`${uid}-s`} className={labelCls}>Sous-titre (facultatif)</label><VarInput id={`${uid}-s`} value={b.subtitle} onChange={(v) => onChange({ subtitle: v })} /></div>
        </div>
      );
    case 'heading':
      return <div><label htmlFor={uid} className={labelCls}>Intertitre</label><VarInput id={uid} value={b.text} onChange={(v) => onChange({ text: v })} /></div>;
    case 'paragraph':
      return (
        <div className="space-y-1.5">
          <label htmlFor={uid} className={labelCls}>Texte (<code>**gras**</code> accepté)</label>
          <VarInput id={uid} multiline rows={4} value={b.text} onChange={(v) => onChange({ text: v })} />
          <label className="inline-flex items-center gap-2 text-xs text-dim">Alignement
            <select className="input py-1 text-xs w-auto" value={b.align} onChange={(e) => onChange({ align: e.target.value })}>
              <option value="justify">Justifié</option><option value="left">Gauche</option><option value="center">Centré</option><option value="right">Droite</option>
            </select>
          </label>
        </div>
      );
    case 'list':
      return (
        <div className="space-y-1.5">
          <label htmlFor={uid} className={labelCls}>Éléments (un par ligne)</label>
          <VarInput id={uid} multiline rows={4} value={(b.items || []).join('\n')} onChange={(v) => onChange({ items: v.split('\n') })} />
          <label className="inline-flex items-center gap-1.5 text-xs text-ink"><input type="checkbox" checked={!!b.ordered} onChange={(e) => onChange({ ordered: e.target.checked })} className="h-3.5 w-3.5" /> Liste numérotée</label>
        </div>
      );
    case 'keyValue':
      return (
        <div className="space-y-1.5">
          {(b.rows || []).map((row, i) => (
            <div key={i} className="grid grid-cols-[1fr_1.5fr_auto] gap-1.5 items-center">
              <VarInput id={i === 0 ? uid : `${uid}-k${i}`} value={row[0]} aria-label={`Libellé ligne ${i + 1}`} placeholder="Libellé"
                onChange={(v) => onChange({ rows: b.rows.map((r, k) => (k === i ? [v, r[1]] : r)) })} />
              <VarInput id={`${uid}-v${i}`} value={row[1]} aria-label={`Valeur ligne ${i + 1}`} placeholder="Valeur"
                onChange={(v) => onChange({ rows: b.rows.map((r, k) => (k === i ? [r[0], v] : r)) })} />
              <button type="button" className="tap btn-ghost p-1.5 hover:!text-red-500" aria-label={`Supprimer la ligne ${i + 1}`}
                onClick={() => onChange({ rows: b.rows.filter((_, k) => k !== i) })}><Trash2 size={13} aria-hidden="true" /></button>
            </div>
          ))}
          <button type="button" className="btn-secondary py-1 text-xs" onClick={() => onChange({ rows: [...(b.rows || []), ['', '']] })}><Plus size={13} aria-hidden="true" /> Ligne</button>
        </div>
      );
    case 'callout':
      return (
        <div className="space-y-1.5">
          <label htmlFor={uid} className={labelCls}>Texte de l'encadré</label>
          <VarInput id={uid} multiline rows={3} value={b.text} onChange={(v) => onChange({ text: v })} />
          <label className="inline-flex items-center gap-2 text-xs text-dim">Style
            <select className="input py-1 text-xs w-auto" value={b.tone} onChange={(e) => onChange({ tone: e.target.value })}>
              <option value="info">Information</option><option value="warning">Avertissement</option><option value="legal">Mention légale</option>
            </select>
          </label>
        </div>
      );
    case 'blankLines':
      return (
        <div>
          <label htmlFor={uid} className={labelCls}>Libellés des lignes à remplir à la main (un par ligne)</label>
          <VarInput id={uid} multiline rows={3} value={(b.lines || []).join('\n')} onChange={(v) => onChange({ lines: v.split('\n') })} />
        </div>
      );
    case 'placeDate':
      return (
        <div className="grid sm:grid-cols-2 gap-2">
          <div><label htmlFor={uid} className={labelCls}>Lieu (« Fait à … »)</label><VarInput id={uid} value={b.city} onChange={(v) => onChange({ city: v })} /></div>
          <div><label htmlFor={`${uid}-d`} className={labelCls}>Date</label><VarInput id={`${uid}-d`} value={b.date} onChange={(v) => onChange({ date: v })} /></div>
        </div>
      );
    case 'signatures':
      return (
        <div className="space-y-2">
          {(b.slots || []).map((s, i) => (
            <div key={i} className="grid sm:grid-cols-[1fr_auto_1fr_auto] gap-1.5 items-end rounded-lg border border-line p-2">
              <div><label htmlFor={i === 0 ? uid : `${uid}-l${i}`} className={labelCls}>Libellé</label>
                <VarInput id={i === 0 ? uid : `${uid}-l${i}`} value={s.label} onChange={(v) => onChange({ slots: b.slots.map((x, k) => (k === i ? { ...x, label: v } : x)) })} /></div>
              <div><label htmlFor={`${uid}-w${i}`} className={labelCls}>Signataire</label>
                <select id={`${uid}-w${i}`} className="input" value={s.signer} onChange={(e) => onChange({ slots: b.slots.map((x, k) => (k === i ? { ...x, signer: e.target.value } : x)) })}>
                  {memberScope && <option value="membre">Membre concerné</option>}
                  <option value="signataire">Signataire de l'association</option>
                  <option value="libre">Autre (nom libre)</option>
                </select></div>
              <div><label htmlFor={`${uid}-m${i}`} className={labelCls}>{s.signer === 'libre' ? 'Nom (facultatif)' : 'Mention (facultatif)'}</label>
                {s.signer === 'libre'
                  ? <VarInput id={`${uid}-m${i}`} value={s.name} onChange={(v) => onChange({ slots: b.slots.map((x, k) => (k === i ? { ...x, name: v } : x)) })} />
                  : <VarInput id={`${uid}-m${i}`} value={s.mention} placeholder="Lu et approuvé" onChange={(v) => onChange({ slots: b.slots.map((x, k) => (k === i ? { ...x, mention: v } : x)) })} />}
              </div>
              <button type="button" className="tap btn-ghost p-2 hover:!text-red-500" aria-label={`Supprimer la signature ${i + 1}`}
                onClick={() => onChange({ slots: b.slots.filter((_, k) => k !== i) })}><Trash2 size={13} aria-hidden="true" /></button>
              {s.signer === 'membre' && !memberScope && <p className="sm:col-span-4 text-[11px] text-amber-600">« Membre concerné » n'existe que pour un modèle par membre : nom laissé vide.</p>}
            </div>
          ))}
          {(b.slots || []).length < 6 && (
            <button type="button" className="btn-secondary py-1 text-xs" onClick={() => onChange({ slots: [...(b.slots || []), { label: memberScope ? 'Le membre' : 'Signature', signer: memberScope ? 'membre' : 'libre', name: '', mention: '' }] })}>
              <Plus size={13} aria-hidden="true" /> Signataire
            </button>
          )}
        </div>
      );
    case 'pageBreak':
      return <p className="text-xs text-dim">Le contenu suivant commence sur une nouvelle page.</p>;
    default:
      return null;
  }
}
