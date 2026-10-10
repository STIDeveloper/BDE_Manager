// ============================================================
// STUDIO FORMULAIRES — moteur d'affichage d'un formulaire
// ============================================================
// Utilisé par la page publique (#/f/<slug>), le mode borne et l'aperçu en
// direct de l'éditeur. Composant contrôlé : les réponses appartiennent au
// parent (`answers` + `onAnswersChange`). Les règles (visibilité, sauts de
// page, obligations, calculs, validation) viennent du moteur
// src/forms/engine (evaluateForm / validateAnswers).
//
// Props :
//   definition, answers, onAnswersChange(next),
//   mode: 'live' | 'preview' | 'kiosk' (défaut 'live'),
//   context?: { member?, params?, stats?, now?, members?, events? }
//   pageId?, onPageChange?(id)  (page contrôlée si pageId est fourni)
//   onSubmit?(cleanedAnswers, meta) — async ; lever une erreur { message, fields? } en cas de refus
//   submitLabel?, readOnly?, device?: 'desktop'|'tablet'|'mobile' (aperçu),
//   highlightItemId?, onItemClick?(itemId) (aperçu)
//   submitSlot? (nœud rendu au-dessus du bouton d'envoi : anti-robot…),
//   header? (afficher logo/titre/description, défaut true), fileStore? ({ put, get, remove }),
//   topSlot? / bottomSlot? (nœuds au-dessus / au-dessous du formulaire), fullHeight? (hauteur d'écran)

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, Check, EyeOff, Loader2, Send } from 'lucide-react';
import { evaluateForm, validateAnswers, flattenItems, formatMoneyFr } from '../engine/index.js';
import { resolveTheme } from './theme.js';
import { useMediaSrc } from './media.js';
import { putBlob, getBlob, deleteBlob } from './localStore.js';
import { RendererContext } from './context.js';
import { useSystemDark } from './hooks.js';
import { ItemList } from './Items.jsx';
import RichText from './RichText.jsx';
import './runtime.css';

const attachMods = import.meta.glob('../../core/attachments.js');

const hasOwn = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const EMPTY = Object.freeze({});
const DEVICE_WIDTH = { mobile: 375, tablet: 768 };

/** Stockage des fichiers selon le mode (aperçu : pièces jointes de l'app ; sinon : base locale du répondant). */
function defaultFileStore(mode) {
  if (mode === 'preview') {
    const load = () => {
      const l = Object.values(attachMods)[0];
      if (!l) throw new Error('Stockage de fichiers indisponible.');
      return l();
    };
    return {
      put: async file => { const m = await load(); const ref = await m.saveAttachment(file, { scope: 'forms-preview' }); return { id: ref.id, name: ref.name, size: ref.size, type: ref.type, local: true }; },
      get: async id => { const m = await load(); return m.getAttachmentBlob(id); },
      remove: async ref => { const m = await load(); return m.deleteAttachment(ref.id); },
    };
  }
  return { put: putBlob, get: getBlob, remove: ref => deleteBlob(ref.id) };
}

/** Page contenant chaque clé de réponse / identifiant d'élément. */
function pageIndexOf(definition) {
  const map = new Map();
  for (const e of flattenItems(definition)) {
    if (e.item.id !== undefined) map.set(String(e.item.id), e.pageId);
    if (e.item.key) map.set(e.item.key, e.pageId);
  }
  return map;
}

function Progress({ kind, order, current, pages }) {
  const idx = Math.max(0, order.indexOf(current));
  const total = Math.max(1, order.length);
  if (kind === 'none' || total < 2) return null;
  if (kind === 'steps') {
    return (
      <nav aria-label="Étapes du formulaire">
        <ol className="fr-steps">
          {order.map((id, i) => {
            const p = pages.find(x => x.id === id);
            return (
              <li key={id} className={`fr-step ${i < idx ? 'fr-done' : ''}`} aria-current={i === idx ? 'step' : undefined}>
                <span className="fr-step-dot" aria-hidden="true">{i < idx ? <Check size={14} /> : i + 1}</span>
                <span className={i === idx ? '' : 'sr-only'}>{p?.title || `Étape ${i + 1}`}{i < idx ? ' (terminée)' : ''}</span>
              </li>
            );
          })}
        </ol>
      </nav>
    );
  }
  const pct = Math.round(((idx + 1) / total) * 100);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 6 }} className="fr-muted">
        <span>Page {idx + 1} sur {total}</span><span aria-hidden="true">{pct} %</span>
      </div>
      <div className="fr-progress" role="progressbar" aria-label="Progression" aria-valuemin={1} aria-valuemax={total} aria-valuenow={idx + 1} aria-valuetext={`Page ${idx + 1} sur ${total}`}>
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Header({ definition }) {
  const logo = useMediaSrc(definition.theme?.logo);
  const cover = useMediaSrc(definition.theme?.cover);
  return (
    <header>
      {cover && <img src={cover} alt="" style={{ display: 'block', maxWidth: 'none', width: 'calc(100% + var(--f-pad) * 2)', maxHeight: 220, objectFit: 'cover', margin: 'calc(var(--f-pad) * -1) calc(var(--f-pad) * -1) var(--f-gap)' }} />}
      {logo && <img src={logo} alt="Logo" style={{ height: 52, width: 'auto', maxWidth: 200, objectFit: 'contain', marginBottom: 12 }} />}
      <h1 className="fr-title">{definition.title || 'Formulaire sans titre'}</h1>
      {definition.description && <div className="fr-help" style={{ fontSize: '0.98rem', marginTop: 8 }}><RichText text={definition.description} /></div>}
    </header>
  );
}

export default function FormRenderer({
  definition,
  answers: answersProp,
  onAnswersChange,
  mode = 'live',
  context,
  pageId: pageIdProp,
  onPageChange,
  onSubmit,
  submitLabel,
  readOnly = false,
  device = 'desktop',
  highlightItemId = null,
  onItemClick = null,
  submitSlot = null,
  header = true,
  fileStore = null,
  topSlot = null,
  bottomSlot = null,
  fullHeight = false,
}) {
  const def = definition && typeof definition === 'object' ? definition : EMPTY;
  const answers = answersProp && typeof answersProp === 'object' ? answersProp : EMPTY;
  const ctx = context || EMPTY;
  const pages = useMemo(() => (Array.isArray(def.pages) ? def.pages.filter(p => p && p.id !== undefined) : []), [def]);
  const settings = def.settings && typeof def.settings === 'object' ? def.settings : EMPTY;
  const systemDark = useSystemDark();
  const theme = useMemo(() => resolveTheme(def.theme, { systemDark }), [def.theme, systemDark]);
  const bgImage = useMediaSrc(theme.background.imageRef);

  // Contexte du moteur (stable tant que ses éléments ne changent pas)
  const { member, params, stats, now } = ctx;
  const engineCtx = useMemo(() => ({ member: member ?? null, params: params ?? null, stats: stats ?? null, now: now instanceof Date ? now : undefined }), [member, params, stats, now]);
  const ev = useMemo(() => evaluateForm(def, answers, engineCtx), [def, answers, engineCtx]);
  const pageOf = useMemo(() => pageIndexOf(def), [def]);

  // ── Page courante (contrôlée ou interne) ──
  const [internalPage, setInternalPage] = useState(null);
  const requested = pageIdProp !== undefined && pageIdProp !== null ? pageIdProp : internalPage;
  const firstPage = ev.pageOrder[0] ?? pages[0]?.id ?? null;
  let current = requested;
  let offPath = false;
  if (current === null || current === undefined || !pages.some(p => p.id === current)) current = firstPage;
  else if (!ev.pageOrder.includes(current)) {
    // Aperçu : on montre la page demandée même si les conditions la masquent
    if (mode === 'preview') offPath = true;
    else current = firstPage;
  }
  const page = pages.find(p => p.id === current) || null;

  // Aperçu : suivre l'élément sélectionné dans l'éditeur (changement de page)
  const [lastHighlight, setLastHighlight] = useState(highlightItemId);
  if (highlightItemId !== lastHighlight) {
    setLastHighlight(highlightItemId);
    const target = highlightItemId ? pageOf.get(String(highlightItemId)) : null;
    if (target && target !== current && pageIdProp === undefined) setInternalPage(target);
  }
  useEffect(() => {
    if (!highlightItemId) return;
    const target = pageOf.get(String(highlightItemId));
    if (target && target !== current && pageIdProp !== undefined && onPageChange) onPageChange(target);
    const el = rootRef.current?.querySelector(`[data-item-id="${CSS.escape(String(highlightItemId))}"]`);
    el?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [highlightItemId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Erreurs ──
  const [shownPages, setShownPages] = useState(() => new Set());
  const [serverErrors, setServerErrors] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [previewNotice, setPreviewNotice] = useState('');
  const submittingRef = useRef(false);
  const rootRef = useRef(null);
  const headingRef = useRef(null);
  const [focusReq, setFocusReq] = useState(0);
  const [pageAnnounce, setPageAnnounce] = useState('');
  const navRef = useRef(false);

  // Erreurs affichées seulement pour les pages déjà « tentées » (Suivant / Envoyer)
  const validation = useMemo(() => (shownPages.size ? validateAnswers(def, answers, engineCtx) : null), [def, answers, engineCtx, shownPages]);

  const errors = useMemo(() => {
    const out = {};
    for (const [k, msg] of Object.entries(serverErrors)) out[k] = msg;
    if (validation) {
      for (const [k, msg] of Object.entries(validation.errors)) {
        if (shownPages.has(pageOf.get(k.split('.')[0]))) out[k] = msg;
      }
    }
    return out;
  }, [validation, serverErrors, shownPages, pageOf]);
  const pageErrors = useMemo(() => Object.entries(errors).filter(([k]) => (pageOf.get(k.split('.')[0]) ?? current) === current), [errors, pageOf, current]);

  // Valeurs par défaut / préremplissage : matérialisées dans les réponses (une seule fois par clé)
  useEffect(() => {
    if (readOnly || !onAnswersChange) return;
    const missing = Object.entries(ev.defaults).filter(([k]) => !hasOwn(answers, k));
    if (missing.length) onAnswersChange({ ...answers, ...Object.fromEntries(missing) });
  }, [ev.defaults, answers, readOnly, onAnswersChange]);

  // Focus après navigation / tentative : première erreur de la page si demandé,
  // sinon titre de la nouvelle page (annonce aux lecteurs d'écran).
  const handledFocus = useRef(0);
  useEffect(() => {
    const root = rootRef.current;
    if (focusReq !== handledFocus.current) {
      handledFocus.current = focusReq;
      navRef.current = false;
      const first = pageErrors[0]?.[0];
      const box = first ? root?.querySelector(`[data-field-key="${CSS.escape(first)}"]`) : null;
      if (box) {
        const target = box.querySelector('input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex="-1"]');
        (target || box).focus?.({ preventScroll: true });
        box.scrollIntoView?.({ block: 'center' });
        return;
      }
    }
    if (navRef.current) {
      navRef.current = false;
      headingRef.current?.focus({ preventScroll: true });
      root?.scrollIntoView?.({ block: 'start' });
    }
  }, [focusReq, current]); // eslint-disable-line react-hooks/exhaustive-deps

  const setValue = useCallback((key, v) => {
    if (readOnly || !onAnswersChange) return;
    onAnswersChange({ ...answers, [key]: v });
    setServerErrors(prev => {
      if (!Object.keys(prev).some(k => k === key || k.startsWith(`${key}.`))) return prev;
      const n = { ...prev };
      Object.keys(n).forEach(k => { if (k === key || k.startsWith(`${key}.`)) delete n[k]; });
      return n;
    });
    setPreviewNotice('');
  }, [answers, onAnswersChange, readOnly]);

  const setInstanceValue = useCallback((groupKey, index, instances, key, v) => {
    const list = instances.map(x => ({ ...x }));
    while (list.length <= index) list.push({});
    list[index] = { ...list[index], [key]: v };
    setValue(groupKey, list);
  }, [setValue]);

  const store = useMemo(() => fileStore || defaultFileStore(mode), [fileStore, mode]);
  const signerName = useMemo(() => {
    for (const v of Object.values(ev.values)) {
      if (v && typeof v === 'object' && (v.firstName || v.lastName)) return [v.firstName, v.lastName].filter(Boolean).join(' ');
    }
    return ctx.member ? [ctx.member.firstName, ctx.member.lastName].filter(Boolean).join(' ') : '';
  }, [ev.values, ctx.member]);

  const rtBase = useMemo(() => ({
    mode,
    stats: engineCtx.stats,
    settings,
    context: ctx,
    storeFile: store.put,
    getFileBlob: store.get,
    removeFile: store.remove,
    fileNote: mode === 'kiosk' ? 'gardé sur cette borne jusqu’à l’envoi' : mode === 'preview' ? 'aperçu — non envoyé' : 'sera envoyé avec ta réponse',
    money: n => formatMoneyFr(n, 'EUR'),
    signerName,
  }), [mode, engineCtx.stats, settings, ctx, store, signerName]);

  const baseScope = useMemo(() => ({ ...ev.values, membre: engineCtx.member, params: engineCtx.params }), [ev.values, engineCtx]);

  const goTo = id => {
    navRef.current = true;
    if (pageIdProp === undefined || pageIdProp === null) setInternalPage(id);
    onPageChange?.(id);
    const idx = ev.pageOrder.indexOf(id);
    const p = pages.find(x => x.id === id);
    setPageAnnounce(`Page ${idx + 1} sur ${ev.pageOrder.length}${p?.title ? ` : ${p.title}` : ''}`);
  };

  const nextId = current ? ev.nextPageId(current) : 'submit';
  const prevId = current ? ev.prevPageId(current) : null;
  const isLast = nextId === 'submit' || offPath && !ev.pageOrder.length;

  const onNext = () => {
    const v = validateAnswers(def, answers, engineCtx, { pageId: current });
    if (!v.ok) {
      setShownPages(s => new Set(s).add(current));
      setFocusReq(n => n + 1);
      return;
    }
    if (nextId && nextId !== 'submit') goTo(nextId);
  };
  const onPrev = () => { if (prevId) goTo(prevId); };

  const handleSubmit = async () => {
    if (submittingRef.current || readOnly) return;
    setSubmitError('');
    const v = validateAnswers(def, answers, engineCtx);
    if (!v.ok) {
      setShownPages(s => {
        const n = new Set(s);
        Object.keys(v.errors).forEach(k => { const p = pageOf.get(k.split('.')[0]); if (p) n.add(p); });
        return n;
      });
      const firstKey = Object.keys(v.errors)[0];
      const target = pageOf.get(firstKey.split('.')[0]);
      if (target && target !== current && ev.pageOrder.includes(target)) goTo(target);
      setFocusReq(n => n + 1);
      return;
    }
    if (!onSubmit) {
      setPreviewNotice('Aperçu : toutes les réponses sont valides, le formulaire serait envoyé.');
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await onSubmit(v.cleaned, { score: v.score, maxScore: v.maxScore, computed: v.computed, answers });
    } catch (err) {
      const fields = err?.fields && typeof err.fields === 'object' ? err.fields : null;
      if (fields && Object.keys(fields).length) {
        setServerErrors(fields);
        const target = pageOf.get(Object.keys(fields)[0].split('.')[0]);
        if (target && target !== current && ev.pageOrder.includes(target)) goTo(target);
        setFocusReq(n => n + 1);
      }
      setSubmitError(err?.message || 'L’envoi a échoué. Réessaie.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const onFormSubmit = e => {
    e.preventDefault();
    if (isLast) handleSubmit();
    else onNext();
  };

  // Entrée dans un champ texte : ne doit pas envoyer le formulaire depuis une page intermédiaire par erreur
  const onKeyDown = e => {
    if (e.key === 'Enter' && e.target?.tagName === 'INPUT' && !['submit', 'button', 'checkbox', 'radio'].includes(e.target.type) && isLast) {
      e.preventDefault();
    }
  };

  const ctxValue = {
    ev, answers, errors, mode, readOnly, engineCtx, baseScope, rtBase,
    setValue, setInstanceValue, highlightItemId, onItemClick,
  };

  const width = DEVICE_WIDTH[device];
  const rootStyle = {
    ...theme.vars,
    background: bgImage ? `center / cover no-repeat url("${bgImage.replace(/"/g, '%22')}")` : theme.background.css,
    ...(width ? { width, maxWidth: '100%', margin: '0 auto' } : {}),
    ...(fullHeight ? { minHeight: '100vh' } : {}),
  };
  const animClass = theme.animations ? 'fr-anim' : 'fr-noanim';
  const label = submitLabel || settings.submitLabel || (def.kind === 'vote' ? 'Voter' : 'Envoyer');

  if (!pages.length) {
    return (
      <div className={`fr-root ${animClass}`} style={rootStyle} ref={rootRef}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: 16 }}>
          <div className="fr-card"><p className="fr-muted">Ce formulaire ne contient encore aucune page.</p></div>
        </div>
      </div>
    );
  }

  return (
    <RendererContext.Provider value={ctxValue}>
      <div className={`fr-root ${animClass}`} style={rootStyle} ref={rootRef} data-theme-mode={theme.mode} data-density={theme.density}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: width && width < 500 ? '12px 10px 32px' : '24px 16px 48px' }}>
          {topSlot}
          <form noValidate onSubmit={onFormSubmit} onKeyDown={onKeyDown} aria-labelledby="fr-form-title" className="fr-stack">
            <div className="fr-card fr-stack" style={{ overflow: 'hidden' }}>
              {header && <div id="fr-form-title"><Header definition={def} /></div>}
              {!header && <h1 id="fr-form-title" className="sr-only">{def.title || 'Formulaire'}</h1>}
              <Progress kind={theme.progressBar} order={ev.pageOrder} current={current} pages={pages} />
            </div>

            <div key={current} className="fr-card fr-page-enter fr-stack">
              {offPath && (
                <p className="fr-alert fr-alert-warn" style={{ display: 'flex', gap: 8 }}>
                  <EyeOff size={16} aria-hidden="true" style={{ flex: 'none', marginTop: 2 }} />
                  Cette page est masquée pour les réponses actuelles (conditions d’affichage ou sauts de page).
                </p>
              )}
              {(page?.title || page?.description) ? (
                <div>
                  {page.title && <h2 ref={headingRef} tabIndex={-1} className="fr-page-title" style={{ outline: 'none' }}>{page.title}</h2>}
                  {page.description && <div className="fr-help"><RichText text={page.description} /></div>}
                </div>
              ) : <h2 ref={headingRef} tabIndex={-1} className="sr-only">Page {Math.max(1, ev.pageOrder.indexOf(current) + 1)}</h2>}

              {pageErrors.length > 0 && (
                <div className="fr-alert fr-alert-error" role="alert">
                  <p style={{ fontWeight: 700, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <AlertCircle size={18} aria-hidden="true" />
                    {pageErrors.length === 1 ? '1 réponse à corriger' : `${pageErrors.length} réponses à corriger`}
                  </p>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 22, listStyle: 'disc' }}>
                    {pageErrors.slice(0, 8).map(([k, msg]) => (
                      <li key={k}>
                        <a
                          href={`#fr-${k.replace(/[^A-Za-z0-9_-]/g, '_')}-ctl`}
                          className="fr-link"
                          onClick={e => {
                            e.preventDefault();
                            const box = rootRef.current?.querySelector(`[data-field-key="${CSS.escape(k)}"]`);
                            box?.querySelector('input:not([disabled]), select, textarea, button')?.focus();
                            box?.scrollIntoView?.({ block: 'center' });
                          }}
                        >{labelForKey(def, k)}</a> : {msg}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {page && <ItemList items={page.items} />}
            </div>

            <div className="fr-stack-sm">
              {isLast && !readOnly && submitSlot}
              {submitError && (
                <div className="fr-alert fr-alert-error" role="alert">{submitError}</div>
              )}
              {previewNotice && <div className="fr-alert fr-alert-success" role="status">{previewNotice}</div>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap-reverse' }}>
                {prevId ? (
                  <button type="button" className="fr-btn fr-btn-secondary" onClick={onPrev} disabled={submitting}>
                    <ArrowLeft size={18} aria-hidden="true" /> Précédent
                  </button>
                ) : <span />}
                {!isLast && (
                  <button type="submit" className="fr-btn fr-btn-primary" style={{ marginLeft: 'auto' }}>
                    Suivant <ArrowRight size={18} aria-hidden="true" />
                  </button>
                )}
                {isLast && !readOnly && (
                  <button type="submit" className="fr-btn fr-btn-primary" style={{ marginLeft: 'auto', minWidth: 160 }} disabled={submitting} aria-busy={submitting || undefined}>
                    {submitting ? <Loader2 size={18} aria-hidden="true" className="animate-spin" /> : <Send size={18} aria-hidden="true" />}
                    {submitting ? 'Envoi en cours…' : label}
                  </button>
                )}
              </div>
            </div>
            <p className="sr-only" aria-live="polite">{pageAnnounce}</p>
          </form>
          {bottomSlot}
        </div>
      </div>
    </RendererContext.Provider>
  );
}

/** Libellé d'une clé d'erreur (question, section répétable, « groupe.i.clé »). */
function labelForKey(def, key) {
  const parts = key.split('.');
  const find = k => flattenItems(def).find(e => e.item.key === k)?.item;
  if (parts.length === 3) {
    const g = find(parts[0]);
    const q = find(parts[2]);
    return `${g?.title || parts[0]} n°${Number(parts[1]) + 1} — ${q?.label || parts[2]}`;
  }
  const it = find(key);
  return it?.label || it?.title || key;
}
