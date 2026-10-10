// Création d'un formulaire : page blanche, modèle ou import JSON.
import { Suspense, useMemo, useRef, useState } from 'react';
import { FilePlus2, LayoutTemplate, Upload, ArrowLeft, Check } from 'lucide-react';
import Modal from '../../components/Modal.jsx';
import { FORM_TEMPLATES, TEMPLATE_CATEGORIES } from '../../forms/templates/index.js';
import { FORM_KINDS, QUESTION_TYPES } from '../../forms/schema.js';
import { flattenItems } from '../../forms/engine/index.js';
import { navigate } from '../../core/router.js';
import { toast } from '../../components/ui/toastStore.js';
import { useFormsStore } from './store.js';
import { IconByName, SafeBoundary } from './ui.jsx';
import { FormRenderer, useRendererContext, resolveSources } from './integrations.js';

const TYPE_LABEL = Object.fromEntries(QUESTION_TYPES.map(t => [t.type, t.label]));
const KIND_LABEL = Object.fromEntries(FORM_KINDS.map(k => [k.id, k.label]));

export default function NewFormModal({ isOpen, onClose }) {
  const createForm = useFormsStore(s => s.createForm);
  const importForm = useFormsStore(s => s.importForm);
  const [step, setStep] = useState('choice'); // choice | templates
  const [category, setCategory] = useState('');
  const [selected, setSelected] = useState(null);
  const fileRef = useRef(null);

  const close = () => { setStep('choice'); setSelected(null); setCategory(''); onClose(); };
  const open = (id) => { close(); navigate('forms', id); };

  const blank = () => {
    const id = createForm(null);
    toast.success('Formulaire créé', 'Ajoute tes premières questions depuis la palette.');
    open(id);
  };
  const fromTemplate = (tpl) => {
    const id = createForm(tpl.build(), `Modèle « ${tpl.title} »`);
    toast.success('Formulaire créé depuis un modèle', tpl.title);
    open(id);
  };
  const onImport = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Import impossible', 'Fichier trop volumineux (5 Mo maximum).'); return; }
    try {
      const text = await file.text();
      const id = importForm(text);
      toast.success('Formulaire importé', 'Un nouveau brouillon a été créé.');
      open(id);
    } catch (err) {
      toast.error('Import impossible', err instanceof SyntaxError ? 'Le fichier n\'est pas un JSON valide.' : String(err?.message || err));
    }
  };

  const templates = useMemo(() => FORM_TEMPLATES.filter(t => !category || t.category === category), [category]);

  return (
    <Modal isOpen={isOpen} onClose={close} maxWidth={step === 'templates' ? 'max-w-5xl' : 'max-w-2xl'}
      title={step === 'templates' ? 'Bibliothèque de modèles' : 'Nouveau formulaire'}
      description={step === 'templates' ? 'Des formulaires complets et testés, à adapter à ton BDE.' : 'Comment veux-tu commencer ?'}>
      {step === 'choice' && (
        <div className="grid sm:grid-cols-3 gap-3">
          <ChoiceCard icon={FilePlus2} title="Page blanche" onClick={blank}>Un formulaire vide, une page.</ChoiceCard>
          <ChoiceCard icon={LayoutTemplate} title="Depuis un modèle" onClick={() => setStep('templates')}>{FORM_TEMPLATES.length} modèles professionnels.</ChoiceCard>
          <ChoiceCard icon={Upload} title="Importer un JSON" onClick={() => fileRef.current?.click()}>Un formulaire exporté depuis le Studio.</ChoiceCard>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onImport} aria-label="Fichier JSON à importer" />
        </div>
      )}
      {step === 'templates' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-ghost !px-2" onClick={() => { setStep('choice'); setSelected(null); }}>
              <ArrowLeft size={15} aria-hidden="true" /> Retour
            </button>
            <div role="group" aria-label="Catégories" className="flex flex-wrap gap-1.5">
              <button type="button" className={`chip ${!category ? 'chip-active' : 'chip-idle'}`} aria-pressed={!category} onClick={() => setCategory('')}>Tous</button>
              {TEMPLATE_CATEGORIES.map(c => (
                <button key={c} type="button" className={`chip ${category === c ? 'chip-active' : 'chip-idle'}`} aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>
              ))}
            </div>
          </div>
          <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-4">
            <ul className="grid sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2 content-start">
              {templates.map(t => (
                <li key={t.id}>
                  <button type="button" onClick={() => setSelected(t)} aria-pressed={selected?.id === t.id}
                    className={`w-full text-left p-3 rounded-xl border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${selected?.id === t.id ? 'border-blue-500 bg-blue-500/5' : 'border-line bg-surface hover:border-line-strong'}`}>
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 rounded-lg bg-elevated border border-line flex items-center justify-center text-dim shrink-0"><IconByName name={t.icon} /></span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-ink truncate">{t.title}</span>
                        <span className="block text-[11px] text-muted">{t.category} · {KIND_LABEL[t.kind]}</span>
                      </span>
                    </div>
                    <p className="text-xs text-dim mt-2 line-clamp-2">{t.description}</p>
                  </button>
                </li>
              ))}
            </ul>
            <div className="min-w-0">
              {selected ? <TemplatePreview key={selected.id} tpl={selected} onUse={() => fromTemplate(selected)} /> : (
                <div className="h-full min-h-48 border border-dashed border-line rounded-2xl flex items-center justify-center text-sm text-muted p-6 text-center">
                  Sélectionne un modèle pour voir son aperçu.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ChoiceCard({ icon: Icon, title, children, onClick }) {
  return (
    <button type="button" onClick={onClick} className="text-left p-4 rounded-2xl border border-line bg-surface hover:border-blue-500/50 hover:bg-blue-500/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60">
      <Icon size={22} className="text-blue-600 dark:text-blue-400" aria-hidden="true" />
      <span className="block font-semibold text-ink mt-2">{title}</span>
      <span className="block text-xs text-dim mt-1">{children}</span>
    </button>
  );
}

function TemplatePreview({ tpl, onUse }) {
  const def = useMemo(() => ({ ...tpl.build(), id: `preview-${tpl.id}` }), [tpl]);
  const context = useRendererContext();
  const [answers, setAnswers] = useState({});
  const [mode, setMode] = useState(FormRenderer ? 'render' : 'outline');
  const entries = useMemo(() => flattenItems(def).filter(e => e.item.kind === 'question'), [def]);
  return (
    <div className="border border-line rounded-2xl overflow-hidden flex flex-col max-h-[70vh]">
      <div className="p-3 border-b border-line bg-elevated flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-ink text-sm">{tpl.title}</h3>
          <p className="text-[11px] text-dim">{def.pages.length} page{def.pages.length > 1 ? 's' : ''} · {entries.length} questions</p>
        </div>
        <div className="flex items-center gap-2">
          {FormRenderer && (
            <button type="button" className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setMode(m => (m === 'render' ? 'outline' : 'render'))}>
              {mode === 'render' ? 'Voir le plan' : 'Voir le rendu'}
            </button>
          )}
          <button type="button" className="btn-primary !py-1.5" onClick={onUse}><Check size={15} aria-hidden="true" /> Utiliser ce modèle</button>
        </div>
      </div>
      <div className="p-3 border-b border-line">
        <p className="text-xs text-dim">{tpl.description}</p>
        <ul className="flex flex-wrap gap-1.5 mt-2">
          {tpl.highlights.map(h => <li key={h} className="badge badge-brand">{h}</li>)}
        </ul>
      </div>
      <div className="overflow-y-auto flex-1 min-h-0">
        {mode === 'render' && FormRenderer ? (
          <SafeBoundary resetKey={tpl.id}>
            <Suspense fallback={<p className="p-4 text-sm text-dim">Chargement de l'aperçu…</p>}>
              <FormRenderer definition={resolveSources(def, context)} answers={answers} onAnswersChange={setAnswers} mode="preview" device="mobile" context={context} />
            </Suspense>
          </SafeBoundary>
        ) : (
          <ol className="p-3 space-y-3">
            {def.pages.map((p, i) => (
              <li key={p.id}>
                <p className="text-xs font-semibold text-ink">Page {i + 1} — {p.title}{p.logic?.showIf ? <span className="badge badge-amber ml-2">conditionnelle</span> : null}</p>
                <ul className="mt-1 space-y-0.5">
                  {entries.filter(e => e.pageId === p.id).map(e => (
                    <li key={e.item.id} className="text-xs text-dim flex gap-2">
                      <span className="text-muted shrink-0 w-28 truncate">{TYPE_LABEL[e.item.type]}</span>
                      <span className="truncate">{e.item.label}{e.item.required === true ? ' *' : ''}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
