// ============================================================
// Panneau de propriétés (élément, page ou formulaire sélectionné)
// ============================================================
import { useId, useMemo, useState } from 'react';
import { Copy, Trash2, RefreshCw, ImagePlus, X, MoveRight } from 'lucide-react';
import { QUESTION_TYPES, KEY_RX, FORM_KINDS } from '../../../forms/schema.js';
import { newKeyFromLabel, RESERVED_KEYS, OPTION_TYPES, safeRegex, evaluateForm, formatAnswer } from '../../../forms/engine/index.js';
import { toast } from '../../../components/ui/toastStore.js';
import { findItem, updateItem, usedKeys, updatePage, pageContainer, moveItem, itemLabel } from '../defOps.js';
import { Field, Toggle, Segmented, NumberInput, IconByName } from '../ui.jsx';
import { ConditionEditor, FormulaInput } from './Formula.jsx';
import OptionsEditor from './OptionsEditor.jsx';
import { PageRules } from './LogicTab.jsx';
import { importPublicImage, formatKb, imageBytes } from '../image.js';

const TYPE = Object.fromEntries(QUESTION_TYPES.map(t => [t.type, t]));
const GROUPS = [...new Set(QUESTION_TYPES.map(t => t.group))];
const TEXTLIKE = new Set(['short_text', 'long_text', 'email', 'phone', 'url']);
const PLACEHOLDER_TYPES = new Set(['short_text', 'long_text', 'email', 'phone', 'url', 'number', 'dropdown', 'member_picker', 'event_picker']);
const SOURCE_TYPES = new Set(['single_choice', 'multiple_choice', 'dropdown']);
const SCORABLE = new Set(['single_choice', 'dropdown', 'image_choice', 'yes_no', 'number', 'short_text', 'multiple_choice']);
const SOURCES = [
  { value: '', label: 'Options saisies' },
  { value: 'members', label: 'Membres du BDE' },
  { value: 'events', label: 'Événements' },
  { value: 'roles', label: 'Rôles du catalogue' },
  { value: 'poles', label: 'Pôles' },
];
const PREFILLS = [
  { value: '', label: 'Aucun' },
  { value: 'member.email', label: 'E-mail du membre connecté' },
  { value: 'member.firstName', label: 'Prénom du membre connecté' },
  { value: 'member.lastName', label: 'Nom du membre connecté' },
  { value: 'member.phone', label: 'Téléphone du membre connecté' },
  { value: 'url', label: 'Paramètre de l\'adresse (?param=…)' },
];
const ACCEPT_PRESETS = [
  { label: 'PDF', value: 'application/pdf' },
  { label: 'Images', value: 'image/*' },
  { label: 'Word', value: '.docx' },
  { label: 'Excel', value: '.xlsx' },
];

export default function Properties({ def, selection, update, onSelect, testAnswers, context }) {
  if (selection?.kind === 'item') {
    const found = findItem(def, selection.id);
    if (found) return <ItemProps key={found.item.id} def={def} found={found} update={update} onSelect={onSelect} testAnswers={testAnswers} context={context} />;
  }
  if (selection?.kind === 'page') {
    const page = def.pages.find(p => p.id === selection.id);
    if (page) return <PageProps key={page.id} def={def} page={page} update={update} />;
  }
  return <FormProps def={def} update={update} />;
}

function Header({ icon, title, subtitle, children }) {
  return (
    <div className="flex items-start justify-between gap-2 pb-3 border-b border-line">
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-8 h-8 rounded-lg bg-elevated border border-line flex items-center justify-center text-dim shrink-0">{icon}</span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink truncate">{title}</h3>
          {subtitle && <p className="text-[11px] text-muted truncate">{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">{children}</div>
    </div>
  );
}

// ── Formulaire ──────────────────────────────────────────────
function FormProps({ def, update }) {
  return (
    <div className="space-y-3">
      <Header icon={<IconByName name="FileText" />} title="Formulaire" subtitle="Sélectionne un élément pour le modifier." />
      <Field label="Titre">{id => <input id={id} className="input" value={def.title} onChange={e => update(d => ({ ...d, title: e.target.value }), { coalesce: 'form:title' })} />}</Field>
      <Field label="Description (introduction)">{id => <textarea id={id} rows={4} className="input" value={def.description || ''} onChange={e => update(d => ({ ...d, description: e.target.value }), { coalesce: 'form:desc' })} />}</Field>
      <Field label="Type de formulaire" hint="Adapte les réglages proposés (vote, quiz, réservation…).">
        {id => (
          <select id={id} className="input" value={def.kind} onChange={e => update(d => ({ ...d, kind: e.target.value }), { snapshot: 'Type de formulaire' })}>
            {FORM_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        )}
      </Field>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────
function PageProps({ def, page, update }) {
  const index = def.pages.findIndex(p => p.id === page.id);
  const upd = (patch, coalesce) => update(d => updatePage(d, page.id, patch), coalesce ? { coalesce: `page:${page.id}:${coalesce}` } : { snapshot: 'Logique de page' });
  return (
    <div className="space-y-3">
      <Header icon={<IconByName name="FileText" />} title={page.title || `Page ${index + 1}`} subtitle={`Page ${index + 1} sur ${def.pages.length}`} />
      <Field label="Titre de la page">{id => <input id={id} className="input" value={page.title || ''} onChange={e => upd({ title: e.target.value }, 'title')} />}</Field>
      <Field label="Description">{id => <textarea id={id} rows={3} className="input" value={page.description || ''} onChange={e => upd({ description: e.target.value || undefined }, 'desc')} />}</Field>
      <ConditionEditor label="Afficher cette page si" emptyLabel="Toujours affichée" def={def} value={page.logic?.showIf}
        onChange={v => upd(p => ({ ...p, logic: cleanLogic({ ...(p.logic || {}), showIf: v }) }))} />
      <PageRules def={def} page={page} update={update} />
    </div>
  );
}

function cleanLogic(logic) {
  const out = { ...logic };
  if (!out.showIf) delete out.showIf;
  if (!out.next?.length) delete out.next;
  return Object.keys(out).length ? out : undefined;
}

// ── Élément ─────────────────────────────────────────────────
function ItemProps({ def, found, update, onSelect, testAnswers, context }) {
  const { item } = found;
  const [tab, setTab] = useState('general');
  const updItem = (patch, opts = {}) => update(d => updateItem(d, item.id, patch), opts);
  const duplicate = () => onSelect({ kind: 'duplicate', id: item.id });
  const remove = () => onSelect({ kind: 'delete', id: item.id });
  const pageIndex = def.pages.findIndex(p => p.id === found.pageId);

  const moveToPage = (pageId) => {
    if (!pageId || pageId === found.pageId) return;
    update(d => moveItem(d, item.id, pageContainer(pageId)), { snapshot: 'Déplacement' });
    toast.success('Élément déplacé', `Vers « ${def.pages.find(p => p.id === pageId)?.title || 'page'} »`);
  };

  const icon = item.kind === 'question' ? <IconByName name={TYPE[item.type]?.icon} /> : <IconByName name={item.kind === 'section' ? 'Square' : 'FileText'} />;
  const subtitle = item.kind === 'question' ? `${TYPE[item.type]?.label || item.type} · ${item.key}` : item.kind === 'section' ? 'Section' : item.kind === 'columns' ? 'Colonnes' : 'Contenu';

  return (
    <div className="space-y-3">
      <Header icon={icon} title={itemLabel(item)} subtitle={subtitle}>
        <button type="button" className="btn-ghost !p-1.5" aria-label="Dupliquer l'élément" onClick={duplicate}><Copy size={15} aria-hidden="true" /></button>
        <button type="button" className="btn-ghost !p-1.5 hover:!text-red-600" aria-label="Supprimer l'élément" onClick={remove}><Trash2 size={15} aria-hidden="true" /></button>
      </Header>
      {def.pages.length > 1 && (
        <Field label="Page">
          {id => (
            <div className="flex items-center gap-1.5">
              <MoveRight size={14} className="text-muted shrink-0" aria-hidden="true" />
              <select id={id} className="input !py-1.5 text-xs" value={found.pageId} onChange={e => moveToPage(e.target.value)}>
                {def.pages.map((p, i) => <option key={p.id} value={p.id}>{i === pageIndex ? '● ' : ''}{p.title || `Page ${i + 1}`}</option>)}
              </select>
            </div>
          )}
        </Field>
      )}
      {item.kind === 'question' && <QuestionProps def={def} item={item} updItem={updItem} tab={tab} setTab={setTab} testAnswers={testAnswers} context={context} />}
      {item.kind === 'section' && <SectionProps def={def} item={item} updItem={updItem} />}
      {item.kind === 'columns' && <ColumnsProps def={def} item={item} updItem={updItem} />}
      {item.kind === 'content' && <ContentProps def={def} item={item} updItem={updItem} />}
    </div>
  );
}

// ── Question ────────────────────────────────────────────────
function QuestionProps({ def, item, updItem, tab, setTab, testAnswers, context }) {
  const hasChoices = OPTION_TYPES.has(item.type) || item.type === 'payment' || SOURCE_TYPES.has(item.type);
  const tabs = [
    { value: 'general', label: 'Général' },
    ...(hasChoices ? [{ value: 'choices', label: item.type === 'matrix' ? 'Grille' : 'Options' }] : []),
    { value: 'validation', label: 'Validation' },
    { value: 'logic', label: 'Logique' },
    { value: 'advanced', label: 'Avancé' },
  ];
  const current = tabs.some(t => t.value === tab) ? tab : 'general';
  return (
    <div className="space-y-3">
      <Segmented label="Sections des propriétés" size="xs" value={current} onChange={setTab} options={tabs} />
      {current === 'general' && <GeneralTab def={def} item={item} updItem={updItem} testAnswers={testAnswers} context={context} />}
      {current === 'choices' && <ChoicesTab def={def} item={item} updItem={updItem} />}
      {current === 'validation' && <ValidationTab item={item} updItem={updItem} />}
      {current === 'logic' && <LogicPropsTab def={def} item={item} updItem={updItem} />}
      {current === 'advanced' && <AdvancedTab def={def} item={item} updItem={updItem} />}
    </div>
  );
}

function convertType(item, type) {
  const next = { ...item, type };
  if ((OPTION_TYPES.has(type) || type === 'image_choice') && !Array.isArray(next.options)) {
    next.options = [{ value: 'option_1', label: 'Option 1' }, { value: 'option_2', label: 'Option 2' }];
  }
  if (type === 'matrix' && !Array.isArray(next.columns)) next.columns = [{ value: 'oui', label: 'Oui' }, { value: 'non', label: 'Non' }];
  if (type === 'rating' && !next.max) next.max = 5;
  if (type === 'scale') { next.min ??= 1; next.max ??= 10; }
  if (type === 'calculated' && !next.expr) { next.expr = '1 + 1'; next.valueType = 'number'; }
  if (type === 'payment' && next.amount === undefined && !next.options?.some(o => typeof o.price === 'number')) next.amount = 10;
  if (!OPTION_TYPES.has(type) && type !== 'payment' && !SOURCE_TYPES.has(type)) { delete next.options; delete next.source; }
  if (type !== 'matrix') delete next.columns;
  if (!SOURCE_TYPES.has(type)) delete next.source;
  if (type !== 'calculated') { delete next.expr; delete next.valueType; }
  delete next.score;
  return next;
}

function GeneralTab({ def, item, updItem, testAnswers }) {
  const others = useMemo(() => usedKeys(def, item.id), [def, item.id]);
  const keyError = !item.key ? 'Clé obligatoire.'
    : !KEY_RX.test(item.key) ? 'Minuscules, chiffres et _ ; commence par une lettre (50 caractères max).'
      : RESERVED_KEYS.has(item.key) ? 'Mot réservé des formules.'
        : others.has(item.key) ? 'Clé déjà utilisée par une autre question ou variable.' : null;

  const onLabel = (label) => {
    // La clé suit le libellé tant qu'elle n'a pas été personnalisée.
    const auto = item.key === newKeyFromLabel(item.label || '', others) || /^(question|nouvelle_question)(_\d+)?$/.test(item.key || '');
    const patch = { label };
    if (auto) patch.key = newKeyFromLabel(label, others);
    updItem(patch, { coalesce: `${item.id}:label` });
  };
  const requiredMode = typeof item.required === 'string' ? 'cond' : item.required === true || (item.type === 'consent' && item.required !== false) ? 'yes' : 'no';
  const calcValue = useMemo(() => {
    if (item.type !== 'calculated') return null;
    try {
      const ev = evaluateForm(def, testAnswers || {}, { now: new Date(), params: {}, member: null });
      const v = ev.values?.[item.key] ?? ev.computed?.[item.key];
      return v === null || v === undefined || v === '' ? '(vide)' : String(formatAnswer(item, v) || v);
    } catch { return '(erreur)'; }
  }, [def, item, testAnswers]);

  return (
    <div className="space-y-3">
      <Field label="Type de question">
        {id => (
          <select id={id} className="input !py-1.5 text-sm" value={item.type} onChange={e => updItem(convertType(item, e.target.value), { snapshot: 'Changement de type' })}>
            {GROUPS.map(g => (
              <optgroup key={g} label={g}>
                {QUESTION_TYPES.filter(t => t.group === g).map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
              </optgroup>
            ))}
          </select>
        )}
      </Field>
      <Field label={item.type === 'consent' ? 'Texte à accepter' : 'Intitulé de la question'}>
        {id => <textarea id={id} rows={2} className="input" value={item.label || ''} onChange={e => onLabel(e.target.value)} />}
      </Field>
      <Field label="Aide (sous l'intitulé)">
        {id => <input id={id} className="input" value={item.help || ''} onChange={e => updItem({ help: e.target.value || undefined }, { coalesce: `${item.id}:help` })} />}
      </Field>
      {PLACEHOLDER_TYPES.has(item.type) && (
        <Field label="Texte indicatif (placeholder)">
          {id => <input id={id} className="input" value={item.placeholder || ''} onChange={e => updItem({ placeholder: e.target.value || undefined }, { coalesce: `${item.id}:ph` })} />}
        </Field>
      )}
      <Field label="Clé (nom de variable)" error={keyError} hint="Utilisée dans les formules, les exports et les automatisations.">
        {id => (
          <div className="flex gap-1.5">
            <input id={id} className={`input font-mono text-xs ${keyError ? '!border-red-500' : ''}`} value={item.key || ''} aria-invalid={!!keyError}
              onChange={e => updItem({ key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') }, { coalesce: `${item.id}:key` })} />
            <button type="button" className="btn-ghost !p-2 shrink-0" aria-label="Recalculer la clé depuis l'intitulé" title="Recalculer depuis l'intitulé"
              onClick={() => updItem({ key: newKeyFromLabel(item.label || 'question', others) }, { snapshot: 'Clé' })}>
              <RefreshCw size={14} aria-hidden="true" />
            </button>
          </div>
        )}
      </Field>
      {item.type !== 'calculated' && item.type !== 'hidden' && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-dim">Réponse obligatoire</p>
          <Segmented label="Réponse obligatoire" value={requiredMode} onChange={m => updItem({ required: m === 'yes' ? true : m === 'no' ? false : (typeof item.required === 'string' ? item.required : '') || undefined }, { snapshot: 'Obligation' })}
            options={[{ value: 'no', label: 'Non' }, { value: 'yes', label: 'Oui' }, { value: 'cond', label: 'Sous condition' }]} />
          {requiredMode === 'cond' || (typeof item.required === 'string') ? (
            <ConditionEditor label="Obligatoire si" emptyLabel="Choisis une condition" def={def} excludeKey={item.key} value={typeof item.required === 'string' ? item.required : ''}
              onChange={v => updItem({ required: v || '' })} />
          ) : null}
        </div>
      )}
      <TypeSpecific def={def} item={item} updItem={updItem} calcValue={calcValue} />
    </div>
  );
}

function TypeSpecific({ def, item, updItem, calcValue }) {
  switch (item.type) {
    case 'rating':
      return <Field label="Nombre d'étoiles">{id => <NumberInput id={id} min={2} max={10} value={item.max ?? 5} onChange={v => updItem({ max: v ? Math.min(10, Math.max(2, Math.round(v))) : 5 }, { coalesce: `${item.id}:max` })} />}</Field>;
    case 'scale':
      return (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Minimum">{id => <NumberInput id={id} value={item.min ?? 1} onChange={v => updItem({ min: Number.isInteger(v) ? v : 1 }, { coalesce: `${item.id}:min` })} />}</Field>
          <Field label="Maximum">{id => <NumberInput id={id} value={item.max ?? 10} onChange={v => updItem({ max: Number.isInteger(v) ? Math.min(100, v) : 10 }, { coalesce: `${item.id}:max` })} />}</Field>
          <Field label="Libellé du minimum">{id => <input id={id} className="input" value={item.minLabel || ''} onChange={e => updItem({ minLabel: e.target.value || undefined }, { coalesce: `${item.id}:minl` })} />}</Field>
          <Field label="Libellé du maximum">{id => <input id={id} className="input" value={item.maxLabel || ''} onChange={e => updItem({ maxLabel: e.target.value || undefined }, { coalesce: `${item.id}:maxl` })} />}</Field>
        </div>
      );
    case 'payment': {
      const mode = item.options?.some(o => typeof o.price === 'number') ? 'options' : item.amount && typeof item.amount === 'object' ? 'formula' : 'fixed';
      return (
        <div className="space-y-2">
          <p className="text-xs font-medium text-dim">Montant</p>
          <Segmented label="Mode de calcul du montant" value={mode} onChange={m => {
            if (m === 'fixed') updItem({ amount: 10, options: undefined }, { snapshot: 'Montant' });
            else if (m === 'formula') updItem({ amount: { expr: def.variables?.[0]?.key || '10' }, options: undefined }, { snapshot: 'Montant' });
            else updItem({ amount: undefined, options: [{ value: 'tarif_1', label: 'Tarif normal', price: 10 }, { value: 'tarif_2', label: 'Tarif réduit', price: 5 }] }, { snapshot: 'Montant' });
          }} options={[{ value: 'fixed', label: 'Fixe' }, { value: 'formula', label: 'Formule' }, { value: 'options', label: 'Selon la formule choisie' }]} />
          {mode === 'fixed' && <Field label="Montant (€)">{id => <NumberInput id={id} min={0} step="0.01" value={item.amount} onChange={v => updItem({ amount: v }, { coalesce: `${item.id}:amount` })} />}</Field>}
          {mode === 'formula' && <FormulaInput label="Montant calculé (€)" def={def} excludeKey={item.key} value={item.amount?.expr || ''} onChange={v => updItem({ amount: { expr: v } }, { coalesce: `${item.id}:amountx` })} placeholder="ex. tarif ou SI(adherent; 10; 15)" />}
          {mode === 'options' && <p className="text-[11px] text-muted">Les tarifs se règlent dans l'onglet « Options » (prix par option).</p>}
          <p className="text-[11px] text-muted">Le paiement en ligne (HelloAsso) est géré côté serveur après l'envoi de la réponse.</p>
        </div>
      );
    }
    case 'calculated':
      return (
        <div className="space-y-2">
          <FormulaInput label="Formule du champ calculé" def={def} excludeKey={item.key} value={item.expr || ''} onChange={v => updItem({ expr: v }, { coalesce: `${item.id}:expr` })}
            extraInfo={calcValue !== null ? `Valeur avec les réponses d'essai : ${calcValue}` : ''} />
          <Field label="Type du résultat">
            {id => (
              <select id={id} className="input !py-1.5 text-sm" value={item.valueType || 'auto'} onChange={e => updItem({ valueType: e.target.value === 'auto' ? undefined : e.target.value })}>
                <option value="auto">Automatique</option><option value="number">Nombre</option><option value="text">Texte</option><option value="boolean">Oui / Non</option><option value="date">Date</option>
              </select>
            )}
          </Field>
        </div>
      );
    case 'hidden':
      return <p className="text-[11px] text-muted">Champ invisible pour le répondant : sa valeur vient d'un préremplissage (onglet Logique), par exemple un paramètre d'adresse <code>?source=insta</code>.</p>;
    case 'member_picker': case 'event_picker':
      return <Toggle label="Sélection multiple" checked={!!item.multiple} onChange={v => updItem({ multiple: v || undefined }, { snapshot: 'Sélection multiple' })} />;
    case 'slots':
      return <Toggle label="Plusieurs créneaux possibles" checked={!!item.multiple} onChange={v => updItem({ multiple: v || undefined }, { snapshot: 'Sélection multiple' })} />;
    case 'consent':
      return <p className="text-[11px] text-muted">Une case de consentement est obligatoire par défaut (exigence RGPD : consentement explicite).</p>;
    default:
      return null;
  }
}

function ChoicesTab({ def, item, updItem }) {
  const uid = useId();
  const anyPrice = item.options?.some(o => typeof o.price === 'number');
  const [showPrice, setShowPrice] = useState(anyPrice || item.type === 'payment');
  const anyCapacity = item.options?.some(o => typeof o.capacity === 'number');
  const [showCapacity, setShowCapacity] = useState(anyCapacity || item.type === 'slots');
  if (item.type === 'matrix') {
    return (
      <div className="space-y-3">
        <OptionsEditor title="Lignes" addLabel="Ajouter une ligne" options={item.options} def={def} features={{ condition: true }} onChange={o => updItem({ options: o }, { coalesce: `${item.id}:opts` })} />
        <OptionsEditor title="Colonnes" addLabel="Ajouter une colonne" options={item.columns} def={def} onChange={c => updItem({ columns: c }, { coalesce: `${item.id}:cols` })} />
        <Toggle label="Plusieurs réponses par ligne" checked={!!item.multiple} onChange={v => updItem({ multiple: v || undefined })} />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {SOURCE_TYPES.has(item.type) && (
        <div className="space-y-1">
          <label htmlFor={`${uid}-src`} className="text-xs font-medium text-dim">Source des choix</label>
          <select id={`${uid}-src`} className="input !py-1.5 text-sm" value={item.source || ''}
            onChange={e => updItem(e.target.value ? { source: e.target.value, options: undefined } : { source: undefined, options: item.options?.length ? item.options : [{ value: 'option_1', label: 'Option 1' }] }, { snapshot: 'Source des choix' })}>
            {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          {item.source && <p className="text-[11px] text-muted">Les choix sont alimentés automatiquement par les données du BDE ({SOURCES.find(s => s.value === item.source)?.label.toLowerCase()}) figées au moment de la publication (republie pour les mettre à jour).</p>}
        </div>
      )}
      {!item.source && (
        <>
          <div className="flex flex-wrap gap-x-4">
            {item.type !== 'slots' && <Toggle label="Capacités" checked={showCapacity} onChange={setShowCapacity} />}
            <Toggle label="Prix par option" checked={showPrice} onChange={setShowPrice} />
          </div>
          <OptionsEditor
            title={item.type === 'slots' ? 'Créneaux' : 'Options'}
            addLabel={item.type === 'slots' ? 'Ajouter un créneau' : 'Ajouter une option'}
            options={item.options}
            def={def}
            features={{ capacity: showCapacity || item.type === 'slots', price: showPrice, image: item.type === 'image_choice', condition: true }}
            onChange={o => updItem({ options: o }, { coalesce: `${item.id}:opts` })}
          />
        </>
      )}
    </div>
  );
}

function ValidationTab({ item, updItem }) {
  const v = item.validation || {};
  const setV = (patch, coalesce) => {
    const next = { ...v, ...patch };
    for (const k of Object.keys(next)) if (next[k] === undefined || next[k] === '' || next[k] === null || (Array.isArray(next[k]) && !next[k].length)) delete next[k];
    updItem({ validation: Object.keys(next).length ? next : undefined }, { coalesce: `${item.id}:val:${coalesce || Object.keys(patch)[0]}` });
  };
  const t = item.type;
  const blocks = [];
  if (TEXTLIKE.has(t)) blocks.push(<TextValidation key="text" v={v} setV={setV} item={item} />);
  if (t === 'number' || t === 'payment') {
    blocks.push(
      <div key="num" className="grid grid-cols-2 gap-2">
        <Field label="Minimum">{id => <NumberInput id={id} value={v.min} onChange={x => setV({ min: x })} />}</Field>
        <Field label="Maximum">{id => <NumberInput id={id} value={v.max} onChange={x => setV({ max: x })} />}</Field>
      </div>,
    );
  }
  if (t === 'date' || t === 'datetime' || t === 'time') {
    const inputType = t === 'date' ? 'date' : t === 'time' ? 'time' : 'datetime-local';
    blocks.push(
      <div key="date" className="grid grid-cols-2 gap-2">
        {['min', 'max'].map(k => (
          <Field key={k} label={k === 'min' ? 'Au plus tôt' : 'Au plus tard'}>
            {id => (
              <div className="space-y-1">
                <input id={id} type={inputType} className="input !py-1.5 text-xs" disabled={v[k] === 'today'} value={v[k] === 'today' ? '' : v[k] || ''} onChange={e => setV({ [k]: e.target.value || undefined })} />
                {t === 'date' && (
                  <label className="flex items-center gap-1.5 text-[11px] text-dim">
                    <input type="checkbox" checked={v[k] === 'today'} onChange={e => setV({ [k]: e.target.checked ? 'today' : undefined })} /> aujourd'hui
                  </label>
                )}
              </div>
            )}
          </Field>
        ))}
      </div>,
    );
  }
  if (t === 'multiple_choice' || t === 'slots' || t === 'image_choice') {
    blocks.push(
      <div key="sel" className="grid grid-cols-2 gap-2">
        <Field label="Choix minimum">{id => <NumberInput id={id} min={0} value={v.minSelected} onChange={x => setV({ minSelected: Number.isInteger(x) ? x : undefined })} />}</Field>
        <Field label="Choix maximum">{id => <NumberInput id={id} min={1} value={v.maxSelected} onChange={x => setV({ maxSelected: Number.isInteger(x) ? x : undefined })} />}</Field>
      </div>,
    );
  }
  if (t === 'file') {
    const accept = Array.isArray(v.accept) ? v.accept : [];
    blocks.push(
      <div key="file" className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Nombre de fichiers max">{id => <NumberInput id={id} min={1} max={20} value={v.maxFiles} onChange={x => setV({ maxFiles: Number.isInteger(x) ? x : undefined })} />}</Field>
          <Field label="Taille max (Mo)">{id => <NumberInput id={id} min={1} max={50} value={v.maxFileSizeMb} onChange={x => setV({ maxFileSizeMb: x })} />}</Field>
        </div>
        <fieldset>
          <legend className="text-xs font-medium text-dim mb-1">Types acceptés</legend>
          <div className="flex flex-wrap gap-1.5">
            {ACCEPT_PRESETS.map(a => {
              const on = accept.includes(a.value);
              return (
                <button key={a.value} type="button" aria-pressed={on} className={`chip ${on ? 'chip-active' : 'chip-idle'}`}
                  onClick={() => setV({ accept: on ? accept.filter(x => x !== a.value) : [...accept, a.value] })}>{a.label}</button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted mt-1">{accept.length ? accept.join(', ') : 'Tous les types de fichiers.'}</p>
        </fieldset>
      </div>,
    );
  }
  if (['short_text', 'email', 'phone', 'number', 'url'].includes(t)) {
    blocks.push(<Toggle key="uniq" label="Réponse unique parmi toutes les réponses" hint="Ex. un seul envoi par adresse e-mail (vérifié par le serveur)." checked={!!v.uniqueAcrossResponses} onChange={x => setV({ uniqueAcrossResponses: x || undefined })} />);
  }
  if (!blocks.length) return <p className="text-xs text-muted">Pas de règle de validation supplémentaire pour ce type : le format est contrôlé automatiquement.</p>;
  return <div className="space-y-3">{blocks}</div>;
}

function TextValidation({ v, setV, item }) {
  const [sample, setSample] = useState('');
  const rx = useMemo(() => (v.pattern ? safeRegex(v.pattern) : null), [v.pattern]);
  const ok = rx?.rx ? rx.rx.test(sample) : null;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Longueur minimale">{id => <NumberInput id={id} min={0} value={v.minLength} onChange={x => setV({ minLength: Number.isInteger(x) ? x : undefined })} />}</Field>
        <Field label="Longueur maximale">{id => <NumberInput id={id} min={1} value={v.maxLength} onChange={x => setV({ maxLength: Number.isInteger(x) ? x : undefined })} />}</Field>
      </div>
      {item.type !== 'email' && item.type !== 'url' && (
        <>
          <Field label="Format (expression régulière)" error={rx?.error ? rx.error : null} hint="Ex. ^[0-9]{5}$ pour un code postal.">
            {id => <input id={id} className="input font-mono text-xs" value={v.pattern || ''} onChange={e => setV({ pattern: e.target.value || undefined }, 'pattern')} placeholder="^[A-Z]{2}[0-9]{4}$" />}
          </Field>
          {v.pattern && (
            <>
              <Field label="Message si le format est incorrect">{id => <input id={id} className="input" value={v.patternMessage || ''} onChange={e => setV({ patternMessage: e.target.value || undefined }, 'pmsg')} placeholder="Le format n'est pas valide." />}</Field>
              <Field label="Tester une réponse" error={ok === false && sample ? 'Ne correspond pas au format.' : null} hint={ok && sample ? '✓ Correspond au format.' : 'Saisis un exemple pour vérifier.'}>
                {id => <input id={id} className={`input ${ok && sample ? '!border-emerald-500' : ''}`} value={sample} onChange={e => setSample(e.target.value)} />}
              </Field>
            </>
          )}
        </>
      )}
    </div>
  );
}

function LogicPropsTab({ def, item, updItem }) {
  const uid = useId();
  const prefill = String(item.prefillFrom || '');
  const prefillMode = prefill.startsWith('url:') ? 'url' : prefill;
  const dflt = item.default;
  const defaultMode = dflt === undefined || dflt === null || dflt === '' ? 'none' : typeof dflt === 'object' && 'expr' in dflt ? 'formula' : 'fixed';
  return (
    <div className="space-y-3">
      <ConditionEditor label="Afficher la question si" emptyLabel="Toujours affichée" def={def} excludeKey={item.key} value={item.showIf} onChange={v => updItem({ showIf: v }, { coalesce: `${item.id}:showIf` })} />
      {item.type !== 'calculated' && (
        <ConditionEditor label="Lecture seule si" emptyLabel="Jamais" def={def} excludeKey={item.key} value={item.readOnlyIf} onChange={v => updItem({ readOnlyIf: v }, { coalesce: `${item.id}:ro` })} />
      )}
      {item.type !== 'calculated' && (
        <div className="space-y-2">
          <label htmlFor={`${uid}-pf`} className="text-xs font-medium text-dim">Préremplissage</label>
          <select id={`${uid}-pf`} className="input !py-1.5 text-sm" value={prefillMode}
            onChange={e => updItem({ prefillFrom: e.target.value === 'url' ? 'url:source' : e.target.value || undefined }, { snapshot: 'Préremplissage' })}>
            {PREFILLS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          {prefillMode === 'url' && (
            <div className="space-y-1">
              <label htmlFor={`${uid}-pp`} className="text-[11px] text-dim">Nom du paramètre</label>
              <input id={`${uid}-pp`} className="input font-mono text-xs" value={prefill.slice(4)} onChange={e => updItem({ prefillFrom: `url:${e.target.value.replace(/[^A-Za-z0-9_.-]/g, '')}` }, { coalesce: `${item.id}:pf` })} />
              <p className="text-[11px] text-muted font-mono break-all">…/#/f/{def.slug}?{prefill.slice(4) || 'param'}=valeur</p>
            </div>
          )}
        </div>
      )}
      {item.type !== 'calculated' && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-dim">Valeur par défaut</p>
          <Segmented label="Valeur par défaut" value={defaultMode} onChange={m => updItem({ default: m === 'none' ? undefined : m === 'formula' ? { expr: '' } : '' }, { snapshot: 'Valeur par défaut' })}
            options={[{ value: 'none', label: 'Aucune' }, { value: 'fixed', label: 'Fixe' }, { value: 'formula', label: 'Calculée' }]} />
          {defaultMode === 'fixed' || (defaultMode === 'none' && dflt === '') ? (
            <DefaultValueInput item={item} value={dflt} onChange={x => updItem({ default: x }, { coalesce: `${item.id}:dflt` })} />
          ) : null}
          {defaultMode === 'formula' && (
            <FormulaInput label="Formule de la valeur par défaut" def={def} excludeKey={item.key} value={dflt.expr || ''} onChange={x => updItem({ default: { expr: x } }, { coalesce: `${item.id}:dfltx` })} placeholder="ex. membre.email" hint="Appliquée seulement si la question est vide." />
          )}
        </div>
      )}
    </div>
  );
}

function DefaultValueInput({ item, value, onChange }) {
  const id = useId();
  if (item.type === 'yes_no') {
    return (
      <select id={id} aria-label="Valeur par défaut" className="input !py-1.5 text-sm" value={value === true ? 'oui' : value === false ? 'non' : ''} onChange={e => onChange(e.target.value === 'oui' ? true : e.target.value === 'non' ? false : '')}>
        <option value="">—</option><option value="oui">Oui</option><option value="non">Non</option>
      </select>
    );
  }
  if (Array.isArray(item.options) && item.options.length && item.type !== 'matrix') {
    return (
      <select id={id} aria-label="Valeur par défaut" className="input !py-1.5 text-sm" value={value ?? ''} onChange={e => onChange(e.target.value)}>
        <option value="">—</option>
        {item.options.map(o => <option key={String(o.value)} value={String(o.value)}>{o.label || o.value}</option>)}
      </select>
    );
  }
  const type = item.type === 'number' ? 'number' : item.type === 'date' ? 'date' : item.type === 'time' ? 'time' : 'text';
  return <input id={id} aria-label="Valeur par défaut" type={type} className="input" value={value ?? ''} onChange={e => onChange(type === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value)} />;
}

function AdvancedTab({ def, item, updItem }) {
  const scored = !!item.score;
  const canScore = SCORABLE.has(item.type);
  return (
    <div className="space-y-3">
      <Toggle label="Donnée sensible" hint="Masquée par défaut dans les réponses, purgée en priorité. Recommandé pour santé, date de naissance, coordonnées bancaires." checked={!!item.sensitive} onChange={v => updItem({ sensitive: v || undefined }, { snapshot: 'Donnée sensible' })} />
      {!['calculated', 'hidden', 'consent', 'payment', 'signature'].includes(item.type) && (
        <div className="space-y-2">
          <Toggle label="Question répétable" hint="Le répondant peut ajouter plusieurs réponses (ex. plusieurs allergies)." checked={!!item.repeat} onChange={v => updItem({ repeat: v ? { min: 1, max: 5, addLabel: 'Ajouter' } : undefined }, { snapshot: 'Répétition' })} />
          {item.repeat && <RepeatFields repeat={item.repeat} onChange={r => updItem({ repeat: r }, { coalesce: `${item.id}:rep` })} />}
          {item.repeat && (item.repeat.min ?? 0) >= 1 && <p className="text-[11px] text-amber-700 dark:text-amber-300">Avec un minimum de {item.repeat.min}, la question devient obligatoire (au moins {item.repeat.min} réponse{item.repeat.min > 1 ? 's' : ''}).</p>}
        </div>
      )}
      {canScore && (
        <div className="space-y-2">
          <Toggle label="Question notée (quiz)" hint={def.kind !== 'quiz' ? 'Le score s\'utilise surtout avec le type « Quiz ».' : undefined} checked={scored}
            onChange={v => updItem({ score: v ? (item.type === 'multiple_choice' ? { perOption: {} } : { points: 1 }) : undefined }, { snapshot: 'Score' })} />
          {scored && <ScoreFields item={item} updItem={updItem} />}
        </div>
      )}
    </div>
  );
}

function RepeatFields({ repeat, onChange }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <Field label="Min">{id => <NumberInput id={id} min={0} value={repeat.min} onChange={v => onChange({ ...repeat, min: Number.isInteger(v) ? v : undefined })} />}</Field>
      <Field label="Max">{id => <NumberInput id={id} min={1} max={200} value={repeat.max} onChange={v => onChange({ ...repeat, max: Number.isInteger(v) ? v : undefined })} />}</Field>
      <Field label="Bouton">{id => <input id={id} className="input" value={repeat.addLabel || ''} onChange={e => onChange({ ...repeat, addLabel: e.target.value || undefined })} />}</Field>
    </div>
  );
}

function ScoreFields({ item, updItem }) {
  const s = item.score || {};
  const set = patch => {
    const next = { ...s, ...patch };
    for (const k of Object.keys(next)) if (next[k] === undefined || next[k] === '') delete next[k];
    updItem({ score: next }, { coalesce: `${item.id}:score` });
  };
  if (item.type === 'multiple_choice') {
    const per = s.perOption || {};
    return (
      <div className="space-y-1.5">
        <p className="text-[11px] text-dim">Points par option cochée (négatif pour pénaliser une mauvaise réponse).</p>
        {(item.options || []).map(o => (
          <div key={String(o.value)} className="flex items-center gap-2">
            <label htmlFor={`sc-${item.id}-${o.value}`} className="text-xs text-ink flex-1 truncate">{o.label}</label>
            <input id={`sc-${item.id}-${o.value}`} type="number" step="0.5" className="input !py-1 !w-20 text-xs" value={per[o.value] ?? ''}
              onChange={e => set({ perOption: { ...per, [o.value]: e.target.value === '' ? undefined : Number(e.target.value) } })} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
      <Field label="Bonne réponse">
        {id => item.type === 'yes_no' ? (
          <select id={id} className="input !py-1.5 text-sm" value={s.correct === true ? 'oui' : s.correct === false ? 'non' : ''} onChange={e => set({ correct: e.target.value === 'oui' ? true : e.target.value === 'non' ? false : undefined })}>
            <option value="">—</option><option value="oui">Oui</option><option value="non">Non</option>
          </select>
        ) : Array.isArray(item.options) ? (
          <select id={id} className="input !py-1.5 text-sm" value={s.correct ?? ''} onChange={e => set({ correct: e.target.value || undefined })}>
            <option value="">—</option>
            {item.options.map(o => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
          </select>
        ) : (
          <input id={id} type={item.type === 'number' ? 'number' : 'text'} className="input" value={s.correct ?? ''} onChange={e => set({ correct: item.type === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value })} />
        )}
      </Field>
      <Field label="Points">{id => <NumberInput id={id} step="0.5" value={s.points} onChange={v => set({ points: v })} />}</Field>
    </div>
  );
}

// ── Blocs ───────────────────────────────────────────────────
function SectionProps({ def, item, updItem }) {
  const others = useMemo(() => usedKeys(def, item.id), [def, item.id]);
  const keyError = item.repeat ? (!item.key ? 'Clé obligatoire pour une section répétable.' : !KEY_RX.test(item.key) ? 'Clé invalide.' : others.has(item.key) ? 'Clé déjà utilisée.' : null) : null;
  return (
    <div className="space-y-3">
      <Field label="Titre de la section">{id => <input id={id} className="input" value={item.title || ''} onChange={e => updItem({ title: e.target.value }, { coalesce: `${item.id}:title` })} />}</Field>
      <Field label="Description">{id => <textarea id={id} rows={2} className="input" value={item.description || ''} onChange={e => updItem({ description: e.target.value || undefined }, { coalesce: `${item.id}:desc` })} />}</Field>
      <Toggle label="Repliable" checked={!!item.collapsible} onChange={v => updItem({ collapsible: v || undefined })} />
      <Toggle label="Section répétable" hint="Ex. plusieurs dépenses, plusieurs participants. Les réponses sont enregistrées sous la clé de la section." checked={!!item.repeat}
        onChange={v => updItem(v ? { repeat: { min: 1, max: 10, addLabel: 'Ajouter' }, key: item.key || newKeyFromLabel(item.title || 'groupe', others) } : { repeat: undefined }, { snapshot: 'Section répétable' })} />
      {item.repeat && (
        <>
          <Field label="Clé du groupe" error={keyError}>{id => <input id={id} className="input font-mono text-xs" value={item.key || ''} onChange={e => updItem({ key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') }, { coalesce: `${item.id}:key` })} />}</Field>
          <RepeatFields repeat={item.repeat} onChange={r => updItem({ repeat: r }, { coalesce: `${item.id}:rep` })} />
        </>
      )}
      <ConditionEditor label="Afficher la section si" emptyLabel="Toujours affichée" def={def} value={item.showIf} onChange={v => updItem({ showIf: v }, { coalesce: `${item.id}:showIf` })} />
    </div>
  );
}

function ColumnsProps({ def, item, updItem }) {
  const n = item.columns?.length || 2;
  const setCount = (count) => {
    const cols = [...(item.columns || [])];
    if (count > cols.length) while (cols.length < count) cols.push([]);
    else {
      // Les éléments des colonnes retirées rejoignent la dernière colonne conservée.
      const extra = cols.splice(count).flat();
      cols[count - 1] = [...cols[count - 1], ...extra];
    }
    updItem({ columns: cols }, { snapshot: 'Colonnes' });
  };
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-xs font-medium text-dim">Nombre de colonnes</p>
        <Segmented label="Nombre de colonnes" value={String(n)} onChange={v => setCount(Number(v))} options={[{ value: '2', label: '2' }, { value: '3', label: '3' }]} />
        <p className="text-[11px] text-muted">Sur téléphone, les colonnes s'empilent automatiquement.</p>
      </div>
      <ConditionEditor label="Afficher le bloc si" emptyLabel="Toujours affiché" def={def} value={item.showIf} onChange={v => updItem({ showIf: v }, { coalesce: `${item.id}:showIf` })} />
    </div>
  );
}

function ContentProps({ def, item, updItem }) {
  const [busy, setBusy] = useState(false);
  const pick = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const ref = await importPublicImage(file);
      updItem({ image: ref }, { snapshot: 'Image' });
      toast.success('Image ajoutée', `${formatKb(imageBytes(ref))} (compressée pour la page publique)`);
    } catch (err) {
      toast.error('Image refusée', String(err?.message || err));
    } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3">
      <Field label="Type de contenu">
        {id => (
          <select id={id} className="input !py-1.5 text-sm" value={item.format || 'text'} onChange={e => updItem({ format: e.target.value }, { snapshot: 'Contenu' })}>
            <option value="text">Texte</option><option value="image">Image</option><option value="divider">Séparateur</option>
          </select>
        )}
      </Field>
      {(item.format || 'text') === 'text' && (
        <Field label="Texte" hint="**gras**, *italique*, [lien](https://…) et listes « - » sont pris en charge.">
          {id => <textarea id={id} rows={6} className="input" value={item.text || ''} onChange={e => updItem({ text: e.target.value }, { coalesce: `${item.id}:text` })} />}
        </Field>
      )}
      {item.format === 'image' && (
        <div className="space-y-2">
          {item.image?.dataUrl ? (
            <div className="relative">
              <img src={item.image.dataUrl} alt={item.alt || ''} className="w-full max-h-48 object-contain rounded-lg border border-line bg-elevated" />
              <button type="button" className="absolute top-1 right-1 btn-secondary !p-1" aria-label="Retirer l'image" onClick={() => updItem({ image: undefined })}><X size={14} aria-hidden="true" /></button>
              <p className="text-[11px] text-muted mt-1">{formatKb(imageBytes(item.image))} — copie publique compressée</p>
            </div>
          ) : (
            <label className="btn-secondary w-full cursor-pointer">
              <ImagePlus size={15} aria-hidden="true" /> {busy ? 'Compression…' : 'Choisir une image'}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={e => { pick(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
          )}
          <Field label="Texte alternatif (accessibilité)">{id => <input id={id} className="input" value={item.alt || ''} onChange={e => updItem({ alt: e.target.value || undefined }, { coalesce: `${item.id}:alt` })} />}</Field>
        </div>
      )}
      <ConditionEditor label="Afficher si" emptyLabel="Toujours affiché" def={def} value={item.showIf} onChange={v => updItem({ showIf: v }, { coalesce: `${item.id}:showIf` })} />
    </div>
  );
}


