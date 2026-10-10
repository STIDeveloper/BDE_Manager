// ============================================================
// STUDIO DOCUMENTS — APERÇU REACT D'UN DOCUMENT
// ============================================================
// Affiche une feuille A4 « papier » (blanche, encre noire, quel que soit le
// thème), à partir du même arbre de balisage que les exports HTML / Word.
// Retouche en place : les blocs `paragraph` / `title` marqués `editable`
// deviennent modifiables (texte brut) ; onEdit(id, texte) est appelé à la
// sortie du champ. Aucun HTML utilisateur n'est jamais injecté.
// ============================================================

import { createElement, memo, useMemo, useState } from 'react';
import { buildSheet } from './markup.js';
import { sheetCss, PREVIEW_EXTRA_CSS } from './styles.js';

// CSS de la feuille : couleurs d'accent via variables (posées sur la feuille).
const PREVIEW_CSS = sheetCss({
  accent: 'var(--doc-accent, #4f81f5)',
  accentText: 'var(--doc-accent-text, #2f5fcf)',
  accentSoft: 'var(--doc-accent-soft, #eef3fe)',
  onAccent: 'var(--doc-on-accent, #ffffff)',
}) + PREVIEW_EXTRA_CSS;

/** Le navigateur gère-t-il contentEditable="plaintext-only" ? (détection unique) */
let plaintextSupport = null;
function editableMode() {
  if (plaintextSupport === null) {
    try {
      const el = document.createElement('div');
      el.contentEditable = 'plaintext-only';
      plaintextSupport = el.contentEditable === 'plaintext-only';
    } catch (_e) {
      plaintextSupport = false;
    }
  }
  return plaintextSupport ? 'plaintext-only' : 'true';
}

const ATTR_MAP = { class: 'className', colspan: 'colSpan', tabindex: 'tabIndex', for: 'htmlFor' };

function styleObject(style) {
  const out = {};
  String(style).split(';').forEach((decl) => {
    const i = decl.indexOf(':');
    if (i < 0) return;
    const prop = decl.slice(0, i).trim();
    const value = decl.slice(i + 1).trim();
    if (!prop || !value) return;
    const key = prop.startsWith('--') ? prop : prop.replace(/-([a-z])/g, (_m, c) => c.toUpperCase());
    out[key] = value;
  });
  return out;
}

function reactProps(attrs) {
  const props = {};
  Object.entries(attrs || {}).forEach(([k, v]) => {
    if (v === null || v === undefined || v === false) return;
    if (k === 'style') props.style = styleObject(v);
    else props[ATTR_MAP[k] || k] = v;
  });
  return props;
}

/** Champ modifiable en place (texte brut, `**gras**` visible pendant l'édition). */
function EditableText({ tag, id, raw, label, props, onEdit, children }) {
  // Changer la clé force un remontage propre après édition : React ne tente
  // jamais de réconcilier un DOM modifié par l'utilisateur.
  const [version, setVersion] = useState(0);
  const handleFocus = (e) => {
    // Affiche le balisage brut (`**gras**`) pendant l'édition.
    if (raw.includes('**')) e.currentTarget.textContent = raw;
  };
  const handleBlur = (e) => {
    const text = e.currentTarget.innerText.replace(/\u00A0/g, ' ').replace(/\n+$/, '');
    setVersion(v => v + 1);
    if (text !== raw && onEdit) onEdit(id, text);
  };
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.currentTarget.textContent = raw;
      e.currentTarget.blur();
    }
  };
  const handlePaste = (e) => {
    // Repli si "plaintext-only" n'est pas pris en charge : colle du texte brut.
    if (editableMode() === 'plaintext-only') return;
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') || '';
    document.execCommand('insertText', false, text);
  };
  return createElement(tag, {
    ...props,
    key: version,
    className: `${props.className || ''} doc-editable`.trim(),
    contentEditable: editableMode(),
    suppressContentEditableWarning: true,
    spellCheck: true,
    role: 'textbox',
    'aria-multiline': 'true',
    'aria-label': label,
    title: 'Cliquer pour modifier',
    onFocus: handleFocus,
    onBlur: handleBlur,
    onKeyDown: handleKeyDown,
    onPaste: handlePaste,
  }, children);
}

function toReact(node, key, onEdit) {
  if (typeof node === 'string') return node;
  if (!node || !node.tag) return null;
  const children = node.children.length ? node.children.map((c, i) => toReact(c, i, onEdit)) : undefined;
  const props = reactProps(node.attrs);
  if (node.edit) {
    return createElement(EditableText, {
      key, tag: node.tag, id: node.edit.id, raw: node.edit.raw, label: node.edit.label, props, onEdit,
    }, children);
  }
  return createElement(node.tag, { ...props, key }, children);
}

/**
 * Aperçu A4 d'un document.
 * @param {object} props
 * @param {object} props.doc            document (AST, voir model.js)
 * @param {object} props.organization   profil de l'association
 * @param {object|null} props.issue     { ref, fingerprint, issuedAt } une fois émis
 * @param {boolean} [props.editable]    active la retouche en place
 * @param {object} [props.overrides]    { [blockId]: texte }
 * @param {(id: string, text: string) => void} [props.onEdit]
 * @param {string} [props.className]    classes du conteneur
 */
function DocumentViewImpl({ doc, organization, issue = null, editable = false, overrides, onEdit, className = '' }) {
  const tree = useMemo(
    () => buildSheet(doc, { organization: organization || {}, issue, editable, overrides: overrides || null, accentVars: true }),
    [doc, organization, issue, editable, overrides],
  );
  const content = useMemo(() => toReact(tree, 'sheet', editable ? onEdit : undefined), [tree, editable, onEdit]);
  return (
    <div className={`doc-print-area ${className}`.trim()}>
      <style href="bde-document-sheet" precedence="medium">{PREVIEW_CSS}</style>
      {content}
    </div>
  );
}

const DocumentView = memo(DocumentViewImpl);
export default DocumentView;
